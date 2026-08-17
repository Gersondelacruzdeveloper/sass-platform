"""Tests for seller-to-company settlement finance services."""

from decimal import Decimal
from unittest.mock import Mock, patch

from django.core.exceptions import ValidationError
from django.test import TestCase

from organisations.models import Organisation
from ticketing.finance.settlements import (
    apply_settlement_status,
    calculate_owner_remaining_amount,
    calculate_seller_due_to_company,
    record_seller_settlement,
    resolve_settlement_status,
    settle_booking_fully,
    settle_booking_partially,
)
from ticketing.models import Booking, BookingPayment, Seller


class FinanceSettlementServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Settlement Organisation",
            slug="finance-settlement-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.seller = Seller.objects.create(
            organisation=cls.organisation,
            full_name="Settlement Seller",
            seller_slug="finance-settlement-seller",
            application_status="approved",
            is_active=True,
        )

    def setUp(self):
        self.recalculate_patcher = patch(
            "ticketing.finance.calculator.recalculate_booking",
            side_effect=lambda booking: booking,
        )
        self.recompute_patcher = patch(
            "ticketing.finance.commissions.recompute_seller_totals"
        )
        self.ledger_patcher = patch(
            "ticketing.finance.settlements._post_seller_settlement_ledger_entries"
        )
        self.recalculate = self.recalculate_patcher.start()
        self.recompute = self.recompute_patcher.start()
        self.post_ledger = self.ledger_patcher.start()
        self.addCleanup(self.recalculate_patcher.stop)
        self.addCleanup(self.recompute_patcher.stop)
        self.addCleanup(self.ledger_patcher.stop)

    def make_booking(self, seller=None, **overrides):
        values = {
            "organisation": self.organisation,
            "seller": self.seller if seller is None else seller,
            "customer_name": "Settlement Customer",
            "status": "confirmed",
            "total_amount": Decimal("100.00"),
            "seller_collected_amount": Decimal("100.00"),
            "seller_commission_amount": Decimal("15.00"),
            "seller_due_to_company": Decimal("85.00"),
            "owner_net_amount": Decimal("85.00"),
            "owner_received_amount": Decimal("0.00"),
            "settlement_status": "pending",
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def test_seller_due_is_collected_amount_minus_commission(self):
        booking = self.make_booking(
            seller_collected_amount=Decimal("100.00"),
            seller_commission_amount=Decimal("15.00"),
        )

        self.assertEqual(calculate_seller_due_to_company(booking), Decimal("85.00"))

    def test_seller_due_never_becomes_negative(self):
        booking = self.make_booking(
            seller_collected_amount=Decimal("10.00"),
            seller_commission_amount=Decimal("15.00"),
        )

        self.assertEqual(calculate_seller_due_to_company(booking), Decimal("0.00"))

    def test_owner_remaining_uses_owner_net_and_received_amounts(self):
        booking = self.make_booking(
            owner_net_amount=Decimal("85.00"),
            owner_received_amount=Decimal("25.00"),
        )

        self.assertEqual(calculate_owner_remaining_amount(booking), Decimal("60.00"))

    def test_owner_remaining_never_becomes_negative(self):
        booking = self.make_booking(
            owner_net_amount=Decimal("50.00"),
            owner_received_amount=Decimal("75.00"),
        )

        self.assertEqual(calculate_owner_remaining_amount(booking), Decimal("0.00"))

    def test_resolve_status_covers_pending_partial_and_settled(self):
        cases = (
            ({"owner_net_amount": Decimal("0.00")}, "settled"),
            (
                {
                    "owner_net_amount": Decimal("85.00"),
                    "owner_received_amount": Decimal("0.00"),
                    "seller_due_to_company": Decimal("85.00"),
                },
                "pending",
            ),
            (
                {
                    "owner_net_amount": Decimal("85.00"),
                    "owner_received_amount": Decimal("20.00"),
                    "seller_due_to_company": Decimal("65.00"),
                },
                "partially_settled",
            ),
            (
                {
                    "owner_net_amount": Decimal("85.00"),
                    "owner_received_amount": Decimal("85.00"),
                    "seller_due_to_company": Decimal("0.00"),
                },
                "settled",
            ),
        )

        for values, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(resolve_settlement_status(self.make_booking(**values)), expected)

    def test_apply_status_recalculates_due_and_saves_only_supported_fields(self):
        booking = self.make_booking(
            seller_collected_amount=Decimal("80.00"),
            seller_commission_amount=Decimal("10.00"),
            seller_due_to_company=Decimal("0.00"),
        )
        booking.save = Mock()

        result = apply_settlement_status(booking)

        self.assertIs(result, booking)
        self.assertEqual(booking.seller_due_to_company, Decimal("70.00"))
        self.assertEqual(booking.settlement_status, "pending")
        self.assertEqual(
            booking.save.call_args.kwargs["update_fields"],
            ["updated_at", "seller_due_to_company", "settlement_status"],
        )

    def test_record_settlement_rejects_zero_negative_and_invalid_amounts(self):
        booking = self.make_booking()

        for amount in (Decimal("0.00"), Decimal("-0.01"), "invalid"):
            with self.subTest(amount=amount):
                with self.assertRaisesMessage(
                    ValueError, "Settlement amount must be greater than zero."
                ):
                    record_seller_settlement(booking, amount)

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_record_settlement_rejects_amount_above_current_due(self):
        booking = self.make_booking(
            seller_collected_amount=Decimal("50.00"),
            seller_commission_amount=Decimal("10.00"),
        )

        with self.assertRaisesMessage(
            ValueError,
            "Settlement amount cannot exceed the seller amount due (40.00).",
        ):
            record_seller_settlement(booking, Decimal("40.01"))

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_record_settlement_returns_without_payment_when_nothing_is_due(self):
        booking = self.make_booking(
            seller_collected_amount=Decimal("10.00"),
            seller_commission_amount=Decimal("15.00"),
        )

        payment, returned_booking = record_seller_settlement(booking, "1.00")

        self.assertIsNone(payment)
        self.assertEqual(returned_booking.pk, booking.pk)
        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())
        self.recalculate.assert_not_called()

    def test_record_settlement_creates_confirmed_financial_payment(self):
        booking = self.make_booking()

        payment, returned_booking = record_seller_settlement(
            booking=booking,
            amount="25.129",
            method="bank_transfer",
            reference="settlement-safe-reference",
            note="Settlement service test.",
        )

        payment.refresh_from_db()
        self.assertEqual(returned_booking.pk, booking.pk)
        self.assertEqual(payment.amount, Decimal("25.13"))
        self.assertEqual(payment.payment_type, "settlement")
        self.assertEqual(payment.payer_type, "seller")
        self.assertEqual(payment.status, "confirmed")
        self.assertEqual(payment.seller, self.seller)
        self.assertEqual(payment.reference, "settlement-safe-reference")
        self.assertIsNotNone(payment.paid_at)

    def test_bank_settlement_flags_owner_receipt_and_settled_payment(self):
        booking = self.make_booking()

        payment, _ = record_seller_settlement(booking, "25.00", method="bank_transfer")

        payment.refresh_from_db()
        self.assertEqual(payment.collected_by_party, "bank")
        self.assertTrue(payment.affects_owner_received)
        self.assertFalse(payment.affects_seller_collected)
        self.assertEqual(payment.settlement_status, "settled")

    def test_nonbank_settlement_flags_owner_as_receiver(self):
        booking = self.make_booking()

        payment, _ = record_seller_settlement(booking, "25.00", method="cash")

        payment.refresh_from_db()
        self.assertEqual(payment.collected_by_party, "owner")
        self.assertTrue(payment.affects_owner_received)

    def test_record_settlement_calls_finance_and_ledger_boundaries(self):
        booking = self.make_booking()

        payment, returned_booking = record_seller_settlement(booking, "25.00")

        self.recalculate.assert_called_once()
        self.assertEqual(self.recalculate.call_args.args[0].pk, booking.pk)
        self.recompute.assert_called_once_with(self.seller)
        self.post_ledger.assert_called_once_with(
            booking=returned_booking,
            payment=payment,
            amount=Decimal("25.00"),
            created_by=None,
        )

    def test_record_settlement_rolls_back_payment_when_recalculation_fails(self):
        booking = self.make_booking()
        self.recalculate.side_effect = RuntimeError("settlement recalculation failed")

        with self.assertRaisesMessage(RuntimeError, "settlement recalculation failed"):
            record_seller_settlement(booking, "25.00")

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())
        self.post_ledger.assert_not_called()

    def test_record_settlement_requires_booking_seller(self):
        booking = self.make_booking(seller=None)
        Booking.objects.filter(pk=booking.pk).update(seller=None)
        booking.refresh_from_db()

        with self.assertRaises(ValidationError):
            record_seller_settlement(booking, "25.00")

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_record_settlement_rejects_invalid_payment_method(self):
        booking = self.make_booking()

        with self.assertRaises(ValidationError):
            record_seller_settlement(booking, "25.00", method="invented-method")

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    @patch("ticketing.finance.settlements.record_seller_settlement")
    def test_full_settlement_records_exact_current_due(self, record):
        booking = self.make_booking(
            seller_collected_amount=Decimal("100.00"),
            seller_commission_amount=Decimal("15.00"),
        )
        record.return_value = (object(), booking)

        result = settle_booking_fully(
            booking,
            method="cash",
            reference="full-settlement",
        )

        self.assertEqual(result, record.return_value)
        record.assert_called_once_with(
            booking=booking,
            amount=Decimal("85.00"),
            collected_by=None,
            method="cash",
            reference="full-settlement",
            note="Seller settled full amount owed to company.",
        )

    @patch("ticketing.finance.settlements.apply_settlement_status")
    def test_full_settlement_is_noop_when_nothing_is_due(self, apply_status):
        booking = self.make_booking(
            seller_collected_amount=Decimal("10.00"),
            seller_commission_amount=Decimal("15.00"),
        )

        result = settle_booking_fully(booking)

        self.assertEqual(result, (None, booking))
        apply_status.assert_called_once_with(booking)

    @patch("ticketing.finance.settlements.record_seller_settlement")
    def test_partial_settlement_normalizes_and_forwards_positive_amount(self, record):
        booking = self.make_booking()
        record.return_value = (object(), booking)

        result = settle_booking_partially(booking, "20.129")

        self.assertEqual(result, record.return_value)
        record.assert_called_once_with(
            booking=booking,
            amount=Decimal("20.13"),
            collected_by=None,
            method="bank_transfer",
            reference="",
            note="Seller partially settled amount owed to company.",
        )

    @patch("ticketing.finance.settlements.record_seller_settlement")
    def test_partial_settlement_is_noop_for_nonpositive_amount(self, record):
        booking = self.make_booking()

        for amount in (Decimal("0.00"), Decimal("-0.01"), "invalid"):
            with self.subTest(amount=amount):
                self.assertEqual(settle_booking_partially(booking, amount), (None, booking))

        record.assert_not_called()

    def test_repeated_settlements_create_separate_auditable_payments(self):
        booking = self.make_booking()

        first, _ = record_seller_settlement(booking, "10.00", reference="batch-1")
        second, _ = record_seller_settlement(booking, "10.00", reference="batch-2")

        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(BookingPayment.objects.filter(booking=booking).count(), 2)

    def test_settlement_payment_is_tenant_scoped_through_booking_and_seller(self):
        booking = self.make_booking()

        payment, _ = record_seller_settlement(booking, "25.00")

        self.assertEqual(payment.booking.organisation_id, self.organisation.id)
        self.assertEqual(payment.seller.organisation_id, self.organisation.id)
