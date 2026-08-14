"""Trusted dependency loader for customer-agent tools.

The AI never chooses repository implementations. This factory loads an
application-controlled adapter bundle from Django settings, validates every
required protocol, and returns the exact dependency object consumed by
``DjangoCustomerAIToolsetFactory``.

Concrete Django adapters belong in ``django_tool_adapters.py``. Keeping that
mapping separate lets it reuse the platform's existing business services
without placing ORM or booking logic inside the AI orchestration layer.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from django.conf import settings
from django.utils.module_loading import import_string

from ticketing.ai.customer.toolset_factory import (
    CustomerAIToolDependencies,
    CustomerAIToolsetConfigurationError,
)


DEFAULT_ADAPTER_FACTORY = (
    "ticketing.ai.customer.django_tool_adapters."
    "DjangoCustomerAIDomainAdapterFactory"
)


class CustomerAIDomainAdapterFactory(Protocol):
    """Build the concrete, organisation-aware application adapters."""

    def build_customer_ai_domain_adapters(
        self,
        *,
        organisation: Any,
        conversation: Any,
    ) -> Any:
        """Return a ``CustomerAIDomainAdapters`` or equivalent mapping."""


@dataclass(frozen=True)
class CustomerAIDomainAdapters:
    """Concrete application services required by all approved AI tools."""

    product_repository: Any
    availability_repository: Any
    pickup_repository: Any
    itinerary_repository: Any
    promotion_repository: Any
    cart_repository: Any
    handoff_repository: Any
    handoff_notifier: Any
    staff_access_policy: Any
    enabled_predicates: Mapping[str, Any] | None = None
    allow_write_tools: bool = True
    clock: Any = None


class DjangoCustomerAIToolDependenciesFactory:
    """Validate and expose application adapters to the customer toolset."""

    ADAPTER_FACTORY_SETTING = "CUSTOMER_AI_DOMAIN_ADAPTER_FACTORY"

    _REQUIRED_METHODS: Mapping[str, tuple[str, ...]] = {
        "product_repository": (
            "search_public_products",
            "get_public_product",
        ),
        "availability_repository": (
            "get_public_product",
            "check_availability",
            "find_available_alternatives",
        ),
        "pickup_repository": (
            "search_active_pickup_locations",
            "get_public_product",
            "get_active_pickup_location",
            "resolve_pickup_schedule",
        ),
        "itinerary_repository": ("validate_item",),
        "promotion_repository": ("evaluate_itinerary_promotions",),
        "cart_repository": ("save_validated_cart",),
        "handoff_repository": (
            "request_handoff",
            "assign_handoff",
            "resolve_handoff",
            "cancel_handoff",
        ),
        "handoff_notifier": ("queue_staff_notification",),
        "staff_access_policy": ("can_manage_handoff",),
    }

    def build_customer_tool_dependencies(
        self,
        *,
        organisation: Any,
        conversation: Any,
    ) -> CustomerAIToolDependencies:
        self._validate_context(
            organisation=organisation,
            conversation=conversation,
        )
        adapter_factory = self._load_adapter_factory()

        try:
            raw = adapter_factory.build_customer_ai_domain_adapters(
                organisation=organisation,
                conversation=conversation,
            )
        except CustomerAIToolsetConfigurationError:
            raise
        except Exception as exc:
            raise CustomerAIToolsetConfigurationError(
                "Customer AI domain adapters could not be built."
            ) from exc

        adapters = self._normalise_adapters(raw)
        self._validate_adapters(adapters)

        predicates = dict(adapters.enabled_predicates or {})
        return CustomerAIToolDependencies(
            product_repository=adapters.product_repository,
            availability_repository=adapters.availability_repository,
            pickup_repository=adapters.pickup_repository,
            itinerary_repository=adapters.itinerary_repository,
            promotion_repository=adapters.promotion_repository,
            cart_repository=adapters.cart_repository,
            handoff_repository=adapters.handoff_repository,
            handoff_notifier=adapters.handoff_notifier,
            staff_access_policy=adapters.staff_access_policy,
            enabled_predicates=predicates,
            allow_write_tools=bool(adapters.allow_write_tools),
            clock=adapters.clock,
        )

    @classmethod
    def _load_adapter_factory(cls) -> CustomerAIDomainAdapterFactory:
        dotted_path = str(
            getattr(
                settings,
                cls.ADAPTER_FACTORY_SETTING,
                DEFAULT_ADAPTER_FACTORY,
            )
            or ""
        ).strip()
        if not dotted_path:
            raise CustomerAIToolsetConfigurationError(
                f"{cls.ADAPTER_FACTORY_SETTING} is empty."
            )

        try:
            imported = import_string(dotted_path)
            component = imported() if isinstance(imported, type) else imported
        except Exception as exc:
            raise CustomerAIToolsetConfigurationError(
                f"{cls.ADAPTER_FACTORY_SETTING} could not be loaded."
            ) from exc

        if not callable(
            getattr(component, "build_customer_ai_domain_adapters", None)
        ):
            raise CustomerAIToolsetConfigurationError(
                f"{cls.ADAPTER_FACTORY_SETTING} must provide "
                "build_customer_ai_domain_adapters()."
            )
        return component

    @staticmethod
    def _normalise_adapters(value: Any) -> CustomerAIDomainAdapters:
        if isinstance(value, CustomerAIDomainAdapters):
            return value
        if not isinstance(value, Mapping):
            raise CustomerAIToolsetConfigurationError(
                "The domain adapter factory returned an invalid bundle."
            )

        required = tuple(DjangoCustomerAIToolDependenciesFactory._REQUIRED_METHODS)
        missing = [name for name in required if value.get(name) is None]
        if missing:
            raise CustomerAIToolsetConfigurationError(
                "The domain adapter bundle is incomplete: "
                + ", ".join(missing)
                + "."
            )

        return CustomerAIDomainAdapters(
            product_repository=value["product_repository"],
            availability_repository=value["availability_repository"],
            pickup_repository=value["pickup_repository"],
            itinerary_repository=value["itinerary_repository"],
            promotion_repository=value["promotion_repository"],
            cart_repository=value["cart_repository"],
            handoff_repository=value["handoff_repository"],
            handoff_notifier=value["handoff_notifier"],
            staff_access_policy=value["staff_access_policy"],
            enabled_predicates=value.get("enabled_predicates"),
            allow_write_tools=value.get("allow_write_tools", True) is True,
            clock=value.get("clock"),
        )

    @classmethod
    def _validate_adapters(cls, adapters: CustomerAIDomainAdapters) -> None:
        failures: list[str] = []
        for dependency_name, method_names in cls._REQUIRED_METHODS.items():
            component = getattr(adapters, dependency_name, None)
            if component is None:
                failures.append(f"{dependency_name}=missing")
                continue
            missing_methods = [
                name
                for name in method_names
                if not callable(getattr(component, name, None))
            ]
            if missing_methods:
                failures.append(
                    dependency_name + "=" + ",".join(missing_methods)
                )

        if failures:
            raise CustomerAIToolsetConfigurationError(
                "Customer AI domain adapters do not satisfy their protocols: "
                + "; ".join(failures)
                + "."
            )
        if adapters.enabled_predicates is not None and not isinstance(
            adapters.enabled_predicates,
            Mapping,
        ):
            raise CustomerAIToolsetConfigurationError(
                "Customer AI enabled predicates must be a mapping."
            )
        if adapters.clock is not None and not callable(adapters.clock):
            raise CustomerAIToolsetConfigurationError(
                "The customer AI adapter clock must be callable."
            )

    @staticmethod
    def _validate_context(*, organisation: Any, conversation: Any) -> None:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerAIToolsetConfigurationError(
                "An organisation is required to build tool dependencies."
            )
        if getattr(conversation, "organisation_id", None) != organisation_id:
            raise CustomerAIToolsetConfigurationError(
                "The customer conversation belongs to another organisation."
            )


__all__ = [
    "CustomerAIDomainAdapterFactory",
    "CustomerAIDomainAdapters",
    "DjangoCustomerAIToolDependenciesFactory",
]
