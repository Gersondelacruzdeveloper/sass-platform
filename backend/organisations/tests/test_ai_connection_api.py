"""API tests for organisation AI connection verification."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from organisations.ai.service import OrganisationAIProviderError
from organisations.models import Membership, Organisation


User = get_user_model()


class OrganisationAIConnectionAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="AI Connection API Tenant",
            slug="ai-connection-api-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other AI Connection API Tenant",
            slug="other-ai-connection-api-tenant",
            business_type="hotel",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive AI Connection API Tenant",
            slug="inactive-ai-connection-api-tenant",
            business_type="store",
            is_active=False,
        )

        cls.owner = cls.create_user("ai-connection-api-owner")
        cls.admin = cls.create_user("ai-connection-api-admin")
        cls.viewer = cls.create_user("ai-connection-api-viewer")
        cls.other_owner = cls.create_user("ai-connection-api-other-owner")
        cls.inactive_member = cls.create_user(
            "ai-connection-api-inactive-member"
        )
        cls.inactive_tenant_user = cls.create_user(
            "ai-connection-api-inactive-tenant"
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

    @classmethod
    def create_user(cls, identifier):
        return User.objects.create_user(
            username=identifier,
            email=f"{identifier}@example.com",
            password="Strong-test-password-123",
        )

    def setUp(self):
        self.client = APIClient()
        self.url = reverse("organisation-ai-settings-test")

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_url_name_resolves_to_expected_path(self):
        self.assertEqual(
            self.url,
            "/api/organisations/ai-settings/test/",
        )

    def test_authentication_is_required_without_constructing_service(self):
        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            response = self.client.post(self.url, {}, format="json")

        self.assertIn(response.status_code, (401, 403))
        service_class.assert_not_called()

    def test_only_post_is_allowed(self):
        self.authenticate(self.owner)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            responses = (
                self.client.get(self.url),
                self.client.patch(self.url, {}, format="json"),
                self.client.put(self.url, {}, format="json"),
                self.client.delete(self.url),
            )

        for response in responses:
            self.assertEqual(response.status_code, 405)
        service_class.assert_not_called()

    def test_owner_can_verify_connection_for_own_tenant(self):
        self.authenticate(self.owner)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            service_class.return_value.test_connection.return_value = True
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        self.assertEqual(
            response.data["message"],
            "AI provider connection verified successfully.",
        )
        service_class.assert_called_once_with(self.organisation)
        service_class.return_value.test_connection.assert_called_once_with()

    def test_admin_can_verify_connection(self):
        self.authenticate(self.admin)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 200)
        service_class.assert_called_once_with(self.organisation)

    def test_viewer_cannot_trigger_provider_connection(self):
        self.authenticate(self.viewer)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 403)
        service_class.assert_not_called()

    def test_other_tenant_owner_uses_only_other_tenant_context(self):
        self.authenticate(self.other_owner)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 200)
        service_class.assert_called_once_with(self.other_organisation)
        self.assertNotEqual(
            service_class.call_args.args[0],
            self.organisation,
        )

    def test_inactive_membership_and_tenant_are_rejected_before_service(self):
        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            for user in (
                self.inactive_member,
                self.inactive_tenant_user,
            ):
                self.authenticate(user)
                response = self.client.post(self.url, {}, format="json")
                self.assertEqual(response.status_code, 403)

        service_class.assert_not_called()

    def test_controlled_service_failure_returns_safe_bad_request(self):
        self.authenticate(self.owner)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            service_class.return_value.test_connection.side_effect = (
                OrganisationAIProviderError(
                    "AI provider connection could not be verified."
                )
            )
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(
            response.data["message"],
            "AI provider connection could not be verified.",
        )

    def test_unexpected_failure_does_not_expose_sensitive_details(self):
        self.authenticate(self.owner)

        with patch(
            "organisations.views.OrganisationAIService"
        ) as service_class:
            service_class.return_value.test_connection.side_effect = (
                RuntimeError(
                    "internal failure leaked plaintext-private-key"
                )
            )
            response = self.client.post(self.url, {}, format="json")

        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.data["success"])
        self.assertEqual(
            response.data["message"],
            "AI provider connection could not be verified.",
        )
        self.assertNotIn("plaintext-private-key", repr(response.data))

