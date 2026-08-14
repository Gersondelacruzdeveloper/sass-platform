"""Read-only itinerary validation for the customer AI sales agent.

This module builds a customer-friendly, day-by-day plan from authoritative
application results. The injected repository must reuse the project's existing
product, option, pricing, availability, and pickup services. Nothing here
creates a cart, booking, payment, discount, or inventory reservation.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping, Protocol, Sequence


MAX_ITEMS = 12
MAX_PASSENGERS_PER_CATEGORY = 100
MAX_TOTAL_PASSENGERS = 100
MAX_FUTURE_DAYS = 730
MAX_OPTION_ID_LENGTH = 255
MAX_TEXT_LENGTH = 1_000
SUPPORTED_LANGUAGES = frozenset({"en", "es", "fr", "pt", "de"})
VALID_ITEM_STATUSES = frozenset({"valid", "invalid", "unavailable", "unknown"})


class CustomerItineraryToolError(RuntimeError):
    """Base error for customer itinerary validation."""


class CustomerItineraryInputError(CustomerItineraryToolError):
    """Raised when the model supplies an invalid itinerary shape."""


class CustomerItineraryRepositoryError(CustomerItineraryToolError):
    """Raised when authoritative validation violates its contract."""


@dataclass(frozen=True)
class ItineraryItemRequest:
    position: int
    product_id: int
    service_date: date
    adults: int
    children: int
    infants: int
    package_id: int | None
    event_ticket_type_id: int | None
    selected_external_option_id: str | None
    pickup_location_id: int | None

    @property
    def total_passengers(self) -> int:
        return self.adults + self.children + self.infants


@dataclass(frozen=True)
class ItineraryValidationRequest:
    items: tuple[ItineraryItemRequest, ...]
    language: str


class CustomerItineraryRepository(Protocol):
    """Adapter to the existing authoritative ticketing services.

    ``validate_item`` must enforce organisation ownership, active/public
    product state, option validity, quantities, live availability, pickup
    requirements, and current display pricing. It must be read-only.
    """

    def validate_item(
        self,
        *,
        organisation: Any,
        conversation: Any,
        item: ItineraryItemRequest,
        language: str,
    ) -> Mapping[str, Any]:
        """Return one authoritative item-validation result."""


Clock = Callable[[], datetime]


class CustomerItineraryTools:
    """Handler for ``validate_itinerary``."""

    def __init__(
        self,
        *,
        repository: CustomerItineraryRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerItineraryRepositoryError(
                "A customer itinerary repository is required."
            )
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        return {"validate_itinerary": self.validate_itinerary}

    def validate_itinerary(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Validate and arrange a proposal without persisting customer intent."""
        self._require_context(organisation, conversation)
        request = self._build_request(arguments)

        validated_items: list[dict[str, Any]] = []
        for item in request.items:
            try:
                raw_result = self.repository.validate_item(
                    organisation=organisation,
                    conversation=conversation,
                    item=item,
                    language=request.language,
                )
            except CustomerItineraryToolError:
                raise
            except Exception as exc:
                raise CustomerItineraryRepositoryError(
                    f"Itinerary item {item.position} could not be validated."
                ) from exc
            validated_items.append(
                self._normalize_item_result(
                    raw_result,
                    organisation=organisation,
                    request=item,
                )
            )

        conflicts = self._find_conflicts(validated_items)
        duplicate_warnings = self._find_duplicates(validated_items)
        issues = [
            issue
            for item in validated_items
            for issue in item["issues"]
        ]
        issues.extend(conflicts)

        all_items_valid = all(item["status"] == "valid" for item in validated_items)
        is_valid = all_items_valid and not conflicts
        totals_by_currency = self._totals_by_currency(validated_items)

        days: list[dict[str, Any]] = []
        for service_date in sorted({item["service_date"] for item in validated_items}):
            day_items = [
                item for item in validated_items if item["service_date"] == service_date
            ]
            day_items.sort(key=self._sort_key)
            days.append({"date": service_date, "items": day_items})

        return {
            "ok": True,
            "is_valid": is_valid,
            "language": request.language or None,
            "item_count": len(validated_items),
            "day_count": len(days),
            "days": days,
            "items": validated_items,
            "totals_by_currency": totals_by_currency,
            "issues": issues,
            "warnings": duplicate_warnings,
            "availability_checked": True,
            "pricing_checked": True,
            "pickup_checked": True,
            "inventory_reserved": False,
            "cart_created": False,
            "booking_created": False,
            "customer_approval_required": True,
            "message": self._message(is_valid, issues),
        }

    def _build_request(self, arguments: Mapping[str, Any]) -> ItineraryValidationRequest:
        args = self._mapping(arguments)
        raw_items = args.get("items")
        if not isinstance(raw_items, Sequence) or isinstance(
            raw_items, (str, bytes, Mapping)
        ):
            raise CustomerItineraryInputError("items must be a list.")
        if not 1 <= len(raw_items) <= MAX_ITEMS:
            raise CustomerItineraryInputError(
                f"An itinerary must contain between 1 and {MAX_ITEMS} items."
            )
        items = tuple(
            self._build_item(raw, position=index)
            for index, raw in enumerate(raw_items, start=1)
        )
        return ItineraryValidationRequest(
            items=items,
            language=self._language(args.get("language")),
        )

    def _build_item(self, raw: Any, *, position: int) -> ItineraryItemRequest:
        data = self._mapping(raw)
        adults = self._nonnegative_int(data.get("adults"), "adults")
        children = self._nonnegative_int(data.get("children"), "children")
        infants = self._nonnegative_int(data.get("infants"), "infants")
        if adults + children + infants < 1:
            raise CustomerItineraryInputError(
                f"Item {position} must include at least one passenger."
            )
        if adults + children + infants > MAX_TOTAL_PASSENGERS:
            raise CustomerItineraryInputError(
                f"Item {position} exceeds {MAX_TOTAL_PASSENGERS} passengers."
            )
        return ItineraryItemRequest(
            position=position,
            product_id=self._positive_int(data.get("product_id"), "product_id"),
            service_date=self._service_date(data.get("service_date")),
            adults=adults,
            children=children,
            infants=infants,
            package_id=self._nullable_positive_int(data.get("package_id"), "package_id"),
            event_ticket_type_id=self._nullable_positive_int(
                data.get("event_ticket_type_id"), "event_ticket_type_id"
            ),
            selected_external_option_id=self._nullable_text(
                data.get("selected_external_option_id"), MAX_OPTION_ID_LENGTH
            ),
            pickup_location_id=self._nullable_positive_int(
                data.get("pickup_location_id"), "pickup_location_id"
            ),
        )

    def _normalize_item_result(
        self,
        raw: Mapping[str, Any],
        *,
        organisation: Any,
        request: ItineraryItemRequest,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} is not an object."
            )
        self._assert_optional_match(raw, "product_id", request.product_id)
        returned_date = self._nullable_date(raw.get("service_date"))
        if returned_date is not None and returned_date != request.service_date:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} belongs to another date."
            )
        result_org_id = raw.get("organisation_id")
        expected_org_id = self._identity(organisation)
        if result_org_id is None or expected_org_id is None or str(result_org_id) != str(
            expected_org_id
        ):
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} is not organisation-scoped."
            )

        status = str(raw.get("status") or "unknown").strip().lower()
        if status not in VALID_ITEM_STATUSES:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} has an unsupported status."
            )
        product_name = self._text(raw.get("product_name"), 300)
        if not product_name:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} has no product name."
            )

        issues = self._messages(raw.get("issues"), maximum=20)
        if status != "valid" and not issues:
            issues = ["This item could not be fully validated."]
        warnings = self._messages(raw.get("warnings"), maximum=20)
        price_total = self._money(raw.get("price_total"))
        currency = self._currency(raw.get("currency"))
        if (price_total is None) != (currency is None):
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} has incomplete pricing."
            )

        start_at = self._nullable_datetime(raw.get("start_at"))
        end_at = self._nullable_datetime(raw.get("end_at"))
        if start_at and end_at and end_at <= start_at:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} has an invalid time range."
            )
        if start_at and start_at.date() != request.service_date:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} starts on another date."
            )

        pickup_required = bool(raw.get("pickup_required", False))
        pickup_confirmed = bool(raw.get("pickup_confirmed", False))
        if pickup_required and request.pickup_location_id is None:
            status = "invalid"
            pickup_confirmed = False
            if "A pickup location is required." not in issues:
                issues.append("A pickup location is required.")
        if pickup_confirmed and request.pickup_location_id is None:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} confirms pickup without a location."
            )

        availability_status = str(raw.get("availability_status") or "unknown").lower()
        if availability_status not in {"available", "limited", "unavailable", "unknown"}:
            raise CustomerItineraryRepositoryError(
                f"Validation result {request.position} has invalid availability."
            )
        if availability_status in {"unavailable", "unknown"} and status == "valid":
            status = "unavailable" if availability_status == "unavailable" else "unknown"
            issues.append(
                "The requested date is unavailable."
                if availability_status == "unavailable"
                else "Availability could not be confirmed."
            )

        return {
            "position": request.position,
            "product_id": request.product_id,
            "product_name": product_name,
            "service_date": request.service_date.isoformat(),
            "adults": request.adults,
            "children": request.children,
            "infants": request.infants,
            "total_passengers": request.total_passengers,
            "package_id": request.package_id,
            "event_ticket_type_id": request.event_ticket_type_id,
            "selected_external_option_id": request.selected_external_option_id,
            "pickup_location_id": request.pickup_location_id,
            "pickup_location_name": self._text(raw.get("pickup_location_name"), 300),
            "pickup_required": pickup_required,
            "pickup_confirmed": pickup_confirmed,
            "pickup_time": self._time(raw.get("pickup_time")),
            "availability_status": availability_status,
            "status": status,
            "price_total": price_total,
            "currency": currency,
            "start_at": start_at.isoformat() if start_at else None,
            "end_at": end_at.isoformat() if end_at else None,
            "public_url": self._safe_public_url(raw.get("public_url")),
            "issues": self._deduplicate(issues),
            "warnings": self._deduplicate(warnings),
        }

    def _find_conflicts(self, items: Sequence[Mapping[str, Any]]) -> list[str]:
        conflicts: list[str] = []
        scheduled = [
            item for item in items if item.get("start_at") and item.get("end_at")
        ]
        for index, left in enumerate(scheduled):
            left_start = datetime.fromisoformat(str(left["start_at"]))
            left_end = datetime.fromisoformat(str(left["end_at"]))
            for right in scheduled[index + 1 :]:
                right_start = datetime.fromisoformat(str(right["start_at"]))
                right_end = datetime.fromisoformat(str(right["end_at"]))
                if left_start < right_end and right_start < left_end:
                    conflicts.append(
                        "Schedule conflict between "
                        f"{left['product_name']} and {right['product_name']} "
                        f"on {left['service_date']}."
                    )
        return self._deduplicate(conflicts)

    def _find_duplicates(self, items: Sequence[Mapping[str, Any]]) -> list[str]:
        seen: set[tuple[Any, ...]] = set()
        warnings: list[str] = []
        for item in items:
            key = (
                item["product_id"],
                item["service_date"],
                item["package_id"],
                item["event_ticket_type_id"],
                item["selected_external_option_id"],
            )
            if key in seen:
                warnings.append(
                    f"{item['product_name']} appears more than once on "
                    f"{item['service_date']}. Confirm this with the customer."
                )
            seen.add(key)
        return self._deduplicate(warnings)

    @staticmethod
    def _sort_key(item: Mapping[str, Any]) -> tuple[str, int]:
        return (str(item.get("start_at") or "9999-12-31T23:59:59"), int(item["position"]))

    def _totals_by_currency(
        self, items: Sequence[Mapping[str, Any]]
    ) -> list[dict[str, str]]:
        totals: dict[str, Decimal] = {}
        for item in items:
            if item["price_total"] is None or item["currency"] is None:
                continue
            totals.setdefault(item["currency"], Decimal("0.00"))
            totals[item["currency"]] += Decimal(item["price_total"])
        return [
            {"currency": currency, "amount": format(amount.quantize(Decimal("0.01")), "f")}
            for currency, amount in sorted(totals.items())
        ]

    def _service_date(self, value: Any) -> date:
        parsed = self._nullable_date(value)
        if parsed is None:
            raise CustomerItineraryInputError("A service date is required.")
        today = self._today()
        if parsed < today:
            raise CustomerItineraryInputError("An itinerary date is in the past.")
        if parsed > today + timedelta(days=MAX_FUTURE_DAYS):
            raise CustomerItineraryInputError("An itinerary date is too far ahead.")
        return parsed

    def _today(self) -> date:
        current = self.clock()
        if not isinstance(current, datetime):
            raise CustomerItineraryRepositoryError("The clock returned an invalid value.")
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
            raise CustomerItineraryInputError("Dates must use YYYY-MM-DD format.") from exc

    @staticmethod
    def _nullable_datetime(value: Any) -> datetime | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        except ValueError as exc:
            raise CustomerItineraryRepositoryError(
                "An itinerary schedule contains an invalid datetime."
            ) from exc

    @staticmethod
    def _time(value: Any) -> str | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            result = value.time()
        elif isinstance(value, time):
            result = value
        else:
            try:
                result = time.fromisoformat(str(value))
            except ValueError as exc:
                raise CustomerItineraryRepositoryError(
                    "An itinerary contains an invalid pickup time."
                ) from exc
        return result.replace(microsecond=0).isoformat(timespec="minutes")

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerItineraryInputError("Expected an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerItineraryInputError(
                "Organisation and conversation context are required."
            )

    @staticmethod
    def _identity(value: Any) -> Any:
        if isinstance(value, Mapping):
            return value.get("id", value.get("pk"))
        return getattr(value, "id", getattr(value, "pk", None)) if value else None

    @staticmethod
    def _integer(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerItineraryInputError(f"{field} must be an integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerItineraryInputError(f"{field} must be an integer.") from exc
        if isinstance(value, float) and not value.is_integer():
            raise CustomerItineraryInputError(f"{field} must be an integer.")
        return result

    @classmethod
    def _positive_int(cls, value: Any, field: str) -> int:
        result = cls._integer(value, field)
        if result < 1:
            raise CustomerItineraryInputError(f"{field} must be positive.")
        return result

    @classmethod
    def _nullable_positive_int(cls, value: Any, field: str) -> int | None:
        if value in (None, ""):
            return None
        return cls._positive_int(value, field)

    @classmethod
    def _nonnegative_int(cls, value: Any, field: str) -> int:
        result = cls._integer(value, field)
        if not 0 <= result <= MAX_PASSENGERS_PER_CATEGORY:
            raise CustomerItineraryInputError(
                f"{field} must be between 0 and {MAX_PASSENGERS_PER_CATEGORY}."
            )
        return result

    @staticmethod
    def _language(value: Any) -> str:
        language = str(value or "").strip().lower()
        if language and language not in SUPPORTED_LANGUAGES:
            raise CustomerItineraryInputError("Unsupported language.")
        return language

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerItineraryRepositoryError("Expected a text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    @classmethod
    def _nullable_text(cls, value: Any, maximum: int) -> str | None:
        text = cls._text(value, maximum)
        return text or None

    @classmethod
    def _messages(cls, value: Any, *, maximum: int) -> list[str]:
        if value in (None, ""):
            return []
        if isinstance(value, str):
            raw = [value]
        elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            raw = list(value)
        else:
            raise CustomerItineraryRepositoryError("Expected a message list.")
        return [text for text in (cls._text(item, MAX_TEXT_LENGTH) for item in raw[:maximum]) if text]

    @staticmethod
    def _deduplicate(values: Sequence[str]) -> list[str]:
        return list(dict.fromkeys(value for value in values if value))

    @staticmethod
    def _money(value: Any) -> str | None:
        if value in (None, ""):
            return None
        try:
            amount = Decimal(str(value))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if not amount.is_finite() or amount < 0:
            return None
        return format(amount.quantize(Decimal("0.01")), "f")

    @staticmethod
    def _currency(value: Any) -> str | None:
        currency = str(value or "").strip().upper()
        return currency if re.fullmatch(r"[A-Z]{3}", currency) else None

    @staticmethod
    def _safe_public_url(value: Any) -> str | None:
        from urllib.parse import urlparse

        url = str(value or "").strip()
        if not url or len(url) > 2_000:
            return None
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None
        if parsed.username or parsed.password:
            return None
        return url

    @staticmethod
    def _assert_optional_match(raw: Mapping[str, Any], field: str, expected: int) -> None:
        value = raw.get(field)
        if value in (None, ""):
            return
        try:
            matches = int(value) == expected
        except (TypeError, ValueError):
            matches = False
        if not matches:
            raise CustomerItineraryRepositoryError(
                f"An itinerary result has an inconsistent {field}."
            )

    @staticmethod
    def _message(is_valid: bool, issues: Sequence[str]) -> str:
        if is_valid:
            return (
                "The itinerary is currently valid. Ask the customer to approve it "
                "before creating or updating a cart session."
            )
        if issues:
            return "The itinerary needs changes before it can be offered for checkout."
        return "The itinerary could not be fully validated."


def build_itinerary_tool_handlers(
    *,
    repository: CustomerItineraryRepository,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerItineraryTools(repository=repository, clock=clock).handlers()


__all__ = [
    "CustomerItineraryInputError",
    "CustomerItineraryRepository",
    "CustomerItineraryRepositoryError",
    "CustomerItineraryToolError",
    "CustomerItineraryTools",
    "ItineraryItemRequest",
    "ItineraryValidationRequest",
    "build_itinerary_tool_handlers",
]
