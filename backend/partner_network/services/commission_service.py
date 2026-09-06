from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
)

MONEY = Decimal("0.01")
HUNDRED = Decimal("100")


def money(value):
    return Decimal(str(value or "0")).quantize(MONEY, rounding=ROUND_HALF_UP)


def resolve_commission_rule(*, attribution, product=None, on_date=None):
    on_date = on_date or timezone.localdate()
    rules = ReferralCommissionRule.objects.filter(
        organisation=attribution.booking.organisation,
        is_active=True,
        effective_from__lte=on_date,
    ).filter(Q(effective_until__isnull=True) | Q(effective_until__gte=on_date))

    candidates = [
        rules.filter(
            partner=attribution.partner,
            partner_location=attribution.partner_location,
            product=product,
        ),
        rules.filter(
            partner=attribution.partner,
            partner_location__isnull=True,
            product=product,
        ),
        rules.filter(
            partner=attribution.partner,
            partner_location__isnull=True,
            product__isnull=True,
        ),
        rules.filter(
            partner__isnull=True,
            partner_location__isnull=True,
            product=product,
        ),
        rules.filter(
            partner__isnull=True,
            partner_location__isnull=True,
            product__isnull=True,
        ),
    ]
    for queryset in candidates:
        rule = queryset.order_by("-effective_from", "-pk").first()
        if rule:
            return rule
    return None


def _platform_margin_for_item(booking, item):
    unit_cost = money(getattr(item, "unit_cost", 0))
    quantity = Decimal(str(getattr(item, "quantity", 1) or 1))
    item_cost = unit_cost * quantity
    return max(money(item.total) - money(item_cost), Decimal("0.00"))


def calculate_commission_amount(*, rule, booking, item=None):
    if rule.commission_type == ReferralCommissionRule.TYPE_FIXED_BOOKING:
        return money(rule.commission_value)

    if rule.commission_type == ReferralCommissionRule.TYPE_FIXED_GUEST:
        guests = int(getattr(booking, "total_guests", 0) or 0)
        return money(Decimal(str(rule.commission_value)) * guests)

    # Percentage-of-sale does not need cost/margin data. Resolve and return it
    # before touching booking.items so this calculation stays independent from
    # margin-specific relations and avoids unnecessary database work.
    if rule.commission_type == ReferralCommissionRule.TYPE_PERCENT_SALE:
        sale_amount = money(item.total if item is not None else booking.total_amount)
        return money(sale_amount * Decimal(str(rule.commission_value)) / HUNDRED)

    if rule.commission_type == ReferralCommissionRule.TYPE_PERCENT_MARGIN:
        if item is not None:
            platform_margin = _platform_margin_for_item(booking, item)
        else:
            total_margin = sum(
                (_platform_margin_for_item(booking, line) for line in booking.items.all()),
                Decimal("0.00"),
            )
            platform_margin = money(total_margin)
        return money(platform_margin * Decimal(str(rule.commission_value)) / HUNDRED)

    return Decimal("0.00")


def _rule_snapshot(rule):
    return {
        "rule_id": rule.pk,
        "commission_type": rule.commission_type,
        "commission_value": str(rule.commission_value),
        "trigger": rule.trigger,
        "effective_from": rule.effective_from.isoformat(),
        "effective_until": rule.effective_until.isoformat() if rule.effective_until else None,
        "partner_id": rule.partner_id,
        "partner_location_id": rule.partner_location_id,
        "product_id": rule.product_id,
    }


def _trigger_for_rule(rule, organisation):
    if rule.trigger:
        return rule.trigger
    settings_obj = getattr(organisation, "partner_network_settings", None)
    return (
        settings_obj.default_commission_trigger
        if settings_obj
        else PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT
    )


@transaction.atomic
def create_pending_commissions_for_booking(booking):
    attribution = ReferralBookingAttribution.objects.select_related(
        "partner", "partner_location"
    ).filter(booking=booking).first()
    if attribution is None:
        return []

    created = []
    items = list(booking.items.select_related("product").all())
    # Product-specific rules are evaluated per item. A booking-level fallback is
    # generated only when no item-specific rule exists.
    item_rule_found = False
    for item in items:
        rule = resolve_commission_rule(attribution=attribution, product=item.product)
        if rule is None or rule.product_id is None:
            continue
        item_rule_found = True
        key = f"referral-booking:{booking.pk}:item:{item.pk}:rule:{rule.pk}"
        commission, was_created = ReferralCommission.objects.get_or_create(
            idempotency_key=key,
            defaults={
                "organisation": booking.organisation,
                "partner": attribution.partner,
                "partner_location": attribution.partner_location,
                "booking": booking,
                "booking_item": item,
                "commission_rule": rule,
                "commission_rule_snapshot": _rule_snapshot(rule),
                "trigger": _trigger_for_rule(rule, booking.organisation),
                "currency": getattr(booking, "currency", "USD") or "USD",
                "amount": calculate_commission_amount(rule=rule, booking=booking, item=item),
                "status": ReferralCommission.STATUS_PENDING,
            },
        )
        if was_created:
            created.append(commission)

    if not item_rule_found:
        primary_product = getattr(booking, "primary_product", None)
        rule = resolve_commission_rule(attribution=attribution, product=primary_product)
        if rule:
            key = f"referral-booking:{booking.pk}:booking:rule:{rule.pk}"
            commission, was_created = ReferralCommission.objects.get_or_create(
                idempotency_key=key,
                defaults={
                    "organisation": booking.organisation,
                    "partner": attribution.partner,
                    "partner_location": attribution.partner_location,
                    "booking": booking,
                    "commission_rule": rule,
                    "commission_rule_snapshot": _rule_snapshot(rule),
                    "trigger": _trigger_for_rule(rule, booking.organisation),
                    "currency": getattr(booking, "currency", "USD") or "USD",
                    "amount": calculate_commission_amount(rule=rule, booking=booking),
                    "status": ReferralCommission.STATUS_PENDING,
                },
            )
            if was_created:
                created.append(commission)
    sync_referral_commissions_for_booking(booking)
    return created


def _trigger_satisfied(commission, booking):
    if commission.trigger == PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT:
        return booking.payment_status in {"deposit_paid", "paid"}
    if commission.trigger == PartnerNetworkSettings.COMMISSION_TRIGGER_FULL:
        return booking.payment_status == "paid"
    if commission.trigger == PartnerNetworkSettings.COMMISSION_TRIGGER_COMPLETED:
        return booking.status == "completed"
    return False


@transaction.atomic
def sync_referral_commissions_for_booking(booking, *, reversal_reason=""):
    commissions = list(
        ReferralCommission.objects.select_for_update().filter(booking=booking)
    )
    if not commissions:
        return []
    terminal_reversal = booking.status in {"cancelled", "refunded"} or booking.payment_status == "refunded"
    now = timezone.now()
    changed = []
    for commission in commissions:
        if terminal_reversal:
            reason = reversal_reason or "Booking cancelled or refunded."
            previous_status = commission.status

            # If the commission is sitting in an unpaid payout draft, remove it
            # before reversing the commission so it can never accidentally be
            # paid after the booking was cancelled/refunded.
            payout_line = getattr(commission, "payout_line", None)
            if payout_line is not None and payout_line.payout.status != "paid":
                payout = payout_line.payout
                payout_line.delete()
                positive_total = sum(
                    payout.lines.values_list("amount", flat=True),
                    Decimal("0.00"),
                )
                deduction_total = sum(
                    payout.adjustment_lines.values_list("amount", flat=True),
                    Decimal("0.00"),
                )
                payout.total_amount = max(
                    money(positive_total) - money(deduction_total),
                    Decimal("0.00"),
                )
                payout.save(update_fields=["total_amount", "updated_at"])

            # A commission that has already left the business cannot simply be
            # deleted or made negative. Create one durable debit that future
            # payouts can consume. The OneToOne relation makes this idempotent.
            if previous_status == ReferralCommission.STATUS_PAID:
                ReferralBalanceAdjustment.objects.get_or_create(
                    commission=commission,
                    defaults={
                        "organisation": commission.organisation,
                        "partner": commission.partner,
                        "currency": commission.currency,
                        "amount": commission.amount,
                        "reason": reason,
                    },
                )

            if commission.status != ReferralCommission.STATUS_REVERSED:
                commission.status = ReferralCommission.STATUS_REVERSED
            commission.reversed_at = now
            commission.reversal_reason = reason
            commission.save(update_fields=["status", "reversed_at", "reversal_reason", "updated_at"])
            changed.append(commission)
            continue
        if commission.status == ReferralCommission.STATUS_PENDING and _trigger_satisfied(commission, booking):
            commission.status = ReferralCommission.STATUS_EARNED
            commission.earned_at = now
            commission.save(update_fields=["status", "earned_at", "updated_at"])
            changed.append(commission)
    return changed
