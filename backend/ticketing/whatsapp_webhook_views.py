import hashlib
import hmac
import json
import logging

from django.db.models import Q
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ticketing.models import TicketingWhatsAppSettings


logger = logging.getLogger(__name__)


def _find_settings_from_payload(payload):
    """
    Locate the organisation's WhatsApp settings using the WABA ID
    or Phone Number ID contained in Meta's webhook payload.
    """
    entries = payload.get("entry") or []

    if not entries:
        return None

    entry = entries[0] if isinstance(entries[0], dict) else {}

    business_account_id = str(entry.get("id") or "").strip()
    phone_number_id = ""

    changes = entry.get("changes") or []

    if changes and isinstance(changes[0], dict):
        value = changes[0].get("value") or {}
        metadata = value.get("metadata") or {}

        phone_number_id = str(
            metadata.get("phone_number_id") or ""
        ).strip()

    filters = Q()

    if business_account_id:
        filters |= Q(business_account_id=business_account_id)

    if phone_number_id:
        filters |= Q(phone_number_id=phone_number_id)

    if not business_account_id and not phone_number_id:
        return None

    return (
        TicketingWhatsAppSettings.objects
        .filter(filters)
        .select_related("organisation")
        .first()
    )


def _valid_meta_signature(settings_obj, raw_body, signature_header):
    """
    Validate Meta's X-Hub-Signature-256 header using the app secret.
    """
    app_secret = str(
        settings_obj.meta_app_secret or ""
    ).strip()

    if not app_secret or not signature_header:
        return False

    expected_digest = hmac.new(
        app_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()

    expected_signature = f"sha256={expected_digest}"

    return hmac.compare_digest(
        expected_signature,
        signature_header,
    )


@csrf_exempt
@require_http_methods(["GET", "POST"])
def whatsapp_webhook(request):
    """
    Meta WhatsApp Cloud API webhook.

    GET:
        Verifies the callback URL using the saved verify token.

    POST:
        Receives WhatsApp messages and delivery-status events.
    """

    if request.method == "GET":
        mode = request.GET.get("hub.mode", "")
        verify_token = request.GET.get(
            "hub.verify_token",
            "",
        )
        challenge = request.GET.get("hub.challenge", "")

        if mode != "subscribe":
            return HttpResponse(
                "Invalid webhook mode.",
                status=400,
            )

        settings_obj = (
            TicketingWhatsAppSettings.objects
            .filter(webhook_verify_token=verify_token)
            .first()
        )

        if settings_obj is None:
            logger.warning(
                "WhatsApp webhook verification rejected: "
                "verify token did not match."
            )

            return HttpResponse(
                "Invalid verify token.",
                status=403,
            )

        now = timezone.now()

        settings_obj.webhook_subscribed = True
        settings_obj.webhook_subscribed_at = now
        settings_obj.last_error_message = ""

        settings_obj.save(
            update_fields=[
                "webhook_subscribed",
                "webhook_subscribed_at",
                "last_error_message",
                "updated_at",
            ]
        )

        logger.info(
            "WhatsApp webhook verified for organisation %s",
            settings_obj.organisation_id,
        )

        # Meta requires the challenge as plain text.
        return HttpResponse(
            challenge,
            content_type="text/plain",
            status=200,
        )

    raw_body = request.body

    try:
        payload = json.loads(
            raw_body.decode("utf-8") or "{}"
        )
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JsonResponse(
            {
                "success": False,
                "message": "Invalid JSON payload.",
            },
            status=400,
        )

    settings_obj = _find_settings_from_payload(payload)

    if settings_obj is None:
        logger.warning(
            "WhatsApp webhook received for an unknown "
            "business account or phone number."
        )

        return JsonResponse(
            {
                "success": False,
                "message": (
                    "Unknown WhatsApp Business Account "
                    "or Phone Number ID."
                ),
            },
            status=404,
        )

    signature_header = request.headers.get(
        "X-Hub-Signature-256",
        "",
    )

    if not _valid_meta_signature(
        settings_obj,
        raw_body,
        signature_header,
    ):
        logger.warning(
            "Invalid WhatsApp webhook signature for "
            "organisation %s",
            settings_obj.organisation_id,
        )

        return JsonResponse(
            {
                "success": False,
                "message": "Invalid webhook signature.",
            },
            status=403,
        )

    if not settings_obj.webhook_subscribed:
        settings_obj.webhook_subscribed = True
        settings_obj.webhook_subscribed_at = timezone.now()

        settings_obj.save(
            update_fields=[
                "webhook_subscribed",
                "webhook_subscribed_at",
                "updated_at",
            ]
        )

    entries = payload.get("entry") or []

    logger.info(
        "Valid WhatsApp webhook received for organisation %s; "
        "entries=%s",
        settings_obj.organisation_id,
        len(entries),
    )

    # Later, pass `payload` to your WhatsApp adapter/customer agent.
    # Do not perform slow AI processing directly in this request.
    # Queue it through Celery and return 200 quickly.

    return JsonResponse(
        {
            "success": True,
            "received": True,
        },
        status=200,
    )