"""Read-only product catalogue tools for the customer sales agent.

This module deliberately does not query ``ExperienceProduct`` directly.  The
application supplies a repository that knows the project's exact model fields,
translations, pricing rules, and public URL builder.  Keeping that adapter
outside this module prevents the AI layer from bypassing existing ticketing
business rules.

Only active, public products belonging to the trusted organisation may be
returned.  These tools never change products, prices, availability, carts,
bookings, payments, discounts, or seller data.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Mapping, Protocol, Sequence
from urllib.parse import urlparse


SUPPORTED_LANGUAGES = frozenset({"en", "es", "fr", "pt", "de"})
SUPPORTED_PRODUCT_TYPES = frozenset(
    {"excursion", "transfer", "ticket", "event", "nightlife", "package"}
)
DEFAULT_SEARCH_LIMIT = 6
MAX_SEARCH_LIMIT = 10
MAX_QUERY_LENGTH = 200
MAX_INTERESTS = 10
MAX_TEXT_LENGTH = 4_000
MAX_LIST_ITEMS = 50


class CustomerProductToolError(RuntimeError):
    """Base error for customer product-tool failures."""


class CustomerProductToolInputError(CustomerProductToolError):
    """Raised when model-supplied product arguments are invalid."""


class CustomerProductNotFoundError(CustomerProductToolError):
    """Raised when a product is absent, private, inactive, or cross-tenant."""


class CustomerProductRepositoryError(CustomerProductToolError):
    """Raised when the catalogue repository violates its contract."""


@dataclass(frozen=True)
class ProductSearchCriteria:
    query: str
    product_type: str | None
    interests: tuple[str, ...]
    travel_start_date: date | None
    travel_end_date: date | None
    limit: int
    language: str


class CustomerProductRepository(Protocol):
    """Application-owned access to the authoritative public catalogue.

    Implementations must apply organisation, active, and public filters in the
    database query itself.  Search results and details may be model instances,
    dataclasses, or mappings; ``CustomerProductTools`` safely reads all three.
    """

    def search_public_products(
        self,
        *,
        organisation: Any,
        criteria: ProductSearchCriteria,
    ) -> Sequence[Any]:
        """Return matching active/public products for one organisation."""

    def get_public_product(
        self,
        *,
        organisation: Any,
        product_id: int,
        language: str,
    ) -> Any | None:
        """Return one active/public organisation product, or ``None``."""


class CustomerProductTools:
    """Handlers for ``search_products`` and ``get_product_details``."""

    def __init__(self, *, repository: CustomerProductRepository) -> None:
        if repository is None:
            raise CustomerProductRepositoryError(
                "A customer product repository is required."
            )
        self.repository = repository

    def handlers(self) -> dict[str, Any]:
        """Return explicit bindings accepted by ``tool_registry.py``."""
        return {
            "search_products": self.search_products,
            "get_product_details": self.get_product_details,
        }

    def search_products(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Search the live public catalogue without checking availability."""
        self._require_context(organisation=organisation, conversation=conversation)
        criteria = self._build_search_criteria(arguments)

        try:
            raw_products = self.repository.search_public_products(
                organisation=organisation,
                criteria=criteria,
            )
        except CustomerProductToolError:
            raise
        except Exception as exc:
            raise CustomerProductRepositoryError(
                "The product catalogue could not be searched."
            ) from exc

        if raw_products is None or isinstance(raw_products, (str, bytes, Mapping)):
            raise CustomerProductRepositoryError(
                "The product repository returned an invalid search collection."
            )

        products: list[dict[str, Any]] = []
        for raw_product in list(raw_products)[: criteria.limit]:
            self._assert_product_scope(raw_product, organisation)
            if not self._is_public_and_active(raw_product):
                continue
            products.append(
                self._serialize_summary(raw_product, language=criteria.language)
            )

        return {
            "ok": True,
            "query": criteria.query,
            "language": criteria.language or None,
            "count": len(products),
            "products": products,
            "availability_checked": False,
            "message": (
                "Matching products found. Check availability before offering a date."
                if products
                else "No matching active public products were found."
            ),
        }

    def get_product_details(
        self,
        *,
        arguments: Mapping[str, Any],
        organisation: Any,
        conversation: Any,
        metadata: Mapping[str, Any],
    ) -> Mapping[str, Any]:
        """Return sanitized customer-facing facts for one public product."""
        self._require_context(organisation=organisation, conversation=conversation)
        args = self._mapping(arguments)
        product_id = self._positive_int(args.get("product_id"), "product_id")
        language = self._language(args.get("language"), allow_blank=True)

        try:
            product = self.repository.get_public_product(
                organisation=organisation,
                product_id=product_id,
                language=language,
            )
        except CustomerProductToolError:
            raise
        except Exception as exc:
            raise CustomerProductRepositoryError(
                "The product catalogue could not load this product."
            ) from exc

        if product is None:
            raise CustomerProductNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )

        self._assert_product_scope(product, organisation)
        if not self._is_public_and_active(product):
            raise CustomerProductNotFoundError(
                "That product is not available in this organisation's public catalogue."
            )

        return {
            "ok": True,
            "product": self._serialize_details(product, language=language),
            "availability_checked": False,
            "message": "Product details loaded. Check availability for the requested date.",
        }

    def _build_search_criteria(
        self,
        arguments: Mapping[str, Any],
    ) -> ProductSearchCriteria:
        args = self._mapping(arguments)
        query = self._text(args.get("query"), MAX_QUERY_LENGTH)
        product_type = self._nullable_text(args.get("product_type"), 30)
        if product_type:
            product_type = product_type.lower()
            if product_type not in SUPPORTED_PRODUCT_TYPES:
                raise CustomerProductToolInputError("Unsupported product_type.")

        raw_interests = args.get("interests") or []
        if not isinstance(raw_interests, Sequence) or isinstance(
            raw_interests, (str, bytes)
        ):
            raise CustomerProductToolInputError("interests must be a list.")
        if len(raw_interests) > MAX_INTERESTS:
            raise CustomerProductToolInputError("Too many interests were supplied.")
        interests = tuple(
            value
            for value in (self._text(item, 80) for item in raw_interests)
            if value
        )

        start = self._nullable_date(args.get("travel_start_date"))
        end = self._nullable_date(args.get("travel_end_date"))
        if start and end and end < start:
            raise CustomerProductToolInputError(
                "travel_end_date cannot be before travel_start_date."
            )

        raw_limit = args.get("limit", DEFAULT_SEARCH_LIMIT)
        limit = self._positive_int(raw_limit, "limit")
        if limit > MAX_SEARCH_LIMIT:
            raise CustomerProductToolInputError(
                f"limit cannot exceed {MAX_SEARCH_LIMIT}."
            )

        return ProductSearchCriteria(
            query=query,
            product_type=product_type,
            interests=interests,
            travel_start_date=start,
            travel_end_date=end,
            limit=limit,
            language=self._language(args.get("language"), allow_blank=True),
        )

    def _serialize_summary(self, product: Any, *, language: str) -> dict[str, Any]:
        return {
            "id": self._product_id(product),
            "name": self._localized(product, "name", language, required=True),
            "short_description": self._localized(
                product, "short_description", language
            ),
            "product_type": self._nullable_text(
                self._value(product, "product_type", "type"), 30
            ),
            "duration": self._nullable_text(
                self._value(product, "duration_text", "duration"), 120
            ),
            "location": self._nullable_text(
                self._value(product, "location_name", "location"), 200
            ),
            "price_from": self._money(
                self._value(product, "public_price_from", "price_from", "price")
            ),
            "currency": self._currency(self._value(product, "currency")),
            "public_url": self._safe_public_url(
                self._value(product, "public_url", "booking_url", "url")
            ),
            "pickup_available": bool(
                self._value(product, "pickup_available", default=False)
            ),
            "minimum_age": self._nullable_nonnegative_int(
                self._value(product, "minimum_age")
            ),
            "adult_only": bool(self._value(product, "adult_only", default=False)),
        }

    def _serialize_details(self, product: Any, *, language: str) -> dict[str, Any]:
        details = self._serialize_summary(product, language=language)
        details.update(
            {
                "description": self._localized(product, "description", language),
                "highlights": self._safe_list(
                    self._localized_value(product, "highlights", language)
                ),
                "inclusions": self._safe_list(
                    self._localized_value(product, "inclusions", language)
                ),
                "exclusions": self._safe_list(
                    self._localized_value(product, "exclusions", language)
                ),
                "requirements": self._safe_list(
                    self._localized_value(product, "requirements", language)
                ),
                "cancellation_policy": self._localized(
                    product, "cancellation_policy", language
                ),
                "payment_options": self._safe_list(
                    self._value(product, "payment_options", default=[]),
                    max_item_length=80,
                ),
                "pickup_required": bool(
                    self._value(product, "pickup_required", default=False)
                ),
                "pickup_notes": self._localized(product, "pickup_notes", language),
                "customer_must_select_options": True,
                "booking_created": False,
            }
        )
        return details

    def _assert_product_scope(self, product: Any, organisation: Any) -> None:
        expected_id = self._identity(organisation)
        product_org_id = self._value(product, "organisation_id")
        if product_org_id is None:
            product_org = self._value(product, "organisation")
            product_org_id = self._identity(product_org) if product_org is not None else None
        if expected_id is None or product_org_id is None or str(product_org_id) != str(expected_id):
            raise CustomerProductRepositoryError(
                "The product repository returned a cross-organisation product."
            )

    def _is_public_and_active(self, product: Any) -> bool:
        active = self._value(product, "is_active", "active", default=False)
        public = self._value(
            product, "is_public", "published", "is_published", default=False
        )
        return bool(active) and bool(public)

    def _localized(
        self,
        product: Any,
        field: str,
        language: str,
        *,
        required: bool = False,
    ) -> str:
        value = self._localized_value(product, field, language)
        text = self._text(value, MAX_TEXT_LENGTH)
        if required and not text:
            raise CustomerProductRepositoryError(
                f"Public product {self._product_id(product)} has no {field}."
            )
        return text

    def _localized_value(self, product: Any, field: str, language: str) -> Any:
        if language:
            direct = self._value(product, f"{field}_{language}")
            if direct not in (None, "", [], ()):
                return direct
        translations = self._value(product, "translations", default={})
        if language and isinstance(translations, Mapping):
            translated = translations.get(language)
            if isinstance(translated, Mapping) and translated.get(field) not in (
                None,
                "",
                [],
                (),
            ):
                return translated[field]
        return self._value(product, field, default="")

    def _product_id(self, product: Any) -> int:
        return self._positive_int(self._value(product, "id", "pk"), "product.id")

    @staticmethod
    def _value(source: Any, *names: str, default: Any = None) -> Any:
        for name in names:
            if isinstance(source, Mapping) and name in source:
                return source[name]
            if hasattr(source, name):
                return getattr(source, name)
        return default

    @staticmethod
    def _identity(value: Any) -> Any:
        if value is None:
            return None
        if isinstance(value, Mapping):
            return value.get("id", value.get("pk"))
        return getattr(value, "id", getattr(value, "pk", None))

    @staticmethod
    def _mapping(value: Any) -> Mapping[str, Any]:
        if not isinstance(value, Mapping):
            raise CustomerProductToolInputError("Tool arguments must be an object.")
        return value

    @staticmethod
    def _require_context(*, organisation: Any, conversation: Any) -> None:
        if organisation is None or conversation is None:
            raise CustomerProductToolInputError(
                "Organisation and conversation context are required."
            )

    @staticmethod
    def _text(value: Any, maximum: int) -> str:
        if value is None:
            return ""
        if isinstance(value, (Mapping, list, tuple, set)):
            raise CustomerProductToolInputError("Expected text value.")
        text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", str(value))
        return re.sub(r"\s+", " ", text).strip()[:maximum]

    def _nullable_text(self, value: Any, maximum: int) -> str | None:
        text = self._text(value, maximum)
        return text or None

    @staticmethod
    def _positive_int(value: Any, field: str) -> int:
        if isinstance(value, bool):
            raise CustomerProductToolInputError(f"{field} must be a positive integer.")
        try:
            result = int(value)
        except (TypeError, ValueError) as exc:
            raise CustomerProductToolInputError(
                f"{field} must be a positive integer."
            ) from exc
        if result < 1:
            raise CustomerProductToolInputError(f"{field} must be a positive integer.")
        return result

    @staticmethod
    def _nullable_nonnegative_int(value: Any) -> int | None:
        if value in (None, ""):
            return None
        if isinstance(value, bool):
            return None
        try:
            result = int(value)
        except (TypeError, ValueError):
            return None
        return result if result >= 0 else None

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
            raise CustomerProductToolInputError(
                "Dates must use YYYY-MM-DD format."
            ) from exc

    @staticmethod
    def _language(value: Any, *, allow_blank: bool) -> str:
        language = str(value or "").strip().lower()
        if not language and allow_blank:
            return ""
        if language not in SUPPORTED_LANGUAGES:
            raise CustomerProductToolInputError("Unsupported language.")
        return language

    def _safe_list(
        self,
        value: Any,
        *,
        max_item_length: int = 500,
    ) -> list[str]:
        if value in (None, ""):
            return []
        if isinstance(value, str):
            raw_items = [part for part in re.split(r"\r?\n|\s*[;•]\s*", value) if part]
        elif isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
            raw_items = list(value)
        else:
            raise CustomerProductRepositoryError(
                "A public product list field has an invalid value."
            )
        return [
            text
            for text in (self._text(item, max_item_length) for item in raw_items[:MAX_LIST_ITEMS])
            if text
        ]

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
        url = str(value or "").strip()
        if not url or len(url) > 2_000:
            return None
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return None
        if parsed.username or parsed.password:
            return None
        return url


def build_product_tool_handlers(
    *,
    repository: CustomerProductRepository,
) -> dict[str, Any]:
    """Convenience factory used while assembling the complete registry."""
    return CustomerProductTools(repository=repository).handlers()


__all__ = [
    "CustomerProductNotFoundError",
    "CustomerProductRepository",
    "CustomerProductRepositoryError",
    "CustomerProductToolError",
    "CustomerProductToolInputError",
    "CustomerProductTools",
    "ProductSearchCriteria",
    "build_product_tool_handlers",
]
