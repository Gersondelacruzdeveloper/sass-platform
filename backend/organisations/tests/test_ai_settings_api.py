"""API tests for tenant-scoped organisation AI settings."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from organisations.models import Membership, Organisation, OrganisationAISettings


User = get_user_model()


class OrganisationAISettingsAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="AI Settings API Tenant",
            slug="ai-settings-api-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other AI Settings API Tenant",
            slug="other-ai-settings-api-tenant",
            business_type="hotel",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive AI Settings API Tenant",
            slug="inactive-ai-settings-api-tenant",
            business_type="store",
            is_active=False,
        )

        cls.owner = cls.create_user("ai-settings-api-owner")
        cls.admin = cls.create_user("ai-settings-api-admin")
        cls.viewer = cls.create_user("ai-settings-api-viewer")
        cls.other_owner = cls.create_user("ai-settings-api-other-owner")
        cls.inactive_member = cls.create_user("ai-settings-api-inactive-member")
        cls.inactive_tenant_user = cls.create_user(
            "ai-settings-api-inactive-tenant"
        )

        for user, role, active in (
            (cls.owner, "owner", True),
            (cls.admin, "admin", True),
            (cls.viewer, "viewer", True),
            (cls.inactive_member, "owner", False),
        ):
            Membership.objects.create(
                user=user,
                organisation=cls.organisation,
                role=role,
                is_active=active,
            )

        Membership.objects.create(
            user=cls.other_owner,
            organisation=cls.other_organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_tenant_user,
            organisation=cls.inactive_organisation,
            role="owner",
            is_active=True,
        )

        cls.settings = OrganisationAISettings.objects.create(
            organisation=cls.organisation,
            provider="openai",
            default_model="gpt-5.5",
            provider_api_key="fernet:v1:primary-tenant-secret",
            has_api_key=True,
            is_enabled=True,
        )
        cls.other_settings = OrganisationAISettings.objects.create(
            organisation=cls.other_organisation,
            provider="anthropic",
            default_model="other-tenant-model",
            provider_api_key="fernet:v1:other-tenant-secret",
            has_api_key=True,
            is_enabled=True,
        )

    @classmethod
    def create_user(cls, identifier):
        return User.objects.create_user(
            username=identifier,
            email=f"{identifier}@example.com",
            password="Strong-test-password-123",
        )

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("organisation-ai-settings")

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def assert_no_secret(self, payload):
        rendered = repr(payload)
        self.assertNotIn("api_key", payload)
        self.assertNotIn("provider_api_key", payload)
        self.assertNotIn("clear_api_key", payload)
        for forbidden in (
            "primary-tenant-secret",
            "other-tenant-secret",
            "fernet:v1",
        ):
            self.assertNotIn(forbidden, rendered)

    def test_url_name_resolves_to_expected_path(self):
        self.assertEqual(
            self.url,
            "/api/organisations/ai-settings/mine/",
        )

    def test_authentication_is_required_for_get_and_patch(self):
        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"default_model": "blocked-model"},
            format="json",
        )

        self.assertIn(get_response.status_code, (401, 403))
        self.assertIn(patch_response.status_code, (401, 403))
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.default_model, "gpt-5.5")

    def test_active_member_gets_only_own_tenant_settings_without_secrets(self):
        self.authenticate(self.viewer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.settings.id)
        self.assertEqual(response.data["organisation"], self.organisation.id)
        self.assertEqual(response.data["provider"], "openai")
        self.assertTrue(response.data["has_api_key"])
        self.assert_no_secret(response.data)

    def test_other_tenant_member_cannot_read_primary_tenant_settings(self):
        self.authenticate(self.other_owner)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.other_settings.id)
        self.assertEqual(
            response.data["organisation"],
            self.other_organisation.id,
        )
        self.assertEqual(response.data["default_model"], "other-tenant-model")
        self.assertNotEqual(response.data["id"], self.settings.id)
        self.assert_no_secret(response.data)

    def test_repeated_get_reuses_one_settings_record(self):
        OrganisationAISettings.objects.filter(
            organisation=self.organisation
        ).delete()
        self.authenticate(self.owner)

        first = self.client.get(self.url)
        second = self.client.get(self.url)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], second.data["id"])
        self.assertEqual(
            OrganisationAISettings.objects.filter(
                organisation=self.organisation
            ).count(),
            1,
        )

    def test_owner_can_update_settings_and_secret_is_encrypted_at_boundary(self):
        self.authenticate(self.owner)

        with patch(
            "organisations.serializers.encrypt_secret",
            return_value="fernet:v1:new-encrypted-secret",
        ) as encrypt_secret:
            response = self.client.patch(
                self.url,
                {
                    "provider": "openai",
                    "default_model": "claude-test-model",
                    "api_key": "plaintext-private-key",
                    "is_enabled": True,
                },
                format="json",
            )

        self.assertEqual(response.status_code, 200)
        encrypt_secret.assert_called_once_with("plaintext-private-key")
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.provider, "openai")
        self.assertEqual(self.settings.default_model, "claude-test-model")
        self.assertEqual(
            self.settings.provider_api_key,
            "fernet:v1:new-encrypted-secret",
        )
        self.assert_no_secret(response.data)
        self.assertNotIn("plaintext-private-key", repr(response.data))

    def test_admin_can_update_non_secret_settings(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.url,
            {"translations_enabled": False},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.settings.refresh_from_db()
        self.assertFalse(self.settings.translations_enabled)

    def test_viewer_cannot_update_ai_settings(self):
        self.authenticate(self.viewer)

        response = self.client.patch(
            self.url,
            {"default_model": "unauthorised-model"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.default_model, "gpt-5.5")

    def test_inactive_membership_blocks_get_and_patch(self):
        self.authenticate(self.inactive_member)

        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"default_model": "blocked-model"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.default_model, "gpt-5.5")

    def test_inactive_organisation_blocks_get_and_patch(self):
        self.authenticate(self.inactive_tenant_user)

        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"default_model": "blocked-model"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.assertFalse(
            OrganisationAISettings.objects.filter(
                organisation=self.inactive_organisation
            ).exists()
        )

    def test_invalid_update_returns_safe_validation_error_without_changes(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.url,
            {"provider": "unknown-provider"},
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("provider", response.data)
        self.assert_no_secret(response.data)
        self.settings.refresh_from_db()
        self.assertEqual(self.settings.provider, "openai")

    def test_post_put_and_delete_are_not_allowed(self):
        self.authenticate(self.owner)

        responses = (
            self.client.post(self.url, {}, format="json"),
            self.client.put(self.url, {}, format="json"),
            self.client.delete(self.url),
        )

        for response in responses:
            self.assertEqual(response.status_code, 405)
