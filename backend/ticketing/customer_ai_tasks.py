"""Celery tasks for asynchronous customer AI message processing.

The webhook stores an inbound ``CustomerAIMessage`` and queues only its primary
key. This task never receives Meta credentials, API keys, or a raw webhook
payload. Generation and delivery are independently checkpointed so retries do
not ask the model twice or intentionally send a second reply.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Mapping, Protocol

from celery import shared_task
from django.conf import settings
from django.db import transaction
from django.utils import timezone
from django.utils.module_loading import import_string

from ticketing.ai.customer.agent import (
    CustomerAgentTurnContext,
    CustomerAgentTurnResult,
    CustomerSalesAgent,
)
from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage


logger = logging.getLogger(__name__)

AI_STATE_KEY = "customer_ai_state"
STATE_PENDING = "pending"
STATE_PROCESSING = "processing"
STATE_GENERATED = "generated"
STATE_SENT = "sent"
STATE_SHADOW = "shadow"
STATE_SKIPPED = "skipped"
STATE_FAILED = "failed"

PROCESSING_LEASE = timedelta(minutes=10)
MAX_RETRIES = 5
RETRY_BACKOFF_SECONDS = 15


class CustomerAITaskError(RuntimeError):
    """Base error for customer AI background processing."""


class CustomerAITaskConfigurationError(CustomerAITaskError):
    """Raised when the runtime factory is missing or invalid."""


class CustomerMessageSender(Protocol):
    """Idempotent channel delivery adapter, normally existing WhatsApp service."""

    def send_text(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        text: str,
        idempotency_key: str,
    ) -> str:
        """Send once and return the provider message ID.

        The adapter must deduplicate ``idempotency_key`` across retries.
        """


@dataclass(frozen=True)
class CustomerAITaskRuntime:
    agent: CustomerSalesAgent
    sender: CustomerMessageSender | None
    enabled: bool
    shadow_mode: bool
    model: str = ""
    max_reply_characters: int = 600


class CustomerAITaskRuntimeFactory(Protocol):
    def build(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        inbound_message: CustomerAIMessage,
    ) -> CustomerAITaskRuntime:
        """Build organisation-scoped AI, tools, prompt, and sender dependencies."""


def get_customer_ai_runtime_factory() -> CustomerAITaskRuntimeFactory:
    """Load the project-specific composition root from Django settings."""
    path = str(getattr(settings, "CUSTOMER_AI_RUNTIME_FACTORY", "") or "").strip()
    if not path:
        raise CustomerAITaskConfigurationError(
            "CUSTOMER_AI_RUNTIME_FACTORY is not configured."
        )
    factory_or_class = import_string(path)
    factory = factory_or_class() if isinstance(factory_or_class, type) else factory_or_class
    if factory is None or not callable(getattr(factory, "build", None)):
        raise CustomerAITaskConfigurationError(
            "CUSTOMER_AI_RUNTIME_FACTORY must provide build()."
        )
    return factory


@shared_task(
    bind=True,
    max_retries=MAX_RETRIES,
    acks_late=True,
    reject_on_worker_lost=True,
    name="ticketing.process_customer_ai_message",
)
def process_customer_ai_message_task(self, inbound_message_id: int) -> Mapping[str, Any]:
    """Generate and deliver one reply using durable, retry-safe checkpoints."""
    try:
        claim = _claim_message(inbound_message_id=int(inbound_message_id))
        if claim["action"] in {"missing", "busy", "finished", "skipped"}:
            return claim

        message = _load_inbound_message(inbound_message_id=int(inbound_message_id))
        conversation = message.conversation
        organisation = conversation.organisation
        runtime = get_customer_ai_runtime_factory().build(
            organisation=organisation,
            conversation=conversation,
            inbound_message=message,
        )
        _validate_runtime(runtime)

        if not runtime.enabled:
            _mark_skipped(message.pk, reason="disabled")
            return {"action": "skipped", "reason": "disabled"}

        # A generated reply may already exist when a previous delivery attempt
        # failed. In particular, a handoff acknowledgement is generated after
        # the agent changes the conversation to HANDOFF_REQUESTED. Allow that
        # one checkpointed reply to resume; new inbound messages are still
        # rejected by _claim_message while the handoff remains open.
        outbound = _existing_generated_reply(message)
        if outbound is None and not conversation.ai_may_reply:
            _mark_skipped(message.pk, reason="human_owned")
            return {"action": "skipped", "reason": "human_owned"}

        if outbound is None:
            result = runtime.agent.run_turn(
                CustomerAgentTurnContext(
                    organisation=organisation,
                    conversation=conversation,
                    customer_message=message.text,
                    language=conversation.language,
                    model=runtime.model,
                    previous_response_id=conversation.last_response_id,
                    max_reply_characters=runtime.max_reply_characters,
                    metadata={
                        "channel": conversation.channel,
                        "external_message_id": message.external_message_id,
                        "idempotency_key": message.external_message_id,
                        "inbound_message_id": message.pk,
                    },
                )
            )
            outbound = _store_generated_reply(
                inbound_message_id=message.pk,
                result=result,
                shadow_mode=runtime.shadow_mode,
            )

        if runtime.shadow_mode:
            _mark_shadow(message.pk, outbound.pk)
            return {"action": "shadow", "outbound_message_id": outbound.pk}
        if runtime.sender is None:
            raise CustomerAITaskConfigurationError(
                "A channel sender is required when shadow mode is disabled."
            )

        # Recheck ownership immediately before external delivery. The sender's
        # idempotency contract closes the send/ack retry window.
        conversation.refresh_from_db(fields=("status",))
        if not _may_deliver_checkpointed_reply(conversation):
            _mark_skipped(message.pk, reason="human_owned_before_send")
            return {"action": "skipped", "reason": "human_owned_before_send"}

        provider_message_id = runtime.sender.send_text(
            organisation=organisation,
            conversation=conversation,
            text=outbound.text,
            idempotency_key=f"customer-ai-reply:{message.pk}",
        )
        _mark_sent(
            inbound_message_id=message.pk,
            outbound_message_id=outbound.pk,
            provider_message_id=provider_message_id,
        )
        return {"action": "sent", "outbound_message_id": outbound.pk}
    except CustomerAIMessage.DoesNotExist:
        return {"action": "missing"}
    except Exception as exc:
        logger.exception(
            "Customer AI task failed for inbound_message_id=%s.",
            inbound_message_id,
        )
        _mark_retryable_failure(int(inbound_message_id), exc)
        countdown = min(
            RETRY_BACKOFF_SECONDS * (2 ** int(getattr(self.request, "retries", 0))),
            300,
        )
        raise self.retry(exc=exc, countdown=countdown)


@transaction.atomic
def _claim_message(*, inbound_message_id: int) -> dict[str, Any]:
    try:
        message = (
            CustomerAIMessage.objects.select_for_update()
            .select_related("conversation")
            .get(
                pk=inbound_message_id,
                direction=CustomerAIMessage.DIRECTION_INBOUND,
                role=CustomerAIMessage.ROLE_CUSTOMER,
            )
        )
    except CustomerAIMessage.DoesNotExist:
        return {"action": "missing"}

    metadata = dict(message.metadata or {})
    state = dict(metadata.get(AI_STATE_KEY) or {})
    status = str(state.get("status") or STATE_PENDING)
    if status in {STATE_SENT, STATE_SHADOW, STATE_SKIPPED}:
        return {"action": "finished", "status": status}
    if status == STATE_GENERATED:
        return {"action": "claimed", "resuming": "delivery"}
    if status == STATE_PROCESSING and not _lease_expired(state.get("claimed_at")):
        return {"action": "busy"}
    if not message.conversation.ai_may_reply:
        state.update({"status": STATE_SKIPPED, "reason": "human_owned"})
        metadata[AI_STATE_KEY] = state
        message.metadata = metadata
        message.save(update_fields=("metadata",))
        return {"action": "skipped", "reason": "human_owned"}

    state.update(
        {
            "status": STATE_PROCESSING,
            "claimed_at": timezone.now().isoformat(),
            "attempts": int(state.get("attempts") or 0) + 1,
        }
    )
    metadata[AI_STATE_KEY] = state
    message.metadata = metadata
    message.save(update_fields=("metadata",))
    return {"action": "claimed"}


def _load_inbound_message(*, inbound_message_id: int) -> CustomerAIMessage:
    return (
        CustomerAIMessage.objects.select_related("conversation__organisation")
        .get(
            pk=inbound_message_id,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
        )
    )


def _existing_generated_reply(inbound: CustomerAIMessage) -> CustomerAIMessage | None:
    state = dict((inbound.metadata or {}).get(AI_STATE_KEY) or {})
    outbound_id = state.get("outbound_message_id")
    if not outbound_id:
        return None
    try:
        return CustomerAIMessage.objects.get(
            pk=outbound_id,
            conversation=inbound.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
        )
    except CustomerAIMessage.DoesNotExist:
        return None


def _may_deliver_checkpointed_reply(conversation: CustomerAIConversation) -> bool:
    """Allow an active reply or the single acknowledgement that opened a handoff."""
    return conversation.status in {
        CustomerAIConversation.STATUS_ACTIVE,
        CustomerAIConversation.STATUS_HANDOFF_REQUESTED,
    }


@transaction.atomic
def _store_generated_reply(
    *,
    inbound_message_id: int,
    result: CustomerAgentTurnResult,
    shadow_mode: bool,
) -> CustomerAIMessage:
    inbound = CustomerAIMessage.objects.select_for_update().select_related(
        "conversation"
    ).get(pk=inbound_message_id)
    existing = _existing_generated_reply(inbound)
    if existing is not None:
        return existing
    if not _may_deliver_checkpointed_reply(inbound.conversation):
        raise CustomerAITaskError("Human ownership began during AI generation.")

    outbound = CustomerAIMessage.objects.create(
        conversation=inbound.conversation,
        direction=CustomerAIMessage.DIRECTION_OUTBOUND,
        role=CustomerAIMessage.ROLE_ASSISTANT,
        external_message_id="",
        message_type="text",
        text=result.reply_text,
        metadata={
            "channel": inbound.conversation.channel,
            "reply_to_message_id": inbound.external_message_id,
            "provider": "organisation_ai",
            "shadow_mode": bool(shadow_mode),
            "tool_count": len(result.executed_tools),
        },
        occurred_at=timezone.now(),
    )
    metadata = dict(inbound.metadata or {})
    state = dict(metadata.get(AI_STATE_KEY) or {})
    state.update(
        {
            "status": STATE_GENERATED,
            "outbound_message_id": outbound.pk,
            "generated_at": timezone.now().isoformat(),
        }
    )
    metadata[AI_STATE_KEY] = state
    inbound.metadata = metadata
    inbound.save(update_fields=("metadata",))

    conversation = inbound.conversation
    conversation.last_response_id = str(result.response_id or "")[:255]
    conversation.save(update_fields=("last_response_id", "updated_at"))
    return outbound


@transaction.atomic
def _mark_sent(
    *,
    inbound_message_id: int,
    outbound_message_id: int,
    provider_message_id: str,
) -> None:
    inbound = CustomerAIMessage.objects.select_for_update().get(pk=inbound_message_id)
    outbound = CustomerAIMessage.objects.select_for_update().get(
        pk=outbound_message_id,
        conversation=inbound.conversation,
    )
    outbound.external_message_id = str(provider_message_id or "")[:512]
    metadata = dict(outbound.metadata or {})
    metadata["delivery_status"] = "sent"
    outbound.metadata = metadata
    outbound.save(update_fields=("external_message_id", "metadata"))

    inbound_metadata = dict(inbound.metadata or {})
    state = dict(inbound_metadata.get(AI_STATE_KEY) or {})
    state.update({"status": STATE_SENT, "sent_at": timezone.now().isoformat()})
    inbound_metadata[AI_STATE_KEY] = state
    inbound.metadata = inbound_metadata
    inbound.save(update_fields=("metadata",))
    CustomerAIConversation.objects.filter(pk=inbound.conversation_id).update(
        last_outbound_at=timezone.now()
    )


def _mark_shadow(inbound_message_id: int, outbound_message_id: int) -> None:
    _update_state(
        inbound_message_id,
        status=STATE_SHADOW,
        outbound_message_id=outbound_message_id,
        shadowed_at=timezone.now().isoformat(),
    )


def _mark_skipped(inbound_message_id: int, *, reason: str) -> None:
    _update_state(inbound_message_id, status=STATE_SKIPPED, reason=str(reason)[:100])


def _mark_retryable_failure(inbound_message_id: int, exc: Exception) -> None:
    try:
        _update_state(
            inbound_message_id,
            status=STATE_FAILED,
            error_type=exc.__class__.__name__[:100],
            failed_at=timezone.now().isoformat(),
        )
    except Exception:
        logger.exception(
            "Could not checkpoint customer AI failure for inbound_message_id=%s.",
            inbound_message_id,
        )


@transaction.atomic
def _update_state(inbound_message_id: int, **values: Any) -> None:
    message = CustomerAIMessage.objects.select_for_update().get(pk=inbound_message_id)
    metadata = dict(message.metadata or {})
    state = dict(metadata.get(AI_STATE_KEY) or {})
    state.update(values)
    metadata[AI_STATE_KEY] = state
    message.metadata = metadata
    message.save(update_fields=("metadata",))


def _lease_expired(value: Any) -> bool:
    if not value:
        return True
    try:
        claimed_at = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return True
    if timezone.is_naive(claimed_at):
        claimed_at = timezone.make_aware(claimed_at, timezone.get_current_timezone())
    return claimed_at + PROCESSING_LEASE <= timezone.now()


def _validate_runtime(runtime: Any) -> None:
    if not isinstance(runtime, CustomerAITaskRuntime):
        raise CustomerAITaskConfigurationError(
            "The customer AI runtime factory returned an invalid runtime."
        )
    if runtime.agent is None:
        raise CustomerAITaskConfigurationError("The customer AI agent is missing.")
    if not 80 <= int(runtime.max_reply_characters) <= 1_200:
        raise CustomerAITaskConfigurationError(
            "max_reply_characters must be between 80 and 1200."
        )


__all__ = [
    "CustomerAITaskConfigurationError",
    "CustomerAITaskError",
    "CustomerAITaskRuntime",
    "CustomerAITaskRuntimeFactory",
    "CustomerMessageSender",
    "get_customer_ai_runtime_factory",
    "process_customer_ai_message_task",
]
