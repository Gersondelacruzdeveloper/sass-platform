"""Read-only pickup-location and schedule tools for the customer AI agent.

The application repository adapts the existing Django pickup models and rules.
This layer validates model arguments, enforces organisation ownership, and
normalizes customer-safe results. It never guesses a hotel, meeting point, or
pickup time and never changes a cart or booking.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from typing import Any, Callable, Mapping, Protocol, Sequence


DEFAULT_SEARCH_LIMIT = 6
MAX_SEARCH_LIMIT = 10
MAX_QUERY_LENGTH = 200
MAX_FUTURE_DAYS = 730
MAX_TEXT_LENGTH = 500
MAX_INSTRUCTIONS_LENGTH = 2_000

STATUS_CONFIRMED = "confirmed"
STATUS_NOT_CONFIGURED = "not_configured"
STATUS_UNAVAILABLE = "unavailable"
STATUS_AMBIGUOUS = "ambiguous"
SUPPORTED_SCHEDULE_STATUSES = frozenset(
    {
        STATUS_CONFIRMED,
        STATUS_NOT_CONFIGURED,
        STATUS_UNAVAILABLE,
        STATUS_AMBIGUOUS,
    }
)


class CustomerPickupToolError(RuntimeError):
    """Base error for customer pickup tools."""


class CustomerPickupInputError(CustomerPickupToolError):
    """Raised when model-supplied pickup arguments are invalid."""


class CustomerPickupNotFoundError(CustomerPickupToolError):
    """Raised when a public product or pickup location cannot be resolved."""


class CustomerPickupRepositoryError(CustomerPickupToolError):
    """Raised when the pickup repository violates its contract."""


@dataclass(frozen=True)
class PickupLocationSearch:
    query: str
    limit: int


@dataclass(frozen=True)
class PickupScheduleRequest:
    product_id: int
    pickup_location_id: int
    service_date: date


class CustomerPickupRepository(Protocol):
    """Organisation-scoped adapter to existing pickup business rules."""

    def search_active_pickup_locations(
        self,
        *,
        organisation: Any,
        product: Any,
        search: PickupLocationSearch,
    ) -> Sequence[Any]:
        """Return active locations configured for the selected product."""

    def get_public_product(
        self,
        *,
        organisation: Any,
        product_id: int,
    ) -> Any | None:
        """Return an active public product belonging to the organisation."""

    def get_active_pickup_location(
        self,
        *,
        organisation: Any,
        pickup_location_id: int,
    ) -> Any | None:
        """Return an active organisation pickup location or ``None``."""

    def resolve_pickup_schedule(
        self,
        *,
        organisation: Any,
        product: Any,
        pickup_location: Any,
        request: PickupScheduleRequest,
    ) -> Mapping[str, Any] | None:
        """Resolve configured schedule; must not estimate or mutate state."""


Clock = Callable[[], datetime]


class CustomerPickupTools:
    """Handlers for pickup search and exact schedule resolution."""

    def __init__(
        self,
        *,
        repository: CustomerPickupRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerPickupRepositoryError(
                "A customer pickup repository is required."
            )
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        return {
            "search_pickup_locations": self.search_pickup_locations,
            "resolve_pickup_schedule": self.resolve_pickup_schedule,
        }

    def search_pickup_locations(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Search configured locations without silently choosing one."""
        self._require_context(organisation, conversation)
        args = self._mapping(arguments)
        product_id = self._positive_int(args.get("product_id"), "product_id")
        product = self._load_product(organisation, product_id)
        query = self._text(args.get("query"), MAX_QUERY_LENGTH)
        if len(query) < 2:
            raise CustomerPickupInputError(
                "Enter at least two characters of the hotel or area name."
            )
        limit = self._positive_int(args.get("limit"), "limit")
        if limit > MAX_SEARCH_LIMIT:
            raise CustomerPickupInputError(
                f"limit cannot exceed {MAX_SEARCH_LIMIT}."
            )
        search = PickupLocationSearch(query=query, limit=limit)

        try:
            raw_locations = self.repository.search_active_pickup_locations(
                organisation=organisation,
                product=product,
                search=search,
            )
        except CustomerPickupToolError:
            raise
        except Exception as exc:
            raise CustomerPickupRepositoryError(
                "Pickup locations could not be searched."
            ) from exc

        if raw_locations is None or isinstance(
            raw_locations, (str, bytes, Mapping)
        ):
            raise CustomerPickupRepositoryError(
                "The pickup repository returned an invalid location collection."
            )

        locations: list[dict[str, Any]] = []
        for location in list(raw_locations)[:limit]:
            self._assert_scope(location, organisation, label="pickup location")
            if not self._is_active(location):
                continue
            locations.append(self._serialize_location(location))

        exact_ids = [
            location["id"]
            for location in locations
            if self._normalized_match(location["name"]) == self._normalized_match(query)
            or any(
                self._normalized_match(alias) == self._normalized_match(query)
                for alias in location["aliases"]
            )
        ]
        requires_customer_selection = len(locations) != 1
        return {
            "ok": True,
            "product_id": product_id,
            "query": query,
            "count": len(locations),
            "locations": locations,
            "exact_match_ids": exact_ids,
            "requires_customer_selection": requires_customer_selection,
            "selected_pickup_location_id": (
                locations[0]["id"] if len(locations) == 1 else None
            ),
            "message": self._search_message(locations),
        }

    def resolve_pickup_schedule(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Resolve the exact configured pickup for product/location/date."""
        self._require_context(organisation, conversation)
        args = self._mapping(arguments)
        request = PickupScheduleRequest(
            product_id=self._positive_int(args.get("product_id"), "product_id"),
            pickup_location_id=self._positive_int(
                args.get("pickup_location_id"), "pickup_location_id"
            ),
            service_date=self._service_date(args.get("service_date")),
        )
        product = self._load_product(organisation, request.product_id)
        location = self._load_location(organisation, request.pickup_location_id)

        try:
            raw_schedule = self.repository.resolve_pickup_schedule(
                organisation=organisation,
                product=product,
                pickup_location=location,
                request=request,
            )
        except CustomerPickupToolError:
            raise
        except Exception as exc:
            raise CustomerPickupRepositoryError(
                "The pickup schedule could not be resolved."
            ) from exc

        if raw_schedule is None:
            schedule = self._empty_schedule(request, product, location)
        else:
            schedule = self._normalize_schedule(
                raw_schedule,
                organisation=organisation,
                request=request,
                product=product,
                location=location,
            )

        return {
            "ok": True,
            "schedule": schedule,
            "pickup_confirmed": schedule["status"] == STATUS_CONFIRMED,
            "estimated": False,
            "booking_updated": False,
            "message": self._schedule_message(schedule["status"]),
        }

    def _load_product(self, organisation: Any, product_id: int) -> Any:
        try:
            product = self.repository.get_public_product(
                organisation=organisation,
                product_id=product_id,
            )
        except Exception as exc:
            raise CustomerPickupRepositoryError(
                "The product could not be loaded for pickup resolution."
            ) from exc
        if product is None:
            raise CustomerPickupNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )
        self._assert_scope(product, organisation, label="product")
        if not self._is_active(product) or not self._is_public(product):
            raise CustomerPickupNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )
        return product

    def _load_location(self, organisation: Any, location_id: int) -> Any:
        try:
            location = self.repository.get_active_pickup_location(
                organisation=organisation,
                pickup_location_id=location_id,
            )
        except Exception as exc:
            raise CustomerPickupRepositoryError(
                "The pickup location could not be loaded."
            ) from exc
        if location is None:
            raise CustomerPickupNotFoundError(
                "That pickup location is not configured for this organisation."
            )
        self._assert_scope(location, organisation, label="pickup location")
        if not self._is_active(location):
            raise CustomerPickupNotFoundError(
                "That pickup location is not active."
            )
        return location

    def _normalize_schedule(
        self,
        raw: Mapping[str, Any],
        *,
        organisation: Any,
        request: PickupScheduleRequest,
        product: Any,
        location: Any,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerPickupRepositoryError(
                "The pickup repository returned an invalid schedule."
            )
        schedule_org_id = raw.get("organisation_id")
        if schedule_org_id is not None and str(schedule_org_id) != str(
            self._identity(organisation)
        ):
            raise CustomerPickupRepositoryError(
                "The pickup repository returned a cross-organisation schedule."
            )
        self._assert_optional_match(raw, "product_id", request.product_id)
        self._assert_optional_match(
            raw, "pickup_location_id", request.pickup_location_id
        )
        returned_date = self._nullable_date(raw.get("service_date"))
        if returned_date is not None and returned_date != request.service_date:
            raise CustomerPickupRepositoryError(
                "The pickup schedule belongs to a different service date."
            )

        status = str(raw.get("status") or STATUS_NOT_CONFIGURED).strip().lower()
        if status not in SUPPORTED_SCHEDULE_STATUSES:
            raise CustomerPickupRepositoryError(
                "The pickup repository returned an unsupported schedule status."
            )
        pickup_time = self._time(raw.get("pickup_time"))
        if status == STATUS_CONFIRMED and pickup_time is None:
            raise CustomerPickupRepositoryError(
                "A confirmed pickup schedule must include an exact pickup time."
            )

        return {
            "product_id": request.product_id,
            "product_name": self._text(self._value(product, "name"), MAX_TEXT_LENGTH),
            "pickup_location_id": request.pickup_location_id,
            "pickup_location_name": self._text(
                self._value(location, "name"), MAX_TEXT_LENGTH
            ),
            "service_date": request.service_date.isoformat(),
            "status": status,
            "pickup_time": pickup_time,
            "timezone": self._timezone(raw.get("timezone")),
            "meeting_point": self._text(
                raw.get("meeting_point"), MAX_TEXT_LENGTH
            ),
            "instructions": self._text(
                raw.get("instructions"), MAX_INSTRUCTIONS_LENGTH
            ),
            "contact_phone": self._phone(raw.get("contact_phone")),
            "source": self._source(raw.get("source")),
            "schedule_id": self._nullable_positive_int(
                raw.get("schedule_id"), "schedule_id"
            ),
            "estimated": False,
        }

    def _empty_schedule(
        self,
        request: PickupScheduleRequest,
        product: Any,
        location: Any,
    ) -> dict[str, Any]:
        return {
            "product_id": request.product_id,
            "product_name": self._text(self._value(product, "name"), MAX_TEXT_LENGTH),
            "pickup_location_id": request.pickup_location_id,
            "pickup_location_name": self._text(
                self._value(location, "name"), MAX_TEXT_LENGTH
            ),
            "service_date": request.service_date.isoformat(),
            "status": STATUS_NOT_CONFIGURED,
            "pickup_time": None,
            "timezone": None,
            "meeting_point": "",
            "instructions": "",
            "contact_phone": None,
            "source": "local",
            "schedule_id": None,
            "estimated": False,
        }

    def _serialize_location(self, location: Any) -> dict[str, Any]:
        location_id = self._positive_int(
            self._value(location, "id", "pk"), "pickup_location.id"
        )
        name = self._text(self._value(location, "name"), MAX_TEXT_LENGTH)
        if not name:
            raise CustomerPickupRepositoryError(
                f"Pickup location {location_id} has no name."
            )
        return {
            "id": location_id,
            "name": name,
            "area": self._text(self._value(location, "area"), MAX_TEXT_LENGTH),
            "address": self._text(
                self._value(location, "address"), MAX_TEXT_LENGTH
            ),
            "aliases": self._aliases(self._value(location, "aliases", default=[])),
        }

    def _assert_scope(self, value: Any, organisation: Any, *, label: str) -> None:
        expected = self._identity(organisation)
        actual = self._value(value, "organisation_id")
        if actual is None:
            actual = self._identity(self._value(value, "organisation"))
        if expected is None or actual is None or str(expected) != str(actual):
            raise CustomerPickupRepositoryError(
                f"The pickup repository returned a cross-organisation {label}."
            )

    @staticmethod
    def _value(source: Any, *names: str, default: Any = None) -> Any:
        for name in names:
            if isinstance(source, Mapping) and name in source:
                return source[name]
            if source is not None and hasattr(source, name):
                return getattr(source, name)
        return default

    @staticmethod
    def _identity(value: Any) -> Any:
        if isinstance(value, Mapping):
            return value.get("id", value.get("pk"))
        return getattr(value, "id", getattr(value, "pk", None)) if value else None

    def _is_active(self, value: Any) -> bool:
        return bool(self._value(value, "is_active", "active", default=False))

    def _is_public(self, value: Any) -> bool:
        return bool(
            self._value(
                value, "is_public", "published", "is_published", default=False
            )
        )

    def _service_date(self, value: Any) -> date:
        parsed = self._nullable_date(value)
        if parsed is None:
            raise CustomerPickupInputError(
                "A service date in YYYY-MM-DD format is required."
            )
        today = self._today()
        if parsed < today:
            raise CustomerPickupInputError("The service date is in the past.")
        if parsed > today + timedelta(days=MAX_FUTURE_DAYS):
            raise CustomerPickupInputError("The service date is too far ahead.")
        return parsed

    def _today(self) -> date:
        current = self.clock()
        if not isinstance(current, datetime):
            raise CustomerPickupRepositoryError("The clock returned an invalid value.")
        return current.date()

    @staticmethod
    def _nullable_date(value: Any) -> date | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        try:
            return date.fromisoformat(str(value))
        except ValueError as exc:
            raise CustomerPickupInputError(
                "Dates must use YYYY-MM-DD format."
            ) from exc

    @staticmethod
    def _time(value: Any) -> str | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            parsed = value.time()
        elif isinstance(value, time):
            parsed = value
        else:
            raw = str(value).strip()
            try:
                parsed = time.fromisoformat(raw)
            except ValueError as exc:
                raise CustomerPickupRepositoryError(
                    "The configured pickup time is invalid."
                ) from exc
        return parsed.replace(microsecond=0).isoformat(timespec="minutes")

    @staticmethod
    def _timezone(value: Any) -> str | None:
        timezone_name = str(value or "").strip()
        if not timezone_name:
            return None
        if len(timezone_name) > 100 or not re.fullmatch(
            r"[A-Za-z0-9_+./:-]+", timezone_name
        ):
            return None
        return timezone_name

    @staticmethod
    def _source(value: Any) -> str:
        source = str(value or "local").strip().lower()
        return source if source in {"local", "external"} else "unknown"

    @staticmethod
    def _phone(value: Any) -> str | None:
        phone = re.sub(r"[^0-9+() .-]", "", str(value or "")).strip()
        return phone[:40] or None

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerPickupInputError("Tool arguments must be an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerPickupInputError(
                "Organisation and conversation context are required."
            )

    @staticmethod
    def _positive_int(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerPickupInputError(f"{field} must be a positive integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerPickupInputError(
                f"{field} must be a positive integer."
            ) from exc
        if result < 1:
            raise CustomerPickupInputError(f"{field} must be a positive integer.")
        return result

    @staticmethod
    def _nullable_positive_int(value: Any, field: str) -> int | None:
        if value in (None, ""):
            return None
        return CustomerPickupTools._positive_int(value, field)

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerPickupRepositoryError("Expected a text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    def _aliases(self, value: Any) -> list[str]:
        if value in (None, ""):
            return []
        if isinstance(value, str):
            values = re.split(r"[,;\n]", value)
        elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            values = list(value)
        else:
            raise CustomerPickupRepositoryError(
                "A pickup location has invalid aliases."
            )
        return [text for text in (self._text(item, 200) for item in values[:30]) if text]

    @staticmethod
    def _normalized_match(value: Any) -> str:
        return re.sub(r"[^a-z0-9]", "", str(value or "").casefold())

    @staticmethod
    def _assert_optional_match(
        raw: Mapping[str, Any], field: str, expected: int
    ) -> None:
        value = raw.get(field)
        if value in (None, ""):
            return
        try:
            matches = int(value) == expected
        except (TypeError, ValueError):
            matches = False
        if not matches:
            raise CustomerPickupRepositoryError(
                f"The pickup schedule has an inconsistent {field}."
            )

    @staticmethod
    def _search_message(locations: Sequence[Mapping[str, Any]]) -> str:
        if not locations:
            return "No configured pickup location matched that hotel or area."
        if len(locations) == 1:
            return "One pickup location matched. Confirm it with the customer."
        return "Several pickup locations matched. Ask the customer to choose one."

    @staticmethod
    def _schedule_message(status: str) -> str:
        return {
            STATUS_CONFIRMED: "The exact configured pickup schedule was found.",
            STATUS_NOT_CONFIGURED: (
                "No exact pickup schedule is configured. Do not guess a time."
            ),
            STATUS_UNAVAILABLE: "Pickup is unavailable for this product and date.",
            STATUS_AMBIGUOUS: (
                "More information is required before the pickup can be confirmed."
            ),
        }[status]


def build_pickup_tool_handlers(
    *,
    repository: CustomerPickupRepository,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerPickupTools(repository=repository, clock=clock).handlers()


__all__ = [
    "CustomerPickupInputError",
    "CustomerPickupNotFoundError",
    "CustomerPickupRepository",
    "CustomerPickupRepositoryError",
    "CustomerPickupToolError",
    "CustomerPickupTools",
    "PickupLocationSearch",
    "PickupScheduleRequest",
    "build_pickup_tool_handlers",
]