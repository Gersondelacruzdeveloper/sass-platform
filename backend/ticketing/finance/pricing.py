"""
Pricing engine for Ticketing seller finance.

This module has no database access.
It receives raw numbers and returns a clean financial pricing snapshot.

Supported seller allowance modes
--------------------------------
1. Percentage allowance:
   The existing seller margin percentage is used.

2. Fixed allowance:
   ``fixed_seller_margin_amount`` is the total seller allowance for the
   pricing calculation. The customer discount is deducted from that allowance,
   and the unused balance becomes the seller commission.

The caller (normally calculator.py) is responsible for resolving which
seller/product/package/external-option rule applies and, when needed,
multiplying a per-unit fixed amount by the booking item quantity.
"""

from .constants import ZERO, ONE_HUNDRED
from .utils import (
    money,
    round_money,
    percentage_amount,
    clamp_discount_percent,
    require_percentage,
)


def calculate_seller_margin_amount(original_price, seller_margin_percent):
    return percentage_amount(original_price, seller_margin_percent)


def calculate_customer_discount_amount(
    original_price,
    customer_discount_percent,
):
    return percentage_amount(original_price, customer_discount_percent)


def calculate_customer_final_price(
    original_price,
    customer_discount_amount,
):
    return max(
        money(original_price) - money(customer_discount_amount),
        ZERO,
    )


def calculate_seller_commission_amount(
    original_price,
    seller_margin_percent,
    customer_discount_percent,
):
    """
    Calculate commission using the percentage allowance model.

    Seller commission = unused part of seller margin.

    Example:
        Original price: 90
        Seller margin allowed: 15%
        Customer discount: 10%

        Seller keeps: 5%
        Commission: 4.50
    """

    seller_margin_percent = money(seller_margin_percent)
    customer_discount_percent = money(customer_discount_percent)

    commission_percent = max(
        seller_margin_percent - customer_discount_percent,
        ZERO,
    )

    return percentage_amount(original_price, commission_percent)


def calculate_fixed_seller_commission_amount(
    fixed_seller_margin_amount,
    customer_discount_amount,
):
    """
    Calculate commission using the fixed allowance model.

    Example:
        Fixed seller allowance: 20
        Customer discount: 5
        Seller commission: 15
    """

    return max(
        money(fixed_seller_margin_amount)
        - money(customer_discount_amount),
        ZERO,
    )


def calculate_fixed_seller_margin_total(
    fixed_amount,
    quantity=1,
    *,
    is_per_unit=True,
):
    """
    Convert a fixed rule into the total allowance used by calculate_pricing().

    This helper performs no database access.

    Example:
        fixed_amount=20, quantity=2, is_per_unit=True -> 40
        fixed_amount=20, quantity=2, is_per_unit=False -> 20
    """

    amount = max(money(fixed_amount), ZERO)

    if not is_per_unit:
        return amount

    try:
        resolved_quantity = int(quantity or 1)
    except (TypeError, ValueError):
        resolved_quantity = 1

    resolved_quantity = max(resolved_quantity, 1)
    return money(amount * resolved_quantity)


def calculate_owner_net_amount(
    customer_final_price,
    seller_commission_amount,
):
    """
    Owner net = customer final price - seller commission.

    Example:
        Customer pays 81
        Seller commission 4.50
        Owner net 76.50
    """

    return max(
        money(customer_final_price) - money(seller_commission_amount),
        ZERO,
    )


def _amount_to_percent(amount, original_price):
    """
    Convert a money amount into its percentage of the original price.
    """

    amount = money(amount)
    original_price = money(original_price)

    if original_price <= ZERO:
        return ZERO

    return money(
        (amount / original_price) * ONE_HUNDRED
    )


def calculate_pricing(
    original_price,
    seller_margin_percent=ZERO,
    customer_discount_percent=ZERO,
    allow_discount_clamp=True,
    fixed_seller_margin_amount=None,
):
    """
    Main pricing function.

    Inputs
    ------
    original_price:
        Owner retail price before the seller's customer discount.

    seller_margin_percent:
        Maximum percentage allowance the owner gives the seller. Used only
        when ``fixed_seller_margin_amount`` is None.

    customer_discount_percent:
        Discount the seller gives the customer.

    allow_discount_clamp:
        When True, automatically limits the customer discount to the seller's
        available allowance. When False, an excessive discount raises
        ValueError.

    fixed_seller_margin_amount:
        Optional total fixed seller allowance for this calculation. Supplying
        this value activates fixed-amount mode, even when the value is zero.

        The caller must resolve the correct seller/product/package/external
        option rule before calling this function. For per-unit rules, multiply
        the fixed amount by quantity first, or use
        ``calculate_fixed_seller_margin_total()``.

    Returns
    -------
    A pricing snapshot containing the existing fields plus:

    - commission_rule_type: "percentage" or "fixed_amount"
    - fixed_seller_margin_amount: fixed allowance used, or None
    """

    original_price = money(original_price)
    customer_discount_percent = require_percentage(
        customer_discount_percent,
        "customer_discount_percent",
    )

    using_fixed_margin = fixed_seller_margin_amount is not None

    if using_fixed_margin:
        # A fixed seller allowance cannot be negative or exceed the retail
        # price. This prevents a commission larger than the money collected.
        seller_margin_amount = min(
            max(money(fixed_seller_margin_amount), ZERO),
            original_price,
        )

        # Preserve the existing booking field by exposing the fixed allowance
        # as its equivalent percentage of the original price.
        seller_margin_percent = _amount_to_percent(
            seller_margin_amount,
            original_price,
        )

        if allow_discount_clamp:
            customer_discount_percent = clamp_discount_percent(
                customer_discount_percent,
                seller_margin_percent,
            )
        else:
            requested_discount_amount = (
                calculate_customer_discount_amount(
                    original_price,
                    customer_discount_percent,
                )
            )

            if requested_discount_amount > seller_margin_amount:
                raise ValueError(
                    "Customer discount cannot exceed the fixed seller "
                    "margin amount."
                )

        customer_discount_amount = (
            calculate_customer_discount_amount(
                original_price,
                customer_discount_percent,
            )
        )

        # Protect against a tiny rounding difference between the percentage
        # conversion and the fixed money allowance.
        if (
            allow_discount_clamp
            and customer_discount_amount > seller_margin_amount
        ):
            customer_discount_amount = seller_margin_amount
            customer_discount_percent = _amount_to_percent(
                customer_discount_amount,
                original_price,
            )

        customer_final_price = calculate_customer_final_price(
            original_price,
            customer_discount_amount,
        )

        seller_commission_amount = (
            calculate_fixed_seller_commission_amount(
                seller_margin_amount,
                customer_discount_amount,
            )
        )

        seller_commission_percent = _amount_to_percent(
            seller_commission_amount,
            original_price,
        )

        commission_rule_type = "fixed_amount"

    else:
        seller_margin_percent = require_percentage(
            seller_margin_percent,
            "seller_margin_percent",
        )

        if allow_discount_clamp:
            customer_discount_percent = clamp_discount_percent(
                customer_discount_percent,
                seller_margin_percent,
            )
        elif customer_discount_percent > seller_margin_percent:
            raise ValueError(
                "customer_discount_percent cannot exceed "
                "seller_margin_percent."
            )

        seller_margin_amount = calculate_seller_margin_amount(
            original_price,
            seller_margin_percent,
        )

        customer_discount_amount = (
            calculate_customer_discount_amount(
                original_price,
                customer_discount_percent,
            )
        )

        customer_final_price = calculate_customer_final_price(
            original_price,
            customer_discount_amount,
        )

        seller_commission_percent = max(
            seller_margin_percent - customer_discount_percent,
            ZERO,
        )

        seller_commission_amount = calculate_seller_commission_amount(
            original_price,
            seller_margin_percent,
            customer_discount_percent,
        )

        commission_rule_type = "percentage"

    owner_net_amount = calculate_owner_net_amount(
        customer_final_price,
        seller_commission_amount,
    )

    return {
        "original_price": round_money(original_price),
        "seller_margin_percent": round_money(seller_margin_percent),
        "seller_margin_amount": round_money(seller_margin_amount),
        "customer_discount_percent": round_money(
            customer_discount_percent
        ),
        "customer_discount_amount": round_money(
            customer_discount_amount
        ),
        "customer_final_price": round_money(customer_final_price),
        "seller_commission_percent": round_money(
            seller_commission_percent
        ),
        "seller_commission_amount": round_money(
            seller_commission_amount
        ),
        "owner_net_amount": round_money(owner_net_amount),
        "commission_rule_type": commission_rule_type,
        "fixed_seller_margin_amount": (
            round_money(seller_margin_amount)
            if using_fixed_margin
            else None
        ),
    }


def calculate_pricing_from_booking_values(
    subtotal_amount,
    seller_margin_percent=ZERO,
    customer_discount_percent=ZERO,
    fixed_seller_margin_amount=None,
    allow_discount_clamp=True,
):
    """
    Convenience wrapper for booking-level pricing.
    """

    return calculate_pricing(
        original_price=subtotal_amount,
        seller_margin_percent=seller_margin_percent,
        customer_discount_percent=customer_discount_percent,
        allow_discount_clamp=allow_discount_clamp,
        fixed_seller_margin_amount=fixed_seller_margin_amount,
    )


def calculate_pricing_from_product(
    product,
    quantity=1,
    seller_margin_percent=None,
    customer_discount_percent=ZERO,
    fixed_seller_margin_amount=None,
    allow_discount_clamp=True,
):
    """
    Convenience helper for product-based pricing.

    This accepts a product object but still performs no database queries.

    ``fixed_seller_margin_amount`` is treated as the total allowance for this
    calculation. If the rule is per-unit, multiply it by quantity before
    passing it, or use calculate_fixed_seller_margin_total().
    """

    original_price = (
        money(getattr(product, "base_price", ZERO))
        * money(quantity)
    )

    if (
        seller_margin_percent is None
        and fixed_seller_margin_amount is None
    ):
        seller_margin_percent = money(
            getattr(product, "seller_margin_percent", ZERO)
            or getattr(
                product,
                "seller_allowed_discount_percent",
                ZERO,
            )
            or ZERO
        )

    return calculate_pricing(
        original_price=original_price,
        seller_margin_percent=(
            seller_margin_percent
            if seller_margin_percent is not None
            else ZERO
        ),
        customer_discount_percent=customer_discount_percent,
        allow_discount_clamp=allow_discount_clamp,
        fixed_seller_margin_amount=fixed_seller_margin_amount,
    )


def explain_pricing(snapshot):
    """
    Human-readable explanation useful for debugging, receipts, and admin logs.
    """

    rule_type = snapshot.get(
        "commission_rule_type",
        "percentage",
    )

    if rule_type == "fixed_amount":
        rule_description = (
            "Fixed seller allowance "
            f"{snapshot.get('fixed_seller_margin_amount')}"
        )
    else:
        rule_description = (
            "Percentage seller allowance "
            f"{snapshot.get('seller_margin_percent')}%"
        )

    return {
        "summary": (
            f"{rule_description}. "
            f"Original price {snapshot['original_price']} - "
            f"customer discount "
            f"{snapshot['customer_discount_amount']} = "
            f"customer final price "
            f"{snapshot['customer_final_price']}. "
            f"Seller commission "
            f"{snapshot['seller_commission_amount']}. "
            f"Owner net {snapshot['owner_net_amount']}."
        ),
        "details": snapshot,
    }
