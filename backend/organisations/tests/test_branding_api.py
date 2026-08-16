"""API tests for authenticated organisation branding management."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from organisations.models import (
    Membership,
    Organisation,
    OrganisationBranding,
)


User = get_user_model()


class OrganisationBrandingAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Branding API Tenant",
            slug="branding-api-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Branding API Tenant",
            slug="other-branding-api-tenant",
            business_type="hotel",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Branding API Tenant",
            slug="inactive-branding-api-tenant",
            business_type="store",
            is_active=False,
        )
        cls.other_branding = OrganisationBranding.objects.create(
            organisation=cls.other_organisation,
            company_name="Other Tenant Branding",
            platform_name="Other Tenant Platform",
        )

        cls.owner = cls.create_user("branding-api-owner")
        cls.admin = cls.create_user("branding-api-admin")
        cls.viewer = cls.create_user("branding-api-viewer")
        cls.inactive_member = cls.create_user("branding-api-inactive-member")
        cls.inactive_tenant_user = cls.create_user(
            "branding-api-inactive-tenant"
        )
        cls.superuser = User.objects.create_superuser(
            username="branding-api-platform-owner",
            email="branding-api-platform-owner@example.com",
            password="Strong-test-password-123",
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
        self.url = reverse(
            "organisation-branding-detail",
            kwargs={
                "business_type": self.organisation.business_type,
                "slug": self.organisation.slug,
            },
        )
        self.other_url = reverse(
            "organisation-branding-detail",
            kwargs={
                "business_type": self.other_organisation.business_type,
                "slug": self.other_organisation.slug,
            },
        )

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def test_url_name_resolves_to_expected_path(self):
        self.assertEqual(
            self.url,
            "/api/organisations/branding/ticketing/branding-api-tenant/",
        )

    def test_authentication_is_required_for_get_and_patch(self):
        get_response = self.client.get(self.url)
        patch_response = self.client.patch(
            self.url,
            {"company_name": "Blocked"},
            format="json",
        )

        self.assertIn(get_response.status_code, (401, 403))
        self.assertIn(patch_response.status_code, (401, 403))
        self.assertFalse(
            OrganisationBranding.objects.filter(
                organisation=self.organisation
            ).exists()
        )

    def test_member_get_creates_and_returns_default_branding(self):
        self.authenticate(self.viewer)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 200)
        branding = OrganisationBranding.objects.get(
            organisation=self.organisation
        )
        self.assertEqual(response.data["id"], branding.pk)
        self.assertEqual(response.data["organisation"], self.organisation.pk)
        self.assertEqual(response.data["company_name"], self.organisation.name)
        self.assertNotIn(self.other_organisation.slug, repr(response.data))

    def test_repeated_get_reuses_single_branding_record(self):
        self.authenticate(self.owner)

        first_response = self.client.get(self.url)
        second_response = self.client.get(self.url)

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        self.assertEqual(first_response.data["id"], second_response.data["id"])
        self.assertEqual(
            OrganisationBranding.objects.filter(
                organisation=self.organisation
            ).count(),
            1,
        )

    def test_owner_can_update_own_branding(self):
        self.authenticate(self.owner)

        response = self.client.patch(
            self.url,
            {
                "company_name": "Owner Updated Branding",
                "primary_color": "#123456",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        branding = OrganisationBranding.objects.get(
            organisation=self.organisation
        )
        self.assertEqual(branding.company_name, "Owner Updated Branding")
        self.assertEqual(branding.primary_color, "#123456")

    def test_admin_can_update_own_branding(self):
        self.authenticate(self.admin)

        response = self.client.patch(
            self.url,
            {"login_title": "Admin Updated Login"},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        branding = OrganisationBranding.objects.get(
            organisation=self.organisation
        )
        self.assertEqual(branding.login_title, "Admin Updated Login")

    def test_viewer_cannot_update_branding(self):
        self.authenticate(self.viewer)

        response = self.client.patch(
            self.url,
            {"company_name": "Viewer Hijacked Branding"},
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        branding = OrganisationBranding.objects.filter(
            organisation=self.organisation
        ).first()
        self.assertTrue(
            branding is None
            or branding.company_name != "Viewer Hijacked Branding"
        )

    def test_member_cannot_get_or_update_another_tenant_branding(self):
        self.authenticate(self.owner)

        get_response = self.client.get(self.other_url)
        patch_response = self.client.patch(
            self.other_url,
            {"company_name": "Cross Tenant Hijack"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 403)
        self.assertEqual(patch_response.status_code, 403)
        self.other_branding.refresh_from_db()
        self.assertEqual(
            self.other_branding.company_name,
            "Other Tenant Branding",
        )
        self.assertNotIn("Other Tenant Branding", repr(get_response.data))

    def test_inactive_membership_is_rejected(self):
        self.authenticate(self.inactive_member)

        response = self.client.get(self.url)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            OrganisationBranding.objects.filter(
                organisation=self.organisation
            ).exists()
        )

    def test_inactive_organisation_is_rejected(self):
        self.authenticate(self.inactive_tenant_user)
        url = reverse(
            "organisation-branding-detail",
            kwargs={
                "business_type": self.inactive_organisation.business_type,
                "slug": self.inactive_organisation.slug,
            },
        )

        response = self.client.get(url)

        self.assertEqual(response.status_code, 403)
        self.assertFalse(
            OrganisationBranding.objects.filter(
                organisation=self.inactive_organisation
            ).exists()
        )

    def test_superuser_can_get_and_update_other_tenant_branding(self):
        self.authenticate(self.superuser)

        get_response = self.client.get(self.other_url)
        patch_response = self.client.patch(
            self.other_url,
            {"company_name": "Platform Updated Branding"},
            format="json",
        )

        self.assertEqual(get_response.status_code, 200)
        self.assertEqual(patch_response.status_code, 200)
        self.other_branding.refresh_from_db()
        self.assertEqual(
            self.other_branding.company_name,
            "Platform Updated Branding",
        )

    def test_put_and_delete_are_not_allowed(self):
        self.authenticate(self.owner)

        put_response = self.client.put(
            self.url,
            {"company_name": "Blocked"},
            format="json",
        )
        delete_response = self.client.delete(self.url)

        self.assertEqual(put_response.status_code, 405)
        self.assertEqual(delete_response.status_code, 405)
