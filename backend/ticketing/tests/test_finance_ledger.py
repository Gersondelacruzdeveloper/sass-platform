"""Integrity tests for the ticketing financial ledger."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.finance.settlements import (
    _post_partner_settlement_ledger_entries,
    _reverse_partner_payment_ledger_entries,
)
from ticketing.models import (
    PartnerSettlementPayment,
    PartnerSettlementPeriod,
    TicketingBusinessEntity,
    TicketingLedgerEntry,
)


class FinanceLedgerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Ledger Organisation A",
            slug="ledger-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Ledger Organisation B",
            slug="ledger-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Ledger Partner A",
            slug="ledger-partner-a",
            entity_type="partner",
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Ledger Partner B",
            slug="ledger-partner-b",
            entity_type="partner",
        )

    def make_entry(self, **overrides):
        values = {
            "organisation": self.organisation_a,
            "business_entity": self.entity_a,
            "entry_type": "payment",
            "direction": "credit",
            "party_type": "platform",
            "amount": Decimal("25.00"),
            "currency": "USD",
            "reference": "ledger-reference",
        }
        values.update(overrides)
        return TicketingLedgerEntry.objects.create(**values)

    def make_settlement(self, **overrides):
        values = {
            "organisation": self.organisation_a,
            "business_entity": self.entity_a,
            "period_start": date(2026, 1, 1),
            "period_end": date(2026, 1, 10),
            "currency": "USD",
            "status": "approved",
            "net_settlement_amount": Decimal("100.00"),
        }
        values.update(overrides)
        return PartnerSettlementPeriod.objects.create(**values)

    def make_settlement_payment(self, settlement, **overrides):
        values = {
            "settlement": settlement,
            "payer_type": "partner",
            "payee_type": "platform",
            "amount": Decimal("25.00"),
            "currency": settlement.currency,
            "payment_method": "bank_transfer",
            "status": "confirmed",
            "reference": "settlement-transfer",
            "ledger_entry_group": uuid4(),
        }
        values.update(overrides)
        return PartnerSettlementPayment.objects.create(**values)

    def test_entry_defaults_and_string_representation(self):
        entry = TicketingLedgerEntry.objects.create(
            organisation=self.organisation_a,
            entry_type="sale",
            direction="credit",
            party_type="platform",
            amount=Decimal("10.00"),
        )

        self.assertEqual(entry.currency, "USD")
        self.assertFalse(entry.is_reversed)
        self.assertIsNotNone(entry.entry_group)
        self.assertEqual(str(entry), "sale credit 10.00 USD")

    def test_signed_amount_uses_credit_positive_and_debit_negative(self):
        credit = self.make_entry(direction="credit", amount=Decimal("25.00"))
        debit = self.make_entry(direction="debit", amount=Decimal("25.00"))

        self.assertEqual(credit.signed_amount, Decimal("25.00"))
        self.assertEqual(debit.signed_amount, Decimal("-25.00"))

    def test_metadata_defaults_are_independent(self):
        first = self.make_entry(reference="first")
        second = self.make_entry(reference="second")

        first.metadata["source"] = "test"

        self.assertEqual(second.metadata, {})

    def test_entry_groups_are_unguessable_and_independent(self):
        first = self.make_entry(reference="first")
        second = self.make_entry(reference="second")

        self.assertNotEqual(first.entry_group, second.entry_group)

    def test_full_clean_rejects_invalid_choice_values(self):
        entry = TicketingLedgerEntry(
            organisation=self.organisation_a,
            entry_type="invented-entry",
            direction="invented-direction",
            party_type="invented-party",
            amount=Decimal("10.00"),
        )

        with self.assertRaises(ValidationError) as context:
            entry.full_clean()

        self.assertIn("entry_type", context.exception.message_dict)
        self.assertIn("direction", context.exception.message_dict)
        self.assertIn("party_type", context.exception.message_dict)

    def test_full_clean_rejects_negative_amount(self):
        entry = TicketingLedgerEntry(
            organisation=self.organisation_a,
            entry_type="payment",
            direction="credit",
            party_type="platform",
            amount=Decimal("-0.01"),
        )

        with self.assertRaises(ValidationError):
            entry.full_clean()

    def test_database_rejects_negative_amount(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_entry(amount=Decimal("-0.01"))

    def test_zero_amount_is_allowed_for_auditable_neutral_entries(self):
        entry = self.make_entry(amount=Decimal("0.00"))

        entry.full_clean()
        self.assertEqual(entry.amount, Decimal("0.00"))

    def test_full_clean_rejects_cross_tenant_business_entity(self):
        entry = TicketingLedgerEntry(
            organisation=self.organisation_a,
            business_entity=self.entity_b,
            entry_type="payment",
            direction="credit",
            party_type="partner",
            amount=Decimal("10.00"),
        )

        with self.assertRaises(ValidationError):
            entry.full_clean()

    def test_deleting_business_entity_preserves_entry_and_clears_relation(self):
        entity = TicketingBusinessEntity.objects.create(
            organisation=self.organisation_a,
            name="Temporary Ledger Partner",
            slug="temporary-ledger-partner",
        )
        entry = self.make_entry(business_entity=entity)

        entity.delete()
        entry.refresh_from_db()

        self.assertIsNone(entry.business_entity)

    def test_deleting_organisation_cascades_ledger_entries(self):
        organisation = Organisation.objects.create(
            name="Temporary Ledger Organisation",
            slug="temporary-ledger-org",
            business_type="ticketing",
            is_active=True,
        )
        entry = self.make_entry(organisation=organisation, business_entity=None)

        organisation.delete()

        self.assertFalse(TicketingLedgerEntry.objects.filter(pk=entry.pk).exists())

    def test_partner_posting_creates_balanced_debit_and_credit(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)

        _post_partner_settlement_ledger_entries(
            settlement=settlement,
            payment=payment,
            entry_group=payment.ledger_entry_group,
        )

        entries = list(
            TicketingLedgerEntry.objects.filter(
                entry_group=payment.ledger_entry_group
            ).order_by("direction")
        )
        self.assertEqual(len(entries), 2)
        self.assertEqual({entry.direction for entry in entries}, {"debit", "credit"})
        self.assertEqual(sum(entry.signed_amount for entry in entries), Decimal("0.00"))
        self.assertEqual({entry.amount for entry in entries}, {Decimal("25.00")})

    def test_partner_posting_assigns_payer_and_payee_parties(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)

        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        debit = TicketingLedgerEntry.objects.get(
            entry_group=payment.ledger_entry_group, direction="debit"
        )
        credit = TicketingLedgerEntry.objects.get(
            entry_group=payment.ledger_entry_group, direction="credit"
        )
        self.assertEqual(debit.party_type, "partner")
        self.assertEqual(credit.party_type, "platform")

    def test_platform_to_partner_posting_uses_reverse_parties(self):
        settlement = self.make_settlement(net_settlement_amount=Decimal("-100.00"))
        payment = self.make_settlement_payment(
            settlement,
            payer_type="platform",
            payee_type="partner",
        )

        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        debit = TicketingLedgerEntry.objects.get(
            entry_group=payment.ledger_entry_group, direction="debit"
        )
        credit = TicketingLedgerEntry.objects.get(
            entry_group=payment.ledger_entry_group, direction="credit"
        )
        self.assertEqual(debit.party_type, "platform")
        self.assertEqual(credit.party_type, "partner")

    def test_partner_posting_copies_scope_reference_and_metadata(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(
            settlement,
            reference="bank-confirmation-123",
            payment_method="cash",
        )

        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        for entry in TicketingLedgerEntry.objects.filter(
            entry_group=payment.ledger_entry_group
        ):
            self.assertEqual(entry.organisation, self.organisation_a)
            self.assertEqual(entry.business_entity, self.entity_a)
            self.assertEqual(entry.entry_type, "settlement")
            self.assertEqual(entry.reference, "bank-confirmation-123")
            self.assertEqual(entry.currency, "USD")
            self.assertEqual(entry.metadata["settlement_payment_id"], payment.id)
            self.assertEqual(entry.metadata["payment_method"], "cash")

    def test_partner_posting_uses_settlement_number_as_reference_fallback(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement, reference="")

        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        references = set(
            TicketingLedgerEntry.objects.filter(
                entry_group=payment.ledger_entry_group
            ).values_list("reference", flat=True)
        )
        self.assertEqual(references, {settlement.settlement_number})

    def test_reversal_without_entry_group_is_noop(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement, ledger_entry_group=None)

        self.assertEqual(_reverse_partner_payment_ledger_entries(payment), [])
        self.assertFalse(TicketingLedgerEntry.objects.exists())

    def test_reversal_without_original_entries_is_noop(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)

        self.assertEqual(_reverse_partner_payment_ledger_entries(payment), [])

    def test_reversal_creates_opposite_entries_and_marks_originals(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)
        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        reversals = _reverse_partner_payment_ledger_entries(payment)

        originals = list(
            TicketingLedgerEntry.objects.filter(
                entry_group=payment.ledger_entry_group
            ).order_by("id")
        )
        self.assertEqual(len(reversals), 2)
        self.assertTrue(all(entry.is_reversed for entry in originals))
        for reversal in reversals:
            original = reversal.reverses_entry
            self.assertEqual(reversal.entry_type, "reversal")
            self.assertEqual(reversal.amount, original.amount)
            self.assertEqual(reversal.party_type, original.party_type)
            self.assertNotEqual(reversal.direction, original.direction)

    def test_reversal_entries_share_a_new_group_and_balance(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)
        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        reversals = _reverse_partner_payment_ledger_entries(payment)

        self.assertEqual(len({entry.entry_group for entry in reversals}), 1)
        self.assertNotEqual(reversals[0].entry_group, payment.ledger_entry_group)
        self.assertEqual(
            sum(entry.signed_amount for entry in reversals), Decimal("0.00")
        )

    def test_reversal_preserves_audit_metadata_and_links_original(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)
        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        reversal = _reverse_partner_payment_ledger_entries(payment)[0]

        self.assertEqual(
            reversal.metadata["reversal_of_entry_id"], reversal.reverses_entry_id
        )
        self.assertEqual(reversal.metadata["settlement_payment_id"], payment.id)
        self.assertIn("Reversal of:", reversal.description)

    def test_reversing_same_payment_twice_is_idempotent(self):
        settlement = self.make_settlement()
        payment = self.make_settlement_payment(settlement)
        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        first = _reverse_partner_payment_ledger_entries(payment)
        second = _reverse_partner_payment_ledger_entries(payment)

        self.assertEqual(len(first), 2)
        self.assertEqual(second, [])
        self.assertEqual(TicketingLedgerEntry.objects.count(), 4)

    def test_effective_timestamp_is_copied_from_payment(self):
        settlement = self.make_settlement()
        paid_at = timezone.now()
        payment = self.make_settlement_payment(settlement, paid_at=paid_at)

        _post_partner_settlement_ledger_entries(
            settlement, payment, payment.ledger_entry_group
        )

        self.assertFalse(
            TicketingLedgerEntry.objects.filter(
                entry_group=payment.ledger_entry_group
            ).exclude(effective_at=paid_at).exists()
        )

