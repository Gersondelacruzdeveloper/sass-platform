"""
Append-only ticketing ledger services.

This module centralizes financial ledger posting for:

- booking financial snapshots;
- booking payments;
- seller settlements;
- partner settlements;
- manual adjustments;
- reversals;
- reconciliation summaries.

Ledger rows are never edited to change financial history. Corrections are posted
as reversing entries linked to the original entries.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Iterable
import uuid

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from ticketing.models import (
    Booking,
    BookingFinancialSnapshot,
    BookingItem,
    BookingPayment,
    PartnerSettlementPayment,
    PartnerSettlementPeriod,
    Seller,
    TicketingBusinessEntity,
    TicketingLedgerEntry,
)

from ticketing.finance.utils import money


ZERO = Decimal("0.00")

DIRECTION_DEBIT = "debit"
DIRECTION_CREDIT = "credit"

PARTY_PLATFORM = "platform"
PARTY_PARTNER = "partner"
PARTY_SELLER = "seller"
PARTY_CUSTOMER = "customer"

ENTRY_BOOKING = "booking"
ENTRY_PAYMENT = "payment"
ENTRY_COMMISSION = "commission"
ENTRY_SETTLEMENT = "settlement"
ENTRY_REFUND = "refund"
ENTRY_ADJUSTMENT = "adjustment"
ENTRY_REVERSAL = "reversal"
ENTRY_ADMISSION = "admission"


class LedgerError(Exception):
    """Base ledger error."""


class LedgerValidationError(LedgerError):
    pass


@dataclass(frozen=True)
class LedgerPosting:
    party_type: str
    direction: str
    amount: Decimal
    description: str
    entry_type: str = ENTRY_ADJUSTMENT
    currency: str = "USD"
    reference: str = ""
    metadata: dict[str, Any] | None = None


def _normalise_amount(value) -> Decimal:
    value = money(value or ZERO)
    if value < ZERO:
        raise LedgerValidationError("Ledger amounts cannot be negative.")
    return value


def _default_currency(organisation, explicit_currency="") -> str:
    if explicit_currency:
        return explicit_currency

    settings_obj = getattr(organisation, "ticketing_settings", None)
    return getattr(settings_obj, "default_currency", "USD") or "USD"


def _validate_direction(direction: str):
    if direction not in {DIRECTION_DEBIT, DIRECTION_CREDIT}:
        raise LedgerValidationError(
            "Ledger direction must be 'debit' or 'credit'."
        )


def _validate_balanced_postings(postings: Iterable[LedgerPosting]):
    debit_total = ZERO
    credit_total = ZERO

    for posting in postings:
        _validate_direction(posting.direction)
        amount = _normalise_amount(posting.amount)

        if posting.direction == DIRECTION_DEBIT:
            debit_total += amount
        else:
            credit_total += amount

    debit_total = money(debit_total)
    credit_total = money(credit_total)

    if debit_total != credit_total:
        raise LedgerValidationError(
            f"Ledger entry group is not balanced: "
            f"debits={debit_total}, credits={credit_total}."
        )

    return debit_total, credit_total


@transaction.atomic
def post_entry_group(
    *,
    organisation,
    postings: Iterable[LedgerPosting],
    booking: Booking | None = None,
    booking_item: BookingItem | None = None,
    booking_payment: BookingPayment | None = None,
    seller: Seller | None = None,
    business_entity: TicketingBusinessEntity | None = None,
    effective_at=None,
    created_by=None,
    entry_group=None,
    shared_metadata=None,
) -> list[TicketingLedgerEntry]:
    """
    Post one balanced, append-only ledger group.
    """

    postings = list(postings)
    if not postings:
        raise LedgerValidationError("At least one ledger posting is required.")

    _validate_balanced_postings(postings)

    entry_group = entry_group or uuid.uuid4()
    effective_at = effective_at or timezone.now()
    shared_metadata = shared_metadata or {}

    rows = []

    for posting in postings:
        rows.append(
            TicketingLedgerEntry(
                organisation=organisation,
                booking=booking,
                booking_item=booking_item,
                booking_payment=booking_payment,
                seller=seller,
                business_entity=business_entity,
                entry_group=entry_group,
                entry_type=posting.entry_type,
                direction=posting.direction,
                party_type=posting.party_type,
                amount=_normalise_amount(posting.amount),
                currency=_default_currency(
                    organisation,
                    posting.currency,
                ),
                description=posting.description,
                reference=posting.reference,
                effective_at=effective_at,
                metadata={
                    **shared_metadata,
                    **(posting.metadata or {}),
                },
                created_by=created_by,
            )
        )

    return TicketingLedgerEntry.objects.bulk_create(rows)


def post_booking_snapshot(snapshot: BookingFinancialSnapshot, created_by=None):
    """
    Post the frozen entitlement allocation for a booking item.

    This does not post cash received. It records who is entitled to the booking
    value according to the snapshot.
    """

    postings = []
    currency = snapshot.currency

    if snapshot.partner_entitlement > ZERO:
        postings.extend(
            [
                LedgerPosting(
                    party_type=PARTY_PLATFORM,
                    direction=DIRECTION_DEBIT,
                    amount=snapshot.partner_entitlement,
                    description="Partner entitlement allocated from booking.",
                    entry_type=ENTRY_BOOKING,
                    currency=currency,
                ),
                LedgerPosting(
                    party_type=PARTY_PARTNER,
                    direction=DIRECTION_CREDIT,
                    amount=snapshot.partner_entitlement,
                    description="Partner entitlement recognized.",
                    entry_type=ENTRY_BOOKING,
                    currency=currency,
                ),
            ]
        )

    if snapshot.seller_entitlement > ZERO:
        postings.extend(
            [
                LedgerPosting(
                    party_type=PARTY_PLATFORM,
                    direction=DIRECTION_DEBIT,
                    amount=snapshot.seller_entitlement,
                    description="Seller commission allocated from booking.",
                    entry_type=ENTRY_COMMISSION,
                    currency=currency,
                ),
                LedgerPosting(
                    party_type=PARTY_SELLER,
                    direction=DIRECTION_CREDIT,
                    amount=snapshot.seller_entitlement,
                    description="Seller commission recognized.",
                    entry_type=ENTRY_COMMISSION,
                    currency=currency,
                ),
            ]
        )

    if not postings:
        return []

    return post_entry_group(
        organisation=snapshot.organisation,
        postings=postings,
        booking=snapshot.booking,
        booking_item=snapshot.booking_item,
        seller=snapshot.booking.seller,
        business_entity=snapshot.business_entity,
        created_by=created_by,
        shared_metadata={
            "financial_snapshot_id": snapshot.id,
            "agreement_id": snapshot.agreement_id,
            "agreement_version": snapshot.agreement_version,
        },
    )


def post_booking_payment(payment: BookingPayment, created_by=None):
    """
    Post a confirmed customer/seller payment into the ledger.
    """

    if payment.status != "confirmed":
        return []

    booking = payment.booking
    amount = _normalise_amount(payment.amount)

    receiver = getattr(payment, "collected_by_party", "") or ""
    receiver_party = {
        "seller": PARTY_SELLER,
        "partner": PARTY_PARTNER,
        "business_entity": PARTY_PARTNER,
        "venue": PARTY_PARTNER,
        "owner": PARTY_PLATFORM,
        "bank": PARTY_PLATFORM,
        "online_provider": PARTY_PLATFORM,
        "platform": PARTY_PLATFORM,
    }.get(receiver, PARTY_PLATFORM)

    payer_party = (
        PARTY_SELLER
        if getattr(payment, "payer_type", "") == "seller"
        else PARTY_CUSTOMER
    )

    return post_entry_group(
        organisation=booking.organisation,
        postings=[
            LedgerPosting(
                party_type=payer_party,
                direction=DIRECTION_DEBIT,
                amount=amount,
                description="Payment made.",
                entry_type=ENTRY_PAYMENT,
                currency=getattr(booking, "external_currency", "") or "USD",
                reference=payment.reference or booking.booking_code,
            ),
            LedgerPosting(
                party_type=receiver_party,
                direction=DIRECTION_CREDIT,
                amount=amount,
                description="Payment received.",
                entry_type=ENTRY_PAYMENT,
                currency=getattr(booking, "external_currency", "") or "USD",
                reference=payment.reference or booking.booking_code,
            ),
        ],
        booking=booking,
        booking_payment=payment,
        seller=payment.seller or booking.seller,
        created_by=created_by,
        effective_at=payment.paid_at or timezone.now(),
        shared_metadata={
            "booking_payment_id": payment.id,
            "payment_type": payment.payment_type,
            "method": payment.method,
            "provider": payment.provider,
        },
    )


def post_partner_settlement_payment(
    payment: PartnerSettlementPayment,
    created_by=None,
):
    if payment.status != "confirmed":
        return []

    settlement = payment.settlement

    return post_entry_group(
        organisation=settlement.organisation,
        postings=[
            LedgerPosting(
                party_type=payment.payer_type,
                direction=DIRECTION_DEBIT,
                amount=payment.amount,
                description=(
                    f"{payment.payer_type.title()} paid settlement "
                    f"{settlement.settlement_number}."
                ),
                entry_type=ENTRY_SETTLEMENT,
                currency=payment.currency,
                reference=payment.reference or settlement.settlement_number,
            ),
            LedgerPosting(
                party_type=payment.payee_type,
                direction=DIRECTION_CREDIT,
                amount=payment.amount,
                description=(
                    f"{payment.payee_type.title()} received settlement "
                    f"{settlement.settlement_number}."
                ),
                entry_type=ENTRY_SETTLEMENT,
                currency=payment.currency,
                reference=payment.reference or settlement.settlement_number,
            ),
        ],
        business_entity=settlement.business_entity,
        effective_at=payment.paid_at or timezone.now(),
        created_by=created_by,
        entry_group=payment.ledger_entry_group or uuid.uuid4(),
        shared_metadata={
            "settlement_id": settlement.id,
            "settlement_number": settlement.settlement_number,
            "settlement_payment_id": payment.id,
            "payment_method": payment.payment_method,
        },
    )


@transaction.atomic
def reverse_entry_group(
    entry_group,
    *,
    created_by=None,
    reason="Ledger group reversed.",
) -> list[TicketingLedgerEntry]:
    """
    Reverse every active row in an entry group.
    """

    originals = list(
        TicketingLedgerEntry.objects.select_for_update()
        .filter(
            entry_group=entry_group,
            is_reversed=False,
        )
        .order_by("id")
    )

    if not originals:
        return []

    reversal_group = uuid.uuid4()
    reversals = []

    for original in originals:
        reversals.append(
            TicketingLedgerEntry(
                organisation=original.organisation,
                booking=original.booking,
                booking_item=original.booking_item,
                booking_payment=original.booking_payment,
                seller=original.seller,
                business_entity=original.business_entity,
                entry_group=reversal_group,
                entry_type=ENTRY_REVERSAL,
                direction=(
                    DIRECTION_CREDIT
                    if original.direction == DIRECTION_DEBIT
                    else DIRECTION_DEBIT
                ),
                party_type=original.party_type,
                amount=original.amount,
                currency=original.currency,
                description=f"Reversal: {original.description}",
                reference=original.reference,
                effective_at=timezone.now(),
                reverses_entry=original,
                metadata={
                    **(original.metadata or {}),
                    "reversal_reason": reason,
                    "reversal_of_entry_id": original.id,
                },
                created_by=created_by,
            )
        )

        original.is_reversed = True

    TicketingLedgerEntry.objects.bulk_create(reversals)
    TicketingLedgerEntry.objects.bulk_update(
        originals,
        ["is_reversed"],
    )

    return reversals


def post_manual_adjustment(
    *,
    organisation,
    debit_party,
    credit_party,
    amount,
    description,
    currency="USD",
    reference="",
    booking=None,
    booking_item=None,
    seller=None,
    business_entity=None,
    created_by=None,
    metadata=None,
):
    amount = _normalise_amount(amount)

    if debit_party == credit_party:
        raise LedgerValidationError(
            "Debit and credit parties must be different."
        )

    return post_entry_group(
        organisation=organisation,
        postings=[
            LedgerPosting(
                party_type=debit_party,
                direction=DIRECTION_DEBIT,
                amount=amount,
                description=description,
                entry_type=ENTRY_ADJUSTMENT,
                currency=currency,
                reference=reference,
            ),
            LedgerPosting(
                party_type=credit_party,
                direction=DIRECTION_CREDIT,
                amount=amount,
                description=description,
                entry_type=ENTRY_ADJUSTMENT,
                currency=currency,
                reference=reference,
            ),
        ],
        booking=booking,
        booking_item=booking_item,
        seller=seller,
        business_entity=business_entity,
        created_by=created_by,
        shared_metadata=metadata or {},
    )


def ledger_balance_for_party(
    *,
    organisation,
    party_type,
    business_entity=None,
    seller=None,
    date_from=None,
    date_to=None,
):
    queryset = TicketingLedgerEntry.objects.filter(
        organisation=organisation,
        party_type=party_type,
        is_reversed=False,
    )

    if business_entity:
        queryset = queryset.filter(business_entity=business_entity)

    if seller:
        queryset = queryset.filter(seller=seller)

    if date_from:
        queryset = queryset.filter(effective_at__date__gte=date_from)

    if date_to:
        queryset = queryset.filter(effective_at__date__lte=date_to)

    debit = queryset.filter(
        direction=DIRECTION_DEBIT,
    ).aggregate(total=Sum("amount"))["total"]

    credit = queryset.filter(
        direction=DIRECTION_CREDIT,
    ).aggregate(total=Sum("amount"))["total"]

    return money((credit or ZERO) - (debit or ZERO))


def ledger_summary(
    *,
    organisation,
    business_entity=None,
    seller=None,
    date_from=None,
    date_to=None,
):
    parties = [
        PARTY_PLATFORM,
        PARTY_PARTNER,
        PARTY_SELLER,
        PARTY_CUSTOMER,
    ]

    return {
        party: ledger_balance_for_party(
            organisation=organisation,
            party_type=party,
            business_entity=business_entity,
            seller=seller,
            date_from=date_from,
            date_to=date_to,
        )
        for party in parties
    }


def reconcile_settlement_with_ledger(
    settlement: PartnerSettlementPeriod,
):
    """
    Compare confirmed settlement payments with active ledger settlement entries.
    """

    payment_total = settlement.payments.filter(
        status="confirmed",
    ).aggregate(total=Sum("amount"))["total"]

    ledger_total = TicketingLedgerEntry.objects.filter(
        organisation=settlement.organisation,
        business_entity=settlement.business_entity,
        entry_type=ENTRY_SETTLEMENT,
        is_reversed=False,
        metadata__settlement_id=settlement.id,
        direction=DIRECTION_CREDIT,
    ).aggregate(total=Sum("amount"))["total"]

    payment_total = money(payment_total or ZERO)
    ledger_total = money(ledger_total or ZERO)

    return {
        "settlement_id": settlement.id,
        "settlement_number": settlement.settlement_number,
        "payment_total": payment_total,
        "ledger_total": ledger_total,
        "difference": money(payment_total - ledger_total),
        "is_reconciled": payment_total == ledger_total,
    }
