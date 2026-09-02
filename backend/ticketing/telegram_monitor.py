"""Optional read-only Telegram mirror for customer WhatsApp conversations.

This module is deliberately independent of webhook ingestion, AI generation,
and Meta delivery. It reads an already-persisted ``CustomerAIMessage`` and
posts a formatted copy to one configured private Telegram chat.
"""

from __future__ import annotations

import html
import logging
from dataclasses import dataclass
from typing import Any

import requests
from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ticketing.customer_ai_models import CustomerAIMessage


logger = logging.getLogger(__name__)

MAX_TELEGRAM_MESSAGE_LENGTH = 4_096
MAX_MONITORED_TEXT_LENGTH = 3_400
MAX_RETRIES = 4
RETRY_BACKOFF_SECONDS = 15


class TelegramMonitorError(RuntimeError):
    """Base error for safe, retryable Telegram monitor failures."""


class TelegramMonitorConfigurationError(TelegramMonitorError):
    """Raised when an enabled monitor is missing required configuration."""


class TelegramMonitorDeliveryError(TelegramMonitorError):
    """Raised when Telegram rejects or cannot receive a notification."""


@dataclass(frozen=True)
class TelegramMonitorConfig:
    enabled: bool
    organisation_slug: str
    bot_token: str
    chat_id: str
    timeout_seconds: int

    @classmethod
    def from_settings(cls) -> "TelegramMonitorConfig":
        return cls(
            enabled=bool(getattr(settings, "TELEGRAM_MONITOR_ENABLED", False)),
            organisation_slug=str(
                getattr(settings, "TELEGRAM_MONITOR_ORGANISATION_SLUG", "") or ""
            ).strip(),
            bot_token=str(
                getattr(settings, "TELEGRAM_MONITOR_BOT_TOKEN", "") or ""
            ).strip(),
            chat_id=str(
                getattr(settings, "TELEGRAM_MONITOR_CHAT_ID", "") or ""
            ).strip(),
            timeout_seconds=max(
                1,
                min(
                    int(getattr(settings, "TELEGRAM_MONITOR_TIMEOUT_SECONDS", 10)),
                    30,
                ),
            ),
        )

    @property
    def is_complete(self) -> bool:
        return bool(
            self.enabled
            and self.organisation_slug
            and self.bot_token
            and self.chat_id
        )


def queue_telegram_monitor_message(message_id: int) -> bool:
    """Queue a persisted message only for the explicitly configured tenant."""
    config = TelegramMonitorConfig.from_settings()
    if not config.enabled:
        return False
    if not config.is_complete:
        logger.warning("Telegram monitor is enabled but incompletely configured.")
        return False

    matches_tenant = CustomerAIMessage.objects.filter(
        pk=int(message_id),
        conversation__organisation__slug=config.organisation_slug,
        conversation__channel="whatsapp",
    ).exists()
    if not matches_tenant:
        return False

    send_telegram_monitor_message_task.delay(int(message_id))
    return True


@shared_task(
    bind=True,
    max_retries=MAX_RETRIES,
    acks_late=True,
    reject_on_worker_lost=True,
    name="ticketing.send_telegram_monitor_message",
)
def send_telegram_monitor_message_task(self, message_id: int) -> dict[str, Any]:
    """Deliver one notification; failures retry only this observer task."""
    try:
        return send_telegram_monitor_message(int(message_id))
    except CustomerAIMessage.DoesNotExist:
        return {"action": "missing"}
    except TelegramMonitorError as exc:
        # Never log the exception text: request exceptions can contain the bot
        # token because Telegram authenticates through the request URL.
        logger.warning(
            "Telegram monitor delivery failed for message_id=%s (%s).",
            message_id,
            exc.__class__.__name__,
        )
        countdown = min(
            RETRY_BACKOFF_SECONDS * (2 ** int(getattr(self.request, "retries", 0))),
            300,
        )
        raise self.retry(
            exc=TelegramMonitorDeliveryError("Telegram delivery failed."),
            countdown=countdown,
        ) from None


def send_telegram_monitor_message(message_id: int) -> dict[str, Any]:
    """Synchronously post one safe, formatted copy to Telegram."""
    config = TelegramMonitorConfig.from_settings()
    if not config.is_complete:
        return {"action": "skipped", "reason": "disabled_or_incomplete"}

    message = (
        CustomerAIMessage.objects.select_related("conversation__organisation")
        .get(
            pk=int(message_id),
            conversation__organisation__slug=config.organisation_slug,
            conversation__channel="whatsapp",
        )
    )
    monitor_state = dict((message.metadata or {}).get("telegram_monitor") or {})
    if monitor_state.get("status") == "sent":
        return {"action": "already_sent", "message_id": message.pk}
    payload = {
        "chat_id": config.chat_id,
        "text": format_telegram_monitor_message(message),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    url = f"https://api.telegram.org/bot{config.bot_token}/sendMessage"
    try:
        response = requests.post(url, json=payload, timeout=config.timeout_seconds)
    except requests.RequestException:
        # Suppress the provider exception chain because it can contain the
        # token-bearing URL.
        raise TelegramMonitorDeliveryError("Telegram request failed.") from None
    if not 200 <= response.status_code < 300:
        raise TelegramMonitorDeliveryError("Telegram rejected the notification.")
    try:
        body = response.json()
    except ValueError:
        raise TelegramMonitorDeliveryError("Telegram returned an invalid response.") from None
    if not isinstance(body, dict) or body.get("ok") is not True:
        raise TelegramMonitorDeliveryError("Telegram did not confirm delivery.")
    result = body.get("result") if isinstance(body.get("result"), dict) else {}
    _mark_telegram_delivered(
        message_id=message.pk,
        telegram_message_id=str(result.get("message_id") or "")[:100],
    )
    return {"action": "sent", "message_id": message.pk}


@transaction.atomic
def _mark_telegram_delivered(*, message_id: int, telegram_message_id: str) -> None:
    message = CustomerAIMessage.objects.select_for_update().get(pk=message_id)
    metadata = dict(message.metadata or {})
    metadata["telegram_monitor"] = {
        "status": "sent",
        "sent_at": timezone.now().isoformat(),
        "telegram_message_id": telegram_message_id,
    }
    message.metadata = metadata
    message.save(update_fields=("metadata",))


def format_telegram_monitor_message(message: CustomerAIMessage) -> str:
    """Build a compact HTML notification without trusting customer content."""
    conversation = message.conversation
    customer_name = str(conversation.customer_name or "Customer").strip()[:255]
    customer_id = str(conversation.external_customer_id or "Unknown").strip()[:255]
    is_inbound = (
        message.direction == CustomerAIMessage.DIRECTION_INBOUND
        and message.role == CustomerAIMessage.ROLE_CUSTOMER
    )
    heading = "👤 Customer message" if is_inbound else "🤖 AI response"
    raw_text = str(message.text or "").strip()
    if not raw_text:
        raw_text = f"[{message.message_type or 'message'}]"
    if len(raw_text) > MAX_MONITORED_TEXT_LENGTH:
        raw_text = f"{raw_text[:MAX_MONITORED_TEXT_LENGTH]}\n…"

    rendered = (
        f"<b>{heading}</b>\n"
        f"<b>{html.escape(customer_name)}</b> "
        f"(<code>+{html.escape(customer_id.lstrip('+'))}</code>)\n\n"
        f"{html.escape(raw_text)}"
    )
    return rendered[:MAX_TELEGRAM_MESSAGE_LENGTH]


__all__ = [
    "TelegramMonitorConfigurationError",
    "TelegramMonitorDeliveryError",
    "TelegramMonitorError",
    "format_telegram_monitor_message",
    "queue_telegram_monitor_message",
    "send_telegram_monitor_message",
    "send_telegram_monitor_message_task",
]
