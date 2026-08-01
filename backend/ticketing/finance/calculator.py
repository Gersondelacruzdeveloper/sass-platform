"""
Booking finance calculator.

This module reads booking/items/payments and updates booking financial fields.

It should not create payments.
It should not create commissions.
It should not send notifications.

It calculates and stores the current financial truth for a booking.

Seller commission rule priority
-------------------------------
1. Seller + exact external option (for example, a Coco Bongo/Wellet option)
2. Seller + exact local package
3. Seller + exact event ticket type
4. Seller + whole product
5. Existing booking/product percentage configuration
6. Seller global fixed commission amount
7. Seller global percentage/default margin

The optional SellerProductCommissionRule model is imported lazily. This keeps
the finance engine import-safe while the model/migration is being introduced.
"""

from decimal import Decimal
from typing import Any

from django.db.models import Q
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
from .pricing import (
    calculate_pricing,
    calculate_fixed_seller_margin_total,
)
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


# ==========================================================
# General money/booking helpers
# ==========================================================

def _amount_to_percent(amount, original_price):
    amount = money(amount)
    original_price = money(original_price)

    if original_price <= ZERO:
        return ZERO

    return round_money(
        (amount / original_price) * Decimal("100.00")
    )


def _get_booking_items(booking):
    try:
        return list(
            booking.items.select_related(
                "product",
                "package",
                "event_ticket_type",
            ).all()
        )
    except Exception:
        try:
            return list(booking.items.all())
        except Exception:
            return []


def _get_item_quantity(item):
    try:
        quantity = int(getattr(item, "quantity", 1) or 1)
    except (TypeError, ValueError):
        quantity = 1

    return max(quantity, 1)


def _get_item_original_unit_price(item):
    return money(
        getattr(item, "original_unit_price", ZERO)
        or getattr(item, "unit_price", ZERO)
        or ZERO
    )


def _get_item_original_total(item):
    quantity = money(_get_item_quantity(item))
    original_unit_price = _get_item_original_unit_price(item)

    if original_unit_price > ZERO:
        return round_money(original_unit_price * quantity)

    return round_money(
        money(
            getattr(item, "original_total", ZERO)
            or getattr(item, "subtotal", ZERO)
            or getattr(item, "total", ZERO)
            or ZERO
        )
    )


def get_booking_original_price(booking):
    """
    Return the retail/original booking price.

    Booking items are the source of truth because unit_price is always stored
    at the retail price.
    """

    item_total = ZERO

    for item in _get_booking_items(booking):
        item_total += _get_item_original_total(item)

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


# ==========================================================
# Legacy/default seller margin resolution
# ==========================================================

def get_booking_seller_margin_percent(booking):
    """
    Resolve the legacy/default percentage margin.

    Priority:
    1. booking.seller_margin_percent
    2. primary_product.seller_margin_percent
    3. primary_product.seller_allowed_discount_percent
    4. seller.default_margin_percent
    5. seller.commission_rate

    Exact seller/product/package/external-option rules are resolved separately
    by resolve_seller_commission_rule_for_item().
    """

    booking_margin = money(
        getattr(booking, "seller_margin_percent", ZERO)
    )

    if booking_margin > ZERO:
        return booking_margin

    product = getattr(booking, "primary_product", None)

    if product:
        product_margin = money(
            getattr(product, "seller_margin_percent", ZERO)
            or getattr(
                product,
                "seller_allowed_discount_percent",
                ZERO,
            )
            or ZERO
        )

        if product_margin > ZERO:
            return product_margin

    seller = getattr(booking, "seller", None)

    if seller:
        seller_margin = money(
            getattr(seller, "default_margin_percent", ZERO)
            or getattr(seller, "commission_rate", ZERO)
            or ZERO
        )

        if seller_margin > ZERO:
            return seller_margin

    return ZERO


def get_item_default_seller_margin_percent(booking, item):
    """
    Resolve the percentage fallback for one booking item.

    A booking-level value remains the strongest legacy override. Otherwise,
    the exact item's product is preferred over the booking primary product.
    """

    booking_margin = money(
        getattr(booking, "seller_margin_percent", ZERO)
    )
    if booking_margin > ZERO:
        return booking_margin

    item_product = getattr(item, "product", None)
    if item_product:
        item_margin = money(
            getattr(item_product, "seller_margin_percent", ZERO)
            or getattr(
                item_product,
                "seller_allowed_discount_percent",
                ZERO,
            )
            or ZERO
        )
        if item_margin > ZERO:
            return item_margin

    primary_product = getattr(booking, "primary_product", None)
    if primary_product:
        product_margin = money(
            getattr(primary_product, "seller_margin_percent", ZERO)
            or getattr(
                primary_product,
                "seller_allowed_discount_percent",
                ZERO,
            )
            or ZERO
        )
        if product_margin > ZERO:
            return product_margin

    seller = getattr(booking, "seller", None)
    if seller:
        seller_margin = money(
            getattr(seller, "default_margin_percent", ZERO)
            or getattr(seller, "commission_rate", ZERO)
            or ZERO
        )
        if seller_margin > ZERO:
            return seller_margin

    return ZERO


def get_booking_global_fixed_commission_amount(booking):
    """
    Return the seller's legacy global fixed amount.

    This is treated as one fixed allowance for the entire booking, not once per
    booking item. Exact SellerProductCommissionRule fixed amounts can be marked
    per-unit.
    """

    seller = getattr(booking, "seller", None)
    if not seller:
        return None

    fixed_amount = money(
        getattr(seller, "fixed_commission_amount", ZERO)
    )

    return fixed_amount if fixed_amount > ZERO else None


def get_booking_customer_discount_percent(booking):
    discount_percent = money(
        getattr(booking, "customer_discount_percent", ZERO)
    )

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

    return round_money(
        (discount_amount / original_price) * Decimal("100.00")
    )


# ==========================================================
# Seller-specific product/package/option rule resolution
# ==========================================================

def _get_rule_model():
    """
    Import the new model lazily.

    Until the model and migration are installed, the calculator safely falls
    back to the existing percentage/global seller settings.
    """

    try:
        from ticketing.models import SellerProductCommissionRule
    except (ImportError, AttributeError):
        return None

    return SellerProductCommissionRule


def _get_item_external_option_identifiers(item):
    """
    Return all stable external identifiers stored on a booking item.

    Different providers may expose the selectable option under different IDs,
    so a rule can match any of these saved values.
    """

    values = []

    for field_name in (
        "external_product_id",
        "external_variant_id",
        "external_availability_id",
    ):
        value = str(getattr(item, field_name, "") or "").strip()

        if value and value not in values:
            values.append(value)

    return values


def _get_rule_type(rule):
    return str(
        getattr(rule, "rule_type", "")
        or getattr(rule, "pricing_type", "")
        or ""
    ).strip().lower()


def _get_rule_fixed_amount(rule):
    return money(
        getattr(rule, "fixed_amount", ZERO)
        or getattr(rule, "fixed_commission_amount", ZERO)
        or ZERO
    )


def _get_rule_percentage(rule):
    return money(
        getattr(rule, "percentage", ZERO)
        or getattr(rule, "commission_percent", ZERO)
        or ZERO
    )


def _serialize_rule(rule, *, match_type):
    if not rule:
        return None

    return {
        "rule_id": getattr(rule, "id", None),
        "match_type": match_type,
        "rule_type": _get_rule_type(rule),
        "fixed_amount": _get_rule_fixed_amount(rule),
        "percentage": _get_rule_percentage(rule),
        "is_per_unit": bool(
            getattr(rule, "is_per_unit", True)
        ),
        "external_option_id": str(
            getattr(rule, "external_option_id", "") or ""
        ),
        "package_id": getattr(rule, "package_id", None),
        "event_ticket_type_id": getattr(
            rule,
            "event_ticket_type_id",
            None,
        ),
        "product_id": getattr(rule, "product_id", None),
    }


def resolve_seller_commission_rule_for_item(booking, item):
    """
    Resolve the most specific active seller commission rule for one item.

    Priority:
    1. Exact external option
    2. Exact local package
    3. Exact event ticket type
    4. Whole product

    The query is organisation- and seller-scoped, preventing one tenant's or
    seller's rules from affecting another.
    """

    seller = getattr(booking, "seller", None)
    product_id = (
        getattr(item, "product_id", None)
        or getattr(
            getattr(item, "product", None),
            "id",
            None,
        )
    )

    if not seller or not product_id:
        return None

    RuleModel = _get_rule_model()
    if RuleModel is None:
        return None

    base_rules = RuleModel.objects.filter(
        organisation_id=getattr(
            booking,
            "organisation_id",
            None,
        ),
        seller_id=getattr(booking, "seller_id", None),
        product_id=product_id,
        is_active=True,
    )

    external_ids = _get_item_external_option_identifiers(item)

    if external_ids:
        rule = (
            base_rules
            .filter(external_option_id__in=external_ids)
            .order_by("-updated_at", "-id")
            .first()
        )
        if rule:
            return _serialize_rule(
                rule,
                match_type="external_option",
            )

    package_id = getattr(item, "package_id", None)
    if package_id:
        rule = (
            base_rules
            .filter(
                package_id=package_id,
                event_ticket_type__isnull=True,
            )
            .filter(
                Q(external_option_id="")
                | Q(external_option_id__isnull=True)
            )
            .order_by("-updated_at", "-id")
            .first()
        )
        if rule:
            return _serialize_rule(
                rule,
                match_type="package",
            )

    event_ticket_type_id = getattr(
        item,
        "event_ticket_type_id",
        None,
    )
    if event_ticket_type_id:
        rule = (
            base_rules
            .filter(
                event_ticket_type_id=event_ticket_type_id,
                package__isnull=True,
            )
            .filter(
                Q(external_option_id="")
                | Q(external_option_id__isnull=True)
            )
            .order_by("-updated_at", "-id")
            .first()
        )
        if rule:
            return _serialize_rule(
                rule,
                match_type="event_ticket_type",
            )

    rule = (
        base_rules
        .filter(
            package__isnull=True,
            event_ticket_type__isnull=True,
        )
        .filter(
            Q(external_option_id="")
            | Q(external_option_id__isnull=True)
        )
        .order_by("-updated_at", "-id")
        .first()
    )

    if rule:
        return _serialize_rule(
            rule,
            match_type="product",
        )

    return None


def _calculate_item_pricing(
    *,
    booking,
    item,
    customer_discount_percent,
    resolved_rule,
):
    item_original_price = _get_item_original_total(item)

    if item_original_price <= ZERO:
        return None

    if resolved_rule:
        rule_type = resolved_rule["rule_type"]

        if rule_type in {
            "fixed",
            "fixed_amount",
            "fixed_commission",
        }:
            fixed_total = calculate_fixed_seller_margin_total(
                fixed_amount=resolved_rule["fixed_amount"],
                quantity=_get_item_quantity(item),
                is_per_unit=resolved_rule["is_per_unit"],
            )

            pricing = calculate_pricing(
                original_price=item_original_price,
                customer_discount_percent=customer_discount_percent,
                fixed_seller_margin_amount=fixed_total,
            )

        elif rule_type in {
            "percentage",
            "percentage_commission",
            "percent",
        }:
            pricing = calculate_pricing(
                original_price=item_original_price,
                seller_margin_percent=resolved_rule["percentage"],
                customer_discount_percent=customer_discount_percent,
            )

        else:
            # Invalid/unknown rules must not break booking recalculation.
            # Fall back to existing percentage behavior.
            pricing = calculate_pricing(
                original_price=item_original_price,
                seller_margin_percent=(
                    get_item_default_seller_margin_percent(
                        booking,
                        item,
                    )
                ),
                customer_discount_percent=customer_discount_percent,
            )
    else:
        pricing = calculate_pricing(
            original_price=item_original_price,
            seller_margin_percent=(
                get_item_default_seller_margin_percent(
                    booking,
                    item,
                )
            ),
            customer_discount_percent=customer_discount_percent,
        )

    pricing["rule"] = resolved_rule
    pricing["item_id"] = getattr(item, "id", None)
    pricing["product_id"] = getattr(item, "product_id", None)
    pricing["quantity"] = _get_item_quantity(item)
    pricing["external_option_ids"] = (
        _get_item_external_option_identifiers(item)
    )

    return pricing


def calculate_booking_pricing(booking):
    """
    Calculate the booking's pricing using exact seller rules when available.

    Customer discount percentages are applied to each item. This produces the
    same booking-level discount amount while allowing every item to have a
    different seller allowance.

    Legacy global fixed commission behavior:
    - When no item-specific/product-specific rule exists anywhere in the
      booking, seller.fixed_commission_amount is applied once to the booking.
    - When at least one exact rule exists, unmatched items use the normal
      percentage fallback. This avoids accidentally applying one global fixed
      amount repeatedly across a mixed booking.
    """

    original_price = get_booking_original_price(booking)
    customer_discount_percent = (
        get_booking_customer_discount_percent(booking)
    )
    items = _get_booking_items(booking)

    if not items:
        global_fixed = (
            get_booking_global_fixed_commission_amount(booking)
        )

        return calculate_pricing(
            original_price=original_price,
            seller_margin_percent=(
                get_booking_seller_margin_percent(booking)
            ),
            customer_discount_percent=customer_discount_percent,
            fixed_seller_margin_amount=global_fixed,
        )

    resolved = [
        (
            item,
            resolve_seller_commission_rule_for_item(
                booking,
                item,
            ),
        )
        for item in items
    ]

    has_specific_rule = any(rule for _, rule in resolved)

    if not has_specific_rule:
        global_fixed = (
            get_booking_global_fixed_commission_amount(booking)
        )

        if global_fixed is not None:
            pricing = calculate_pricing(
                original_price=original_price,
                customer_discount_percent=(
                    customer_discount_percent
                ),
                fixed_seller_margin_amount=global_fixed,
            )
            pricing["item_pricing"] = []
            pricing["commission_rule_source"] = (
                "seller_global_fixed"
            )
            return pricing

    item_pricing = []

    for item, rule in resolved:
        pricing = _calculate_item_pricing(
            booking=booking,
            item=item,
            customer_discount_percent=(
                customer_discount_percent
            ),
            resolved_rule=rule,
        )

        if pricing:
            item_pricing.append(pricing)

    if not item_pricing:
        return calculate_pricing(
            original_price=original_price,
            seller_margin_percent=(
                get_booking_seller_margin_percent(booking)
            ),
            customer_discount_percent=customer_discount_percent,
        )

    total_original = sum(
        (
            money(row["original_price"])
            for row in item_pricing
        ),
        ZERO,
    )
    total_margin = sum(
        (
            money(row["seller_margin_amount"])
            for row in item_pricing
        ),
        ZERO,
    )
    total_discount = sum(
        (
            money(row["customer_discount_amount"])
            for row in item_pricing
        ),
        ZERO,
    )
    total_customer_price = sum(
        (
            money(row["customer_final_price"])
            for row in item_pricing
        ),
        ZERO,
    )
    total_commission = sum(
        (
            money(row["seller_commission_amount"])
            for row in item_pricing
        ),
        ZERO,
    )
    total_owner_net = sum(
        (
            money(row["owner_net_amount"])
            for row in item_pricing
        ),
        ZERO,
    )

    rule_types = {
        row.get("commission_rule_type", "percentage")
        for row in item_pricing
    }

    if len(rule_types) == 1:
        commission_rule_type = next(iter(rule_types))
    else:
        commission_rule_type = "mixed"

    return {
        "original_price": round_money(total_original),
        "seller_margin_percent": _amount_to_percent(
            total_margin,
            total_original,
        ),
        "seller_margin_amount": round_money(total_margin),
        "customer_discount_percent": _amount_to_percent(
            total_discount,
            total_original,
        ),
        "customer_discount_amount": round_money(total_discount),
        "customer_final_price": round_money(
            total_customer_price
        ),
        "seller_commission_percent": _amount_to_percent(
            total_commission,
            total_original,
        ),
        "seller_commission_amount": round_money(
            total_commission
        ),
        "owner_net_amount": round_money(total_owner_net),
        "commission_rule_type": commission_rule_type,
        "fixed_seller_margin_amount": (
            round_money(total_margin)
            if commission_rule_type == "fixed_amount"
            else None
        ),
        "commission_rule_source": (
            "seller_product_rules"
            if has_specific_rule
            else "legacy_percentage"
        ),
        "item_pricing": item_pricing,
    }


# ==========================================================
# Payment resolution
# ==========================================================

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

    explicit_receiver = getattr(
        payment,
        "collected_by_party",
        None,
    )

    if explicit_receiver:
        return explicit_receiver

    method = str(
        getattr(payment, "method", "") or ""
    ).lower()
    provider = str(
        getattr(payment, "provider", "") or ""
    ).lower()

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
    explicit = getattr(
        payment,
        "affects_owner_received",
        None,
    )

    if explicit is not None:
        return bool(explicit)

    receiver = get_payment_receiver(payment)
    return receiver in OWNER_RECEIVERS


def payment_affects_seller_collected(payment):
    explicit = getattr(
        payment,
        "affects_seller_collected",
        None,
    )

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
        confirmed_payments = booking.payments.filter(
            status="confirmed"
        )
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
        "owner_received_amount": max(
            round_money(owner_received),
            ZERO,
        ),
        "seller_collected_amount": max(
            round_money(seller_collected),
            ZERO,
        ),
        "customer_paid_total": max(
            round_money(customer_paid_total),
            ZERO,
        ),
        "refunded_total": round_money(refunded_total),
    }


def calculate_deposit_required(
    booking,
    customer_final_price,
):
    current_required = money(
        getattr(booking, "deposit_required", ZERO)
    )

    if current_required > ZERO:
        return current_required

    product = getattr(booking, "primary_product", None)

    if product:
        deposit_amount = money(
            getattr(product, "deposit_amount", ZERO)
        )

        if deposit_amount > ZERO:
            return min(
                deposit_amount,
                money(customer_final_price),
            )

        deposit_percentage = money(
            getattr(product, "deposit_percentage", ZERO)
        )

        if deposit_percentage > ZERO:
            return percentage_amount(
                customer_final_price,
                deposit_percentage,
            )

    return ZERO


def calculate_settlement_status(
    owner_net_amount,
    owner_received_amount,
    seller_due_to_company,
):
    owner_net_amount = money(owner_net_amount)
    owner_received_amount = money(owner_received_amount)
    seller_due_to_company = money(
        seller_due_to_company
    )

    if owner_net_amount <= ZERO:
        return SETTLEMENT_SETTLED

    if (
        seller_due_to_company <= ZERO
        and owner_received_amount >= owner_net_amount
    ):
        return SETTLEMENT_SETTLED

    if owner_received_amount > ZERO:
        return SETTLEMENT_PARTIALLY_SETTLED

    return SETTLEMENT_PENDING


# ==========================================================
# Complete booking snapshot
# ==========================================================

def calculate_booking_financial_snapshot(booking):
    """
    Return a complete booking financial snapshot without saving.
    """

    pricing = calculate_booking_pricing(booking)
    payments = calculate_confirmed_payments(booking)

    customer_final_price = money(
        pricing["customer_final_price"]
    )
    seller_commission_amount = money(
        pricing["seller_commission_amount"]
    )
    owner_net_amount = money(
        pricing["owner_net_amount"]
    )

    owner_received_amount = money(
        payments["owner_received_amount"]
    )
    seller_collected_amount = money(
        payments["seller_collected_amount"]
    )
    customer_paid_total = money(
        payments["customer_paid_total"]
    )

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

    if (
        payments["refunded_total"] > ZERO
        and customer_paid_total <= ZERO
    ):
        payment_status = BOOKING_PAYMENT_REFUNDED
    elif (
        paid_in_full(
            customer_final_price,
            customer_paid_total,
        )
        and customer_final_price > ZERO
    ):
        payment_status = BOOKING_PAYMENT_PAID
    elif deposit_met(
        deposit_required,
        customer_paid_total,
    ):
        payment_status = BOOKING_PAYMENT_DEPOSIT
    elif customer_paid_total > ZERO:
        payment_status = BOOKING_PAYMENT_PARTIAL
    else:
        payment_status = BOOKING_PAYMENT_UNPAID

    return {
        "original_price": pricing["original_price"],
        "subtotal_amount": pricing["original_price"],
        "seller_margin_percent": pricing[
            "seller_margin_percent"
        ],
        "customer_discount_percent": pricing[
            "customer_discount_percent"
        ],
        "customer_discount_amount": pricing[
            "customer_discount_amount"
        ],
        "discount_amount": pricing[
            "customer_discount_amount"
        ],
        "total_amount": pricing["customer_final_price"],
        "seller_commission_amount": (
            seller_commission_amount
        ),
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

        # Diagnostic metadata. These values are applied only when matching
        # fields exist on Booking; otherwise they remain available in snapshots.
        "commission_rule_type": pricing.get(
            "commission_rule_type",
            "percentage",
        ),
        "commission_rule_source": pricing.get(
            "commission_rule_source",
            "legacy_percentage",
        ),
        "fixed_seller_margin_amount": pricing.get(
            "fixed_seller_margin_amount",
        ),
        "item_pricing": pricing.get(
            "item_pricing",
            [],
        ),
    }


def apply_booking_financial_snapshot(
    booking,
    snapshot,
):
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

        # Optional future Booking fields.
        "commission_rule_type",
        "commission_rule_source",
        "fixed_seller_margin_amount",
        "item_pricing",
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
        if booking.status in [
            "draft",
            "pending_payment",
        ]:
            booking.status = "confirmed"
            updated_fields.append("status")

        if not booking.confirmed_at:
            booking.confirmed_at = timezone.now()
            updated_fields.append("confirmed_at")

    updated_fields.append("updated_at")

    booking.save(
        update_fields=list(
            dict.fromkeys(updated_fields)
        )
    )

    return booking


def recalculate_booking(booking):
    """
    Public function used by the rest of the app.
    """

    snapshot = calculate_booking_financial_snapshot(
        booking
    )

    return apply_booking_financial_snapshot(
        booking,
        snapshot,
    )


def calculate_booking(booking):
    """
    Alias for readability.
    """

    return recalculate_booking(booking)
