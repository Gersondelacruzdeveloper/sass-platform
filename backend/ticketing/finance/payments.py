"""
Payment posting helpers.

This module creates BookingPayment rows and then asks the finance calculator
to recompute the booking.

It does not calculate prices directly.
It does not calculate commissions directly.
"""

from django.db import transaction
from django.utils import timezone

from ticketing.models import BookingPayment, Seller

from .constants import (
    ZERO,
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_SELLER,
    PAYMENT_RECEIVER_STRIPE,
    PAYMENT_RECEIVER_PAYPAL,
    PAYMENT_RECEIVER_BANK,
    PAYMENT_TYPE_DEPOSIT,
    PAYMENT_TYPE_FULL,
    PAYMENT_TYPE_BALANCE,
    PAYMENT_TYPE_REFUND,
    PAYMENT_TYPE_SETTLEMENT,
    PAYER_CUSTOMER,
    PAYER_SELLER,
    SETTLEMENT_PENDING,
    SETTLEMENT_SETTLED,
)
from .utils import money


def receiver_for_method(method="", provider="", seller=None):
    method = str(method or "").lower()
    provider = str(provider or "").lower()

    if seller:
        return PAYMENT_RECEIVER_SELLER

    if provider == "stripe" or method == "stripe":
        return PAYMENT_RECEIVER_STRIPE

    if provider == "paypal" or method == "paypal":
        return PAYMENT_RECEIVER_PAYPAL

    if method == "bank_transfer":
        return PAYMENT_RECEIVER_BANK

    if method == "cash":
        return PAYMENT_RECEIVER_SELLER if seller else PAYMENT_RECEIVER_OWNER

    return PAYMENT_RECEIVER_OWNER


def receiver_affects_owner(receiver):
    return receiver in {
        PAYMENT_RECEIVER_OWNER,
        PAYMENT_RECEIVER_STRIPE,
        PAYMENT_RECEIVER_PAYPAL,
        PAYMENT_RECEIVER_BANK,
    }


def receiver_affects_seller(receiver):
    return receiver == PAYMENT_RECEIVER_SELLER


def apply_payment_finance_flags(payment, receiver=None):
    receiver = receiver or receiver_for_method(
        method=payment.method,
        provider=payment.provider,
        seller=payment.seller,
    )

    if hasattr(payment, "collected_by_party"):
        payment.collected_by_party = receiver

    if hasattr(payment, "affects_owner_received"):
        payment.affects_owner_received = receiver_affects_owner(receiver)

    if hasattr(payment, "affects_seller_collected"):
        payment.affects_seller_collected = receiver_affects_seller(receiver)

    if hasattr(payment, "settlement_status"):
        payment.settlement_status = (
            SETTLEMENT_PENDING
            if receiver == PAYMENT_RECEIVER_SELLER
            else SETTLEMENT_SETTLED
        )

    return payment


@transaction.atomic
def record_payment(
    booking,
    amount,
    payment_type,
    payer_type=PAYER_CUSTOMER,
    method="cash",
    status="confirmed",
    seller=None,
    collected_by=None,
    provider="",
    provider_payment_id="",
    provider_checkout_id="",
    provider_order_id="",
    provider_capture_id="",
    provider_status="",
    provider_response=None,
    reference="",
    note="",
    collected_by_party=None,
):
    from .calculator import recalculate_booking
    from .commissions import sync_commission_for_booking, recompute_seller_totals

    amount = money(amount)

    if amount <= ZERO:
        raise ValueError("Payment amount must be greater than zero.")

    receiver = collected_by_party or receiver_for_method(
        method=method,
        provider=provider,
        seller=seller,
    )

    payment = BookingPayment(
        booking=booking,
        seller=seller,
        collected_by=collected_by,
        amount=amount,
        payment_type=payment_type,
        payer_type=payer_type,
        method=method,
        status=status,
        provider=provider,
        provider_payment_id=provider_payment_id,
        provider_checkout_id=provider_checkout_id,
        provider_order_id=provider_order_id,
        provider_capture_id=provider_capture_id,
        provider_status=provider_status,
        provider_response=provider_response or {},
        reference=reference,
        note=note,
        paid_at=timezone.now(),
    )

    apply_payment_finance_flags(payment, receiver=receiver)
    payment.save()

    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    return payment, booking


@transaction.atomic
def record_customer_payment(
    booking,
    amount,
    payment_type=PAYMENT_TYPE_FULL,
    method="cash",
    seller=None,
    collected_by=None,
    provider="",
    reference="",
    note="Customer payment recorded.",
    collected_by_party=None,
):
    return record_payment(
        booking=booking,
        amount=amount,
        payment_type=payment_type,
        payer_type=PAYER_CUSTOMER,
        method=method,
        seller=seller,
        collected_by=collected_by,
        provider=provider,
        reference=reference,
        note=note,
        collected_by_party=collected_by_party,
    )


@transaction.atomic
def record_customer_deposit(
    booking,
    amount,
    method="cash",
    seller=None,
    collected_by=None,
    provider="",
    reference="",
    note="Customer deposit recorded.",
    collected_by_party=None,
):
    return record_customer_payment(
        booking=booking,
        amount=amount,
        payment_type=PAYMENT_TYPE_DEPOSIT,
        method=method,
        seller=seller,
        collected_by=collected_by,
        provider=provider,
        reference=reference,
        note=note,
        collected_by_party=collected_by_party,
    )


@transaction.atomic
def record_customer_full_payment(
    booking,
    amount,
    method="cash",
    seller=None,
    collected_by=None,
    provider="",
    reference="",
    note="Customer full payment recorded.",
    collected_by_party=None,
):
    return record_customer_payment(
        booking=booking,
        amount=amount,
        payment_type=PAYMENT_TYPE_FULL,
        method=method,
        seller=seller,
        collected_by=collected_by,
        provider=provider,
        reference=reference,
        note=note,
        collected_by_party=collected_by_party,
    )


@transaction.atomic
def record_customer_balance_payment(
    booking,
    amount,
    method="cash",
    seller=None,
    collected_by=None,
    provider="",
    reference="",
    note="Customer balance payment recorded.",
    collected_by_party=None,
):
    return record_customer_payment(
        booking=booking,
        amount=amount,
        payment_type=PAYMENT_TYPE_BALANCE,
        method=method,
        seller=seller,
        collected_by=collected_by,
        provider=provider,
        reference=reference,
        note=note,
        collected_by_party=collected_by_party,
    )


@transaction.atomic
def record_refund(
    booking,
    amount,
    method="cash",
    seller=None,
    collected_by=None,
    provider="",
    reference="",
    note="Refund recorded.",
    collected_by_party=None,
):
    return record_payment(
        booking=booking,
        amount=amount,
        payment_type=PAYMENT_TYPE_REFUND,
        payer_type=PAYER_CUSTOMER,
        method=method,
        seller=seller,
        collected_by=collected_by,
        provider=provider,
        reference=reference,
        note=note,
        collected_by_party=collected_by_party,
    )


@transaction.atomic
def record_seller_settlement_payment(
    booking,
    amount,
    collected_by=None,
    method="bank_transfer",
    reference="",
    note="Seller settlement payment recorded.",
):
    return record_payment(
        booking=booking,
        amount=amount,
        payment_type=PAYMENT_TYPE_SETTLEMENT,
        payer_type=PAYER_SELLER,
        method=method,
        seller=getattr(booking, "seller", None),
        collected_by=collected_by,
        reference=reference,
        note=note,
        collected_by_party=PAYMENT_RECEIVER_BANK,
    )


@transaction.atomic
def mark_provider_payment_confirmed(
    booking,
    amount,
    provider,
    payment_type,
    provider_payment_id="",
    provider_checkout_id="",
    provider_order_id="",
    provider_capture_id="",
    provider_status="",
    provider_response=None,
):
    """
    Idempotent-ish online provider confirmation.

    Used by Stripe/PayPal callbacks.
    """

    from .calculator import recalculate_booking
    from .commissions import sync_commission_for_booking, recompute_seller_totals

    lookup = {
        "booking": booking,
        "provider": provider,
    }

    if provider_checkout_id:
        lookup["provider_checkout_id"] = provider_checkout_id
    elif provider_order_id:
        lookup["provider_order_id"] = provider_order_id
    elif provider_payment_id:
        lookup["provider_payment_id"] = provider_payment_id
    elif provider_capture_id:
        lookup["provider_capture_id"] = provider_capture_id

    reference = (
        provider_payment_id
        or provider_order_id
        or provider_capture_id
        or provider_checkout_id
    )

    receiver = receiver_for_method(
        method=provider,
        provider=provider,
        seller=None,
    )

    payment, _ = BookingPayment.objects.get_or_create(
        **lookup,
        defaults={
            "amount": money(amount),
            "payment_type": payment_type,
            "payer_type": PAYER_CUSTOMER,
            "method": provider,
            "status": "confirmed",
            "reference": reference,
            "note": f"{provider.title()} payment confirmed.",
            "provider_payment_id": provider_payment_id,
            "provider_checkout_id": provider_checkout_id,
            "provider_order_id": provider_order_id,
            "provider_capture_id": provider_capture_id,
            "provider_status": provider_status,
            "provider_response": provider_response or {},
            "paid_at": timezone.now(),
        },
    )

    payment.amount = money(amount)
    payment.payment_type = payment_type
    payment.payer_type = PAYER_CUSTOMER
    payment.method = provider
    payment.status = "confirmed"
    payment.reference = reference
    payment.note = f"{provider.title()} payment confirmed."
    payment.provider_payment_id = provider_payment_id or payment.provider_payment_id
    payment.provider_checkout_id = provider_checkout_id or payment.provider_checkout_id
    payment.provider_order_id = provider_order_id or payment.provider_order_id
    payment.provider_capture_id = provider_capture_id or payment.provider_capture_id
    payment.provider_status = provider_status
    payment.provider_response = provider_response or {}
    payment.paid_at = timezone.now()

    apply_payment_finance_flags(payment, receiver=receiver)
    payment.save()

    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    return payment, booking