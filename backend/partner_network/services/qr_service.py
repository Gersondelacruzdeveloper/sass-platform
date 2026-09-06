from __future__ import annotations

import io
import re
from urllib.parse import quote

import qrcode
from django.conf import settings
from django.db import transaction
from django.urls import reverse

from partner_network.models import ReferralQRCode, ReferralQRScan
from partner_network.services.settings_service import is_partner_network_enabled
from ticketing.models import TicketingWhatsAppSettings


@transaction.atomic
def generate_qr_for_location(location):
    if not is_partner_network_enabled(location.partner.organisation):
        raise ValueError("Partner Network is not enabled for this organisation.")
    if location.partner.status != "active":
        raise ValueError("Referral partner must be active before generating a QR code.")
    ReferralQRCode.objects.select_for_update().filter(
        partner_location=location,
        status=ReferralQRCode.STATUS_ACTIVE,
    ).update(status=ReferralQRCode.STATUS_REVOKED)
    return ReferralQRCode.objects.create(partner_location=location)


def get_active_qr(token):
    return (
        ReferralQRCode.objects.select_related(
            "partner_location__partner__organisation",
            "partner_location__linked_pickup_location",
        )
        .filter(token=token, status=ReferralQRCode.STATUS_ACTIVE)
        .first()
    )


def public_referral_url(*, request, qr_code):
    path = reverse("partner-network-public-referral", kwargs={"token": qr_code.token})
    if request is not None:
        return request.build_absolute_uri(path)
    backend_url = str(getattr(settings, "BACKEND_URL", "") or "").rstrip("/")
    return f"{backend_url}{path}" if backend_url else path


def normalise_whatsapp_number(value: str) -> str:
    return re.sub(r"\D+", "", str(value or ""))


def whatsapp_redirect_url(qr_code):
    organisation = qr_code.organisation
    wa_settings = TicketingWhatsAppSettings.objects.filter(
        organisation=organisation,
        is_active=True,
    ).first()
    number = normalise_whatsapp_number(
        getattr(wa_settings, "display_phone_number", "") if wa_settings else ""
    )
    if not number:
        number = normalise_whatsapp_number(getattr(organisation, "phone", ""))
    if not number:
        raise ValueError("No public WhatsApp number is configured.")
    # The marker is intentionally human-readable and removed from AI-visible text
    # by the WhatsApp attribution hook before the AI task runs.
    message = f"Hi, I'd like help with excursions. Ref: PCDREF:{qr_code.token}"
    return f"https://wa.me/{number}?text={quote(message)}"


def record_scan(qr_code, request=None):
    user_agent = ""
    if request is not None:
        user_agent = str(request.META.get("HTTP_USER_AGENT", ""))[:300]
    return ReferralQRScan.objects.create(qr_code=qr_code, user_agent=user_agent)


def render_qr_png(qr_code, request=None):
    image = qrcode.make(public_referral_url(request=request, qr_code=qr_code))
    output = io.BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()
