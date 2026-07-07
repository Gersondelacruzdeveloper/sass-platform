from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ticketing.models import (
    Booking,
    BookingPayment,
    Seller,
    SellerCommission,
)


ZERO = Decimal("0.00")


def money(value):
    if value in [None, ""]:
        return ZERO

    try:
        return Decimal(str(value))
    except Exception:
        return ZERO


def recompute_seller_totals(seller):
    if not seller:
        return None

    seller.total_sales_amount = (
        Booking.objects.filter(seller=seller)
        .exclude(status__in=["cancelled", "refunded", "no_show"])
        .aggregate(total=Sum("total_amount"))["total"]
        or ZERO
    )

    seller.total_commission_amount = (
        SellerCommission.objects.filter(seller=seller)
        .exclude(status="cancelled")
        .aggregate(total=Sum("amount"))["total"]
        or ZERO
    )

    seller.total_collected_amount = (
        Booking.objects.filter(seller=seller)
        .exclude(status__in=["cancelled", "refunded", "no_show"])
        .aggregate(total=Sum("seller_collected_amount"))["total"]
        or ZERO
    )

    seller.total_owed_to_company = (
        Booking.objects.filter(seller=seller)
        .exclude(status__in=["cancelled", "refunded", "no_show"])
        .aggregate(total=Sum("seller_due_to_company"))["total"]
        or ZERO
    )

    seller.save(
        update_fields=[
            "total_sales_amount",
            "total_commission_amount",
            "total_collected_amount",
            "total_owed_to_company",
            "updated_at",
        ]
    )

    return seller


def sync_seller_commission_for_booking(booking):
    previous_seller_ids = set(
        SellerCommission.objects.filter(booking=booking).values_list(
            "seller_id",
            flat=True,
        )
    )

    if not booking.seller:
        SellerCommission.objects.filter(booking=booking).update(
            status="cancelled",
        )

        for seller_id in previous_seller_ids:
            recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

        return None

    previous_seller_ids.add(booking.seller_id)

    if booking.status in ["cancelled", "refunded", "no_show"]:
        SellerCommission.objects.filter(
            booking=booking,
            seller=booking.seller,
        ).update(status="cancelled")

        for seller_id in previous_seller_ids:
            recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

        return None

    if money(booking.seller_commission_amount) <= ZERO:
        SellerCommission.objects.filter(
            booking=booking,
            seller=booking.seller,
        ).update(status="cancelled")

        for seller_id in previous_seller_ids:
            recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

        return None

    commission, _ = SellerCommission.objects.update_or_create(
        organisation=booking.organisation,
        seller=booking.seller,
        booking=booking,
        defaults={
            "amount": money(booking.seller_commission_amount),
            "rate_used": money(booking.seller.commission_rate),
            "status": "pending",
            "note": "Automatically generated from booking.",
        },
    )

    for seller_id in previous_seller_ids:
        recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

    return commission


@transaction.atomic
def recalculate_booking_payment_totals(booking):
    confirmed_payments = booking.payments.filter(status="confirmed")

    paid_amount = ZERO
    seller_collected_amount = ZERO

    for payment in confirmed_payments:
        amount = money(payment.amount)

        if payment.payment_type == "refund":
            paid_amount -= amount
        else:
            paid_amount += amount

        if payment.seller:
            seller_collected_amount += amount

    booking.deposit_paid = max(paid_amount, ZERO)
    booking.seller_collected_amount = seller_collected_amount
    booking.balance_due = max(
        money(booking.total_amount) - money(booking.deposit_paid),
        ZERO,
    )

    booking.seller_commission_amount = ZERO

    if booking.seller:
        if money(booking.seller.fixed_commission_amount) > ZERO:
            booking.seller_commission_amount = money(
                booking.seller.fixed_commission_amount
            )
        elif money(booking.seller.commission_rate) > ZERO:
            booking.seller_commission_amount = (
                money(booking.subtotal_amount) * money(booking.seller.commission_rate)
            ) / Decimal("100.00")

    booking.seller_due_to_company = max(
        money(booking.seller_collected_amount)
        - money(booking.seller_commission_amount),
        ZERO,
    )

    if booking.deposit_paid >= booking.total_amount and booking.total_amount > ZERO:
        booking.payment_status = "paid"
        booking.status = "confirmed"
    elif (
        booking.deposit_required > ZERO
        and booking.deposit_paid >= booking.deposit_required
    ):
        booking.payment_status = "deposit_paid"

        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"
    elif booking.deposit_paid > ZERO:
        booking.payment_status = "partially_paid"

        if booking.status in ["draft", "pending_payment"]:
            booking.status = "confirmed"
    else:
        booking.payment_status = "unpaid"

    if booking.status == "confirmed" and not booking.confirmed_at:
        booking.confirmed_at = timezone.now()

    booking.save()
    sync_seller_commission_for_booking(booking)

    return booking


@transaction.atomic
def mark_booking_payment_confirmed(
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

    payment, _ = BookingPayment.objects.get_or_create(
        **lookup,
        defaults={
            "amount": amount,
            "payment_type": payment_type,
            "payer_type": "customer",
            "method": provider,
            "status": "confirmed",
            "reference": (
                provider_payment_id
                or provider_order_id
                or provider_capture_id
                or provider_checkout_id
            ),
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

    payment.amount = amount
    payment.payment_type = payment_type
    payment.payer_type = "customer"
    payment.method = provider
    payment.status = "confirmed"
    payment.reference = (
        provider_payment_id
        or provider_order_id
        or provider_capture_id
        or provider_checkout_id
    )
    payment.note = f"{provider.title()} payment confirmed."
    payment.provider_payment_id = provider_payment_id or payment.provider_payment_id
    payment.provider_checkout_id = provider_checkout_id or payment.provider_checkout_id
    payment.provider_order_id = provider_order_id or payment.provider_order_id
    payment.provider_capture_id = provider_capture_id or payment.provider_capture_id
    payment.provider_status = provider_status
    payment.provider_response = provider_response or {}
    payment.paid_at = timezone.now()
    payment.save()

    booking = recalculate_booking_payment_totals(booking)

    return payment, booking
