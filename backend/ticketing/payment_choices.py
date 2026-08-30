from __future__ import annotations

from decimal import Decimal
from typing import Iterable

from django.core.exceptions import ObjectDoesNotExist


PAYMENT_CHOICE_ORDER = ("full", "deposit", "pending", "cash")


def organisation_payment_choices(organisation) -> list[str]:
    try:
        settings = organisation.ticketing_settings
    except ObjectDoesNotExist:
        settings = None
    if settings is None or not settings.is_active:
        return []
    flags = {
        "full": settings.allow_full_payment,
        "deposit": settings.allow_deposit_payment,
        "pending": settings.allow_pending_payment,
        "cash": settings.allow_cash_to_seller,
    }
    return [choice for choice in PAYMENT_CHOICE_ORDER if flags[choice]]


def allowed_payment_choices(*, organisation, products: Iterable) -> list[str]:
    """Return choices allowed by both tenant settings and every product."""
    try:
        settings = organisation.ticketing_settings
    except ObjectDoesNotExist:
        settings = None
    if settings is None or not settings.is_active:
        return []
    products = list(products)
    if not products:
        return []

    product_fields = {
        "full": "allow_full_payment",
        "deposit": "allow_deposit_payment",
        "pending": "allow_pending_payment",
        "cash": "allow_cash_payment",
    }

    choices = []
    for choice in PAYMENT_CHOICE_ORDER:
        if choice not in organisation_payment_choices(organisation):
            continue
        if not all(bool(getattr(product, product_fields[choice], False)) for product in products):
            continue
        if choice == "deposit" and not all(
            _has_deposit(product, settings.default_deposit_percentage)
            for product in products
        ):
            continue
        choices.append(choice)
    return choices


def preferred_payment_choice(*, provider_settings, allowed: list[str]) -> str:
    configured = str(
        getattr(provider_settings, "default_customer_payment_choice", "") or ""
    ).strip().lower()
    if configured in allowed:
        return configured
    return allowed[0] if allowed else ""


def _has_deposit(product, tenant_percentage) -> bool:
    return any(
        Decimal(str(value or "0")) > 0
        for value in (
            getattr(product, "deposit_amount", 0),
            getattr(product, "deposit_percentage", 0),
            tenant_percentage,
        )
    )
