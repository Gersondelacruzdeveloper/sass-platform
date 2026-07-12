"""
Partner settlement generation services.

This module generates settlement periods and lines from:

- BookingFinancialSnapshot: frozen commercial and collection values;
- TicketAdmission: actual attendance when settlement basis is checked_in;
- Booking and booking-item dates/statuses;
- ProductBusinessAgreement settlement rules.

It does not record settlement payments. Payment recording and settlement status
transitions live in ticketing.finance.settlements.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone

from ticketing.models import (
    BookingFinancialSnapshot,
    PartnerSettlementLine,
    PartnerSettlementPeriod,
    ProductBusinessAgreement,
    TicketAdmission,
    TicketingBusinessEntity,
)

from ticketing.finance.utils import money

from .snapshots import (
    create_snapshot_for_item,
    get_or_create_snapshot_for_item,
)


ZERO = Decimal("0.00")

SETTLEMENT_DRAFT = "draft"
SETTLEMENT_REVIEW = "review"
SETTLEMENT_APPROVED = "approved"
SETTLEMENT_PARTIALLY_PAID = "partially_paid"
SETTLEMENT_SETTLED = "settled"
SETTLEMENT_DISPUTED = "disputed"
SETTLEMENT_CANCELLED = "cancelled"

MUTABLE_SETTLEMENT_STATUSES = {
    SETTLEMENT_DRAFT,
    SETTLEMENT_REVIEW,
    SETTLEMENT_DISPUTED,
}

LOCKED_SETTLEMENT_STATUSES = {
    SETTLEMENT_APPROVED,
    SETTLEMENT_PARTIALLY_PAID,
    SETTLEMENT_SETTLED,
    SETTLEMENT_CANCELLED,
}


class SettlementGenerationError(Exception):
    """Base error for settlement generation."""


class SettlementValidationError(SettlementGenerationError):
    pass


@dataclass(frozen=True)
class SettlementLineAmounts:
    booked_quantity: int
    admitted_quantity: int
    settlement_quantity: int
    gross_amount: Decimal
    discount_amount: Decimal
    refund_amount: Decimal
    partner_entitlement: Decimal
    platform_entitlement: Decimal
    seller_entitlement: Decimal
    collected_by_partner: Decimal
    collected_by_platform: Decimal
    collected_by_seller: Decimal
    customer_balance_due: Decimal
    partner_due_to_platform: Decimal
    platform_due_to_partner: Decimal
    net_amount: Decimal

    def as_dict(self) -> dict[str, Any]:
        return {
            "booked_quantity": self.booked_quantity,
            "admitted_quantity": self.admitted_quantity,
            "settlement_quantity": self.settlement_quantity,
            "gross_amount": str(self.gross_amount),
            "discount_amount": str(self.discount_amount),
            "refund_amount": str(self.refund_amount),
            "partner_entitlement": str(self.partner_entitlement),
            "platform_entitlement": str(self.platform_entitlement),
            "seller_entitlement": str(self.seller_entitlement),
            "collected_by_partner": str(self.collected_by_partner),
            "collected_by_platform": str(self.collected_by_platform),
            "collected_by_seller": str(self.collected_by_seller),
            "customer_balance_due": str(self.customer_balance_due),
            "partner_due_to_platform": str(self.partner_due_to_platform),
            "platform_due_to_partner": str(self.platform_due_to_partner),
            "net_amount": str(self.net_amount),
        }


def _period_overlap_exists(
    *,
    organisation,
    business_entity,
    period_start,
    period_end,
    exclude_settlement=None,
):
    queryset = PartnerSettlementPeriod.objects.filter(
        organisation=organisation,
        business_entity=business_entity,
        period_start__lte=period_end,
        period_end__gte=period_start,
    ).exclude(status=SETTLEMENT_CANCELLED)

    if exclude_settlement:
        queryset = queryset.exclude(pk=exclude_settlement.pk)

    return queryset.exists()


def _build_settlement_number(
    organisation,
    business_entity,
    period_start,
    period_end,
):
    return (
        f"SET-{organisation.id}-{business_entity.id}-"
        f"{period_start:%Y%m%d}-{period_end:%Y%m%d}"
    )


def calculate_next_period(
    business_entity: TicketingBusinessEntity,
    *,
    reference_date: date | None = None,
):
    """
    Calculate the current cycle using settlement_cycle_days and anchor date.
    """

    reference_date = reference_date or timezone.localdate()
    cycle_days = max(int(business_entity.settlement_cycle_days or 10), 1)
    anchor = business_entity.settlement_anchor_date or reference_date

    delta_days = (reference_date - anchor).days
    cycle_index = delta_days // cycle_days

    period_start = anchor + timedelta(days=cycle_index * cycle_days)
    period_end = period_start + timedelta(days=cycle_days - 1)

    return period_start, period_end


def _eligible_snapshots(
    *,
    organisation,
    business_entity,
    period_start,
    period_end,
):
    return (
        BookingFinancialSnapshot.objects.filter(
            organisation=organisation,
            business_entity=business_entity,
        )
        .select_related(
            "booking",
            "booking_item",
            "booking_item__product",
            "agreement",
            "business_entity",
        )
        .filter(
            Q(
                booking_item__service_date__range=(
                    period_start,
                    period_end,
                )
            )
            | Q(
                booking_item__service_date__isnull=True,
                booking__service_date__range=(
                    period_start,
                    period_end,
                ),
            )
        )
        .exclude(booking__status__in=["cancelled", "refunded"])
        .order_by("booking_item__service_date", "booking_id", "booking_item_id")
    )


def _admitted_quantity_for_snapshot(snapshot):
    total = TicketAdmission.objects.filter(
        organisation=snapshot.organisation,
        business_entity=snapshot.business_entity,
        booking_item=snapshot.booking_item,
        status="admitted",
    ).aggregate(total=Sum("quantity_admitted"))["total"]

    return int(total or 0)


def _settlement_quantity(snapshot, admitted_quantity):
    basis = snapshot.settlement_basis or "confirmed_booking"
    booked_quantity = int(snapshot.quantity or 0)

    if basis == "checked_in":
        return min(admitted_quantity, booked_quantity)

    if basis == "fully_paid_booking":
        return booked_quantity if snapshot.booking.payment_status == "paid" else 0

    if basis == "provider_confirmation":
        return booked_quantity if snapshot.booking.external_status in {
            "confirmed",
            "booked",
            "completed",
            "success",
        } else 0

    # confirmed_booking default
    return booked_quantity if snapshot.booking.status in {
        "confirmed",
        "ticket_generated",
        "completed",
    } else 0


def _scaled_amount(value, booked_quantity, settlement_quantity):
    value = money(value)

    if booked_quantity <= 0 or settlement_quantity <= 0:
        return ZERO

    if settlement_quantity >= booked_quantity:
        return value

    return money(
        value * Decimal(settlement_quantity) / Decimal(booked_quantity)
    )


def calculate_settlement_line_amounts(snapshot):
    booked_quantity = int(snapshot.quantity or 0)
    admitted_quantity = _admitted_quantity_for_snapshot(snapshot)
    settlement_quantity = _settlement_quantity(
        snapshot,
        admitted_quantity,
    )

    gross_amount = _scaled_amount(
        snapshot.gross_amount,
        booked_quantity,
        settlement_quantity,
    )
    discount_amount = _scaled_amount(
        snapshot.discount_amount,
        booked_quantity,
        settlement_quantity,
    )
    partner_entitlement = _scaled_amount(
        snapshot.partner_entitlement,
        booked_quantity,
        settlement_quantity,
    )
    platform_entitlement = _scaled_amount(
        snapshot.platform_entitlement,
        booked_quantity,
        settlement_quantity,
    )
    seller_entitlement = _scaled_amount(
        snapshot.seller_entitlement,
        booked_quantity,
        settlement_quantity,
    )
    collected_by_partner = _scaled_amount(
        snapshot.collected_by_partner,
        booked_quantity,
        settlement_quantity,
    )
    collected_by_platform = _scaled_amount(
        snapshot.collected_by_platform,
        booked_quantity,
        settlement_quantity,
    )
    collected_by_seller = _scaled_amount(
        snapshot.collected_by_seller,
        booked_quantity,
        settlement_quantity,
    )
    customer_balance_due = _scaled_amount(
        snapshot.customer_balance_due,
        booked_quantity,
        settlement_quantity,
    )

    refund_amount = ZERO
    if snapshot.booking.status == "refunded":
        refund_amount = gross_amount

    # What the partner collected above its entitlement belongs back to platform.
    partner_due_to_platform = max(
        money(collected_by_partner - partner_entitlement),
        ZERO,
    )

    # What platform collected but economically belongs to the partner.
    platform_due_to_partner = max(
        money(partner_entitlement - collected_by_partner),
        ZERO,
    )

    # Positive net means partner owes platform; negative means platform owes partner.
    net_amount = money(
        partner_due_to_platform - platform_due_to_partner
    )

    return SettlementLineAmounts(
        booked_quantity=booked_quantity,
        admitted_quantity=admitted_quantity,
        settlement_quantity=settlement_quantity,
        gross_amount=gross_amount,
        discount_amount=discount_amount,
        refund_amount=refund_amount,
        partner_entitlement=partner_entitlement,
        platform_entitlement=platform_entitlement,
        seller_entitlement=seller_entitlement,
        collected_by_partner=collected_by_partner,
        collected_by_platform=collected_by_platform,
        collected_by_seller=collected_by_seller,
        customer_balance_due=customer_balance_due,
        partner_due_to_platform=partner_due_to_platform,
        platform_due_to_partner=platform_due_to_partner,
        net_amount=net_amount,
    )


def _create_line(settlement, snapshot):
    amounts = calculate_settlement_line_amounts(snapshot)

    service_date = (
        snapshot.booking_item.service_date
        or snapshot.booking.service_date
    )

    return PartnerSettlementLine.objects.create(
        settlement=settlement,
        booking=snapshot.booking,
        booking_item=snapshot.booking_item,
        financial_snapshot=snapshot,
        service_date=service_date,
        booked_quantity=amounts.booked_quantity,
        admitted_quantity=amounts.admitted_quantity,
        settlement_quantity=amounts.settlement_quantity,
        gross_amount=amounts.gross_amount,
        discount_amount=amounts.discount_amount,
        refund_amount=amounts.refund_amount,
        partner_entitlement=amounts.partner_entitlement,
        platform_entitlement=amounts.platform_entitlement,
        seller_entitlement=amounts.seller_entitlement,
        collected_by_partner=amounts.collected_by_partner,
        collected_by_platform=amounts.collected_by_platform,
        collected_by_seller=amounts.collected_by_seller,
        customer_balance_due=amounts.customer_balance_due,
        partner_due_to_platform=amounts.partner_due_to_platform,
        platform_due_to_partner=amounts.platform_due_to_partner,
        net_amount=amounts.net_amount,
        calculation_data={
            "settlement_basis": snapshot.settlement_basis,
            "agreement_id": snapshot.agreement_id,
            "agreement_version": snapshot.agreement_version,
            "snapshot_id": snapshot.id,
            "amounts": amounts.as_dict(),
        },
    )


def _aggregate_settlement(settlement):
    totals = settlement.lines.aggregate(
        total_bookings=Count("booking", distinct=True),
        total_guests_booked=Sum("booked_quantity"),
        total_guests_admitted=Sum("admitted_quantity"),
        gross_sales=Sum("gross_amount"),
        discounts=Sum("discount_amount"),
        refunds=Sum("refund_amount"),
        partner_entitlement=Sum("partner_entitlement"),
        platform_entitlement=Sum("platform_entitlement"),
        seller_entitlement=Sum("seller_entitlement"),
        collected_by_partner=Sum("collected_by_partner"),
        collected_by_platform=Sum("collected_by_platform"),
        collected_by_sellers=Sum("collected_by_seller"),
        customer_balance_due=Sum("customer_balance_due"),
        partner_owes_platform=Sum("partner_due_to_platform"),
        platform_owes_partner=Sum("platform_due_to_partner"),
        net_settlement_amount=Sum("net_amount"),
    )

    total_guests_booked = int(totals["total_guests_booked"] or 0)
    total_guests_admitted = int(totals["total_guests_admitted"] or 0)

    settlement.total_bookings = int(totals["total_bookings"] or 0)
    settlement.total_guests_booked = total_guests_booked
    settlement.total_guests_admitted = total_guests_admitted
    settlement.total_no_shows = max(
        total_guests_booked - total_guests_admitted,
        0,
    )

    for field in [
        "gross_sales",
        "discounts",
        "refunds",
        "partner_entitlement",
        "platform_entitlement",
        "seller_entitlement",
        "collected_by_partner",
        "collected_by_platform",
        "collected_by_sellers",
        "customer_balance_due",
        "partner_owes_platform",
        "platform_owes_partner",
        "net_settlement_amount",
    ]:
        setattr(settlement, field, money(totals[field] or ZERO))

    settlement.calculation_data = {
        **(settlement.calculation_data or {}),
        "generated_from_lines": settlement.lines.count(),
        "generated_at": timezone.now().isoformat(),
    }

    settlement.save()
    return settlement


@transaction.atomic
def generate_partner_settlement(
    *,
    organisation,
    business_entity,
    period_start,
    period_end,
    generated_by=None,
    notes="",
    regenerate_draft=False,
):
    """
    Generate or regenerate a partner settlement period.

    Existing approved, partially-paid, settled, or cancelled settlements are
    never overwritten.
    """

    if business_entity.organisation_id != organisation.id:
        raise SettlementValidationError(
            "The business entity belongs to another organisation."
        )

    if period_end < period_start:
        raise SettlementValidationError(
            "Settlement period end cannot be before start."
        )

    existing = (
        PartnerSettlementPeriod.objects.select_for_update()
        .filter(
            organisation=organisation,
            business_entity=business_entity,
            period_start=period_start,
            period_end=period_end,
        )
        .first()
    )

    if existing and existing.status in LOCKED_SETTLEMENT_STATUSES:
        raise SettlementValidationError(
            "This settlement period is locked and cannot be regenerated."
        )

    if existing and not regenerate_draft:
        return existing

    if (
        not existing
        and _period_overlap_exists(
            organisation=organisation,
            business_entity=business_entity,
            period_start=period_start,
            period_end=period_end,
        )
    ):
        raise SettlementValidationError(
            "Another active settlement overlaps this period."
        )

    if existing:
        settlement = existing
        settlement.lines.all().delete()
        settlement.status = SETTLEMENT_DRAFT
        settlement.generated_by = generated_by
        settlement.generated_at = timezone.now()
        settlement.notes = notes or settlement.notes
        settlement.save(
            update_fields=[
                "status",
                "generated_by",
                "generated_at",
                "notes",
                "updated_at",
            ]
        )
    else:
        settlement = PartnerSettlementPeriod.objects.create(
            organisation=organisation,
            business_entity=business_entity,
            settlement_number=_build_settlement_number(
                organisation,
                business_entity,
                period_start,
                period_end,
            ),
            period_start=period_start,
            period_end=period_end,
            currency=business_entity.currency,
            status=SETTLEMENT_DRAFT,
            generated_at=timezone.now(),
            generated_by=generated_by,
            notes=notes,
        )

    snapshots = _eligible_snapshots(
        organisation=organisation,
        business_entity=business_entity,
        period_start=period_start,
        period_end=period_end,
    )

    for snapshot in snapshots:
        _create_line(settlement, snapshot)

    return _aggregate_settlement(settlement)


@transaction.atomic
def ensure_snapshots_and_generate(
    *,
    organisation,
    business_entity,
    period_start,
    period_end,
    generated_by=None,
    notes="",
    regenerate_draft=False,
):
    """
    Backfill missing snapshots for matching booking items, then generate.
    """

    agreements = ProductBusinessAgreement.objects.filter(
        organisation=organisation,
        business_entity=business_entity,
        is_active=True,
        effective_from__lte=period_end,
    ).filter(
        Q(effective_until__isnull=True)
        | Q(effective_until__gte=period_start)
    ).select_related("product")

    for agreement in agreements:
        booking_items = agreement.product.booking_items.filter(
            booking__organisation=organisation,
        ).filter(
            Q(service_date__range=(period_start, period_end))
            | Q(
                service_date__isnull=True,
                booking__service_date__range=(period_start, period_end),
            )
        ).select_related("booking", "product")

        for item in booking_items:
            create_snapshot_for_item(
                item,
                agreement=agreement,
                business_entity=business_entity,
                force_refresh=False,
            )

    return generate_partner_settlement(
        organisation=organisation,
        business_entity=business_entity,
        period_start=period_start,
        period_end=period_end,
        generated_by=generated_by,
        notes=notes,
        regenerate_draft=regenerate_draft,
    )


def settlement_preview(
    *,
    organisation,
    business_entity,
    period_start,
    period_end,
):
    """
    Return a non-persistent preview.
    """

    rows = []
    totals = {
        "gross_sales": ZERO,
        "partner_entitlement": ZERO,
        "platform_entitlement": ZERO,
        "seller_entitlement": ZERO,
        "collected_by_partner": ZERO,
        "collected_by_platform": ZERO,
        "collected_by_sellers": ZERO,
        "partner_owes_platform": ZERO,
        "platform_owes_partner": ZERO,
        "net_settlement_amount": ZERO,
    }

    snapshots = _eligible_snapshots(
        organisation=organisation,
        business_entity=business_entity,
        period_start=period_start,
        period_end=period_end,
    )

    booking_ids = set()
    total_guests_booked = 0
    total_guests_admitted = 0

    for snapshot in snapshots:
        amounts = calculate_settlement_line_amounts(snapshot)
        booking_ids.add(snapshot.booking_id)
        total_guests_booked += amounts.booked_quantity
        total_guests_admitted += amounts.admitted_quantity

        rows.append(
            {
                "booking_id": snapshot.booking_id,
                "booking_code": snapshot.booking.booking_code,
                "booking_item_id": snapshot.booking_item_id,
                "product_name": snapshot.booking_item.product_name,
                "service_date": str(
                    snapshot.booking_item.service_date
                    or snapshot.booking.service_date
                    or ""
                ),
                **amounts.as_dict(),
            }
        )

        totals["gross_sales"] += amounts.gross_amount
        totals["partner_entitlement"] += amounts.partner_entitlement
        totals["platform_entitlement"] += amounts.platform_entitlement
        totals["seller_entitlement"] += amounts.seller_entitlement
        totals["collected_by_partner"] += amounts.collected_by_partner
        totals["collected_by_platform"] += amounts.collected_by_platform
        totals["collected_by_sellers"] += amounts.collected_by_seller
        totals["partner_owes_platform"] += amounts.partner_due_to_platform
        totals["platform_owes_partner"] += amounts.platform_due_to_partner
        totals["net_settlement_amount"] += amounts.net_amount

    return {
        "business_entity_id": business_entity.id,
        "business_entity_name": business_entity.name,
        "period_start": str(period_start),
        "period_end": str(period_end),
        "currency": business_entity.currency,
        "total_bookings": len(booking_ids),
        "total_guests_booked": total_guests_booked,
        "total_guests_admitted": total_guests_admitted,
        "total_no_shows": max(
            total_guests_booked - total_guests_admitted,
            0,
        ),
        "totals": {
            key: str(money(value))
            for key, value in totals.items()
        },
        "lines": rows,
    }
