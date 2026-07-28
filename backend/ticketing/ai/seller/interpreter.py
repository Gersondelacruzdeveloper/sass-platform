# ticketing/ai/seller/interpreter.py

from __future__ import annotations

import json
import logging
from typing import Any, Mapping

from openai import (
    APIConnectionError,
    APIStatusError,
    APITimeoutError,
    OpenAI,
    RateLimitError,
)

from .prompts import (
    SELLER_BOOKING_JSON_SCHEMA,
    build_interpreter_messages,
    normalise_interpretation,
)
from .schemas import BookingConversationState, SellerMessage


logger = logging.getLogger(__name__)


class SellerInterpreterError(Exception):
    """
    Raised when the AI provider cannot interpret a seller message.
    """

    def __init__(
        self,
        message: str,
        *,
        provider: str = "openai",
        status_code: int | None = None,
        response_data: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.provider = provider
        self.status_code = status_code
        self.response_data = response_data

    def to_dict(self) -> dict[str, Any]:
        return {
            "message": self.message,
            "provider": self.provider,
            "status_code": self.status_code,
            "response_data": self.response_data,
        }


class OpenAISellerMessageInterpreter:
    """
    OpenAI implementation of the seller message interpreter.

    This component:

    - understands natural seller language
    - returns structured interpretation JSON
    - uses seller-specific language memory
    - receives trusted products and choices
    - never calls Ticketing APIs
    - never creates a booking
    - never decides authoritative business rules
    """

    DEFAULT_MODEL = "gpt-5-mini"
    DEFAULT_TIMEOUT_SECONDS = 45.0
    DEFAULT_REASONING_EFFORT = "low"
    MAX_RETRY_OUTPUT_TOKENS = 8000

    def __init__(
        self,
        *,
        api_key: str,
        model: str | None = None,
        timeout: float | int | None = None,
        max_output_tokens: int = 3000,
        reasoning_effort: str | None = None,
        retry_empty_response: bool = True,
        client: OpenAI | None = None,
    ) -> None:
        clean_api_key = str(api_key or "").strip()

        if not clean_api_key and client is None:
            raise ValueError("An OpenAI API key is required.")

        self.model = (
            str(model or "").strip()
            or self.DEFAULT_MODEL
        )

        self.timeout = float(
            timeout
            if timeout is not None
            else self.DEFAULT_TIMEOUT_SECONDS
        )

        self.max_output_tokens = max(
            1000,
            int(max_output_tokens),
        )

        clean_reasoning_effort = str(
            reasoning_effort
            if reasoning_effort is not None
            else self.DEFAULT_REASONING_EFFORT
        ).strip().lower()

        if clean_reasoning_effort not in {
            "minimal",
            "low",
            "medium",
            "high",
        }:
            raise ValueError(
                "reasoning_effort must be minimal, low, medium, or high."
            )

        self.reasoning_effort = clean_reasoning_effort
        self.retry_empty_response = bool(retry_empty_response)

        self.client = client or OpenAI(
            api_key=clean_api_key,
            timeout=self.timeout,
        )

    def interpret(
        self,
        *,
        message: SellerMessage,
        state: BookingConversationState,
        seller: dict[str, Any],
        products: list[dict[str, Any]],
        trusted_pickup_locations: list[dict[str, Any]],
        memory: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Interpret one seller message and return the normalised structure
        expected by workflow.py.
        """

        if not message.text.strip():
            return normalise_interpretation({})

        messages = build_interpreter_messages(
            message=message,
            state=state,
            seller=seller,
            products=products,
            trusted_pickup_locations=trusted_pickup_locations,
            memory=memory,
        )

        messages = self._add_semantic_extraction_rules(messages)

        try:
            response = self._create_response(
                messages=messages,
                max_output_tokens=self.max_output_tokens,
            )

        except RateLimitError as exc:
            logger.warning(
                "OpenAI seller interpreter rate limit.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                },
            )

            raise SellerInterpreterError(
                "The AI interpreter is temporarily busy.",
                status_code=429,
            ) from exc

        except APITimeoutError as exc:
            logger.warning(
                "OpenAI seller interpreter timed out.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                },
            )

            raise SellerInterpreterError(
                "The AI interpreter request timed out.",
            ) from exc

        except APIConnectionError as exc:
            logger.warning(
                "Could not connect to OpenAI.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                },
            )

            raise SellerInterpreterError(
                "The AI interpreter could not be reached.",
            ) from exc

        except APIStatusError as exc:
            status_code = getattr(exc, "status_code", None)

            logger.warning(
                "OpenAI seller interpreter API error.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                    "status_code": status_code,
                },
            )

            raise SellerInterpreterError(
                "The AI interpreter rejected the request.",
                status_code=status_code,
                response_data=self._safe_api_error(exc),
            ) from exc

        except Exception as exc:
            logger.exception(
                "Unexpected seller interpreter failure.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                },
            )

            raise SellerInterpreterError(
                "The seller message could not be interpreted.",
            ) from exc

        response, output_text = self._ensure_output_text(
            response=response,
            messages=messages,
            state=state,
        )

        parsed = self._parse_json(output_text)

        interpretation = normalise_interpretation(parsed)

        self._validate_trusted_identifiers(
            interpretation=interpretation,
            state=state,
            products=products,
            trusted_pickup_locations=trusted_pickup_locations,
        )

        return interpretation

    @staticmethod
    def _add_semantic_extraction_rules(
        messages: list[dict[str, str]],
    ) -> list[dict[str, str]]:
        """
        Add semantic guidance for extracting a requested product option.

        The seller may mention the base product and desired option in one short
        message before live availability has been loaded. The interpreter must
        preserve that option wording in ``option_phrase`` so workflow.py can
        match it against the authoritative options returned by the API.
        """

        semantic_rules = """
SEMANTIC PRODUCT-OPTION EXTRACTION

Understand the full meaning of the latest seller message.

The seller may mention the base product and a desired ticket tier, package,
seating area, access level, inclusion, variant or option in the same phrase.

Rules:

- The latest seller message has priority over an older draft value.
- Treat correction language such as "change", "instead", "not that one",
  "it has to be", "wrong", "premium", "regular", "VIP", "no me gusta",
  "cámbialo", "tiene que ser" and equivalent multilingual wording as a
  request to modify the current booking draft.
- When the seller corrects a product option, return the corrected wording in
  option_phrase even when the prior state already contains another option.
- Never silently preserve an old option after the seller explicitly replaces
  it.
- When a correction does not identify an exact trusted live option ID, keep
  the corrected phrase but do not invent or reuse an incompatible external ID.
- Put only the base experience/product wording in product_phrase.
- Put wording that describes the desired tier, package, seating area, access
  level, inclusion, variant or option in option_phrase.
- Extract option_phrase even when trusted live-option choices are not present
  yet.
- Do not ask for a second turn merely because exact live options have not yet
  been loaded.
- Do not invent external option IDs. Exact IDs may only come from trusted
  choices.
- Preserve the seller's meaningful wording instead of inventing a complete
  official option name.

Examples:

"Coco Bongo premium for two tomorrow"
-> product_phrase: "Coco Bongo"
-> option_phrase: "premium"

"two regular Coco Bongo tickets"
-> product_phrase: "Coco Bongo"
-> option_phrase: "regular"

"front row VIP tomorrow"
-> option_phrase: "front row VIP"

"gold member for three"
-> option_phrase: "gold member"

These examples are illustrative, not exhaustive. Apply semantic understanding
to equivalent wording, abbreviations, misspellings and supported languages.
""".strip()

        updated_messages = list(messages)
        insertion_index = 1 if updated_messages else 0

        updated_messages.insert(
            insertion_index,
            {
                "role": "system",
                "content": semantic_rules,
            },
        )

        return updated_messages

    # ------------------------------------------------------------------
    # OpenAI response creation and recovery
    # ------------------------------------------------------------------

    def _create_response(
        self,
        *,
        messages: list[dict[str, str]],
        max_output_tokens: int,
    ) -> Any:
        """Create one structured Responses API request."""

        request: dict[str, Any] = {
            "model": self.model,
            "input": messages,
            "max_output_tokens": max_output_tokens,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": SELLER_BOOKING_JSON_SCHEMA["name"],
                    "strict": SELLER_BOOKING_JSON_SCHEMA["strict"],
                    "schema": self._normalise_strict_json_schema(
                        SELLER_BOOKING_JSON_SCHEMA["schema"]
                    ),
                }
            },
        }

        if self._supports_reasoning_effort():
            request["reasoning"] = {"effort": self.reasoning_effort}

        return self.client.responses.create(**request)

    def _ensure_output_text(
        self,
        *,
        response: Any,
        messages: list[dict[str, str]],
        state: BookingConversationState,
    ) -> tuple[Any, str]:
        """Return output text and retry once on token-budget exhaustion."""

        output_text = self._extract_output_text(response)
        if output_text:
            return response, output_text

        diagnostics = self._response_diagnostics(response)
        refusal = self._extract_refusal_text(response)
        if refusal:
            raise SellerInterpreterError(
                "The AI interpreter refused the request.",
                response_data={**diagnostics, "refusal": refusal[:1000]},
            )

        incomplete_reason = self._incomplete_reason(response)
        should_retry = (
            self.retry_empty_response
            and incomplete_reason == "max_output_tokens"
        )

        if should_retry:
            retry_tokens = min(
                max(self.max_output_tokens * 2, 4000),
                self.MAX_RETRY_OUTPUT_TOKENS,
            )
            logger.info(
                "Retrying incomplete OpenAI seller interpretation.",
                extra={
                    "conversation_id": state.conversation_id,
                    "seller_id": state.seller_id,
                    "organisation_slug": state.organisation_slug,
                    "model": self.model,
                    "initial_max_output_tokens": self.max_output_tokens,
                    "retry_max_output_tokens": retry_tokens,
                    "incomplete_reason": incomplete_reason,
                },
            )
            response = self._create_response(
                messages=messages,
                max_output_tokens=retry_tokens,
            )
            output_text = self._extract_output_text(response)
            if output_text:
                return response, output_text

            diagnostics = self._response_diagnostics(response)
            refusal = self._extract_refusal_text(response)
            if refusal:
                diagnostics["refusal"] = refusal[:1000]

        logger.warning(
            "OpenAI seller interpreter returned no output text.",
            extra={
                "conversation_id": state.conversation_id,
                "seller_id": state.seller_id,
                "organisation_slug": state.organisation_slug,
                "model": self.model,
                "response_diagnostics": diagnostics,
            },
        )

        if diagnostics.get("status") == "incomplete":
            raise SellerInterpreterError(
                "The AI interpreter response was incomplete.",
                response_data=diagnostics,
            )

        raise SellerInterpreterError(
            "The AI interpreter returned an empty response.",
            response_data=diagnostics,
        )

    def _supports_reasoning_effort(self) -> bool:
        return self.model.strip().lower().startswith("gpt-5")

    @staticmethod
    def _incomplete_reason(response: Any) -> str:
        details = getattr(response, "incomplete_details", None)
        if details is None:
            return ""
        if isinstance(details, Mapping):
            return str(details.get("reason") or "").strip()
        return str(getattr(details, "reason", "") or "").strip()

    @classmethod
    def _response_diagnostics(cls, response: Any) -> dict[str, Any]:
        usage = getattr(response, "usage", None)
        if hasattr(usage, "model_dump"):
            usage_data = usage.model_dump()
        elif isinstance(usage, Mapping):
            usage_data = dict(usage)
        else:
            usage_data = None

        error = getattr(response, "error", None)
        if hasattr(error, "model_dump"):
            error_data = error.model_dump()
        elif isinstance(error, Mapping):
            error_data = dict(error)
        elif error:
            error_data = str(error)
        else:
            error_data = None

        return {
            "response_id": str(getattr(response, "id", "") or ""),
            "model": str(getattr(response, "model", "") or ""),
            "status": str(getattr(response, "status", "") or ""),
            "incomplete_reason": cls._incomplete_reason(response),
            "error": error_data,
            "usage": usage_data,
            "output_item_types": cls._output_item_types(response),
        }

    @staticmethod
    def _output_item_types(response: Any) -> list[str]:
        output = getattr(response, "output", None)
        if not isinstance(output, list):
            return []
        return [str(getattr(item, "type", "") or "") for item in output]

    @staticmethod
    def _extract_refusal_text(response: Any) -> str:
        output = getattr(response, "output", None)
        if not isinstance(output, list):
            return ""

        refusals: list[str] = []
        for item in output:
            content = getattr(item, "content", None)
            if not isinstance(content, list):
                continue
            for content_item in content:
                if str(getattr(content_item, "type", "") or "") != "refusal":
                    continue
                value = (
                    getattr(content_item, "refusal", None)
                    or getattr(content_item, "text", None)
                    or ""
                )
                if isinstance(value, str) and value.strip():
                    refusals.append(value.strip())
        return "\n".join(refusals).strip()

    # ------------------------------------------------------------------
    # Structured-output schema
    # ------------------------------------------------------------------

    @classmethod
    def _normalise_strict_json_schema(
        cls,
        schema: Any,
    ) -> Any:
        """
        Return an OpenAI-compatible strict JSON schema.

        For every object:
        - ``required`` contains every key declared in ``properties``;
        - stale required keys that are absent from ``properties`` are removed;
        - ``additionalProperties`` is disabled.

        A copied structure is returned so the imported shared schema is never
        mutated in place.
        """

        if isinstance(schema, list):
            return [
                cls._normalise_strict_json_schema(item)
                for item in schema
            ]

        if not isinstance(schema, Mapping):
            return schema

        normalised = {
            str(key): cls._normalise_strict_json_schema(value)
            for key, value in schema.items()
        }

        schema_type = normalised.get("type")
        properties = normalised.get("properties")

        is_object_schema = (
            schema_type == "object"
            or isinstance(properties, Mapping)
        )

        if is_object_schema:
            clean_properties = (
                dict(properties)
                if isinstance(properties, Mapping)
                else {}
            )

            normalised["properties"] = clean_properties
            normalised["required"] = list(clean_properties.keys())
            normalised["additionalProperties"] = False

        return normalised

    # ------------------------------------------------------------------
    # Output parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _extract_output_text(response: Any) -> str:
        """
        Extract text from an OpenAI Responses API response.
        """

        direct_output = str(
            getattr(response, "output_text", "") or ""
        ).strip()

        if direct_output:
            return direct_output

        output = getattr(response, "output", None)

        if not isinstance(output, list):
            return ""

        text_parts: list[str] = []

        for item in output:
            content = (
                item.get("content")
                if isinstance(item, Mapping)
                else getattr(item, "content", None)
            )

            if not isinstance(content, list):
                continue

            for content_item in content:
                if isinstance(content_item, Mapping):
                    content_type = str(content_item.get("type") or "")
                    value = content_item.get("text", "")
                else:
                    content_type = str(
                        getattr(content_item, "type", "") or ""
                    )
                    value = getattr(content_item, "text", "")

                if content_type not in {
                    "output_text",
                    "text",
                }:
                    continue

                if isinstance(value, str) and value.strip():
                    text_parts.append(value.strip())

        return "\n".join(text_parts).strip()

    @staticmethod
    def _parse_json(value: str) -> dict[str, Any]:
        clean_value = str(value or "").strip()

        if clean_value.startswith("```"):
            clean_value = (
                clean_value.removeprefix("```json")
                .removeprefix("```JSON")
                .removeprefix("```")
                .removesuffix("```")
                .strip()
            )

        try:
            parsed = json.loads(clean_value)
        except json.JSONDecodeError as exc:
            raise SellerInterpreterError(
                "The AI interpreter returned invalid JSON.",
                response_data=clean_value[:1000],
            ) from exc

        if not isinstance(parsed, dict):
            raise SellerInterpreterError(
                "The AI interpreter response must be a JSON object.",
                response_data=parsed,
            )

        return parsed

    # ------------------------------------------------------------------
    # Trusted identifier validation
    # ------------------------------------------------------------------

    def _validate_trusted_identifiers(
        self,
        *,
        interpretation: dict[str, Any],
        state: BookingConversationState,
        products: list[dict[str, Any]],
        trusted_pickup_locations: list[dict[str, Any]],
    ) -> None:
        """
        Reject IDs that were not supplied as trusted API data.

        Names and phrases may be approximate. Exact identifiers must already
        exist in products, the selected state, or pending choices.
        """

        product_id = self._optional_int(
            interpretation.get("product_id")
        )

        if product_id is not None:
            trusted_product_ids = {
                item_id
                for item in products
                if isinstance(item, Mapping)
                for item_id in [self._optional_int(item.get("id"))]
                if item_id is not None
            }

            if (
                state.product
                and state.product.product_id
            ):
                trusted_product_ids.add(
                    state.product.product_id
                )

            trusted_product_ids.update(
                self._pending_integer_ids(state)
            )

            if product_id not in trusted_product_ids:
                logger.warning(
                    "Interpreter returned an untrusted product ID.",
                    extra={
                        "conversation_id": state.conversation_id,
                        "seller_id": state.seller_id,
                        "product_id": product_id,
                    },
                )
                interpretation["product_id"] = None

        pickup_location_id = self._optional_int(
            interpretation.get("pickup_location_id")
        )

        if pickup_location_id is not None:
            trusted_pickup_ids: set[int] = {
                identifier
                for location in trusted_pickup_locations
                if isinstance(location, Mapping)
                for identifier in [
                    self._optional_int(location.get("id"))
                ]
                if identifier is not None
            }

            if state.pickup:
                trusted_pickup_ids.add(
                    state.pickup.pickup_location_id
                )

            if (
                state.pending_selection
                and state.pending_selection.selection_type
                == "pickup_location"
            ):
                trusted_pickup_ids.update(
                    self._pending_integer_ids(state)
                )

            if pickup_location_id not in trusted_pickup_ids:
                logger.warning(
                    "Interpreter returned an untrusted pickup ID.",
                    extra={
                        "conversation_id": state.conversation_id,
                        "seller_id": state.seller_id,
                        "pickup_location_id": pickup_location_id,
                    },
                )
                interpretation["pickup_location_id"] = None

        trusted_external_ids = (
            self._trusted_external_ids(state)
        )

        for field_name in (
            "external_product_id",
            "external_variant_id",
            "external_availability_id",
            "selected_external_product_id",
        ):
            value = str(
                interpretation.get(field_name) or ""
            ).strip()

            if value and value not in trusted_external_ids:
                logger.warning(
                    "Interpreter returned an untrusted external ID.",
                    extra={
                        "conversation_id": state.conversation_id,
                        "seller_id": state.seller_id,
                        "field_name": field_name,
                    },
                )
                interpretation[field_name] = ""

    @staticmethod
    def _pending_integer_ids(
        state: BookingConversationState,
    ) -> set[int]:
        identifiers: set[int] = set()

        if not state.pending_selection:
            return identifiers

        for choice in state.pending_selection.choices:
            if not isinstance(choice, Mapping):
                continue

            for key in ("id", "value"):
                try:
                    identifier = int(choice.get(key))
                except (TypeError, ValueError):
                    continue

                if identifier > 0:
                    identifiers.add(identifier)

        return identifiers

    @staticmethod
    def _trusted_external_ids(
        state: BookingConversationState,
    ) -> set[str]:
        identifiers: set[str] = set()

        if state.live_option:
            for value in (
                state.live_option.external_product_id,
                state.live_option.external_variant_id,
                state.live_option.external_availability_id,
                state.live_option.selected_external_product_id,
            ):
                clean_value = str(value or "").strip()
                if clean_value:
                    identifiers.add(clean_value)

        if not state.pending_selection:
            return identifiers

        if (
            state.pending_selection.selection_type
            != "live_option"
        ):
            return identifiers

        for choice in state.pending_selection.choices:
            if not isinstance(choice, Mapping):
                continue

            for key in ("id", "value"):
                clean_value = str(
                    choice.get(key) or ""
                ).strip()

                if clean_value:
                    identifiers.add(clean_value)

            api_data = choice.get("api_data")

            if not isinstance(api_data, Mapping):
                continue

            for key in (
                "external_product_id",
                "external_variant_id",
                "external_availability_id",
            ):
                clean_value = str(
                    api_data.get(key) or ""
                ).strip()

                if clean_value:
                    identifiers.add(clean_value)

        return identifiers

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _optional_int(value: Any) -> int | None:
        if value in (None, ""):
            return None

        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _safe_api_error(
        exception: APIStatusError,
    ) -> dict[str, Any]:
        response = getattr(exception, "response", None)

        if response is None:
            return {}

        request_id = (
            response.headers.get("x-request-id")
            if getattr(response, "headers", None)
            else None
        )

        return {
            "status_code": getattr(
                exception,
                "status_code",
                None,
            ),
            "request_id": request_id,
        }