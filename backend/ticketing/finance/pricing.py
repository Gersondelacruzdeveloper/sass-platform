"""
Pricing engine for Ticketing seller finance.

This module has no database access.
It receives raw numbers and returns a clean financial pricing snapshot.
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


def calculate_customer_discount_amount(original_price, customer_discount_percent):
    return percentage_amount(original_price, customer_discount_percent)


def calculate_customer_final_price(original_price, customer_discount_amount):
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


def calculate_owner_net_amount(customer_final_price, seller_commission_amount):
    """
    Owner net = customer final price - seller commission.

    Example:
    Customer pays 81
    Seller commission 4.50

    Owner net = 76.50
    """

    return max(
        money(customer_final_price) - money(seller_commission_amount),
        ZERO,
    )


def calculate_pricing(
    original_price,
    seller_margin_percent=ZERO,
    customer_discount_percent=ZERO,
    allow_discount_clamp=True,
):
    """
    Main pricing function.

    Inputs:
    - original_price: owner retail price
    - seller_margin_percent: max margin/discount allowance owner gives seller
    - customer_discount_percent: discount seller gives customer

    Returns:
    - original_price
    - seller_margin_percent
    - seller_margin_amount
    - customer_discount_percent
    - customer_discount_amount
    - customer_final_price
    - seller_commission_percent
    - seller_commission_amount
    - owner_net_amount
    """

    original_price = money(original_price)
    seller_margin_percent = require_percentage(
        seller_margin_percent,
        "seller_margin_percent",
    )
    customer_discount_percent = require_percentage(
        customer_discount_percent,
        "customer_discount_percent",
    )

    if allow_discount_clamp:
        customer_discount_percent = clamp_discount_percent(
            customer_discount_percent,
            seller_margin_percent,
        )
    elif customer_discount_percent > seller_margin_percent:
        raise ValueError(
            "customer_discount_percent cannot exceed seller_margin_percent."
        )

    seller_margin_amount = calculate_seller_margin_amount(
        original_price,
        seller_margin_percent,
    )

    customer_discount_amount = calculate_customer_discount_amount(
        original_price,
        customer_discount_percent,
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

    owner_net_amount = calculate_owner_net_amount(
        customer_final_price,
        seller_commission_amount,
    )

    return {
        "original_price": round_money(original_price),
        "seller_margin_percent": round_money(seller_margin_percent),
        "seller_margin_amount": round_money(seller_margin_amount),
        "customer_discount_percent": round_money(customer_discount_percent),
        "customer_discount_amount": round_money(customer_discount_amount),
        "customer_final_price": round_money(customer_final_price),
        "seller_commission_percent": round_money(seller_commission_percent),
        "seller_commission_amount": round_money(seller_commission_amount),
        "owner_net_amount": round_money(owner_net_amount),
    }


def calculate_pricing_from_booking_values(
    subtotal_amount,
    seller_margin_percent=ZERO,
    customer_discount_percent=ZERO,
):
    """
    Convenience wrapper for booking-level pricing.
    """

    return calculate_pricing(
        original_price=subtotal_amount,
        seller_margin_percent=seller_margin_percent,
        customer_discount_percent=customer_discount_percent,
    )


def calculate_pricing_from_product(
    product,
    quantity=1,
    seller_margin_percent=None,
    customer_discount_percent=ZERO,
):
    """
    Convenience helper for product-based pricing.

    This accepts a product object, but still does not perform database queries.
    """

    original_price = money(getattr(product, "base_price", ZERO)) * money(quantity)

    if seller_margin_percent is None:
        seller_margin_percent = money(
            getattr(product, "seller_margin_percent", ZERO)
            or getattr(product, "seller_allowed_discount_percent", ZERO)
            or ZERO
        )

    return calculate_pricing(
        original_price=original_price,
        seller_margin_percent=seller_margin_percent,
        customer_discount_percent=customer_discount_percent,
    )


def explain_pricing(snapshot):
    """
    Human-readable explanation useful for debugging, receipts, and admin logs.
    """

    return {
        "summary": (
            f"Original price {snapshot['original_price']} - "
            f"customer discount {snapshot['customer_discount_amount']} = "
            f"customer final price {snapshot['customer_final_price']}. "
            f"Seller commission {snapshot['seller_commission_amount']}. "
            f"Owner net {snapshot['owner_net_amount']}."
        ),
        "details": snapshot,
    }