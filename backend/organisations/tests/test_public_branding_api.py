"""Tests for the public organisation branding endpoint."""

from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse
from organisations.models import Organisation, OrganisationBranding
from rest_framework.test import APIClient


class PublicOrganisationBrandingAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Public Branding Tenant",
            slug="public-branding-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive = Organisation.objects.create(
            name="Inactive Public Branding Tenant",
            slug="inactive-public-branding-tenant",
            business_type="hotel",
            is_active=False,
        )

    def setUp(self):
        self.client = APIClient()

    def url(self, organisation):
        return reverse(
            "public-organisation-branding",
            kwargs={
                "business_type": organisation.business_type,
                "slug": organisation.slug,
            },
        )

    def test_url_name_resolves_to_expected_path(self):
        self.assertEqual(
            self.url(self.organisation),
            (
                "/api/organisations/public-branding/ticketing/"
                "public-branding-tenant/"
            ),
        )

    def test_active_tenant_returns_safe_default_branding(self):
        response = self.client.get(self.url(self.organisation))

        self.assertEqual(response.status_code, 200)
        branding = OrganisationBranding.objects.get(
            organisation=self.organisation
        )
        self.assertEqual(response.data["id"], branding.pk)
        self.assertEqual(response.data["organisation"], self.organisation.pk)
        self.assertEqual(response.data["company_name"], self.organisation.name)
        for forbidden in (
            "provider_api_key",
            "api_key",
            "password",
            "token",
            "stripe_customer_id",
        ):
            self.assertNotIn(forbidden, repr(response.data))

    def test_existing_branding_is_returned_and_reused(self):
        branding = OrganisationBranding.objects.create(
            organisation=self.organisation,
            company_name="Existing Public Branding",
            platform_name="Existing Public Platform",
        )

        first = self.client.get(self.url(self.organisation))
        second = self.client.get(self.url(self.organisation))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.data["id"], branding.pk)
        self.assertEqual(second.data["id"], branding.pk)
        self.assertEqual(
            OrganisationBranding.objects.filter(
                organisation=self.organisation
            ).count(),
            1,
        )

    def test_unknown_slug_and_wrong_business_type_return_same_not_found(self):
        unknown = self.client.get(
            reverse(
                "public-organisation-branding",
                kwargs={
                    "business_type": "ticketing",
                    "slug": "unknown-public-branding",
                },
            )
        )
        wrong_type = self.client.get(
            reverse(
                "public-organisation-branding",
                kwargs={
                    "business_type": "hotel",
                    "slug": self.organisation.slug,
                },
            )
        )

        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(wrong_type.status_code, 404)
        self.assertEqual(unknown.data, wrong_type.data)

    def test_inactive_tenant_is_indistinguishable_from_unknown(self):
        inactive = self.client.get(self.url(self.inactive))
        unknown = self.client.get(
            reverse(
                "public-organisation-branding",
                kwargs={
                    "business_type": self.inactive.business_type,
                    "slug": "unknown-inactive-branding",
                },
            )
        )

        self.assertEqual(inactive.status_code, 404)
        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(inactive.data, unknown.data)
        self.assertFalse(
            OrganisationBranding.objects.filter(
                organisation=self.inactive
            ).exists()
        )

    def test_storage_url_failure_returns_null_urls_without_internal_error(self):
        branding = OrganisationBranding.objects.create(
            organisation=self.organisation,
            company_name="Broken Storage Branding",
            logo="branding/logos/broken.png",
        )

        with patch.object(
            branding.logo.storage,
            "url",
            side_effect=RuntimeError("private storage failure"),
        ):
            response = self.client.get(self.url(self.organisation))

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["logo_url"])
        self.assertNotIn("private storage failure", repr(response.data))
