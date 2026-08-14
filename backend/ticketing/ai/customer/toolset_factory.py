"""Composition of the approved customer-agent tools.

This module joins the independent tool handlers into one complete allowlisted
toolset. Concrete repositories remain application-owned adapters so existing
catalogue, availability, pickup, pricing, promotion, cart, and handoff rules
stay authoritative. No model output can select an implementation or import a
dotted path.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

from ticketing.ai.customer.availability_tools import (
    build_availability_tool_handlers,
)
from ticketing.ai.customer.cart_tools import build_cart_tool_handlers
from ticketing.ai.customer.factory import CustomerAIToolset
from ticketing.ai.customer.handoff_service import build_handoff_tool_handlers
from ticketing.ai.customer.itinerary_tools import build_itinerary_tool_handlers
from ticketing.ai.customer.pickup_tools import build_pickup_tool_handlers
from ticketing.ai.customer.product_tools import build_product_tool_handlers
from ticketing.ai.customer.promotion_tools import build_promotion_tool_handlers
from ticketing.ai.customer.schemas import get_customer_tool_schema_map


class CustomerAIToolsetConfigurationError(RuntimeError):
    """Raised when trusted tool dependencies are missing or inconsistent."""


@dataclass(frozen=True)
class CustomerAIToolDependencies:
    """Trusted adapters required to assemble the complete customer toolset."""

    product_repository: Any
    availability_repository: Any
    pickup_repository: Any
    itinerary_repository: Any
    promotion_repository: Any
    cart_repository: Any
    handoff_repository: Any
    handoff_notifier: Any
    staff_access_policy: Any
    enabled_predicates: Mapping[str, Any] = field(default_factory=dict)
    allow_write_tools: bool = True
    clock: Any = None


class CustomerAIToolDependenciesFactory(Protocol):
    def build_customer_tool_dependencies(
        self,
        *,
        organisation: Any,
        conversation: Any,
    ) -> CustomerAIToolDependencies:
        """Return application-owned, tenant-aware repository adapters."""


class DjangoCustomerAIToolsetFactory:
    """Build a complete frozen-registry-compatible customer toolset."""

    DEPENDENCIES_SETTING = "CUSTOMER_AI_TOOL_DEPENDENCIES_FACTORY"

    def build_customer_toolset(
        self,
        *,
        organisation: Any,
        conversation: Any,
    ) -> CustomerAIToolset:
        self._validate_context(
            organisation=organisation,
            conversation=conversation,
        )
        dependencies_factory = self._load_dependencies_factory()
        dependencies = dependencies_factory.build_customer_tool_dependencies(
            organisation=organisation,
            conversation=conversation,
        )
        if not isinstance(dependencies, CustomerAIToolDependencies):
            raise CustomerAIToolsetConfigurationError(
                "The dependency factory returned an invalid dependency bundle."
            )

        self._validate_dependencies(dependencies)
        clock = dependencies.clock
        handlers: dict[str, Any] = {}

        self._merge_handlers(
            handlers,
            build_product_tool_handlers(
                repository=dependencies.product_repository,
            ),
        )
        self._merge_handlers(
            handlers,
            build_availability_tool_handlers(
                repository=dependencies.availability_repository,
                clock=clock,
            ),
        )
        self._merge_handlers(
            handlers,
            build_pickup_tool_handlers(
                repository=dependencies.pickup_repository,
                clock=clock,
            ),
        )
        self._merge_handlers(
            handlers,
            build_itinerary_tool_handlers(
                repository=dependencies.itinerary_repository,
                clock=clock,
            ),
        )
        self._merge_handlers(
            handlers,
            build_promotion_tool_handlers(
                repository=dependencies.promotion_repository,
                clock=clock,
            ),
        )
        self._merge_handlers(
            handlers,
            build_cart_tool_handlers(
                repository=dependencies.cart_repository,
                clock=clock,
            ),
        )
        self._merge_handlers(
            handlers,
            build_handoff_tool_handlers(
                repository=dependencies.handoff_repository,
                notifier=dependencies.handoff_notifier,
                staff_access_policy=dependencies.staff_access_policy,
                clock=clock,
            ),
        )

        self._validate_complete_handler_set(handlers)
        predicates = dict(dependencies.enabled_predicates)
        self._validate_predicates(predicates, handlers=handlers)

        return CustomerAIToolset(
            handlers=handlers,
            enabled_predicates=predicates,
            allow_write_tools=bool(dependencies.allow_write_tools),
        )

    @classmethod
    def _load_dependencies_factory(cls) -> CustomerAIToolDependenciesFactory:
        dotted_path = str(
            getattr(settings, cls.DEPENDENCIES_SETTING, "") or ""
        ).strip()
        if not dotted_path:
            raise CustomerAIToolsetConfigurationError(
                f"{cls.DEPENDENCIES_SETTING} is not configured."
            )

        try:
            imported = import_string(dotted_path)
            component = imported() if isinstance(imported, type) else imported
        except Exception as exc:
            raise CustomerAIToolsetConfigurationError(
                f"{cls.DEPENDENCIES_SETTING} could not be loaded."
            ) from exc

        if not callable(
            getattr(component, "build_customer_tool_dependencies", None)
        ):
            raise CustomerAIToolsetConfigurationError(
                f"{cls.DEPENDENCIES_SETTING} must provide "
                "build_customer_tool_dependencies()."
            )
        return component

    @staticmethod
    def _validate_context(*, organisation: Any, conversation: Any) -> None:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerAIToolsetConfigurationError(
                "An organisation is required to build customer tools."
            )
        if getattr(conversation, "organisation_id", None) != organisation_id:
            raise CustomerAIToolsetConfigurationError(
                "The customer conversation belongs to another organisation."
            )

    @staticmethod
    def _validate_dependencies(value: CustomerAIToolDependencies) -> None:
        required = (
            "product_repository",
            "availability_repository",
            "pickup_repository",
            "itinerary_repository",
            "promotion_repository",
            "cart_repository",
            "handoff_repository",
            "handoff_notifier",
            "staff_access_policy",
        )
        missing = [name for name in required if getattr(value, name, None) is None]
        if missing:
            raise CustomerAIToolsetConfigurationError(
                "Customer tool dependencies are incomplete: "
                + ", ".join(missing)
                + "."
            )
        if not isinstance(value.enabled_predicates, Mapping):
            raise CustomerAIToolsetConfigurationError(
                "Customer tool enabled predicates must be a mapping."
            )
        if value.clock is not None and not callable(value.clock):
            raise CustomerAIToolsetConfigurationError(
                "The customer tool clock must be callable."
            )

    @staticmethod
    def _merge_handlers(
        destination: dict[str, Any],
        incoming: Mapping[str, Any],
    ) -> None:
        if not isinstance(incoming, Mapping) or not incoming:
            raise CustomerAIToolsetConfigurationError(
                "A customer tool builder returned no handlers."
            )
        duplicates = set(destination).intersection(incoming)
        if duplicates:
            raise CustomerAIToolsetConfigurationError(
                "Duplicate customer tool handlers: "
                + ", ".join(sorted(duplicates))
                + "."
            )
        for name, handler in incoming.items():
            if not callable(handler):
                raise CustomerAIToolsetConfigurationError(
                    f"Customer tool '{name}' has a non-callable handler."
                )
            destination[str(name)] = handler

    @staticmethod
    def _validate_complete_handler_set(handlers: Mapping[str, Any]) -> None:
        approved = frozenset(get_customer_tool_schema_map())
        received = frozenset(handlers)
        if received != approved:
            missing = sorted(approved - received)
            extra = sorted(received - approved)
            details: list[str] = []
            if missing:
                details.append("missing=" + ",".join(missing))
            if extra:
                details.append("extra=" + ",".join(extra))
            raise CustomerAIToolsetConfigurationError(
                "The customer toolset does not match the approved schemas ("
                + "; ".join(details)
                + ")."
            )

    @staticmethod
    def _validate_predicates(
        predicates: Mapping[str, Any],
        *,
        handlers: Mapping[str, Any],
    ) -> None:
        unknown = set(predicates) - set(handlers)
        if unknown:
            raise CustomerAIToolsetConfigurationError(
                "Predicates reference unknown customer tools: "
                + ", ".join(sorted(unknown))
                + "."
            )
        invalid = [name for name, value in predicates.items() if not callable(value)]
        if invalid:
            raise CustomerAIToolsetConfigurationError(
                "Customer tool predicates must be callable: "
                + ", ".join(sorted(invalid))
                + "."
            )


__all__ = [
    "CustomerAIToolDependencies",
    "CustomerAIToolDependenciesFactory",
    "CustomerAIToolsetConfigurationError",
    "DjangoCustomerAIToolsetFactory",
]
