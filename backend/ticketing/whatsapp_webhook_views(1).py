"""Meta WhatsApp Cloud API webhook for the customer AI channel.

The HTTP request performs only authentication, durable event storage, and task
enqueueing. OpenAI calls and WhatsApp replies run asynchronously in Celery.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone as datetime_timezone
from typing import Any, Iterable, Mapping

from django.conf import settings
from django.db import IntegrityError, transaction
from django.http import HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage
from ticketing.customer_ai_tasks import process_customer_ai_message_task
from ticketing.models import TicketingWhatsAppSettings


logger = logging.getLogger(__name__)

DEFAULT_MAX_WEBHOOK_BYTES = 1_000_000
SUPPORTED_MESSAGE_TYPES = {"text", "button", "interactive"}


def _iter_changes(payload: Mapping[str, Any]) -> Iterable[tuple[str, Mapping[str, Any]]]:
    """Yield every valid change together with its entry WABA identifier."""
    for entry in payload.get("entry") or []:
        if not isinstance(entry, Mapping):
            continue
        business_account_id = str(entry.get("id") or "").strip()
        for change in entry.get("changes") or []:
            if isinstance(change, Mapping):
                yield business_account_id, change


def _find_settings_from_payload(
    payload: Mapping[str, Any],
) -> TicketingWhatsAppSettings | None:
    """Resolve all routed events to exactly one organisation configuration."""
    resolved_ids: set[int] = set()
    resolved: TicketingWhatsAppSettings | None = None

    for business_account_id, change in _iter_changes(payload):
        value = change.get("value") or {}
        if not isinstance(value, Mapping):
            continue
        metadata = value.get("metadata") or {}
        phone_number_id = (
            str(metadata.get("phone_number_id") or "").strip()
            if isinstance(metadata, Mapping)
            else ""
        )
        if not business_account_id and not phone_number_id:
            continue

        queryset = TicketingWhatsAppSettings.objects.select_related("organisation")
        if business_account_id:
            queryset = queryset.filter(business_account_id=business_account_id)
        if phone_number_id:
            queryset = queryset.filter(phone_number_id=phone_number_id)

        matches = list(queryset[:2])
        if len(matches) != 1:
            return None
        resolved = matches[0]
        resolved_ids.add(resolved.pk)
        if len(resolved_ids) > 1:
            return None

    return resolved


def _valid_meta_signature(
    settings_obj: TicketingWhatsAppSettings,
    raw_body: bytes,
    signature_header: str,
) -> bool:
    """Validate Meta's SHA-256 request signature without timing leakage."""
    app_secret = str(settings_obj.meta_app_secret or "").strip()
    supplied = str(signature_header or "").strip()
    if not app_secret or not supplied:
        return False
    digest = hmac.new(app_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(f"sha256={digest}", supplied)


def _parse_timestamp(value: Any) -> datetime:
    try:
        return datetime.fromtimestamp(int(value), tz=datetime_timezone.utc)
    except (TypeError, ValueError, OverflowError, OSError):
        return timezone.now()


def _normalise_customer_id(value: Any) -> str:
    digits = "".join(character for character in str(value or "") if character.isdigit())
    return digits if 8 <= len(digits) <= 20 else ""


def _contact_names(value: Mapping[str, Any]) -> dict[str, str]:
    names: dict[str, str] = {}
    for contact in value.get("contacts") or []:
        if not isinstance(contact, Mapping):
            continue
        customer_id = _normalise_customer_id(contact.get("wa_id"))
        profile = contact.get("profile") or {}
        name = str(profile.get("name") or "").strip()[:255] if isinstance(profile, Mapping) else ""
        if customer_id and name:
            names[customer_id] = name
    return names


def _extract_text(message: Mapping[str, Any]) -> tuple[str, str, bool]:
    message_type = str(message.get("type") or "unknown").strip().lower()[:50]
    text = ""
    if message_type == "text" and isinstance(message.get("text"), Mapping):
        text = str(message["text"].get("body") or "")
    elif message_type == "button" and isinstance(message.get("button"), Mapping):
        text = str(message["button"].get("text") or "")
    elif message_type == "interactive" and isinstance(message.get("interactive"), Mapping):
        interactive = message["interactive"]
        reply_type = str(interactive.get("type") or "")
        reply = interactive.get(reply_type) or {}
        if isinstance(reply, Mapping):
            text = str(reply.get("title") or reply.get("id") or "")
    text = text.strip()
    return message_type, text, bool(text and message_type in SUPPORTED_MESSAGE_TYPES)


def _get_or_create_conversation(
    *, organisation: Any, customer_id: str
) -> CustomerAIConversation:
    conversation = (
        CustomerAIConversation.objects.select_for_update()
        .filter(
            organisation=organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id=customer_id,
            status__in=CustomerAIConversation.OPEN_STATUSES,
        )
        .order_by("-updated_at", "-pk")
        .first()
    )
    if conversation is not None:
        return conversation

    try:
        with transaction.atomic():
            return CustomerAIConversation.objects.create(
                organisation=organisation,
                channel=CustomerAIConversation.CHANNEL_WHATSAPP,
                external_customer_id=customer_id,
            )
    except IntegrityError:
        return CustomerAIConversation.objects.select_for_update().get(
            organisation=organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id=customer_id,
            status__in=CustomerAIConversation.OPEN_STATUSES,
        )


def _store_inbound_message(
    *,
    settings_obj: TicketingWhatsAppSettings,
    message: Mapping[str, Any],
    customer_name: str,
) -> tuple[bool, bool]:
    customer_id = _normalise_customer_id(message.get("from"))
    external_message_id = str(message.get("id") or "").strip()[:512]
    if not customer_id or not external_message_id:
        return False, False

    message_type, text, ai_eligible = _extract_text(message)
    occurred_at = _parse_timestamp(message.get("timestamp"))

    with transaction.atomic():
        conversation = _get_or_create_conversation(
            organisation=settings_obj.organisation,
            customer_id=customer_id,
        )
        inbound, created = CustomerAIMessage.objects.get_or_create(
            conversation=conversation,
            external_message_id=external_message_id,
            defaults={
                "direction": CustomerAIMessage.DIRECTION_INBOUND,
                "role": CustomerAIMessage.ROLE_CUSTOMER,
                "message_type": message_type,
                "text": text,
                "occurred_at": occurred_at,
                "metadata": {
                    "ai_eligible": ai_eligible,
                    "source": "meta_whatsapp",
                },
            },
        )
        if not created:
            return False, False

        update_fields = ["last_inbound_at", "updated_at"]
        conversation.last_inbound_at = occurred_at
        if customer_name and not conversation.customer_name:
            conversation.customer_name = customer_name
            update_fields.append("customer_name")
        conversation.save(update_fields=update_fields)

        should_queue = bool(ai_eligible and settings_obj.is_active and conversation.ai_may_reply)
        if should_queue:
            transaction.on_commit(
                lambda message_id=inbound.pk: process_customer_ai_message_task.delay(
                    message_id
                )
            )
    return True, should_queue


def _update_delivery_status(
    *, settings_obj: TicketingWhatsAppSettings, status_event: Mapping[str, Any]
) -> bool:
    external_message_id = str(status_event.get("id") or "").strip()[:512]
    delivery_status = str(status_event.get("status") or "").strip().lower()[:40]
    if not external_message_id or not delivery_status:
        return False

    message = (
        CustomerAIMessage.objects.filter(
            conversation__organisation=settings_obj.organisation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            external_message_id=external_message_id,
        )
        .order_by("-pk")
        .first()
    )
    if message is None:
        return False

    error_codes = []
    for error in status_event.get("errors") or []:
        if isinstance(error, Mapping) and error.get("code") is not None:
            error_codes.append(str(error["code"])[:40])
    metadata = dict(message.metadata or {})
    metadata["whatsapp_delivery"] = {
        "status": delivery_status,
        "occurred_at": _parse_timestamp(status_event.get("timestamp")).isoformat(),
        "error_codes": error_codes[:10],
    }
    message.metadata = metadata
    message.save(update_fields=("metadata",))
    return True


def _process_payload(
    *, payload: Mapping[str, Any], settings_obj: TicketingWhatsAppSettings
) -> dict[str, int]:
    counts = {"stored": 0, "queued": 0, "duplicates_or_invalid": 0, "statuses": 0}
    for _business_account_id, change in _iter_changes(payload):
        if str(change.get("field") or "") != "messages":
            continue
        value = change.get("value") or {}
        if not isinstance(value, Mapping):
            continue
        names = _contact_names(value)
        for message in value.get("messages") or []:
            if not isinstance(message, Mapping):
                counts["duplicates_or_invalid"] += 1
                continue
            customer_id = _normalise_customer_id(message.get("from"))
            stored, queued = _store_inbound_message(
                settings_obj=settings_obj,
                message=message,
                customer_name=names.get(customer_id, ""),
            )
            counts["stored"] += int(stored)
            counts["queued"] += int(queued)
            counts["duplicates_or_invalid"] += int(not stored)
        for status_event in value.get("statuses") or []:
            if isinstance(status_event, Mapping) and _update_delivery_status(
                settings_obj=settings_obj, status_event=status_event
            ):
                counts["statuses"] += 1
    return counts


@csrf_exempt
@require_http_methods(["GET", "POST"])
def whatsapp_webhook(request):
    """Verify the Meta callback or accept a signed webhook notification."""
    if request.method == "GET":
        mode = request.GET.get("hub.mode", "")
        verify_token = request.GET.get("hub.verify_token", "")
        challenge = request.GET.get("hub.challenge", "")
        if mode != "subscribe":
            return HttpResponse("Invalid webhook mode.", status=400)
        settings_obj = TicketingWhatsAppSettings.objects.filter(
            webhook_verify_token=verify_token
        ).first()
        if settings_obj is None or not verify_token:
            logger.warning("WhatsApp webhook verification rejected.")
            return HttpResponse("Invalid verify token.", status=403)
        settings_obj.webhook_subscribed = True
        settings_obj.webhook_subscribed_at = timezone.now()
        settings_obj.last_error_message = ""
        settings_obj.save(
            update_fields=(
                "webhook_subscribed",
                "webhook_subscribed_at",
                "last_error_message",
                "updated_at",
            )
        )
        return HttpResponse(challenge, content_type="text/plain", status=200)

    max_bytes = int(
        getattr(settings, "WHATSAPP_WEBHOOK_MAX_BYTES", DEFAULT_MAX_WEBHOOK_BYTES)
    )
    content_length = request.META.get("CONTENT_LENGTH")
    try:
        if content_length and int(content_length) > max_bytes:
            return JsonResponse({"success": False, "message": "Payload too large."}, status=413)
    except (TypeError, ValueError):
        pass
    raw_body = request.body
    if len(raw_body) > max_bytes:
        return JsonResponse({"success": False, "message": "Payload too large."}, status=413)
    try:
        payload = json.loads(raw_body.decode("utf-8") or "{}")
    except (UnicodeDecodeError, json.JSONDecodeError):
        return JsonResponse({"success": False, "message": "Invalid JSON payload."}, status=400)
    if not isinstance(payload, Mapping):
        return JsonResponse({"success": False, "message": "Invalid payload."}, status=400)

    settings_obj = _find_settings_from_payload(payload)
    if settings_obj is None:
        logger.warning("WhatsApp webhook routing failed.")
        return JsonResponse({"success": False, "message": "Unknown WhatsApp destination."}, status=404)
    if not _valid_meta_signature(
        settings_obj,
        raw_body,
        request.headers.get("X-Hub-Signature-256", ""),
    ):
        logger.warning(
            "Invalid WhatsApp webhook signature for organisation_id=%s.",
            settings_obj.organisation_id,
        )
        return JsonResponse({"success": False, "message": "Invalid webhook signature."}, status=403)

    if not settings_obj.webhook_subscribed:
        settings_obj.webhook_subscribed = True
        settings_obj.webhook_subscribed_at = timezone.now()
        settings_obj.save(
            update_fields=("webhook_subscribed", "webhook_subscribed_at", "updated_at")
        )

    counts = _process_payload(payload=payload, settings_obj=settings_obj)
    logger.info(
        "WhatsApp webhook accepted for organisation_id=%s; stored=%s queued=%s statuses=%s.",
        settings_obj.organisation_id,
        counts["stored"],
        counts["queued"],
        counts["statuses"],
    )
    return JsonResponse({"success": True, "received": True, **counts}, status=200)
