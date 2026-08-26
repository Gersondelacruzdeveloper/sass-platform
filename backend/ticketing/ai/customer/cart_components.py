"""Authoritative components for temporary customer itinerary carts.

These components revalidate the proposed itinerary immediately before the
existing ``DjangoCustomerCartService`` persists it. They create no booking,
payment, or inventory reservation. Checkout URLs are derived only from the
current organisation's configured domain.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Mapping
from urllib.parse import urlencode, urlparse

from django.conf import settings
from django.utils import timezone

from ticketing.ai.customer.cart_tools import (
    CustomerCartRepositoryError,
    CustomerCartValidationError,
    SaveCartRequest,
)
from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerItineraryRepository,
)
from ticketing.ai.customer.itinerary_tools import ItineraryItemRequest
from ticketing.ai.customer.promotion_repository import (
    DjangoCustomerPromotionRepository,
)
from ticketing.ai.customer.promotion_tools import (
    PromotionEvaluationRequest,
    PromotionItemRequest,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
)
from ticketing.customer_cart_service import (
    ValidatedCart,
    ValidatedCartLine,
)
from ticketing.models import ExperienceProduct


MONEY = Decimal("0.01")
AFFIRMATIVE_PATTERNS = (
    r"\byes\b",
    r"\byep\b",
    r"\byeah\b",
    r"\bconfirm(?:ed)?\b",
    r"\bapprove(?:d)?\b",
    r"\bbook (?:it|them|those)\b",
    r"\bgo ahead\b",
    r"\bproceed\b",
    r"\bs[ií]\b",
    r"\bclaro\b",
    r"\bconfirmo\b",
    r"\breserv(?:a|ar|emos)\b",
    r"\bdale\b",
    r"\bperfecto\b",
    r"\boui\b",
    r"\bconfirme\b",
)
NEGATIVE_PATTERN = re.compile(
    r"\b(no|not|don't|do not|cancel|change|different|wait|todav[ií]a no|annuler)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CustomerCartComponents:
    validator: Any
    checkout_url_builder: Any
    approval_policy: Any

    def __getitem__(self, key: str) -> Any:
        if key not in {"validator", "checkout_url_builder", "approval_policy"}:
            raise KeyError(key)
        return getattr(self, key)


def _tenant_domain(organisation: Any) -> str:
    raw = ""
    try:
        public_settings = organisation.ticketing_public_site_settings
        raw = str(getattr(public_settings, "custom_domain", "") or "").strip()
    except Exception:
        pass

    if not raw:
        try:
            domain = organisation.domains.filter(is_primary=True).first()
            if domain is None:
                domain = organisation.domains.order_by("pk").first()
        except Exception as exc:
            raise CustomerCartRepositoryError(
                "The organisation's public domain could not be resolved."
            ) from exc
        raw = str(getattr(domain, "domain", "") or "").strip()

    if not raw:
        raise CustomerCartRepositoryError(
            "The organisation has no public checkout domain."
        )
    base = raw if "://" in raw else f"https://{raw}"
    parsed = urlparse(base)
    if (
        parsed.scheme != "https"
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise CustomerCartRepositoryError(
            "The organisation's public checkout domain is invalid."
        )
    return f"https://{parsed.netloc}"


class DjangoCustomerCheckoutURLBuilder:
    """Build the frontend cart-session route on the current tenant domain."""

    def build_checkout_url(
        self,
        *,
        organisation: Any,
        cart: CustomerItineraryCart,
        cart_token: str,
        language: str,
    ) -> str:
        if cart.organisation_id != getattr(organisation, "pk", None):
            raise CustomerCartRepositoryError(
                "The cart belongs to another organisation."
            )
        token = str(cart_token or "").strip()
        if not token:
            raise CustomerCartRepositoryError("A cart token is required.")
        path = str(
            getattr(settings, "CUSTOMER_AI_CART_CHECKOUT_PATH", "/checkout")
            or "/checkout"
        ).strip()
        if not path.startswith("/") or "?" in path or "#" in path:
            raise CustomerCartRepositoryError(
                "CUSTOMER_AI_CART_CHECKOUT_PATH is invalid."
            )
        query = urlencode(
            {
                "cart_session": token,
                "lang": str(language or "").strip().lower() or "en",
            }
        )
        return f"{_tenant_domain(organisation)}{path}?{query}"


class ExplicitCustomerCartApprovalPolicy:
    """Require an affirmative reply to the immediately preceding proposal."""

    def is_explicit_approval(
        self,
        *,
        conversation: CustomerAIConversation,
        message: CustomerAIMessage,
        request: SaveCartRequest,
    ) -> bool:
        if (
            message.conversation_id != conversation.pk
            or message.direction != CustomerAIMessage.DIRECTION_INBOUND
            or message.role != CustomerAIMessage.ROLE_CUSTOMER
            or request.customer_approved is not True
        ):
            return False
        text = self._normalise(message.text)
        if not text or NEGATIVE_PATTERN.search(text):
            return False
        if not any(re.search(pattern, text, re.IGNORECASE) for pattern in AFFIRMATIVE_PATTERNS):
            return False

        proposal = (
            CustomerAIMessage.objects.filter(
                conversation=conversation,
                direction=CustomerAIMessage.DIRECTION_OUTBOUND,
                role=CustomerAIMessage.ROLE_ASSISTANT,
                occurred_at__lt=message.occurred_at,
            )
            .order_by("-occurred_at", "-pk")
            .first()
        )
        if proposal is None or not str(proposal.text or "").strip():
            return False

        # Bind approval to visible proposal facts. Every requested date and
        # product name must appear in the immediately preceding assistant text.
        proposal_text = self._normalise(proposal.text)
        product_ids = {item.product_id for item in request.items}
        products = {
            product.pk: product.name
            for product in ExperienceProduct.objects.filter(
                organisation=conversation.organisation,
                pk__in=product_ids,
                is_active=True,
                public_enabled=True,
                status="active",
            )
        }
        if set(products) != product_ids:
            return False
        for item in request.items:
            date_variants = {
                item.service_date.isoformat().casefold(),
                item.service_date.strftime("%B %d, %Y").casefold(),
                item.service_date.strftime("%B %-d, %Y").casefold(),
                item.service_date.strftime("%b %d, %Y").casefold(),
                item.service_date.strftime("%d/%m/%Y").casefold(),
            }
            if not any(value in proposal_text for value in date_variants):
                return False
            product_name = self._normalise(products[item.product_id])
            if product_name not in proposal_text:
                return False
        return True

    @staticmethod
    def _normalise(value: Any) -> str:
        return re.sub(r"\s+", " ", str(value or "").strip().casefold())


class DjangoCustomerCartValidator:
    """Revalidate every itinerary line using current tenant-owned data."""

    def __init__(self) -> None:
        self.itinerary = DjangoCustomerItineraryRepository()
        self.promotions = DjangoCustomerPromotionRepository()

    def validate_for_checkout(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        request: SaveCartRequest,
        checked_at: datetime,
    ) -> ValidatedCart:
        if conversation.organisation_id != getattr(organisation, "pk", None):
            raise CustomerCartValidationError(
                "The conversation belongs to another organisation."
            )
        if not isinstance(checked_at, datetime):
            raise CustomerCartRepositoryError("The checkout validation time is invalid.")

        lines: list[ValidatedCartLine] = []
        currency: str | None = None
        for position, requested in enumerate(request.items, start=1):
            itinerary_item = ItineraryItemRequest(
                position=position,
                product_id=requested.product_id,
                service_date=requested.service_date,
                adults=requested.adults,
                children=requested.children,
                infants=requested.infants,
                package_id=requested.package_id,
                event_ticket_type_id=requested.event_ticket_type_id,
                selected_external_option_id=requested.selected_external_option_id,
                pickup_location_id=requested.pickup_location_id,
            )
            result = self.itinerary.validate_item(
                organisation=organisation,
                conversation=conversation,
                item=itinerary_item,
                language=request.language,
            )
            if result.get("status") != "valid":
                issues = result.get("issues") or ["The itinerary item is unavailable."]
                raise CustomerCartValidationError(str(issues[0]))

            product = ExperienceProduct.objects.filter(
                pk=requested.product_id,
                organisation=organisation,
                is_active=True,
                public_enabled=True,
                status="active",
            ).first()
            if product is None:
                raise CustomerCartValidationError(
                    "A cart product is no longer public and active."
                )
            self._validate_age_restriction(product, requested)

            line_currency = str(result.get("currency") or "").strip().upper()
            if len(line_currency) != 3:
                raise CustomerCartRepositoryError("A cart line has no valid currency.")
            if currency is None:
                currency = line_currency
            elif currency != line_currency:
                raise CustomerCartValidationError(
                    "All itinerary items must use the same currency."
                )

            subtotal = self._money(result.get("price_total"), "line subtotal")
            passengers = requested.adults + requested.children + requested.infants
            unit_price = (subtotal / Decimal(passengers)).quantize(
                MONEY, rounding=ROUND_HALF_UP
            )
            lines.append(
                ValidatedCartLine(
                    position=position,
                    product=product,
                    service_date=requested.service_date,
                    adults=requested.adults,
                    children=requested.children,
                    infants=requested.infants,
                    package_id=requested.package_id,
                    event_ticket_type_id=requested.event_ticket_type_id,
                    selected_external_option_id=str(
                        requested.selected_external_option_id or ""
                    ),
                    pickup_location_id=requested.pickup_location_id,
                    product_name=product.name,
                    option_name="",
                    pickup_name=str(result.get("pickup_location_name") or ""),
                    pickup_time=result.get("pickup_time"),
                    unit_price=unit_price,
                    subtotal=subtotal,
                    discount=Decimal("0.00"),
                    total=subtotal,
                    currency=line_currency,
                    availability_snapshot=self._json_safe(
                        {
                            "status": result.get("availability_status"),
                            "checked_at": checked_at,
                            "inventory_reserved": False,
                        }
                    ),
                )
            )

        subtotal = sum((line.subtotal for line in lines), Decimal("0.00")).quantize(
            MONEY
        )
        evaluation = self.promotions.evaluate_itinerary_promotions(
            organisation=organisation,
            conversation=conversation,
            request=self._promotion_request(request),
        )
        lines, discount_total, promotion_snapshot = self._apply_promotions(
            lines,
            evaluation=evaluation,
            expected_organisation_id=organisation.pk,
            expected_currency=currency or "USD",
            expected_subtotal=subtotal,
        )
        total = (subtotal - discount_total).quantize(MONEY)
        return ValidatedCart(
            lines=tuple(lines),
            currency=currency or "USD",
            subtotal=subtotal,
            discount_total=discount_total,
            total=total,
            promotion_snapshot=promotion_snapshot,
            age_restrictions_validated=True,
            availability_validated=True,
            pickup_validated=True,
        )

    @staticmethod
    def _promotion_request(request: SaveCartRequest) -> PromotionEvaluationRequest:
        return PromotionEvaluationRequest(
            items=tuple(
                PromotionItemRequest(
                    position=position,
                    product_id=item.product_id,
                    service_date=item.service_date,
                    adults=item.adults,
                    children=item.children,
                    infants=item.infants,
                    package_id=item.package_id,
                    event_ticket_type_id=item.event_ticket_type_id,
                    selected_external_option_id=item.selected_external_option_id,
                    pickup_location_id=item.pickup_location_id,
                )
                for position, item in enumerate(request.items, start=1)
            )
        )

    @classmethod
    def _apply_promotions(
        cls,
        lines: list[ValidatedCartLine],
        *,
        evaluation: Mapping[str, Any],
        expected_organisation_id: Any,
        expected_currency: str,
        expected_subtotal: Decimal,
    ) -> tuple[
        list[ValidatedCartLine],
        Decimal,
        tuple[Mapping[str, Any], ...],
    ]:
        if not isinstance(evaluation, Mapping):
            raise CustomerCartRepositoryError(
                "The promotion evaluation is invalid."
            )
        if str(evaluation.get("organisation_id")) != str(
            expected_organisation_id
        ):
            raise CustomerCartRepositoryError(
                "The promotion evaluation belongs to another organisation."
            )
        if str(evaluation.get("currency") or "").upper() != expected_currency:
            raise CustomerCartRepositoryError(
                "The promotion evaluation uses another currency."
            )
        evaluated_subtotal = cls._money(
            evaluation.get("subtotal"), "promotion subtotal"
        )
        if evaluated_subtotal != expected_subtotal:
            raise CustomerCartRepositoryError(
                "The promotion subtotal does not match the validated cart."
            )

        promotions = evaluation.get("promotions") or []
        if not isinstance(promotions, (list, tuple)):
            raise CustomerCartRepositoryError(
                "The applied promotion list is invalid."
            )
        discounts = {line.position: Decimal("0.00") for line in lines}
        line_map = {line.position: line for line in lines}
        snapshots: list[Mapping[str, Any]] = []

        for raw in promotions:
            if not isinstance(raw, Mapping):
                raise CustomerCartRepositoryError(
                    "An applied promotion is invalid."
                )
            amount = cls._money(
                raw.get("discount_amount"), "promotion discount"
            )
            raw_positions = raw.get("eligible_item_positions") or []
            if not isinstance(raw_positions, (list, tuple)):
                raise CustomerCartRepositoryError(
                    "Promotion item positions are invalid."
                )
            positions = list(dict.fromkeys(int(value) for value in raw_positions))
            if not positions or any(position not in line_map for position in positions):
                raise CustomerCartRepositoryError(
                    "A promotion references an unknown cart line."
                )
            available = {
                position: (
                    line_map[position].subtotal - discounts[position]
                ).quantize(MONEY)
                for position in positions
            }
            available_total = sum(available.values(), Decimal("0.00")).quantize(
                MONEY
            )
            if amount > available_total:
                raise CustomerCartRepositoryError(
                    "A promotion discount exceeds its eligible cart lines."
                )

            allocated = cls._allocate_discount(
                amount,
                available=available,
                positions=positions,
            )
            remaining = amount
            for position in positions:
                share = allocated[position]
                discounts[position] = (discounts[position] + share).quantize(MONEY)
                remaining = (remaining - share).quantize(MONEY)
            if remaining != Decimal("0.00"):
                raise CustomerCartRepositoryError(
                    "A promotion discount could not be reconciled."
                )
            snapshots.append(
                {
                    "promotion_id": int(raw["promotion_id"]),
                    "name": str(raw.get("name") or "").strip(),
                    "description": str(raw.get("description") or "").strip(),
                    "discount_amount": format(amount, "f"),
                    "currency": expected_currency,
                    "eligible_item_positions": positions,
                }
            )

        discount_total = sum(discounts.values(), Decimal("0.00")).quantize(MONEY)
        expected_discount = cls._money(
            evaluation.get("discount_total"), "promotion discount total"
        )
        expected_final = cls._money(
            evaluation.get("final_total"), "promotion final total"
        )
        if (
            discount_total != expected_discount
            or (expected_subtotal - discount_total).quantize(MONEY) != expected_final
        ):
            raise CustomerCartRepositoryError(
                "Promotion totals do not reconcile with the validated cart."
            )

        updated = [
            replace(
                line,
                discount=discounts[line.position],
                total=(line.subtotal - discounts[line.position]).quantize(MONEY),
            )
            for line in lines
        ]
        return updated, discount_total, tuple(snapshots)

    @staticmethod
    def _allocate_discount(
        amount: Decimal,
        *,
        available: Mapping[int, Decimal],
        positions: list[int],
    ) -> dict[int, Decimal]:
        """Allocate exact cents proportionally without exceeding a line."""
        total_cents = int((amount / MONEY).to_integral_exact())
        available_cents = {
            position: int((available[position] / MONEY).to_integral_exact())
            for position in positions
        }
        weight_total = sum(available_cents.values())
        if total_cents < 0 or total_cents > weight_total:
            raise CustomerCartRepositoryError(
                "A promotion cannot be allocated to its eligible lines."
            )
        if total_cents == 0:
            return {position: Decimal("0.00") for position in positions}

        shares = {
            position: min(
                available_cents[position],
                (total_cents * available_cents[position]) // weight_total,
            )
            for position in positions
        }
        remaining = total_cents - sum(shares.values())
        # The proportional floors leave fewer than N cents. Give one cent at a
        # time in stable itinerary order, only where capacity remains.
        while remaining:
            progressed = False
            for position in positions:
                if shares[position] < available_cents[position]:
                    shares[position] += 1
                    remaining -= 1
                    progressed = True
                    if remaining == 0:
                        break
            if not progressed:
                raise CustomerCartRepositoryError(
                    "A promotion discount could not be allocated exactly."
                )
        return {
            position: Decimal(shares[position]) * MONEY
            for position in positions
        }

    @staticmethod
    def _validate_age_restriction(product: ExperienceProduct, item: Any) -> None:
        restriction = str(product.event_age_restriction or "").strip()
        if restriction and (item.children > 0 or item.infants > 0):
            raise CustomerCartValidationError(
                "This product has an age restriction. Continue through checkout "
                "only with eligible adult guests or ask staff for help."
            )

    @staticmethod
    def _money(value: Any, label: str) -> Decimal:
        try:
            result = Decimal(str(value)).quantize(MONEY)
        except Exception as exc:
            raise CustomerCartRepositoryError(f"The {label} is invalid.") from exc
        if not result.is_finite() or result < 0:
            raise CustomerCartRepositoryError(f"The {label} is invalid.")
        return result

    @classmethod
    def _json_safe(cls, value: Any) -> Any:
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, date):
            return value.isoformat()
        if isinstance(value, Decimal):
            return str(value)
        if isinstance(value, Mapping):
            return {str(key): cls._json_safe(item) for key, item in value.items()}
        if isinstance(value, (list, tuple)):
            return [cls._json_safe(item) for item in value]
        return value


class DjangoCustomerCartComponentFactory:
    def build_customer_cart_components(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
    ) -> CustomerCartComponents:
        if conversation.organisation_id != getattr(organisation, "pk", None):
            raise CustomerCartRepositoryError(
                "The conversation belongs to another organisation."
            )
        # Resolve now so a missing/invalid tenant domain disables cart exposure
        # before the AI can promise a checkout link.
        _tenant_domain(organisation)
        return CustomerCartComponents(
            validator=DjangoCustomerCartValidator(),
            checkout_url_builder=DjangoCustomerCheckoutURLBuilder(),
            approval_policy=ExplicitCustomerCartApprovalPolicy(),
        )


__all__ = [
    "CustomerCartComponents",
    "DjangoCustomerCartComponentFactory",
    "DjangoCustomerCartValidator",
    "DjangoCustomerCheckoutURLBuilder",
    "ExplicitCustomerCartApprovalPolicy",
]
