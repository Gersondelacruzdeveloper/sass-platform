"""
Seller and business-entity settlement management.

This module answers two related questions:

1. Has the company/owner received the money a seller collected?
2. Has the platform and business entity settled the net amount owed for a
   partner settlement period?

It does not calculate booking prices.
It does not calculate seller commissions.
It does not generate partner settlement lines.
It does not create ordinary customer payments.

Partner settlement generation belongs in ticketing.operations.settlements.
This module records and updates settlement state after money changes hands.
"""

from decimal import Decimal
import uuid

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .constants import (
    ZERO,
    PAYMENT_RECEIVER_OWNER,
    PAYMENT_RECEIVER_BANK,
    PAYMENT_TYPE_SETTLEMENT,
    PAYER_SELLER,
    SETTLEMENT_PENDING,
    SETTLEMENT_PARTIALLY_SETTLED,
    SETTLEMENT_SETTLED,
)
from .utils import money, remaining_balance


PARTNER_SETTLEMENT_DRAFT = "draft"
PARTNER_SETTLEMENT_REVIEW = "review"
PARTNER_SETTLEMENT_APPROVED = "approved"
PARTNER_SETTLEMENT_PARTIALLY_PAID = "partially_paid"
PARTNER_SETTLEMENT_SETTLED = "settled"
PARTNER_SETTLEMENT_DISPUTED = "disputed"
PARTNER_SETTLEMENT_CANCELLED = "cancelled"

CONFIRMED_PARTNER_PAYMENT_STATUSES = {"confirmed"}

PARTY_PLATFORM = "platform"
PARTY_PARTNER = "partner"
PARTY_SELLER = "seller"


# ============================================================================
# Existing seller-to-company settlement behavior
# ============================================================================


def calculate_seller_due_to_company(booking):
    return max(
        money(getattr(booking, "seller_collected_amount", ZERO))
        - money(getattr(booking, "seller_commission_amount", ZERO)),
        ZERO,
    )


def calculate_owner_remaining_amount(booking):
    return remaining_balance(
        getattr(booking, "owner_net_amount", ZERO),
        getattr(booking, "owner_received_amount", ZERO),
    )


def resolve_settlement_status(booking):
    owner_net = money(getattr(booking, "owner_net_amount", ZERO))
    owner_received = money(getattr(booking, "owner_received_amount", ZERO))
    seller_due = money(getattr(booking, "seller_due_to_company", ZERO))

    if owner_net <= ZERO:
        return SETTLEMENT_SETTLED

    if seller_due <= ZERO and owner_received >= owner_net:
        return SETTLEMENT_SETTLED

    if owner_received > ZERO:
        return SETTLEMENT_PARTIALLY_SETTLED

    return SETTLEMENT_PENDING


def apply_settlement_status(booking):
    if hasattr(booking, "seller_due_to_company"):
        booking.seller_due_to_company = calculate_seller_due_to_company(booking)

    if hasattr(booking, "settlement_status"):
        booking.settlement_status = resolve_settlement_status(booking)

    update_fields = ["updated_at"]

    if hasattr(booking, "seller_due_to_company"):
        update_fields.append("seller_due_to_company")

    if hasattr(booking, "settlement_status"):
        update_fields.append("settlement_status")

    booking.save(update_fields=update_fields)

    return booking


@transaction.atomic
def record_seller_settlement(
    booking,
    amount,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller settlement received.",
):
    """
    Seller pays the company/owner money previously collected from a customer.

    This creates a BookingPayment where:
    - payer_type = seller
    - payment_type = settlement
    - receiver = owner/bank
    - affects_owner_received = True
    - affects_seller_collected = False
    """

    from ticketing.models import Booking, BookingPayment
    from .calculator import recalculate_booking
    from .commissions import recompute_seller_totals

    booking = Booking.objects.select_for_update().get(pk=booking.pk)
    amount = money(amount)

    if amount <= ZERO:
        raise ValueError("Settlement amount must be greater than zero.")

    amount_due = calculate_seller_due_to_company(booking)

    if amount_due <= ZERO:
        apply_settlement_status(booking)
        return None, booking

    if amount > amount_due:
        raise ValueError(
            f"Settlement amount cannot exceed the seller amount due ({amount_due})."
        )

    payment = BookingPayment.objects.create(
        booking=booking,
        seller=getattr(booking, "seller", None),
        collected_by=collected_by,
        amount=amount,
        payment_type=PAYMENT_TYPE_SETTLEMENT,
        payer_type=PAYER_SELLER,
        method=method,
        status="confirmed",
        reference=reference,
        note=note,
        paid_at=timezone.now(),
    )

    if hasattr(payment, "collected_by_party"):
        payment.collected_by_party = (
            PAYMENT_RECEIVER_BANK
            if method == PAYMENT_RECEIVER_BANK
            else PAYMENT_RECEIVER_OWNER
        )

    if hasattr(payment, "affects_owner_received"):
        payment.affects_owner_received = True

    if hasattr(payment, "affects_seller_collected"):
        payment.affects_seller_collected = False

    if hasattr(payment, "settlement_status"):
        payment.settlement_status = SETTLEMENT_SETTLED

    payment.save()

    booking = recalculate_booking(booking)
    apply_settlement_status(booking)

    if booking.seller:
        recompute_seller_totals(booking.seller)

    _post_seller_settlement_ledger_entries(
        booking=booking,
        payment=payment,
        amount=amount,
        created_by=collected_by,
    )

    return payment, booking


def settle_booking_fully(
    booking,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller settled full amount owed to company.",
):
    amount_due = calculate_seller_due_to_company(booking)

    if amount_due <= ZERO:
        apply_settlement_status(booking)
        return None, booking

    return record_seller_settlement(
        booking=booking,
        amount=amount_due,
        collected_by=collected_by,
        method=method,
        reference=reference,
        note=note,
    )


def settle_booking_partially(
    booking,
    amount,
    collected_by=None,
    method=PAYMENT_RECEIVER_BANK,
    reference="",
    note="Seller partially settled amount owed to company.",
):
    amount = money(amount)

    if amount <= ZERO:
        return None, booking

    return record_seller_settlement(
        booking=booking,
        amount=amount,
        collected_by=collected_by,
        method=method,
        reference=reference,
        note=note,
    )


def _post_seller_settlement_ledger_entries(
    booking,
    payment,
    amount,
    created_by=None,
):
    """
    Record the movement from seller liability to platform cash.

    Ledger entries are intentionally append-only. Failure to post the optional
    ledger should not undo an already-valid legacy seller settlement.
    """

    try:
        from ticketing.models import TicketingLedgerEntry

        entry_group = uuid.uuid4()
        currency = (
            getattr(booking, "external_currency", "")
            or getattr(
                getattr(booking.organisation, "ticketing_settings", None),
                "default_currency",
                "USD",
            )
            or "USD"
        )

        common = {
            "organisation": booking.organisation,
            "booking": booking,
            "booking_payment": payment,
            "seller": booking.seller,
            "entry_group": entry_group,
            "entry_type": "settlement",
            "amount": money(amount),
            "currency": currency,
            "reference": payment.reference or booking.booking_code,
            "effective_at": payment.paid_at or timezone.now(),
            "created_by": created_by,
            "metadata": {
                "settlement_kind": "seller_to_platform",
                "booking_code": booking.booking_code,
            },
        }

        TicketingLedgerEntry.objects.bulk_create(
            [
                TicketingLedgerEntry(
                    **common,
                    direction="debit",
                    party_type="seller",
                    description="Seller settlement reduces seller liability.",
                ),
                TicketingLedgerEntry(
                    **common,
                    direction="credit",
                    party_type="platform",
                    description="Platform received seller settlement.",
                ),
            ]
        )
    except Exception:
        # Keep compatibility while the ledger service is introduced gradually.
        return None

    return entry_group


# ============================================================================
# Partner/business-entity settlement state and payment handling
# ============================================================================


def calculate_partner_settlement_paid_amount(settlement):
    """
    Total confirmed payments for the settlement.

    The settlement direction is already represented by payer_type/payee_type,
    while paid_amount tracks how much of the absolute net obligation was paid.
    """

    total = settlement.payments.filter(
        status__in=CONFIRMED_PARTNER_PAYMENT_STATUSES,
    ).aggregate(total=Sum("amount"))["total"]

    return money(total or ZERO)


def resolve_partner_settlement_status(settlement):
    """
    Preserve workflow states while resolving payment progress.

    Draft, review, disputed, and cancelled are not automatically promoted.
    Approved settlements become partially_paid or settled as payments arrive.
    """

    current_status = settlement.status

    if current_status in {
        PARTNER_SETTLEMENT_DRAFT,
        PARTNER_SETTLEMENT_REVIEW,
        PARTNER_SETTLEMENT_DISPUTED,
        PARTNER_SETTLEMENT_CANCELLED,
    }:
        return current_status

    target = money(abs(settlement.net_settlement_amount))
    paid = money(settlement.paid_amount)

    if target <= ZERO:
        return PARTNER_SETTLEMENT_SETTLED

    if paid >= target:
        return PARTNER_SETTLEMENT_SETTLED

    if paid > ZERO:
        return PARTNER_SETTLEMENT_PARTIALLY_PAID

    return PARTNER_SETTLEMENT_APPROVED


@transaction.atomic
def refresh_partner_settlement_payment_state(settlement):
    """
    Recalculate paid_amount, workflow status, and settled_at atomically.
    """

    from ticketing.models import PartnerSettlementPeriod

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )
    settlement.paid_amount = calculate_partner_settlement_paid_amount(settlement)
    settlement.status = resolve_partner_settlement_status(settlement)

    if settlement.status == PARTNER_SETTLEMENT_SETTLED:
        settlement.settled_at = settlement.settled_at or timezone.now()
    else:
        settlement.settled_at = None

    settlement.save(
        update_fields=[
            "paid_amount",
            "status",
            "settled_at",
            "updated_at",
        ]
    )

    return settlement


@transaction.atomic
def submit_partner_settlement_for_review(settlement, notes=""):
    from ticketing.models import PartnerSettlementPeriod

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )

    if settlement.status != PARTNER_SETTLEMENT_DRAFT:
        raise ValueError("Only draft settlements can be submitted for review.")

    settlement.status = PARTNER_SETTLEMENT_REVIEW
    if notes:
        settlement.notes = _append_note(settlement.notes, notes)

    settlement.save(update_fields=["status", "notes", "updated_at"])
    return settlement


@transaction.atomic
def approve_partner_settlement(settlement, approved_by=None, notes=""):
    from ticketing.models import PartnerSettlementPeriod

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )

    if settlement.status not in {
        PARTNER_SETTLEMENT_DRAFT,
        PARTNER_SETTLEMENT_REVIEW,
        PARTNER_SETTLEMENT_DISPUTED,
    }:
        raise ValueError(
            "Only draft, review, or disputed settlements can be approved."
        )

    settlement.status = PARTNER_SETTLEMENT_APPROVED
    settlement.approved_by = approved_by
    settlement.approved_at = timezone.now()

    if notes:
        settlement.notes = _append_note(settlement.notes, notes)

    settlement.save(
        update_fields=[
            "status",
            "approved_by",
            "approved_at",
            "notes",
            "updated_at",
        ]
    )

    return refresh_partner_settlement_payment_state(settlement)


@transaction.atomic
def dispute_partner_settlement(settlement, notes, disputed_by=None):
    from ticketing.models import PartnerSettlementPeriod

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )

    if settlement.status in {
        PARTNER_SETTLEMENT_SETTLED,
        PARTNER_SETTLEMENT_CANCELLED,
    }:
        raise ValueError("A settled or cancelled settlement cannot be disputed.")

    actor = (
        getattr(disputed_by, "email", "")
        or getattr(disputed_by, "username", "")
        or "Unknown user"
    )
    settlement.status = PARTNER_SETTLEMENT_DISPUTED
    settlement.notes = _append_note(
        settlement.notes,
        f"Disputed by {actor}: {notes}",
    )
    settlement.save(update_fields=["status", "notes", "updated_at"])
    return settlement


@transaction.atomic
def cancel_partner_settlement(settlement, notes="", cancelled_by=None):
    from ticketing.models import PartnerSettlementPeriod

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )

    if settlement.status == PARTNER_SETTLEMENT_SETTLED:
        raise ValueError("A settled settlement cannot be cancelled.")

    if settlement.payments.filter(status="confirmed").exists():
        raise ValueError(
            "A settlement with confirmed payments cannot be cancelled."
        )

    actor = (
        getattr(cancelled_by, "email", "")
        or getattr(cancelled_by, "username", "")
        or "Unknown user"
    )
    settlement.status = PARTNER_SETTLEMENT_CANCELLED

    if notes:
        settlement.notes = _append_note(
            settlement.notes,
            f"Cancelled by {actor}: {notes}",
        )

    settlement.save(update_fields=["status", "notes", "updated_at"])
    return settlement


def expected_partner_settlement_parties(settlement):
    """
    Positive net: partner owes platform.
    Negative net: platform owes partner.
    Zero net: no payment is required.
    """

    net_amount = money(settlement.net_settlement_amount)

    if net_amount > ZERO:
        return PARTY_PARTNER, PARTY_PLATFORM

    if net_amount < ZERO:
        return PARTY_PLATFORM, PARTY_PARTNER

    return None, None


@transaction.atomic
def record_partner_settlement_payment(
    settlement,
    amount,
    payer_type=None,
    payee_type=None,
    payment_method="bank_transfer",
    status="confirmed",
    reference="",
    paid_at=None,
    notes="",
    attachment=None,
    recorded_by=None,
):
    """
    Record payment against an approved partner settlement.

    Unless explicitly supplied, payer/payee are derived from net_settlement_amount:
    - positive: partner -> platform
    - negative: platform -> partner
    """

    from ticketing.models import (
        PartnerSettlementPayment,
        PartnerSettlementPeriod,
    )

    settlement = PartnerSettlementPeriod.objects.select_for_update().get(
        pk=settlement.pk
    )

    if settlement.status in {
        PARTNER_SETTLEMENT_DRAFT,
        PARTNER_SETTLEMENT_REVIEW,
        PARTNER_SETTLEMENT_DISPUTED,
        PARTNER_SETTLEMENT_CANCELLED,
    }:
        raise ValueError(
            "The settlement must be approved before recording payments."
        )

    amount = money(amount)
    if amount <= ZERO:
        raise ValueError("Settlement payment amount must be greater than zero.")

    expected_payer, expected_payee = expected_partner_settlement_parties(
        settlement
    )

    if not expected_payer:
        raise ValueError("This settlement has no outstanding net amount.")

    payer_type = payer_type or expected_payer
    payee_type = payee_type or expected_payee

    if payer_type == payee_type:
        raise ValueError("Payer and payee must be different parties.")

    if (payer_type, payee_type) != (expected_payer, expected_payee):
        raise ValueError(
            f"Expected settlement direction is {expected_payer} to {expected_payee}."
        )

    outstanding = money(settlement.outstanding_amount)
    if amount > outstanding:
        raise ValueError(
            f"Payment amount cannot exceed the outstanding amount ({outstanding})."
        )

    ledger_group = uuid.uuid4() if status == "confirmed" else None

    payment = PartnerSettlementPayment.objects.create(
        settlement=settlement,
        payer_type=payer_type,
        payee_type=payee_type,
        amount=amount,
        currency=settlement.currency,
        payment_method=payment_method,
        status=status,
        reference=reference,
        paid_at=paid_at or timezone.now(),
        notes=notes,
        attachment=attachment,
        recorded_by=recorded_by,
        ledger_entry_group=ledger_group,
    )

    if status == "confirmed":
        _post_partner_settlement_ledger_entries(
            settlement=settlement,
            payment=payment,
            entry_group=ledger_group,
            created_by=recorded_by,
        )

    settlement = refresh_partner_settlement_payment_state(settlement)
    return payment, settlement


@transaction.atomic
def update_partner_settlement_payment_status(
    payment,
    status,
    updated_by=None,
    notes="",
):
    """
    Change a settlement payment status and keep settlement/ledger consistent.

    A transition into confirmed posts ledger entries. Moving a confirmed payment
    away from confirmed creates reversal entries rather than deleting history.
    """

    from ticketing.models import PartnerSettlementPayment

    payment = PartnerSettlementPayment.objects.select_for_update().select_related(
        "settlement"
    ).get(pk=payment.pk)

    old_status = payment.status
    if old_status == status:
        return payment, refresh_partner_settlement_payment_state(
            payment.settlement
        )

    if notes:
        payment.notes = _append_note(payment.notes, notes)

    payment.status = status

    if old_status != "confirmed" and status == "confirmed":
        payment.ledger_entry_group = payment.ledger_entry_group or uuid.uuid4()
        payment.save(
            update_fields=[
                "status",
                "notes",
                "ledger_entry_group",
            ]
        )
        _post_partner_settlement_ledger_entries(
            settlement=payment.settlement,
            payment=payment,
            entry_group=payment.ledger_entry_group,
            created_by=updated_by,
        )
    elif old_status == "confirmed" and status != "confirmed":
        payment.save(update_fields=["status", "notes"])
        _reverse_partner_payment_ledger_entries(
            payment=payment,
            created_by=updated_by,
        )
    else:
        payment.save(update_fields=["status", "notes"])

    settlement = refresh_partner_settlement_payment_state(payment.settlement)
    return payment, settlement


def _post_partner_settlement_ledger_entries(
    settlement,
    payment,
    entry_group,
    created_by=None,
):
    from ticketing.models import TicketingLedgerEntry

    common = {
        "organisation": settlement.organisation,
        "business_entity": settlement.business_entity,
        "entry_group": entry_group,
        "entry_type": "settlement",
        "amount": money(payment.amount),
        "currency": payment.currency,
        "reference": payment.reference or settlement.settlement_number,
        "effective_at": payment.paid_at,
        "created_by": created_by,
        "metadata": {
            "settlement_id": settlement.id,
            "settlement_number": settlement.settlement_number,
            "settlement_payment_id": payment.id,
            "payment_method": payment.payment_method,
            "payer_type": payment.payer_type,
            "payee_type": payment.payee_type,
        },
    }

    TicketingLedgerEntry.objects.bulk_create(
        [
            TicketingLedgerEntry(
                **common,
                direction="debit",
                party_type=payment.payer_type,
                description=(
                    f"{payment.payer_type.title()} paid settlement "
                    f"{settlement.settlement_number}."
                ),
            ),
            TicketingLedgerEntry(
                **common,
                direction="credit",
                party_type=payment.payee_type,
                description=(
                    f"{payment.payee_type.title()} received settlement "
                    f"{settlement.settlement_number}."
                ),
            ),
        ]
    )


def _reverse_partner_payment_ledger_entries(payment, created_by=None):
    from ticketing.models import TicketingLedgerEntry

    if not payment.ledger_entry_group:
        return []

    original_entries = list(
        TicketingLedgerEntry.objects.filter(
            entry_group=payment.ledger_entry_group,
            is_reversed=False,
        )
    )

    if not original_entries:
        return []

    reversal_group = uuid.uuid4()
    reversals = []

    for original in original_entries:
        reversals.append(
            TicketingLedgerEntry(
                organisation=original.organisation,
                booking=original.booking,
                booking_item=original.booking_item,
                booking_payment=original.booking_payment,
                seller=original.seller,
                business_entity=original.business_entity,
                entry_group=reversal_group,
                entry_type="reversal",
                direction=(
                    "credit"
                    if original.direction == "debit"
                    else "debit"
                ),
                party_type=original.party_type,
                amount=original.amount,
                currency=original.currency,
                description=f"Reversal of: {original.description}",
                reference=original.reference,
                effective_at=timezone.now(),
                reverses_entry=original,
                metadata={
                    **(original.metadata or {}),
                    "reversal_of_entry_id": original.id,
                    "settlement_payment_id": payment.id,
                },
                created_by=created_by,
            )
        )
        original.is_reversed = True

    TicketingLedgerEntry.objects.bulk_create(reversals)
    TicketingLedgerEntry.objects.bulk_update(
        original_entries,
        ["is_reversed"],
    )

    return reversals


def _append_note(existing, new_note):
    existing = str(existing or "").strip()
    new_note = str(new_note or "").strip()

    if not new_note:
        return existing

    timestamp = timezone.localtime().strftime("%Y-%m-%d %H:%M")
    line = f"[{timestamp}] {new_note}"

    return f"{existing}\n{line}".strip() if existing else line
