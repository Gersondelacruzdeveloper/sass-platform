"""Tests for partner/business-entity settlement finance services."""

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.core.exceptions import ValidationError
from django.test import TestCase

from organisations.models import Organisation
from ticketing.finance.settlements import (
    approve_partner_settlement,
    calculate_partner_settlement_paid_amount,
    cancel_partner_settlement,
    dispute_partner_settlement,
    expected_partner_settlement_parties,
    record_partner_settlement_payment,
    refresh_partner_settlement_payment_state,
    resolve_partner_settlement_status,
    submit_partner_settlement_for_review,
    update_partner_settlement_payment_status,
)
from ticketing.models import (
    PartnerSettlementPayment,
    PartnerSettlementPeriod,
    TicketingBusinessEntity,
)


class PartnerSettlementServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Settlement Organisation",
            slug="partner-settlement-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.business_entity = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation,
            name="Settlement Partner",
            slug="settlement-partner",
            entity_type="partner",
            currency="USD",
        )

    def setUp(self):
        self.post_patcher = patch(
            "ticketing.finance.settlements._post_partner_settlement_ledger_entries"
        )
        self.reverse_patcher = patch(
            "ticketing.finance.settlements._reverse_partner_payment_ledger_entries"
        )
        self.post_ledger = self.post_patcher.start()
        self.reverse_ledger = self.reverse_patcher.start()
        self.addCleanup(self.post_patcher.stop)
        self.addCleanup(self.reverse_patcher.stop)

    def make_settlement(self, **overrides):
        sequence = PartnerSettlementPeriod.objects.count()
        period_start = date(2026, 1, 1) + timedelta(days=sequence * 2)
        values = {
            "organisation": self.organisation,
            "business_entity": self.business_entity,
            "period_start": period_start,
            "period_end": period_start + timedelta(days=1),
            "currency": "USD",
            "status": "approved",
            "net_settlement_amount": Decimal("100.00"),
            "paid_amount": Decimal("0.00"),
        }
        values.update(overrides)
        return PartnerSettlementPeriod.objects.create(**values)

    def make_payment(self, settlement, **overrides):
        values = {
            "settlement": settlement,
            "payer_type": "partner",
            "payee_type": "platform",
            "amount": Decimal("25.00"),
            "currency": settlement.currency,
            "payment_method": "bank_transfer",
            "status": "confirmed",
        }
        values.update(overrides)
        return PartnerSettlementPayment.objects.create(**values)

    def test_paid_amount_counts_only_confirmed_payments(self):
        settlement = self.make_settlement()
        self.make_payment(settlement, amount=Decimal("25.129"))
        self.make_payment(settlement, amount=Decimal("40.00"), status="pending")
        self.make_payment(settlement, amount=Decimal("15.00"), status="cancelled")

        self.assertEqual(
            calculate_partner_settlement_paid_amount(settlement),
            Decimal("25.13"),
        )

    def test_status_resolver_preserves_nonpayment_workflow_states(self):
        for status in ("draft", "review", "disputed", "cancelled"):
            with self.subTest(status=status):
                settlement = self.make_settlement(
                    status=status,
                    paid_amount=Decimal("100.00"),
                )
                self.assertEqual(resolve_partner_settlement_status(settlement), status)

    def test_status_resolver_covers_approved_partial_and_settled(self):
        cases = (
            (Decimal("100.00"), Decimal("0.00"), "approved"),
            (Decimal("100.00"), Decimal("25.00"), "partially_paid"),
            (Decimal("100.00"), Decimal("100.00"), "settled"),
            (Decimal("0.00"), Decimal("0.00"), "settled"),
        )
        for net, paid, expected in cases:
            with self.subTest(expected=expected):
                settlement = self.make_settlement(
                    net_settlement_amount=net,
                    paid_amount=paid,
                )
                self.assertEqual(
                    resolve_partner_settlement_status(settlement), expected
                )

    def test_refresh_recomputes_paid_amount_and_marks_settled(self):
        settlement = self.make_settlement(net_settlement_amount=Decimal("25.00"))
        self.make_payment(settlement, amount=Decimal("25.00"))

        settlement = refresh_partner_settlement_payment_state(settlement)

        self.assertEqual(settlement.paid_amount, Decimal("25.00"))
        self.assertEqual(settlement.status, "settled")
        self.assertIsNotNone(settlement.settled_at)

    def test_refresh_clears_stale_settled_timestamp_when_not_fully_paid(self):
        settlement = self.make_settlement(
            status="settled",
            paid_amount=Decimal("100.00"),
        )
        settlement.settled_at = settlement.generated_at
        settlement.save(update_fields=["settled_at"])

        settlement = refresh_partner_settlement_payment_state(settlement)

        self.assertEqual(settlement.status, "approved")
        self.assertEqual(settlement.paid_amount, Decimal("0.00"))
        self.assertIsNone(settlement.settled_at)

    def test_submit_moves_draft_to_review_and_appends_notes(self):
        settlement = self.make_settlement(status="draft", notes="Generated.")

        settlement = submit_partner_settlement_for_review(
            settlement, notes="Ready for finance."
        )

        self.assertEqual(settlement.status, "review")
        self.assertIn("Generated.", settlement.notes)
        self.assertIn("Ready for finance.", settlement.notes)

    def test_submit_rejects_non_draft_settlement(self):
        settlement = self.make_settlement(status="review")

        with self.assertRaisesMessage(
            ValueError, "Only draft settlements can be submitted for review."
        ):
            submit_partner_settlement_for_review(settlement)

    def test_approve_accepts_draft_review_and_disputed_states(self):
        for status in ("draft", "review", "disputed"):
            with self.subTest(status=status):
                settlement = self.make_settlement(status=status)
                settlement = approve_partner_settlement(
                    settlement, notes="Approved after verification."
                )
                self.assertEqual(settlement.status, "approved")
                self.assertIsNotNone(settlement.approved_at)
                self.assertIn("Approved after verification.", settlement.notes)

    def test_approve_rejects_paid_or_cancelled_states(self):
        for status in ("partially_paid", "settled", "cancelled"):
            with self.subTest(status=status):
                settlement = self.make_settlement(status=status)
                with self.assertRaises(ValueError):
                    approve_partner_settlement(settlement)

    def test_dispute_records_actor_and_reason(self):
        settlement = self.make_settlement(status="review", notes="Original note.")
        actor = SimpleNamespace(email="finance@example.com", username="finance")

        settlement = dispute_partner_settlement(
            settlement,
            notes="Quantity mismatch.",
            disputed_by=actor,
        )

        self.assertEqual(settlement.status, "disputed")
        self.assertIn("Original note.", settlement.notes)
        self.assertIn("finance@example.com", settlement.notes)
        self.assertIn("Quantity mismatch.", settlement.notes)

    def test_dispute_rejects_settled_and_cancelled_states(self):
        for status in ("settled", "cancelled"):
            with self.subTest(status=status):
                settlement = self.make_settlement(status=status)
                with self.assertRaises(ValueError):
                    dispute_partner_settlement(settlement, "Incorrect total.")

    def test_cancel_records_actor_and_reason(self):
        settlement = self.make_settlement(status="approved")
        actor = SimpleNamespace(email="", username="finance-manager")

        settlement = cancel_partner_settlement(
            settlement,
            notes="Period regenerated.",
            cancelled_by=actor,
        )

        self.assertEqual(settlement.status, "cancelled")
        self.assertIn("finance-manager", settlement.notes)
        self.assertIn("Period regenerated.", settlement.notes)

    def test_cancel_rejects_settled_or_confirmed_payment_settlements(self):
        settled = self.make_settlement(status="settled")
        with self.assertRaises(ValueError):
            cancel_partner_settlement(settled)

        paid = self.make_settlement(status="approved")
        self.make_payment(paid)
        with self.assertRaises(ValueError):
            cancel_partner_settlement(paid)

    def test_expected_parties_follow_signed_net_amount(self):
        cases = (
            (Decimal("25.00"), ("partner", "platform")),
            (Decimal("-25.00"), ("platform", "partner")),
            (Decimal("0.00"), (None, None)),
        )
        for net, expected in cases:
            with self.subTest(net=net):
                self.assertEqual(
                    expected_partner_settlement_parties(
                        self.make_settlement(net_settlement_amount=net)
                    ),
                    expected,
                )

    def test_record_payment_requires_approved_payment_state(self):
        for status in ("draft", "review", "disputed", "cancelled"):
            with self.subTest(status=status):
                settlement = self.make_settlement(status=status)
                with self.assertRaises(ValueError):
                    record_partner_settlement_payment(settlement, "10.00")

    def test_record_payment_rejects_zero_negative_and_invalid_amounts(self):
        settlement = self.make_settlement()

        for amount in (Decimal("0.00"), Decimal("-0.01"), "invalid"):
            with self.subTest(amount=amount):
                with self.assertRaisesMessage(
                    ValueError,
                    "Settlement payment amount must be greater than zero.",
                ):
                    record_partner_settlement_payment(settlement, amount)

        self.assertFalse(settlement.payments.exists())

    def test_record_payment_rejects_zero_net_settlement(self):
        settlement = self.make_settlement(net_settlement_amount=Decimal("0.00"))

        with self.assertRaisesMessage(
            ValueError, "This settlement has no outstanding net amount."
        ):
            record_partner_settlement_payment(settlement, "10.00")

    def test_record_payment_rejects_wrong_or_identical_parties(self):
        settlement = self.make_settlement()

        with self.assertRaisesMessage(
            ValueError, "Payer and payee must be different parties."
        ):
            record_partner_settlement_payment(
                settlement, "10.00", payer_type="partner", payee_type="partner"
            )

        with self.assertRaisesMessage(
            ValueError,
            "Expected settlement direction is partner to platform.",
        ):
            record_partner_settlement_payment(
                settlement, "10.00", payer_type="platform", payee_type="partner"
            )

    def test_record_payment_rejects_amount_above_outstanding(self):
        settlement = self.make_settlement(
            net_settlement_amount=Decimal("100.00"),
            paid_amount=Decimal("75.00"),
        )

        with self.assertRaisesMessage(
            ValueError, "Payment amount cannot exceed the outstanding amount (25.00)."
        ):
            record_partner_settlement_payment(settlement, "25.01")

    def test_record_positive_payment_persists_direction_and_refreshes_state(self):
        settlement = self.make_settlement(net_settlement_amount=Decimal("100.00"))

        payment, settlement = record_partner_settlement_payment(
            settlement,
            "25.129",
            reference="partner-transfer-1",
            notes="First instalment.",
        )

        payment.refresh_from_db()
        self.assertEqual(payment.amount, Decimal("25.13"))
        self.assertEqual(payment.payer_type, "partner")
        self.assertEqual(payment.payee_type, "platform")
        self.assertEqual(payment.currency, "USD")
        self.assertEqual(payment.status, "confirmed")
        self.assertEqual(settlement.paid_amount, Decimal("25.13"))
        self.assertEqual(settlement.status, "partially_paid")
        self.post_ledger.assert_called_once()

    def test_record_negative_payment_reverses_direction(self):
        settlement = self.make_settlement(net_settlement_amount=Decimal("-40.00"))

        payment, _ = record_partner_settlement_payment(settlement, "10.00")

        self.assertEqual(payment.payer_type, "platform")
        self.assertEqual(payment.payee_type, "partner")

    def test_pending_payment_does_not_post_ledger_or_increase_paid_amount(self):
        settlement = self.make_settlement()

        payment, settlement = record_partner_settlement_payment(
            settlement, "25.00", status="pending"
        )

        self.assertEqual(payment.status, "pending")
        self.assertIsNone(payment.ledger_entry_group)
        self.assertEqual(settlement.paid_amount, Decimal("0.00"))
        self.assertEqual(settlement.status, "approved")
        self.post_ledger.assert_not_called()

    def test_record_payment_rolls_back_when_ledger_posting_fails(self):
        settlement = self.make_settlement()
        self.post_ledger.side_effect = RuntimeError("ledger posting failed")

        with self.assertRaisesMessage(RuntimeError, "ledger posting failed"):
            record_partner_settlement_payment(settlement, "25.00")

        self.assertFalse(settlement.payments.exists())

    def test_confirming_pending_payment_posts_ledger_and_updates_total(self):
        settlement = self.make_settlement()
        payment = self.make_payment(settlement, status="pending")

        payment, settlement = update_partner_settlement_payment_status(
            payment, "confirmed", notes="Bank confirmation received."
        )

        self.assertEqual(payment.status, "confirmed")
        self.assertIsNotNone(payment.ledger_entry_group)
        self.assertIn("Bank confirmation received.", payment.notes)
        self.assertEqual(settlement.paid_amount, Decimal("25.00"))
        self.post_ledger.assert_called_once()

    def test_cancelling_confirmed_payment_reverses_ledger_and_updates_total(self):
        settlement = self.make_settlement(
            status="partially_paid", paid_amount=Decimal("25.00")
        )
        payment = self.make_payment(settlement)

        payment, settlement = update_partner_settlement_payment_status(
            payment, "cancelled"
        )

        self.assertEqual(payment.status, "cancelled")
        self.assertEqual(settlement.paid_amount, Decimal("0.00"))
        self.assertEqual(settlement.status, "approved")
        self.reverse_ledger.assert_called_once_with(payment=payment, created_by=None)

    def test_same_payment_status_is_idempotent(self):
        settlement = self.make_settlement()
        payment = self.make_payment(settlement, status="pending")

        returned_payment, returned_settlement = update_partner_settlement_payment_status(
            payment, "pending"
        )

        self.assertEqual(returned_payment.pk, payment.pk)
        self.assertEqual(returned_settlement.paid_amount, Decimal("0.00"))
        self.post_ledger.assert_not_called()
        self.reverse_ledger.assert_not_called()

    def test_record_and_update_reject_invalid_choice_values(self):
        settlement = self.make_settlement()

        with self.assertRaises(ValidationError):
            record_partner_settlement_payment(
                settlement,
                "10.00",
                payment_method="invented-method",
                status="invented-status",
            )

        payment = self.make_payment(settlement, status="pending")
        with self.assertRaises(ValidationError):
            update_partner_settlement_payment_status(payment, "invented-status")

