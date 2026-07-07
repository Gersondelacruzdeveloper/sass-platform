"""
Finance utility helpers.

These helpers should be used throughout the finance engine instead of
working directly with Decimal values.

This file intentionally contains NO database access.
"""

from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from .constants import (
    ZERO,
    ONE_HUNDRED,
    MONEY_DECIMAL_PLACES,
)


# ==========================================================
# Basic Helpers
# ==========================================================

def zero() -> Decimal:
    """Return a Decimal zero."""
    return ZERO


def money(value) -> Decimal:
    """
    Safely convert anything into a Decimal monetary value.

    None
    ""
    float
    int
    Decimal
    string

    all become Decimal.
    """

    if value in (None, ""):
        return ZERO

    if isinstance(value, Decimal):
        return value.quantize(
            MONEY_DECIMAL_PLACES,
            rounding=ROUND_HALF_UP,
        )

    try:
        return Decimal(str(value)).quantize(
            MONEY_DECIMAL_PLACES,
            rounding=ROUND_HALF_UP,
        )
    except (InvalidOperation, TypeError, ValueError):
        return ZERO


def round_money(value) -> Decimal:
    """Round a money value to 2 decimal places."""
    return money(value)


# ==========================================================
# Number Helpers
# ==========================================================

def percent(value) -> Decimal:
    """
    Normalize a percentage.

    Example:

    10
    -> Decimal("10.00")
    """

    return money(value)


def percentage_amount(amount, percent_value) -> Decimal:
    """
    Calculate percentage of amount.

    Example

    100
    15

    -> 15
    """

    return round_money(
        money(amount)
        * money(percent_value)
        / ONE_HUNDRED
    )


# ==========================================================
# Limits
# ==========================================================

def clamp(value, minimum=ZERO, maximum=None):
    value = money(value)

    minimum = money(minimum)

    if value < minimum:
        value = minimum

    if maximum is not None:
        maximum = money(maximum)

        if value > maximum:
            value = maximum

    return value


def clamp_discount_percent(discount_percent, allowed_percent):
    """
    Seller cannot exceed the allowed discount.

    Example

    Allowed
    15%

    Seller tries
    22%

    Returns

    15%
    """

    return clamp(
        discount_percent,
        ZERO,
        allowed_percent,
    )


# ==========================================================
# Arithmetic
# ==========================================================

def add(*values):
    total = ZERO

    for value in values:
        total += money(value)

    return round_money(total)


def subtract(first, *others):
    result = money(first)

    for value in others:
        result -= money(value)

    return round_money(result)


def multiply(a, b):
    return round_money(
        money(a) * money(b)
    )


def divide(a, b):
    b = money(b)

    if b == ZERO:
        return ZERO

    return round_money(
        money(a) / b
    )


# ==========================================================
# Money Comparisons
# ==========================================================

def is_zero(value):
    return money(value) == ZERO


def is_positive(value):
    return money(value) > ZERO


def is_negative(value):
    return money(value) < ZERO


# ==========================================================
# Financial Helpers
# ==========================================================

def remaining_balance(total, paid):
    """
    Remaining amount still owed.
    """

    return max(
        money(total) - money(paid),
        ZERO,
    )


def paid_in_full(total, paid):
    return money(paid) >= money(total)


def deposit_met(required, paid):
    required = money(required)

    if required <= ZERO:
        return False

    return money(paid) >= required


# ==========================================================
# Seller Finance Helpers
# ==========================================================

def seller_amount_owed_to_company(
    seller_collected,
    seller_commission,
):
    """
    Company receivable from seller.

    Seller Collected
    -
    Seller Commission
    =
    Seller Owes Company
    """

    return max(
        money(seller_collected)
        - money(seller_commission),
        ZERO,
    )


def owner_amount_remaining(
    owner_expected,
    owner_received,
):
    return max(
        money(owner_expected)
        - money(owner_received),
        ZERO,
    )


# ==========================================================
# Display Helpers
# ==========================================================

def money_str(value):
    return f"{money(value):.2f}"


def percent_str(value):
    return f"{money(value):.2f}%"


# ==========================================================
# Validation Helpers
# ==========================================================

def require_non_negative(value, field_name="value"):
    value = money(value)

    if value < ZERO:
        raise ValueError(
            f"{field_name} cannot be negative."
        )

    return value


def require_percentage(value, field_name="percentage"):
    value = money(value)

    if value < ZERO or value > ONE_HUNDRED:
        raise ValueError(
            f"{field_name} must be between 0 and 100."
        )

    return value