"""Read-only promotion evaluation for customer itinerary proposals.

Only the injected application repository may decide whether an owner-configured
promotion applies. The AI supplies itinerary items, but it cannot name a
discount, select a private rule, change prices, or override stacking/limit
rules. This module validates inputs and verifies the repository's arithmetic.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Callable, Mapping, Protocol, Sequence


MAX_ITEMS = 12
MAX_PASSENGERS_PER_CATEGORY = 100
MAX_TOTAL_PASSENGERS = 100
MAX_FUTURE_DAYS = 730
MAX_OPTION_ID_LENGTH = 255
MAX_PROMOTIONS = 20
MAX_TEXT_LENGTH = 1_000
MONEY_PLACES = Decimal("0.01")


class CustomerPromotionToolError(RuntimeError):
    """Base error for customer promotion evaluation."""


class CustomerPromotionInputError(CustomerPromotionToolError):
    """Raised when itinerary arguments are invalid."""


class CustomerPromotionRepositoryError(CustomerPromotionToolError):
    """Raised when authoritative promotion evaluation is invalid."""


@dataclass(frozen=True)
class PromotionItemRequest:
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
class PromotionEvaluationRequest:
    items: tuple[PromotionItemRequest, ...]


class CustomerPromotionRepository(Protocol):
    """Adapter to existing pricing and owner-configured promotion services.

    The implementation must revalidate products, options, current base prices,
    eligibility, validity windows, usage limits, currency, caps, and stacking.
    It must not mutate carts, bookings, promotion usage, or inventory.
    """

    def evaluate_itinerary_promotions(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: PromotionEvaluationRequest,
    ) -> Mapping[str, Any]:
        """Return authoritative totals and applicable public promotions."""


Clock = Callable[[], datetime]


class CustomerPromotionTools:
    """Handler for ``evaluate_itinerary_promotions``."""

    def __init__(
        self,
        *,
        repository: CustomerPromotionRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerPromotionRepositoryError(
                "A customer promotion repository is required."
            )
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        return {"evaluate_itinerary_promotions": self.evaluate_itinerary_promotions}

    def evaluate_itinerary_promotions(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Evaluate current owner rules without applying or consuming them."""
        self._require_context(organisation, conversation)
        request = self._build_request(arguments)
        try:
            raw = self.repository.evaluate_itinerary_promotions(
                organisation=organisation,
                conversation=conversation,
                request=request,
            )
        except CustomerPromotionToolError:
            raise
        except Exception as exc:
            raise CustomerPromotionRepositoryError(
                "Promotions could not be evaluated."
            ) from exc
        evaluation = self._normalize_evaluation(
            raw,
            organisation=organisation,
            request=request,
        )
        return {
            "ok": True,
            "evaluation": evaluation,
            "promotions_checked": True,
            "promotion_applied": False,
            "promotion_usage_recorded": False,
            "cart_updated": False,
            "booking_created": False,
            "customer_approval_required": True,
            "message": (
                "Eligible owner-configured savings were found. Final eligibility "
                "and totals must be rechecked at checkout."
                if evaluation["discount_total"] != "0.00"
                else "No active owner-configured promotion applies to this itinerary."
            ),
        }

    def _build_request(self, arguments: Mapping[str, Any]) -> PromotionEvaluationRequest:
        args = self._mapping(arguments)
        raw_items = args.get("items")
        if not isinstance(raw_items, Sequence) or isinstance(
            raw_items, (str, bytes, Mapping)
        ):
            raise CustomerPromotionInputError("items must be a list.")
        if not 1 <= len(raw_items) <= MAX_ITEMS:
            raise CustomerPromotionInputError(
                f"An itinerary must contain between 1 and {MAX_ITEMS} items."
            )
        return PromotionEvaluationRequest(
            items=tuple(
                self._build_item(raw, position=index)
                for index, raw in enumerate(raw_items, start=1)
            )
        )

    def _build_item(self, raw: Any, *, position: int) -> PromotionItemRequest:
        data = self._mapping(raw)
        adults = self._nonnegative_int(data.get("adults"), "adults")
        children = self._nonnegative_int(data.get("children"), "children")
        infants = self._nonnegative_int(data.get("infants"), "infants")
        total = adults + children + infants
        if total < 1 or total > MAX_TOTAL_PASSENGERS:
            raise CustomerPromotionInputError(
                f"Item {position} must contain 1 to {MAX_TOTAL_PASSENGERS} passengers."
            )
        return PromotionItemRequest(
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

    def _normalize_evaluation(
        self,
        raw: Mapping[str, Any],
        *,
        organisation: Any,
        request: PromotionEvaluationRequest,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerPromotionRepositoryError(
                "The promotion repository returned an invalid evaluation."
            )
        expected_org = self._identity(organisation)
        result_org = raw.get("organisation_id")
        if expected_org is None or result_org is None or str(expected_org) != str(result_org):
            raise CustomerPromotionRepositoryError(
                "The promotion evaluation is not organisation-scoped."
            )
        returned_count = self._positive_int(raw.get("item_count"), "item_count")
        if returned_count != len(request.items):
            raise CustomerPromotionRepositoryError(
                "The promotion evaluation has an inconsistent item count."
            )
        currency = self._currency(raw.get("currency"))
        if currency is None:
            raise CustomerPromotionRepositoryError(
                "The promotion evaluation must use one valid currency."
            )
        subtotal = self._required_money(raw.get("subtotal"), "subtotal")
        discount_total = self._required_money(
            raw.get("discount_total"), "discount_total"
        )
        final_total = self._required_money(raw.get("final_total"), "final_total")
        if discount_total > subtotal:
            raise CustomerPromotionRepositoryError(
                "The discount cannot exceed the itinerary subtotal."
            )
        expected_total = (subtotal - discount_total).quantize(
            MONEY_PLACES, rounding=ROUND_HALF_UP
        )
        if final_total != expected_total:
            raise CustomerPromotionRepositoryError(
                "The promotion evaluation totals do not reconcile."
            )

        raw_promotions = raw.get("promotions") or []
        if not isinstance(raw_promotions, Sequence) or isinstance(
            raw_promotions, (str, bytes, Mapping)
        ):
            raise CustomerPromotionRepositoryError("promotions must be a list.")
        if len(raw_promotions) > MAX_PROMOTIONS:
            raise CustomerPromotionRepositoryError("Too many promotions were returned.")
        promotions = [
            self._normalize_promotion(value, currency=currency)
            for value in raw_promotions
        ]
        promotion_sum = sum(
            (Decimal(value["discount_amount"]) for value in promotions),
            Decimal("0.00"),
        ).quantize(MONEY_PLACES)
        if promotion_sum != discount_total:
            raise CustomerPromotionRepositoryError(
                "Promotion amounts do not equal the total discount."
            )

        return {
            "currency": currency,
            "subtotal": self._format_money(subtotal),
            "discount_total": self._format_money(discount_total),
            "final_total": self._format_money(final_total),
            "item_count": len(request.items),
            "promotions": promotions,
            "promotion_count": len(promotions),
            "stacking_applied": bool(raw.get("stacking_applied", False)),
            "valid_until": self._nullable_datetime(raw.get("valid_until")),
            "checkout_revalidation_required": True,
        }

    def _normalize_promotion(
        self,
        raw: Any,
        *,
        currency: str,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerPromotionRepositoryError("A promotion result is invalid.")
        promotion_id = self._positive_int(raw.get("promotion_id"), "promotion_id")
        name = self._text(raw.get("name"), 300)
        if not name:
            raise CustomerPromotionRepositoryError(
                f"Promotion {promotion_id} has no customer-facing name."
            )
        returned_currency = self._currency(raw.get("currency"))
        if returned_currency != currency:
            raise CustomerPromotionRepositoryError(
                "A promotion uses a different currency from the itinerary."
            )
        amount = self._required_money(raw.get("discount_amount"), "discount_amount")
        eligible_positions = self._positions(raw.get("eligible_item_positions"))
        return {
            "promotion_id": promotion_id,
            "name": name,
            "description": self._text(raw.get("description"), MAX_TEXT_LENGTH),
            "discount_amount": self._format_money(amount),
            "currency": currency,
            "eligible_item_positions": eligible_positions,
            "automatically_applied_at_checkout": bool(
                raw.get("automatically_applied_at_checkout", True)
            ),
            "requires_code": bool(raw.get("requires_code", False)),
            # Codes are never returned to or invented by the AI.
            "promotion_code": None,
        }

    def _positions(self, value: Any) -> list[int]:
        if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
            raise CustomerPromotionRepositoryError(
                "eligible_item_positions must be a list."
            )
        positions = [self._positive_int(item, "eligible_item_position") for item in value]
        if any(position > MAX_ITEMS for position in positions):
            raise CustomerPromotionRepositoryError(
                "A promotion references an unknown itinerary position."
            )
        return list(dict.fromkeys(positions))

    def _service_date(self, value: Any) -> date:
        if isinstance(value, datetime):
            parsed = value.date()
        elif isinstance(value, date):
            parsed = value
        else:
            try:
                parsed = date.fromisoformat(str(value))
            except ValueError as exc:
                raise CustomerPromotionInputError(
                    "Dates must use YYYY-MM-DD format."
                ) from exc
        today = self._today()
        if parsed < today:
            raise CustomerPromotionInputError("An itinerary date is in the past.")
        if parsed > today + timedelta(days=MAX_FUTURE_DAYS):
            raise CustomerPromotionInputError("An itinerary date is too far ahead.")
        return parsed

    def _today(self) -> date:
        value = self.clock()
        if not isinstance(value, datetime):
            raise CustomerPromotionRepositoryError("The clock returned an invalid value.")
        return value.date()

    @staticmethod
    def _nullable_datetime(value: Any) -> str | None:
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            parsed = value
        else:
            try:
                parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except ValueError as exc:
                raise CustomerPromotionRepositoryError(
                    "The promotion validity timestamp is invalid."
                ) from exc
        return parsed.isoformat()

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerPromotionInputError("Expected an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerPromotionInputError(
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
            raise CustomerPromotionInputError(f"{field} must be an integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerPromotionInputError(f"{field} must be an integer.") from exc
        if isinstance(value, float) and not value.is_integer():
            raise CustomerPromotionInputError(f"{field} must be an integer.")
        return result

    @classmethod
    def _positive_int(cls, value: Any, field: str) -> int:
        result = cls._integer(value, field)
        if result < 1:
            raise CustomerPromotionInputError(f"{field} must be positive.")
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
            raise CustomerPromotionInputError(
                f"{field} must be between 0 and {MAX_PASSENGERS_PER_CATEGORY}."
            )
        return result

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerPromotionRepositoryError("Expected a text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    @classmethod
    def _nullable_text(cls, value: Any, maximum: int) -> str | None:
        text = cls._text(value, maximum)
        return text or None

    @staticmethod
    def _required_money(value: Any, field: str) -> Decimal:
        try:
            result = Decimal(str(value)).quantize(MONEY_PLACES, rounding=ROUND_HALF_UP)
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise CustomerPromotionRepositoryError(f"{field} is invalid.") from exc
        if not result.is_finite() or result < 0:
            raise CustomerPromotionRepositoryError(f"{field} is invalid.")
        return result

    @staticmethod
    def _format_money(value: Decimal) -> str:
        return format(value.quantize(MONEY_PLACES), "f")

    @staticmethod
    def _currency(value: Any) -> str | None:
        result = str(value or "").strip().upper()
        return result if re.fullmatch(r"[A-Z]{3}", result) else None


def build_promotion_tool_handlers(
    *,
    repository: CustomerPromotionRepository,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerPromotionTools(repository=repository, clock=clock).handlers()


__all__ = [
    "CustomerPromotionInputError",
    "CustomerPromotionRepository",
    "CustomerPromotionRepositoryError",
    "CustomerPromotionToolError",
    "CustomerPromotionTools",
    "PromotionEvaluationRequest",
    "PromotionItemRequest",
    "build_promotion_tool_handlers",
]
