"""Service tests for ticketing.finance.payments."""

from decimal import Decimal
from unittest.mock import Mock, patch

from django.core.exceptions import ValidationError
from django.db import IntegrityError
from django.test import TestCase

from organisations.models import Organisation
from ticketing.finance.payments import (
    _queue_payment_confirmed_notification_if_transitioned,
    apply_payment_finance_flags,
    mark_provider_payment_confirmed,
    receiver_affects_owner,
    receiver_affects_seller,
    receiver_for_method,
    record_customer_balance_payment,
    record_customer_deposit,
    record_customer_full_payment,
    record_customer_payment,
    record_payment,
    record_refund,
    record_seller_settlement_payment,
)
from ticketing.models import Booking, BookingPayment, Seller


class FinancePaymentServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Finance Payment Organisation A",
            slug="finance-payment-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Finance Payment Organisation B",
            slug="finance-payment-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Finance Seller A",
            seller_slug="finance-payment-seller-a",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Finance Seller B",
            seller_slug="finance-payment-seller-b",
            application_status="approved",
            is_active=True,
        )

    def setUp(self):
        self.recalculate_patcher = patch(
            "ticketing.finance.calculator.recalculate_booking",
            side_effect=lambda booking: booking,
        )
        self.sync_patcher = patch(
            "ticketing.finance.commissions.sync_commission_for_booking"
        )
        self.recompute_patcher = patch(
            "ticketing.finance.commissions.recompute_seller_totals"
        )
        self.queue_patcher = patch(
            "ticketing.finance.payments._queue_payment_confirmed_notification_if_transitioned"
        )
        self.recalculate = self.recalculate_patcher.start()
        self.sync_commission = self.sync_patcher.start()
        self.recompute_totals = self.recompute_patcher.start()
        self.queue_notification = self.queue_patcher.start()
        self.addCleanup(self.recalculate_patcher.stop)
        self.addCleanup(self.sync_patcher.stop)
        self.addCleanup(self.recompute_patcher.stop)
        self.addCleanup(self.queue_patcher.stop)

    def make_booking(self, organisation=None, seller=None, **overrides):
        values = {
            "organisation": organisation or self.organisation_a,
            "seller": seller,
            "customer_name": "Finance Payment Customer",
            "total_amount": Decimal("100.00"),
            "balance_due": Decimal("100.00"),
            "payment_status": "unpaid",
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def test_receiver_for_method_resolves_owner_seller_and_providers(self):
        cases = (
            ({"method": "cash"}, "owner"),
            ({"method": "cash", "seller": self.seller_a}, "seller"),
            ({"method": "stripe"}, "stripe"),
            ({"provider": "STRIPE"}, "stripe"),
            ({"method": "paypal"}, "paypal"),
            ({"provider": "PAYPAL"}, "paypal"),
            ({"method": "bank_transfer"}, "bank"),
            ({"method": "other"}, "owner"),
        )

        for arguments, expected in cases:
            with self.subTest(arguments=arguments):
                self.assertEqual(receiver_for_method(**arguments), expected)

    def test_seller_takes_priority_over_provider_receiver(self):
        self.assertEqual(
            receiver_for_method(method="stripe", provider="stripe", seller=self.seller_a),
            "seller",
        )

    def test_receiver_affect_helpers_classify_parties(self):
        for receiver in ("owner", "stripe", "paypal", "bank"):
            with self.subTest(receiver=receiver):
                self.assertTrue(receiver_affects_owner(receiver))
                self.assertFalse(receiver_affects_seller(receiver))
        self.assertFalse(receiver_affects_owner("seller"))
        self.assertTrue(receiver_affects_seller("seller"))

    def test_apply_flags_marks_owner_collection_as_settled(self):
        payment = BookingPayment(
            booking=self.make_booking(),
            amount=Decimal("25.00"),
            payment_type="partial",
            method="cash",
        )

        result = apply_payment_finance_flags(payment, receiver="owner")

        self.assertIs(result, payment)
        self.assertEqual(payment.collected_by_party, "owner")
        self.assertTrue(payment.affects_owner_received)
        self.assertFalse(payment.affects_seller_collected)
        self.assertEqual(payment.settlement_status, "settled")

    def test_apply_flags_marks_seller_collection_as_pending(self):
        payment = BookingPayment(
            booking=self.make_booking(seller=self.seller_a),
            seller=self.seller_a,
            amount=Decimal("25.00"),
            payment_type="partial",
            method="cash",
        )

        apply_payment_finance_flags(payment)

        self.assertEqual(payment.collected_by_party, "seller")
        self.assertFalse(payment.affects_owner_received)
        self.assertTrue(payment.affects_seller_collected)
        self.assertEqual(payment.settlement_status, "pending")

    def test_record_payment_rejects_zero_negative_and_invalid_amounts(self):
        booking = self.make_booking()

        for amount in (Decimal("0.00"), Decimal("-0.01"), "invalid"):
            with self.subTest(amount=amount):
                with self.assertRaisesMessage(
                    ValueError, "Payment amount must be greater than zero."
                ):
                    record_payment(booking, amount, "partial")

        self.assertEqual(BookingPayment.objects.count(), 0)

    def test_record_payment_persists_normalized_values_and_metadata(self):
        booking = self.make_booking()
        response = {"event": "safe-event-id"}

        payment, returned_booking = record_payment(
            booking=booking,
            amount="25.129",
            payment_type="partial",
            method="stripe",
            provider="stripe",
            provider_payment_id="pi-service-1",
            provider_status="succeeded",
            provider_response=response,
            reference="safe-reference",
            note="Recorded by service test.",
        )

        payment.refresh_from_db()
        self.assertIs(returned_booking, booking)
        self.assertEqual(payment.amount, Decimal("25.13"))
        self.assertEqual(payment.collected_by_party, "stripe")
        self.assertTrue(payment.affects_owner_received)
        self.assertEqual(payment.settlement_status, "settled")
        self.assertEqual(payment.provider_response, response)
        self.recalculate.assert_called_once_with(booking)
        self.sync_commission.assert_called_once_with(booking)

    def test_record_payment_uses_explicit_collection_party(self):
        booking = self.make_booking(seller=self.seller_a)

        payment, _ = record_payment(
            booking,
            "20.00",
            "partial",
            seller=self.seller_a,
            collected_by_party="owner",
        )

        self.assertEqual(payment.collected_by_party, "owner")
        self.assertTrue(payment.affects_owner_received)
        self.assertFalse(payment.affects_seller_collected)

    def test_record_payment_recomputes_seller_totals_only_for_seller_booking(self):
        booking_without_seller = self.make_booking()
        record_payment(booking_without_seller, "10.00", "partial")
        self.recompute_totals.assert_not_called()

        booking_with_seller = self.make_booking(seller=self.seller_a)
        record_payment(booking_with_seller, "10.00", "partial")
        self.recompute_totals.assert_called_once_with(self.seller_a)

    def test_record_payment_rolls_back_when_recalculation_fails(self):
        booking = self.make_booking()
        self.recalculate.side_effect = RuntimeError("recalculation failed")

        with self.assertRaisesMessage(RuntimeError, "recalculation failed"):
            record_payment(booking, "25.00", "partial")

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())
        self.sync_commission.assert_not_called()

    def test_record_payment_rejects_cross_tenant_seller(self):
        booking = self.make_booking(organisation=self.organisation_a)

        with self.assertRaises(ValidationError):
            record_payment(
                booking,
                "25.00",
                "partial",
                seller=self.seller_b,
            )

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_record_payment_rejects_invalid_choice_values(self):
        booking = self.make_booking()

        with self.assertRaises(ValidationError):
            record_payment(
                booking,
                "25.00",
                "invented-type",
                payer_type="invented-payer",
                method="invented-method",
                status="invented-status",
                collected_by_party="invented-party",
            )

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_customer_payment_wrapper_sets_customer_defaults(self):
        booking = self.make_booking()

        payment, _ = record_customer_payment(booking, "30.00")

        self.assertEqual(payment.payment_type, "full")
        self.assertEqual(payment.payer_type, "customer")
        self.assertEqual(payment.note, "Customer payment recorded.")

    def test_customer_payment_type_wrappers_set_expected_types(self):
        cases = (
            (record_customer_deposit, "deposit", "Customer deposit recorded."),
            (record_customer_full_payment, "full", "Customer full payment recorded."),
            (record_customer_balance_payment, "balance", "Customer balance payment recorded."),
        )

        for function, expected_type, expected_note in cases:
            with self.subTest(function=function.__name__):
                payment, _ = function(self.make_booking(), "20.00")
                self.assertEqual(payment.payment_type, expected_type)
                self.assertEqual(payment.payer_type, "customer")
                self.assertEqual(payment.note, expected_note)

    def test_refund_wrapper_creates_positive_refund_record(self):
        booking = self.make_booking()

        payment, _ = record_refund(booking, "15.00")

        self.assertEqual(payment.amount, Decimal("15.00"))
        self.assertEqual(payment.payment_type, "refund")
        self.assertEqual(payment.payer_type, "customer")

    def test_seller_settlement_wrapper_is_received_by_bank(self):
        booking = self.make_booking(seller=self.seller_a)

        payment, _ = record_seller_settlement_payment(booking, "40.00")

        self.assertEqual(payment.payment_type, "settlement")
        self.assertEqual(payment.payer_type, "seller")
        self.assertEqual(payment.seller, self.seller_a)
        self.assertEqual(payment.collected_by_party, "bank")
        self.assertTrue(payment.affects_owner_received)
        self.assertEqual(payment.settlement_status, "settled")

    def test_provider_confirmation_creates_confirmed_online_payment(self):
        booking = self.make_booking()
        response = {"id": "evt-safe-1", "status": "succeeded"}

        payment, returned_booking = mark_provider_payment_confirmed(
            booking=booking,
            amount="100.00",
            provider="stripe",
            payment_type="full",
            provider_payment_id="pi-confirmed-1",
            provider_status="succeeded",
            provider_response=response,
        )

        self.assertIs(returned_booking, booking)
        self.assertEqual(payment.status, "confirmed")
        self.assertEqual(payment.method, "stripe")
        self.assertEqual(payment.collected_by_party, "stripe")
        self.assertEqual(payment.reference, "pi-confirmed-1")
        self.assertEqual(payment.provider_response, response)

    def test_provider_confirmation_is_idempotent_for_same_checkout(self):
        booking = self.make_booking()
        arguments = {
            "booking": booking,
            "amount": "25.00",
            "provider": "stripe",
            "payment_type": "deposit",
            "provider_checkout_id": "cs-idempotent-1",
        }

        first, _ = mark_provider_payment_confirmed(**arguments)
        second, _ = mark_provider_payment_confirmed(
            **arguments,
            provider_payment_id="pi-added-on-retry",
            provider_status="succeeded",
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(BookingPayment.objects.filter(booking=booking).count(), 1)
        second.refresh_from_db()
        self.assertEqual(second.provider_payment_id, "pi-added-on-retry")

    def test_provider_confirmation_uses_identifier_lookup_priority(self):
        booking = self.make_booking()
        payment, _ = mark_provider_payment_confirmed(
            booking=booking,
            amount="25.00",
            provider="paypal",
            payment_type="deposit",
            provider_payment_id="pay-lower-priority",
            provider_checkout_id="checkout-highest-priority",
            provider_order_id="order-middle-priority",
        )

        retry, _ = mark_provider_payment_confirmed(
            booking=booking,
            amount="25.00",
            provider="paypal",
            payment_type="deposit",
            provider_checkout_id="checkout-highest-priority",
        )

        self.assertEqual(payment.pk, retry.pk)

    def test_provider_confirmation_rejects_nonpositive_amount(self):
        booking = self.make_booking()

        for amount in (Decimal("0.00"), Decimal("-0.01")):
            with self.subTest(amount=amount):
                with self.assertRaisesMessage(
                    ValueError, "Payment amount must be greater than zero."
                ):
                    mark_provider_payment_confirmed(
                        booking=booking,
                        amount=amount,
                        provider="stripe",
                        payment_type="full",
                        provider_payment_id=f"pi-invalid-{amount}",
                    )

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_provider_confirmation_requires_stable_provider_identifier(self):
        booking = self.make_booking()

        with self.assertRaises(ValueError):
            mark_provider_payment_confirmed(
                booking=booking,
                amount="25.00",
                provider="stripe",
                payment_type="deposit",
            )

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_same_provider_identifier_cannot_be_reassigned_to_another_booking(self):
        first_booking = self.make_booking()
        second_booking = self.make_booking()
        mark_provider_payment_confirmed(
            booking=first_booking,
            amount="25.00",
            provider="stripe",
            payment_type="deposit",
            provider_payment_id="pi-global-owner-1",
        )

        with self.assertRaises(IntegrityError):
            mark_provider_payment_confirmed(
                booking=second_booking,
                amount="25.00",
                provider="stripe",
                payment_type="deposit",
                provider_payment_id="pi-global-owner-1",
            )

        self.assertEqual(
            BookingPayment.objects.filter(provider_payment_id="pi-global-owner-1").count(),
            1,
        )

    def test_provider_confirmation_rolls_back_when_commission_sync_fails(self):
        booking = self.make_booking()
        self.sync_commission.side_effect = RuntimeError("commission sync failed")

        with self.assertRaisesMessage(RuntimeError, "commission sync failed"):
            mark_provider_payment_confirmed(
                booking=booking,
                amount="25.00",
                provider="paypal",
                payment_type="deposit",
                provider_order_id="order-rollback-1",
            )

        self.assertFalse(BookingPayment.objects.filter(booking=booking).exists())

    def test_notification_is_queued_only_for_first_customer_confirmation(self):
        self.queue_patcher.stop()
        self.addCleanup(lambda: None)
        booking = self.make_booking(payment_status="paid")

        with patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay") as delay:
            with self.captureOnCommitCallbacks(execute=True):
                _queue_payment_confirmed_notification_if_transitioned(
                    booking=booking,
                    previous_payment_status="unpaid",
                    payer_type="customer",
                    payment_type="full",
                    payment_status="confirmed",
                )

        delay.assert_called_once_with(booking.id)

    def test_notification_is_not_queued_for_refund_settlement_or_repeat(self):
        self.queue_patcher.stop()
        self.addCleanup(lambda: None)
        booking = self.make_booking(payment_status="paid")
        cases = (
            {"previous_payment_status": "paid", "payer_type": "customer", "payment_type": "full", "payment_status": "confirmed"},
            {"previous_payment_status": "unpaid", "payer_type": "customer", "payment_type": "refund", "payment_status": "confirmed"},
            {"previous_payment_status": "unpaid", "payer_type": "seller", "payment_type": "settlement", "payment_status": "confirmed"},
            {"previous_payment_status": "unpaid", "payer_type": "customer", "payment_type": "full", "payment_status": "pending"},
        )

        with patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay") as delay:
            for case in cases:
                with self.subTest(case=case):
                    _queue_payment_confirmed_notification_if_transitioned(
                        booking=booking, **case
                    )

        delay.assert_not_called()
