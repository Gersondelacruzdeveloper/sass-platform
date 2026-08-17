"""Service tests for ticketing.finance.commissions."""

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.test import TestCase

from organisations.models import Organisation
from ticketing.finance.commissions import (
    cancel_commissions_for_booking,
    get_previous_seller_ids_for_booking,
    mark_commission_paid,
    recompute_seller_totals,
    sync_all_commissions_for_seller,
    sync_commission_for_booking,
)
from ticketing.models import Booking, Seller, SellerCommission


class FinanceCommissionServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Commission Organisation A",
            slug="finance-commission-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Commission Organisation B",
            slug="finance-commission-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Commission Seller A",
            seller_slug="finance-commission-seller-a",
            application_status="approved",
            default_margin_percent=Decimal("12.00"),
            commission_rate=Decimal("8.00"),
            is_active=True,
        )
        cls.seller_a_second = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Commission Seller A Second",
            seller_slug="finance-commission-seller-a-second",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Commission Seller B",
            seller_slug="finance-commission-seller-b",
            application_status="approved",
            is_active=True,
        )
        cls.user = get_user_model().objects.create_user(
            username="commission-payer",
            email="commission-payer@example.com",
            password="test-only-password",
        )

    def make_booking(self, seller=None, organisation=None, **overrides):
        seller = self.seller_a if seller is None else seller
        values = {
            "organisation": organisation or self.organisation_a,
            "seller": seller,
            "customer_name": "Commission Customer",
            "status": "confirmed",
            "total_amount": Decimal("100.00"),
            "seller_commission_amount": Decimal("15.00"),
            "seller_margin_percent": Decimal("15.00"),
            "customer_discount_amount": Decimal("5.00"),
            "owner_net_amount": Decimal("80.00"),
            "seller_collected_amount": Decimal("0.00"),
            "seller_due_to_company": Decimal("0.00"),
            "owner_received_amount": Decimal("0.00"),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_commission(self, booking=None, seller=None, **overrides):
        seller = seller or self.seller_a
        booking = booking or self.make_booking(seller=seller)
        values = {
            "organisation": booking.organisation,
            "seller": seller,
            "booking": booking,
            "amount": Decimal("15.00"),
            "rate_used": Decimal("15.00"),
            "customer_discount_amount": Decimal("5.00"),
            "owner_net_amount": Decimal("80.00"),
            "status": "pending",
        }
        values.update(overrides)
        return SellerCommission.objects.create(**values)

    def test_recompute_totals_returns_none_for_missing_seller(self):
        self.assertIsNone(recompute_seller_totals(None))

    def test_recompute_totals_aggregates_active_booking_finance(self):
        self.make_booking(
            total_amount=Decimal("100.00"),
            seller_collected_amount=Decimal("40.00"),
            seller_due_to_company=Decimal("25.00"),
            owner_net_amount=Decimal("85.00"),
            owner_received_amount=Decimal("30.00"),
        )
        self.make_booking(
            total_amount=Decimal("50.00"),
            seller_collected_amount=Decimal("20.00"),
            seller_due_to_company=Decimal("10.00"),
            owner_net_amount=Decimal("42.00"),
            owner_received_amount=Decimal("12.00"),
        )

        recompute_seller_totals(self.seller_a)
        self.seller_a.refresh_from_db()

        self.assertEqual(self.seller_a.total_sales_amount, Decimal("150.00"))
        self.assertEqual(self.seller_a.total_collected_amount, Decimal("60.00"))
        self.assertEqual(self.seller_a.total_owed_to_company, Decimal("35.00"))

    def test_recompute_totals_excludes_inactive_booking_statuses(self):
        for status in ("cancelled", "refunded", "no_show"):
            self.make_booking(
                status=status,
                total_amount=Decimal("100.00"),
                seller_collected_amount=Decimal("50.00"),
                seller_due_to_company=Decimal("30.00"),
            )
        self.make_booking(total_amount=Decimal("25.00"))

        recompute_seller_totals(self.seller_a)
        self.seller_a.refresh_from_db()

        self.assertEqual(self.seller_a.total_sales_amount, Decimal("25.00"))
        self.assertEqual(self.seller_a.total_collected_amount, Decimal("0.00"))
        self.assertEqual(self.seller_a.total_owed_to_company, Decimal("0.00"))

    def test_recompute_totals_excludes_cancelled_commissions(self):
        active = self.make_commission(amount=Decimal("15.00"))
        self.make_commission(
            booking=self.make_booking(),
            amount=Decimal("20.00"),
            status="cancelled",
        )

        recompute_seller_totals(self.seller_a)
        self.seller_a.refresh_from_db()

        self.assertEqual(active.status, "pending")
        self.assertEqual(self.seller_a.total_commission_amount, Decimal("15.00"))

    def test_recompute_totals_does_not_include_other_sellers(self):
        self.make_booking(seller=self.seller_a_second, total_amount=Decimal("999.00"))
        self.make_commission(
            seller=self.seller_a_second,
            booking=self.make_booking(seller=self.seller_a_second),
            amount=Decimal("99.00"),
        )

        recompute_seller_totals(self.seller_a)
        self.seller_a.refresh_from_db()

        self.assertEqual(self.seller_a.total_sales_amount, Decimal("0.00"))
        self.assertEqual(self.seller_a.total_commission_amount, Decimal("0.00"))

    def test_previous_seller_ids_are_scoped_to_booking(self):
        booking = self.make_booking()
        self.make_commission(booking=booking)
        self.make_commission(
            booking=self.make_booking(seller=self.seller_a_second),
            seller=self.seller_a_second,
        )

        self.assertEqual(get_previous_seller_ids_for_booking(booking), {self.seller_a.id})

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_cancel_commissions_marks_all_booking_rows_cancelled(self, recompute):
        booking = self.make_booking()
        commission = self.make_commission(booking=booking)

        result = cancel_commissions_for_booking(booking)

        self.assertIsNone(result)
        commission.refresh_from_db()
        self.assertEqual(commission.status, "cancelled")
        recompute.assert_called_once()
        self.assertEqual(recompute.call_args.args[0].pk, self.seller_a.pk)

    def test_cancel_commissions_does_not_touch_another_booking(self):
        target = self.make_booking()
        target_commission = self.make_commission(booking=target)
        other_commission = self.make_commission(booking=self.make_booking())

        cancel_commissions_for_booking(target)
        target_commission.refresh_from_db()
        other_commission.refresh_from_db()

        self.assertEqual(target_commission.status, "cancelled")
        self.assertEqual(other_commission.status, "pending")

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_creates_commission_from_booking_snapshot(self, recompute):
        booking = self.make_booking()

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.organisation, self.organisation_a)
        self.assertEqual(commission.seller, self.seller_a)
        self.assertEqual(commission.amount, Decimal("15.00"))
        self.assertEqual(commission.rate_used, Decimal("15.00"))
        self.assertEqual(commission.status, "pending")
        self.assertEqual(
            commission.note, "Automatically synced by booking finance engine."
        )
        recompute.assert_called_once()

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_updates_existing_commission_without_duplication(self, recompute):
        booking = self.make_booking()
        existing = self.make_commission(booking=booking, amount=Decimal("10.00"))
        booking.seller_commission_amount = Decimal("18.00")
        booking.seller_margin_percent = Decimal("18.00")
        booking.save(
            update_fields=["seller_commission_amount", "seller_margin_percent", "updated_at"]
        )

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.pk, existing.pk)
        self.assertEqual(commission.amount, Decimal("18.00"))
        self.assertEqual(commission.rate_used, Decimal("18.00"))
        self.assertEqual(SellerCommission.objects.filter(booking=booking).count(), 1)

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_preserves_paid_status(self, recompute):
        booking = self.make_booking()
        existing = self.make_commission(booking=booking, status="paid")

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.pk, existing.pk)
        self.assertEqual(commission.status, "paid")

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_uses_seller_default_margin_when_booking_rate_is_zero(self, recompute):
        booking = self.make_booking(seller_margin_percent=Decimal("0.00"))

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.rate_used, Decimal("12.00"))

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_uses_commission_rate_as_last_rate_fallback(self, recompute):
        self.seller_a.default_margin_percent = Decimal("0.00")
        self.seller_a.commission_rate = Decimal("8.00")
        self.seller_a.save(
            update_fields=["default_margin_percent", "commission_rate", "updated_at"]
        )
        booking = self.make_booking(seller_margin_percent=Decimal("0.00"))

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.rate_used, Decimal("8.00"))

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_cancels_commission_when_booking_has_no_seller(self, recompute):
        booking = self.make_booking()
        commission = self.make_commission(booking=booking)
        booking.seller = None
        booking.save(update_fields=["seller", "updated_at"])

        self.assertIsNone(sync_commission_for_booking(booking))
        commission.refresh_from_db()
        self.assertEqual(commission.status, "cancelled")

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_cancels_commission_for_inactive_booking(self, recompute):
        for status in ("cancelled", "refunded", "no_show"):
            with self.subTest(status=status):
                booking = self.make_booking(status=status)
                commission = self.make_commission(booking=booking)
                self.assertIsNone(sync_commission_for_booking(booking))
                commission.refresh_from_db()
                self.assertEqual(commission.status, "cancelled")

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_cancels_zero_or_negative_commission(self, recompute):
        for amount in (Decimal("0.00"), Decimal("-0.01")):
            with self.subTest(amount=amount):
                booking = self.make_booking(seller_commission_amount=amount)
                commission = self.make_commission(booking=booking)
                self.assertIsNone(sync_commission_for_booking(booking))
                commission.refresh_from_db()
                self.assertEqual(commission.status, "cancelled")

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_seller_reassignment_cancels_old_and_creates_new_commission(self, recompute):
        booking = self.make_booking()
        old_commission = self.make_commission(booking=booking)
        booking.seller = self.seller_a_second
        booking.save(update_fields=["seller", "updated_at"])

        new_commission = sync_commission_for_booking(booking)

        old_commission.refresh_from_db()
        self.assertEqual(old_commission.status, "cancelled")
        self.assertEqual(new_commission.seller, self.seller_a_second)

    def test_sync_rejects_cross_tenant_booking_seller_relationship(self):
        booking = self.make_booking(
            organisation=self.organisation_a,
            seller=self.seller_b,
        )

        with self.assertRaises(ValidationError):
            sync_commission_for_booking(booking)

        self.assertFalse(SellerCommission.objects.filter(booking=booking).exists())

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_sync_copies_discount_and_owner_net_snapshot_fields(self, recompute):
        booking = self.make_booking(
            customer_discount_amount=Decimal("7.00"),
            owner_net_amount=Decimal("78.00"),
        )

        commission = sync_commission_for_booking(booking)

        self.assertEqual(commission.customer_discount_amount, Decimal("7.00"))
        self.assertEqual(commission.owner_net_amount, Decimal("78.00"))

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_mark_commission_paid_sets_status_timestamp_and_actor(self, recompute):
        commission = self.make_commission()

        result = mark_commission_paid(commission, paid_by=self.user)

        self.assertIs(result, commission)
        commission.refresh_from_db()
        self.assertEqual(commission.status, "paid")
        self.assertIsNotNone(commission.paid_at)
        self.assertEqual(commission.paid_by, self.user)
        recompute.assert_called_once_with(self.seller_a)

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_mark_commission_paid_preserves_existing_actor_when_none_supplied(self, recompute):
        commission = self.make_commission(paid_by=self.user)

        mark_commission_paid(commission)
        commission.refresh_from_db()

        self.assertEqual(commission.paid_by, self.user)

    @patch("ticketing.finance.commissions.recompute_seller_totals")
    def test_bulk_sync_returns_only_active_positive_commissions(self, recompute):
        active = self.make_booking(seller=self.seller_a)
        self.make_booking(
            seller=self.seller_a,
            status="cancelled",
            seller_commission_amount=Decimal("15.00"),
        )
        self.make_booking(
            seller=self.seller_a,
            seller_commission_amount=Decimal("0.00"),
        )

        commissions = sync_all_commissions_for_seller(self.seller_a)

        self.assertEqual(len(commissions), 1)
        self.assertEqual(commissions[0].booking, active)
        self.assertGreaterEqual(recompute.call_count, 1)

    def test_bulk_sync_returns_empty_list_for_missing_seller(self):
        self.assertEqual(sync_all_commissions_for_seller(None), [])
