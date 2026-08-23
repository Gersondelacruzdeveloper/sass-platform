"""Tests for public tenant PWA manifests."""

from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from organisations.models import Organisation, OrganisationBranding
from rest_framework.test import APIClient


@override_settings(FRONTEND_URL="https://app.example.test/")
class PublicOrganisationManifestAPITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.ticketing = Organisation.objects.create(
            name="Manifest Ticketing Tenant",
            slug="manifest-ticketing-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.hotel = Organisation.objects.create(
            name="Manifest Hotel Tenant",
            slug="manifest-hotel-tenant",
            business_type="hotel",
            is_active=True,
        )
        cls.inactive = Organisation.objects.create(
            name="Inactive Manifest Tenant",
            slug="inactive-manifest-tenant",
            business_type="store",
            is_active=False,
        )

    def setUp(self):
        self.client = APIClient()

    def url(self, organisation):
        return reverse(
            "public-organisation-manifest",
            kwargs={
                "business_type": organisation.business_type,
                "slug": organisation.slug,
            },
        )

    def test_url_name_resolves_to_expected_path(self):
        self.assertEqual(
            self.url(self.ticketing),
            (
                "/api/organisations/public-manifest/ticketing/"
                "manifest-ticketing-tenant/manifest.json"
            ),
        )

    def test_active_ticketing_manifest_has_safe_schema_and_tenant_login_start(self):
        response = self.client.get(self.url(self.ticketing))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response["Content-Type"],
            "application/manifest+json",
        )
        self.assertEqual(
            response["Cache-Control"],
            "no-cache, no-store, must-revalidate",
        )

        payload = response.json()

        self.assertEqual(
            payload["id"],
            (
                "https://app.example.test/ticketing/"
                "manifest-ticketing-tenant/"
            ),
        )
        self.assertEqual(payload["name"], "Manifest Ticketing Tenant Platform")
        self.assertEqual(payload["short_name"], "Manifest Ticketing Tenant")
        self.assertEqual(
            payload["start_url"],
            (
                "https://app.example.test/ticketing/"
                "manifest-ticketing-tenant/login"
            ),
        )
        self.assertEqual(
            payload["scope"],
            (
                "https://app.example.test/ticketing/"
                "manifest-ticketing-tenant/"
            ),
        )
        self.assertEqual(payload["display"], "standalone")
        self.assertEqual(payload["orientation"], "portrait-primary")
        self.assertEqual(payload["icons"], [])

        for forbidden in (
            "provider_api_key",
            "api_key",
            "token",
            "stripe_customer_id",
        ):
            self.assertNotIn(forbidden, repr(payload))

    def test_non_ticketing_manifest_uses_tenant_login_start(self):
        response = self.client.get(self.url(self.hotel))

        self.assertEqual(response.status_code, 200)
        payload = response.json()

        self.assertEqual(
            payload["id"],
            "https://app.example.test/hotel/manifest-hotel-tenant/",
        )
        self.assertEqual(
            payload["start_url"],
            "https://app.example.test/hotel/manifest-hotel-tenant/login",
        )
        self.assertEqual(
            payload["scope"],
            "https://app.example.test/hotel/manifest-hotel-tenant/",
        )

    def test_first_get_creates_defaults_and_repeated_get_reuses_them(self):
        first = self.client.get(self.url(self.ticketing))
        second = self.client.get(self.url(self.ticketing))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            OrganisationBranding.objects.filter(
                organisation=self.ticketing
            ).count(),
            1,
        )

        branding = OrganisationBranding.objects.get(
            organisation=self.ticketing
        )

        self.assertEqual(branding.company_name, self.ticketing.name)
        self.assertEqual(
            branding.platform_name,
            f"{self.ticketing.name} Platform",
        )

    def test_existing_branding_controls_manifest_values(self):
        OrganisationBranding.objects.create(
            organisation=self.ticketing,
            company_name="Manifest Company",
            platform_name="Manifest Platform",
            app_short_name="Manifest App",
            app_description="Safe manifest description",
            theme_color="#123456",
            background_color="#abcdef",
        )

        response = self.client.get(self.url(self.ticketing))

        payload = response.json()
        self.assertEqual(payload["name"], "Manifest Platform")
        self.assertEqual(payload["short_name"], "Manifest App")
        self.assertEqual(payload["description"], "Safe manifest description")
        self.assertEqual(payload["theme_color"], "#123456")
        self.assertEqual(payload["background_color"], "#abcdef")

    def test_short_name_is_limited_to_fifty_characters(self):
        OrganisationBranding.objects.create(
            organisation=self.ticketing,
            company_name="Manifest Company",
            app_short_name="A" * 50,
        )

        response = self.client.get(self.url(self.ticketing))

        self.assertEqual(len(response.json()["short_name"]), 50)

    def test_unknown_slug_and_wrong_business_type_return_not_found(self):
        unknown = self.client.get(
            reverse(
                "public-organisation-manifest",
                kwargs={
                    "business_type": "ticketing",
                    "slug": "unknown-manifest-tenant",
                },
            )
        )

        wrong_type = self.client.get(
            reverse(
                "public-organisation-manifest",
                kwargs={
                    "business_type": "hotel",
                    "slug": self.ticketing.slug,
                },
            )
        )

        self.assertEqual(unknown.status_code, 404)
        self.assertEqual(wrong_type.status_code, 404)
        self.assertEqual(unknown.data, wrong_type.data)

    def test_inactive_tenant_is_indistinguishable_from_unknown_tenant(self):
        inactive = self.client.get(self.url(self.inactive))

        unknown = self.client.get(
            reverse(
                "public-organisation-manifest",
                kwargs={
                    "business_type": self.inactive.business_type,
                    "slug": "unknown-inactive-manifest",
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

    def test_storage_url_failure_is_sanitized_and_manifest_still_returns(self):
        branding = OrganisationBranding.objects.create(
            organisation=self.ticketing,
            company_name="Storage Failure Manifest",
        )

        branding.logo.name = "branding/logos/broken.png"

        with patch.object(
            branding.logo.storage,
            "url",
            side_effect=RuntimeError("private storage failure"),
        ):
            response = self.client.get(self.url(self.ticketing))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["icons"], [])
        self.assertNotIn("private storage failure", response.content.decode())
