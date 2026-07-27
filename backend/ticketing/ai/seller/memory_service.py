# ticketing/ai/seller/memory_service.py

from __future__ import annotations

import logging
from collections import Counter
from copy import deepcopy
from typing import Any, Mapping

from django.conf import settings
from django.core.cache import BaseCache, caches


logger = logging.getLogger(__name__)


class SellerMemoryService:
    """
    Stores long-term seller language and interpretation preferences.

    This service must never store:

    - customer names
    - customer telephone numbers
    - customer emails
    - booking payloads
    - booking IDs
    - payment details
    - prices
    - discounts
    - travel dates
    - pickup schedules
    - product availability

    Authoritative business data remains in the Ticketing APIs.
    """

    DEFAULT_CACHE_ALIAS = "default"
    DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 365
    KEY_PREFIX = "ticketing:ai:seller:memory"

    MAX_ALIASES_PER_GROUP = 100
    MAX_ABBREVIATIONS = 100
    MAX_CORRECTIONS = 100
    MAX_STYLE_VALUES = 20

    ALLOWED_MEMORY_KEYS = {
        "preferred_language",
        "product_aliases",
        "pickup_aliases",
        "abbreviations",
        "common_misspellings",
        "corrections",
        "communication_style",
        "language_counts",
        "style_counts",
    }

    SENSITIVE_INTERPRETATION_KEYS = {
        "customer",
        "customer_name",
        "customer_whatsapp",
        "customer_email",
        "customer_hotel",
        "customer_notes",
        "service_date",
        "service_time",
        "booking_id",
        "booking_code",
        "payment_reference",
        "payment_note",
        "discount_amount",
        "discount_percent",
        "price",
        "unit_price",
        "total",
        "subtotal",
    }

    def __init__(
        self,
        *,
        cache_alias: str | None = None,
        ttl_seconds: int | None = None,
        cache_backend: BaseCache | None = None,
        key_prefix: str | None = None,
    ) -> None:
        self.cache_alias = (
            str(cache_alias or "").strip()
            or getattr(
                settings,
                "SELLER_AI_MEMORY_CACHE_ALIAS",
                self.DEFAULT_CACHE_ALIAS,
            )
        )

        configured_ttl = getattr(
            settings,
            "SELLER_AI_MEMORY_TTL_SECONDS",
            self.DEFAULT_TTL_SECONDS,
        )

        self.ttl_seconds = self._normalise_ttl(
            ttl_seconds if ttl_seconds is not None else configured_ttl
        )

        self.key_prefix = (
            str(key_prefix or "").strip()
            or getattr(
                settings,
                "SELLER_AI_MEMORY_KEY_PREFIX",
                self.KEY_PREFIX,
            )
        ).rstrip(":")

        self.cache = (
            cache_backend
            if cache_backend is not None
            else caches[self.cache_alias]
        )

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_interpretation_memory(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
    ) -> dict[str, Any]:
        """
        Return safe long-term memory used by prompts and interpretation.
        """

        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        return {
            "preferred_language": str(
                memory.get("preferred_language") or ""
            ),
            "product_aliases": deepcopy(
                memory.get("product_aliases") or {}
            ),
            "pickup_aliases": deepcopy(
                memory.get("pickup_aliases") or {}
            ),
            "abbreviations": deepcopy(
                memory.get("abbreviations") or {}
            ),
            "common_misspellings": deepcopy(
                memory.get("common_misspellings") or {}
            ),
            "corrections": deepcopy(
                memory.get("corrections") or {}
            ),
            "communication_style": str(
                memory.get("communication_style") or ""
            ),
        }

    def observe_message(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        message: str,
        language: str | None,
        interpretation: Mapping[str, Any] | None,
    ) -> dict[str, Any]:
        """
        Learn only safe language preferences from a processed seller message.

        The message itself is not saved. Only sanitised language observations
        are retained.
        """

        clean_seller_id = self._required_positive_int(
            seller_id,
            "seller_id",
        )
        clean_slug = self._required_string(
            organisation_slug,
            "organisation_slug",
        )

        memory = self._load(
            seller_id=clean_seller_id,
            organisation_slug=clean_slug,
        )

        safe_interpretation = self._sanitise_interpretation(
            interpretation or {}
        )

        clean_language = self._normalise_language(
            language
            or safe_interpretation.get("language")
        )

        if clean_language:
            self._record_language(
                memory,
                clean_language,
            )

        self._record_aliases(
            memory,
            safe_interpretation,
        )

        self._record_abbreviations(
            memory,
            safe_interpretation.get("abbreviations"),
        )

        self._record_corrections(
            memory,
            safe_interpretation.get("corrections"),
        )

        self._record_communication_style(
            memory,
            safe_interpretation.get("communication_style"),
        )

        self._save(
            seller_id=clean_seller_id,
            organisation_slug=clean_slug,
            memory=memory,
        )

        return self.get_interpretation_memory(
            seller_id=clean_seller_id,
            organisation_slug=clean_slug,
        )

    def remember_product_alias(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        alias: str,
        canonical_name: str,
    ) -> dict[str, Any]:
        """
        Explicitly store a seller-specific product alias.

        Example:
            "CocoMongo" -> "Coco Bongo Punta Cana"
        """

        return self._remember_alias(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            group="product_aliases",
            alias=alias,
            canonical_name=canonical_name,
        )

    def remember_pickup_alias(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        alias: str,
        canonical_name: str,
    ) -> dict[str, Any]:
        return self._remember_alias(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            group="pickup_aliases",
            alias=alias,
            canonical_name=canonical_name,
        )

    def remember_abbreviation(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        abbreviation: str,
        meaning: str,
    ) -> dict[str, Any]:
        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        key = self._normalise_phrase(abbreviation)
        value = self._clean_memory_value(meaning)

        if not key or not value:
            raise ValueError(
                "abbreviation and meaning are required."
            )

        abbreviations = self._mapping(
            memory.get("abbreviations")
        )
        abbreviations[key] = value

        memory["abbreviations"] = self._limit_mapping(
            abbreviations,
            self.MAX_ABBREVIATIONS,
        )

        self._save(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            memory=memory,
        )

        return self.get_interpretation_memory(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

    def set_preferred_language(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        language: str,
    ) -> dict[str, Any]:
        clean_language = self._normalise_language(language)

        if not clean_language:
            raise ValueError("A valid language is required.")

        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        memory["preferred_language"] = clean_language

        language_counts = self._counter(
            memory.get("language_counts")
        )
        language_counts[clean_language] += 1
        memory["language_counts"] = dict(language_counts)

        self._save(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            memory=memory,
        )

        return self.get_interpretation_memory(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

    def delete_memory(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
    ) -> bool:
        """
        Delete all long-term seller language memory.
        """

        key = self._key(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        result = self.cache.delete(key)

        if result is None:
            return True

        return bool(result)

    # ------------------------------------------------------------------
    # Memory observations
    # ------------------------------------------------------------------

    def _record_language(
        self,
        memory: dict[str, Any],
        language: str,
    ) -> None:
        counts = self._counter(
            memory.get("language_counts")
        )

        counts[language] += 1
        memory["language_counts"] = dict(counts)

        most_common = counts.most_common(1)
        if most_common:
            memory["preferred_language"] = most_common[0][0]

    def _record_aliases(
        self,
        memory: dict[str, Any],
        interpretation: Mapping[str, Any],
    ) -> None:
        product_phrase = self._clean_memory_value(
            interpretation.get("product_phrase")
        )
        matched_product_name = self._clean_memory_value(
            interpretation.get("matched_product_name")
        )

        if (
            product_phrase
            and matched_product_name
            and self._normalise_phrase(product_phrase)
            != self._normalise_phrase(matched_product_name)
        ):
            aliases = self._mapping(
                memory.get("product_aliases")
            )
            aliases[
                self._normalise_phrase(product_phrase)
            ] = matched_product_name

            memory["product_aliases"] = self._limit_mapping(
                aliases,
                self.MAX_ALIASES_PER_GROUP,
            )

        pickup_phrase = self._clean_memory_value(
            interpretation.get("pickup_phrase")
        )
        matched_pickup_name = self._clean_memory_value(
            interpretation.get("matched_pickup_name")
        )

        if (
            pickup_phrase
            and matched_pickup_name
            and self._normalise_phrase(pickup_phrase)
            != self._normalise_phrase(matched_pickup_name)
        ):
            aliases = self._mapping(
                memory.get("pickup_aliases")
            )
            aliases[
                self._normalise_phrase(pickup_phrase)
            ] = matched_pickup_name

            memory["pickup_aliases"] = self._limit_mapping(
                aliases,
                self.MAX_ALIASES_PER_GROUP,
            )

    def _record_abbreviations(
        self,
        memory: dict[str, Any],
        abbreviations_value: Any,
    ) -> None:
        if not isinstance(abbreviations_value, Mapping):
            return

        abbreviations = self._mapping(
            memory.get("abbreviations")
        )

        for abbreviation, meaning in abbreviations_value.items():
            key = self._normalise_phrase(abbreviation)
            value = self._clean_memory_value(meaning)

            if not key or not value:
                continue

            abbreviations[key] = value

        memory["abbreviations"] = self._limit_mapping(
            abbreviations,
            self.MAX_ABBREVIATIONS,
        )

    def _record_corrections(
        self,
        memory: dict[str, Any],
        corrections_value: Any,
    ) -> None:
        if not isinstance(corrections_value, Mapping):
            return

        corrections = self._mapping(
            memory.get("corrections")
        )
        misspellings = self._mapping(
            memory.get("common_misspellings")
        )

        for original, corrected in corrections_value.items():
            key = self._normalise_phrase(original)
            value = self._clean_memory_value(corrected)

            if not key or not value:
                continue

            corrections[key] = value
            misspellings[key] = value

        memory["corrections"] = self._limit_mapping(
            corrections,
            self.MAX_CORRECTIONS,
        )
        memory["common_misspellings"] = self._limit_mapping(
            misspellings,
            self.MAX_CORRECTIONS,
        )

    def _record_communication_style(
        self,
        memory: dict[str, Any],
        style_value: Any,
    ) -> None:
        style = self._clean_memory_value(style_value)

        if not style:
            return

        style_counts = self._counter(
            memory.get("style_counts")
        )
        style_counts[style] += 1

        if len(style_counts) > self.MAX_STYLE_VALUES:
            style_counts = Counter(
                dict(
                    style_counts.most_common(
                        self.MAX_STYLE_VALUES
                    )
                )
            )

        memory["style_counts"] = dict(style_counts)

        most_common = style_counts.most_common(1)
        if most_common:
            memory["communication_style"] = most_common[0][0]

    # ------------------------------------------------------------------
    # Alias helpers
    # ------------------------------------------------------------------

    def _remember_alias(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        group: str,
        alias: str,
        canonical_name: str,
    ) -> dict[str, Any]:
        if group not in {
            "product_aliases",
            "pickup_aliases",
        }:
            raise ValueError("Unsupported alias group.")

        clean_alias = self._normalise_phrase(alias)
        clean_name = self._clean_memory_value(canonical_name)

        if not clean_alias or not clean_name:
            raise ValueError(
                "alias and canonical_name are required."
            )

        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        aliases = self._mapping(memory.get(group))
        aliases[clean_alias] = clean_name

        memory[group] = self._limit_mapping(
            aliases,
            self.MAX_ALIASES_PER_GROUP,
        )

        self._save(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            memory=memory,
        )

        return self.get_interpretation_memory(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

    # ------------------------------------------------------------------
    # Storage
    # ------------------------------------------------------------------

    def _load(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
    ) -> dict[str, Any]:
        key = self._key(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        value = self.cache.get(key)

        if not isinstance(value, dict):
            return self._empty_memory()

        return self._normalise_memory(value)

    def _save(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        memory: Mapping[str, Any],
    ) -> None:
        key = self._key(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        safe_memory = self._normalise_memory(memory)

        saved = self.cache.set(
            key,
            safe_memory,
            timeout=self.ttl_seconds,
        )

        if saved is False:
            raise SellerMemoryError(
                "Seller memory could not be saved."
            )

    def _key(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
    ) -> str:
        clean_seller_id = self._required_positive_int(
            seller_id,
            "seller_id",
        )
        clean_slug = self._required_string(
            organisation_slug,
            "organisation_slug",
        )

        return (
            f"{self.key_prefix}:"
            f"{clean_slug}:"
            f"{clean_seller_id}"
        )

    # ------------------------------------------------------------------
    # Sanitisation
    # ------------------------------------------------------------------

    def _sanitise_interpretation(
        self,
        interpretation: Mapping[str, Any],
    ) -> dict[str, Any]:
        safe: dict[str, Any] = {}

        allowed_keys = {
            "intent",
            "language",
            "product_phrase",
            "matched_product_name",
            "pickup_phrase",
            "matched_pickup_name",
            "option_phrase",
            "matched_option_name",
            "abbreviations",
            "corrections",
            "communication_style",
        }

        for key, value in interpretation.items():
            if key in self.SENSITIVE_INTERPRETATION_KEYS:
                continue

            if key not in allowed_keys:
                continue

            if key in {
                "abbreviations",
                "corrections",
            }:
                if isinstance(value, Mapping):
                    safe[key] = {
                        self._normalise_phrase(item_key):
                        self._clean_memory_value(item_value)
                        for item_key, item_value in value.items()
                        if self._normalise_phrase(item_key)
                        and self._clean_memory_value(item_value)
                    }
                continue

            safe[key] = self._clean_memory_value(value)

        return safe

    def _normalise_memory(
        self,
        memory: Mapping[str, Any],
    ) -> dict[str, Any]:
        result = self._empty_memory()

        for key in self.ALLOWED_MEMORY_KEYS:
            if key not in memory:
                continue

            value = memory[key]

            if key in {
                "product_aliases",
                "pickup_aliases",
                "abbreviations",
                "common_misspellings",
                "corrections",
            }:
                result[key] = self._limit_mapping(
                    {
                        self._normalise_phrase(item_key):
                        self._clean_memory_value(item_value)
                        for item_key, item_value
                        in self._mapping(value).items()
                        if self._normalise_phrase(item_key)
                        and self._clean_memory_value(item_value)
                    },
                    self.MAX_ALIASES_PER_GROUP,
                )

            elif key in {
                "language_counts",
                "style_counts",
            }:
                result[key] = {
                    str(item_key): max(0, int(item_value))
                    for item_key, item_value
                    in self._mapping(value).items()
                    if str(item_key).strip()
                    and self._is_integer(item_value)
                }

            elif key == "preferred_language":
                result[key] = self._normalise_language(value)

            else:
                result[key] = self._clean_memory_value(value)

        return result

    @staticmethod
    def _empty_memory() -> dict[str, Any]:
        return {
            "preferred_language": "",
            "product_aliases": {},
            "pickup_aliases": {},
            "abbreviations": {},
            "common_misspellings": {},
            "corrections": {},
            "communication_style": "",
            "language_counts": {},
            "style_counts": {},
        }

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _mapping(value: Any) -> dict[str, Any]:
        if isinstance(value, Mapping):
            return dict(value)
        return {}

    @staticmethod
    def _counter(value: Any) -> Counter[str]:
        mapping = SellerMemoryService._mapping(value)

        return Counter(
            {
                str(key): int(count)
                for key, count in mapping.items()
                if str(key).strip()
                and SellerMemoryService._is_integer(count)
                and int(count) >= 0
            }
        )

    @staticmethod
    def _limit_mapping(
        mapping: Mapping[str, Any],
        maximum: int,
    ) -> dict[str, Any]:
        items = list(mapping.items())

        if len(items) <= maximum:
            return dict(items)

        return dict(items[-maximum:])

    @staticmethod
    def _normalise_phrase(value: Any) -> str:
        text = str(value or "").strip().lower()
        return " ".join(text.split())

    @staticmethod
    def _clean_memory_value(value: Any) -> str:
        text = str(value or "").strip()

        if len(text) > 250:
            text = text[:250]

        return text

    @staticmethod
    def _normalise_language(value: Any) -> str:
        language = str(value or "").strip().lower()

        aliases = {
            "english": "en",
            "spanish": "es",
            "español": "es",
            "french": "fr",
            "français": "fr",
            "portuguese": "pt",
            "português": "pt",
            "german": "de",
            "deutsch": "de",
        }

        language = aliases.get(language, language)

        if "-" in language:
            language = language.split("-", 1)[0]

        if "_" in language:
            language = language.split("_", 1)[0]

        if len(language) != 2 or not language.isalpha():
            return ""

        return language

    @staticmethod
    def _normalise_ttl(value: Any) -> int:
        try:
            ttl = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                "Seller memory TTL must be a valid integer."
            ) from exc

        if ttl <= 0:
            raise ValueError(
                "Seller memory TTL must be greater than zero."
            )

        return ttl

    @staticmethod
    def _required_positive_int(
        value: Any,
        field_name: str,
    ) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError) as exc:
            raise ValueError(
                f"{field_name} must be a valid integer."
            ) from exc

        if parsed <= 0:
            raise ValueError(
                f"{field_name} must be greater than zero."
            )

        return parsed

    @staticmethod
    def _required_string(
        value: Any,
        field_name: str,
    ) -> str:
        cleaned = str(value or "").strip()

        if not cleaned:
            raise ValueError(f"{field_name} is required.")

        return cleaned

    @staticmethod
    def _is_integer(value: Any) -> bool:
        try:
            int(value)
            return True
        except (TypeError, ValueError):
            return False


class SellerMemoryError(Exception):
    """
    Raised when seller language memory cannot be stored.
    """