"""
Booking financial snapshot services.

This module freezes the financial contract and calculated allocations for each
booking item so later product, seller, payment, or partner-agreement changes do
not rewrite historical settlement results.

Snapshots are designed to be idempotent:
- create_snapshot_for_item() reuses an existing snapshot by default;
- refresh_snapshot_for_item() updates only when explicitly requested;
- create_snapshots_for_booking() processes all booking items safely.

This module does not generate settlement periods. Partner settlement generation
belongs in ticketing.operations.settlements.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ticketing.models import (
    Booking,
    BookingFinancialSnapshot,
    BookingItem,
    BookingPayment,
    ProductBusinessAgreement,
    SellerCommission,
    TicketingBusinessEntity,
)

from ticketing.finance.utils import money

from .tokens import get_active_agreement


ZERO = Decimal("0.00")
ONE_HUNDRED = Decimal("100.00")


class SnapshotError(Exception):
    """Base error for snapshot operations."""


class SnapshotValidationError(SnapshotError):
    pass


@dataclass(frozen=True)
class SnapshotAmounts:
    gross_amount: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    net_customer_amount: Decimal
    partner_entitlement: Decimal
    platform_entitlement: Decimal
    seller_entitlement: Decimal
    collected_by_platform: Decimal
    collected_by_partner: Decimal
    collected_by_seller: Decimal
    customer_balance_due: Decimal
    primary_collection_party: str

    def as_dict(self) -> dict[str, str]:
        return {
            "gross_amount": str(self.gross_amount),
            "discount_amount": str(self.discount_amount),
            "tax_amount": str(self.tax_amount),
            "net_customer_amount": str(self.net_customer_amount),
            "partner_entitlement": str(self.partner_entitlement),
            "platform_entitlement": str(self.platform_entitlement),
            "seller_entitlement": str(self.seller_entitlement),
            "collected_by_platform": str(self.collected_by_platform),
            "collected_by_partner": str(self.collected_by_partner),
            "collected_by_seller": str(self.collected_by_seller),
            "customer_balance_due": str(self.customer_balance_due),
            "primary_collection_party": self.primary_collection_party,
        }


def _percentage(amount, percent):
    amount = money(amount)
    percent = money(percent)
    return money((amount * percent) / ONE_HUNDRED)


def _safe_decimal(value):
    return money(value or ZERO)


def _booking_item_gross(item: BookingItem):
    total = getattr(item, "total", None)
    if total is not None:
        return money(total)

    unit_price = _safe_decimal(getattr(item, "unit_price", ZERO))
    quantity = Decimal(str(getattr(item, "quantity", 0) or 0))
    return money(unit_price * quantity)


def _proportional_share(booking_amount, item_gross, booking_gross):
    booking_amount = money(booking_amount)
    item_gross = money(item_gross)
    booking_gross = money(booking_gross)

    if booking_amount <= ZERO or booking_gross <= ZERO or item_gross <= ZERO:
        return ZERO

    return money((booking_amount * item_gross) / booking_gross)


def _booking_gross_total(booking: Booking):
    total = booking.items.aggregate(total=Sum("total"))["total"]
    return money(total or booking.subtotal_amount or ZERO)


def _resolve_item_discount(item, booking_gross):
    booking = item.booking

    booking_discount = money(
        getattr(booking, "customer_discount_amount", ZERO)
        or getattr(booking, "discount_amount", ZERO)
        or ZERO
    )
    return _proportional_share(
        booking_discount,
        _booking_item_gross(item),
        booking_gross,
    )


def _resolve_item_tax(item, booking_gross):
    booking = item.booking
    return _proportional_share(
        getattr(booking, "tax_amount", ZERO),
        _booking_item_gross(item),
        booking_gross,
    )


def _resolve_seller_entitlement(item, booking_gross):
    booking = item.booking

    direct_commission = (
        SellerCommission.objects.filter(
            booking=booking,
            seller=booking.seller,
        ).aggregate(total=Sum("amount"))["total"]
        if booking.seller_id
        else ZERO
    )

    commission_total = money(
        direct_commission
        or getattr(booking, "seller_commission_amount", ZERO)
        or ZERO
    )

    return _proportional_share(
        commission_total,
        _booking_item_gross(item),
        booking_gross,
    )


def _resolve_collection_totals(booking: Booking):
    confirmed = booking.payments.filter(status="confirmed")

    platform_total = confirmed.filter(
        collected_by_party__in=[
            "owner",
            "bank",
            "online_provider",
            "platform",
        ],
    ).aggregate(total=Sum("amount"))["total"]

    seller_total = confirmed.filter(
        collected_by_party="seller",
    ).aggregate(total=Sum("amount"))["total"]

    partner_total = confirmed.filter(
        collected_by_party__in=[
            "partner",
            "business_entity",
            "venue",
        ],
    ).aggregate(total=Sum("amount"))["total"]

    if platform_total is None:
        platform_total = getattr(booking, "owner_received_amount", ZERO)

    if seller_total is None:
        seller_total = getattr(booking, "seller_collected_amount", ZERO)

    return {
        "platform": money(platform_total or ZERO),
        "seller": money(seller_total or ZERO),
        "partner": money(partner_total or ZERO),
    }


def _resolve_primary_collection_party(collection_mode, totals):
    if collection_mode in {
        "platform_collects",
        "partner_collects",
        "seller_collects",
        "mixed",
        "customer_pays_partner",
    }:
        mapping = {
            "platform_collects": "platform",
            "partner_collects": "partner",
            "seller_collects": "seller",
            "customer_pays_partner": "partner",
            "mixed": "mixed",
        }
        return mapping[collection_mode]

    non_zero = [
        party
        for party, amount in totals.items()
        if money(amount) > ZERO
    ]

    if len(non_zero) == 1:
        return non_zero[0]
    if len(non_zero) > 1:
        return "mixed"
    return "none"


def _calculate_partner_entitlement(
    agreement: ProductBusinessAgreement | None,
    net_customer_amount,
):
    if not agreement:
        return ZERO

    agreement_type = agreement.agreement_type
    net_customer_amount = money(net_customer_amount)

    if agreement_type == "fixed_partner_net":
        return money(agreement.partner_fixed_amount)

    if agreement_type == "percentage_split":
        return _percentage(
            net_customer_amount,
            agreement.partner_percentage,
        )

    if agreement_type == "fixed_platform_commission":
        return max(
            money(net_customer_amount - agreement.platform_fixed_amount),
            ZERO,
        )

    if agreement_type == "percentage_platform_commission":
        platform_share = _percentage(
            net_customer_amount,
            agreement.platform_percentage,
        )
        return max(money(net_customer_amount - platform_share), ZERO)

    if agreement_type == "custom":
        if money(agreement.partner_fixed_amount) > ZERO:
            return money(agreement.partner_fixed_amount)
        if money(agreement.partner_percentage) > ZERO:
            return _percentage(
                net_customer_amount,
                agreement.partner_percentage,
            )

    return ZERO


def _calculate_platform_entitlement(
    agreement: ProductBusinessAgreement | None,
    net_customer_amount,
    partner_entitlement,
    seller_entitlement,
):
    net_customer_amount = money(net_customer_amount)
    partner_entitlement = money(partner_entitlement)
    seller_entitlement = money(seller_entitlement)

    if agreement:
        if agreement.agreement_type == "fixed_platform_commission":
            return money(agreement.platform_fixed_amount)

        if agreement.agreement_type == "percentage_platform_commission":
            return _percentage(
                net_customer_amount,
                agreement.platform_percentage,
            )

        if (
            agreement.agreement_type == "custom"
            and money(agreement.platform_fixed_amount) > ZERO
        ):
            return money(agreement.platform_fixed_amount)

        if (
            agreement.agreement_type == "custom"
            and money(agreement.platform_percentage) > ZERO
        ):
            return _percentage(
                net_customer_amount,
                agreement.platform_percentage,
            )

    return max(
        money(
            net_customer_amount
            - partner_entitlement
            - seller_entitlement
        ),
        ZERO,
    )


def calculate_snapshot_amounts(
    item: BookingItem,
    agreement: ProductBusinessAgreement | None = None,
) -> SnapshotAmounts:
    booking = item.booking
    booking_gross = _booking_gross_total(booking)
    gross_amount = _booking_item_gross(item)
    discount_amount = _resolve_item_discount(item, booking_gross)
    tax_amount = _resolve_item_tax(item, booking_gross)

    net_customer_amount = max(
        money(gross_amount - discount_amount + tax_amount),
        ZERO,
    )

    seller_entitlement = _resolve_seller_entitlement(
        item,
        booking_gross,
    )

    partner_entitlement = _calculate_partner_entitlement(
        agreement,
        net_customer_amount,
    )

    platform_entitlement = _calculate_platform_entitlement(
        agreement,
        net_customer_amount,
        partner_entitlement,
        seller_entitlement,
    )

    collections = _resolve_collection_totals(booking)

    item_ratio = (
        Decimal("0.00")
        if booking_gross <= ZERO
        else gross_amount / booking_gross
    )

    collected_by_platform = money(
        collections["platform"] * item_ratio
    )
    collected_by_partner = money(
        collections["partner"] * item_ratio
    )
    collected_by_seller = money(
        collections["seller"] * item_ratio
    )

    collected_total = money(
        collected_by_platform
        + collected_by_partner
        + collected_by_seller
    )

    customer_balance_due = max(
        money(net_customer_amount - collected_total),
        ZERO,
    )

    collection_mode = (
        agreement.collection_mode
        if agreement
        else ""
    )

    primary_collection_party = _resolve_primary_collection_party(
        collection_mode,
        {
            "platform": collected_by_platform,
            "partner": collected_by_partner,
            "seller": collected_by_seller,
        },
    )

    return SnapshotAmounts(
        gross_amount=gross_amount,
        discount_amount=discount_amount,
        tax_amount=tax_amount,
        net_customer_amount=net_customer_amount,
        partner_entitlement=partner_entitlement,
        platform_entitlement=platform_entitlement,
        seller_entitlement=seller_entitlement,
        collected_by_platform=collected_by_platform,
        collected_by_partner=collected_by_partner,
        collected_by_seller=collected_by_seller,
        customer_balance_due=customer_balance_due,
        primary_collection_party=primary_collection_party,
    )


def _snapshot_defaults(
    item: BookingItem,
    agreement: ProductBusinessAgreement | None,
    business_entity: TicketingBusinessEntity | None,
    amounts: SnapshotAmounts,
):
    booking = item.booking

    return {
        "organisation": booking.organisation,
        "booking": booking,
        "booking_item": item,
        "business_entity": business_entity,
        "agreement": agreement,
        "agreement_version": (
            agreement.version if agreement else 0
        ),
        "settlement_basis": (
            agreement.settlement_basis
            if agreement
            else "confirmed_booking"
        ),
        "currency": (
            agreement.currency
            if agreement and agreement.currency
            else getattr(
                getattr(
                    booking.organisation,
                    "ticketing_settings",
                    None,
                ),
                "default_currency",
                "USD",
            )
        ),
        "quantity": int(getattr(item, "quantity", 0) or 0),
        "gross_amount": amounts.gross_amount,
        "discount_amount": amounts.discount_amount,
        "tax_amount": amounts.tax_amount,
        "net_customer_amount": amounts.net_customer_amount,
        "partner_entitlement": amounts.partner_entitlement,
        "platform_entitlement": amounts.platform_entitlement,
        "seller_entitlement": amounts.seller_entitlement,
        "collected_by_platform": amounts.collected_by_platform,
        "collected_by_partner": amounts.collected_by_partner,
        "collected_by_seller": amounts.collected_by_seller,
        "customer_balance_due": amounts.customer_balance_due,
        "primary_collection_party": amounts.primary_collection_party,
        "calculation_data": {
            "captured_from": "booking_item",
            "booking_status": booking.status,
            "payment_status": booking.payment_status,
            "payment_mode": booking.payment_mode,
            "payment_method": booking.payment_method,
            "agreement_type": (
                agreement.agreement_type if agreement else None
            ),
            "collection_mode": (
                agreement.collection_mode if agreement else None
            ),
            "seller_commission_included": (
                agreement.seller_commission_included
                if agreement
                else False
            ),
            "amounts": amounts.as_dict(),
        },
    }


@transaction.atomic
def create_snapshot_for_item(
    item: BookingItem,
    *,
    agreement: ProductBusinessAgreement | None = None,
    business_entity: TicketingBusinessEntity | None = None,
    force_refresh: bool = False,
) -> BookingFinancialSnapshot:
    """
    Create or explicitly refresh one booking-item snapshot.
    """

    item = (
        BookingItem.objects.select_for_update()
        .select_related(
            "booking",
            "booking__organisation",
            "booking__seller",
            "product",
        )
        .get(pk=item.pk)
    )

    if agreement and agreement.product_id != item.product_id:
        raise SnapshotValidationError(
            "The selected agreement does not belong to this product."
        )

    if agreement and agreement.organisation_id != item.booking.organisation_id:
        raise SnapshotValidationError(
            "The selected agreement belongs to another organisation."
        )

    if business_entity and business_entity.organisation_id != item.booking.organisation_id:
        raise SnapshotValidationError(
            "The business entity belongs to another organisation."
        )

    if not agreement:
        agreement = get_active_agreement(
            item,
            business_entity=business_entity,
        )

    if not business_entity and agreement:
        business_entity = agreement.business_entity

    existing = (
        BookingFinancialSnapshot.objects.select_for_update()
        .filter(booking_item=item)
        .first()
    )

    if existing and not force_refresh:
        return existing

    amounts = calculate_snapshot_amounts(
        item,
        agreement=agreement,
    )
    defaults = _snapshot_defaults(
        item,
        agreement,
        business_entity,
        amounts,
    )

    if existing:
        for field, value in defaults.items():
            setattr(existing, field, value)
        existing.captured_at = timezone.now()
        existing.save()
        return existing

    return BookingFinancialSnapshot.objects.create(**defaults)


def refresh_snapshot_for_item(
    item: BookingItem,
    *,
    agreement: ProductBusinessAgreement | None = None,
    business_entity: TicketingBusinessEntity | None = None,
):
    return create_snapshot_for_item(
        item,
        agreement=agreement,
        business_entity=business_entity,
        force_refresh=True,
    )


@transaction.atomic
def create_snapshots_for_booking(
    booking: Booking,
    *,
    force_refresh: bool = False,
) -> list[BookingFinancialSnapshot]:
    """
    Create snapshots for all booking items.
    """

    booking = (
        Booking.objects.select_for_update()
        .select_related("organisation", "seller")
        .get(pk=booking.pk)
    )

    snapshots = []

    items = (
        booking.items.select_related(
            "booking",
            "booking__organisation",
            "product",
        )
        .order_by("id")
    )

    for item in items:
        snapshots.append(
            create_snapshot_for_item(
                item,
                force_refresh=force_refresh,
            )
        )

    return snapshots


def get_or_create_snapshot_for_item(
    item: BookingItem,
) -> BookingFinancialSnapshot:
    snapshot = BookingFinancialSnapshot.objects.filter(
        booking_item=item
    ).first()

    return snapshot or create_snapshot_for_item(item)


def snapshot_summary_for_booking(booking: Booking) -> dict[str, Decimal]:
    totals = BookingFinancialSnapshot.objects.filter(
        booking=booking
    ).aggregate(
        gross=Sum("gross_amount"),
        discount=Sum("discount_amount"),
        tax=Sum("tax_amount"),
        net=Sum("net_customer_amount"),
        partner=Sum("partner_entitlement"),
        platform=Sum("platform_entitlement"),
        seller=Sum("seller_entitlement"),
        collected_platform=Sum("collected_by_platform"),
        collected_partner=Sum("collected_by_partner"),
        collected_seller=Sum("collected_by_seller"),
        balance=Sum("customer_balance_due"),
    )

    return {
        key: money(value or ZERO)
        for key, value in totals.items()
    }
