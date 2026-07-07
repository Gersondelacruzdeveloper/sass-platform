"""
Finance reporting helpers.

This module powers dashboards and reports.

It should not mutate data.
It should not create payments.
It should not calculate booking pricing from scratch.

It only aggregates already-calculated booking/payment/commission fields.
"""

from django.db.models import Count, Q, Sum

from ticketing.models import Booking, BookingPayment, SellerCommission

from .constants import (
    ZERO,
    SETTLEMENT_PENDING,
    SETTLEMENT_PARTIALLY_SETTLED,
    SETTLEMENT_SETTLED,
    COMMISSION_PENDING,
    COMMISSION_APPROVED,
    COMMISSION_PAID,
    COMMISSION_CANCELLED,
)
from .utils import money


INACTIVE_BOOKING_STATUSES = [
    "cancelled",
    "refunded",
    "no_show",
]


def safe_total(value):
    return money(value or ZERO)


def active_bookings_queryset(organisation=None, seller=None):
    queryset = Booking.objects.exclude(status__in=INACTIVE_BOOKING_STATUSES)

    if organisation:
        queryset = queryset.filter(organisation=organisation)

    if seller:
        queryset = queryset.filter(seller=seller)

    return queryset


def payments_queryset(organisation=None, seller=None):
    queryset = BookingPayment.objects.filter(status="confirmed")

    if organisation:
        queryset = queryset.filter(booking__organisation=organisation)

    if seller:
        queryset = queryset.filter(Q(seller=seller) | Q(booking__seller=seller)).distinct()

    return queryset


def commissions_queryset(organisation=None, seller=None):
    queryset = SellerCommission.objects.exclude(status=COMMISSION_CANCELLED)

    if organisation:
        queryset = queryset.filter(organisation=organisation)

    if seller:
        queryset = queryset.filter(seller=seller)

    return queryset


def aggregate_booking_totals(queryset):
    data = queryset.aggregate(
        bookings_count=Count("id"),
        gross_sales=Sum("original_price"),
        customer_revenue=Sum("total_amount"),
        customer_discounts=Sum("customer_discount_amount"),
        seller_commissions=Sum("seller_commission_amount"),
        owner_net=Sum("owner_net_amount"),
        owner_received=Sum("owner_received_amount"),
        seller_collected=Sum("seller_collected_amount"),
        seller_due_to_company=Sum("seller_due_to_company"),
        deposit_paid=Sum("deposit_paid"),
        balance_due=Sum("balance_due"),
    )

    return {
        "bookings_count": data["bookings_count"] or 0,
        "gross_sales": safe_total(data["gross_sales"]),
        "customer_revenue": safe_total(data["customer_revenue"]),
        "customer_discounts": safe_total(data["customer_discounts"]),
        "seller_commissions": safe_total(data["seller_commissions"]),
        "owner_net": safe_total(data["owner_net"]),
        "owner_received": safe_total(data["owner_received"]),
        "owner_pending": max(
            safe_total(data["owner_net"]) - safe_total(data["owner_received"]),
            ZERO,
        ),
        "seller_collected": safe_total(data["seller_collected"]),
        "seller_due_to_company": safe_total(data["seller_due_to_company"]),
        "deposit_paid": safe_total(data["deposit_paid"]),
        "balance_due": safe_total(data["balance_due"]),
    }


def settlement_counts(queryset):
    return {
        "settlement_pending_count": queryset.filter(
            settlement_status=SETTLEMENT_PENDING,
        ).count(),
        "settlement_partially_settled_count": queryset.filter(
            settlement_status=SETTLEMENT_PARTIALLY_SETTLED,
        ).count(),
        "settlement_settled_count": queryset.filter(
            settlement_status=SETTLEMENT_SETTLED,
        ).count(),
    }


def payment_status_counts(queryset):
    return {
        "unpaid_count": queryset.filter(payment_status="unpaid").count(),
        "pending_payment_count": queryset.filter(payment_status="pending").count(),
        "deposit_paid_count": queryset.filter(payment_status="deposit_paid").count(),
        "partially_paid_count": queryset.filter(
            Q(payment_status="partially_paid") | Q(payment_status="partial")
        ).count(),
        "paid_count": queryset.filter(payment_status="paid").count(),
    }


def commission_summary(organisation=None, seller=None):
    queryset = SellerCommission.objects.all()

    if organisation:
        queryset = queryset.filter(organisation=organisation)

    if seller:
        queryset = queryset.filter(seller=seller)

    data = queryset.aggregate(
        total=Sum("amount"),
        pending=Sum("amount", filter=Q(status=COMMISSION_PENDING)),
        approved=Sum("amount", filter=Q(status=COMMISSION_APPROVED)),
        paid=Sum("amount", filter=Q(status=COMMISSION_PAID)),
        cancelled=Sum("amount", filter=Q(status=COMMISSION_CANCELLED)),
    )

    return {
        "commission_total": safe_total(data["total"]),
        "commission_pending": safe_total(data["pending"]),
        "commission_approved": safe_total(data["approved"]),
        "commission_paid": safe_total(data["paid"]),
        "commission_cancelled": safe_total(data["cancelled"]),
    }


def payment_receiver_summary(organisation=None, seller=None):
    queryset = payments_queryset(organisation=organisation, seller=seller)

    data = queryset.aggregate(
        total_confirmed=Sum("amount"),
        owner_received=Sum(
            "amount",
            filter=Q(affects_owner_received=True),
        ),
        seller_collected=Sum(
            "amount",
            filter=Q(affects_seller_collected=True),
        ),
    )

    return {
        "payment_total_confirmed": safe_total(data["total_confirmed"]),
        "payment_owner_received": safe_total(data["owner_received"]),
        "payment_seller_collected": safe_total(data["seller_collected"]),
    }


def owner_finance_summary(organisation):
    bookings = active_bookings_queryset(organisation=organisation)

    summary = {}
    summary.update(aggregate_booking_totals(bookings))
    summary.update(settlement_counts(bookings))
    summary.update(payment_status_counts(bookings))
    summary.update(commission_summary(organisation=organisation))
    summary.update(payment_receiver_summary(organisation=organisation))

    return summary


def seller_finance_summary(seller):
    bookings = active_bookings_queryset(
        organisation=seller.organisation,
        seller=seller,
    )

    summary = {}
    summary.update(aggregate_booking_totals(bookings))
    summary.update(settlement_counts(bookings))
    summary.update(payment_status_counts(bookings))
    summary.update(
        commission_summary(
            organisation=seller.organisation,
            seller=seller,
        )
    )
    summary.update(
        payment_receiver_summary(
            organisation=seller.organisation,
            seller=seller,
        )
    )

    return summary


def seller_leaderboard(organisation, limit=20):
    bookings = active_bookings_queryset(organisation=organisation)

    rows = (
        bookings.values(
            "seller_id",
            "seller__full_name",
        )
        .annotate(
            bookings_count=Count("id"),
            gross_sales=Sum("original_price"),
            customer_revenue=Sum("total_amount"),
            seller_commissions=Sum("seller_commission_amount"),
            seller_collected=Sum("seller_collected_amount"),
            seller_due_to_company=Sum("seller_due_to_company"),
            owner_net=Sum("owner_net_amount"),
            owner_received=Sum("owner_received_amount"),
        )
        .order_by("-customer_revenue")[:limit]
    )

    return [
        {
            "seller_id": row["seller_id"],
            "seller_name": row["seller__full_name"] or "No seller",
            "bookings_count": row["bookings_count"] or 0,
            "gross_sales": safe_total(row["gross_sales"]),
            "customer_revenue": safe_total(row["customer_revenue"]),
            "seller_commissions": safe_total(row["seller_commissions"]),
            "seller_collected": safe_total(row["seller_collected"]),
            "seller_due_to_company": safe_total(row["seller_due_to_company"]),
            "owner_net": safe_total(row["owner_net"]),
            "owner_received": safe_total(row["owner_received"]),
        }
        for row in rows
    ]


def receivables_report(organisation):
    queryset = active_bookings_queryset(organisation=organisation).filter(
        Q(seller_due_to_company__gt=ZERO)
        | Q(settlement_status__in=[
            SETTLEMENT_PENDING,
            SETTLEMENT_PARTIALLY_SETTLED,
        ])
    )

    return queryset.select_related(
        "seller",
        "customer",
        "primary_product",
    ).order_by("-created_at")


def seller_receivables_report(seller):
    queryset = active_bookings_queryset(
        organisation=seller.organisation,
        seller=seller,
    ).filter(
        Q(seller_due_to_company__gt=ZERO)
        | Q(settlement_status__in=[
            SETTLEMENT_PENDING,
            SETTLEMENT_PARTIALLY_SETTLED,
        ])
    )

    return queryset.select_related(
        "seller",
        "customer",
        "primary_product",
    ).order_by("-created_at")