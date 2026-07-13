"""
Compatibility layer for the new Ticketing finance engine.

Legacy code imports this module as:

    from . import booking_finance_service as booking_finance

So we keep the old public function names here, but delegate all real work to:

    ticketing.finance

This allows views, serializers, Stripe/PayPal webhooks, seller dashboards,
and reports to migrate safely without breaking all at once.
"""

import logging

from django.db import transaction

from ticketing.finance.calculator import (
    calculate_booking,
    recalculate_booking,
    calculate_booking_financial_snapshot,
    apply_booking_financial_snapshot,
)
from ticketing.finance.commissions import (
    sync_commission_for_booking,
    sync_all_commissions_for_seller,
    recompute_seller_totals,
    cancel_commissions_for_booking,
    mark_commission_paid,
)
from ticketing.finance.payments import (
    record_payment,
    record_customer_payment,
    record_customer_deposit,
    record_customer_full_payment,
    record_customer_balance_payment,
    record_refund,
    record_seller_settlement_payment,
    mark_provider_payment_confirmed,
)
from ticketing.finance.settlements import (
    calculate_seller_due_to_company,
    calculate_owner_remaining_amount,
    resolve_settlement_status,
    apply_settlement_status,
    record_seller_settlement,
    settle_booking_fully,
    settle_booking_partially,
)
from ticketing.finance.pricing import (
    calculate_pricing,
    calculate_pricing_from_booking_values,
    calculate_pricing_from_product,
)
from ticketing.finance.reports import (
    owner_finance_summary,
    seller_finance_summary,
    seller_leaderboard,
    receivables_report,
    seller_receivables_report,
)
from ticketing.finance.utils import money
from ticketing.finance.constants import (
    ZERO,
    PAYMENT_TYPE_FULL,
)

logger = logging.getLogger(__name__)

CONFIRMED_PAYMENT_STATUSES = {"deposit_paid", "paid"}


def _extract_booking_from_payment_result(result, fallback_booking):
    """
    Normalize finance service return values.

    Most payment functions return ``(payment, booking)``. This compatibility
    helper also supports a direct Booking return so older/newer finance engine
    implementations remain safe.
    """
    if isinstance(result, tuple):
        for value in reversed(result):
            if hasattr(value, "payment_status") and hasattr(value, "booking_code"):
                return value

    if hasattr(result, "payment_status") and hasattr(result, "booking_code"):
        return result

    fallback_booking.refresh_from_db()
    return fallback_booking


def _queue_payment_confirmed_notification_if_transitioned(
    *,
    booking,
    previous_payment_status,
):
    """
    Queue customer notifications only on the first transition into a confirmed
    payment state.

    transaction.on_commit prevents Celery from reading the booking before the
    surrounding database transaction has committed.
    """
    current_payment_status = str(
        getattr(booking, "payment_status", "") or ""
    )

    if (
        previous_payment_status not in CONFIRMED_PAYMENT_STATUSES
        and current_payment_status in CONFIRMED_PAYMENT_STATUSES
    ):
        booking_id = booking.id

        def enqueue():
            try:
                from ticketing.tasks import (
                    send_payment_confirmed_notifications_task,
                )

                send_payment_confirmed_notifications_task.delay(booking_id)
            except Exception:
                logger.exception(
                    "Could not queue payment-confirmed notifications for "
                    "booking id=%s.",
                    booking_id,
                )

        transaction.on_commit(enqueue)


# ==========================================================
# Legacy-compatible names
# ==========================================================

@transaction.atomic
def recalculate_booking_payment_totals(booking):
    """
    Legacy entry point used by existing views/serializers.

    Old behavior:
        - looked at confirmed payments
        - recalculated deposit_paid, balance_due, seller collected, commission

    New behavior:
        - delegates to finance.calculator.recalculate_booking()
        - syncs commission
        - recomputes seller totals
        - queues customer notifications only when payment first becomes
          deposit_paid or paid
    """
    previous_payment_status = str(booking.payment_status or "")

    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=booking,
        previous_payment_status=previous_payment_status,
    )

    return booking


def sync_seller_commission_for_booking(booking):
    """
    Legacy alias.
    """
    return sync_commission_for_booking(booking)


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
    """
    Legacy online payment confirmation entry point.

    Used by Stripe/PayPal confirmation flows.

    This delegates to finance.payments.mark_provider_payment_confirmed() and
    queues customer confirmation notifications after the transaction commits,
    but only when payment_status first becomes deposit_paid or paid.
    """
    previous_payment_status = str(booking.payment_status or "")

    result = mark_provider_payment_confirmed(
        booking=booking,
        amount=amount,
        provider=provider,
        payment_type=payment_type,
        provider_payment_id=provider_payment_id,
        provider_checkout_id=provider_checkout_id,
        provider_order_id=provider_order_id,
        provider_capture_id=provider_capture_id,
        provider_status=provider_status,
        provider_response=provider_response or {},
    )

    updated_booking = _extract_booking_from_payment_result(result, booking)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=updated_booking,
        previous_payment_status=previous_payment_status,
    )

    return result


# ==========================================================
# Convenience wrappers for new code
# ==========================================================

@transaction.atomic
def recalculate_booking_finance(booking):
    previous_payment_status = str(booking.payment_status or "")

    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=booking,
        previous_payment_status=previous_payment_status,
    )

    return booking


def calculate_booking_snapshot(booking):
    return calculate_booking_financial_snapshot(booking)


@transaction.atomic
def apply_booking_snapshot(booking, snapshot):
    previous_payment_status = str(booking.payment_status or "")

    booking = apply_booking_financial_snapshot(booking, snapshot)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=booking,
        previous_payment_status=previous_payment_status,
    )

    return booking


@transaction.atomic
def record_customer_cash_to_seller(
    booking,
    amount,
    payment_type=PAYMENT_TYPE_FULL,
    seller=None,
    collected_by=None,
    reference="",
    note="Customer cash collected by seller.",
):
    """
    Customer pays seller directly in cash.

    This increases:
        - seller_collected_amount
        - seller_due_to_company

    It does NOT mean owner has received the money.
    """
    previous_payment_status = str(booking.payment_status or "")
    seller = seller or booking.seller

    result = record_customer_payment(
        booking=booking,
        amount=amount,
        payment_type=payment_type,
        method="cash",
        seller=seller,
        collected_by=collected_by,
        reference=reference,
        note=note,
        collected_by_party="seller",
    )

    updated_booking = _extract_booking_from_payment_result(result, booking)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=updated_booking,
        previous_payment_status=previous_payment_status,
    )

    return result


@transaction.atomic
def record_customer_cash_to_owner(
    booking,
    amount,
    payment_type=PAYMENT_TYPE_FULL,
    collected_by=None,
    reference="",
    note="Customer cash received by owner.",
):
    """
    Customer pays owner/company directly in cash.

    This increases owner_received_amount.
    """
    previous_payment_status = str(booking.payment_status or "")

    result = record_customer_payment(
        booking=booking,
        amount=amount,
        payment_type=payment_type,
        method="cash",
        seller=None,
        collected_by=collected_by,
        reference=reference,
        note=note,
        collected_by_party="owner",
    )

    updated_booking = _extract_booking_from_payment_result(result, booking)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=updated_booking,
        previous_payment_status=previous_payment_status,
    )

    return result


@transaction.atomic
def record_customer_online_payment(
    booking,
    amount,
    provider,
    payment_type=PAYMENT_TYPE_FULL,
    provider_payment_id="",
    provider_checkout_id="",
    provider_order_id="",
    provider_capture_id="",
    provider_status="",
    provider_response=None,
):
    """
    Customer pays online through Stripe/PayPal.
    """
    previous_payment_status = str(booking.payment_status or "")

    result = mark_provider_payment_confirmed(
        booking=booking,
        amount=amount,
        provider=provider,
        payment_type=payment_type,
        provider_payment_id=provider_payment_id,
        provider_checkout_id=provider_checkout_id,
        provider_order_id=provider_order_id,
        provider_capture_id=provider_capture_id,
        provider_status=provider_status,
        provider_response=provider_response or {},
    )

    updated_booking = _extract_booking_from_payment_result(result, booking)

    _queue_payment_confirmed_notification_if_transitioned(
        booking=updated_booking,
        previous_payment_status=previous_payment_status,
    )

    return result


def record_seller_company_settlement(
    booking,
    amount,
    collected_by=None,
    method="bank_transfer",
    reference="",
    note="Seller settled amount owed to company.",
):
    """
    Seller pays the company what they owe.

    This is a company settlement, not a customer payment, so no customer
    confirmation notification is queued here.
    """
    return record_seller_settlement_payment(
        booking=booking,
        amount=amount,
        collected_by=collected_by,
        method=method,
        reference=reference,
        note=note,
    )


def settle_seller_booking_balance(
    booking,
    collected_by=None,
    method="bank_transfer",
    reference="",
):
    """
    Fully settle the seller/company balance for this booking.

    This does not represent a new customer payment, so it does not trigger a
    customer confirmation.
    """
    return settle_booking_fully(
        booking=booking,
        collected_by=collected_by,
        method=method,
        reference=reference,
    )


# ==========================================================
# Backwards-compatible finance debug helper
# ==========================================================

def debug_booking_finance(booking):
    """
    Useful in Django shell:

        from ticketing import booking_finance_service as f
        f.debug_booking_finance(booking)
    """
    snapshot = calculate_booking_financial_snapshot(booking)

    return {
        "booking_code": booking.booking_code,
        "status": booking.status,
        "payment_status": booking.payment_status,
        "settlement_status": getattr(booking, "settlement_status", ""),
        "snapshot": snapshot,
        "seller": booking.seller.full_name if booking.seller else "",
        "seller_due_to_company": getattr(booking, "seller_due_to_company", ZERO),
        "owner_net_amount": getattr(booking, "owner_net_amount", ZERO),
        "owner_received_amount": getattr(booking, "owner_received_amount", ZERO),
    }


__all__ = [
    # legacy
    "money",
    "ZERO",
    "recompute_seller_totals",
    "sync_seller_commission_for_booking",
    "recalculate_booking_payment_totals",
    "mark_booking_payment_confirmed",

    # calculator
    "calculate_booking",
    "recalculate_booking",
    "calculate_booking_financial_snapshot",
    "apply_booking_financial_snapshot",
    "recalculate_booking_finance",
    "calculate_booking_snapshot",
    "apply_booking_snapshot",

    # pricing
    "calculate_pricing",
    "calculate_pricing_from_booking_values",
    "calculate_pricing_from_product",

    # payments
    "record_payment",
    "record_customer_payment",
    "record_customer_deposit",
    "record_customer_full_payment",
    "record_customer_balance_payment",
    "record_refund",
    "record_customer_cash_to_seller",
    "record_customer_cash_to_owner",
    "record_customer_online_payment",

    # settlements
    "record_seller_settlement",
    "record_seller_settlement_payment",
    "record_seller_company_settlement",
    "settle_booking_fully",
    "settle_booking_partially",
    "settle_seller_booking_balance",
    "calculate_seller_due_to_company",
    "calculate_owner_remaining_amount",
    "resolve_settlement_status",
    "apply_settlement_status",

    # commissions
    "sync_commission_for_booking",
    "sync_all_commissions_for_seller",
    "cancel_commissions_for_booking",
    "mark_commission_paid",

    # reports
    "owner_finance_summary",
    "seller_finance_summary",
    "seller_leaderboard",
    "receivables_report",
    "seller_receivables_report",

    # debug
    "debug_booking_finance",
]
