"""Tests for organisation AI settings serialization."""

from unittest.mock import patch

from django.test import TestCase
from organisations.models import Organisation, OrganisationAISettings
from organisations.serializers import OrganisationAISettingsSerializer


class OrganisationAISettingsSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="AI Serializer Tenant",
            slug="ai-serializer-tenant",
            is_active=True,
        )

    def test_response_never_exposes_plaintext_or_encrypted_key(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation,
            provider_api_key="fernet:v1:encrypted-private-value",
            has_api_key=True,
            is_enabled=True,
        )

        data = OrganisationAISettingsSerializer(settings).data

        self.assertTrue(data["has_api_key"])
        self.assertTrue(data["ai_ready"])
        self.assertNotIn("provider_api_key", data)
        self.assertNotIn("api_key", data)
        self.assertNotIn("clear_api_key", data)
        self.assertNotIn("encrypted-private-value", repr(data))

    def test_cannot_enable_ai_without_api_key(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"is_enabled": True},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("is_enabled", serializer.errors)
        settings.refresh_from_db()
        self.assertFalse(settings.is_enabled)

    @patch(
        "organisations.serializers.encrypt_secret",
        return_value="fernet:v1:test-encrypted-key",
    )
    def test_setting_key_encrypts_and_updates_safe_state(self, encrypt_secret):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"api_key": "sk-private-test-key"},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        encrypt_secret.assert_called_once_with("sk-private-test-key")
        self.assertEqual(
            updated.provider_api_key,
            "fernet:v1:test-encrypted-key",
        )
        self.assertTrue(updated.has_api_key)
        self.assertIsNotNone(updated.provider_api_key_last_updated)
        self.assertNotIn("sk-private-test-key", repr(serializer.data))
        self.assertNotIn("test-encrypted-key", repr(serializer.data))

    def test_key_and_clear_flag_cannot_be_submitted_together(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={
                "api_key": "sk-private-test-key",
                "clear_api_key": True,
            },
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("clear_api_key", serializer.errors)
        settings.refresh_from_db()
        self.assertFalse(settings.has_api_key)

    def test_clear_key_disables_ai_and_clears_safe_error_state(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation,
            provider_api_key="fernet:v1:old-key",
            has_api_key=True,
            is_enabled=True,
            last_error_message="old safe error",
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"clear_api_key": True},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertEqual(updated.provider_api_key, "")
        self.assertFalse(updated.has_api_key)
        self.assertFalse(updated.is_enabled)
        self.assertEqual(updated.last_error_message, "")
        self.assertIsNone(updated.provider_api_key_last_updated)

    def test_existing_key_allows_enable_without_resubmitting_secret(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation,
            provider_api_key="fernet:v1:existing-key",
            has_api_key=True,
            is_enabled=False,
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"is_enabled": True},
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertTrue(updated.is_enabled)
        self.assertEqual(updated.provider_api_key, "fernet:v1:existing-key")

    def test_invalid_provider_is_rejected(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"provider": "unsupported-provider"},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("provider", serializer.errors)

    def test_blank_api_key_is_rejected(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={"api_key": "   "},
            partial=True,
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("api_key", serializer.errors)

    def test_read_only_fields_cannot_be_overwritten(self):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation,
            last_error_message="original safe error",
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={
                "organisation": 999999,
                "has_api_key": True,
                "last_error_message": "attacker-controlled error",
                "last_test_at": "2026-01-01T00:00:00Z",
                "translations_enabled": False,
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        self.assertEqual(updated.organisation, self.organisation)
        self.assertFalse(updated.has_api_key)
        self.assertEqual(updated.last_error_message, "original safe error")
        self.assertIsNone(updated.last_test_at)
        self.assertFalse(updated.translations_enabled)

    @patch(
        "organisations.serializers.encrypt_secret",
        side_effect=RuntimeError("simulated encryption failure"),
    )
    def test_encryption_failure_does_not_partially_update_settings(
        self,
        encrypt_secret,
    ):
        settings = OrganisationAISettings.objects.create(
            organisation=self.organisation,
            default_model="original-model",
        )
        serializer = OrganisationAISettingsSerializer(
            settings,
            data={
                "api_key": "sk-private-test-key",
                "default_model": "must-not-persist",
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)

        with self.assertRaises(RuntimeError):
            serializer.save()

        settings.refresh_from_db()
        self.assertEqual(settings.default_model, "original-model")
        self.assertEqual(settings.provider_api_key, "")
        self.assertFalse(settings.has_api_key)
