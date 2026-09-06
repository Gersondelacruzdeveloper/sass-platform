from __future__ import annotations

import re
from datetime import timedelta

from django.db import transaction
from django.utils import timezone

from partner_network.models import (
    ReferralBookingAttribution,
    ReferralQRCode,
    ReferralSession,
)
from partner_network.services.product_access_service import is_product_allowed
from partner_network.services.settings_service import get_partner_network_settings


REFERRAL_PATTERN = re.compile(
    r"(?:Ref:\s*)?PCDREF:([A-Za-z0-9_\-]{20,100})",
    re.IGNORECASE,
)


def extract_referral_token(text: str):
    match = REFERRAL_PATTERN.search(str(text or ""))
    return match.group(1) if match else None


def strip_referral_marker(text: str):
    cleaned = REFERRAL_PATTERN.sub("", str(text or ""))
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip(" -.,")
    return cleaned or "Hi, I'd like help with excursions."


def get_active_referral_session(conversation, *, now=None):
    # Hard feature gate: when Partner Network is disabled for the organisation,
    # existing/old referral sessions must become invisible to the customer AI.
    # This guarantees ordinary direct Ticketing behavior remains unchanged.
    if get_partner_network_settings(conversation.organisation) is None:
        return None

    now = now or timezone.now()

    return (
        ReferralSession.objects.select_related(
            "partner",
            "partner_location__linked_pickup_location",
            "qr_code",
        )
        .filter(
            conversation=conversation,
            organisation=conversation.organisation,
            status=ReferralSession.STATUS_ACTIVE,
            expires_at__gt=now,
            partner__status="active",
            partner_location__is_active=True,
            qr_code__status=ReferralQRCode.STATUS_ACTIVE,
        )
        .order_by("-started_at", "-pk")
        .first()
    )


@transaction.atomic
def claim_referral_from_message(*, conversation, text: str):
    token = extract_referral_token(text)
    if not token:
        return None, text

    settings_obj = get_partner_network_settings(conversation.organisation)
    if settings_obj is None:
        return None, text

    qr = (
        ReferralQRCode.objects.select_for_update()
        .select_related("partner_location__partner")
        .filter(
            token=token,
            status=ReferralQRCode.STATUS_ACTIVE,
            partner_location__partner__organisation=conversation.organisation,
            partner_location__partner__status="active",
            partner_location__is_active=True,
        )
        .first()
    )
    if qr is None:
        return None, text

    now = timezone.now()

    ReferralSession.objects.filter(
        conversation=conversation,
        status=ReferralSession.STATUS_ACTIVE,
    ).update(
        status=ReferralSession.STATUS_CLOSED,
        last_activity_at=now,
    )

    session = ReferralSession.objects.create(
        organisation=conversation.organisation,
        conversation=conversation,
        partner=qr.partner_location.partner,
        partner_location=qr.partner_location,
        qr_code=qr,
        status=ReferralSession.STATUS_ACTIVE,
        started_at=now,
        last_activity_at=now,
        expires_at=now + timedelta(hours=settings_obj.referral_session_hours),
    )

    return session, strip_referral_marker(text)


def get_referral_session_for_cart(cart):
    """Resolve the referral that was active when this cart was created.

    A newer QR scan must not steal attribution from an already-created cart.
    Sessions may now be closed/expired; the time window at cart creation is the
    authority, while the partner/property still need to be operational now.
    """
    # Historical attribution is still feature-gated. Disabling Partner Network
    # must make the extension a no-op without affecting ordinary ticketing.
    if get_partner_network_settings(cart.organisation) is None:
        return None

    created_at = getattr(cart, "created_at", None) or timezone.now()

    return (
        ReferralSession.objects.select_related(
            "partner",
            "partner_location__linked_pickup_location",
            "qr_code",
        )
        .filter(
            conversation=cart.conversation,
            organisation=cart.organisation,
            started_at__lte=created_at,
            expires_at__gte=created_at,
            partner__status="active",
            partner_location__is_active=True,
        )
        .order_by("-started_at", "-pk")
        .first()
    )


def validate_cart_for_referral(*, cart, referral_session):
    location = referral_session.partner_location
    pickup_location_id = location.linked_pickup_location_id

    for item in cart.items.select_related("product").all():
        if not is_product_allowed(
            organisation=cart.organisation,
            product=item.product,
            partner=referral_session.partner,
            partner_location=location,
        ):
            raise ValueError(
                "One or more cart products are not enabled for this referral partner."
            )

        if getattr(item.product, "requires_pickup_location", False):
            if not pickup_location_id:
                raise ValueError(
                    "The referral property does not have a configured pickup location."
                )

            if item.pickup_location_id != pickup_location_id:
                raise ValueError(
                    "The cart pickup location does not match the referral property."
                )


@transaction.atomic
def attribute_booking_from_cart(*, cart, booking):
    if ReferralBookingAttribution.objects.filter(booking=booking).exists():
        return ReferralBookingAttribution.objects.get(booking=booking), False

    session = get_referral_session_for_cart(cart)
    if session is None:
        return None, False

    validate_cart_for_referral(
        cart=cart,
        referral_session=session,
    )

    attribution, created = ReferralBookingAttribution.objects.get_or_create(
        booking=booking,
        defaults={
            "referral_session": session,
            "partner": session.partner,
            "partner_location": session.partner_location,
            "referral_qr": session.qr_code,
            "source": "qr_whatsapp",
            "metadata": {
                "conversation_id": cart.conversation_id,
                "cart_id": cart.pk,
            },
        },
    )

    return attribution, created
