"""Owner-controlled customer promotion evaluation.

This repository is read-only. It resolves dedicated ``CustomerPromotionRule``
records, revalidates each itinerary item through current ticketing services,
and returns deterministic totals. It never reads seller margin/discount fields,
mutates usage, writes a cart, creates a booking, or records a payment.

The dedicated model must be installed before configuring this repository. That
intentional boundary prevents seller commission rules from being exposed as
public customer promotions.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Mapping, Sequence

from django.apps import apps
from django.db.models import Q
from django.utils import timezone

from ticketing.ai.customer.django_tool_adapters import (
    DjangoCustomerItineraryRepository,
)
from ticketing.ai.customer.itinerary_tools import ItineraryItemRequest
from ticketing.ai.customer.promotion_tools import (
    CustomerPromotionRepositoryError,
    PromotionEvaluationRequest,
)


MONEY = Decimal("0.01")
PERCENT = Decimal("100.00")
MAX_RULES = 20
PROMOTION_MODEL_NAME = "CustomerPromotionRule"


class CustomerPromotionConfigurationError(CustomerPromotionRepositoryError):
    """Raised when the dedicated owner promotion model is unavailable."""


class DjangoCustomerPromotionRepository:
    """Evaluate active public rules belonging to exactly one organisation."""

    def __init__(self) -> None:
        self.itinerary = DjangoCustomerItineraryRepository()

    def evaluate_itinerary_promotions(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: PromotionEvaluationRequest,
    ) -> Mapping[str, Any]:
        organisation_id = getattr(organisation, "pk", None)
        if not organisation_id:
            raise CustomerPromotionRepositoryError("An organisation is required.")
        if getattr(conversation, "organisation_id", None) != organisation_id:
            raise CustomerPromotionRepositoryError(
                "The conversation belongs to another organisation."
            )

        model = self._promotion_model()
        now = timezone.now()
        lines = self._validated_lines(
            organisation=organisation,
            conversation=conversation,
            request=request,
        )
        currencies = {line["currency"] for line in lines}
        if len(currencies) != 1:
            raise CustomerPromotionRepositoryError(
                "An itinerary must use one currency before promotions are evaluated."
            )
        currency = currencies.pop()
        subtotal = sum(
            (line["subtotal"] for line in lines), Decimal("0.00")
        ).quantize(MONEY)

        queryset = model.objects.filter(
            organisation=organisation,
            is_active=True,
            is_public=True,
        ).filter(
            Q(valid_from__isnull=True) | Q(valid_from__lte=now),
            Q(valid_until__isnull=True) | Q(valid_until__gt=now),
        ).order_by("priority", "pk")[:MAX_RULES]

        applied: list[dict[str, Any]] = []
        discount_total = Decimal("0.00")
        stacking_applied = False
        valid_until: datetime | None = None

        for rule in queryset:
            eligible_positions = self._eligible_positions(rule, lines)
            if not eligible_positions:
                continue
            if len(lines) < int(rule.minimum_items or 1):
                continue
            minimum_subtotal = self._money(rule.minimum_subtotal, "minimum subtotal")
            if subtotal < minimum_subtotal:
                continue
            if not self._usage_available(rule):
                continue

            eligible_subtotal = sum(
                (
                    line["subtotal"]
                    for line in lines
                    if line["position"] in eligible_positions
                ),
                Decimal("0.00"),
            ).quantize(MONEY)
            amount = self._discount(rule, eligible_subtotal)
            remaining = (subtotal - discount_total).quantize(MONEY)
            amount = min(amount, remaining)
            if amount <= 0:
                continue

            applied.append(
                {
                    "promotion_id": rule.pk,
                    "name": str(rule.name or "").strip(),
                    "description": str(rule.description or "").strip(),
                    "discount_amount": amount,
                    "currency": currency,
                    "eligible_item_positions": eligible_positions,
                    "automatically_applied_at_checkout": True,
                    "requires_code": False,
                }
            )
            discount_total = (discount_total + amount).quantize(MONEY)
            if rule.valid_until and (
                valid_until is None or rule.valid_until < valid_until
            ):
                valid_until = rule.valid_until
            if len(applied) > 1:
                stacking_applied = True
            if not bool(rule.stackable):
                break

        final_total = (subtotal - discount_total).quantize(MONEY)
        return {
            "organisation_id": organisation_id,
            "item_count": len(lines),
            "currency": currency,
            "subtotal": subtotal,
            "discount_total": discount_total,
            "final_total": final_total,
            "promotions": applied,
            "stacking_applied": stacking_applied,
            "valid_until": valid_until,
        }

    def _validated_lines(
        self,
        *,
        organisation: Any,
        conversation: Any,
        request: PromotionEvaluationRequest,
    ) -> list[dict[str, Any]]:
        lines: list[dict[str, Any]] = []
        for item in request.items:
            itinerary_item = ItineraryItemRequest(
                position=item.position,
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
            checked = self.itinerary.validate_item(
                organisation=organisation,
                conversation=conversation,
                item=itinerary_item,
                language=str(getattr(conversation, "language", "") or ""),
            )
            if checked.get("status") != "valid":
                raise CustomerPromotionRepositoryError(
                    "Promotions require a fully valid and available itinerary."
                )
            subtotal = self._money(checked.get("price_total"), "item subtotal")
            currency = str(checked.get("currency") or "").strip().upper()
            if len(currency) != 3 or not currency.isalpha():
                raise CustomerPromotionRepositoryError(
                    "An itinerary item has no valid currency."
                )
            lines.append(
                {
                    "position": item.position,
                    "product_id": item.product_id,
                    "service_date": item.service_date,
                    "subtotal": subtotal,
                    "currency": currency,
                }
            )
        return lines

    @staticmethod
    def _eligible_positions(rule: Any, lines: Sequence[Mapping[str, Any]]) -> list[int]:
        if bool(rule.applies_to_all_products):
            return [int(line["position"]) for line in lines]
        allowed_ids = set(rule.products.values_list("pk", flat=True))
        return [
            int(line["position"])
            for line in lines
            if int(line["product_id"]) in allowed_ids
        ]

    @classmethod
    def _discount(cls, rule: Any, eligible_subtotal: Decimal) -> Decimal:
        value = cls._money(rule.discount_value, "discount value")
        rule_type = str(rule.discount_type or "").strip().lower()
        if rule_type == "percentage":
            if value > PERCENT:
                raise CustomerPromotionRepositoryError(
                    "A promotion percentage cannot exceed 100."
                )
            amount = (eligible_subtotal * value / PERCENT).quantize(
                MONEY, rounding=ROUND_HALF_UP
            )
        elif rule_type == "fixed_amount":
            amount = value
        else:
            raise CustomerPromotionRepositoryError(
                "A promotion has an unsupported discount type."
            )
        cap = cls._money(rule.max_discount_amount, "maximum discount")
        if cap > 0:
            amount = min(amount, cap)
        return min(amount, eligible_subtotal).quantize(MONEY)

    @staticmethod
    def _usage_available(rule: Any) -> bool:
        maximum = getattr(rule, "max_uses", None)
        used = getattr(rule, "times_used", 0)
        if maximum in (None, 0, "0"):
            return True
        try:
            return int(used or 0) < int(maximum)
        except (TypeError, ValueError):
            raise CustomerPromotionRepositoryError(
                "A promotion has invalid usage limits."
            )

    @staticmethod
    def _promotion_model():
        try:
            model = apps.get_model("ticketing", PROMOTION_MODEL_NAME)
        except LookupError as exc:
            raise CustomerPromotionConfigurationError(
                "CustomerPromotionRule is not installed. Do not configure "
                "CUSTOMER_AI_PROMOTION_REPOSITORY until its model and migration exist."
            ) from exc
        required_fields = {
            "organisation",
            "name",
            "description",
            "discount_type",
            "discount_value",
            "minimum_items",
            "minimum_subtotal",
            "max_discount_amount",
            "applies_to_all_products",
            "products",
            "valid_from",
            "valid_until",
            "priority",
            "stackable",
            "is_active",
            "is_public",
        }
        actual_fields = {field.name for field in model._meta.get_fields()}
        missing = sorted(required_fields - actual_fields)
        if missing:
            raise CustomerPromotionConfigurationError(
                "CustomerPromotionRule is missing required fields: "
                + ", ".join(missing)
                + "."
            )
        return model

    @staticmethod
    def _money(value: Any, field: str) -> Decimal:
        try:
            result = Decimal(str(value or "0")).quantize(
                MONEY, rounding=ROUND_HALF_UP
            )
        except (InvalidOperation, TypeError, ValueError) as exc:
            raise CustomerPromotionRepositoryError(
                f"The promotion {field} is invalid."
            ) from exc
        if not result.is_finite() or result < 0:
            raise CustomerPromotionRepositoryError(
                f"The promotion {field} is invalid."
            )
        return result


__all__ = [
    "CustomerPromotionConfigurationError",
    "DjangoCustomerPromotionRepository",
]
