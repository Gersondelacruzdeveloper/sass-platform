from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from partner_network.models import (
    ReferralBalanceAdjustment,
    ReferralCommission,
    ReferralPayout,
    ReferralPayoutAdjustmentLine,
    ReferralPayoutLine,
)

MONEY_ZERO = Decimal("0.00")


def _reserved_adjustment_amount(adjustment):
    """Amount already reserved/applied by non-cancelled payouts."""
    value = (
        ReferralPayoutAdjustmentLine.objects.filter(
            adjustment=adjustment,
        )
        .exclude(payout__status=ReferralPayout.STATUS_CANCELLED)
        .aggregate(total=Sum("amount"))["total"]
    )
    return Decimal(str(value or "0.00"))


def _recalculate_payout_total(payout):
    positive = payout.lines.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
    deductions = payout.adjustment_lines.aggregate(total=Sum("amount"))["total"] or MONEY_ZERO
    payout.total_amount = max(Decimal(str(positive)) - Decimal(str(deductions)), MONEY_ZERO)
    payout.save(update_fields=["total_amount", "updated_at"])
    return payout.total_amount


@transaction.atomic
def generate_payout(*, partner, period_start, period_end, currency="USD", created_by=None):
    if period_end < period_start:
        raise ValueError("Invalid payout period.")

    # Lock eligible commissions so concurrent payout generation cannot reserve
    # the same commission twice.
    # Avoid joining the nullable reverse OneToOne relation while using
    # SELECT ... FOR UPDATE. PostgreSQL cannot apply FOR UPDATE to the nullable
    # side of an OUTER JOIN. Excluding already-reserved commission ids keeps the
    # lock focused on ReferralCommission rows and preserves concurrency safety.
    reserved_commission_ids = ReferralPayoutLine.objects.values("commission_id")
    commissions = list(
        ReferralCommission.objects.select_for_update()
        .filter(
            partner=partner,
            organisation=partner.organisation,
            currency=currency,
            status=ReferralCommission.STATUS_EARNED,
            earned_at__date__gte=period_start,
            earned_at__date__lte=period_end,
        )
        .exclude(pk__in=reserved_commission_ids)
        .order_by("earned_at", "pk")
    )
    if not commissions:
        raise ValueError("There are no earned commissions available for this payout period.")

    payout = ReferralPayout.objects.create(
        organisation=partner.organisation,
        partner=partner,
        period_start=period_start,
        period_end=period_end,
        currency=currency,
        total_amount=MONEY_ZERO,
        created_by=created_by,
    )

    gross = MONEY_ZERO
    for commission in commissions:
        ReferralPayoutLine.objects.create(
            payout=payout,
            commission=commission,
            amount=commission.amount,
        )
        commission.status = ReferralCommission.STATUS_PAYABLE
        commission.save(update_fields=["status", "updated_at"])
        gross += commission.amount

    # Paid commissions that were later refunded become balance adjustments.
    # Reserve as much of the oldest outstanding debit as this payout can absorb;
    # never create a negative payout to the partner.
    remaining_capacity = gross
    adjustments = list(
        ReferralBalanceAdjustment.objects.select_for_update()
        .filter(
            organisation=partner.organisation,
            partner=partner,
            currency=currency,
        )
        .order_by("created_at", "pk")
    )
    for adjustment in adjustments:
        if remaining_capacity <= MONEY_ZERO:
            break
        reserved = _reserved_adjustment_amount(adjustment)
        outstanding = max(adjustment.amount - reserved, MONEY_ZERO)
        if outstanding <= MONEY_ZERO:
            continue
        applied = min(outstanding, remaining_capacity)
        ReferralPayoutAdjustmentLine.objects.create(
            payout=payout,
            adjustment=adjustment,
            amount=applied,
        )
        remaining_capacity -= applied

    _recalculate_payout_total(payout)
    return payout


@transaction.atomic
def mark_payout_paid(*, payout, paid_by=None, payment_reference="", note=""):
    payout = ReferralPayout.objects.select_for_update().get(pk=payout.pk)
    if payout.status == ReferralPayout.STATUS_PAID:
        return payout
    if payout.status == ReferralPayout.STATUS_CANCELLED:
        raise ValueError("Cancelled payouts cannot be paid.")
    now = timezone.now()
    payout.status = ReferralPayout.STATUS_PAID
    payout.paid_at = now
    payout.paid_by = paid_by
    payout.payment_reference = str(payment_reference or "")[:180]
    if note:
        payout.internal_note = note
    payout.save(
        update_fields=[
            "status", "paid_at", "paid_by", "payment_reference", "internal_note", "updated_at"
        ]
    )
    for line in payout.lines.select_related("commission").all():
        commission = line.commission
        # A reversed commission cannot be paid even if a stale draft somehow
        # survived. This is an additional financial safety guard.
        if commission.status == ReferralCommission.STATUS_REVERSED:
            raise ValueError("This payout contains a reversed commission and cannot be paid.")
        commission.status = ReferralCommission.STATUS_PAID
        commission.paid_at = now
        commission.save(update_fields=["status", "paid_at", "updated_at"])
    return payout


@transaction.atomic
def cancel_payout(*, payout, note=""):
    payout = ReferralPayout.objects.select_for_update().get(pk=payout.pk)
    if payout.status == ReferralPayout.STATUS_PAID:
        raise ValueError("Paid payouts cannot be cancelled.")
    if payout.status == ReferralPayout.STATUS_CANCELLED:
        return payout

    for line in payout.lines.select_related("commission").all():
        commission = line.commission
        if commission.status == ReferralCommission.STATUS_PAYABLE:
            commission.status = ReferralCommission.STATUS_EARNED
            commission.save(update_fields=["status", "updated_at"])

    payout.status = ReferralPayout.STATUS_CANCELLED
    if note:
        payout.internal_note = note
    payout.save(update_fields=["status", "internal_note", "updated_at"])
    return payout
