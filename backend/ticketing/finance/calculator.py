"""
Booking finance calculator.

This module reads booking/items/payments and updates booking financial fields.

It should not create payments.
It should not create commissions.
It should not send notifications.

It only calculates and stores the current financial truth for a booking.
"""

from decimal import Decimal

from django.utils import timezone

from .constants import (
    ZERO,
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_SELLER,
    PAYMENT_RECEIVER_STRIPE,
    PAYMENT_RECEIVER_PAYPAL,
    PAYMENT_RECEIVER_BANK,
    BOOKING_PAYMENT_UNPAID,
    BOOKING_PAYMENT_PARTIAL,
    BOOKING_PAYMENT_DEPOSIT,
    BOOKING_PAYMENT_PAID,
    BOOKING_PAYMENT_REFUNDED,
    SETTLEMENT_PENDING,
    SETTLEMENT_PARTIALLY_SETTLED,
    SETTLEMENT_SETTLED,
)
from .pricing import calculate_pricing
from .utils import (
    money,
    round_money,
    percentage_amount,
    remaining_balance,
    paid_in_full,
    deposit_met,
    seller_amount_owed_to_company,
    owner_amount_remaining,
)


OWNER_RECEIVERS = {
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_STRIPE,
    PAYMENT_RECEIVER_PAYPAL,
    PAYMENT_RECEIVER_BANK,
}

SELLER_RECEIVERS = {
    PAYMENT_RECEIVER_SELLER,
}

def get_booking_original_price(booking):
    """
    Return the retail/original booking price.

    Booking items are the source of truth because unit_price is always
    stored at the retail price.
    """

    item_total = ZERO

    try:
        for item in booking.items.all():
            quantity = money(getattr(item, "quantity", 1) or 1)

            original_unit_price = money(
                getattr(item, "original_unit_price", ZERO)
                or getattr(item, "unit_price", ZERO)
                or ZERO
            )

            if original_unit_price > ZERO:
                item_total += original_unit_price * quantity
            else:
                item_total += money(
                    getattr(item, "original_total", ZERO)
                    or getattr(item, "subtotal", ZERO)
                    or getattr(item, "total", ZERO)
                    or ZERO
                )
    except Exception:
        item_total = ZERO

    if item_total > ZERO:
        return round_money(item_total)

    booking_original_price = money(
        getattr(booking, "original_price", ZERO)
    )

    if booking_original_price > ZERO:
        return round_money(booking_original_price)

    booking_subtotal = money(
        getattr(booking, "subtotal_amount", ZERO)
    )

    if booking_subtotal > ZERO:
        return round_money(booking_subtotal)

    return ZERO



def get_booking_customer_discount_percent(booking):
    discount_percent = money(getattr(booking, "customer_discount_percent", ZERO))

    if discount_percent > ZERO:
        return discount_percent

    original_price = get_booking_original_price(booking)

    if original_price <= ZERO:
        return ZERO

    discount_amount = money(
        getattr(booking, "customer_discount_amount", ZERO)
        or getattr(booking, "discount_amount", ZERO)
        or ZERO
    )

    if discount_amount <= ZERO:
        return ZERO

    return round_money((discount_amount / original_price) * Decimal("100.00"))


def get_payment_receiver(payment):
    """
    Resolve who actually received the payment.

    New field:
    - collected_by_party

    Fallback:
    - seller on payment means seller received it
    - stripe/paypal means provider/owner received it
    - bank_transfer means bank/owner received it
    """

    explicit_receiver = getattr(payment, "collected_by_party", None)

    if explicit_receiver:
        return explicit_receiver

    method = str(getattr(payment, "method", "") or "").lower()
    provider = str(getattr(payment, "provider", "") or "").lower()

    if getattr(payment, "seller", None):
        return PAYMENT_RECEIVER_SELLER

    if provider == "stripe" or method == "stripe":
        return PAYMENT_RECEIVER_STRIPE

    if provider == "paypal" or method == "paypal":
        return PAYMENT_RECEIVER_PAYPAL

    if method == "bank_transfer":
        return PAYMENT_RECEIVER_BANK

    return PAYMENT_RECEIVER_OWNER


def payment_affects_owner_received(payment):
    explicit = getattr(payment, "affects_owner_received", None)

    if explicit is not None:
        return bool(explicit)

    receiver = get_payment_receiver(payment)
    return receiver in OWNER_RECEIVERS


def payment_affects_seller_collected(payment):
    explicit = getattr(payment, "affects_seller_collected", None)

    if explicit is not None:
        return bool(explicit)

    receiver = get_payment_receiver(payment)
    return receiver in SELLER_RECEIVERS


def calculate_confirmed_payments(booking):
    """
    Calculate payment totals from confirmed booking payments.
    """

    owner_received = ZERO
    seller_collected = ZERO
    customer_paid_total = ZERO
    refunded_total = ZERO

    try:
        confirmed_payments = booking.payments.filter(status="confirmed")
    except Exception:
        confirmed_payments = []

    for payment in confirmed_payments:
        amount = money(payment.amount)

        if payment.payment_type == "refund":
            refunded_total += amount

            if payment_affects_owner_received(payment):
                owner_received -= amount

            if payment_affects_seller_collected(payment):
                seller_collected -= amount

            customer_paid_total -= amount
            continue

        customer_paid_total += amount

        if payment_affects_owner_received(payment):
            owner_received += amount

        if payment_affects_seller_collected(payment):
            seller_collected += amount

    return {
        "owner_received_amount": max(round_money(owner_received), ZERO),
        "seller_collected_amount": max(round_money(seller_collected), ZERO),
        "customer_paid_total": max(round_money(customer_paid_total), ZERO),
        "refunded_total": round_money(refunded_total),
    }


def calculate_deposit_required(booking, customer_final_price):
    current_required = money(getattr(booking, "deposit_required", ZERO))

    if current_required > ZERO:
        return current_required

    product = getattr(booking, "primary_product", None)

    if product:
        deposit_amount = money(getattr(product, "deposit_amount", ZERO))

        if deposit_amount > ZERO:
            return min(deposit_amount, money(customer_final_price))

        deposit_percentage = money(getattr(product, "deposit_percentage", ZERO))

        if deposit_percentage > ZERO:
            return percentage_amount(customer_final_price, deposit_percentage)

    return ZERO


def calculate_settlement_status(owner_net_amount, owner_received_amount, seller_due_to_company):
    owner_net_amount = money(owner_net_amount)
    owner_received_amount = money(owner_received_amount)
    seller_due_to_company = money(seller_due_to_company)

    if owner_net_amount <= ZERO:
        return SETTLEMENT_SETTLED

    if seller_due_to_company <= ZERO and owner_received_amount >= owner_net_amount:
        return SETTLEMENT_SETTLED

    if owner_received_amount > ZERO:
        return SETTLEMENT_PARTIALLY_SETTLED

    return SETTLEMENT_PENDING


def calculate_booking_financial_snapshot(booking):
    """
    Return a complete booking financial snapshot without saving.
    """

    original_price = get_booking_original_price(booking)
    seller_margin_percent = get_booking_seller_margin_percent(booking)
    customer_discount_percent = get_booking_customer_discount_percent(booking)

    pricing = calculate_pricing(
        original_price=original_price,
        seller_margin_percent=seller_margin_percent,
        customer_discount_percent=customer_discount_percent,
    )

    payments = calculate_confirmed_payments(booking)

    customer_final_price = money(pricing["customer_final_price"])
    seller_commission_amount = money(pricing["seller_commission_amount"])
    owner_net_amount = money(pricing["owner_net_amount"])

    owner_received_amount = money(payments["owner_received_amount"])
    seller_collected_amount = money(payments["seller_collected_amount"])
    customer_paid_total = money(payments["customer_paid_total"])

    deposit_required = calculate_deposit_required(
        booking=booking,
        customer_final_price=customer_final_price,
    )

    balance_due = remaining_balance(
        customer_final_price,
        customer_paid_total,
    )

    seller_due_to_company = seller_amount_owed_to_company(
        seller_collected=seller_collected_amount,
        seller_commission=seller_commission_amount,
    )

    owner_remaining = owner_amount_remaining(
        owner_expected=owner_net_amount,
        owner_received=owner_received_amount,
    )

    settlement_status = calculate_settlement_status(
        owner_net_amount=owner_net_amount,
        owner_received_amount=owner_received_amount,
        seller_due_to_company=seller_due_to_company,
    )

    if payments["refunded_total"] > ZERO and customer_paid_total <= ZERO:
        payment_status = BOOKING_PAYMENT_REFUNDED
    elif paid_in_full(customer_final_price, customer_paid_total) and customer_final_price > ZERO:
        payment_status = BOOKING_PAYMENT_PAID
    elif deposit_met(deposit_required, customer_paid_total):
        payment_status = BOOKING_PAYMENT_DEPOSIT
    elif customer_paid_total > ZERO:
        payment_status = BOOKING_PAYMENT_PARTIAL
    else:
        payment_status = BOOKING_PAYMENT_UNPAID

    return {
        "original_price": pricing["original_price"],
        "subtotal_amount": pricing["original_price"],
        "seller_margin_percent": pricing["seller_margin_percent"],
        "customer_discount_percent": pricing["customer_discount_percent"],
        "customer_discount_amount": pricing["customer_discount_amount"],
        "discount_amount": pricing["customer_discount_amount"],
        "total_amount": pricing["customer_final_price"],
        "seller_commission_amount": seller_commission_amount,
        "owner_net_amount": owner_net_amount,
        "owner_received_amount": owner_received_amount,
        "seller_collected_amount": seller_collected_amount,
        "seller_due_to_company": seller_due_to_company,
        "owner_remaining_amount": owner_remaining,
        "deposit_required": deposit_required,
        "deposit_paid": customer_paid_total,
        "balance_due": balance_due,
        "payment_status": payment_status,
        "settlement_status": settlement_status,
    }


def apply_booking_financial_snapshot(booking, snapshot):
    """
    Apply snapshot values to a booking instance.
    """

    fields_to_apply = [
        "original_price",
        "subtotal_amount",
        "seller_margin_percent",
        "customer_discount_percent",
        "customer_discount_amount",
        "discount_amount",
        "total_amount",
        "seller_commission_amount",
        "owner_net_amount",
        "owner_received_amount",
        "seller_collected_amount",
        "seller_due_to_company",
        "deposit_required",
        "deposit_paid",
        "balance_due",
        "payment_status",
        "settlement_status",
    ]

    updated_fields = []

    for field in fields_to_apply:
        if hasattr(booking, field) and field in snapshot:
            setattr(booking, field, snapshot[field])
            updated_fields.append(field)

    if snapshot.get("payment_status") in [
        BOOKING_PAYMENT_PAID,
        BOOKING_PAYMENT_DEPOSIT,
        BOOKING_PAYMENT_PARTIAL,
    ]:
        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"
            updated_fields.append("status")

        if not booking.confirmed_at:
            booking.confirmed_at = timezone.now()
            updated_fields.append("confirmed_at")

    updated_fields.append("updated_at")

    booking.save(update_fields=list(dict.fromkeys(updated_fields)))

    return booking


def recalculate_booking(booking):
    """
    Public function used by the rest of the app.
    """

    snapshot = calculate_booking_financial_snapshot(booking)
    return apply_booking_financial_snapshot(booking, snapshot)


def calculate_booking(booking):
    """
    Alias for readability.
    """

    return recalculate_booking(booking)