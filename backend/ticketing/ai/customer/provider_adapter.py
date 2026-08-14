"""OpenAI Responses API adapter for the independent customer sales agent.

The organisation AI service owns credential decryption and provider creation.
This module receives that already-configured provider and adds the bounded
``run_tool_turn`` interface required by ``CustomerSalesAgent``. It never reads
encrypted credentials, creates bookings, records payments, or executes tools.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Mapping, Sequence
from typing import Any

from organisations.ai.constants import OPENAI
from ticketing.ai.customer.agent import (
    CustomerAgentProviderError,
    CustomerAgentProviderResult,
    CustomerAgentToolCall,
)


logger = logging.getLogger(__name__)

MAX_PROVIDER_TOOL_CALLS = 12


class CustomerProviderAdapterConfigurationError(CustomerAgentProviderError):
    """Raised when the configured organisation provider cannot be adapted."""


class OpenAICustomerProviderAdapter:
    """Translate OpenAI Responses API output into customer-agent contracts."""

    def __init__(self, *, provider: Any, default_model: str) -> None:
        if provider is None:
            raise CustomerProviderAdapterConfigurationError(
                "An organisation AI provider is required."
            )

        provider_name = str(getattr(provider, "provider_name", "") or "").lower()
        if provider_name != OPENAI:
            raise CustomerProviderAdapterConfigurationError(
                "The customer provider adapter currently supports OpenAI only."
            )

        if not callable(getattr(provider, "_build_client", None)):
            raise CustomerProviderAdapterConfigurationError(
                "The configured OpenAI provider cannot build a client."
            )

        resolved_model = str(default_model or "").strip()
        if not resolved_model:
            raise CustomerProviderAdapterConfigurationError(
                "A default OpenAI model is required."
            )

        self._provider = provider
        self._default_model = resolved_model

    def run_tool_turn(
        self,
        *,
        instructions: str,
        input_items: Sequence[Mapping[str, Any]],
        tools: Sequence[Mapping[str, Any]],
        model: str | None = None,
        previous_response_id: str | None = None,
    ) -> CustomerAgentProviderResult:
        resolved_instructions = str(instructions or "").strip()
        resolved_model = str(model or self._default_model).strip()

        if not resolved_instructions:
            raise CustomerProviderAdapterConfigurationError(
                "Customer-agent instructions cannot be empty."
            )
        if not resolved_model:
            raise CustomerProviderAdapterConfigurationError(
                "An OpenAI model is required."
            )
        if not isinstance(input_items, Sequence) or isinstance(
            input_items, (str, bytes)
        ):
            raise CustomerProviderAdapterConfigurationError(
                "Customer-agent input items must be a sequence."
            )
        if not input_items:
            raise CustomerProviderAdapterConfigurationError(
                "Customer-agent input items cannot be empty."
            )

        safe_input = self._copy_mapping_sequence(input_items, label="input")
        safe_tools = self._copy_mapping_sequence(tools, label="tools")
        if not safe_tools:
            raise CustomerProviderAdapterConfigurationError(
                "At least one approved customer tool is required."
            )

        allowed_tool_names = self._tool_names(safe_tools)
        request: dict[str, Any] = {
            "model": resolved_model,
            "instructions": resolved_instructions,
            "input": safe_input,
            "tools": safe_tools,
            "tool_choice": "auto",
            "parallel_tool_calls": False,
        }
        resolved_previous_id = str(previous_response_id or "").strip()
        if resolved_previous_id:
            request["previous_response_id"] = resolved_previous_id

        try:
            client = self._provider._build_client()
            response = client.responses.create(**request)
        except CustomerAgentProviderError:
            raise
        except Exception as exc:
            logger.exception("OpenAI customer-agent request failed.")
            raise CustomerAgentProviderError(
                "OpenAI could not complete the customer-agent request."
            ) from exc

        return self._normalise_response(
            response,
            allowed_tool_names=allowed_tool_names,
        )

    @classmethod
    def _normalise_response(
        cls,
        response: Any,
        *,
        allowed_tool_names: frozenset[str],
    ) -> CustomerAgentProviderResult:
        if response is None:
            raise CustomerAgentProviderError("OpenAI returned no response.")

        response_id = str(cls._value(response, "id", "") or "").strip()
        output_text = str(cls._value(response, "output_text", "") or "").strip()
        raw_output = cls._value(response, "output", ()) or ()

        if not isinstance(raw_output, Sequence) or isinstance(
            raw_output, (str, bytes)
        ):
            raise CustomerAgentProviderError(
                "OpenAI returned an invalid output structure."
            )

        calls: list[CustomerAgentToolCall] = []
        seen_call_ids: set[str] = set()
        for item in raw_output:
            if str(cls._value(item, "type", "") or "") != "function_call":
                continue

            call_id = str(cls._value(item, "call_id", "") or "").strip()
            name = str(cls._value(item, "name", "") or "").strip()
            arguments = cls._parse_arguments(cls._value(item, "arguments", "{}"))

            if not call_id or call_id in seen_call_ids:
                raise CustomerAgentProviderError(
                    "OpenAI returned a missing or duplicate tool-call ID."
                )
            if name not in allowed_tool_names:
                raise CustomerAgentProviderError(
                    "OpenAI requested a tool that is not allowed."
                )

            seen_call_ids.add(call_id)
            calls.append(
                CustomerAgentToolCall(
                    call_id=call_id,
                    name=name,
                    arguments=arguments,
                )
            )

        if len(calls) > MAX_PROVIDER_TOOL_CALLS:
            raise CustomerAgentProviderError(
                "OpenAI returned too many tool calls in one response."
            )
        if not output_text and not calls:
            raise CustomerAgentProviderError(
                "OpenAI returned neither reply text nor a tool call."
            )

        return CustomerAgentProviderResult(
            response_id=response_id,
            output_text=output_text,
            tool_calls=tuple(calls),
            raw_response=response,
        )

    @staticmethod
    def _parse_arguments(value: Any) -> dict[str, Any]:
        if isinstance(value, Mapping):
            parsed: Any = dict(value)
        elif isinstance(value, str):
            try:
                parsed = json.loads(value or "{}")
            except json.JSONDecodeError as exc:
                raise CustomerAgentProviderError(
                    "OpenAI returned invalid JSON tool arguments."
                ) from exc
        else:
            raise CustomerAgentProviderError(
                "OpenAI returned invalid tool arguments."
            )

        if not isinstance(parsed, dict):
            raise CustomerAgentProviderError(
                "OpenAI tool arguments must be a JSON object."
            )
        return parsed

    @staticmethod
    def _copy_mapping_sequence(
        values: Sequence[Mapping[str, Any]],
        *,
        label: str,
    ) -> list[dict[str, Any]]:
        copied: list[dict[str, Any]] = []
        for value in values:
            if not isinstance(value, Mapping):
                raise CustomerProviderAdapterConfigurationError(
                    f"Customer-agent {label} entries must be mappings."
                )
            copied.append(dict(value))
        return copied

    @staticmethod
    def _tool_names(tools: Sequence[Mapping[str, Any]]) -> frozenset[str]:
        names: set[str] = set()
        for tool in tools:
            if str(tool.get("type") or "") != "function":
                raise CustomerProviderAdapterConfigurationError(
                    "Only function tools may be exposed to the customer agent."
                )
            name = str(tool.get("name") or "").strip()
            if not name or name in names:
                raise CustomerProviderAdapterConfigurationError(
                    "Customer tool definitions require unique names."
                )
            names.add(name)
        return frozenset(names)

    @staticmethod
    def _value(value: Any, key: str, default: Any = None) -> Any:
        if isinstance(value, Mapping):
            return value.get(key, default)
        return getattr(value, key, default)


class OpenAICustomerProviderAdapterFactory:
    """Build tenant-context-compatible OpenAI customer adapters."""

    def build_customer_provider(
        self,
        *,
        organisation: Any,
        conversation: Any,
        provider: Any,
        model: str,
    ) -> OpenAICustomerProviderAdapter:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerProviderAdapterConfigurationError(
                "An organisation is required."
            )
        if getattr(conversation, "organisation_id", None) != organisation_id:
            raise CustomerProviderAdapterConfigurationError(
                "The customer conversation belongs to another organisation."
            )

        return OpenAICustomerProviderAdapter(
            provider=provider,
            default_model=model,
        )
