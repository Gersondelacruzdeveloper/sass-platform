"""Validated execution boundary for customer-agent function tools.

Create one executor per conversation turn. The executor is bound to a trusted
organisation and conversation, exposes only enabled registry definitions, and
refuses cross-context execution. Application handlers remain responsible for
database transactions and domain-specific validation.
"""

from __future__ import annotations

import json
import logging
import re
from copy import deepcopy
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from typing import Any, Mapping, Sequence

from .tool_registry import (
    WRITE_ACCESS,
    CustomerToolNotRegisteredError,
    CustomerToolRegistration,
    CustomerToolRegistry,
)


logger = logging.getLogger(__name__)


DEFAULT_MAX_ARGUMENT_BYTES = 24_000
DEFAULT_MAX_RESULT_BYTES = 64_000

SENSITIVE_KEY_FRAGMENTS = frozenset(
    {
        "access_token",
        "api_key",
        "app_secret",
        "authorization",
        "card_number",
        "client_secret",
        "cvv",
        "encryption_key",
        "password",
        "provider_api_key",
        "secret_key",
        "webhook_verify_token",
    }
)


class CustomerToolExecutionError(RuntimeError):
    """Base exception for customer tool-execution failures."""


class CustomerToolContextError(CustomerToolExecutionError):
    """Raised when execution attempts to change tenant/conversation context."""


class CustomerToolArgumentError(CustomerToolExecutionError):
    """Raised when model arguments fail strict server-side validation."""


class CustomerToolPermissionError(CustomerToolExecutionError):
    """Raised when a registered tool is disabled in the current context."""


class CustomerToolResultError(CustomerToolExecutionError):
    """Raised when a handler returns unsafe or invalid data."""


class CustomerToolPublicError(CustomerToolExecutionError):
    """A safe handler error that may be returned to the model.

    Business handlers may raise this for expected failures such as an
    unavailable date or expired cart. Do not place credentials, stack traces,
    raw provider responses, or private records in ``message`` or ``details``.
    """

    def __init__(
        self,
        message: str,
        *,
        code: str = "tool_error",
        details: Mapping[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.message = str(message or "").strip() or "The request could not be completed."
        self.code = str(code or "tool_error").strip() or "tool_error"
        self.details = dict(details or {})


@dataclass(frozen=True)
class CustomerToolExecutionRecord:
    """Small sanitized execution record suitable for audit logging."""

    tool_name: str
    access: str
    organisation_id: Any
    conversation_id: Any
    idempotency_key: str
    succeeded: bool


class BoundCustomerToolExecutor:
    """Execute allowlisted tools for one immutable tenant/conversation context."""

    def __init__(
        self,
        *,
        registry: CustomerToolRegistry,
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any] | None = None,
        allow_write_tools: bool = False,
        max_argument_bytes: int = DEFAULT_MAX_ARGUMENT_BYTES,
        max_result_bytes: int = DEFAULT_MAX_RESULT_BYTES,
    ) -> None:
        if registry is None:
            raise CustomerToolContextError("A customer tool registry is required.")
        if organisation is None:
            raise CustomerToolContextError("An organisation is required.")
        if conversation is None:
            raise CustomerToolContextError("A customer conversation is required.")

        self.registry = registry
        self.organisation = organisation
        self.conversation = conversation
        self.metadata = dict(metadata or {})
        self.allow_write_tools = bool(allow_write_tools)
        self.max_argument_bytes = self._positive_limit(
            max_argument_bytes,
            "max_argument_bytes",
        )
        self.max_result_bytes = self._positive_limit(
            max_result_bytes,
            "max_result_bytes",
        )
        self._records: list[CustomerToolExecutionRecord] = []

    def tool_definitions(self) -> Sequence[Mapping[str, Any]]:
        """Return only tools enabled for this bound execution context."""
        definitions = self.registry.definitions(
            organisation=self.organisation,
            conversation=self.conversation,
            metadata=self.metadata,
        )

        if self.allow_write_tools:
            return definitions

        return [
            definition
            for definition in definitions
            if not self.registry.resolve(str(definition["name"])).is_write
        ]

    def execute(
        self,
        *,
        tool_name: str,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Validate and run one registered handler.

        The organisation and conversation supplied by ``agent.py`` must match
        the objects bound at construction. Untrusted IDs are never accepted in
        tool arguments.
        """
        self._assert_same_context(
            organisation=organisation,
            conversation=conversation,
        )
        self._assert_metadata_compatible(metadata)

        try:
            registration = self.registry.resolve(tool_name)
        except CustomerToolNotRegisteredError as exc:
            raise CustomerToolPermissionError(
                f"Customer tool '{str(tool_name or 'unknown')}' is not permitted."
            ) from exc

        if not registration.is_enabled(
            organisation=self.organisation,
            conversation=self.conversation,
            metadata=self.metadata,
        ):
            raise CustomerToolPermissionError(
                f"Customer tool '{registration.name}' is disabled."
            )

        if registration.is_write and not self.allow_write_tools:
            raise CustomerToolPermissionError(
                f"Customer tool '{registration.name}' cannot write in this mode."
            )

        idempotency_key = self._resolve_idempotency_key(registration)
        if not isinstance(arguments, Mapping):
            raise CustomerToolArgumentError(
                f"Customer tool '{registration.name}' arguments must be an object."
            )
        safe_arguments = deepcopy(dict(arguments))
        self._enforce_payload_size(
            safe_arguments,
            maximum=self.max_argument_bytes,
            label="arguments",
        )
        self._validate_arguments(
            registration=registration,
            arguments=safe_arguments,
        )

        try:
            raw_result = registration.handler(
                arguments=safe_arguments,
                organisation=self.organisation,
                conversation=self.conversation,
                metadata=self._handler_metadata(idempotency_key),
            )
        except CustomerToolPublicError as exc:
            result = self._public_error_result(exc)
            self._append_record(
                registration=registration,
                idempotency_key=idempotency_key,
                succeeded=False,
            )
            return result
        except Exception as exc:
            self._append_record(
                registration=registration,
                idempotency_key=idempotency_key,
                succeeded=False,
            )
            logger.exception(
                "Customer tool handler failed: organisation=%s "
                "conversation=%s tool=%s.",
                self._identity(self.organisation),
                self._identity(self.conversation),
                registration.name,
            )
            raise CustomerToolExecutionError(
                f"Customer tool '{registration.name}' failed."
            ) from exc

        result = self._normalize_result(
            tool_name=registration.name,
            value=raw_result,
        )
        self._append_record(
            registration=registration,
            idempotency_key=idempotency_key,
            succeeded=True,
        )
        return result

    def execution_records(self) -> tuple[CustomerToolExecutionRecord, ...]:
        return tuple(self._records)

    def _assert_same_context(self, *, organisation: Any, conversation: Any) -> None:
        if not self._same_identity(self.organisation, organisation):
            raise CustomerToolContextError(
                "Customer tool organisation context cannot be changed."
            )
        if not self._same_identity(self.conversation, conversation):
            raise CustomerToolContextError(
                "Customer tool conversation context cannot be changed."
            )

    def _assert_metadata_compatible(self, metadata: Mapping[str, Any]) -> None:
        """Protect immutable routing/idempotency values from call-time changes."""
        supplied = dict(metadata or {})
        protected_keys = (
            "channel",
            "external_message_id",
            "idempotency_key",
            "phone_number_id",
            "waba_id",
        )
        for key in protected_keys:
            bound_value = self.metadata.get(key)
            supplied_value = supplied.get(key)
            if (
                bound_value not in (None, "")
                and supplied_value not in (None, "")
                and str(bound_value) != str(supplied_value)
            ):
                raise CustomerToolContextError(
                    f"Customer tool metadata '{key}' cannot be changed."
                )

    def _resolve_idempotency_key(
        self,
        registration: CustomerToolRegistration,
    ) -> str:
        value = str(
            self.metadata.get("idempotency_key")
            or self.metadata.get("external_message_id")
            or ""
        ).strip()
        if registration.access == WRITE_ACCESS and not value:
            raise CustomerToolPermissionError(
                f"Customer tool '{registration.name}' requires an idempotency key."
            )
        return value

    def _handler_metadata(self, idempotency_key: str) -> Mapping[str, Any]:
        result = dict(self.metadata)
        if idempotency_key:
            result["idempotency_key"] = idempotency_key
        result["allow_write_tools"] = self.allow_write_tools
        return result

    def _validate_arguments(
        self,
        *,
        registration: CustomerToolRegistration,
        arguments: Mapping[str, Any],
    ) -> None:
        parameters = registration.schema.get("parameters")
        if not isinstance(parameters, Mapping):
            raise CustomerToolArgumentError(
                f"Customer tool '{registration.name}' has no valid parameter schema."
            )
        self._validate_json_value(
            value=arguments,
            schema=parameters,
            path=registration.name,
        )

    def _validate_json_value(
        self,
        *,
        value: Any,
        schema: Mapping[str, Any],
        path: str,
    ) -> None:
        allowed_types = schema.get("type")
        if isinstance(allowed_types, str):
            type_names = (allowed_types,)
        elif isinstance(allowed_types, list):
            type_names = tuple(str(item) for item in allowed_types)
        else:
            type_names = ()

        if type_names and not any(
            self._matches_json_type(value, type_name)
            for type_name in type_names
        ):
            raise CustomerToolArgumentError(
                f"Invalid value type at '{path}'."
            )

        if value is None:
            return

        if "enum" in schema and value not in schema["enum"]:
            raise CustomerToolArgumentError(
                f"Invalid value at '{path}'."
            )

        if isinstance(value, Mapping):
            properties = schema.get("properties") or {}
            required = schema.get("required") or []
            if not isinstance(properties, Mapping):
                raise CustomerToolArgumentError(
                    f"Invalid object schema at '{path}'."
                )
            missing = [key for key in required if key not in value]
            if missing:
                raise CustomerToolArgumentError(
                    f"Missing required value(s) at '{path}': {', '.join(missing)}."
                )
            if schema.get("additionalProperties") is False:
                extras = set(value) - set(properties)
                if extras:
                    raise CustomerToolArgumentError(
                        f"Unexpected value(s) at '{path}': {', '.join(sorted(extras))}."
                    )
            for key, child_value in value.items():
                child_schema = properties.get(key)
                if isinstance(child_schema, Mapping):
                    self._validate_json_value(
                        value=child_value,
                        schema=child_schema,
                        path=f"{path}.{key}",
                    )
            return

        if isinstance(value, list):
            minimum = schema.get("minItems")
            maximum = schema.get("maxItems")
            if minimum is not None and len(value) < int(minimum):
                raise CustomerToolArgumentError(
                    f"Too few items at '{path}'."
                )
            if maximum is not None and len(value) > int(maximum):
                raise CustomerToolArgumentError(
                    f"Too many items at '{path}'."
                )
            item_schema = schema.get("items")
            if isinstance(item_schema, Mapping):
                for index, child_value in enumerate(value):
                    self._validate_json_value(
                        value=child_value,
                        schema=item_schema,
                        path=f"{path}[{index}]",
                    )
            return

        if isinstance(value, str):
            minimum = schema.get("minLength")
            maximum = schema.get("maxLength")
            pattern = schema.get("pattern")
            if minimum is not None and len(value) < int(minimum):
                raise CustomerToolArgumentError(
                    f"Value at '{path}' is too short."
                )
            if maximum is not None and len(value) > int(maximum):
                raise CustomerToolArgumentError(
                    f"Value at '{path}' is too long."
                )
            if pattern and re.fullmatch(str(pattern), value) is None:
                raise CustomerToolArgumentError(
                    f"Value at '{path}' has an invalid format."
                )
            if str(pattern) == r"^\d{4}-\d{2}-\d{2}$":
                try:
                    date.fromisoformat(value)
                except ValueError as exc:
                    raise CustomerToolArgumentError(
                        f"Value at '{path}' is not a valid calendar date."
                    ) from exc
            return

        if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
            minimum = schema.get("minimum")
            maximum = schema.get("maximum")
            numeric = Decimal(str(value))
            if minimum is not None and numeric < Decimal(str(minimum)):
                raise CustomerToolArgumentError(
                    f"Value at '{path}' is below the minimum."
                )
            if maximum is not None and numeric > Decimal(str(maximum)):
                raise CustomerToolArgumentError(
                    f"Value at '{path}' exceeds the maximum."
                )

    @staticmethod
    def _matches_json_type(value: Any, type_name: str) -> bool:
        if type_name == "null":
            return value is None
        if type_name == "object":
            return isinstance(value, Mapping)
        if type_name == "array":
            return isinstance(value, list)
        if type_name == "string":
            return isinstance(value, str)
        if type_name == "integer":
            return isinstance(value, int) and not isinstance(value, bool)
        if type_name == "number":
            return (
                isinstance(value, (int, float, Decimal))
                and not isinstance(value, bool)
            )
        if type_name == "boolean":
            return isinstance(value, bool)
        return False

    def _normalize_result(self, *, tool_name: str, value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerToolResultError(
                f"Customer tool '{tool_name}' must return an object."
            )
        sanitized = self._sanitize_value(dict(value))
        if not isinstance(sanitized, dict):
            raise CustomerToolResultError(
                f"Customer tool '{tool_name}' returned an invalid object."
            )
        sanitized.setdefault("ok", True)
        self._enforce_payload_size(
            sanitized,
            maximum=self.max_result_bytes,
            label="result",
        )
        return sanitized

    def _public_error_result(self, exc: CustomerToolPublicError) -> Mapping[str, Any]:
        result: dict[str, Any] = {
            "ok": False,
            "error": {
                "code": self._safe_error_code(exc.code),
                "message": str(exc.message)[:500],
            },
        }
        if exc.details:
            details = self._sanitize_value(exc.details)
            if isinstance(details, Mapping):
                result["error"]["details"] = dict(details)
        self._enforce_payload_size(
            result,
            maximum=self.max_result_bytes,
            label="result",
        )
        return result

    def _sanitize_value(self, value: Any, *, depth: int = 0) -> Any:
        if depth > 12:
            raise CustomerToolResultError("Customer tool result is too deeply nested.")
        if value is None or isinstance(value, (str, int, float, bool)):
            return value
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, (date,)):
            return value.isoformat()
        if isinstance(value, Mapping):
            result: dict[str, Any] = {}
            for key, child in value.items():
                safe_key = str(key)
                if self._is_sensitive_key(safe_key):
                    continue
                result[safe_key] = self._sanitize_value(child, depth=depth + 1)
            return result
        if isinstance(value, (list, tuple, set)):
            return [
                self._sanitize_value(item, depth=depth + 1)
                for item in value
            ]
        return str(value)

    @staticmethod
    def _is_sensitive_key(key: str) -> bool:
        normalized = str(key or "").strip().lower()
        return any(fragment in normalized for fragment in SENSITIVE_KEY_FRAGMENTS)

    @staticmethod
    def _safe_error_code(value: str) -> str:
        normalized = re.sub(r"[^a-z0-9_\-]", "_", str(value or "").lower())
        return normalized[:80] or "tool_error"

    def _enforce_payload_size(
        self,
        value: Any,
        *,
        maximum: int,
        label: str,
    ) -> None:
        try:
            payload = json.dumps(
                value,
                ensure_ascii=False,
                separators=(",", ":"),
                default=str,
            ).encode("utf-8")
        except (TypeError, ValueError) as exc:
            raise CustomerToolResultError(
                f"Customer tool {label} is not JSON serializable."
            ) from exc
        if len(payload) > maximum:
            error_type = (
                CustomerToolArgumentError
                if label == "arguments"
                else CustomerToolResultError
            )
            raise error_type(
                f"Customer tool {label} exceeds the permitted size."
            )

    def _append_record(
        self,
        *,
        registration: CustomerToolRegistration,
        idempotency_key: str,
        succeeded: bool,
    ) -> None:
        self._records.append(
            CustomerToolExecutionRecord(
                tool_name=registration.name,
                access=registration.access,
                organisation_id=self._identity(self.organisation),
                conversation_id=self._identity(self.conversation),
                idempotency_key=idempotency_key,
                succeeded=succeeded,
            )
        )

    @staticmethod
    def _identity(value: Any) -> Any:
        return getattr(value, "pk", None) or getattr(value, "id", None)

    @classmethod
    def _same_identity(cls, first: Any, second: Any) -> bool:
        if first is second:
            return True
        first_id = cls._identity(first)
        second_id = cls._identity(second)
        return (
            first_id is not None
            and second_id is not None
            and str(first_id) == str(second_id)
            and first.__class__ is second.__class__
        )

    @staticmethod
    def _positive_limit(value: Any, name: str) -> int:
        try:
            resolved = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerToolContextError(f"{name} must be an integer.") from exc
        if resolved < 1:
            raise CustomerToolContextError(f"{name} must be greater than zero.")
        return resolved


CustomerToolExecutor = BoundCustomerToolExecutor


__all__ = [
    "BoundCustomerToolExecutor",
    "CustomerToolArgumentError",
    "CustomerToolContextError",
    "CustomerToolExecutionError",
    "CustomerToolExecutionRecord",
    "CustomerToolExecutor",
    "CustomerToolPermissionError",
    "CustomerToolPublicError",
    "CustomerToolResultError",
    "DEFAULT_MAX_ARGUMENT_BYTES",
    "DEFAULT_MAX_RESULT_BYTES",
    "SENSITIVE_KEY_FRAGMENTS",
]
