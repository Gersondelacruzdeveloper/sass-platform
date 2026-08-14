"""Strict function-tool schemas for the customer WhatsApp sales agent.

These schemas define what the model may ask the Django application to do. They
do not execute operations. The future tool registry maps each permitted name to
an organisation-scoped handler.

There are intentionally no tools for creating/confirming bookings, recording
payments, changing prices, overriding discounts, or changing seller data.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Mapping, Sequence


class CustomerToolSchemaError(ValueError):
    """Raised when a customer-agent function schema is structurally invalid."""


LANGUAGE_SCHEMA: dict[str, Any] = {
    "type": ["string", "null"],
    "enum": ["en", "es", "fr", "pt", "de", None],
    "description": "Preferred response/content language, or null when unknown.",
}

DATE_SCHEMA: dict[str, Any] = {
    "type": ["string", "null"],
    "pattern": r"^\d{4}-\d{2}-\d{2}$",
    "description": "Calendar date in YYYY-MM-DD format, or null when unknown.",
}

PASSENGER_COUNT_SCHEMA: dict[str, Any] = {
    "type": "integer",
    "minimum": 0,
    "maximum": 100,
}

POSITIVE_PRODUCT_ID_SCHEMA: dict[str, Any] = {
    "type": "integer",
    "minimum": 1,
}

NULLABLE_POSITIVE_ID_SCHEMA: dict[str, Any] = {
    "type": ["integer", "null"],
    "minimum": 1,
}


def _function_tool(
    *,
    name: str,
    description: str,
    properties: Mapping[str, Mapping[str, Any]],
) -> dict[str, Any]:
    """Build an OpenAI Responses API strict function-tool definition.

    Strict function schemas require every declared property to appear in the
    ``required`` array. Conceptually optional values therefore use nullable
    types and are still included by the model.
    """
    return {
        "type": "function",
        "name": name,
        "description": description,
        "strict": True,
        "parameters": {
            "type": "object",
            "properties": deepcopy(dict(properties)),
            "required": list(properties.keys()),
            "additionalProperties": False,
        },
    }


ITINERARY_ITEM_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "product_id": deepcopy(POSITIVE_PRODUCT_ID_SCHEMA),
        "service_date": {
            "type": "string",
            "pattern": r"^\d{4}-\d{2}-\d{2}$",
        },
        "adults": deepcopy(PASSENGER_COUNT_SCHEMA),
        "children": deepcopy(PASSENGER_COUNT_SCHEMA),
        "infants": deepcopy(PASSENGER_COUNT_SCHEMA),
        "package_id": deepcopy(NULLABLE_POSITIVE_ID_SCHEMA),
        "event_ticket_type_id": deepcopy(NULLABLE_POSITIVE_ID_SCHEMA),
        "selected_external_option_id": {
            "type": ["string", "null"],
            "maxLength": 255,
        },
        "pickup_location_id": deepcopy(NULLABLE_POSITIVE_ID_SCHEMA),
    },
    "required": [
        "product_id",
        "service_date",
        "adults",
        "children",
        "infants",
        "package_id",
        "event_ticket_type_id",
        "selected_external_option_id",
        "pickup_location_id",
    ],
    "additionalProperties": False,
}


SEARCH_PRODUCTS_TOOL = _function_tool(
    name="search_products",
    description=(
        "Search this organisation's active public excursion catalogue. Use "
        "before recommending a named product or when the customer describes "
        "an interest rather than a specific product."
    ),
    properties={
        "query": {
            "type": "string",
            "maxLength": 200,
            "description": "Customer's product name, activity, or interest.",
        },
        "product_type": {
            "type": ["string", "null"],
            "enum": [
                "excursion",
                "transfer",
                "ticket",
                "event",
                "nightlife",
                "package",
                None,
            ],
        },
        "interests": {
            "type": "array",
            "items": {"type": "string", "maxLength": 80},
            "maxItems": 10,
        },
        "travel_start_date": deepcopy(DATE_SCHEMA),
        "travel_end_date": deepcopy(DATE_SCHEMA),
        "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10,
        },
        "language": deepcopy(LANGUAGE_SCHEMA),
    },
)


GET_PRODUCT_DETAILS_TOOL = _function_tool(
    name="get_product_details",
    description=(
        "Load current customer-facing details for one active public product, "
        "including descriptions, duration, inclusions, exclusions, policies, "
        "pickup requirements, payment choices, and age restrictions."
    ),
    properties={
        "product_id": deepcopy(POSITIVE_PRODUCT_ID_SCHEMA),
        "language": deepcopy(LANGUAGE_SCHEMA),
    },
)


CHECK_AVAILABILITY_TOOL = _function_tool(
    name="check_product_availability",
    description=(
        "Check authoritative local or external availability for an exact "
        "product, service date, passenger counts, and selected option."
    ),
    properties={
        "product_id": deepcopy(POSITIVE_PRODUCT_ID_SCHEMA),
        "service_date": {
            "type": "string",
            "pattern": r"^\d{4}-\d{2}-\d{2}$",
        },
        "adults": deepcopy(PASSENGER_COUNT_SCHEMA),
        "children": deepcopy(PASSENGER_COUNT_SCHEMA),
        "infants": deepcopy(PASSENGER_COUNT_SCHEMA),
        "selected_external_option_id": {
            "type": ["string", "null"],
            "maxLength": 255,
        },
    },
)


FIND_ALTERNATIVES_TOOL = _function_tool(
    name="find_available_alternatives",
    description=(
        "Find real alternative dates or related active products after the "
        "customer's requested product/date is unavailable."
    ),
    properties={
        "requested_product_id": deepcopy(NULLABLE_POSITIVE_ID_SCHEMA),
        "requested_date": deepcopy(DATE_SCHEMA),
        "travel_start_date": deepcopy(DATE_SCHEMA),
        "travel_end_date": deepcopy(DATE_SCHEMA),
        "query": {
            "type": "string",
            "maxLength": 200,
        },
        "adults": deepcopy(PASSENGER_COUNT_SCHEMA),
        "children": deepcopy(PASSENGER_COUNT_SCHEMA),
        "infants": deepcopy(PASSENGER_COUNT_SCHEMA),
        "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 6,
        },
        "language": deepcopy(LANGUAGE_SCHEMA),
    },
)


SEARCH_PICKUP_LOCATIONS_TOOL = _function_tool(
    name="search_pickup_locations",
    description=(
        "Search this organisation's active pickup locations by the customer's "
        "hotel, resort, villa, or area. Never guess when multiple locations match."
    ),
    properties={
        "query": {
            "type": "string",
            "minLength": 2,
            "maxLength": 200,
        },
        "limit": {
            "type": "integer",
            "minimum": 1,
            "maximum": 10,
        },
    },
)


RESOLVE_PICKUP_SCHEDULE_TOOL = _function_tool(
    name="resolve_pickup_schedule",
    description=(
        "Resolve the exact configured pickup schedule for one product, pickup "
        "location, and service date."
    ),
    properties={
        "product_id": deepcopy(POSITIVE_PRODUCT_ID_SCHEMA),
        "pickup_location_id": deepcopy(POSITIVE_PRODUCT_ID_SCHEMA),
        "service_date": {
            "type": "string",
            "pattern": r"^\d{4}-\d{2}-\d{2}$",
        },
    },
)


VALIDATE_ITINERARY_TOOL = _function_tool(
    name="validate_itinerary",
    description=(
        "Validate a proposed multi-day itinerary without creating a booking. "
        "Checks tenant ownership, active products, dates, quantities, options, "
        "availability, pickup requirements, conflicts, and current display totals."
    ),
    properties={
        "items": {
            "type": "array",
            "items": deepcopy(ITINERARY_ITEM_SCHEMA),
            "minItems": 1,
            "maxItems": 12,
        },
        "language": deepcopy(LANGUAGE_SCHEMA),
    },
)


EVALUATE_PROMOTIONS_TOOL = _function_tool(
    name="evaluate_itinerary_promotions",
    description=(
        "Evaluate owner-configured active promotion rules for a validated "
        "itinerary. The backend alone chooses eligibility and discount amounts."
    ),
    properties={
        "items": {
            "type": "array",
            "items": deepcopy(ITINERARY_ITEM_SCHEMA),
            "minItems": 1,
            "maxItems": 12,
        },
    },
)


SAVE_CART_SESSION_TOOL = _function_tool(
    name="save_itinerary_cart",
    description=(
        "Create or update a server-side itinerary cart after the customer has "
        "approved the proposed items. This does not create or confirm a booking."
    ),
    properties={
        "cart_token": {
            "type": ["string", "null"],
            "maxLength": 255,
            "description": (
                "Existing active cart token when revising the customer's cart, "
                "otherwise null."
            ),
        },
        "items": {
            "type": "array",
            "items": deepcopy(ITINERARY_ITEM_SCHEMA),
            "minItems": 1,
            "maxItems": 12,
        },
        "language": deepcopy(LANGUAGE_SCHEMA),
        "customer_approved": {
            "type": "boolean",
            "description": (
                "True only when the customer explicitly accepted these items "
                "or explicitly requested the checkout/cart link."
            ),
        },
    },
)


REQUEST_HANDOFF_TOOL = _function_tool(
    name="request_human_handoff",
    description=(
        "Request assistance from the organisation's human team when required "
        "or explicitly requested by the customer."
    ),
    properties={
        "category": {
            "type": "string",
            "enum": [
                "customer_request",
                "complaint",
                "payment_problem",
                "cancellation_or_refund",
                "missing_information",
                "manual_confirmation",
                "safety_or_policy",
                "technical_error",
                "other",
            ],
        },
        "reason": {
            "type": "string",
            "minLength": 3,
            "maxLength": 500,
        },
        "customer_message": {
            "type": ["string", "null"],
            "maxLength": 1_000,
            "description": (
                "Short customer-facing message to accompany the handoff, or "
                "null to use the organisation default."
            ),
        },
    },
)


CUSTOMER_TOOL_SCHEMAS: tuple[dict[str, Any], ...] = (
    SEARCH_PRODUCTS_TOOL,
    GET_PRODUCT_DETAILS_TOOL,
    CHECK_AVAILABILITY_TOOL,
    FIND_ALTERNATIVES_TOOL,
    SEARCH_PICKUP_LOCATIONS_TOOL,
    RESOLVE_PICKUP_SCHEDULE_TOOL,
    VALIDATE_ITINERARY_TOOL,
    EVALUATE_PROMOTIONS_TOOL,
    SAVE_CART_SESSION_TOOL,
    REQUEST_HANDOFF_TOOL,
)


FORBIDDEN_CUSTOMER_TOOL_NAMES = frozenset(
    {
        "create_booking",
        "confirm_booking",
        "cancel_booking",
        "refund_booking",
        "record_payment",
        "mark_booking_paid",
        "set_price",
        "set_discount",
        "override_pickup",
        "change_seller_commission",
    }
)


def get_customer_tool_schemas() -> list[dict[str, Any]]:
    """Return an isolated copy safe for provider-request mutation."""
    return deepcopy(list(CUSTOMER_TOOL_SCHEMAS))


def get_customer_tool_schema_map() -> dict[str, dict[str, Any]]:
    """Return tool definitions keyed by unique function name."""
    return {
        str(schema["name"]): deepcopy(schema)
        for schema in CUSTOMER_TOOL_SCHEMAS
    }


def validate_customer_tool_schemas(
    schemas: Sequence[Mapping[str, Any]] | None = None,
) -> None:
    """Validate strict schema invariants and permitted tool boundaries."""
    resolved = tuple(schemas or CUSTOMER_TOOL_SCHEMAS)
    if not resolved:
        raise CustomerToolSchemaError(
            "At least one customer-agent tool schema is required."
        )

    seen_names: set[str] = set()

    for index, schema in enumerate(resolved):
        if not isinstance(schema, Mapping):
            raise CustomerToolSchemaError(
                f"Customer tool schema at index {index} must be an object."
            )

        if schema.get("type") != "function":
            raise CustomerToolSchemaError(
                f"Customer tool schema at index {index} must use type=function."
            )

        name = str(schema.get("name") or "").strip()
        if not name:
            raise CustomerToolSchemaError(
                f"Customer tool schema at index {index} has no name."
            )
        if name in seen_names:
            raise CustomerToolSchemaError(
                f"Duplicate customer tool schema name: {name}."
            )
        if name in FORBIDDEN_CUSTOMER_TOOL_NAMES:
            raise CustomerToolSchemaError(
                f"Forbidden customer tool schema name: {name}."
            )
        seen_names.add(name)

        if schema.get("strict") is not True:
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' must enable strict mode."
            )

        parameters = schema.get("parameters")
        if not isinstance(parameters, Mapping):
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' must define parameters."
            )
        if parameters.get("type") != "object":
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' parameters must be an object."
            )
        if parameters.get("additionalProperties") is not False:
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' must reject additional properties."
            )

        properties = parameters.get("properties")
        required = parameters.get("required")
        if not isinstance(properties, Mapping):
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' properties must be an object."
            )
        if not isinstance(required, list):
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' required must be a list."
            )
        if set(required) != set(properties.keys()):
            raise CustomerToolSchemaError(
                f"Customer tool '{name}' must require every declared property."
            )

        _validate_nested_objects(
            node=parameters,
            path=f"{name}.parameters",
        )


def _validate_nested_objects(*, node: Any, path: str) -> None:
    """Ensure every nested JSON object rejects undeclared properties."""
    if isinstance(node, Mapping):
        node_type = node.get("type")
        is_object = node_type == "object" or (
            isinstance(node_type, list) and "object" in node_type
        )
        if is_object and node.get("additionalProperties") is not False:
            raise CustomerToolSchemaError(
                f"Nested object '{path}' must reject additional properties."
            )

        for key, value in node.items():
            _validate_nested_objects(node=value, path=f"{path}.{key}")
    elif isinstance(node, list):
        for index, value in enumerate(node):
            _validate_nested_objects(node=value, path=f"{path}[{index}]")


# Fail fast during application import if a future edit weakens the contract.
validate_customer_tool_schemas()


__all__ = [
    "CHECK_AVAILABILITY_TOOL",
    "CUSTOMER_TOOL_SCHEMAS",
    "CustomerToolSchemaError",
    "EVALUATE_PROMOTIONS_TOOL",
    "FIND_ALTERNATIVES_TOOL",
    "FORBIDDEN_CUSTOMER_TOOL_NAMES",
    "GET_PRODUCT_DETAILS_TOOL",
    "ITINERARY_ITEM_SCHEMA",
    "REQUEST_HANDOFF_TOOL",
    "RESOLVE_PICKUP_SCHEDULE_TOOL",
    "SAVE_CART_SESSION_TOOL",
    "SEARCH_PICKUP_LOCATIONS_TOOL",
    "SEARCH_PRODUCTS_TOOL",
    "VALIDATE_ITINERARY_TOOL",
    "get_customer_tool_schema_map",
    "get_customer_tool_schemas",
    "validate_customer_tool_schemas",
]
