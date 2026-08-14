"""Production composition root for the independent customer sales agent.

This module intentionally contains no product, availability, pricing, booking,
payment, or Meta API implementation. It composes application-owned adapters
configured through trusted Django settings and binds them to one organisation
and one conversation. Seller-agent memory and booking-write services are never
loaded here.

Required settings when customer AI is enabled::

    CUSTOMER_AI_PROVIDER_ADAPTER_FACTORY = "project.path.ProviderAdapterFactory"
    CUSTOMER_AI_TOOLSET_FACTORY = "project.path.CustomerToolsetFactory"
    CUSTOMER_AI_MESSAGE_SENDER_FACTORY = "project.path.WhatsAppSenderFactory"
    CUSTOMER_AI_RUNTIME_FACTORY = "ticketing.ai.customer.factory.DjangoCustomerAIRuntimeFactory"

The provider adapter wraps the organisation's decrypted provider object with
the ``run_tool_turn`` contract. The toolset factory returns only application-
controlled handlers backed by existing ticketing business rules. The sender
must implement idempotent ``send_text`` delivery.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.utils.module_loading import import_string

from organisations.ai.constants import FEATURE_WHATSAPP
from organisations.ai.service import (
    OrganisationAIDisabledError,
    OrganisationAIService,
    OrganisationAIServiceError,
    OrganisationAISettingsNotConfiguredError,
)
from ticketing.ai.customer.agent import CustomerSalesAgent
from ticketing.ai.customer.prompts import DefaultCustomerAgentPromptBuilder
from ticketing.ai.customer.tool_executor import BoundCustomerToolExecutor
from ticketing.ai.customer.tool_registry import (
    CustomerToolEnabledPredicate,
    CustomerToolHandler,
    build_customer_tool_registry,
)
from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage
from ticketing.customer_ai_tasks import (
    CustomerAITaskConfigurationError,
    CustomerAITaskRuntime,
)
from ticketing.models import TicketingWhatsAppSettings


DEFAULT_MAX_REPLY_CHARACTERS = 600
DEFAULT_MAX_TOOL_CALLS = 6


@dataclass(frozen=True)
class CustomerAIToolset:
    """Explicit allowlisted handlers and optional exposure predicates."""

    handlers: Mapping[str, CustomerToolHandler]
    enabled_predicates: Mapping[str, CustomerToolEnabledPredicate] = field(
        default_factory=dict
    )
    allow_write_tools: bool = True


class CustomerAIProviderAdapterFactory(Protocol):
    def build_customer_provider(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        provider: Any,
        model: str,
    ) -> Any:
        """Return an object implementing ``run_tool_turn``."""


class CustomerAIToolsetFactory(Protocol):
    def build_customer_toolset(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
    ) -> CustomerAIToolset | Mapping[str, CustomerToolHandler]:
        """Return organisation-scoped handlers using existing domain services."""


class CustomerAIMessageSenderFactory(Protocol):
    def build_customer_sender(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        whatsapp_settings: TicketingWhatsAppSettings,
    ) -> Any:
        """Return an idempotent sender implementing ``send_text``."""


class _DisabledCustomerAgent:
    """Non-callable-in-practice sentinel for safely disabled runtimes."""

    @staticmethod
    def run_turn(_context):  # pragma: no cover - task exits before this call
        raise CustomerAITaskConfigurationError("Customer AI is disabled.")


class DjangoCustomerAIRuntimeFactory:
    """Build one tenant-bound runtime for one persisted inbound message."""

    def build(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        inbound_message: CustomerAIMessage,
    ) -> CustomerAITaskRuntime:
        self._validate_context(
            organisation=organisation,
            conversation=conversation,
            inbound_message=inbound_message,
        )

        ai_service = OrganisationAIService(organisation)
        try:
            ai_settings = ai_service.get_settings()
        except OrganisationAISettingsNotConfiguredError:
            return self._disabled_runtime()

        whatsapp_settings = self._whatsapp_settings(organisation)
        shadow_mode = self._shadow_mode(organisation)
        enabled = bool(
            getattr(organisation, "is_active", False)
            and ai_settings.is_enabled
            and whatsapp_settings is not None
            and whatsapp_settings.is_active
            and (shadow_mode or whatsapp_settings.is_connected)
        )
        if not enabled:
            return self._disabled_runtime(shadow_mode=shadow_mode)

        try:
            ai_context = ai_service.build_provider(
                feature=FEATURE_WHATSAPP,
                require_enabled=True,
            )
        except OrganisationAIDisabledError:
            return self._disabled_runtime(shadow_mode=shadow_mode)
        except OrganisationAIServiceError as exc:
            raise CustomerAITaskConfigurationError(
                "The organisation AI provider could not be configured."
            ) from exc

        model = str(ai_context.settings.default_model or "").strip()
        provider_factory = self._load_component(
            "CUSTOMER_AI_PROVIDER_ADAPTER_FACTORY",
            "build_customer_provider",
        )
        provider = provider_factory.build_customer_provider(
            organisation=organisation,
            conversation=conversation,
            provider=ai_context.provider,
            model=model,
        )
        if not callable(getattr(provider, "run_tool_turn", None)):
            raise CustomerAITaskConfigurationError(
                "The customer AI provider adapter must implement run_tool_turn()."
            )

        toolset_factory = self._load_component(
            "CUSTOMER_AI_TOOLSET_FACTORY",
            "build_customer_toolset",
        )
        raw_toolset = toolset_factory.build_customer_toolset(
            organisation=organisation,
            conversation=conversation,
        )
        toolset = self._normalise_toolset(raw_toolset)
        registry = build_customer_tool_registry(
            handlers=toolset.handlers,
            enabled_predicates=toolset.enabled_predicates,
            require_complete=True,
        )
        executor = BoundCustomerToolExecutor(
            registry=registry,
            organisation=organisation,
            conversation=conversation,
            metadata={
                "channel": conversation.channel,
                "external_message_id": inbound_message.external_message_id,
                "idempotency_key": inbound_message.external_message_id,
                "inbound_message_id": inbound_message.pk,
            },
            # The registry contains only two safe writes: an approved temporary
            # cart and a human handoff. It never exposes booking/payment writes.
            allow_write_tools=bool(toolset.allow_write_tools),
        )

        prompt_builder = DefaultCustomerAgentPromptBuilder()
        prompt_settings = prompt_builder.resolve_settings(organisation)
        max_reply_characters = self._reply_limit(
            prompt_settings.max_reply_characters
        )
        agent = CustomerSalesAgent(
            provider=provider,
            tool_executor=executor,
            prompt_builder=prompt_builder,
            max_tool_calls=self._tool_call_limit(organisation),
        )

        sender = None
        if not shadow_mode:
            sender_factory = self._load_component(
                "CUSTOMER_AI_MESSAGE_SENDER_FACTORY",
                "build_customer_sender",
            )
            sender = sender_factory.build_customer_sender(
                organisation=organisation,
                conversation=conversation,
                whatsapp_settings=whatsapp_settings,
            )
            if not callable(getattr(sender, "send_text", None)):
                raise CustomerAITaskConfigurationError(
                    "The customer message sender must implement send_text()."
                )

        return CustomerAITaskRuntime(
            agent=agent,
            sender=sender,
            enabled=True,
            shadow_mode=shadow_mode,
            model=model,
            max_reply_characters=max_reply_characters,
        )

    @staticmethod
    def _validate_context(
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        inbound_message: CustomerAIMessage,
    ) -> None:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerAITaskConfigurationError("An organisation is required.")
        if not isinstance(conversation, CustomerAIConversation):
            raise CustomerAITaskConfigurationError(
                "A customer AI conversation is required."
            )
        if conversation.organisation_id != organisation_id:
            raise CustomerAITaskConfigurationError(
                "The conversation belongs to another organisation."
            )
        if not isinstance(inbound_message, CustomerAIMessage):
            raise CustomerAITaskConfigurationError(
                "A customer AI inbound message is required."
            )
        if (
            inbound_message.conversation_id != conversation.pk
            or inbound_message.direction != CustomerAIMessage.DIRECTION_INBOUND
            or inbound_message.role != CustomerAIMessage.ROLE_CUSTOMER
        ):
            raise CustomerAITaskConfigurationError(
                "The inbound message does not belong to this customer conversation."
            )

    @staticmethod
    def _whatsapp_settings(
        organisation: Any,
    ) -> TicketingWhatsAppSettings | None:
        try:
            value = organisation.ticketing_whatsapp_settings
        except (AttributeError, ObjectDoesNotExist):
            return None
        if value.organisation_id != organisation.pk:
            raise CustomerAITaskConfigurationError(
                "The WhatsApp configuration belongs to another organisation."
            )
        return value

    @staticmethod
    def _load_component(setting_name: str, required_method: str):
        dotted_path = str(getattr(settings, setting_name, "") or "").strip()
        if not dotted_path:
            raise CustomerAITaskConfigurationError(
                f"{setting_name} is not configured."
            )
        try:
            value = import_string(dotted_path)
            component = value() if isinstance(value, type) else value
        except Exception as exc:
            raise CustomerAITaskConfigurationError(
                f"{setting_name} could not be loaded."
            ) from exc
        if not callable(getattr(component, required_method, None)):
            raise CustomerAITaskConfigurationError(
                f"{setting_name} must provide {required_method}()."
            )
        return component

    @staticmethod
    def _normalise_toolset(
        value: CustomerAIToolset | Mapping[str, CustomerToolHandler],
    ) -> CustomerAIToolset:
        if isinstance(value, CustomerAIToolset):
            result = value
        elif isinstance(value, Mapping):
            result = CustomerAIToolset(handlers=dict(value))
        else:
            raise CustomerAITaskConfigurationError(
                "CUSTOMER_AI_TOOLSET_FACTORY returned an invalid toolset."
            )
        if not isinstance(result.handlers, Mapping) or not result.handlers:
            raise CustomerAITaskConfigurationError(
                "The customer AI toolset has no handlers."
            )
        if not isinstance(result.enabled_predicates, Mapping):
            raise CustomerAITaskConfigurationError(
                "The customer AI enabled predicates are invalid."
            )
        return result

    @staticmethod
    def _shadow_mode(organisation: Any) -> bool:
        try:
            customer_settings = organisation.ticketing_customer_ai_settings
        except (AttributeError, ObjectDoesNotExist):
            customer_settings = None
        if customer_settings is not None and hasattr(customer_settings, "shadow_mode"):
            return bool(customer_settings.shadow_mode)
        return bool(getattr(settings, "CUSTOMER_AI_SHADOW_MODE", True))

    @staticmethod
    def _tool_call_limit(organisation: Any) -> int:
        try:
            customer_settings = organisation.ticketing_customer_ai_settings
        except (AttributeError, ObjectDoesNotExist):
            customer_settings = None
        raw = (
            getattr(customer_settings, "max_tool_calls", None)
            if customer_settings is not None
            else None
        )
        value = int(raw or getattr(settings, "CUSTOMER_AI_MAX_TOOL_CALLS", DEFAULT_MAX_TOOL_CALLS))
        if not 1 <= value <= 12:
            raise CustomerAITaskConfigurationError(
                "Customer AI max tool calls must be between 1 and 12."
            )
        return value

    @staticmethod
    def _reply_limit(value: Any) -> int:
        result = int(value or DEFAULT_MAX_REPLY_CHARACTERS)
        if not 80 <= result <= 1_200:
            raise CustomerAITaskConfigurationError(
                "Customer AI reply length must be between 80 and 1200."
            )
        return result

    @staticmethod
    def _disabled_runtime(*, shadow_mode: bool = False) -> CustomerAITaskRuntime:
        return CustomerAITaskRuntime(
            agent=_DisabledCustomerAgent(),
            sender=None,
            enabled=False,
            shadow_mode=bool(shadow_mode),
            model="",
            max_reply_characters=DEFAULT_MAX_REPLY_CHARACTERS,
        )


__all__ = [
    "CustomerAIMessageSenderFactory",
    "CustomerAIProviderAdapterFactory",
    "CustomerAIToolset",
    "CustomerAIToolsetFactory",
    "DjangoCustomerAIRuntimeFactory",
]
