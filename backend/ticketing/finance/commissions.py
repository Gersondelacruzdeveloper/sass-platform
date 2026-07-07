"""
Seller commission management.

This module is responsible only for SellerCommission rows and seller totals.

It does not calculate booking prices.
It does not record payments.
It does not send notifications.
"""

from django.db.models import Sum

from ticketing.models import Booking, Seller, SellerCommission

from .constants import (
    ZERO,
    COMMISSION_PENDING,
    COMMISSION_PAID,
    COMMISSION_CANCELLED,
)
from .utils import money


INACTIVE_BOOKING_STATUSES = [
    "cancelled",
    "refunded",
    "no_show",
]


def recompute_seller_totals(seller):
    if not seller:
        return None

    active_bookings = Booking.objects.filter(seller=seller).exclude(
        status__in=INACTIVE_BOOKING_STATUSES
    )

    seller.total_sales_amount = (
        active_bookings.aggregate(total=Sum("total_amount"))["total"]
        or ZERO
    )

    seller.total_commission_amount = (
        SellerCommission.objects.filter(seller=seller)
        .exclude(status=COMMISSION_CANCELLED)
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    seller.total_collected_amount = (
        active_bookings.aggregate(total=Sum("seller_collected_amount"))["total"]
        or ZERO
    )

    seller.total_owed_to_company = (
        active_bookings.aggregate(total=Sum("seller_due_to_company"))["total"]
        or ZERO
    )

    update_fields = [
        "total_sales_amount",
        "total_commission_amount",
        "total_collected_amount",
        "total_owed_to_company",
        "updated_at",
    ]

    if hasattr(seller, "total_owner_net_amount"):
        seller.total_owner_net_amount = (
            active_bookings.aggregate(total=Sum("owner_net_amount"))["total"]
            or ZERO
        )
        update_fields.append("total_owner_net_amount")

    if hasattr(seller, "total_owner_received_amount"):
        seller.total_owner_received_amount = (
            active_bookings.aggregate(total=Sum("owner_received_amount"))["total"]
            or ZERO
        )
        update_fields.append("total_owner_received_amount")

    seller.save(update_fields=update_fields)

    return seller


def get_previous_seller_ids_for_booking(booking):
    return set(
        SellerCommission.objects.filter(booking=booking).values_list(
            "seller_id",
            flat=True,
        )
    )


def cancel_commissions_for_booking(booking):
    previous_seller_ids = get_previous_seller_ids_for_booking(booking)

    SellerCommission.objects.filter(booking=booking).update(
        status=COMMISSION_CANCELLED,
    )

    for seller_id in previous_seller_ids:
        recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

    return None


def sync_commission_for_booking(booking):
    """
    Create/update/cancel seller commission for a booking.

    Commission amount should already be calculated by calculator.py and stored on:

    booking.seller_commission_amount
    booking.seller_margin_percent
    """

    previous_seller_ids = get_previous_seller_ids_for_booking(booking)

    if not booking.seller:
        return cancel_commissions_for_booking(booking)

    previous_seller_ids.add(booking.seller_id)

    if booking.status in INACTIVE_BOOKING_STATUSES:
        result = cancel_commissions_for_booking(booking)

        for seller_id in previous_seller_ids:
            recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

        return result

    commission_amount = money(getattr(booking, "seller_commission_amount", ZERO))

    if commission_amount <= ZERO:
        result = cancel_commissions_for_booking(booking)

        for seller_id in previous_seller_ids:
            recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

        return result

    rate_used = money(
        getattr(booking, "seller_margin_percent", ZERO)
        or getattr(booking.seller, "default_margin_percent", ZERO)
        or getattr(booking.seller, "commission_rate", ZERO)
        or ZERO
    )

    existing = SellerCommission.objects.filter(
        booking=booking,
        seller=booking.seller,
    ).first()

    status = COMMISSION_PENDING

    if existing and existing.status == COMMISSION_PAID:
        status = COMMISSION_PAID

    commission, _ = SellerCommission.objects.update_or_create(
        organisation=booking.organisation,
        seller=booking.seller,
        booking=booking,
        defaults={
            "amount": commission_amount,
            "rate_used": rate_used,
            "status": status,
            "note": "Automatically synced by booking finance engine.",
        },
    )

    for seller_id in previous_seller_ids:
        recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

    return commission


def mark_commission_paid(commission, paid_by=None):
    commission.status = COMMISSION_PAID
    commission.paid_at = commission.paid_at or None
    commission.paid_by = paid_by or commission.paid_by
    commission.save(
        update_fields=[
            "status",
            "paid_at",
            "paid_by",
        ]
    )

    booking = commission.booking

    if hasattr(booking, "commission_paid_amount"):
        booking.commission_paid_amount = commission.amount
        booking.save(update_fields=["commission_paid_amount", "updated_at"])

    recompute_seller_totals(commission.seller)

    return commission


def sync_all_commissions_for_seller(seller):
    if not seller:
        return []

    commissions = []

    bookings = Booking.objects.filter(seller=seller)

    for booking in bookings:
        commission = sync_commission_for_booking(booking)

        if commission:
            commissions.append(commission)

    recompute_seller_totals(seller)

    return commissions