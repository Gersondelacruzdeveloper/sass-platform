"""Atomic persistence service for approved customer itinerary carts.

This module implements the repository contract required by
``ticketing.ai.customer.cart_tools``. It stores checkout preparation only and
never imports or writes Booking, BookingItem, BookingPayment, or inventory-hold
models.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import re
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any, Callable, Mapping, Protocol, Sequence
from urllib.parse import urlparse

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from ticketing.ai.customer.cart_tools import (
    CustomerCartRepositoryError,
    CustomerCartValidationError,
    SaveCartRequest,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)


DEFAULT_CART_LIFETIME = timedelta(hours=24)
MAX_CART_LIFETIME = timedelta(hours=24)
MAX_ITEMS = 12
MONEY_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class ValidatedCartLine:
    position: int
    product: Any
    service_date: Any
    adults: int
    children: int
    infants: int
    package_id: int | None
    event_ticket_type_id: int | None
    selected_external_option_id: str
    pickup_location_id: int | None
    product_name: str
    option_name: str
    pickup_name: str
    pickup_time: time | None
    unit_price: Decimal
    subtotal: Decimal
    discount: Decimal
    total: Decimal
    currency: str
    availability_snapshot: Mapping[str, Any]


@dataclass(frozen=True)
class ValidatedCart:
    lines: tuple[ValidatedCartLine, ...]
    currency: str
    subtotal: Decimal
    discount_total: Decimal
    total: Decimal
    promotion_snapshot: tuple[Mapping[str, Any], ...]
    age_restrictions_validated: bool
    availability_validated: bool
    pickup_validated: bool


class CustomerCartValidator(Protocol):
    """Adapter to existing itinerary, availability, pickup, and pricing rules."""

    def validate_for_checkout(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        request: SaveCartRequest,
        checked_at: datetime,
    ) -> ValidatedCart | Mapping[str, Any]:
        """Return current checkout-safe lines and totals without side effects."""


class CustomerCheckoutURLBuilder(Protocol):
    """Build the existing public cart/checkout route for a raw cart token."""

    def build_checkout_url(
        self,
        *,
        organisation: Any,
        cart: CustomerItineraryCart,
        cart_token: str,
        language: str,
    ) -> str:
        """Return an HTTPS URL owned by the application's public frontend."""


class CustomerCartApprovalPolicy(Protocol):
    """Verify that an inbound message explicitly accepts this exact cart."""

    def is_explicit_approval(
        self,
        *,
        conversation: CustomerAIConversation,
        message: CustomerAIMessage,
        request: SaveCartRequest,
    ) -> bool:
        """Return true only for explicit approval of the requested items."""


Clock = Callable[[], datetime]


class DjangoCustomerCartService:
    """Django implementation used directly as ``CustomerCartRepository``."""

    def __init__(
        self,
        *,
        validator: CustomerCartValidator,
        checkout_url_builder: CustomerCheckoutURLBuilder,
        approval_policy: CustomerCartApprovalPolicy,
        cart_lifetime: timedelta = DEFAULT_CART_LIFETIME,
        clock: Clock | None = None,
    ) -> None:
        if validator is None or checkout_url_builder is None or approval_policy is None:
            raise CustomerCartRepositoryError(
                "A cart validator, checkout URL builder, and approval policy are required."
            )
        if cart_lifetime <= timedelta(0) or cart_lifetime > MAX_CART_LIFETIME:
            raise CustomerCartRepositoryError(
                "Cart lifetime must be greater than zero and no more than 24 hours."
            )
        self.validator = validator
        self.checkout_url_builder = checkout_url_builder
        self.approval_policy = approval_policy
        self.cart_lifetime = cart_lifetime
        self.clock = clock or timezone.now

    @transaction.atomic
    def save_validated_cart(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: SaveCartRequest,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Verify approval, revalidate, and idempotently persist one cart."""
        now = self._now()
        locked_conversation = self._lock_conversation(
            organisation=organisation,
            conversation=conversation,
        )
        if locked_conversation.status != CustomerAIConversation.STATUS_ACTIVE:
            raise CustomerCartValidationError(
                "A cart cannot be changed while this conversation is handled by staff."
            )
        approval_message = self._resolve_approval_message(
            conversation=locked_conversation,
            metadata=metadata,
        )
        if not self.approval_policy.is_explicit_approval(
            conversation=locked_conversation,
            message=approval_message,
            request=request,
        ):
            raise CustomerCartValidationError(
                "The customer did not explicitly approve this exact itinerary."
            )

        # The public token is deterministically derived from a secret and the
        # idempotency key. Duplicate webhook deliveries can therefore receive
        # the same URL although only its SHA-256 digest is stored in the DB.
        generated_token = self._derive_token(
            organisation_id=locked_conversation.organisation_id,
            conversation_id=locked_conversation.pk,
            idempotency_key=request.idempotency_key,
        )
        supplied_token = request.cart_token
        cart, public_token, created = self._resolve_cart(
            organisation=organisation,
            conversation=locked_conversation,
            request=request,
            generated_token=generated_token,
            supplied_token=supplied_token,
        )

        # A duplicate of the same accepted write returns the existing cart and
        # never consumes promotions or performs a second persistence mutation.
        if not created and cart.idempotency_key == request.idempotency_key:
            return self._result(
                organisation=organisation,
                conversation=locked_conversation,
                cart=cart,
                public_token=public_token,
                status="active",
            )

        raw_validated = self.validator.validate_for_checkout(
            organisation=organisation,
            conversation=locked_conversation,
            request=request,
            checked_at=now,
        )
        validated = self._normalize_validation(
            raw_validated,
            organisation=organisation,
            request=request,
        )
        if not (
            validated.age_restrictions_validated
            and validated.availability_validated
            and validated.pickup_validated
        ):
            raise CustomerCartValidationError(
                "The itinerary did not pass all checkout validations."
            )

        cart.status = CustomerItineraryCart.STATUS_ACTIVE
        cart.idempotency_key = request.idempotency_key
        cart.language = request.language
        cart.currency = validated.currency
        cart.subtotal = validated.subtotal
        cart.discount_total = validated.discount_total
        cart.total = validated.total
        cart.promotion_snapshot = list(validated.promotion_snapshot)
        cart.customer_approved = True
        cart.customer_approval_message = approval_message
        cart.customer_approved_at = approval_message.occurred_at
        cart.itinerary_revalidated_at = now
        cart.age_restrictions_validated_at = now
        cart.expires_at = now + self.cart_lifetime
        cart.converted_at = None
        cart.full_clean()
        cart.save()

        cart.items.all().delete()
        CustomerItineraryCartItem.objects.bulk_create(
            [self._line_model(cart=cart, line=line) for line in validated.lines]
        )

        return self._result(
            organisation=organisation,
            conversation=locked_conversation,
            cart=cart,
            public_token=public_token,
            status="active" if created else "updated",
        )

    def _resolve_cart(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        request: SaveCartRequest,
        generated_token: str,
        supplied_token: str | None,
    ) -> tuple[CustomerItineraryCart, str, bool]:
        if supplied_token:
            token_hash = CustomerItineraryCart.hash_token(supplied_token)
            try:
                cart = CustomerItineraryCart.objects.select_for_update().get(
                    organisation=organisation,
                    conversation=conversation,
                    token_hash=token_hash,
                )
            except CustomerItineraryCart.DoesNotExist as exc:
                raise CustomerCartValidationError(
                    "The cart link is invalid, expired, or belongs to another conversation."
                ) from exc
            if cart.status != CustomerItineraryCart.STATUS_ACTIVE or cart.is_expired:
                raise CustomerCartValidationError("The existing cart is no longer active.")
            return cart, supplied_token, False

        try:
            existing = CustomerItineraryCart.objects.select_for_update().get(
                organisation=organisation,
                idempotency_key=request.idempotency_key,
            )
        except CustomerItineraryCart.DoesNotExist:
            existing = None
        if existing is not None:
            if existing.conversation_id != conversation.pk:
                raise CustomerCartRepositoryError(
                    "The idempotency key belongs to another conversation."
                )
            expected_hash = CustomerItineraryCart.hash_token(generated_token)
            if not hmac.compare_digest(existing.token_hash, expected_hash):
                raise CustomerCartRepositoryError("The saved cart token is inconsistent.")
            return existing, generated_token, False

        cart = CustomerItineraryCart(
            organisation=organisation,
            conversation=conversation,
            token_hash=CustomerItineraryCart.hash_token(generated_token),
            idempotency_key=request.idempotency_key,
            language=request.language,
            currency="USD",  # replaced by authoritative validation before save
            subtotal=Decimal("0.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("0.00"),
            expires_at=self._now() + self.cart_lifetime,
        )
        return cart, generated_token, True

    def _lock_conversation(self, *, organisation: Any, conversation: Any) -> CustomerAIConversation:
        conversation_id = getattr(conversation, "pk", getattr(conversation, "id", None))
        organisation_id = getattr(organisation, "pk", getattr(organisation, "id", None))
        if not conversation_id or not organisation_id:
            raise CustomerCartValidationError("Organisation and conversation are required.")
        try:
            return CustomerAIConversation.objects.select_for_update().get(
                pk=conversation_id,
                organisation_id=organisation_id,
            )
        except CustomerAIConversation.DoesNotExist as exc:
            raise CustomerCartValidationError(
                "The customer conversation does not belong to this organisation."
            ) from exc

    def _resolve_approval_message(
        self,
        *,
        conversation: CustomerAIConversation,
        metadata: Mapping[str, Any],
    ) -> CustomerAIMessage:
        queryset = CustomerAIMessage.objects.select_for_update().filter(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
        )
        approval_id = metadata.get("approval_message_id")
        external_id = str(metadata.get("external_message_id") or "").strip()
        if approval_id not in (None, ""):
            queryset = queryset.filter(pk=approval_id)
        elif external_id:
            queryset = queryset.filter(external_message_id=external_id)
        else:
            raise CustomerCartValidationError(
                "The inbound message proving customer approval is required."
            )
        try:
            message = queryset.get()
        except (CustomerAIMessage.DoesNotExist, CustomerAIMessage.MultipleObjectsReturned) as exc:
            raise CustomerCartValidationError(
                "Customer approval could not be verified from this conversation."
            ) from exc
        if not str(message.text or "").strip():
            raise CustomerCartValidationError("The approval message is empty.")
        return message

    def _normalize_validation(
        self,
        raw: ValidatedCart | Mapping[str, Any],
        *,
        organisation: Any,
        request: SaveCartRequest,
    ) -> ValidatedCart:
        if isinstance(raw, ValidatedCart):
            result = raw
        elif isinstance(raw, Mapping):
            lines_raw = raw.get("lines")
            if not isinstance(lines_raw, Sequence) or isinstance(lines_raw, (str, bytes, Mapping)):
                raise CustomerCartRepositoryError("Validated cart lines are invalid.")
            result = ValidatedCart(
                lines=tuple(self._normalize_line(value) for value in lines_raw),
                currency=self._currency(raw.get("currency")),
                subtotal=self._money(raw.get("subtotal"), "subtotal"),
                discount_total=self._money(raw.get("discount_total"), "discount_total"),
                total=self._money(raw.get("total"), "total"),
                promotion_snapshot=tuple(raw.get("promotion_snapshot") or ()),
                age_restrictions_validated=raw.get("age_restrictions_validated") is True,
                availability_validated=raw.get("availability_validated") is True,
                pickup_validated=raw.get("pickup_validated") is True,
            )
        else:
            raise CustomerCartRepositoryError("The validator returned an invalid result.")

        if len(result.lines) != len(request.items) or not 1 <= len(result.lines) <= MAX_ITEMS:
            raise CustomerCartRepositoryError("Validated cart item count is inconsistent.")
        positions = [line.position for line in result.lines]
        if positions != list(range(1, len(result.lines) + 1)):
            raise CustomerCartRepositoryError("Validated cart positions are inconsistent.")
        expected_org_id = getattr(organisation, "pk", getattr(organisation, "id", None))
        for line, requested in zip(result.lines, request.items):
            product_org_id = getattr(line.product, "organisation_id", None)
            if str(product_org_id) != str(expected_org_id):
                raise CustomerCartRepositoryError("A validated product is cross-organisation.")
            if getattr(line.product, "pk", getattr(line.product, "id", None)) != requested.product_id:
                raise CustomerCartRepositoryError("A validated product does not match the request.")
            if line.service_date != requested.service_date:
                raise CustomerCartRepositoryError("A validated service date changed unexpectedly.")
            if line.currency != result.currency:
                raise CustomerCartRepositoryError("Cart items use multiple currencies.")
            self._reconcile(line.subtotal, line.discount, line.total, "line")
        self._reconcile(result.subtotal, result.discount_total, result.total, "cart")
        if sum((line.subtotal for line in result.lines), Decimal("0")) != result.subtotal:
            raise CustomerCartRepositoryError("Line subtotals do not equal the cart subtotal.")
        if sum((line.discount for line in result.lines), Decimal("0")) != result.discount_total:
            raise CustomerCartRepositoryError("Line discounts do not equal the cart discount.")
        return result

    def _normalize_line(self, raw: Any) -> ValidatedCartLine:
        if isinstance(raw, ValidatedCartLine):
            return raw
        if not isinstance(raw, Mapping):
            raise CustomerCartRepositoryError("A validated cart line is invalid.")
        availability = raw.get("availability_snapshot") or {}
        if not isinstance(availability, Mapping):
            raise CustomerCartRepositoryError("Availability snapshot must be an object.")
        return ValidatedCartLine(
            position=int(raw["position"]),
            product=raw["product"],
            service_date=raw["service_date"],
            adults=int(raw["adults"]),
            children=int(raw["children"]),
            infants=int(raw["infants"]),
            package_id=raw.get("package_id"),
            event_ticket_type_id=raw.get("event_ticket_type_id"),
            selected_external_option_id=str(raw.get("selected_external_option_id") or ""),
            pickup_location_id=raw.get("pickup_location_id"),
            product_name=str(raw.get("product_name") or "").strip(),
            option_name=str(raw.get("option_name") or "").strip(),
            pickup_name=str(raw.get("pickup_name") or "").strip(),
            pickup_time=raw.get("pickup_time"),
            unit_price=self._money(raw.get("unit_price"), "unit_price"),
            subtotal=self._money(raw.get("subtotal"), "line subtotal"),
            discount=self._money(raw.get("discount"), "line discount"),
            total=self._money(raw.get("total"), "line total"),
            currency=self._currency(raw.get("currency")),
            availability_snapshot=dict(availability),
        )

    @staticmethod
    def _line_model(
        *, cart: CustomerItineraryCart, line: ValidatedCartLine
    ) -> CustomerItineraryCartItem:
        return CustomerItineraryCartItem(
            cart=cart,
            position=line.position,
            product=line.product,
            service_date=line.service_date,
            adults=line.adults,
            children=line.children,
            infants=line.infants,
            package_id=line.package_id,
            event_ticket_type_id=line.event_ticket_type_id,
            selected_external_option_id=line.selected_external_option_id,
            pickup_location_id=line.pickup_location_id,
            product_name_snapshot=line.product_name,
            option_name_snapshot=line.option_name,
            pickup_name_snapshot=line.pickup_name,
            pickup_time_snapshot=line.pickup_time,
            unit_price_snapshot=line.unit_price,
            line_subtotal=line.subtotal,
            line_discount=line.discount,
            line_total=line.total,
            currency=line.currency,
            availability_snapshot=dict(line.availability_snapshot),
        )

    def _result(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        cart: CustomerItineraryCart,
        public_token: str,
        status: str,
    ) -> Mapping[str, Any]:
        url = self.checkout_url_builder.build_checkout_url(
            organisation=organisation,
            cart=cart,
            cart_token=public_token,
            language=cart.language,
        )
        self._validate_checkout_url(url)
        return {
            "organisation_id": cart.organisation_id,
            "conversation_id": conversation.pk,
            "customer_approval_verified": True,
            "itinerary_revalidated": True,
            "age_restrictions_validated": True,
            "booking_created": False,
            "payment_created": False,
            "inventory_reserved": False,
            "status": status,
            "cart_token": public_token,
            "item_count": cart.items.count(),
            "currency": cart.currency,
            "subtotal": str(cart.subtotal),
            "discount_total": str(cart.discount_total),
            "total": str(cart.total),
            "expires_at": cart.expires_at.isoformat(),
            "checkout_url": url,
        }

    @staticmethod
    def _derive_token(
        *, organisation_id: Any, conversation_id: Any, idempotency_key: str
    ) -> str:
        secret = str(settings.SECRET_KEY).encode("utf-8")
        material = f"customer-cart:{organisation_id}:{conversation_id}:{idempotency_key}"
        digest = hmac.new(secret, material.encode("utf-8"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")

    def _now(self) -> datetime:
        result = self.clock()
        if not isinstance(result, datetime):
            raise CustomerCartRepositoryError("The clock returned an invalid value.")
        return result

    @staticmethod
    def _money(value: Any, field: str) -> Decimal:
        try:
            result = Decimal(str(value)).quantize(MONEY_PLACES)
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise CustomerCartRepositoryError(f"{field} is invalid.") from exc
        if not result.is_finite() or result < 0:
            raise CustomerCartRepositoryError(f"{field} is invalid.")
        return result

    @staticmethod
    def _currency(value: Any) -> str:
        result = str(value or "").strip().upper()
        if not re.fullmatch(r"[A-Z]{3}", result):
            raise CustomerCartRepositoryError("Cart currency is invalid.")
        return result

    @staticmethod
    def _reconcile(subtotal: Decimal, discount: Decimal, total: Decimal, label: str) -> None:
        if discount > subtotal or (subtotal - discount).quantize(MONEY_PLACES) != total:
            raise CustomerCartRepositoryError(f"The {label} totals do not reconcile.")

    @staticmethod
    def _validate_checkout_url(value: Any) -> None:
        parsed = urlparse(str(value or ""))
        if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
            raise CustomerCartRepositoryError("The checkout URL builder returned an unsafe URL.")


__all__ = [
    "CustomerCartApprovalPolicy",
    "CustomerCartValidator",
    "CustomerCheckoutURLBuilder",
    "DjangoCustomerCartService",
    "ValidatedCart",
    "ValidatedCartLine",
]
