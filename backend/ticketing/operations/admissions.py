"""
Atomic ticket admission and reversal services.

This module is responsible for:

- validating a scanned admission token again under row locking;
- admitting one or more guests safely;
- preventing duplicate/offline replay admissions;
- linking admissions to scan attempts;
- updating token admitted quantities and status;
- reversing admissions with a complete audit trail.

Token parsing and non-mutating resolution belong in ticketing.operations.tokens.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import uuid

from django.db import transaction
from django.utils import timezone

from ticketing.models import (
    AdmissionToken,
    TicketAdmission,
    TicketScanAttempt,
    TicketingBusinessEntity,
)

from .tokens import (
    AdmissionTokenValidationError,
    TokenResolution,
    extract_token_uuid,
    resolve_admission_token,
)


class AdmissionError(Exception):
    """Base error for admission operations."""


class AdmissionValidationError(AdmissionError):
    pass


class AdmissionConflictError(AdmissionError):
    pass


@dataclass(frozen=True)
class AdmissionResult:
    ok: bool
    message: str
    token: AdmissionToken
    admission: TicketAdmission | None = None
    scan_attempt: TicketScanAttempt | None = None
    admitted_quantity: int = 0
    remaining_admissions: int = 0
    already_processed: bool = False

    def as_dict(self) -> dict[str, Any]:
        booking = self.token.booking
        item = self.token.booking_item
        entity = self.token.business_entity

        return {
            "ok": self.ok,
            "message": self.message,
            "admission_id": self.admission.id if self.admission else None,
            "scan_attempt_id": self.scan_attempt.id if self.scan_attempt else None,
            "token": str(self.token.token),
            "token_status": self.token.status,
            "booking_id": booking.id,
            "booking_code": booking.booking_code,
            "booking_status": booking.status,
            "booking_item_id": item.id,
            "product_name": item.product_name,
            "product_type": item.product_type,
            "business_entity_id": entity.id if entity else None,
            "business_entity_name": entity.name if entity else "",
            "admitted_quantity": self.admitted_quantity,
            "total_admitted_quantity": self.token.admitted_quantity,
            "remaining_admissions": self.remaining_admissions,
            "already_processed": self.already_processed,
        }


def _normalise_offline_event_id(value):
    if not value:
        return None

    if isinstance(value, uuid.UUID):
        return value

    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        raise AdmissionValidationError("Offline event ID is invalid.")


def _load_locked_token(raw_value, organisation):
    token_uuid = extract_token_uuid(raw_value)

    token = (
        AdmissionToken.objects.select_for_update()
        .select_related(
            "organisation",
            "booking",
            "booking_item",
            "booking_item__product",
            "business_entity",
        )
        .filter(
            token=token_uuid,
            organisation=organisation,
        )
        .first()
    )

    if not token:
        raise AdmissionValidationError("Ticket not found.")

    return token


def _load_existing_offline_attempt(offline_event_id):
    if not offline_event_id:
        return None

    return (
        TicketScanAttempt.objects.select_for_update()
        .filter(offline_event_id=offline_event_id)
        .select_related(
            "admission",
            "admission_token",
            "booking",
            "booking_item",
            "business_entity",
        )
        .first()
    )


def _validate_entity_scope(
    token: AdmissionToken,
    business_entity: TicketingBusinessEntity | None,
):
    if not business_entity:
        return

    if business_entity.organisation_id != token.organisation_id:
        raise AdmissionValidationError(
            "The scanner business entity belongs to another organisation."
        )

    if token.business_entity_id and token.business_entity_id != business_entity.id:
        raise AdmissionValidationError(
            "This ticket belongs to another business entity."
        )

    if not business_entity.is_active:
        raise AdmissionValidationError(
            "The scanner business entity is inactive."
        )

    if not business_entity.can_scan_tickets:
        raise AdmissionValidationError(
            "The scanner business entity cannot scan tickets."
        )


def _validate_locked_token_for_admission(
    token: AdmissionToken,
    *,
    requested_quantity: int,
    business_entity: TicketingBusinessEntity | None,
):
    _validate_entity_scope(token, business_entity)

    booking = token.booking
    now = timezone.now()

    blocked_statuses = {
        "draft": "This booking is still a draft.",
        "pending_payment": "This booking is awaiting payment.",
        "pending_approval": "This booking is awaiting approval.",
        "cancelled": "This booking was cancelled.",
        "refunded": "This booking was refunded.",
        "no_show": "This booking is marked as a no-show.",
    }

    if booking.status in blocked_statuses:
        raise AdmissionValidationError(blocked_statuses[booking.status])

    if token.status == "revoked":
        raise AdmissionValidationError("This ticket was revoked.")

    if token.status == "expired":
        raise AdmissionValidationError("This ticket has expired.")

    if token.status == "consumed" or token.remaining_admissions <= 0:
        raise AdmissionConflictError(
            "This ticket has already been fully used."
        )

    if token.valid_from and now < token.valid_from:
        raise AdmissionValidationError("This ticket is not valid yet.")

    if token.valid_until and now > token.valid_until:
        token.status = "expired"
        token.save(update_fields=["status"])
        raise AdmissionValidationError("This ticket has expired.")

    if requested_quantity < 1:
        raise AdmissionValidationError(
            "Admission quantity must be at least one."
        )

    if requested_quantity > token.remaining_admissions:
        raise AdmissionConflictError(
            f"Only {token.remaining_admissions} admission(s) remain."
        )


def _record_failed_attempt(
    *,
    token,
    organisation,
    business_entity,
    scanned_by,
    raw_value,
    requested_quantity,
    result,
    message,
    scanner_device_id,
    scanner_name,
    location_name,
    offline_event_id,
    metadata,
    request,
):
    from .tokens import _record_scan_attempt

    return _record_scan_attempt(
        organisation=organisation,
        business_entity=business_entity,
        scanned_by=scanned_by,
        admission_token=token,
        result=result,
        scanned_value=str(raw_value or ""),
        requested_quantity=requested_quantity,
        failure_reason=message,
        scanner_device_id=scanner_device_id,
        scanner_name=scanner_name,
        location_name=location_name,
        offline_event_id=offline_event_id,
        metadata=metadata,
        request=request,
    )


def _ensure_scan_attempt(
    *,
    token,
    organisation,
    business_entity,
    scanned_by,
    raw_value,
    requested_quantity,
    scanner_device_id,
    scanner_name,
    location_name,
    offline_event_id,
    metadata,
    request,
    scan_attempt=None,
):
    if scan_attempt:
        return scan_attempt

    from .tokens import _record_scan_attempt

    return _record_scan_attempt(
        organisation=organisation,
        business_entity=business_entity,
        scanned_by=scanned_by,
        admission_token=token,
        result="valid",
        scanned_value=str(raw_value or ""),
        requested_quantity=requested_quantity,
        scanner_device_id=scanner_device_id,
        scanner_name=scanner_name,
        location_name=location_name,
        offline_event_id=offline_event_id,
        metadata=metadata,
        request=request,
    )


def _update_scan_attempt_after_admission(
    scan_attempt,
    admission,
    admitted_quantity,
):
    if not scan_attempt:
        return

    scan_attempt.result = "admitted"
    scan_attempt.admitted_quantity = admitted_quantity
    scan_attempt.failure_reason = ""
    scan_attempt.save(
        update_fields=[
            "result",
            "admitted_quantity",
            "failure_reason",
        ]
    )


@transaction.atomic
def admit_guests(
    raw_value,
    *,
    organisation,
    business_entity: TicketingBusinessEntity | None = None,
    admitted_by=None,
    requested_quantity: int = 1,
    scanner_device_id="",
    scanner_name="",
    location_name="",
    notes="",
    offline_event_id=None,
    metadata=None,
    request=None,
    scan_attempt: TicketScanAttempt | None = None,
) -> AdmissionResult:
    """
    Admit guests atomically.

    The token is reloaded with select_for_update so two scanners cannot consume
    the same remaining admission at the same time.
    """

    requested_quantity = int(requested_quantity or 1)
    offline_event_id = _normalise_offline_event_id(offline_event_id)

    existing_attempt = _load_existing_offline_attempt(offline_event_id)
    if existing_attempt:
        existing_admission = getattr(existing_attempt, "admission", None)

        if existing_admission:
            token = existing_attempt.admission_token
            return AdmissionResult(
                ok=True,
                message="Offline admission was already processed.",
                token=token,
                admission=existing_admission,
                scan_attempt=existing_attempt,
                admitted_quantity=existing_admission.quantity_admitted,
                remaining_admissions=token.remaining_admissions,
                already_processed=True,
            )

        raise AdmissionConflictError(
            "This offline scan event was already processed."
        )

    token = None

    try:
        token = _load_locked_token(raw_value, organisation)

        _validate_locked_token_for_admission(
            token,
            requested_quantity=requested_quantity,
            business_entity=business_entity,
        )

        scan_attempt = _ensure_scan_attempt(
            token=token,
            organisation=organisation,
            business_entity=business_entity or token.business_entity,
            scanned_by=admitted_by,
            raw_value=raw_value,
            requested_quantity=requested_quantity,
            scanner_device_id=scanner_device_id,
            scanner_name=scanner_name,
            location_name=location_name,
            offline_event_id=offline_event_id,
            metadata=metadata,
            request=request,
            scan_attempt=scan_attempt,
        )

        if scan_attempt.admission_token_id != token.id:
            raise AdmissionValidationError(
                "The scan attempt does not belong to this admission token."
            )

        if getattr(scan_attempt, "admission", None):
            existing_admission = scan_attempt.admission
            return AdmissionResult(
                ok=True,
                message="This scan was already admitted.",
                token=token,
                admission=existing_admission,
                scan_attempt=scan_attempt,
                admitted_quantity=existing_admission.quantity_admitted,
                remaining_admissions=token.remaining_admissions,
                already_processed=True,
            )

        admission = TicketAdmission.objects.create(
            organisation=organisation,
            business_entity=business_entity or token.business_entity,
            booking=token.booking,
            booking_item=token.booking_item,
            admission_token=token,
            scan_attempt=scan_attempt,
            quantity_admitted=requested_quantity,
            status="admitted",
            admitted_at=timezone.now(),
            admitted_by=admitted_by,
            scanner_device_id=scanner_device_id or "",
            location_name=location_name or "",
            notes=notes or "",
            metadata={
                "scanner_name": scanner_name or "",
                "offline_event_id": (
                    str(offline_event_id) if offline_event_id else None
                ),
                **(metadata or {}),
            },
        )

        token.admitted_quantity += requested_quantity
        token.status = (
            "consumed"
            if token.admitted_quantity >= token.total_admissions
            else "active"
        )
        token.save(
            update_fields=[
                "admitted_quantity",
                "status",
            ]
        )

        _update_scan_attempt_after_admission(
            scan_attempt,
            admission,
            requested_quantity,
        )

        _post_admission_ledger_or_event(
            admission=admission,
            created_by=admitted_by,
        )

        return AdmissionResult(
            ok=True,
            message="Guests admitted successfully.",
            token=token,
            admission=admission,
            scan_attempt=scan_attempt,
            admitted_quantity=requested_quantity,
            remaining_admissions=token.remaining_admissions,
        )

    except AdmissionConflictError as exc:
        if token:
            _record_failed_attempt(
                token=token,
                organisation=organisation,
                business_entity=business_entity or token.business_entity,
                scanned_by=admitted_by,
                raw_value=raw_value,
                requested_quantity=requested_quantity,
                result="already_used",
                message=str(exc),
                scanner_device_id=scanner_device_id,
                scanner_name=scanner_name,
                location_name=location_name,
                offline_event_id=offline_event_id,
                metadata=metadata,
                request=request,
            )
        raise

    except (AdmissionValidationError, AdmissionTokenValidationError) as exc:
        if token:
            _record_failed_attempt(
                token=token,
                organisation=organisation,
                business_entity=business_entity or token.business_entity,
                scanned_by=admitted_by,
                raw_value=raw_value,
                requested_quantity=requested_quantity,
                result="invalid",
                message=str(exc),
                scanner_device_id=scanner_device_id,
                scanner_name=scanner_name,
                location_name=location_name,
                offline_event_id=offline_event_id,
                metadata=metadata,
                request=request,
            )
        raise AdmissionValidationError(str(exc)) from exc


@transaction.atomic
def reverse_admission(
    admission: TicketAdmission,
    *,
    reversed_by=None,
    reason: str,
) -> TicketAdmission:
    """
    Reverse an admission and restore token capacity atomically.
    """

    admission = (
        TicketAdmission.objects.select_for_update()
        .select_related(
            "admission_token",
            "scan_attempt",
            "booking",
            "booking_item",
            "business_entity",
        )
        .get(pk=admission.pk)
    )

    if admission.status == "reversed":
        return admission

    reason = str(reason or "").strip()
    if not reason:
        raise AdmissionValidationError(
            "A reversal reason is required."
        )

    token = (
        AdmissionToken.objects.select_for_update()
        .get(pk=admission.admission_token_id)
    )

    token.admitted_quantity = max(
        token.admitted_quantity - admission.quantity_admitted,
        0,
    )

    now = timezone.now()

    if token.status == "revoked":
        new_status = "revoked"
    elif token.valid_until and now > token.valid_until:
        new_status = "expired"
    elif token.admitted_quantity >= token.total_admissions:
        new_status = "consumed"
    else:
        new_status = "active"

    token.status = new_status
    token.save(
        update_fields=[
            "admitted_quantity",
            "status",
        ]
    )

    admission.status = "reversed"
    admission.reversed_at = now
    admission.reversed_by = reversed_by
    admission.reversal_reason = reason
    admission.save(
        update_fields=[
            "status",
            "reversed_at",
            "reversed_by",
            "reversal_reason",
        ]
    )

    if admission.scan_attempt:
        admission.scan_attempt.metadata = {
            **(admission.scan_attempt.metadata or {}),
            "admission_reversed": True,
            "reversal_reason": reason,
            "reversed_at": now.isoformat(),
        }
        admission.scan_attempt.save(update_fields=["metadata"])

    _post_admission_reversal_ledger_or_event(
        admission=admission,
        created_by=reversed_by,
    )

    return admission


def resolve_and_admit(
    raw_value,
    *,
    organisation,
    business_entity=None,
    admitted_by=None,
    requested_quantity=1,
    scanner_device_id="",
    scanner_name="",
    location_name="",
    notes="",
    offline_event_id=None,
    metadata=None,
    request=None,
) -> AdmissionResult:
    """
    Convenience wrapper for API views.

    It first creates the visible scan-resolution audit row, then performs the
    locked admission using the same scan attempt.
    """

    resolution: TokenResolution = resolve_admission_token(
        raw_value,
        organisation=organisation,
        business_entity=business_entity,
        scanned_by=admitted_by,
        requested_quantity=requested_quantity,
        scanner_device_id=scanner_device_id,
        scanner_name=scanner_name,
        location_name=location_name,
        offline_event_id=offline_event_id,
        metadata=metadata,
        request=request,
        record_attempt=True,
    )

    if not resolution.ok:
        raise AdmissionValidationError(resolution.message)

    return admit_guests(
        raw_value,
        organisation=organisation,
        business_entity=business_entity,
        admitted_by=admitted_by,
        requested_quantity=requested_quantity,
        scanner_device_id=scanner_device_id,
        scanner_name=scanner_name,
        location_name=location_name,
        notes=notes,
        offline_event_id=offline_event_id,
        metadata=metadata,
        request=request,
        scan_attempt=resolution.scan_attempt,
    )


def _post_admission_ledger_or_event(admission, created_by=None):
    """
    Optional bridge for future attendance-based settlement posting.

    Admissions themselves are operational events, not cash movements. We only
    create a zero-value audit ledger entry when the model permits it. The
    settlement generator should use TicketAdmission as its source of truth.
    """

    try:
        from ticketing.models import TicketingLedgerEntry

        TicketingLedgerEntry.objects.create(
            organisation=admission.organisation,
            booking=admission.booking,
            booking_item=admission.booking_item,
            business_entity=admission.business_entity,
            entry_group=uuid.uuid4(),
            entry_type="admission",
            direction="debit",
            party_type="partner",
            amount=0,
            currency=getattr(
                getattr(
                    admission.organisation,
                    "ticketing_settings",
                    None,
                ),
                "default_currency",
                "USD",
            ) or "USD",
            description=(
                f"{admission.quantity_admitted} guest(s) admitted for "
                f"{admission.booking.booking_code}."
            ),
            reference=admission.booking.booking_code,
            effective_at=admission.admitted_at,
            metadata={
                "admission_id": admission.id,
                "quantity_admitted": admission.quantity_admitted,
            },
            created_by=created_by,
        )
    except Exception:
        return None


def _post_admission_reversal_ledger_or_event(admission, created_by=None):
    try:
        from ticketing.models import TicketingLedgerEntry

        TicketingLedgerEntry.objects.create(
            organisation=admission.organisation,
            booking=admission.booking,
            booking_item=admission.booking_item,
            business_entity=admission.business_entity,
            entry_group=uuid.uuid4(),
            entry_type="reversal",
            direction="credit",
            party_type="partner",
            amount=0,
            currency=getattr(
                getattr(
                    admission.organisation,
                    "ticketing_settings",
                    None,
                ),
                "default_currency",
                "USD",
            ) or "USD",
            description=(
                f"Admission reversal for {admission.quantity_admitted} guest(s) "
                f"on {admission.booking.booking_code}."
            ),
            reference=admission.booking.booking_code,
            effective_at=admission.reversed_at or timezone.now(),
            metadata={
                "admission_id": admission.id,
                "quantity_reversed": admission.quantity_admitted,
                "reversal_reason": admission.reversal_reason,
            },
            created_by=created_by,
        )
    except Exception:
        return None
