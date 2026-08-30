"""Authoritative, read-only availability tools for the customer AI agent.

The Django/application adapter implements the repository contract using the
existing local availability rules and external provider integrations.  This
module validates model arguments, enforces tenant scope, normalizes results,
and prevents an availability check from becoming a hold or booking.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping, Protocol, Sequence


STATUS_AVAILABLE = "available"
STATUS_LIMITED = "limited"
STATUS_UNAVAILABLE = "unavailable"
STATUS_UNKNOWN = "unknown"
SUPPORTED_STATUSES = frozenset(
    {STATUS_AVAILABLE, STATUS_LIMITED, STATUS_UNAVAILABLE, STATUS_UNKNOWN}
)
SUPPORTED_LANGUAGES = frozenset({"en", "es", "fr", "pt", "de"})
MAX_PASSENGERS_PER_CATEGORY = 100
MAX_TOTAL_PASSENGERS = 100
MAX_FUTURE_DAYS = 730
MAX_ALTERNATIVE_LIMIT = 6
MAX_QUERY_LENGTH = 200
MAX_OPTION_ID_LENGTH = 255
MAX_MESSAGE_LENGTH = 500
MAX_LIVE_OPTIONS = 12


class CustomerAvailabilityToolError(RuntimeError):
    """Base error for customer availability tools."""


class CustomerAvailabilityInputError(CustomerAvailabilityToolError):
    """Raised when tool arguments are invalid."""


class CustomerAvailabilityProductNotFoundError(CustomerAvailabilityToolError):
    """Raised when an active public organisation product cannot be resolved."""


class CustomerAvailabilityRepositoryError(CustomerAvailabilityToolError):
    """Raised when the authoritative availability adapter fails its contract."""


@dataclass(frozen=True)
class AvailabilityRequest:
    product_id: int
    service_date: date
    adults: int
    children: int
    infants: int
    selected_external_option_id: str | None

    @property
    def total_passengers(self) -> int:
        return self.adults + self.children + self.infants


@dataclass(frozen=True)
class AlternativeRequest:
    requested_product_id: int | None
    requested_date: date | None
    travel_start_date: date | None
    travel_end_date: date | None
    query: str
    adults: int
    children: int
    infants: int
    limit: int
    language: str

    @property
    def total_passengers(self) -> int:
        return self.adults + self.children + self.infants


class CustomerAvailabilityRepository(Protocol):
    """Adapter to existing product and availability business services.

    Every method must apply organisation scope. ``check_availability`` may call
    an external supplier but must not create a hold, cart, booking, or payment.
    """

    def get_public_product(
        self,
        *,
        organisation: Any,
        product_id: int,
    ) -> Any | None:
        """Return one active/public organisation product or ``None``."""

    def check_availability(
        self,
        *,
        organisation: Any,
        product: Any,
        request: AvailabilityRequest,
    ) -> Mapping[str, Any]:
        """Return authoritative availability without reserving inventory."""

    def find_available_alternatives(
        self,
        *,
        organisation: Any,
        request: AlternativeRequest,
    ) -> Sequence[Mapping[str, Any]]:
        """Return checked dates/products satisfying the requested party size."""


Clock = Callable[[], datetime]


class CustomerAvailabilityTools:
    """Handlers for exact checks and genuine available alternatives."""

    def __init__(
        self,
        *,
        repository: CustomerAvailabilityRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerAvailabilityRepositoryError(
                "A customer availability repository is required."
            )
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        return {
            "check_product_availability": self.check_product_availability,
            "find_available_alternatives": self.find_available_alternatives,
        }

    def check_product_availability(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        self._require_context(organisation, conversation)
        request = self._build_availability_request(arguments)
        product = self._load_product(
            organisation=organisation,
            product_id=request.product_id,
        )

        try:
            raw_result = self.repository.check_availability(
                organisation=organisation,
                product=product,
                request=request,
            )
        except CustomerAvailabilityToolError:
            raise
        except Exception as exc:
            raise CustomerAvailabilityRepositoryError(
                "Availability could not be checked."
            ) from exc

        result = self._normalize_availability_result(
            raw_result,
            product=product,
            organisation=organisation,
            request=request,
        )
        return {
            "ok": True,
            "availability": result,
            "availability_checked": True,
            "inventory_reserved": False,
            "booking_created": False,
            "message": self._availability_message(result["status"]),
        }

    def find_available_alternatives(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        self._require_context(organisation, conversation)
        request = self._build_alternative_request(arguments)

        if request.requested_product_id is not None:
            self._load_product(
                organisation=organisation,
                product_id=request.requested_product_id,
            )

        try:
            raw_alternatives = self.repository.find_available_alternatives(
                organisation=organisation,
                request=request,
            )
        except CustomerAvailabilityToolError:
            raise
        except Exception as exc:
            raise CustomerAvailabilityRepositoryError(
                "Available alternatives could not be searched."
            ) from exc

        if raw_alternatives is None or isinstance(
            raw_alternatives, (str, bytes, Mapping)
        ):
            raise CustomerAvailabilityRepositoryError(
                "The availability repository returned an invalid alternatives list."
            )

        alternatives: list[dict[str, Any]] = []
        for raw in list(raw_alternatives)[: request.limit]:
            normalized = self._normalize_alternative(
                raw,
                organisation=organisation,
                request=request,
            )
            # Never describe unknown/unavailable inventory as an alternative.
            if normalized["status"] in {STATUS_AVAILABLE, STATUS_LIMITED}:
                alternatives.append(normalized)

        return {
            "ok": True,
            "count": len(alternatives),
            "alternatives": alternatives,
            "availability_checked": True,
            "inventory_reserved": False,
            "booking_created": False,
            "message": (
                "Checked alternatives found. Ask the customer which option they prefer."
                if alternatives
                else "No checked alternatives were found for the requested travel window."
            ),
        }

    def _load_product(self, *, organisation: Any, product_id: int) -> Any:
        try:
            product = self.repository.get_public_product(
                organisation=organisation,
                product_id=product_id,
            )
        except CustomerAvailabilityToolError:
            raise
        except Exception as exc:
            raise CustomerAvailabilityRepositoryError(
                "The product could not be loaded for an availability check."
            ) from exc
        if product is None:
            raise CustomerAvailabilityProductNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )
        self._assert_product_scope(product, organisation)
        if not self._is_public_and_active(product):
            raise CustomerAvailabilityProductNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )
        return product

    def _build_availability_request(
        self,
        arguments: Mapping[str, Any],
    ) -> AvailabilityRequest:
        args = self._mapping(arguments)
        adults, children, infants = self._passengers(args)
        return AvailabilityRequest(
            product_id=self._positive_int(args.get("product_id"), "product_id"),
            service_date=self._service_date(args.get("service_date")),
            adults=adults,
            children=children,
            infants=infants,
            selected_external_option_id=self._nullable_text(
                args.get("selected_external_option_id"),
                MAX_OPTION_ID_LENGTH,
            ),
        )

    def _build_alternative_request(
        self,
        arguments: Mapping[str, Any],
    ) -> AlternativeRequest:
        args = self._mapping(arguments)
        adults, children, infants = self._passengers(args)
        requested_product_id = self._nullable_positive_int(
            args.get("requested_product_id"), "requested_product_id"
        )
        requested_date = self._nullable_service_date(args.get("requested_date"))
        travel_start = self._nullable_service_date(args.get("travel_start_date"))
        travel_end = self._nullable_service_date(args.get("travel_end_date"))
        if travel_start and travel_end and travel_end < travel_start:
            raise CustomerAvailabilityInputError(
                "travel_end_date cannot be before travel_start_date."
            )
        if requested_date and travel_start and requested_date < travel_start:
            # This is allowed only as the failed original date; the search window
            # still begins at travel_start.
            pass
        query = self._text(args.get("query"), MAX_QUERY_LENGTH)
        if requested_product_id is None and not query:
            raise CustomerAvailabilityInputError(
                "Provide requested_product_id or a product search query."
            )
        limit = self._positive_int(args.get("limit"), "limit")
        if limit > MAX_ALTERNATIVE_LIMIT:
            raise CustomerAvailabilityInputError(
                f"limit cannot exceed {MAX_ALTERNATIVE_LIMIT}."
            )
        return AlternativeRequest(
            requested_product_id=requested_product_id,
            requested_date=requested_date,
            travel_start_date=travel_start,
            travel_end_date=travel_end,
            query=query,
            adults=adults,
            children=children,
            infants=infants,
            limit=limit,
            language=self._language(args.get("language")),
        )

    def _normalize_availability_result(
        self,
        raw: Mapping[str, Any],
        *,
        product: Any,
        organisation: Any,
        request: AvailabilityRequest,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerAvailabilityRepositoryError(
                "The availability repository returned an invalid result."
            )
        status = self._status(raw.get("status"))
        returned_product_id = self._nullable_positive_int(
            raw.get("product_id"), "result.product_id"
        )
        if returned_product_id is not None and returned_product_id != request.product_id:
            raise CustomerAvailabilityRepositoryError(
                "The availability result belongs to a different product."
            )
        returned_date = self._nullable_date(raw.get("service_date"))
        if returned_date is not None and returned_date != request.service_date:
            raise CustomerAvailabilityRepositoryError(
                "The availability result belongs to a different date."
            )
        remaining = self._nullable_nonnegative_int(raw.get("remaining_capacity"))
        if status == STATUS_LIMITED and remaining is None:
            status = STATUS_UNKNOWN
        options = self._normalize_live_options(raw.get("options"))
        return {
            "product_id": request.product_id,
            "product_name": self._text(
                self._value(product, "name", default=""), 300
            ),
            "service_date": request.service_date.isoformat(),
            "status": status,
            "available": status in {STATUS_AVAILABLE, STATUS_LIMITED},
            "adults": request.adults,
            "children": request.children,
            "infants": request.infants,
            "total_passengers": request.total_passengers,
            "remaining_capacity": remaining,
            "selected_external_option_id": request.selected_external_option_id,
            "price_total": self._money(raw.get("price_total")),
            "currency": self._currency(raw.get("currency")),
            "source": self._source(raw.get("source")),
            "checked_at": self._checked_at(raw.get("checked_at")),
            "expires_at": self._nullable_datetime(raw.get("expires_at")),
            "notes": self._text(raw.get("notes"), MAX_MESSAGE_LENGTH),
            "options": options,
            "requires_option_selection": bool(
                len(options) > 1 and not request.selected_external_option_id
            ),
        }

    def _normalize_live_options(self, value: Any) -> list[dict[str, Any]]:
        if value in (None, ""):
            return []
        if not isinstance(value, (list, tuple)):
            raise CustomerAvailabilityRepositoryError(
                "The availability options result is invalid."
            )

        options: list[dict[str, Any]] = []
        for raw_option in value[:MAX_LIVE_OPTIONS]:
            if not isinstance(raw_option, Mapping):
                continue
            external_option_id = self._text(
                raw_option.get("external_option_id"), MAX_OPTION_ID_LENGTH
            )
            if not external_option_id:
                continue
            options.append(
                {
                    "external_option_id": external_option_id,
                    "external_product_id": self._text(
                        raw_option.get("external_product_id"), MAX_OPTION_ID_LENGTH
                    ),
                    "external_variant_id": self._text(
                        raw_option.get("external_variant_id"), MAX_OPTION_ID_LENGTH
                    ),
                    "option_name": self._text(
                        raw_option.get("option_name") or "Ticket option", 300
                    ),
                    "description": self._text(
                        raw_option.get("description"), MAX_MESSAGE_LENGTH
                    ),
                    "price": self._money(raw_option.get("price")),
                    "currency": self._currency(raw_option.get("currency")),
                    "available": raw_option.get("available") is True,
                    "available_quantity": self._nullable_nonnegative_int(
                        raw_option.get("available_quantity")
                    ),
                    "start_time": self._text(raw_option.get("start_time"), 50),
                    "checkin_time": self._text(
                        raw_option.get("checkin_time"), 50
                    ),
                    "age_restriction": self._nullable_nonnegative_int(
                        raw_option.get("age_restriction")
                    ),
                    "product_group": self._text(
                        raw_option.get("product_group"), 100
                    ),
                }
            )
        return options

    def _normalize_alternative(
        self,
        raw: Mapping[str, Any],
        *,
        organisation: Any,
        request: AlternativeRequest,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerAvailabilityRepositoryError(
                "An alternative availability result is invalid."
            )
        product = raw.get("product")
        if product is None:
            raise CustomerAvailabilityRepositoryError(
                "An alternative result must include its scoped product."
            )
        self._assert_product_scope(product, organisation)
        if not self._is_public_and_active(product):
            raise CustomerAvailabilityRepositoryError(
                "An alternative result included a private or inactive product."
            )
        product_id = self._positive_int(
            self._value(product, "id", "pk"), "alternative.product_id"
        )
        raw_product_id = self._nullable_positive_int(
            raw.get("product_id"), "alternative.product_id"
        )
        if raw_product_id is not None and raw_product_id != product_id:
            raise CustomerAvailabilityRepositoryError(
                "An alternative result has inconsistent product IDs."
            )
        service_date = self._service_date(raw.get("service_date"))
        if request.travel_start_date and service_date < request.travel_start_date:
            raise CustomerAvailabilityRepositoryError(
                "An alternative is outside the requested travel window."
            )
        if request.travel_end_date and service_date > request.travel_end_date:
            raise CustomerAvailabilityRepositoryError(
                "An alternative is outside the requested travel window."
            )
        status = self._status(raw.get("status"))
        return {
            "product_id": product_id,
            "product_name": self._text(self._value(product, "name", default=""), 300),
            "service_date": service_date.isoformat(),
            "status": status,
            "available": status in {STATUS_AVAILABLE, STATUS_LIMITED},
            "remaining_capacity": self._nullable_nonnegative_int(
                raw.get("remaining_capacity")
            ),
            "price_total": self._money(raw.get("price_total")),
            "currency": self._currency(raw.get("currency")),
            "source": self._source(raw.get("source")),
            "checked_at": self._checked_at(raw.get("checked_at")),
            "public_url": self._safe_public_url(
                self._value(product, "public_url", "booking_url", "url")
            ),
        }

    def _passengers(self, args: Mapping[str, Any]) -> tuple[int, int, int]:
        counts = tuple(
            self._nonnegative_int(args.get(name), name)
            for name in ("adults", "children", "infants")
        )
        if sum(counts) < 1:
            raise CustomerAvailabilityInputError(
                "At least one passenger is required to check availability."
            )
        if sum(counts) > MAX_TOTAL_PASSENGERS:
            raise CustomerAvailabilityInputError(
                f"Total passengers cannot exceed {MAX_TOTAL_PASSENGERS}."
            )
        return counts

    def _service_date(self, value: Any) -> date:
        parsed = self._nullable_date(value)
        if parsed is None:
            raise CustomerAvailabilityInputError(
                "A service date in YYYY-MM-DD format is required."
            )
        today = self._today()
        if parsed < today:
            raise CustomerAvailabilityInputError("The service date is in the past.")
        if parsed > today + timedelta(days=MAX_FUTURE_DAYS):
            raise CustomerAvailabilityInputError("The service date is too far ahead.")
        return parsed

    def _nullable_service_date(self, value: Any) -> date | None:
        if value in (None, ""):
            return None
        return self._service_date(value)

    def _today(self) -> date:
        now = self.clock()
        if not isinstance(now, datetime):
            raise CustomerAvailabilityRepositoryError("The clock returned an invalid value.")
        return now.date()

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerAvailabilityInputError("Tool arguments must be an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerAvailabilityInputError(
                "Organisation and conversation context are required."
            )

    def _assert_product_scope(self, product: Any, organisation: Any) -> None:
        expected = self._identity(organisation)
        actual = self._value(product, "organisation_id")
        if actual is None:
            actual = self._identity(self._value(product, "organisation"))
        if expected is None or actual is None or str(expected) != str(actual):
            raise CustomerAvailabilityRepositoryError(
                "The availability repository returned a cross-organisation product."
            )

    def _is_public_and_active(self, product: Any) -> bool:
        return bool(self._value(product, "is_active", "active", default=False)) and bool(
            self._value(
                product, "is_public", "published", "is_published", default=False
            )
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
        return getattr(value, "id", getattr(value, "pk", None)) if value is not None else None

    @staticmethod
    def _positive_int(value: Any, field: str) -> int:
        result = CustomerAvailabilityTools._integer(value, field)
        if result < 1:
            raise CustomerAvailabilityInputError(f"{field} must be a positive integer.")
        return result

    @staticmethod
    def _nullable_positive_int(value: Any, field: str) -> int | None:
        if value in (None, ""):
            return None
        return CustomerAvailabilityTools._positive_int(value, field)

    @staticmethod
    def _nonnegative_int(value: Any, field: str) -> int:
        result = CustomerAvailabilityTools._integer(value, field)
        if result < 0 or result > MAX_PASSENGERS_PER_CATEGORY:
            raise CustomerAvailabilityInputError(
                f"{field} must be between 0 and {MAX_PASSENGERS_PER_CATEGORY}."
            )
        return result

    @staticmethod
    def _nullable_nonnegative_int(value: Any) -> int | None:
        if value in (None, "") or isinstance(value, bool):
            return None
        try:
            result = int(value)
        except (TypeError, ValueError):
            return None
        return result if result >= 0 else None

    @staticmethod
    def _integer(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerAvailabilityInputError(f"{field} must be an integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerAvailabilityInputError(f"{field} must be an integer.") from exc
        if isinstance(value, float) and not value.is_integer():
            raise CustomerAvailabilityInputError(f"{field} must be an integer.")
        return result

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
            raise CustomerAvailabilityInputError(
                "Dates must use YYYY-MM-DD format."
            ) from exc

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerAvailabilityRepositoryError("Expected a text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    def _nullable_text(self, value: Any, maximum: int) -> str | None:
        text = self._text(value, maximum)
        return text or None

    @staticmethod
    def _language(value: Any) -> str:
        language = str(value or "").strip().lower()
        if language and language not in SUPPORTED_LANGUAGES:
            raise CustomerAvailabilityInputError("Unsupported language.")
        return language

    @staticmethod
    def _status(value: Any) -> str:
        status = str(value or STATUS_UNKNOWN).strip().lower()
        if status not in SUPPORTED_STATUSES:
            raise CustomerAvailabilityRepositoryError(
                "The availability repository returned an unsupported status."
            )
        return status

    @staticmethod
    def _source(value: Any) -> str:
        source = str(value or "local").strip().lower()
        return source if source in {"local", "external"} else "unknown"

    def _checked_at(self, value: Any) -> str:
        parsed = self._nullable_datetime(value)
        if parsed:
            return parsed
        return self.clock().isoformat()

    @staticmethod
    def _nullable_datetime(value: Any) -> str | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            parsed = value
        else:
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError:
                return None
        return parsed.isoformat()

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
    def _availability_message(status: str) -> str:
        return {
            STATUS_AVAILABLE: "The requested product and date are currently available.",
            STATUS_LIMITED: "The requested product and date have limited availability.",
            STATUS_UNAVAILABLE: "The requested product and date are unavailable.",
            STATUS_UNKNOWN: "Availability could not be confirmed. Do not promise this date.",
        }[status]


def build_availability_tool_handlers(
    *,
    repository: CustomerAvailabilityRepository,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerAvailabilityTools(repository=repository, clock=clock).handlers()


__all__ = [
    "AlternativeRequest",
    "AvailabilityRequest",
    "CustomerAvailabilityInputError",
    "CustomerAvailabilityProductNotFoundError",
    "CustomerAvailabilityRepository",
    "CustomerAvailabilityRepositoryError",
    "CustomerAvailabilityToolError",
    "CustomerAvailabilityTools",
    "build_availability_tool_handlers",
]
