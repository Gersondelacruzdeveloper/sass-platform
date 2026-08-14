"""Customer-facing WhatsApp sales-agent orchestration.

This module coordinates one inbound customer turn. It deliberately contains no
product, availability, pickup, promotion, cart, booking, payment, or WhatsApp
API logic. Those operations are exposed through a restricted tool executor.

Safety boundaries:

* organisation context is required for every turn;
* the agent cannot create or confirm bookings;
* authoritative facts must come from backend tools;
* tool calls are bounded;
* final replies are normalized for short WhatsApp conversations;
* seller-agent code and seller memory are never imported.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol, Sequence


logger = logging.getLogger(__name__)


class CustomerAgentError(RuntimeError):
    """Base exception for customer-agent orchestration failures."""


class CustomerAgentConfigurationError(CustomerAgentError):
    """Raised when required agent dependencies or settings are missing."""


class CustomerAgentProviderError(CustomerAgentError):
    """Raised when the configured AI provider cannot complete a turn."""


class CustomerAgentToolLimitError(CustomerAgentError):
    """Raised when a model exceeds the permitted number of tool calls."""


@dataclass(frozen=True)
class CustomerAgentToolCall:
    """A normalized function-tool request returned by the AI provider."""

    call_id: str
    name: str
    arguments: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CustomerAgentProviderResult:
    """Provider-independent result for one model response."""

    response_id: str
    output_text: str = ""
    tool_calls: tuple[CustomerAgentToolCall, ...] = ()
    raw_response: Any = None


@dataclass(frozen=True)
class CustomerAgentTurnContext:
    """Trusted application context for a single inbound customer message."""

    organisation: Any
    conversation: Any
    customer_message: str
    language: str = ""
    model: str = ""
    previous_response_id: str = ""
    max_reply_characters: int = 600
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.organisation is None:
            raise CustomerAgentConfigurationError(
                "An organisation is required for a customer-agent turn."
            )

        if self.conversation is None:
            raise CustomerAgentConfigurationError(
                "A customer conversation is required for a customer-agent turn."
            )

        if not str(self.customer_message or "").strip():
            raise CustomerAgentConfigurationError(
                "The inbound customer message cannot be empty."
            )


@dataclass(frozen=True)
class ExecutedCustomerTool:
    """Sanitized audit information for one executed customer tool."""

    call_id: str
    name: str
    arguments: Mapping[str, Any]
    result: Mapping[str, Any]


@dataclass(frozen=True)
class CustomerAgentTurnResult:
    """Final application result for a processed inbound customer turn."""

    reply_text: str
    response_id: str
    executed_tools: tuple[ExecutedCustomerTool, ...] = ()
    raw_response: Any = None


class CustomerAgentProvider(Protocol):
    """Minimal provider contract required by this orchestrator."""

    def run_tool_turn(
        self,
        *,
        instructions: str,
        input_items: Sequence[Mapping[str, Any]],
        tools: Sequence[Mapping[str, Any]],
        model: str | None = None,
        previous_response_id: str | None = None,
    ) -> CustomerAgentProviderResult:
        """Return text, function calls, or both for one provider request."""


class CustomerAgentToolExecutor(Protocol):
    """Restricted gateway for organisation-scoped customer tools."""

    def tool_definitions(self) -> Sequence[Mapping[str, Any]]:
        """Return strict function schemas available to the model."""

    def execute(
        self,
        *,
        tool_name: str,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Validate and execute one permitted backend tool."""


class CustomerAgentPromptBuilder(Protocol):
    """Build organisation-specific customer-sales instructions."""

    def build_instructions(
        self,
        *,
        organisation: Any,
        conversation: Any,
        language: str,
        metadata: Mapping[str, Any],
    ) -> str:
        """Return the complete instruction string for this customer turn."""


class CustomerSalesAgent:
    """Run a bounded, tool-driven customer WhatsApp sales turn.

    Dependencies are injected so the orchestration can be tested without
    OpenAI, Meta, Celery, or a database connection. Tool implementations remain
    responsible for tenant validation and business-rule enforcement.
    """

    DEFAULT_MAX_TOOL_CALLS = 6
    MIN_REPLY_CHARACTERS = 80
    MAX_REPLY_CHARACTERS = 1_200

    def __init__(
        self,
        *,
        provider: CustomerAgentProvider,
        tool_executor: CustomerAgentToolExecutor,
        prompt_builder: CustomerAgentPromptBuilder,
        max_tool_calls: int = DEFAULT_MAX_TOOL_CALLS,
    ) -> None:
        if provider is None:
            raise CustomerAgentConfigurationError(
                "A customer-agent AI provider is required."
            )
        if tool_executor is None:
            raise CustomerAgentConfigurationError(
                "A customer-agent tool executor is required."
            )
        if prompt_builder is None:
            raise CustomerAgentConfigurationError(
                "A customer-agent prompt builder is required."
            )

        resolved_limit = int(max_tool_calls)
        if resolved_limit < 1 or resolved_limit > 12:
            raise CustomerAgentConfigurationError(
                "max_tool_calls must be between 1 and 12."
            )

        self.provider = provider
        self.tool_executor = tool_executor
        self.prompt_builder = prompt_builder
        self.max_tool_calls = resolved_limit

    def run_turn(
        self,
        context: CustomerAgentTurnContext,
    ) -> CustomerAgentTurnResult:
        """Process one customer message and return a short final reply.

        This method does not send WhatsApp messages. The Celery task decides
        whether to log the reply in shadow mode or send it through the existing
        organisation-scoped WhatsApp service.
        """
        instructions = self.prompt_builder.build_instructions(
            organisation=context.organisation,
            conversation=context.conversation,
            language=str(context.language or "").strip().lower(),
            metadata=context.metadata,
        ).strip()

        if not instructions:
            raise CustomerAgentConfigurationError(
                "The customer-agent prompt builder returned empty instructions."
            )

        tools = tuple(self.tool_executor.tool_definitions())
        if not tools:
            raise CustomerAgentConfigurationError(
                "The customer agent has no registered backend tools."
            )

        input_items: list[Mapping[str, Any]] = [
            {
                "role": "user",
                "content": str(context.customer_message).strip(),
            }
        ]
        executed_tools: list[ExecutedCustomerTool] = []
        last_result: CustomerAgentProviderResult | None = None
        tool_call_count = 0

        while True:
            try:
                provider_result = self.provider.run_tool_turn(
                    instructions=instructions,
                    input_items=input_items,
                    tools=tools,
                    model=str(context.model or "").strip() or None,
                    previous_response_id=(
                        str(context.previous_response_id or "").strip() or None
                    ),
                )
            except CustomerAgentError:
                raise
            except Exception as exc:
                logger.exception(
                    "Customer AI provider failed for organisation=%s "
                    "conversation=%s.",
                    getattr(context.organisation, "id", None),
                    getattr(context.conversation, "id", None),
                )
                raise CustomerAgentProviderError(
                    "The customer sales assistant could not complete this turn."
                ) from exc

            last_result = provider_result
            pending_calls = tuple(provider_result.tool_calls or ())

            if not pending_calls:
                break

            tool_call_count += len(pending_calls)
            if tool_call_count > self.max_tool_calls:
                raise CustomerAgentToolLimitError(
                    "The customer agent exceeded the permitted tool-call limit."
                )

            # Preserve the provider's tool-call requests before returning their
            # application-controlled results.
            for tool_call in pending_calls:
                input_items.append(
                    {
                        "type": "function_call",
                        "call_id": tool_call.call_id,
                        "name": tool_call.name,
                        "arguments": self._json_dumps(tool_call.arguments),
                    }
                )

                tool_result = self._execute_tool(
                    context=context,
                    tool_call=tool_call,
                )
                executed_tools.append(tool_result)
                input_items.append(
                    {
                        "type": "function_call_output",
                        "call_id": tool_call.call_id,
                        "output": self._json_dumps(tool_result.result),
                    }
                )

        if last_result is None:
            raise CustomerAgentProviderError(
                "The customer sales assistant returned no result."
            )

        reply_text = self._normalize_reply(
            last_result.output_text,
            max_characters=context.max_reply_characters,
        )

        if not reply_text:
            raise CustomerAgentProviderError(
                "The customer sales assistant returned an empty reply."
            )

        return CustomerAgentTurnResult(
            reply_text=reply_text,
            response_id=str(last_result.response_id or ""),
            executed_tools=tuple(executed_tools),
            raw_response=last_result.raw_response,
        )

    def _execute_tool(
        self,
        *,
        context: CustomerAgentTurnContext,
        tool_call: CustomerAgentToolCall,
    ) -> ExecutedCustomerTool:
        tool_name = str(tool_call.name or "").strip()
        call_id = str(tool_call.call_id or "").strip()

        if not tool_name or not call_id:
            raise CustomerAgentError(
                "The AI provider returned an invalid function-tool call."
            )

        arguments = dict(tool_call.arguments or {})

        try:
            result = self.tool_executor.execute(
                tool_name=tool_name,
                arguments=arguments,
                organisation=context.organisation,
                conversation=context.conversation,
                metadata=context.metadata,
            )
        except CustomerAgentError:
            raise
        except Exception as exc:
            logger.exception(
                "Customer tool failed: organisation=%s conversation=%s "
                "tool=%s.",
                getattr(context.organisation, "id", None),
                getattr(context.conversation, "id", None),
                tool_name,
            )
            raise CustomerAgentError(
                f"Customer tool '{tool_name}' could not be completed."
            ) from exc

        if not isinstance(result, Mapping):
            raise CustomerAgentError(
                f"Customer tool '{tool_name}' returned an invalid result."
            )

        return ExecutedCustomerTool(
            call_id=call_id,
            name=tool_name,
            arguments=arguments,
            result=dict(result),
        )

    @classmethod
    def _normalize_reply(
        cls,
        value: str,
        *,
        max_characters: int,
    ) -> str:
        """Normalize model output for a concise WhatsApp response."""
        text = str(value or "").strip()
        if not text:
            return ""

        # Remove accidental Markdown/code-fence formatting. Product links and
        # ordinary punctuation remain untouched.
        text = re.sub(r"^```(?:text|markdown)?\s*", "", text, flags=re.I)
        text = re.sub(r"\s*```$", "", text)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()

        limit = max(
            cls.MIN_REPLY_CHARACTERS,
            min(int(max_characters), cls.MAX_REPLY_CHARACTERS),
        )

        if len(text) <= limit:
            return text

        shortened = text[:limit].rstrip()
        boundary = max(
            shortened.rfind(". "),
            shortened.rfind("? "),
            shortened.rfind("! "),
            shortened.rfind("\n"),
        )

        if boundary >= int(limit * 0.55):
            shortened = shortened[: boundary + 1].rstrip()

        return shortened or text[:limit].rstrip()

    @staticmethod
    def _json_dumps(value: Any) -> str:
        try:
            return json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            )
        except (TypeError, ValueError) as exc:
            raise CustomerAgentError(
                "Customer-agent tool data could not be serialized."
            ) from exc


__all__ = [
    "CustomerAgentConfigurationError",
    "CustomerAgentError",
    "CustomerAgentProvider",
    "CustomerAgentProviderError",
    "CustomerAgentProviderResult",
    "CustomerAgentPromptBuilder",
    "CustomerAgentToolCall",
    "CustomerAgentToolExecutor",
    "CustomerAgentToolLimitError",
    "CustomerAgentTurnContext",
    "CustomerAgentTurnResult",
    "CustomerSalesAgent",
    "ExecutedCustomerTool",
]
