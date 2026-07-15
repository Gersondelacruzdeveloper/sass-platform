"""
Organisation-level AI service.

This module is the single entry point for:
- loading an organisation's AI settings,
- validating feature availability,
- decrypting provider credentials,
- building the configured AI provider,
- testing the provider connection.

Views, serializers, and ticketing services should use this service instead of
accessing encrypted credentials or provider implementations directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from django.utils import timezone

from organisations.models import OrganisationAISettings

from .constants import FEATURE_TRANSLATIONS
from .encryption import (
    AIEncryptionError,
    decrypt_secret,
)
from .providers import (
    AIProviderError,
    BaseAIProvider,
    get_ai_provider,
)

if TYPE_CHECKING:
    from organisations.models import Organisation


class OrganisationAIServiceError(Exception):
    """Base exception for organisation AI service failures."""


class OrganisationAISettingsNotConfiguredError(OrganisationAIServiceError):
    """Raised when an organisation has no usable AI configuration."""


class OrganisationAIDisabledError(OrganisationAIServiceError):
    """Raised when organisation-level AI is disabled."""


class OrganisationAIFeatureDisabledError(OrganisationAIServiceError):
    """Raised when a requested AI feature is disabled."""


class OrganisationAICredentialError(OrganisationAIServiceError):
    """Raised when provider credentials are missing or unreadable."""


class OrganisationAIProviderError(OrganisationAIServiceError):
    """Raised when the configured AI provider cannot complete an operation."""


@dataclass(frozen=True)
class OrganisationAIContext:
    settings: OrganisationAISettings
    provider: BaseAIProvider


class OrganisationAIService:
    """
    Resolve and use AI configuration for a single organisation.

    Create a new service instance per request or background task.
    """

    def __init__(self, organisation: "Organisation") -> None:
        if organisation is None:
            raise OrganisationAISettingsNotConfiguredError(
                "An organisation is required."
            )

        self.organisation = organisation

    def get_settings(
        self,
        *,
        create: bool = False,
    ) -> OrganisationAISettings:
        if create:
            ai_settings, _created = (
                OrganisationAISettings.objects.get_or_create(
                    organisation=self.organisation,
                    defaults={
                        "provider": "openai",
                        "is_enabled": False,
                        "translations_enabled": True,
                    },
                )
            )
            return ai_settings

        try:
            return OrganisationAISettings.objects.get(
                organisation=self.organisation,
            )
        except OrganisationAISettings.DoesNotExist as exc:
            raise OrganisationAISettingsNotConfiguredError(
                "AI settings have not been configured for this organisation."
            ) from exc

    def ensure_feature_enabled(
        self,
        feature: str,
        *,
        ai_settings: OrganisationAISettings | None = None,
    ) -> OrganisationAISettings:
        resolved_settings = ai_settings or self.get_settings()

        if not resolved_settings.is_enabled:
            raise OrganisationAIDisabledError(
                "AI is disabled for this organisation."
            )

        feature_name = str(feature or "").strip().lower()

        if (
            feature_name == FEATURE_TRANSLATIONS
            and not resolved_settings.translations_enabled
        ):
            raise OrganisationAIFeatureDisabledError(
                "AI translations are disabled for this organisation."
            )

        return resolved_settings

    def get_decrypted_api_key(
        self,
        *,
        ai_settings: OrganisationAISettings | None = None,
    ) -> str:
        resolved_settings = ai_settings or self.get_settings()

        if (
            not resolved_settings.has_api_key
            or not resolved_settings.provider_api_key
        ):
            raise OrganisationAICredentialError(
                "No AI provider API key is configured."
            )

        try:
            api_key = decrypt_secret(
                resolved_settings.provider_api_key
            )
        except AIEncryptionError as exc:
            raise OrganisationAICredentialError(
                "The configured AI provider API key could not be read."
            ) from exc

        if not api_key:
            raise OrganisationAICredentialError(
                "The configured AI provider API key is empty."
            )

        return api_key

    def build_provider(
        self,
        *,
        feature: str | None = None,
        require_enabled: bool = True,
    ) -> OrganisationAIContext:
        ai_settings = self.get_settings()

        if require_enabled:
            if feature:
                self.ensure_feature_enabled(
                    feature,
                    ai_settings=ai_settings,
                )
            elif not ai_settings.is_enabled:
                raise OrganisationAIDisabledError(
                    "AI is disabled for this organisation."
                )

        api_key = self.get_decrypted_api_key(
            ai_settings=ai_settings,
        )

        try:
            provider = get_ai_provider(
                provider=ai_settings.provider,
                api_key=api_key,
                default_model=ai_settings.default_model,
            )
        except AIProviderError as exc:
            raise OrganisationAIProviderError(str(exc)) from exc

        return OrganisationAIContext(
            settings=ai_settings,
            provider=provider,
        )

    def test_connection(self) -> bool:
        """
        Test the configured provider credentials.

        Testing is allowed even when the master AI switch is disabled, because
        organisations should be able to verify a key before enabling AI.
        """
        ai_settings = self.get_settings(create=True)

        try:
            context = self.build_provider(
                require_enabled=False,
            )
            context.provider.test_connection()
        except (
            OrganisationAIServiceError,
            AIProviderError,
        ) as exc:
            ai_settings.last_test_at = timezone.now()
            ai_settings.last_error_message = str(exc)
            ai_settings.save(
                update_fields=[
                    "last_test_at",
                    "last_error_message",
                    "updated_at",
                ]
            )

            if isinstance(exc, OrganisationAIServiceError):
                raise

            raise OrganisationAIProviderError(str(exc)) from exc

        ai_settings.last_test_at = timezone.now()
        ai_settings.last_error_message = ""
        ai_settings.save(
            update_fields=[
                "last_test_at",
                "last_error_message",
                "updated_at",
            ]
        )

        return True
