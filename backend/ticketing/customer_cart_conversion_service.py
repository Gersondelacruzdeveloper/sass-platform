"""Atomic conversion of an approved customer itinerary cart into a booking."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from django.db import transaction
from django.utils import timezone

from ticketing.ai.customer.cart_components import DjangoCustomerCartValidator
from ticketing.ai.customer.cart_tools import (
    CartItemRequest,
    CustomerCartRepositoryError,
    CustomerCartValidationError,
    SaveCartRequest,
)
from ticketing.customer_ai_models import CustomerItineraryCart
from ticketing.serializers import BookingSerializer


MONEY = Decimal("0.01")
PAYMENT_CHOICES = frozenset({"full", "deposit", "pending", "cash"})


class CustomerCartConversionError(RuntimeError):
    """Base exception for public cart conversion failures."""

    code = "cart_conversion_failed"


class CustomerCartConversionNotFoundError(CustomerCartConversionError):
    code = "invalid_token"


class CustomerCartConversionValidationError(CustomerCartConversionError):
    code = "cart_not_convertible"


class CustomerCartConversionChangedError(CustomerCartConversionError):
    code = "cart_changed"


class CustomerCartConversionRepositoryError(CustomerCartConversionError):
    code = "cart_conversion_unavailable"


@dataclass(frozen=True)
class CustomerCartCheckoutDetails:
    customer_name: str
    customer_whatsapp: str
    customer_email: str
    customer_hotel: str = ""
    customer_notes: str = ""
    payment_choice: str = "pending"


@dataclass(frozen=True)
class CustomerCartConversionResult:
    booking: Any
    cart: CustomerItineraryCart
    created: bool


class DjangoCustomerCartConversionService:
    """Lock, revalidate, price, book, and consume one public cart token."""

    def __init__(self, *, validator=None, clock=None) -> None:
        self.validator = validator or DjangoCustomerCartValidator()
        self.clock = clock or timezone.now
        if not callable(getattr(self.validator, "validate_for_checkout", None)):
            raise CustomerCartConversionRepositoryError(
                "The cart checkout validator is invalid."
            )
        if not callable(self.clock):
            raise CustomerCartConversionRepositoryError(
                "The cart conversion clock is invalid."
            )

    @transaction.atomic
    def convert(
        self,
        *,
        organisation: Any,
        raw_token: str,
        checkout: CustomerCartCheckoutDetails,
        request: Any = None,
    ) -> CustomerCartConversionResult:
        self._validate_checkout_details(checkout)
        token_hash = self._token_hash(raw_token)

        cart = (
            CustomerItineraryCart.objects.select_for_update()
            .select_related(
                "organisation",
                "conversation",
            )
            .filter(
                organisation=organisation,
                token_hash=token_hash,
            )
            .first()
        )
        if cart is None:
            raise CustomerCartConversionNotFoundError(
                "The cart session could not be found."
            )

        if cart.converted_booking_id:
            return CustomerCartConversionResult(
                booking=cart.converted_booking,
                cart=cart,
                created=False,
            )
        if cart.status != CustomerItineraryCart.STATUS_ACTIVE:
            raise CustomerCartConversionValidationError(
                "The cart session is no longer active."
            )
        if cart.is_expired:
            raise CustomerCartConversionValidationError(
                "The cart session has expired."
            )
        if not cart.can_checkout:
            raise CustomerCartConversionValidationError(
                "The cart session is not ready for checkout."
            )

        items = list(
            cart.items.select_for_update()
            .select_related("product")
            .order_by("position", "pk")
        )
        if not items:
            raise CustomerCartConversionValidationError(
                "The cart session has no itinerary items."
            )
        self._require_one_party(items)

        checked_at = self.clock()
        save_request = self._build_validation_request(cart, items, raw_token)
        try:
            validated = self.validator.validate_for_checkout(
                organisation=organisation,
                conversation=cart.conversation,
                request=save_request,
                checked_at=checked_at,
            )
        except CustomerCartValidationError as exc:
            raise CustomerCartConversionChangedError(str(exc)) from exc
        except CustomerCartRepositoryError as exc:
            raise CustomerCartConversionRepositoryError(
                "The itinerary could not be revalidated."
            ) from exc

        self._assert_unchanged(cart, items, validated)
        payment_choice = checkout.payment_choice.strip().lower()
        deposit_required = self._deposit_required(
            payment_choice=payment_choice,
            lines=validated.lines,
        )
        payload = self._booking_payload(
            cart=cart,
            validated=validated,
            checkout=checkout,
            payment_choice=payment_choice,
            deposit_required=deposit_required,
        )

        serializer = BookingSerializer(
            data=payload,
            context={"request": request, "organisation": organisation},
        )
        if not serializer.is_valid():
            raise CustomerCartConversionValidationError(
                "The itinerary could not be converted into a booking."
            )
        booking = serializer.save(organisation=organisation)
        booking.refresh_from_db()

        if self._money(booking.subtotal_amount) != self._money(validated.subtotal):
            raise CustomerCartConversionRepositoryError(
                "The booking subtotal did not reconcile with the cart."
            )
        if self._money(booking.discount_amount) != self._money(
            validated.discount_total
        ):
            raise CustomerCartConversionRepositoryError(
                "The booking discount did not reconcile with the cart."
            )
        if self._money(booking.total_amount) != self._money(validated.total):
            raise CustomerCartConversionRepositoryError(
                "The booking total did not reconcile with the cart."
            )

        cart.status = CustomerItineraryCart.STATUS_CONVERTED
        cart.converted_booking = booking
        cart.converted_at = checked_at
        # A customer may leave Stripe/PayPal and return to the original link.
        # Keep the recovery token useful for a full day after conversion.
        cart.expires_at = max(cart.expires_at, checked_at + timedelta(hours=24))
        cart.itinerary_revalidated_at = checked_at
        cart.save(
            update_fields=(
                "status",
                "converted_booking",
                "converted_at",
                "expires_at",
                "itinerary_revalidated_at",
                "updated_at",
            )
        )
        return CustomerCartConversionResult(
            booking=booking,
            cart=cart,
            created=True,
        )

    @staticmethod
    def _validate_checkout_details(checkout: CustomerCartCheckoutDetails) -> None:
        if not isinstance(checkout, CustomerCartCheckoutDetails):
            raise CustomerCartConversionValidationError(
                "Checkout details are required."
            )
        required = {
            "customer_name": checkout.customer_name,
            "customer_whatsapp": checkout.customer_whatsapp,
            "customer_email": checkout.customer_email,
        }
        for field, value in required.items():
            if not str(value or "").strip():
                raise CustomerCartConversionValidationError(
                    f"{field} is required."
                )
        if checkout.payment_choice.strip().lower() not in PAYMENT_CHOICES:
            raise CustomerCartConversionValidationError(
                "The selected payment option is invalid."
            )

    @staticmethod
    def _token_hash(raw_token: str) -> str:
        try:
            return CustomerItineraryCart.hash_token(raw_token)
        except ValueError as exc:
            raise CustomerCartConversionNotFoundError(
                "The cart session could not be found."
            ) from exc

    @staticmethod
    def _require_one_party(items) -> None:
        parties = {
            (item.adults, item.children, item.infants)
            for item in items
        }
        if len(parties) != 1:
            raise CustomerCartConversionValidationError(
                "All itinerary items must use the same passenger group."
            )

    @staticmethod
    def _build_validation_request(cart, items, raw_token) -> SaveCartRequest:
        return SaveCartRequest(
            cart_token=str(raw_token).strip(),
            items=tuple(
                CartItemRequest(
                    position=item.position,
                    product_id=item.product_id,
                    service_date=item.service_date,
                    adults=item.adults,
                    children=item.children,
                    infants=item.infants,
                    package_id=item.package_id,
                    event_ticket_type_id=item.event_ticket_type_id,
                    selected_external_option_id=(
                        item.selected_external_option_id or None
                    ),
                    pickup_location_id=item.pickup_location_id,
                )
                for item in items
            ),
            language=cart.language or "en",
            customer_approved=True,
            idempotency_key=f"convert:{cart.pk}",
        )

    def _assert_unchanged(self, cart, stored_items, validated) -> None:
        if str(validated.currency).upper() != str(cart.currency).upper():
            raise CustomerCartConversionChangedError(
                "The itinerary currency changed."
            )
        money_pairs = (
            (validated.subtotal, cart.subtotal),
            (validated.discount_total, cart.discount_total),
            (validated.total, cart.total),
        )
        if any(
            self._money(current) != self._money(saved)
            for current, saved in money_pairs
        ):
            raise CustomerCartConversionChangedError(
                "The itinerary price or promotion changed."
            )
        if len(validated.lines) != len(stored_items):
            raise CustomerCartConversionChangedError(
                "The itinerary items changed."
            )
        for stored, current in zip(stored_items, validated.lines, strict=True):
            identity = (
                current.position,
                current.product.pk,
                current.service_date,
                current.adults,
                current.children,
                current.infants,
                current.package_id,
                current.event_ticket_type_id,
                current.selected_external_option_id or "",
                current.pickup_location_id,
            )
            expected = (
                stored.position,
                stored.product_id,
                stored.service_date,
                stored.adults,
                stored.children,
                stored.infants,
                stored.package_id,
                stored.event_ticket_type_id,
                stored.selected_external_option_id or "",
                stored.pickup_location_id,
            )
            if identity != expected:
                raise CustomerCartConversionChangedError(
                    "An itinerary item changed."
                )

    def _booking_payload(
        self,
        *,
        cart,
        validated,
        checkout,
        payment_choice,
        deposit_required,
    ) -> dict[str, Any]:
        first = validated.lines[0]
        discount_percent = Decimal("0.00")
        if self._money(validated.subtotal) > 0:
            discount_percent = (
                self._money(validated.discount_total)
                / self._money(validated.subtotal)
                * Decimal("100")
            ).quantize(MONEY, rounding=ROUND_HALF_UP)
        payment_mode = {
            "full": "customer_full_online",
            "deposit": "customer_deposit_online",
            "cash": "customer_cash_to_seller",
            "pending": "pending_payment",
        }[payment_choice]
        payment_method = (
            "online"
            if payment_choice in {"full", "deposit"}
            else "cash" if payment_choice == "cash" else "none"
        )
        payments = []
        if payment_choice in {"full", "deposit"}:
            payments.append(
                {
                    "amount": deposit_required,
                    "payment_type": payment_choice,
                    "payer_type": "customer",
                    "method": "online",
                    "status": "pending",
                    "reference": "",
                    "note": "Customer selected secure online payment.",
                }
            )

        return {
            "primary_product": first.product.pk,
            "source": "public_site",
            "status": "pending_payment",
            "payment_status": (
                "pending" if payment_choice in {"full", "deposit"} else "unpaid"
            ),
            "payment_mode": payment_mode,
            "payment_method": payment_method,
            "customer_language": cart.language or "en",
            "service_date": first.service_date,
            "service_time": first.pickup_time,
            "customer_name": checkout.customer_name.strip(),
            "customer_whatsapp": checkout.customer_whatsapp.strip(),
            "customer_email": checkout.customer_email.strip(),
            # Pickup is server-validated cart data. Prefer it over a stale or
            # browser-edited hotel field while retaining the latter as a safe
            # fallback for products that do not use a configured pickup.
            "customer_hotel": (
                str(first.pickup_name or "").strip()
                or checkout.customer_hotel.strip()
            ),
            "customer_notes": checkout.customer_notes.strip(),
            "adults": first.adults,
            "children": first.children,
            "infants": first.infants,
            "subtotal_amount": validated.subtotal,
            # The finance engine models every customer discount inside an
            # allowance. With no seller, this is the organisation-funded,
            # server-validated promotion allowance; commission remains zero.
            "seller_margin_percent": discount_percent,
            "customer_discount_percent": discount_percent,
            "discount_amount": validated.discount_total,
            "total_amount": validated.total,
            "deposit_required": deposit_required,
            "deposit_paid": Decimal("0.00"),
            "balance_due": validated.total,
            "items_payload": [
                self._booking_item_payload(line)
                for line in validated.lines
            ],
            "payments_payload": payments,
        }

    @staticmethod
    def _booking_item_payload(line) -> dict[str, Any]:
        instructions = [
            (
                f"Passengers: {line.adults} adults, {line.children} children, "
                f"{line.infants} infants"
            ),
            f"Pickup: {line.pickup_name}" if line.pickup_name else "",
            f"Pickup time: {line.pickup_time}" if line.pickup_time else "",
            (
                f"Promotion discount: {line.discount} {line.currency}"
                if line.discount
                else ""
            ),
        ]
        return {
            "product_id": line.product.pk,
            "product_name": line.product_name,
            "service_date": line.service_date,
            "service_time": line.pickup_time,
            "quantity": 1,
            "unit_price": line.subtotal,
            "instructions": "\n".join(value for value in instructions if value),
            "selected_external_product_id": (
                line.selected_external_option_id or ""
            ),
            "package_id": line.package_id,
            "event_ticket_type_id": line.event_ticket_type_id,
        }

    def _deposit_required(self, *, payment_choice, lines) -> Decimal:
        if payment_choice == "full":
            return self._money(sum((line.total for line in lines), Decimal("0")))
        if payment_choice != "deposit":
            return Decimal("0.00")

        required = Decimal("0.00")
        for line in lines:
            product = line.product
            amount = self._money(getattr(product, "deposit_amount", 0))
            percentage = self._money(
                getattr(product, "deposit_percentage", 0)
            )
            passengers = line.adults + line.children + line.infants
            if amount > 0:
                line_required = amount * passengers
            elif percentage > 0:
                line_required = line.total * percentage / Decimal("100")
            else:
                line_required = Decimal("0")
            required += min(self._money(line.total), self._money(line_required))
        required = self._money(required)
        if required <= 0:
            raise CustomerCartConversionValidationError(
                "A deposit is not configured for this itinerary."
            )
        return required

    @staticmethod
    def _money(value: Any) -> Decimal:
        return Decimal(str(value or "0")).quantize(
            MONEY,
            rounding=ROUND_HALF_UP,
        )


__all__ = [
    "CustomerCartCheckoutDetails",
    "CustomerCartConversionChangedError",
    "CustomerCartConversionError",
    "CustomerCartConversionNotFoundError",
    "CustomerCartConversionRepositoryError",
    "CustomerCartConversionResult",
    "CustomerCartConversionValidationError",
    "DjangoCustomerCartConversionService",
]
