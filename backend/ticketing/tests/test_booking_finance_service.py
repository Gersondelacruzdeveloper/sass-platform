"""Tests for the legacy-compatible booking finance service facade."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import TestCase

from ticketing import booking_finance_service as service


class BookingFinanceServiceTests(TestCase):
    def make_booking(self, **overrides):
        seller = overrides.pop(
            "seller",
            SimpleNamespace(full_name="Facade Seller"),
        )
        values = {
            "id": 101,
            "booking_code": "PCD-FACADE1",
            "status": "confirmed",
            "payment_status": "unpaid",
            "settlement_status": "pending",
            "seller": seller,
            "seller_due_to_company": Decimal("25.00"),
            "owner_net_amount": Decimal("85.00"),
            "owner_received_amount": Decimal("60.00"),
            "refresh_from_db": Mock(),
        }
        values.update(overrides)
        return SimpleNamespace(**values)

    def test_extract_booking_from_tuple_uses_last_booking_like_value(self):
        fallback = self.make_booking(booking_code="PCD-FALLBACK")
        first = self.make_booking(booking_code="PCD-FIRST")
        last = self.make_booking(booking_code="PCD-LAST")

        result = service._extract_booking_from_payment_result(
            (object(), first, object(), last), fallback
        )

        self.assertIs(result, last)
        fallback.refresh_from_db.assert_not_called()

    def test_extract_booking_accepts_direct_booking_result(self):
        fallback = self.make_booking(booking_code="PCD-FALLBACK")
        direct = self.make_booking(booking_code="PCD-DIRECT")

        result = service._extract_booking_from_payment_result(direct, fallback)

        self.assertIs(result, direct)
        fallback.refresh_from_db.assert_not_called()

    def test_extract_booking_refreshes_and_returns_fallback_for_unknown_result(self):
        fallback = self.make_booking()

        result = service._extract_booking_from_payment_result(object(), fallback)

        self.assertIs(result, fallback)
        fallback.refresh_from_db.assert_called_once_with()

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_notification_is_queued_on_first_deposit_transition(self, delay):
        booking = self.make_booking(payment_status="deposit_paid")

        with self.captureOnCommitCallbacks(execute=True):
            service._queue_payment_confirmed_notification_if_transitioned(
                booking=booking,
                previous_payment_status="unpaid",
            )

        delay.assert_called_once_with(booking.id)

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_notification_is_queued_on_first_paid_transition(self, delay):
        booking = self.make_booking(payment_status="paid")

        with self.captureOnCommitCallbacks(execute=True):
            service._queue_payment_confirmed_notification_if_transitioned(
                booking=booking,
                previous_payment_status="pending",
            )

        delay.assert_called_once_with(booking.id)

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_notification_is_not_queued_without_confirmed_transition(self, delay):
        cases = (
            ("unpaid", "pending"),
            ("deposit_paid", "deposit_paid"),
            ("deposit_paid", "paid"),
            ("paid", "paid"),
        )
        for previous, current in cases:
            with self.subTest(previous=previous, current=current):
                with self.captureOnCommitCallbacks(execute=True):
                    service._queue_payment_confirmed_notification_if_transitioned(
                        booking=self.make_booking(payment_status=current),
                        previous_payment_status=previous,
                    )

        delay.assert_not_called()

    @patch(
        "ticketing.tasks.send_payment_confirmed_notifications_task.delay",
        side_effect=RuntimeError("queue unavailable"),
    )
    def test_notification_queue_failure_is_logged_and_not_raised(self, delay):
        booking = self.make_booking(payment_status="paid")

        with self.assertLogs(service.logger, level="ERROR"):
            with self.captureOnCommitCallbacks(execute=True):
                service._queue_payment_confirmed_notification_if_transitioned(
                    booking=booking,
                    previous_payment_status="unpaid",
                )

        delay.assert_called_once_with(booking.id)

    @patch.object(service, "_queue_payment_confirmed_notification_if_transitioned")
    @patch.object(service, "recompute_seller_totals")
    @patch.object(service, "sync_commission_for_booking")
    @patch.object(service, "recalculate_booking")
    def test_recalculate_payment_totals_delegates_all_boundaries(
        self, recalculate, sync, recompute, queue
    ):
        original = self.make_booking(payment_status="unpaid")
        updated = self.make_booking(payment_status="deposit_paid")
        recalculate.return_value = updated

        result = service.recalculate_booking_payment_totals(original)

        self.assertIs(result, updated)
        recalculate.assert_called_once_with(original)
        sync.assert_called_once_with(updated)
        recompute.assert_called_once_with(updated.seller)
        queue.assert_called_once_with(
            booking=updated,
            previous_payment_status="unpaid",
        )

    @patch.object(service, "recompute_seller_totals")
    @patch.object(service, "sync_commission_for_booking")
    @patch.object(service, "recalculate_booking")
    def test_recalculate_skips_seller_totals_without_seller(
        self, recalculate, sync, recompute
    ):
        booking = self.make_booking(seller=None)
        recalculate.return_value = booking

        service.recalculate_booking_payment_totals(booking)

        sync.assert_called_once_with(booking)
        recompute.assert_not_called()

    @patch.object(service, "sync_commission_for_booking")
    def test_sync_seller_commission_is_a_direct_alias(self, sync):
        booking = self.make_booking()
        expected = object()
        sync.return_value = expected

        self.assertIs(service.sync_seller_commission_for_booking(booking), expected)
        sync.assert_called_once_with(booking)

    @patch.object(service, "_queue_payment_confirmed_notification_if_transitioned")
    @patch.object(service, "mark_provider_payment_confirmed")
    def test_mark_booking_payment_confirmed_forwards_provider_metadata(
        self, confirm, queue
    ):
        booking = self.make_booking(payment_status="unpaid")
        updated = self.make_booking(payment_status="paid")
        expected = (object(), updated)
        confirm.return_value = expected

        result = service.mark_booking_payment_confirmed(
            booking,
            "100.00",
            "stripe",
            "full",
            provider_payment_id="pi_1",
            provider_checkout_id="cs_1",
            provider_order_id="order_1",
            provider_capture_id="capture_1",
            provider_status="succeeded",
            provider_response={"safe": True},
        )

        self.assertIs(result, expected)
        confirm.assert_called_once_with(
            booking=booking,
            amount="100.00",
            provider="stripe",
            payment_type="full",
            provider_payment_id="pi_1",
            provider_checkout_id="cs_1",
            provider_order_id="order_1",
            provider_capture_id="capture_1",
            provider_status="succeeded",
            provider_response={"safe": True},
        )
        queue.assert_called_once_with(
            booking=updated,
            previous_payment_status="unpaid",
        )

    @patch.object(service, "mark_provider_payment_confirmed")
    def test_mark_booking_payment_confirmed_normalizes_missing_response(self, confirm):
        booking = self.make_booking()
        confirm.return_value = (object(), booking)

        service.mark_booking_payment_confirmed(
            booking, "10.00", "paypal", "deposit", provider_response=None
        )

        self.assertEqual(confirm.call_args.kwargs["provider_response"], {})

    @patch.object(service, "recalculate_booking_payment_totals")
    @patch.object(service, "recalculate_booking_finance")
    def test_legacy_and_new_recalculation_entry_points_are_distinct(
        self, new_recalculate, legacy_recalculate
    ):
        self.assertIsNot(service.recalculate_booking_payment_totals, service.recalculate_booking_finance)
        new_recalculate.assert_not_called()
        legacy_recalculate.assert_not_called()

    @patch.object(service, "calculate_booking_financial_snapshot")
    def test_calculate_booking_snapshot_delegates(self, calculate):
        booking = self.make_booking()
        snapshot = {"total": Decimal("100.00")}
        calculate.return_value = snapshot

        self.assertIs(service.calculate_booking_snapshot(booking), snapshot)
        calculate.assert_called_once_with(booking)

    @patch.object(service, "_queue_payment_confirmed_notification_if_transitioned")
    @patch.object(service, "recompute_seller_totals")
    @patch.object(service, "sync_commission_for_booking")
    @patch.object(service, "apply_booking_financial_snapshot")
    def test_apply_booking_snapshot_delegates_and_synchronizes(
        self, apply_snapshot, sync, recompute, queue
    ):
        original = self.make_booking(payment_status="unpaid")
        updated = self.make_booking(payment_status="paid")
        snapshot = {"total_amount": Decimal("100.00")}
        apply_snapshot.return_value = updated

        result = service.apply_booking_snapshot(original, snapshot)

        self.assertIs(result, updated)
        apply_snapshot.assert_called_once_with(original, snapshot)
        sync.assert_called_once_with(updated)
        recompute.assert_called_once_with(updated.seller)
        queue.assert_called_once_with(
            booking=updated,
            previous_payment_status="unpaid",
        )

    @patch.object(service, "_queue_payment_confirmed_notification_if_transitioned")
    @patch.object(service, "record_customer_payment")
    def test_cash_to_seller_forwards_seller_collection_flags(self, record, queue):
        booking = self.make_booking(payment_status="unpaid")
        expected = (object(), self.make_booking(payment_status="paid"))
        record.return_value = expected

        result = service.record_customer_cash_to_seller(
            booking,
            "100.00",
            reference="cash-1",
            note="Seller receipt.",
        )

        self.assertIs(result, expected)
        record.assert_called_once_with(
            booking=booking,
            amount="100.00",
            payment_type="full",
            method="cash",
            seller=booking.seller,
            collected_by=None,
            reference="cash-1",
            note="Seller receipt.",
            collected_by_party="seller",
        )

    @patch.object(service, "record_customer_payment")
    def test_cash_to_seller_prefers_explicit_seller(self, record):
        booking = self.make_booking()
        explicit_seller = object()
        record.return_value = (object(), booking)

        service.record_customer_cash_to_seller(
            booking, "10.00", seller=explicit_seller
        )

        self.assertIs(record.call_args.kwargs["seller"], explicit_seller)

    @patch.object(service, "record_customer_payment")
    def test_cash_to_owner_forwards_owner_collection_flags(self, record):
        booking = self.make_booking()
        record.return_value = (object(), booking)

        service.record_customer_cash_to_owner(
            booking,
            "25.00",
            payment_type="deposit",
            reference="owner-cash-1",
        )

        record.assert_called_once_with(
            booking=booking,
            amount="25.00",
            payment_type="deposit",
            method="cash",
            seller=None,
            collected_by=None,
            reference="owner-cash-1",
            note="Customer cash received by owner.",
            collected_by_party="owner",
        )

    @patch.object(service, "mark_provider_payment_confirmed")
    def test_online_payment_forwards_provider_identifiers(self, confirm):
        booking = self.make_booking()
        confirm.return_value = (object(), booking)

        service.record_customer_online_payment(
            booking,
            "25.00",
            "paypal",
            payment_type="deposit",
            provider_order_id="paypal-order",
            provider_capture_id="paypal-capture",
        )

        self.assertEqual(confirm.call_args.kwargs["provider"], "paypal")
        self.assertEqual(confirm.call_args.kwargs["payment_type"], "deposit")
        self.assertEqual(
            confirm.call_args.kwargs["provider_order_id"], "paypal-order"
        )
        self.assertEqual(
            confirm.call_args.kwargs["provider_capture_id"], "paypal-capture"
        )

    @patch.object(service, "record_seller_settlement_payment")
    def test_seller_company_settlement_delegates_without_notification(self, record):
        booking = self.make_booking()
        expected = (object(), booking)
        record.return_value = expected

        result = service.record_seller_company_settlement(
            booking,
            "25.00",
            method="cash",
            reference="seller-settlement-1",
        )

        self.assertIs(result, expected)
        record.assert_called_once_with(
            booking=booking,
            amount="25.00",
            collected_by=None,
            method="cash",
            reference="seller-settlement-1",
            note="Seller settled amount owed to company.",
        )

    @patch.object(service, "settle_booking_fully")
    def test_settle_seller_balance_delegates_without_notification(self, settle):
        booking = self.make_booking()
        expected = (object(), booking)
        settle.return_value = expected

        result = service.settle_seller_booking_balance(
            booking,
            method="bank_transfer",
            reference="full-settlement-1",
        )

        self.assertIs(result, expected)
        settle.assert_called_once_with(
            booking=booking,
            collected_by=None,
            method="bank_transfer",
            reference="full-settlement-1",
        )

    @patch.object(service, "calculate_booking_financial_snapshot")
    def test_debug_booking_finance_returns_snapshot_and_key_fields(self, calculate):
        booking = self.make_booking()
        snapshot = {"customer_revenue": Decimal("100.00")}
        calculate.return_value = snapshot

        result = service.debug_booking_finance(booking)

        self.assertEqual(result["booking_code"], "PCD-FACADE1")
        self.assertEqual(result["snapshot"], snapshot)
        self.assertEqual(result["seller"], "Facade Seller")
        self.assertEqual(result["seller_due_to_company"], Decimal("25.00"))
        self.assertEqual(result["owner_net_amount"], Decimal("85.00"))
        self.assertEqual(result["owner_received_amount"], Decimal("60.00"))

    @patch.object(service, "calculate_booking_financial_snapshot")
    def test_debug_booking_finance_handles_booking_without_seller(self, calculate):
        booking = self.make_booking(seller=None)
        calculate.return_value = {}

        result = service.debug_booking_finance(booking)

        self.assertEqual(result["seller"], "")

    def test_public_exports_include_legacy_and_modular_entry_points(self):
        required = {
            "money",
            "recalculate_booking_payment_totals",
            "mark_booking_payment_confirmed",
            "calculate_booking_snapshot",
            "record_customer_cash_to_seller",
            "record_customer_cash_to_owner",
            "record_customer_online_payment",
            "record_seller_company_settlement",
            "settle_seller_booking_balance",
            "owner_finance_summary",
            "seller_finance_summary",
            "debug_booking_finance",
        }

        self.assertTrue(required.issubset(set(service.__all__)))

