"""
AI-powered product translation service.

Translations are stored exclusively in ExperienceProduct.translations.
The service never overwrites manually edited translations unless force=True.
"""

from __future__ import annotations

import json
from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.utils import timezone

from organisations.ai.constants import FEATURE_TRANSLATIONS
from organisations.ai.service import OrganisationAIService
from ticketing.models import ExperienceProduct


SUPPORTED_LANGUAGES = ("en", "es", "fr", "pt", "de")

LANGUAGE_NAMES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "pt": "Portuguese",
    "de": "German",
}

TRANSLATABLE_FIELDS = (
    "name",
    "short_description",
    "long_description",
    "includes",
    "excludes",
    "itinerary",
    "faqs",
    "meeting_point",
    "ticket_information",
    "instructions",
    "cancellation_policy",
)

LIST_FIELDS = {
    "includes",
    "excludes",
    "itinerary",
    "faqs",
}


class ProductTranslationError(Exception):
    """Base exception for product translation failures."""


class UnsupportedLanguageError(ProductTranslationError):
    """Raised when a language is outside the supported language set."""


class SameLanguageTranslationError(ProductTranslationError):
    """Raised when source and destination languages are the same."""


class ManualTranslationProtectedError(ProductTranslationError):
    """Raised when a manually edited translation would be overwritten."""


class InvalidTranslationResponseError(ProductTranslationError):
    """Raised when the provider returns malformed translation data."""


@dataclass(frozen=True)
class ProductTranslationResult:
    product_id: int
    source_language: str
    target_language: str
    translation: dict[str, Any]


def normalise_language(language: object) -> str:
    value = str(language or "").strip().lower()

    if value not in SUPPORTED_LANGUAGES:
        raise UnsupportedLanguageError(
            f"Unsupported language: {value or 'unknown'}."
        )

    return value


def _normalise_list(value: Any) -> list[Any]:
    if value is None:
        return []

    if isinstance(value, list):
        return deepcopy(value)

    return [value]


def _get_source_payload(product: ExperienceProduct) -> dict[str, Any]:
    return {
        "name": product.name or "",
        "short_description": product.short_description or "",
        "long_description": product.long_description or "",
        "includes": _normalise_list(product.includes),
        "excludes": _normalise_list(product.excludes),
        "itinerary": _normalise_list(product.itinerary),
        "faqs": _normalise_list(product.faqs),
        "meeting_point": product.location or "",
        "ticket_information": product.ticket_information or "",
        "instructions": product.instructions or "",
        "cancellation_policy": product.cancellation_policy or "",
    }


def _extract_json_object(raw_text: str) -> dict[str, Any]:
    text = str(raw_text or "").strip()

    if not text:
        raise InvalidTranslationResponseError(
            "The AI provider returned an empty translation."
        )

    if text.startswith("```"):
        lines = text.splitlines()

        if lines and lines[0].startswith("```"):
            lines = lines[1:]

        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]

        text = "\n".join(lines).strip()

    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise InvalidTranslationResponseError(
            "The AI provider returned invalid JSON."
        ) from exc

    if not isinstance(data, dict):
        raise InvalidTranslationResponseError(
            "The AI provider response must be a JSON object."
        )

    return data


def _validate_translation_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:
    cleaned: dict[str, Any] = {}

    for field in TRANSLATABLE_FIELDS:
        value = payload.get(field)

        if field in LIST_FIELDS:
            cleaned[field] = _normalise_list(value)
        else:
            cleaned[field] = str(value or "").strip()

    return cleaned


def _is_manually_protected(
    translation: dict[str, Any] | None,
) -> bool:
    if not isinstance(translation, dict):
        return False

    meta = translation.get("_meta")

    if not isinstance(meta, dict):
        return False

    return bool(meta.get("manually_edited"))


class ProductTranslationService:
    def __init__(self, product: ExperienceProduct) -> None:
        if product is None:
            raise ProductTranslationError(
                "A product is required."
            )

        self.product = product
        self.organisation = product.organisation

    def generate(
        self,
        target_language: str,
        *,
        force: bool = False,
    ) -> ProductTranslationResult:
        target_language = normalise_language(target_language)
        source_language = normalise_language(
            self.product.default_language or "en"
        )

        if source_language == target_language:
            raise SameLanguageTranslationError(
                "The target language must be different from the product's "
                "default language."
            )

        existing_translations = (
            deepcopy(self.product.translations)
            if isinstance(self.product.translations, dict)
            else {}
        )
        existing_translation = existing_translations.get(
            target_language
        )

        if (
            not force
            and _is_manually_protected(existing_translation)
        ):
            raise ManualTranslationProtectedError(
                "This translation has been manually edited and cannot be "
                "overwritten without explicit confirmation."
            )

        source_payload = _get_source_payload(self.product)
        ai_service = OrganisationAIService(self.organisation)
        context = ai_service.build_provider(
            feature=FEATURE_TRANSLATIONS,
        )

        instructions = (
            "You are a professional travel and ticketing translator. "
            "Translate the supplied product content accurately and naturally. "
            "Preserve meaning, formatting, numbers, times, proper names, URLs, "
            "and list structure. Do not invent information. Return only valid "
            "JSON with exactly the same keys as the input object. "
            f"Translate from {LANGUAGE_NAMES[source_language]} to "
            f"{LANGUAGE_NAMES[target_language]}."
        )

        result = context.provider.generate_text(
            instructions=instructions,
            input_text=json.dumps(
                source_payload,
                ensure_ascii=False,
                separators=(",", ":"),
            ),
        )

        translated_payload = _validate_translation_payload(
            _extract_json_object(result.text)
        )

        translated_payload["_meta"] = {
            "source": "ai",
            "manually_edited": False,
            "source_language": source_language,
            "target_language": target_language,
            "provider": result.provider,
            "model": result.model,
            "generated_at": timezone.now().isoformat(),
        }

        with transaction.atomic():
            locked_product = (
                ExperienceProduct.objects
                .select_for_update()
                .get(pk=self.product.pk)
            )

            translations = (
                deepcopy(locked_product.translations)
                if isinstance(locked_product.translations, dict)
                else {}
            )

            current_translation = translations.get(
                target_language
            )

            if (
                not force
                and _is_manually_protected(current_translation)
            ):
                raise ManualTranslationProtectedError(
                    "This translation was manually edited while the AI "
                    "request was running and was not overwritten."
                )

            translations[target_language] = translated_payload
            locked_product.translations = translations
            locked_product.save(
                update_fields=[
                    "translations",
                    "updated_at",
                ]
            )

        self.product.translations = translations

        return ProductTranslationResult(
            product_id=self.product.pk,
            source_language=source_language,
            target_language=target_language,
            translation=translated_payload,
        )
