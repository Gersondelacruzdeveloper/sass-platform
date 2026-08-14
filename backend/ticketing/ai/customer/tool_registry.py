"""Allowlisted tool registry for the customer WhatsApp sales agent.

The registry binds strict schemas to application-owned handlers. It never
discovers handlers dynamically from model output, dotted paths, or user input.
Only names declared in ``schemas.py`` can be registered or resolved.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from types import MappingProxyType
from typing import Any, Callable, Mapping, Protocol, Sequence

from .schemas import (
    FORBIDDEN_CUSTOMER_TOOL_NAMES,
    get_customer_tool_schema_map,
    validate_customer_tool_schemas,
)


READ_ACCESS = "read"
WRITE_ACCESS = "write"
VALID_ACCESS_LEVELS = frozenset({READ_ACCESS, WRITE_ACCESS})


class CustomerToolRegistryError(RuntimeError):
    """Base exception for customer tool-registry failures."""


class CustomerToolRegistrationError(CustomerToolRegistryError):
    """Raised when a tool cannot be registered safely."""


class CustomerToolNotRegisteredError(CustomerToolRegistryError):
    """Raised when an unregistered tool name is requested."""


class CustomerToolRegistryFrozenError(CustomerToolRegistryError):
    """Raised when registration changes are attempted after freezing."""


class CustomerToolHandler(Protocol):
    """Required callable signature for every customer tool handler."""

    def __call__(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Execute an organisation-scoped operation and return safe JSON data."""


class CustomerToolEnabledPredicate(Protocol):
    """Optional feature/configuration check for exposing a registered tool."""

    def __call__(
        self,
        *,
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> bool:
        """Return true when the tool may be exposed in this context."""


@dataclass(frozen=True)
class CustomerToolRegistration:
    """Immutable binding between a strict schema and an application handler."""

    name: str
    schema: Mapping[str, Any]
    handler: CustomerToolHandler
    access: str = READ_ACCESS
    enabled_when: CustomerToolEnabledPredicate | None = None

    @property
    def is_write(self) -> bool:
        return self.access == WRITE_ACCESS

    def is_enabled(
        self,
        *,
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> bool:
        if self.enabled_when is None:
            return True
        return bool(
            self.enabled_when(
                organisation=organisation,
                conversation=conversation,
                metadata=metadata,
            )
        )


DEFAULT_TOOL_ACCESS = MappingProxyType(
    {
        "search_products": READ_ACCESS,
        "get_product_details": READ_ACCESS,
        "check_product_availability": READ_ACCESS,
        "find_available_alternatives": READ_ACCESS,
        "search_pickup_locations": READ_ACCESS,
        "resolve_pickup_schedule": READ_ACCESS,
        "validate_itinerary": READ_ACCESS,
        "evaluate_itinerary_promotions": READ_ACCESS,
        "save_itinerary_cart": WRITE_ACCESS,
        "request_human_handoff": WRITE_ACCESS,
    }
)


class CustomerToolRegistry:
    """Explicit, optionally frozen registry of permitted customer tools."""

    def __init__(
        self,
        *,
        schema_map: Mapping[str, Mapping[str, Any]] | None = None,
    ) -> None:
        resolved_schema_map = (
            dict(schema_map)
            if schema_map is not None
            else get_customer_tool_schema_map()
        )
        validate_customer_tool_schemas(tuple(resolved_schema_map.values()))

        self._schemas: dict[str, dict[str, Any]] = {
            str(name): deepcopy(dict(schema))
            for name, schema in resolved_schema_map.items()
        }
        self._registrations: dict[str, CustomerToolRegistration] = {}
        self._frozen = False

    @property
    def is_frozen(self) -> bool:
        return self._frozen

    @property
    def allowed_names(self) -> frozenset[str]:
        return frozenset(self._schemas.keys())

    @property
    def registered_names(self) -> frozenset[str]:
        return frozenset(self._registrations.keys())

    @property
    def missing_names(self) -> frozenset[str]:
        return self.allowed_names - self.registered_names

    def register(
        self,
        *,
        name: str,
        handler: CustomerToolHandler,
        access: str | None = None,
        enabled_when: CustomerToolEnabledPredicate | None = None,
    ) -> CustomerToolRegistration:
        """Register one known schema with an explicit application handler."""
        if self._frozen:
            raise CustomerToolRegistryFrozenError(
                "The customer tool registry is frozen."
            )

        normalized_name = str(name or "").strip()
        if not normalized_name:
            raise CustomerToolRegistrationError(
                "A customer tool name is required."
            )
        if normalized_name in FORBIDDEN_CUSTOMER_TOOL_NAMES:
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' is forbidden."
            )
        if normalized_name not in self._schemas:
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' has no approved schema."
            )
        if normalized_name in self._registrations:
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' is already registered."
            )
        if not callable(handler):
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' handler must be callable."
            )
        if enabled_when is not None and not callable(enabled_when):
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' enabled predicate must be callable."
            )

        resolved_access = str(
            access or DEFAULT_TOOL_ACCESS.get(normalized_name, READ_ACCESS)
        ).strip().lower()
        if resolved_access not in VALID_ACCESS_LEVELS:
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' has invalid access '{resolved_access}'."
            )

        # Write access cannot be weakened accidentally for known state-changing
        # tools. Additional write classification is allowed for future schemas.
        expected_access = DEFAULT_TOOL_ACCESS.get(normalized_name, READ_ACCESS)
        if expected_access == WRITE_ACCESS and resolved_access != WRITE_ACCESS:
            raise CustomerToolRegistrationError(
                f"Customer tool '{normalized_name}' must use write access."
            )

        registration = CustomerToolRegistration(
            name=normalized_name,
            schema=deepcopy(self._schemas[normalized_name]),
            handler=handler,
            access=resolved_access,
            enabled_when=enabled_when,
        )
        self._registrations[normalized_name] = registration
        return registration

    def unregister(self, name: str) -> None:
        """Remove a registration before the registry is frozen."""
        if self._frozen:
            raise CustomerToolRegistryFrozenError(
                "The customer tool registry is frozen."
            )
        normalized_name = str(name or "").strip()
        if normalized_name not in self._registrations:
            raise CustomerToolNotRegisteredError(
                f"Customer tool '{normalized_name}' is not registered."
            )
        del self._registrations[normalized_name]

    def freeze(self, *, require_complete: bool = True) -> "CustomerToolRegistry":
        """Prevent runtime mutation after validating registry completeness."""
        if require_complete and self.missing_names:
            missing = ", ".join(sorted(self.missing_names))
            raise CustomerToolRegistrationError(
                f"Customer tool registry is incomplete. Missing: {missing}."
            )
        self._frozen = True
        return self

    def resolve(self, name: str) -> CustomerToolRegistration:
        """Resolve only an explicitly registered tool name."""
        normalized_name = str(name or "").strip()
        registration = self._registrations.get(normalized_name)
        if registration is None:
            raise CustomerToolNotRegisteredError(
                f"Customer tool '{normalized_name or 'unknown'}' is not registered."
            )
        return registration

    def definitions(
        self,
        *,
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any] | None = None,
    ) -> list[dict[str, Any]]:
        """Return strict schemas enabled for one trusted execution context."""
        if organisation is None:
            raise CustomerToolRegistryError(
                "An organisation is required to expose customer tools."
            )
        if conversation is None:
            raise CustomerToolRegistryError(
                "A conversation is required to expose customer tools."
            )

        safe_metadata = dict(metadata or {})
        definitions: list[dict[str, Any]] = []
        for name in self._schemas:
            registration = self._registrations.get(name)
            if registration is None:
                continue
            if registration.is_enabled(
                organisation=organisation,
                conversation=conversation,
                metadata=safe_metadata,
            ):
                definitions.append(deepcopy(dict(registration.schema)))
        return definitions

    def registrations(
        self,
    ) -> tuple[CustomerToolRegistration, ...]:
        """Return registrations in approved schema order."""
        return tuple(
            self._registrations[name]
            for name in self._schemas
            if name in self._registrations
        )


def build_customer_tool_registry(
    *,
    handlers: Mapping[str, CustomerToolHandler],
    enabled_predicates: Mapping[
        str,
        CustomerToolEnabledPredicate,
    ] | None = None,
    access_overrides: Mapping[str, str] | None = None,
    require_complete: bool = True,
) -> CustomerToolRegistry:
    """Build and freeze a registry from explicit application-owned mappings."""
    registry = CustomerToolRegistry()
    predicates = dict(enabled_predicates or {})
    overrides = dict(access_overrides or {})

    unknown_handlers = set(handlers) - registry.allowed_names
    unknown_predicates = set(predicates) - registry.allowed_names
    unknown_overrides = set(overrides) - registry.allowed_names
    unknown = unknown_handlers | unknown_predicates | unknown_overrides
    if unknown:
        raise CustomerToolRegistrationError(
            "Unknown customer tool configuration: "
            + ", ".join(sorted(unknown))
            + "."
        )

    for name in registry._schemas:
        handler = handlers.get(name)
        if handler is None:
            continue
        registry.register(
            name=name,
            handler=handler,
            access=overrides.get(name),
            enabled_when=predicates.get(name),
        )

    return registry.freeze(require_complete=require_complete)


__all__ = [
    "CustomerToolEnabledPredicate",
    "CustomerToolHandler",
    "CustomerToolNotRegisteredError",
    "CustomerToolRegistration",
    "CustomerToolRegistrationError",
    "CustomerToolRegistry",
    "CustomerToolRegistryError",
    "CustomerToolRegistryFrozenError",
    "DEFAULT_TOOL_ACCESS",
    "READ_ACCESS",
    "VALID_ACCESS_LEVELS",
    "WRITE_ACCESS",
    "build_customer_tool_registry",
]
