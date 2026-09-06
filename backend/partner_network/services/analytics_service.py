from __future__ import annotations

from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone

from partner_network.models import (
    ReferralBalanceAdjustment,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralPayout,
    ReferralQRScan,
    ReferralSession,
)

ZERO = Decimal("0.00")


def _outstanding_adjustments(partner):
    adjustments = ReferralBalanceAdjustment.objects.filter(partner=partner)
    total = ZERO
    for adjustment in adjustments:
        reserved = (
            adjustment.payout_lines.exclude(payout__status=ReferralPayout.STATUS_CANCELLED)
            .aggregate(total=Sum("amount"))["total"]
            or ZERO
        )
        total += max(adjustment.amount - reserved, ZERO)
    return total


def partner_dashboard_metrics(partner):
    now = timezone.now()
    scans_qs = ReferralQRScan.objects.filter(qr_code__partner_location__partner=partner)
    scans = scans_qs.count()
    sessions = ReferralSession.objects.filter(partner=partner).count()
    attributions = ReferralBookingAttribution.objects.filter(partner=partner)
    bookings = attributions.count()
    gross_sales = attributions.aggregate(total=Sum("booking__total_amount"))["total"] or ZERO
    commissions = ReferralCommission.objects.filter(partner=partner)
    pending = commissions.filter(status="pending").aggregate(total=Sum("amount"))["total"] or ZERO
    earned = commissions.filter(status__in=["earned", "payable"]).aggregate(total=Sum("amount"))["total"] or ZERO

    paid_payouts = ReferralPayout.objects.filter(partner=partner, status=ReferralPayout.STATUS_PAID)
    paid = paid_payouts.aggregate(total=Sum("total_amount"))["total"] or ZERO
    this_month = paid_payouts.filter(
        paid_at__year=now.year,
        paid_at__month=now.month,
    ).aggregate(total=Sum("total_amount"))["total"] or ZERO

    conversion_rate = (Decimal(bookings) / Decimal(scans) * Decimal("100")) if scans else ZERO
    outstanding_adjustments = _outstanding_adjustments(partner)
    return {
        "qr_scans": scans,
        "referral_sessions": sessions,
        "bookings": bookings,
        "gross_sales": gross_sales,
        "pending_earnings": pending,
        "earned_earnings": earned,
        "paid_earnings": paid,
        "this_month_paid": this_month,
        "lifetime_earnings": paid + earned,
        "outstanding_adjustments": outstanding_adjustments,
        "conversion_rate": conversion_rate.quantize(Decimal("0.01")),
    }


def network_dashboard_metrics(organisation):
    partners = organisation.referral_partners.all()
    attributions = ReferralBookingAttribution.objects.filter(booking__organisation=organisation)
    scans = ReferralQRScan.objects.filter(qr_code__partner_location__partner__organisation=organisation)
    sessions = ReferralSession.objects.filter(organisation=organisation)
    commissions = ReferralCommission.objects.filter(organisation=organisation)
    paid_payouts = ReferralPayout.objects.filter(
        organisation=organisation,
        status=ReferralPayout.STATUS_PAID,
    )

    gross_sales = attributions.aggregate(total=Sum("booking__total_amount"))["total"] or ZERO
    referral_commissions = commissions.exclude(status=ReferralCommission.STATUS_REVERSED).aggregate(
        total=Sum("amount")
    )["total"] or ZERO
    paid_out = paid_payouts.aggregate(total=Sum("total_amount"))["total"] or ZERO
    scan_count = scans.count()
    booking_count = attributions.count()

    top_partners = list(
        attributions.values("partner_id", "partner__name")
        .annotate(bookings=Count("id"), sales=Sum("booking__total_amount"))
        .order_by("-sales", "-bookings")[:10]
    )
    top_properties = list(
        attributions.values("partner_location_id", "partner_location__display_name", "partner__name")
        .annotate(bookings=Count("id"), sales=Sum("booking__total_amount"))
        .order_by("-sales", "-bookings")[:10]
    )
    top_products = list(
        commissions.exclude(booking_item__isnull=True)
        .values("booking_item__product_id", "booking_item__product__name")
        .annotate(bookings=Count("booking_id", distinct=True), commissions=Sum("amount"))
        .order_by("-bookings")[:10]
    )

    return {
        "partners": partners.count(),
        "active_partners": partners.filter(status="active").count(),
        "qr_scans": scan_count,
        "referral_sessions": sessions.count(),
        "bookings": booking_count,
        "gross_sales": gross_sales,
        "commissions_generated": referral_commissions,
        "paid_out": paid_out,
        "conversion_rate": (
            Decimal(booking_count) / Decimal(scan_count) * Decimal("100") if scan_count else ZERO
        ).quantize(Decimal("0.01")),
        "top_partners": top_partners,
        "top_properties": top_properties,
        "top_products": top_products,
    }
