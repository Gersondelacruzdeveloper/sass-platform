"""
Secure admission-token lifecycle and QR resolution.

This module is responsible for:

- issuing one secure UUID token per booking item;
- resolving a raw UUID or QR URL into an AdmissionToken;
- validating booking, date, partner, quantity, and token state;
- rotating, revoking, expiring, and consuming tokens;
- recording scan attempts for both successful and failed resolutions.

It does not admit guests. Admission writes and quantity increments belong in
ticketing.operations.admissions so they can be performed with row locking.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
import re
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse
import uuid

from django.db import transaction
from django.utils import timezone

from ticketing.models import (
    AdmissionToken,
    BookingItem,
    ProductBusinessAgreement,
    TicketScanAttempt,
    TicketingBusinessEntity,
)


ADMISSION_TOKEN_SERVICE_VERSION = "lock-fix-v2-2026-07-12"

ACTIVE_BOOKING_STATUSES = {
    "confirmed",
    "ticket_generated",
    "completed",
}

BLOCKED_BOOKING_STATUS_RESULTS = {
    "cancelled": ("cancelled", "This booking was cancelled."),
    "refunded": ("refunded", "This booking was refunded."),
    "no_show": ("invalid", "This booking is marked as a no-show."),
    "draft": ("invalid", "This booking is still a draft."),
    "pending_payment": ("invalid", "This booking is awaiting payment."),
    "pending_approval": ("invalid", "This booking is awaiting approval."),
}

UUID_PATTERN = re.compile(
    r"(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-"
    r"[89ab][0-9a-f]{3}-[0-9a-f]{12}\b"
)


class AdmissionTokenError(Exception):
    """Base error for admission-token operations."""


class AdmissionTokenNotFound(AdmissionTokenError):
    pass


class AdmissionTokenValidationError(AdmissionTokenError):
    pass


@dataclass(frozen=True)
class TokenResolution:
    ok: bool
    result: str
    message: str
    token: AdmissionToken | None = None
    scan_attempt: TicketScanAttempt | None = None
    remaining_admissions: int = 0
    requested_quantity: int = 0
    service_date: Any = None

    def as_dict(self) -> dict[str, Any]:
        booking = self.token.booking if self.token else None
        item = self.token.booking_item if self.token else None
        entity = self.token.business_entity if self.token else None

        return {
            "ok": self.ok,
            "result": self.result,
            "message": self.message,
            "token": str(self.token.token) if self.token else None,
            "token_id": self.token.id if self.token else None,
            "booking_id": booking.id if booking else None,
            "booking_code": booking.booking_code if booking else "",
            "booking_status": booking.status if booking else "",
            "booking_item_id": item.id if item else None,
            "product_name": item.product_name if item else "",
            "product_type": item.product_type if item else "",
            "business_entity_id": entity.id if entity else None,
            "business_entity_name": entity.name if entity else "",
            "service_date": str(self.service_date) if self.service_date else None,
            "total_admissions": self.token.total_admissions if self.token else 0,
            "admitted_quantity": self.token.admitted_quantity if self.token else 0,
            "remaining_admissions": self.remaining_admissions,
            "requested_quantity": self.requested_quantity,
            "scan_attempt_id": self.scan_attempt.id if self.scan_attempt else None,
        }


def extract_token_uuid(raw_value: Any) -> uuid.UUID:
    """
    Accept a UUID, AdmissionToken, plain UUID string, or QR URL.

    Supported URL examples:
        https://app.example.com/ticket/verify/<uuid>
        https://app.example.com/check-in?token=<uuid>
        pcd://ticket/<uuid>
    """

    if isinstance(raw_value, AdmissionToken):
        return raw_value.token

    if isinstance(raw_value, uuid.UUID):
        return raw_value

    value = unquote(str(raw_value or "").strip())
    if not value:
        raise AdmissionTokenValidationError("A QR token is required.")

    try:
        return uuid.UUID(value)
    except (ValueError, AttributeError):
        pass

    try:
        parsed = urlparse(value)
        query = parse_qs(parsed.query)

        for key in ("token", "ticket", "qr", "admission_token"):
            candidate = (query.get(key) or [None])[0]
            if candidate:
                try:
                    return uuid.UUID(str(candidate))
                except (ValueError, AttributeError):
                    continue
    except Exception:
        pass

    match = UUID_PATTERN.search(value)
    if match:
        return uuid.UUID(match.group(0))

    raise AdmissionTokenValidationError("The scanned QR code is not valid.")


def get_active_agreement(
    booking_item: BookingItem,
    business_entity: TicketingBusinessEntity | None = None,
):
    """
    Resolve the agreement that applies to this booking item and service date.
    """

    service_date = (
        booking_item.service_date
        or booking_item.booking.service_date
        or timezone.localdate()
    )

    product_id = getattr(booking_item, "product_id", None)
    if not product_id:
        return None

    queryset = ProductBusinessAgreement.objects.filter(
        organisation_id=booking_item.booking.organisation_id,
        product_id=product_id,
        is_active=True,
        effective_from__lte=service_date,
    ).filter(
        models_q_effective_until(service_date)
    ).select_related("business_entity")

    if business_entity:
        queryset = queryset.filter(business_entity=business_entity)

    return queryset.order_by("-effective_from", "-version").first()


def models_q_effective_until(service_date):
    # Local import avoids importing django.db.models as a broad namespace above.
    from django.db.models import Q

    return Q(effective_until__isnull=True) | Q(effective_until__gte=service_date)


def resolve_business_entity_for_item(
    booking_item: BookingItem,
    business_entity: TicketingBusinessEntity | None = None,
):
    if business_entity:
        if business_entity.organisation_id != booking_item.booking.organisation_id:
            raise AdmissionTokenValidationError(
                "The business entity does not belong to this organisation."
            )
        return business_entity

    agreement = get_active_agreement(booking_item)
    return agreement.business_entity if agreement else None


def default_total_admissions(booking_item: BookingItem) -> int:
    quantity = int(getattr(booking_item, "quantity", 0) or 0)
    if quantity > 0:
        return quantity

    booking = booking_item.booking
    total_guests = int(getattr(booking, "total_guests", 0) or 0)
    return max(total_guests, 1)


def default_validity_window(
    booking_item: BookingItem,
    *,
    day_start_hour: int = 0,
    grace_hours_after: int = 12,
):
    """
    Build a practical validity window around the service date.

    If a service time exists, validity begins 12 hours before and ends after the
    configured grace period. Date-only products are valid for the full service
    day plus the grace period.
    """

    service_date = booking_item.service_date or booking_item.booking.service_date
    service_time = booking_item.service_time or booking_item.booking.service_time

    if not service_date:
        return None, None

    tz = timezone.get_current_timezone()

    if service_time:
        service_dt = timezone.make_aware(
            datetime.combine(service_date, service_time),
            timezone=tz,
        )
        return service_dt - timedelta(hours=12), service_dt + timedelta(
            hours=grace_hours_after
        )

    start = timezone.make_aware(
        datetime.combine(service_date, time(hour=day_start_hour)),
        timezone=tz,
    )
    end = start + timedelta(days=1, hours=grace_hours_after)
    return start, end


@transaction.atomic
def issue_admission_token(
    booking_item: BookingItem,
    *,
    business_entity: TicketingBusinessEntity | None = None,
    total_admissions: int | None = None,
    valid_from=None,
    valid_until=None,
    is_primary: bool = True,
    metadata: dict | None = None,
    replace_existing_primary: bool = False,
) -> AdmissionToken:
    """
    Issue a secure token for a booking item.

    By default, an existing active primary token is reused. Set
    replace_existing_primary=True to revoke it and issue a new one.
    """

    # Lock only the BookingItem row.
    #
    # Do not combine select_for_update() with select_related("product") here.
    # BookingItem.product is nullable, so PostgreSQL creates a LEFT OUTER JOIN
    # and rejects FOR UPDATE on the nullable side of that join.
    booking_item = BookingItem.objects.select_for_update().get(
        pk=booking_item.pk
    )

    entity = resolve_business_entity_for_item(booking_item, business_entity)

    if entity and not entity.is_active:
        raise AdmissionTokenValidationError(
            "The selected business entity is inactive."
        )

    if entity and not entity.can_scan_tickets:
        raise AdmissionTokenValidationError(
            "The selected business entity cannot scan tickets."
        )

    existing = (
        AdmissionToken.objects.select_for_update()
        .filter(
            booking_item=booking_item,
            is_primary=True,
            status="active",
        )
        .order_by("-issued_at")
        .first()
    )

    if existing and not replace_existing_primary:
        return existing

    if existing and replace_existing_primary:
        existing.revoke(
            reason="Replaced by a newly issued primary admission token."
        )

    total = int(total_admissions or default_total_admissions(booking_item))
    if total < 1:
        raise AdmissionTokenValidationError(
            "Total admissions must be at least one."
        )

    if valid_from is None and valid_until is None:
        valid_from, valid_until = default_validity_window(booking_item)

    if valid_from and valid_until and valid_until <= valid_from:
        raise AdmissionTokenValidationError(
            "Token valid-until must be later than valid-from."
        )

    token_metadata = {
        "booking_code": booking_item.booking.booking_code,
        "booking_item_id": booking_item.id,
        "product_id": booking_item.product_id,
        "product_name": booking_item.product_name,
        **(metadata or {}),
    }

    return AdmissionToken.objects.create(
        organisation=booking_item.booking.organisation,
        booking=booking_item.booking,
        booking_item=booking_item,
        business_entity=entity,
        total_admissions=total,
        valid_from=valid_from,
        valid_until=valid_until,
        is_primary=is_primary,
        metadata=token_metadata,
    )


def get_or_create_primary_token(
    booking_item: BookingItem,
    **kwargs,
) -> AdmissionToken:
    token = (
        AdmissionToken.objects.filter(
            booking_item=booking_item,
            is_primary=True,
            status="active",
        )
        .order_by("-issued_at")
        .first()
    )
    return token or issue_admission_token(booking_item, **kwargs)


@transaction.atomic
def rotate_admission_token(
    token: AdmissionToken,
    *,
    revoked_by=None,
    reason="Admission token rotated.",
    metadata: dict | None = None,
) -> AdmissionToken:
    # Lock only the AdmissionToken row. Related objects are loaded lazily
    # after the lock, avoiding nullable OUTER JOIN targets in FOR UPDATE.
    token = AdmissionToken.objects.select_for_update().get(
        pk=token.pk
    )

    old_metadata = dict(token.metadata or {})
    token.revoke(user=revoked_by, reason=reason)

    return issue_admission_token(
        token.booking_item,
        business_entity=token.business_entity,
        total_admissions=token.remaining_admissions or token.total_admissions,
        valid_from=token.valid_from,
        valid_until=token.valid_until,
        is_primary=True,
        metadata={
            **old_metadata,
            **(metadata or {}),
            "rotated_from_token_id": token.id,
        },
        replace_existing_primary=False,
    )


@transaction.atomic
def revoke_admission_token(
    token: AdmissionToken,
    *,
    revoked_by=None,
    reason="Admission token revoked.",
):
    token = AdmissionToken.objects.select_for_update().get(pk=token.pk)

    if token.status == "revoked":
        return token

    token.revoke(user=revoked_by, reason=reason)
    return token


@transaction.atomic
def refresh_token_status(token: AdmissionToken) -> AdmissionToken:
    token = AdmissionToken.objects.select_for_update().get(pk=token.pk)
    now = timezone.now()

    new_status = token.status

    if token.status == "active":
        if token.remaining_admissions <= 0:
            new_status = "consumed"
        elif token.valid_until and now > token.valid_until:
            new_status = "expired"

    if new_status != token.status:
        token.status = new_status
        token.save(update_fields=["status"])

    return token


def get_client_ip(request) -> str | None:
    if not request:
        return None

    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip() or None

    return request.META.get("REMOTE_ADDR") or None


def _record_scan_attempt(
    *,
    organisation,
    result: str,
    scanned_value: str,
    requested_quantity: int,
    business_entity=None,
    scanned_by=None,
    admission_token=None,
    failure_reason="",
    scanner_device_id="",
    scanner_name="",
    location_name="",
    offline_event_id=None,
    metadata=None,
    request=None,
):
    if offline_event_id:
        existing = TicketScanAttempt.objects.filter(
            offline_event_id=offline_event_id
        ).first()
        if existing:
            return existing

    return TicketScanAttempt.objects.create(
        organisation=organisation,
        business_entity=business_entity,
        scanned_by=scanned_by,
        admission_token=admission_token,
        booking=admission_token.booking if admission_token else None,
        booking_item=admission_token.booking_item if admission_token else None,
        scanned_value=str(scanned_value or "")[:600],
        result=result,
        requested_quantity=max(int(requested_quantity or 0), 0),
        failure_reason=failure_reason or "",
        scanner_device_id=scanner_device_id or "",
        scanner_name=scanner_name or "",
        location_name=location_name or "",
        ip_address=get_client_ip(request),
        user_agent=(
            request.META.get("HTTP_USER_AGENT", "") if request else ""
        ),
        offline_event_id=offline_event_id,
        metadata=metadata or {},
    )


def _validation_result(
    *,
    ok,
    result,
    message,
    token,
    requested_quantity,
    scan_attempt=None,
):
    return TokenResolution(
        ok=ok,
        result=result,
        message=message,
        token=token,
        scan_attempt=scan_attempt,
        remaining_admissions=token.remaining_admissions if token else 0,
        requested_quantity=requested_quantity,
        service_date=(
            token.booking_item.service_date
            or token.booking.service_date
            if token
            else None
        ),
    )


def resolve_admission_token(
    raw_value,
    *,
    organisation,
    business_entity: TicketingBusinessEntity | None = None,
    scanned_by=None,
    requested_quantity: int = 1,
    scanner_device_id="",
    scanner_name="",
    location_name="",
    offline_event_id=None,
    metadata=None,
    request=None,
    record_attempt: bool = True,
) -> TokenResolution:
    """
    Resolve and validate a token without admitting guests.

    A successful result is "valid" or "partially_used". The admissions service
    must lock the same token again before incrementing admitted_quantity.
    """

    requested_quantity = int(requested_quantity or 1)
    if requested_quantity < 1:
        raise AdmissionTokenValidationError(
            "Requested admission quantity must be at least one."
        )

    try:
        token_uuid = extract_token_uuid(raw_value)
    except AdmissionTokenValidationError as exc:
        attempt = None
        if record_attempt:
            attempt = _record_scan_attempt(
                organisation=organisation,
                business_entity=business_entity,
                scanned_by=scanned_by,
                result="invalid",
                scanned_value=str(raw_value or ""),
                requested_quantity=requested_quantity,
                failure_reason=str(exc),
                scanner_device_id=scanner_device_id,
                scanner_name=scanner_name,
                location_name=location_name,
                offline_event_id=offline_event_id,
                metadata=metadata,
                request=request,
            )
        return TokenResolution(
            ok=False,
            result="invalid",
            message=str(exc),
            scan_attempt=attempt,
            requested_quantity=requested_quantity,
        )

    token = (
        AdmissionToken.objects.select_related(
            "booking",
            "booking_item",
            "booking_item__product",
            "business_entity",
            "organisation",
        )
        .filter(token=token_uuid)
        .first()
    )

    if not token:
        attempt = None
        if record_attempt:
            attempt = _record_scan_attempt(
                organisation=organisation,
                business_entity=business_entity,
                scanned_by=scanned_by,
                result="not_found",
                scanned_value=str(raw_value or ""),
                requested_quantity=requested_quantity,
                failure_reason="Admission token was not found.",
                scanner_device_id=scanner_device_id,
                scanner_name=scanner_name,
                location_name=location_name,
                offline_event_id=offline_event_id,
                metadata=metadata,
                request=request,
            )
        return TokenResolution(
            ok=False,
            result="not_found",
            message="Ticket not found.",
            scan_attempt=attempt,
            requested_quantity=requested_quantity,
        )

    def finish(ok, result, message):
        attempt = None
        if record_attempt:
            attempt = _record_scan_attempt(
                organisation=organisation,
                business_entity=business_entity,
                scanned_by=scanned_by,
                admission_token=token,
                result=result,
                scanned_value=str(raw_value or ""),
                requested_quantity=requested_quantity,
                failure_reason="" if ok else message,
                scanner_device_id=scanner_device_id,
                scanner_name=scanner_name,
                location_name=location_name,
                offline_event_id=offline_event_id,
                metadata=metadata,
                request=request,
            )
        return _validation_result(
            ok=ok,
            result=result,
            message=message,
            token=token,
            requested_quantity=requested_quantity,
            scan_attempt=attempt,
        )

    if token.organisation_id != organisation.id:
        return finish(False, "unauthorised", "This ticket belongs to another organisation.")

    if business_entity:
        if business_entity.organisation_id != organisation.id:
            return finish(False, "unauthorised", "The scanner business entity is invalid.")
        if token.business_entity_id and token.business_entity_id != business_entity.id:
            return finish(False, "wrong_partner", "This ticket belongs to another business entity.")

    booking_status = token.booking.status
    if booking_status in BLOCKED_BOOKING_STATUS_RESULTS:
        result, message = BLOCKED_BOOKING_STATUS_RESULTS[booking_status]
        return finish(False, result, message)

    if booking_status not in ACTIVE_BOOKING_STATUSES:
        return finish(False, "invalid", "This booking is not ready for admission.")

    now = timezone.now()

    if token.status == "revoked":
        return finish(False, "revoked", "This ticket was revoked.")

    if token.status == "expired":
        return finish(False, "expired", "This ticket has expired.")

    if token.status == "consumed" or token.remaining_admissions <= 0:
        return finish(False, "already_used", "This ticket has already been fully used.")

    if token.valid_from and now < token.valid_from:
        return finish(False, "wrong_date", "This ticket is not valid yet.")

    if token.valid_until and now > token.valid_until:
        return finish(False, "expired", "This ticket has expired.")

    if requested_quantity > token.remaining_admissions:
        return finish(
            False,
            "partially_used" if token.admitted_quantity else "invalid",
            (
                f"Only {token.remaining_admissions} admission(s) remain on this ticket."
            ),
        )

    result = "partially_used" if token.admitted_quantity > 0 else "valid"
    return finish(True, result, "Ticket is valid for admission.")


def build_qr_payload(
    token: AdmissionToken,
    *,
    base_url: str | None = None,
) -> str:
    """
    Build the value encoded into the QR image.

    Supplying base_url creates a scanner-friendly verification URL. Without it,
    the QR contains only the opaque UUID.
    """

    token_value = str(token.token)
    if not base_url:
        return token_value

    return f"{base_url.rstrip('/')}/{token_value}"
