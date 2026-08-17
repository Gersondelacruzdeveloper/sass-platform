"""Tests for read-only ticketing finance reporting helpers."""

from decimal import Decimal

from django.test import TestCase

from organisations.models import Organisation
from ticketing.finance.reports import (
    active_bookings_queryset,
    aggregate_booking_totals,
    commission_summary,
    commissions_queryset,
    owner_finance_summary,
    payment_receiver_summary,
    payment_status_counts,
    payments_queryset,
    receivables_report,
    safe_total,
    seller_finance_summary,
    seller_leaderboard,
    seller_receivables_report,
    settlement_counts,
)
from ticketing.models import Booking, BookingPayment, Seller, SellerCommission


class FinanceReportTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Finance Report Organisation A",
            slug="finance-report-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Finance Report Organisation B",
            slug="finance-report-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Report Seller A",
            seller_slug="report-seller-a",
            application_status="approved",
            is_active=True,
        )
        cls.seller_a_second = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Report Seller A Second",
            seller_slug="report-seller-a-second",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Report Seller B",
            seller_slug="report-seller-b",
            application_status="approved",
            is_active=True,
        )

    def make_booking(self, organisation=None, seller=None, **overrides):
        organisation = organisation or self.organisation_a
        if seller is None and organisation == self.organisation_a:
            seller = self.seller_a
        elif seller is None and organisation == self.organisation_b:
            seller = self.seller_b

        values = {
            "organisation": organisation,
            "seller": seller,
            "customer_name": "Finance Report Customer",
            "status": "confirmed",
            "payment_status": "unpaid",
            "original_price": Decimal("120.00"),
            "total_amount": Decimal("100.00"),
            "customer_discount_amount": Decimal("20.00"),
            "seller_commission_amount": Decimal("15.00"),
            "owner_net_amount": Decimal("85.00"),
            "owner_received_amount": Decimal("25.00"),
            "seller_collected_amount": Decimal("40.00"),
            "seller_due_to_company": Decimal("25.00"),
            "deposit_paid": Decimal("25.00"),
            "balance_due": Decimal("75.00"),
            "settlement_status": "pending",
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_payment(self, booking=None, seller=None, **overrides):
        booking = booking or self.make_booking(seller=seller)
        values = {
            "booking": booking,
            "seller": seller if seller is not None else booking.seller,
            "amount": Decimal("25.00"),
            "payment_type": "partial",
            "payer_type": "customer",
            "method": "cash",
            "status": "confirmed",
            "collected_by_party": "owner",
            "affects_owner_received": True,
            "affects_seller_collected": False,
        }
        values.update(overrides)
        return BookingPayment.objects.create(**values)

    def make_commission(self, booking=None, seller=None, **overrides):
        seller = seller or self.seller_a
        booking = booking or self.make_booking(
            organisation=seller.organisation,
            seller=seller,
        )
        values = {
            "organisation": seller.organisation,
            "seller": seller,
            "booking": booking,
            "amount": Decimal("15.00"),
            "rate_used": Decimal("15.00"),
            "status": "pending",
        }
        values.update(overrides)
        return SellerCommission.objects.create(**values)

    def test_safe_total_normalizes_none_and_decimal_values(self):
        self.assertEqual(safe_total(None), Decimal("0.00"))
        self.assertEqual(safe_total(Decimal("12.129")), Decimal("12.13"))

    def test_active_bookings_excludes_financially_inactive_statuses(self):
        active = self.make_booking(status="confirmed")
        for status in ("cancelled", "refunded", "no_show"):
            self.make_booking(status=status)

        queryset = active_bookings_queryset(organisation=self.organisation_a)

        self.assertEqual(list(queryset), [active])

    def test_active_bookings_is_tenant_scoped(self):
        booking_a = self.make_booking()
        self.make_booking(organisation=self.organisation_b)

        queryset = active_bookings_queryset(organisation=self.organisation_a)

        self.assertEqual(list(queryset), [booking_a])

    def test_active_bookings_is_seller_scoped(self):
        booking_a = self.make_booking(seller=self.seller_a)
        self.make_booking(seller=self.seller_a_second)

        queryset = active_bookings_queryset(seller=self.seller_a)

        self.assertEqual(list(queryset), [booking_a])

    def test_payments_queryset_includes_only_confirmed_payments(self):
        confirmed = self.make_payment(status="confirmed")
        self.make_payment(status="pending")
        self.make_payment(status="failed")

        self.assertEqual(list(payments_queryset()), [confirmed])

    def test_payments_queryset_is_tenant_scoped_through_booking(self):
        payment_a = self.make_payment()
        self.make_payment(booking=self.make_booking(organisation=self.organisation_b))

        queryset = payments_queryset(organisation=self.organisation_a)

        self.assertEqual(list(queryset), [payment_a])

    def test_payments_queryset_matches_direct_or_booking_seller_without_duplicates(self):
        direct = self.make_payment(seller=self.seller_a)
        booking_seller = self.make_payment(
            booking=self.make_booking(seller=self.seller_a),
            seller=None,
        )
        self.make_payment(
            booking=self.make_booking(seller=self.seller_a_second),
            seller=self.seller_a_second,
        )

        queryset = payments_queryset(seller=self.seller_a)

        self.assertCountEqual(queryset, [direct, booking_seller])
        self.assertEqual(queryset.count(), 2)

    def test_commissions_queryset_excludes_cancelled_and_scopes_tenant(self):
        active = self.make_commission(status="pending")
        self.make_commission(status="cancelled")
        self.make_commission(seller=self.seller_b)

        queryset = commissions_queryset(organisation=self.organisation_a)

        self.assertEqual(list(queryset), [active])

    def test_commissions_queryset_is_seller_scoped(self):
        commission = self.make_commission(seller=self.seller_a)
        self.make_commission(seller=self.seller_a_second)

        self.assertEqual(list(commissions_queryset(seller=self.seller_a)), [commission])

    def test_aggregate_booking_totals_returns_zeroes_for_empty_queryset(self):
        summary = aggregate_booking_totals(Booking.objects.none())

        self.assertEqual(summary["bookings_count"], 0)
        for field, value in summary.items():
            if field != "bookings_count":
                self.assertEqual(value, Decimal("0.00"), field)

    def test_aggregate_booking_totals_sums_financial_snapshots(self):
        self.make_booking()
        self.make_booking(
            original_price=Decimal("60.00"),
            total_amount=Decimal("50.00"),
            customer_discount_amount=Decimal("10.00"),
            seller_commission_amount=Decimal("5.00"),
            owner_net_amount=Decimal("45.00"),
            owner_received_amount=Decimal("20.00"),
            seller_collected_amount=Decimal("10.00"),
            seller_due_to_company=Decimal("5.00"),
            deposit_paid=Decimal("10.00"),
            balance_due=Decimal("40.00"),
        )

        summary = aggregate_booking_totals(
            active_bookings_queryset(organisation=self.organisation_a)
        )

        self.assertEqual(summary["bookings_count"], 2)
        self.assertEqual(summary["gross_sales"], Decimal("180.00"))
        self.assertEqual(summary["customer_revenue"], Decimal("150.00"))
        self.assertEqual(summary["customer_discounts"], Decimal("30.00"))
        self.assertEqual(summary["seller_commissions"], Decimal("20.00"))
        self.assertEqual(summary["owner_net"], Decimal("130.00"))
        self.assertEqual(summary["owner_received"], Decimal("45.00"))
        self.assertEqual(summary["owner_pending"], Decimal("85.00"))
        self.assertEqual(summary["seller_collected"], Decimal("50.00"))
        self.assertEqual(summary["seller_due_to_company"], Decimal("30.00"))
        self.assertEqual(summary["deposit_paid"], Decimal("35.00"))
        self.assertEqual(summary["balance_due"], Decimal("115.00"))

    def test_owner_pending_never_becomes_negative(self):
        booking = self.make_booking(
            owner_net_amount=Decimal("50.00"),
            owner_received_amount=Decimal("75.00"),
        )

        summary = aggregate_booking_totals(Booking.objects.filter(pk=booking.pk))

        self.assertEqual(summary["owner_pending"], Decimal("0.00"))

    def test_settlement_counts_cover_each_supported_status(self):
        self.make_booking(settlement_status="pending")
        self.make_booking(settlement_status="partially_settled")
        self.make_booking(settlement_status="settled")
        self.make_booking(settlement_status="not_required")

        counts = settlement_counts(
            active_bookings_queryset(organisation=self.organisation_a)
        )

        self.assertEqual(counts["settlement_pending_count"], 1)
        self.assertEqual(counts["settlement_partially_settled_count"], 1)
        self.assertEqual(counts["settlement_settled_count"], 1)

    def test_payment_status_counts_cover_supported_statuses(self):
        for status in ("unpaid", "pending", "deposit_paid", "partially_paid", "paid"):
            self.make_booking(payment_status=status)

        counts = payment_status_counts(
            active_bookings_queryset(organisation=self.organisation_a)
        )

        self.assertEqual(counts["unpaid_count"], 1)
        self.assertEqual(counts["pending_payment_count"], 1)
        self.assertEqual(counts["deposit_paid_count"], 1)
        self.assertEqual(counts["partially_paid_count"], 1)
        self.assertEqual(counts["paid_count"], 1)

    def test_commission_summary_groups_every_status(self):
        for status, amount in (
            ("pending", "10.00"),
            ("approved", "20.00"),
            ("paid", "30.00"),
            ("cancelled", "40.00"),
        ):
            self.make_commission(status=status, amount=Decimal(amount))

        summary = commission_summary(organisation=self.organisation_a)

        self.assertEqual(summary["commission_total"], Decimal("100.00"))
        self.assertEqual(summary["commission_pending"], Decimal("10.00"))
        self.assertEqual(summary["commission_approved"], Decimal("20.00"))
        self.assertEqual(summary["commission_paid"], Decimal("30.00"))
        self.assertEqual(summary["commission_cancelled"], Decimal("40.00"))

    def test_commission_summary_returns_zeroes_when_empty(self):
        summary = commission_summary(organisation=self.organisation_b)

        self.assertTrue(all(value == Decimal("0.00") for value in summary.values()))

    def test_payment_receiver_summary_counts_confirmed_effect_flags(self):
        self.make_payment(
            amount=Decimal("25.00"),
            affects_owner_received=True,
            affects_seller_collected=False,
        )
        self.make_payment(
            amount=Decimal("40.00"),
            affects_owner_received=False,
            affects_seller_collected=True,
        )
        self.make_payment(
            amount=Decimal("99.00"),
            status="pending",
            affects_owner_received=True,
            affects_seller_collected=True,
        )

        summary = payment_receiver_summary(organisation=self.organisation_a)

        self.assertEqual(summary["payment_total_confirmed"], Decimal("65.00"))
        self.assertEqual(summary["payment_owner_received"], Decimal("25.00"))
        self.assertEqual(summary["payment_seller_collected"], Decimal("40.00"))

    def test_owner_summary_excludes_other_tenant_and_inactive_bookings(self):
        self.make_booking(total_amount=Decimal("100.00"))
        self.make_booking(status="cancelled", total_amount=Decimal("500.00"))
        self.make_booking(
            organisation=self.organisation_b,
            total_amount=Decimal("900.00"),
        )

        summary = owner_finance_summary(self.organisation_a)

        self.assertEqual(summary["bookings_count"], 1)
        self.assertEqual(summary["customer_revenue"], Decimal("100.00"))

    def test_seller_summary_excludes_other_sellers_and_tenants(self):
        self.make_booking(seller=self.seller_a, total_amount=Decimal("100.00"))
        self.make_booking(seller=self.seller_a_second, total_amount=Decimal("500.00"))
        self.make_booking(
            organisation=self.organisation_b,
            seller=self.seller_b,
            total_amount=Decimal("900.00"),
        )

        summary = seller_finance_summary(self.seller_a)

        self.assertEqual(summary["bookings_count"], 1)
        self.assertEqual(summary["customer_revenue"], Decimal("100.00"))

    def test_seller_leaderboard_orders_by_customer_revenue(self):
        self.make_booking(seller=self.seller_a, total_amount=Decimal("100.00"))
        self.make_booking(seller=self.seller_a_second, total_amount=Decimal("200.00"))

        rows = seller_leaderboard(self.organisation_a)

        self.assertEqual(
            [row["seller_id"] for row in rows],
            [self.seller_a_second.id, self.seller_a.id],
        )

    def test_seller_leaderboard_aggregates_each_seller(self):
        self.make_booking(seller=self.seller_a, total_amount=Decimal("100.00"))
        self.make_booking(seller=self.seller_a, total_amount=Decimal("50.00"))

        row = seller_leaderboard(self.organisation_a)[0]

        self.assertEqual(row["seller_name"], "Report Seller A")
        self.assertEqual(row["bookings_count"], 2)
        self.assertEqual(row["customer_revenue"], Decimal("150.00"))
        self.assertEqual(row["gross_sales"], Decimal("240.00"))

    def test_seller_leaderboard_respects_limit_and_tenant(self):
        self.make_booking(seller=self.seller_a)
        self.make_booking(seller=self.seller_a_second)
        self.make_booking(organisation=self.organisation_b, seller=self.seller_b)

        rows = seller_leaderboard(self.organisation_a, limit=1)

        self.assertEqual(len(rows), 1)
        self.assertNotEqual(rows[0]["seller_id"], self.seller_b.id)

    def test_seller_leaderboard_labels_bookings_without_seller(self):
        booking = self.make_booking(total_amount=Decimal("10.00"))
        Booking.objects.filter(pk=booking.pk).update(seller=None)

        row = seller_leaderboard(self.organisation_a)[0]

        self.assertIsNone(row["seller_id"])
        self.assertEqual(row["seller_name"], "No seller")

    def test_receivables_report_includes_due_or_unsettled_active_bookings(self):
        amount_due = self.make_booking(
            seller_due_to_company=Decimal("10.00"),
            settlement_status="settled",
        )
        pending = self.make_booking(
            seller_due_to_company=Decimal("0.00"),
            settlement_status="pending",
        )
        excluded = self.make_booking(
            seller_due_to_company=Decimal("0.00"),
            settlement_status="settled",
        )

        queryset = receivables_report(self.organisation_a)

        self.assertCountEqual(queryset, [amount_due, pending])
        self.assertNotIn(excluded, queryset)

    def test_receivables_report_excludes_inactive_and_other_tenant_bookings(self):
        included = self.make_booking(seller_due_to_company=Decimal("10.00"))
        self.make_booking(status="cancelled", seller_due_to_company=Decimal("10.00"))
        self.make_booking(
            organisation=self.organisation_b,
            seller_due_to_company=Decimal("10.00"),
        )

        self.assertEqual(list(receivables_report(self.organisation_a)), [included])

    def test_seller_receivables_report_is_seller_and_tenant_scoped(self):
        included = self.make_booking(
            seller=self.seller_a,
            seller_due_to_company=Decimal("10.00"),
        )
        self.make_booking(
            seller=self.seller_a_second,
            seller_due_to_company=Decimal("10.00"),
        )
        self.make_booking(
            organisation=self.organisation_b,
            seller=self.seller_b,
            seller_due_to_company=Decimal("10.00"),
        )

        self.assertEqual(list(seller_receivables_report(self.seller_a)), [included])

    def test_report_helpers_do_not_mutate_financial_records(self):
        booking = self.make_booking()
        payment = self.make_payment(booking=booking)
        commission = self.make_commission(booking=booking)
        before = (
            Booking.objects.count(),
            BookingPayment.objects.count(),
            SellerCommission.objects.count(),
        )

        owner_finance_summary(self.organisation_a)
        seller_finance_summary(self.seller_a)
        seller_leaderboard(self.organisation_a)
        list(receivables_report(self.organisation_a))

        self.assertEqual(
            before,
            (
                Booking.objects.count(),
                BookingPayment.objects.count(),
                SellerCommission.objects.count(),
            ),
        )
        booking.refresh_from_db()
        payment.refresh_from_db()
        commission.refresh_from_db()
