"""Tenant-bound WhatsApp sender for generated customer-agent replies.

The adapter reuses the existing Meta Cloud API service and persists Meta's
message ID before returning to the Celery task. It validates organisation,
conversation, recipient, outbound record, and idempotency key on every call.
It sends free-form text only as a reply to an inbound WhatsApp conversation.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

from django.core.cache import cache
from django.db import transaction

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
)
from ticketing.models import TicketingWhatsAppSettings
from ticketing.notifications.whatsapp_service import (
    BookingWhatsAppService,
    WhatsAppAPIError,
    WhatsAppConfigurationError,
)


MAX_WHATSAPP_TEXT_LENGTH = 4_096
SEND_LOCK_SECONDS = 120
IDEMPOTENCY_PATTERN = re.compile(r"^customer-ai-reply:(\d+)$")
URL_PATTERN = re.compile(r"https?://[^\s]+", re.IGNORECASE)


class CustomerWhatsAppSenderError(RuntimeError):
    """Base error for tenant-bound customer WhatsApp delivery."""


class CustomerWhatsAppSenderConfigurationError(CustomerWhatsAppSenderError):
    """Raised when tenant or channel configuration is inconsistent."""


class CustomerWhatsAppSenderBusyError(CustomerWhatsAppSenderError):
    """Raised when another worker currently owns the same send attempt."""


class TenantWhatsAppCustomerSender:
    """Send one generated reply through one organisation's WhatsApp number."""

    def __init__(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        whatsapp_settings: TicketingWhatsAppSettings,
        service: BookingWhatsAppService | None = None,
    ) -> None:
        self._validate_bound_context(
            organisation=organisation,
            conversation=conversation,
            whatsapp_settings=whatsapp_settings,
        )
        self.organisation_id = organisation.pk
        self.conversation_id = conversation.pk
        self.whatsapp_settings_id = whatsapp_settings.pk
        self.service = service or BookingWhatsAppService(whatsapp_settings)

    def send_text(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        text: str,
        idempotency_key: str,
    ) -> str:
        self._validate_call_context(
            organisation=organisation,
            conversation=conversation,
        )
        message_text = str(text or "").strip()
        if not message_text:
            raise CustomerWhatsAppSenderError(
                "A WhatsApp reply cannot be empty."
            )
        if len(message_text) > MAX_WHATSAPP_TEXT_LENGTH:
            raise CustomerWhatsAppSenderError(
                "The WhatsApp reply exceeds the permitted text length."
            )

        inbound_id = self._inbound_id(idempotency_key)
        inbound, outbound = self._resolve_messages(
            inbound_id=inbound_id,
            conversation=conversation,
            expected_text=message_text,
        )
        existing_id = str(outbound.external_message_id or "").strip()
        if existing_id:
            return existing_id

        lock_key = self._lock_key(idempotency_key)
        if not cache.add(lock_key, "sending", timeout=SEND_LOCK_SECONDS):
            # Recheck once in case the first worker completed between queries.
            outbound.refresh_from_db(fields=("external_message_id",))
            existing_id = str(outbound.external_message_id or "").strip()
            if existing_id:
                return existing_id
            raise CustomerWhatsAppSenderBusyError(
                "This WhatsApp reply is already being sent."
            )

        try:
            self._refresh_and_validate_live_state(
                organisation=organisation,
                conversation=conversation,
                inbound=inbound,
            )
            recipient = self.service.normalize_phone_number(
                conversation.external_customer_id
            )
            if recipient != str(conversation.external_customer_id or "").strip():
                # Webhook ingestion must already store the normalized sender ID.
                raise CustomerWhatsAppSenderConfigurationError(
                    "The conversation WhatsApp recipient is not normalized."
                )
            result = self.service.send_text(
                recipient,
                message_text,
                preview_url=bool(URL_PATTERN.search(message_text)),
            )
            provider_message_id = str(result.message_id or "").strip()
            if not provider_message_id:
                raise CustomerWhatsAppSenderError(
                    "Meta returned no WhatsApp message ID."
                )
            self._persist_provider_message_id(
                outbound_id=outbound.pk,
                conversation_id=conversation.pk,
                provider_message_id=provider_message_id,
                idempotency_key=idempotency_key,
            )
            return provider_message_id
        except (CustomerWhatsAppSenderError, WhatsAppAPIError, WhatsAppConfigurationError):
            raise
        except Exception as exc:
            raise CustomerWhatsAppSenderError(
                "The customer WhatsApp reply could not be sent."
            ) from exc
        finally:
            cache.delete(lock_key)

    def _refresh_and_validate_live_state(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        inbound: CustomerAIMessage,
    ) -> None:
        conversation.refresh_from_db(fields=("status", "external_customer_id"))
        if not conversation.ai_may_reply:
            raise CustomerWhatsAppSenderConfigurationError(
                "AI no longer owns this customer conversation."
            )
        if inbound.conversation_id != conversation.pk:
            raise CustomerWhatsAppSenderConfigurationError(
                "The inbound message belongs to another conversation."
            )
        current_settings = TicketingWhatsAppSettings.objects.get(
            pk=self.whatsapp_settings_id,
            organisation=organisation,
        )
        if not current_settings.is_connected:
            raise CustomerWhatsAppSenderConfigurationError(
                "The organisation's WhatsApp integration is not connected."
            )
        # Use refreshed credentials/status rather than the factory-time object.
        self.service.settings = current_settings

    @staticmethod
    def _resolve_messages(
        *,
        inbound_id: int,
        conversation: CustomerAIConversation,
        expected_text: str,
    ) -> tuple[CustomerAIMessage, CustomerAIMessage]:
        try:
            inbound = CustomerAIMessage.objects.get(
                pk=inbound_id,
                conversation=conversation,
                direction=CustomerAIMessage.DIRECTION_INBOUND,
                role=CustomerAIMessage.ROLE_CUSTOMER,
            )
        except CustomerAIMessage.DoesNotExist as exc:
            raise CustomerWhatsAppSenderConfigurationError(
                "The idempotency key does not identify this conversation's inbound message."
            ) from exc

        if not str(inbound.external_message_id or "").strip():
            raise CustomerWhatsAppSenderConfigurationError(
                "The inbound WhatsApp message has no provider message ID."
            )

        queryset = CustomerAIMessage.objects.filter(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            metadata__reply_to_message_id=inbound.external_message_id,
        ).order_by("pk")
        try:
            outbound = queryset.get()
        except CustomerAIMessage.DoesNotExist as exc:
            raise CustomerWhatsAppSenderConfigurationError(
                "No generated outbound reply exists for this inbound message."
            ) from exc
        except CustomerAIMessage.MultipleObjectsReturned as exc:
            raise CustomerWhatsAppSenderConfigurationError(
                "Multiple generated replies exist for one inbound message."
            ) from exc
        if str(outbound.text or "").strip() != expected_text:
            raise CustomerWhatsAppSenderConfigurationError(
                "The requested WhatsApp text does not match the persisted reply."
            )
        return inbound, outbound

    @staticmethod
    @transaction.atomic
    def _persist_provider_message_id(
        *,
        outbound_id: int,
        conversation_id: int,
        provider_message_id: str,
        idempotency_key: str,
    ) -> None:
        outbound = CustomerAIMessage.objects.select_for_update().get(
            pk=outbound_id,
            conversation_id=conversation_id,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
        )
        existing = str(outbound.external_message_id or "").strip()
        if existing and existing != provider_message_id:
            raise CustomerWhatsAppSenderError(
                "The outbound reply already has another provider message ID."
            )
        metadata = dict(outbound.metadata or {})
        metadata.update(
            {
                "delivery_status": "accepted",
                "send_idempotency_key": idempotency_key,
            }
        )
        outbound.external_message_id = provider_message_id[:512]
        outbound.metadata = metadata
        outbound.save(update_fields=("external_message_id", "metadata"))

    @staticmethod
    def _inbound_id(value: str) -> int:
        match = IDEMPOTENCY_PATTERN.fullmatch(str(value or "").strip())
        if not match:
            raise CustomerWhatsAppSenderConfigurationError(
                "The customer WhatsApp idempotency key is invalid."
            )
        return int(match.group(1))

    def _lock_key(self, idempotency_key: str) -> str:
        digest = hashlib.sha256(
            f"{self.organisation_id}:{idempotency_key}".encode("utf-8")
        ).hexdigest()
        return f"customer-ai-whatsapp-send:{digest}"

    def _validate_call_context(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
    ) -> None:
        if getattr(organisation, "pk", None) != self.organisation_id:
            raise CustomerWhatsAppSenderConfigurationError(
                "The sender is bound to another organisation."
            )
        if (
            not isinstance(conversation, CustomerAIConversation)
            or conversation.pk != self.conversation_id
            or conversation.organisation_id != self.organisation_id
            or conversation.channel != CustomerAIConversation.CHANNEL_WHATSAPP
        ):
            raise CustomerWhatsAppSenderConfigurationError(
                "The sender is bound to another customer conversation."
            )

    @staticmethod
    def _validate_bound_context(
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        whatsapp_settings: TicketingWhatsAppSettings,
    ) -> None:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerWhatsAppSenderConfigurationError(
                "An organisation is required."
            )
        if (
            not isinstance(conversation, CustomerAIConversation)
            or conversation.organisation_id != organisation_id
            or conversation.channel != CustomerAIConversation.CHANNEL_WHATSAPP
        ):
            raise CustomerWhatsAppSenderConfigurationError(
                "A tenant-owned WhatsApp conversation is required."
            )
        if (
            not isinstance(whatsapp_settings, TicketingWhatsAppSettings)
            or whatsapp_settings.organisation_id != organisation_id
            or not whatsapp_settings.is_connected
        ):
            raise CustomerWhatsAppSenderConfigurationError(
                "Connected tenant-owned WhatsApp settings are required."
            )


class TenantWhatsAppCustomerSenderFactory:
    """Build one sender bound to the runtime's tenant and conversation."""

    def build_customer_sender(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        whatsapp_settings: TicketingWhatsAppSettings,
    ) -> TenantWhatsAppCustomerSender:
        return TenantWhatsAppCustomerSender(
            organisation=organisation,
            conversation=conversation,
            whatsapp_settings=whatsapp_settings,
        )


__all__ = [
    "CustomerWhatsAppSenderBusyError",
    "CustomerWhatsAppSenderConfigurationError",
    "CustomerWhatsAppSenderError",
    "TenantWhatsAppCustomerSender",
    "TenantWhatsAppCustomerSenderFactory",
]
