"""
Seller settlement management.

This module answers one question:

Has the company/owner actually received the money it is owed?

It does not calculate pricing.
It does not calculate commissions.
It does not create customer payments.
"""

from django.utils import timezone

from .constants import (
    ZERO,
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_BANK,
    PAYMENT_TYPE_SETTLEMENT,
    PAYER_SELLER,
    SETTLEMENT_PENDING,
    SETTLEMENT_PARTIALLY_SETTLED,
    SETTLEMENT_SETTLED,
)
from .utils import money, remaining_balance


def calculate_seller_due_to_company(booking):
    return max(
        money(getattr(booking, "seller_collected_amount", ZERO))
        - money(getattr(booking, "seller_commission_amount", ZERO)),
        ZERO,
    )


def calculate_owner_remaining_amount(booking):
    return remaining_balance(
        getattr(booking, "owner_net_amount", ZERO),
        getattr(booking, "owner_received_amount", ZERO),
    )


def resolve_settlement_status(booking):
    owner_net = money(getattr(booking, "owner_net_amount", ZERO))
    owner_received = money(getattr(booking, "owner_received_amount", ZERO))
    seller_due = money(getattr(booking, "seller_due_to_company", ZERO))

    if owner_net <= ZERO:
        return SETTLEMENT_SETTLED

    if seller_due <= ZERO and owner_received >= owner_net:
        return SETTLEMENT_SETTLED

    if owner_received > ZERO:
        return SETTLEMENT_PARTIALLY_SETTLED

    return SETTLEMENT_PENDING


def apply_settlement_status(booking):
    if hasattr(booking, "seller_due_to_company"):
        booking.seller_due_to_company = calculate_seller_due_to_company(booking)

    if hasattr(booking, "settlement_status"):
        booking.settlement_status = resolve_settlement_status(booking)

    update_fields = ["updated_at"]

    if hasattr(booking, "seller_due_to_company"):
        update_fields.append("seller_due_to_company")

    if hasattr(booking, "settlement_status"):
        update_fields.append("settlement_status")

    booking.save(update_fields=update_fields)

    return booking


def record_seller_settlement(
    booking,
    amount,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller settlement received.",
):
    """
    Seller pays the company/owner money that was previously collected from customer.

    This creates a BookingPayment where:
    - payer_type = seller
    - payment_type = settlement
    - receiver = owner/bank
    - affects_owner_received = True
    - affects_seller_collected = False
    """

    from ticketing.models import BookingPayment
    from .calculator import recalculate_booking
    from .commissions import recompute_seller_totals

    payment = BookingPayment.objects.create(
        booking=booking,
        seller=getattr(booking, "seller", None),
        collected_by=collected_by,
        amount=money(amount),
        payment_type=PAYMENT_TYPE_SETTLEMENT,
        payer_type=PAYER_SELLER,
        method=method,
        status="confirmed",
        reference=reference,
        note=note,
        paid_at=timezone.now(),
    )

    if hasattr(payment, "collected_by_party"):
        payment.collected_by_party = (
            PAYMENT_RECEIVER_BANK
            if method == PAYMENT_RECEIVER_BANK
            else PAYMENT_RECEIVER_OWNER
        )

    if hasattr(payment, "affects_owner_received"):
        payment.affects_owner_received = True

    if hasattr(payment, "affects_seller_collected"):
        payment.affects_seller_collected = False

    if hasattr(payment, "settlement_status"):
        payment.settlement_status = SETTLEMENT_SETTLED

    payment.save()

    booking = recalculate_booking(booking)
    apply_settlement_status(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    return payment, booking


def settle_booking_fully(
    booking,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller settled full amount owed to company.",
):
    amount_due = calculate_seller_due_to_company(booking)

    if amount_due <= ZERO:
        apply_settlement_status(booking)
        return None, booking

    return record_seller_settlement(
        booking=booking,
        amount=amount_due,
        collected_by=collected_by,
        method=method,
        reference=reference,
        note=note,
    )


def settle_booking_partially(
    booking,
    amount,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller partially settled amount owed to company.",
):
    amount = money(amount)

    if amount <= ZERO:
        return None, booking

    return record_seller_settlement(
        booking=booking,
        amount=amount,
        collected_by=collected_by,
        method=method,
        reference=reference,
        note=note,
    )