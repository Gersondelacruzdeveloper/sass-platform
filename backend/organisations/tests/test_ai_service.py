"""Tests for the tenant-scoped organisation AI service."""

from unittest.mock import Mock, patch

from django.test import TestCase

from organisations.ai.encryption import AISecretDecryptionError
from organisations.ai.providers import (
    AIProviderConfigurationError,
    AIProviderRequestError,
)
from organisations.ai.service import (
    OrganisationAICredentialError,
    OrganisationAIDisabledError,
    OrganisationAIFeatureDisabledError,
    OrganisationAIProviderError,
    OrganisationAIService,
    OrganisationAISettingsNotConfiguredError,
)
from organisations.models import Organisation, OrganisationAISettings


class OrganisationAIServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="AI Service Tenant",
            slug="ai-service-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other AI Service Tenant",
            slug="other-ai-service-tenant",
            business_type="hotel",
            is_active=True,
        )
        cls.other_settings = OrganisationAISettings.objects.create(
            organisation=cls.other_organisation,
            provider_api_key="fernet:v1:other-tenant-key",
            has_api_key=True,
            is_enabled=True,
            default_model="other-tenant-model",
        )

    def setUp(self):
        self.service = OrganisationAIService(self.organisation)

    def create_settings(self, **overrides):
        values = {
            "organisation": self.organisation,
            "provider": "openai",
            "provider_api_key": "fernet:v1:tenant-key",
            "has_api_key": True,
            "is_enabled": True,
            "translations_enabled": True,
            "default_model": "gpt-service-model",
        }
        values.update(overrides)
        return OrganisationAISettings.objects.create(**values)

    def test_organisation_is_required(self):
        with self.assertRaises(OrganisationAISettingsNotConfiguredError):
            OrganisationAIService(None)

    def test_missing_settings_are_not_silently_created_by_default(self):
        with self.assertRaises(OrganisationAISettingsNotConfiguredError):
            self.service.get_settings()

        self.assertFalse(
            OrganisationAISettings.objects.filter(
                organisation=self.organisation
            ).exists()
        )

    def test_create_settings_is_idempotent_and_tenant_scoped(self):
        first = self.service.get_settings(create=True)
        second = self.service.get_settings(create=True)

        self.assertEqual(first.id, second.id)
        self.assertEqual(first.organisation, self.organisation)
        self.assertFalse(first.is_enabled)
        self.assertEqual(
            OrganisationAISettings.objects.filter(
                organisation=self.organisation
            ).count(),
            1,
        )
        self.other_settings.refresh_from_db()
        self.assertEqual(
            self.other_settings.default_model,
            "other-tenant-model",
        )

    def test_disabled_master_switch_rejects_feature(self):
        settings = self.create_settings(is_enabled=False)

        with self.assertRaises(OrganisationAIDisabledError):
            self.service.ensure_feature_enabled(
                "translations",
                ai_settings=settings,
            )

    def test_disabled_translation_feature_is_rejected(self):
        settings = self.create_settings(translations_enabled=False)

        with self.assertRaises(OrganisationAIFeatureDisabledError):
            self.service.ensure_feature_enabled(
                "translations",
                ai_settings=settings,
            )

    def test_missing_api_key_is_rejected_before_decryption(self):
        settings = self.create_settings(
            provider_api_key="",
            has_api_key=False,
        )

        with patch("organisations.ai.service.decrypt_secret") as decrypt:
            with self.assertRaises(OrganisationAICredentialError):
                self.service.get_decrypted_api_key(ai_settings=settings)

        decrypt.assert_not_called()

    def test_decryption_failure_is_sanitized(self):
        settings = self.create_settings()

        with patch(
            "organisations.ai.service.decrypt_secret",
            side_effect=AISecretDecryptionError(
                "private encrypted value leaked"
            ),
        ):
            with self.assertRaises(OrganisationAICredentialError) as context:
                self.service.get_decrypted_api_key(ai_settings=settings)

        message = str(context.exception)
        self.assertEqual(
            message,
            "The configured AI provider API key could not be read.",
        )
        self.assertNotIn("private", message)

    def test_build_provider_uses_decrypted_key_and_current_tenant_settings(self):
        settings = self.create_settings()
        provider = Mock()

        with (
            patch(
                "organisations.ai.service.decrypt_secret",
                return_value="decrypted-private-key",
            ) as decrypt,
            patch(
                "organisations.ai.service.get_ai_provider",
                return_value=provider,
            ) as factory,
        ):
            context = self.service.build_provider(
                feature="translations"
            )

        self.assertEqual(context.settings, settings)
        self.assertIs(context.provider, provider)
        decrypt.assert_called_once_with("fernet:v1:tenant-key")
        factory.assert_called_once_with(
            provider="openai",
            api_key="decrypted-private-key",
            default_model="gpt-service-model",
        )
        self.assertNotEqual(context.settings, self.other_settings)

    def test_provider_factory_error_is_wrapped_without_secret(self):
        self.create_settings()

        with (
            patch(
                "organisations.ai.service.decrypt_secret",
                return_value="decrypted-private-key",
            ),
            patch(
                "organisations.ai.service.get_ai_provider",
                side_effect=AIProviderConfigurationError(
                    "Provider configuration is unavailable."
                ),
            ),
        ):
            with self.assertRaises(OrganisationAIProviderError) as context:
                self.service.build_provider()

        self.assertEqual(
            str(context.exception),
            "Provider configuration is unavailable.",
        )
        self.assertNotIn("decrypted-private-key", str(context.exception))

    def test_connection_success_updates_only_current_tenant_safe_state(self):
        settings = self.create_settings(last_error_message="old safe error")
        provider = Mock()
        provider.test_connection.return_value = True
        context = Mock(provider=provider)

        with patch.object(
            self.service,
            "build_provider",
            return_value=context,
        ) as build_provider:
            result = self.service.test_connection()

        self.assertTrue(result)
        build_provider.assert_called_once_with(require_enabled=False)
        provider.test_connection.assert_called_once_with()
        settings.refresh_from_db()
        self.assertIsNotNone(settings.last_test_at)
        self.assertEqual(settings.last_error_message, "")
        self.other_settings.refresh_from_db()
        self.assertIsNone(self.other_settings.last_test_at)

    def test_service_failure_updates_timestamp_with_safe_error(self):
        settings = self.create_settings(
            provider_api_key="",
            has_api_key=False,
        )

        with self.assertRaises(OrganisationAICredentialError) as context:
            self.service.test_connection()

        settings.refresh_from_db()
        self.assertIsNotNone(settings.last_test_at)
        self.assertEqual(
            settings.last_error_message,
            "No AI provider API key is configured.",
        )
        self.assertEqual(
            settings.last_error_message,
            str(context.exception),
        )

    def test_provider_failure_never_stores_or_raises_sensitive_details(self):
        settings = self.create_settings()
        provider = Mock()
        provider.test_connection.side_effect = AIProviderRequestError(
            "upstream leaked decrypted-private-key and request body"
        )
        context = Mock(provider=provider)

        with patch.object(
            self.service,
            "build_provider",
            return_value=context,
        ):
            with self.assertRaises(OrganisationAIProviderError) as raised:
                self.service.test_connection()

        settings.refresh_from_db()
        self.assertIsNotNone(settings.last_test_at)
        for value in (
            settings.last_error_message,
            str(raised.exception),
        ):
            self.assertNotIn("decrypted-private-key", value)
            self.assertNotIn("request body", value)
        self.assertEqual(
            settings.last_error_message,
            "AI provider connection could not be verified.",
        )

