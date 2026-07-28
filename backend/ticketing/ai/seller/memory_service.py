# ticketing/ai/seller/memory_service.py

from __future__ import annotations

import logging
import re
import unicodedata
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
    MAX_VOICE_ALIASES = 100
    MAX_SPEECH_CORRECTIONS = 100
    MAX_FREQUENT_ITEMS = 25
    MAX_CONFIRMATION_STYLES = 10

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
        "voice_aliases",
        "speech_recognition_corrections",
        "preferred_confirmation_style",
        "confirmation_style_counts",
        "frequent_products",
        "frequent_pickups",
        "product_counts",
        "pickup_counts",
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
        "currency",
        "external_product_id",
        "external_variant_id",
        "external_availability_id",
        "selected_external_product_id",
        "pickup_location_id",
        "product_id",
        "seller_id",
        "organisation_slug",
        "conversation_id",
        "message_id",
        "transcript",
        "raw_transcript",
        "audio_url",
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
            "voice_aliases": deepcopy(
                memory.get("voice_aliases") or {}
            ),
            "speech_recognition_corrections": deepcopy(
                memory.get("speech_recognition_corrections") or {}
            ),
            "preferred_confirmation_style": str(
                memory.get("preferred_confirmation_style") or ""
            ),
            "frequent_products": deepcopy(
                memory.get("frequent_products") or []
            ),
            "frequent_pickups": deepcopy(
                memory.get("frequent_pickups") or []
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
        message_source: str | None = None,
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

        self._record_confirmation_style(
            memory,
            safe_interpretation.get("preferred_confirmation_style"),
        )

        self._record_voice_learning(
            memory,
            source=message_source,
            voice_aliases=safe_interpretation.get("voice_aliases"),
            speech_corrections=safe_interpretation.get(
                "speech_recognition_corrections"
            ),
        )

        self._record_frequent_items(
            memory,
            product_name=safe_interpretation.get("matched_product_name"),
            pickup_name=safe_interpretation.get("matched_pickup_name"),
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

    def remember_voice_alias(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        spoken_phrase: str,
        canonical_phrase: str,
    ) -> dict[str, Any]:
        """
        Explicitly remember a harmless seller-specific voice alias.

        Example:
            "coco mongo" -> "Coco Bongo Punta Cana"
        """

        return self._remember_simple_mapping(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            group="voice_aliases",
            source_value=spoken_phrase,
            target_value=canonical_phrase,
            maximum=self.MAX_VOICE_ALIASES,
        )

    def remember_speech_correction(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        recognised_phrase: str,
        corrected_phrase: str,
    ) -> dict[str, Any]:
        return self._remember_simple_mapping(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
            group="speech_recognition_corrections",
            source_value=recognised_phrase,
            target_value=corrected_phrase,
            maximum=self.MAX_SPEECH_CORRECTIONS,
        )

    def set_preferred_confirmation_style(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        style: str,
    ) -> dict[str, Any]:
        clean_style = self._normalise_confirmation_style(style)

        if not clean_style:
            raise ValueError(
                "A valid confirmation style is required."
            )

        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        memory["preferred_confirmation_style"] = clean_style

        counts = self._counter(
            memory.get("confirmation_style_counts")
        )
        counts[clean_style] += 1
        memory["confirmation_style_counts"] = dict(counts)

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

    def _record_confirmation_style(
        self,
        memory: dict[str, Any],
        style_value: Any,
    ) -> None:
        style = self._normalise_confirmation_style(style_value)

        if not style:
            return

        counts = self._counter(
            memory.get("confirmation_style_counts")
        )
        counts[style] += 1

        if len(counts) > self.MAX_CONFIRMATION_STYLES:
            counts = Counter(
                dict(
                    counts.most_common(
                        self.MAX_CONFIRMATION_STYLES
                    )
                )
            )

        memory["confirmation_style_counts"] = dict(counts)
        memory["preferred_confirmation_style"] = (
            counts.most_common(1)[0][0]
        )

    def _record_voice_learning(
        self,
        memory: dict[str, Any],
        *,
        source: Any,
        voice_aliases: Any,
        speech_corrections: Any,
    ) -> None:
        source_name = str(source or "").strip().lower()

        if source_name and source_name != "voice":
            return

        self._merge_safe_mapping(
            memory=memory,
            key="voice_aliases",
            values=voice_aliases,
            maximum=self.MAX_VOICE_ALIASES,
        )
        self._merge_safe_mapping(
            memory=memory,
            key="speech_recognition_corrections",
            values=speech_corrections,
            maximum=self.MAX_SPEECH_CORRECTIONS,
        )

    def _record_frequent_items(
        self,
        memory: dict[str, Any],
        *,
        product_name: Any,
        pickup_name: Any,
    ) -> None:
        clean_product = self._clean_memory_value(product_name)
        clean_pickup = self._clean_memory_value(pickup_name)

        if clean_product:
            product_counts = self._counter(
                memory.get("product_counts")
            )
            product_counts[clean_product] += 1
            memory["product_counts"] = dict(product_counts)
            memory["frequent_products"] = [
                name
                for name, _count
                in product_counts.most_common(
                    self.MAX_FREQUENT_ITEMS
                )
            ]

        if clean_pickup:
            pickup_counts = self._counter(
                memory.get("pickup_counts")
            )
            pickup_counts[clean_pickup] += 1
            memory["pickup_counts"] = dict(pickup_counts)
            memory["frequent_pickups"] = [
                name
                for name, _count
                in pickup_counts.most_common(
                    self.MAX_FREQUENT_ITEMS
                )
            ]

    # ------------------------------------------------------------------
    # Alias helpers
    # ------------------------------------------------------------------

    def _remember_simple_mapping(
        self,
        *,
        seller_id: int,
        organisation_slug: str,
        group: str,
        source_value: str,
        target_value: str,
        maximum: int,
    ) -> dict[str, Any]:
        source = self._normalise_phrase(source_value)
        target = self._clean_memory_value(target_value)

        if not source or not target:
            raise ValueError(
                "Both source and target values are required."
            )

        memory = self._load(
            seller_id=seller_id,
            organisation_slug=organisation_slug,
        )

        values = self._mapping(memory.get(group))
        values[source] = target
        memory[group] = self._limit_mapping(
            values,
            maximum,
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
            "preferred_confirmation_style",
            "voice_aliases",
            "speech_recognition_corrections",
        }

        for key, value in interpretation.items():
            if key in self.SENSITIVE_INTERPRETATION_KEYS:
                continue

            if key not in allowed_keys:
                continue

            if key in {
                "abbreviations",
                "corrections",
                "voice_aliases",
                "speech_recognition_corrections",
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
                "voice_aliases",
                "speech_recognition_corrections",
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
                "confirmation_style_counts",
                "product_counts",
                "pickup_counts",
            }:
                result[key] = {
                    str(item_key): max(0, int(item_value))
                    for item_key, item_value
                    in self._mapping(value).items()
                    if str(item_key).strip()
                    and self._is_integer(item_value)
                }

            elif key in {
                "frequent_products",
                "frequent_pickups",
            }:
                result[key] = [
                    self._clean_memory_value(item)
                    for item in (
                        value if isinstance(value, list) else []
                    )
                    if self._clean_memory_value(item)
                ][:self.MAX_FREQUENT_ITEMS]

            elif key == "preferred_language":
                result[key] = self._normalise_language(value)

            elif key == "preferred_confirmation_style":
                result[key] = self._normalise_confirmation_style(
                    value
                )

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
            "voice_aliases": {},
            "speech_recognition_corrections": {},
            "preferred_confirmation_style": "",
            "confirmation_style_counts": {},
            "frequent_products": [],
            "frequent_pickups": [],
            "product_counts": {},
            "pickup_counts": {},
        }

    # ------------------------------------------------------------------
    # Generic helpers
    # ------------------------------------------------------------------

    def _merge_safe_mapping(
        self,
        *,
        memory: dict[str, Any],
        key: str,
        values: Any,
        maximum: int,
    ) -> None:
        if not isinstance(values, Mapping):
            return

        current = self._mapping(memory.get(key))

        for source, target in values.items():
            clean_source = self._normalise_phrase(source)
            clean_target = self._clean_memory_value(target)

            if clean_source and clean_target:
                current[clean_source] = clean_target

        memory[key] = self._limit_mapping(
            current,
            maximum,
        )

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
        text = unicodedata.normalize(
            "NFKD",
            str(value or ""),
        )
        text = "".join(
            character
            for character in text
            if not unicodedata.combining(character)
        )
        text = text.casefold()
        text = re.sub(r"[^a-z0-9@.+_-]+", " ", text)
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
    def _normalise_confirmation_style(value: Any) -> str:
        style = str(value or "").strip().lower()
        aliases = {
            "short": "concise",
            "brief": "concise",
            "concise": "concise",
            "friendly": "friendly",
            "natural": "friendly",
            "detailed": "detailed",
            "full": "detailed",
            "voice": "voice_short",
            "voice_short": "voice_short",
        }
        return aliases.get(style, "")

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