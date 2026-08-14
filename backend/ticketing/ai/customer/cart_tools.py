"""Controlled itinerary-cart persistence for the customer AI agent.

This is the narrow write boundary between an approved conversation proposal
and the application's existing public checkout. The repository must atomically
revalidate the itinerary and customer approval before creating/updating a
temporary cart. No booking, payment, inventory hold, customer profile, or
promotion usage is created here.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping, Protocol, Sequence
from urllib.parse import urlparse


MAX_ITEMS = 12
MAX_PASSENGERS_PER_CATEGORY = 100
MAX_TOTAL_PASSENGERS = 100
MAX_FUTURE_DAYS = 730
MAX_OPTION_ID_LENGTH = 255
MAX_CART_TOKEN_LENGTH = 255
SUPPORTED_LANGUAGES = frozenset({"en", "es", "fr", "pt", "de"})
SUPPORTED_CART_STATUSES = frozenset({"active", "updated"})


class CustomerCartToolError(RuntimeError):
    """Base error for customer cart operations."""


class CustomerCartInputError(CustomerCartToolError):
    """Raised when cart arguments are invalid or approval is absent."""


class CustomerCartValidationError(CustomerCartToolError):
    """Raised when authoritative revalidation rejects the itinerary."""


class CustomerCartRepositoryError(CustomerCartToolError):
    """Raised when the cart repository violates its safety contract."""


@dataclass(frozen=True)
class CartItemRequest:
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


@dataclass(frozen=True)
class SaveCartRequest:
    cart_token: str | None
    items: tuple[CartItemRequest, ...]
    language: str
    customer_approved: bool
    idempotency_key: str


class CustomerCartRepository(Protocol):
    """Adapter to the application's existing cart and checkout services.

    Implementations must, in one transaction:

    * verify approval belongs to this conversation/inbound message;
    * resolve an existing token only inside the same organisation/conversation;
    * revalidate public products, options, dates, availability, pickup, pricing,
      promotions, age restrictions, and checkout eligibility;
    * create/update idempotently using ``idempotency_key``;
    * return an existing application-generated HTTPS checkout URL.
    """

    def save_validated_cart(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: SaveCartRequest,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Atomically validate and save a temporary cart session."""


Clock = Callable[[], datetime]


class CustomerCartTools:
    """Handler for the allowlisted ``save_itinerary_cart`` write tool."""

    def __init__(
        self,
        *,
        repository: CustomerCartRepository,
        clock: Clock | None = None,
    ) -> None:
        if repository is None:
            raise CustomerCartRepositoryError("A customer cart repository is required.")
        self.repository = repository
        self.clock = clock or (lambda: datetime.now(timezone.utc))

    def handlers(self) -> dict[str, Any]:
        return {"save_itinerary_cart": self.save_itinerary_cart}

    def save_itinerary_cart(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Save only an explicitly approved, server-revalidated cart."""
        self._require_context(organisation, conversation)
        safe_metadata = self._mapping(metadata)
        request = self._build_request(arguments, metadata=safe_metadata)

        try:
            raw = self.repository.save_validated_cart(
                organisation=organisation,
                conversation=conversation,
                request=request,
                metadata=safe_metadata,
            )
        except CustomerCartToolError:
            raise
        except Exception as exc:
            raise CustomerCartRepositoryError("The itinerary cart could not be saved.") from exc

        cart = self._normalize_result(
            raw,
            organisation=organisation,
            conversation=conversation,
            request=request,
        )
        return {
            "ok": True,
            "cart": cart,
            "customer_approval_verified": True,
            "itinerary_revalidated": True,
            "checkout_revalidation_required": True,
            "inventory_reserved": False,
            "booking_created": False,
            "payment_created": False,
            "message": (
                "The approved itinerary cart is ready. Send the checkout link so "
                "the customer can review, enter their details, and choose payment."
            ),
        }

    def _build_request(
        self,
        arguments: Mapping[str, Any],
        *,
        metadata: Mapping[str, Any],
    ) -> SaveCartRequest:
        args = self._mapping(arguments)
        customer_approved = args.get("customer_approved")
        if customer_approved is not True:
            raise CustomerCartInputError(
                "The cart cannot be saved until the customer explicitly approves it."
            )
        idempotency_key = self._text(metadata.get("idempotency_key"), 512)
        if not idempotency_key:
            raise CustomerCartInputError(
                "An idempotency key is required to save an itinerary cart."
            )
        raw_items = args.get("items")
        if not isinstance(raw_items, Sequence) or isinstance(
            raw_items, (str, bytes, Mapping)
        ):
            raise CustomerCartInputError("items must be a list.")
        if not 1 <= len(raw_items) <= MAX_ITEMS:
            raise CustomerCartInputError(
                f"A cart must contain between 1 and {MAX_ITEMS} items."
            )
        return SaveCartRequest(
            cart_token=self._token(args.get("cart_token")),
            items=tuple(
                self._build_item(raw, position=index)
                for index, raw in enumerate(raw_items, start=1)
            ),
            language=self._language(args.get("language")),
            customer_approved=True,
            idempotency_key=idempotency_key,
        )

    def _build_item(self, raw: Any, *, position: int) -> CartItemRequest:
        data = self._mapping(raw)
        adults = self._count(data.get("adults"), "adults")
        children = self._count(data.get("children"), "children")
        infants = self._count(data.get("infants"), "infants")
        total = adults + children + infants
        if total < 1 or total > MAX_TOTAL_PASSENGERS:
            raise CustomerCartInputError(
                f"Item {position} must contain 1 to {MAX_TOTAL_PASSENGERS} passengers."
            )
        return CartItemRequest(
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

    def _normalize_result(
        self,
        raw: Mapping[str, Any],
        *,
        organisation: Any,
        conversation: Any,
        request: SaveCartRequest,
    ) -> dict[str, Any]:
        if not isinstance(raw, Mapping):
            raise CustomerCartRepositoryError("The cart repository returned an invalid result.")
        self._assert_identity(raw, "organisation_id", self._identity(organisation))
        self._assert_identity(raw, "conversation_id", self._identity(conversation))
        if raw.get("customer_approval_verified") is not True:
            raise CustomerCartRepositoryError("Customer approval was not verified by the backend.")
        if raw.get("itinerary_revalidated") is not True:
            raise CustomerCartRepositoryError("The itinerary was not revalidated before saving.")
        if raw.get("age_restrictions_validated") is not True:
            raise CustomerCartRepositoryError("Age restrictions were not validated before saving.")
        if bool(raw.get("booking_created")) or bool(raw.get("payment_created")):
            raise CustomerCartRepositoryError("Cart saving must not create a booking or payment.")
        if bool(raw.get("inventory_reserved")):
            raise CustomerCartRepositoryError("Cart saving must not reserve inventory.")

        status = str(raw.get("status") or "").strip().lower()
        if status not in SUPPORTED_CART_STATUSES:
            raise CustomerCartRepositoryError("The cart repository returned an invalid status.")
        token = self._token(raw.get("cart_token"))
        if not token:
            raise CustomerCartRepositoryError("The saved cart has no token.")
        if request.cart_token is not None and token != request.cart_token:
            raise CustomerCartRepositoryError("The repository changed the existing cart token.")
        item_count = self._positive_int(raw.get("item_count"), "item_count")
        if item_count != len(request.items):
            raise CustomerCartRepositoryError("The saved cart has an inconsistent item count.")

        currency = self._currency(raw.get("currency"))
        subtotal = self._money(raw.get("subtotal"))
        discount_total = self._money(raw.get("discount_total")) or "0.00"
        total = self._money(raw.get("total"))
        if currency is None or subtotal is None or total is None:
            raise CustomerCartRepositoryError("The saved cart has incomplete pricing.")
        if Decimal(discount_total) > Decimal(subtotal) or (
            Decimal(subtotal) - Decimal(discount_total)
        ).quantize(Decimal("0.01")) != Decimal(total):
            raise CustomerCartRepositoryError("The saved cart totals do not reconcile.")
        expires_at = self._future_datetime(raw.get("expires_at"))
        checkout_url = self._https_url(raw.get("checkout_url"))

        return {
            "cart_token": token,
            "status": status,
            "item_count": item_count,
            "currency": currency,
            "subtotal": subtotal,
            "discount_total": discount_total,
            "total": total,
            "expires_at": expires_at,
            "checkout_url": checkout_url,
            "checkout_url_generated_by_backend": True,
            "customer_enters_contact_details": True,
            "customer_selects_payment_option": True,
            "age_restrictions_validated": True,
        }

    def _service_date(self, value: Any) -> date:
        if isinstance(value, datetime):
            result = value.date()
        elif isinstance(value, date):
            result = value
        else:
            try:
                result = date.fromisoformat(str(value))
            except ValueError as exc:
                raise CustomerCartInputError("Dates must use YYYY-MM-DD format.") from exc
        today = self._today()
        if result < today:
            raise CustomerCartInputError("A cart item date is in the past.")
        if result > today + timedelta(days=MAX_FUTURE_DAYS):
            raise CustomerCartInputError("A cart item date is too far ahead.")
        return result

    def _today(self) -> date:
        current = self.clock()
        if not isinstance(current, datetime):
            raise CustomerCartRepositoryError("The clock returned an invalid value.")
        return current.date()

    def _future_datetime(self, value: Any) -> str:
        if isinstance(value, datetime):
            result = value
        else:
            try:
                result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            except (TypeError, ValueError) as exc:
                raise CustomerCartRepositoryError("The cart expiration is invalid.") from exc
        now = self.clock()
        if result.tzinfo is None and now.tzinfo is not None:
            result = result.replace(tzinfo=now.tzinfo)
        if now.tzinfo is None and result.tzinfo is not None:
            now = now.replace(tzinfo=result.tzinfo)
        if result <= now:
            raise CustomerCartRepositoryError("The saved cart is already expired.")
        return result.isoformat()

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerCartInputError("Expected an object.")
        return value

    @staticmethod
    def _require_context(organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerCartInputError("Organisation and conversation context are required.")

    @staticmethod
    def _identity(value: Any) -> Any:
        if isinstance(value, Mapping):
            return value.get("id", value.get("pk"))
        return getattr(value, "id", getattr(value, "pk", None)) if value else None

    @staticmethod
    def _assert_identity(raw: Mapping[str, Any], field: str, expected: Any) -> None:
        actual = raw.get(field)
        if actual is None or expected is None or str(actual) != str(expected):
            raise CustomerCartRepositoryError(f"The saved cart has an invalid {field}.")

    @staticmethod
    def _integer(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerCartInputError(f"{field} must be an integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerCartInputError(f"{field} must be an integer.") from exc
        if isinstance(value, float) and not value.is_integer():
            raise CustomerCartInputError(f"{field} must be an integer.")
        return result

    @classmethod
    def _positive_int(cls, value: Any, field: str) -> int:
        result = cls._integer(value, field)
        if result < 1:
            raise CustomerCartInputError(f"{field} must be positive.")
        return result

    @classmethod
    def _nullable_positive_int(cls, value: Any, field: str) -> int | None:
        if value in (None, ""):
            return None
        return cls._positive_int(value, field)

    @classmethod
    def _count(cls, value: Any, field: str) -> int:
        result = cls._integer(value, field)
        if not 0 <= result <= MAX_PASSENGERS_PER_CATEGORY:
            raise CustomerCartInputError(
                f"{field} must be between 0 and {MAX_PASSENGERS_PER_CATEGORY}."
            )
        return result

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerCartInputError("Expected a text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    @classmethod
    def _nullable_text(cls, value: Any, maximum: int) -> str | None:
        result = cls._text(value, maximum)
        return result or None

    @classmethod
    def _token(cls, value: Any) -> str | None:
        token = cls._nullable_text(value, MAX_CART_TOKEN_LENGTH)
        if token and not re.fullmatch(r"[A-Za-z0-9._~-]+", token):
            raise CustomerCartInputError("The cart token is invalid.")
        return token

    @staticmethod
    def _language(value: Any) -> str:
        result = str(value or "").strip().lower()
        if result and result not in SUPPORTED_LANGUAGES:
            raise CustomerCartInputError("Unsupported language.")
        return result

    @staticmethod
    def _money(value: Any) -> str | None:
        if value in (None, ""):
            return None
        try:
            result = Decimal(str(value)).quantize(Decimal("0.01"))
        except (InvalidOperation, TypeError, ValueError):
            return None
        if not result.is_finite() or result < 0:
            return None
        return format(result, "f")

    @staticmethod
    def _currency(value: Any) -> str | None:
        result = str(value or "").strip().upper()
        return result if re.fullmatch(r"[A-Z]{3}", result) else None

    @staticmethod
    def _https_url(value: Any) -> str:
        url = str(value or "").strip()
        parsed = urlparse(url)
        if len(url) > 2_000 or parsed.scheme != "https" or not parsed.netloc:
            raise CustomerCartRepositoryError("The checkout URL is invalid.")
        if parsed.username or parsed.password or parsed.fragment:
            raise CustomerCartRepositoryError("The checkout URL is unsafe.")
        return url


def build_cart_tool_handlers(
    *,
    repository: CustomerCartRepository,
    clock: Clock | None = None,
) -> dict[str, Any]:
    return CustomerCartTools(repository=repository, clock=clock).handlers()


__all__ = [
    "CartItemRequest",
    "CustomerCartInputError",
    "CustomerCartRepository",
    "CustomerCartRepositoryError",
    "CustomerCartToolError",
    "CustomerCartTools",
    "CustomerCartValidationError",
    "SaveCartRequest",
    "build_cart_tool_handlers",
]
