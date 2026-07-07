"""
Ticketing Finance Engine

This package is the single source of truth for all financial logic.

Responsibilities
----------------
✓ Pricing
✓ Customer discounts
✓ Seller margins
✓ Seller commissions
✓ Payments
✓ Settlements
✓ Reporting
✓ Permission helpers

Nothing outside this package should calculate financial values directly.
"""

# ==========================================================
# Constants
# ==========================================================

from .constants import *

# ==========================================================
# Utilities
# ==========================================================

from .utils import *

# ==========================================================
# Pricing
# ==========================================================

from .pricing import (
    calculate_pricing,
    calculate_pricing_from_booking_values,
    calculate_pricing_from_product,
    calculate_customer_discount_amount,
    calculate_customer_final_price,
    calculate_owner_net_amount,
    calculate_seller_commission_amount,
    calculate_seller_margin_amount,
)

# ==========================================================
# Booking Calculator
# ==========================================================

from .calculator import (
    calculate_booking,
    recalculate_booking,
    calculate_booking_financial_snapshot,
    apply_booking_financial_snapshot,
)

# ==========================================================
# Payments
# ==========================================================

from .payments import (
    record_payment,
    record_customer_payment,
    record_customer_deposit,
    record_customer_full_payment,
    record_customer_balance_payment,
    record_refund,
    record_seller_settlement_payment,
    mark_provider_payment_confirmed,
)

# ==========================================================
# Commissions
# ==========================================================

from .commissions import (
    sync_commission_for_booking,
    sync_all_commissions_for_seller,
    recompute_seller_totals,
    cancel_commissions_for_booking,
    mark_commission_paid,
)

# ==========================================================
# Settlements
# ==========================================================

from .settlements import (
    calculate_seller_due_to_company,
    calculate_owner_remaining_amount,
    resolve_settlement_status,
    apply_settlement_status,
    record_seller_settlement,
    settle_booking_fully,
    settle_booking_partially,
)

# ==========================================================
# Reports
# ==========================================================

from .reports import (
    owner_finance_summary,
    seller_finance_summary,
    seller_leaderboard,
    receivables_report,
    seller_receivables_report,
)

# ==========================================================
# Permissions
# ==========================================================

from .permissions import (
    seller_has_permission,
    can_create_booking,
    can_send_payment_link,
    can_apply_customer_discount,
    can_collect_cash,
    can_mark_cash_collected,
    can_keep_commission_first,
    can_create_pending_payment_booking,
    can_take_deposit,
    can_take_full_payment,
    can_request_supervisor_approval,
    validate_seller_booking_permission,
    validate_discount_permission,
    validate_payment_permission,
)

__all__ = [
    # Pricing
    "calculate_pricing",
    "calculate_pricing_from_booking_values",
    "calculate_pricing_from_product",

    # Booking calculator
    "calculate_booking",
    "recalculate_booking",
    "calculate_booking_financial_snapshot",
    "apply_booking_financial_snapshot",

    # Payments
    "record_payment",
    "record_customer_payment",
    "record_customer_deposit",
    "record_customer_full_payment",
    "record_customer_balance_payment",
    "record_refund",
    "record_seller_settlement_payment",
    "mark_provider_payment_confirmed",

    # Commissions
    "sync_commission_for_booking",
    "sync_all_commissions_for_seller",
    "recompute_seller_totals",
    "cancel_commissions_for_booking",
    "mark_commission_paid",

    # Settlements
    "record_seller_settlement",
    "settle_booking_fully",
    "settle_booking_partially",
    "calculate_seller_due_to_company",
    "calculate_owner_remaining_amount",
    "resolve_settlement_status",
    "apply_settlement_status",

    # Reports
    "owner_finance_summary",
    "seller_finance_summary",
    "seller_leaderboard",
    "receivables_report",
    "seller_receivables_report",
]