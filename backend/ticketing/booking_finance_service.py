"""
Compatibility layer for the new Ticketing finance engine.

Legacy code imports this module as:

    from . import booking_finance_service as booking_finance

So we keep the old public function names here, but delegate all real work to:

    ticketing.finance

This allows views, serializers, Stripe/PayPal webhooks, seller dashboards,
and reports to migrate safely without breaking all at once.
"""

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
    """

    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

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

    This is now delegated to finance.payments.mark_provider_payment_confirmed().
    """

    return mark_provider_payment_confirmed(
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


# ==========================================================
# Convenience wrappers for new code
# ==========================================================

def recalculate_booking_finance(booking):
    booking = recalculate_booking(booking)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    return booking


def calculate_booking_snapshot(booking):
    return calculate_booking_financial_snapshot(booking)


def apply_booking_snapshot(booking, snapshot):
    booking = apply_booking_financial_snapshot(booking, snapshot)
    sync_commission_for_booking(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    return booking


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

    seller = seller or booking.seller

    return record_customer_payment(
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

    return record_customer_payment(
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

    return mark_provider_payment_confirmed(
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
