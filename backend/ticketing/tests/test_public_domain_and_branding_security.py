"""Public domain-resolution and branding security coverage.

Covers tenant isolation, custom-domain resolution, inactive/unpublished
boundaries, untrusted Host header behavior, public feature flags, and strict
non-exposure of infrastructure/provider secrets from branding/domain payloads.
"""

from __future__ import annotations

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    TicketingEmailSettings,
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
    TicketingSettings,
    TicketingWhatsAppSettings,
)


class PublicDomainAndBrandingSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Branding Organisation A",
            slug="branding-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Branding Organisation B",
            slug="branding-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_inactive = Organisation.objects.create(
            name="Inactive Branding Organisation",
            slug="branding-inactive",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Branding Site A",
            hero_subtitle="Public subtitle A",
            custom_domain="book.branding-a.example.test",
            canonical_url="https://book.branding-a.example.test",
            is_published=True,
            show_reviews=True,
            show_public_rankings=True,
            show_ai_assistant_section=True,
            ai_assistant_subtitle="Ask us about excursions.",
            aws_acm_certificate_arn=(
                "arn:aws:acm:us-east-1:111111111111:"
                "certificate/PRIVATE-AWS-CERT-A"
            ),
            domain_error_message="Internal domain diagnostic A",
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Branding Site B",
            hero_subtitle="Public subtitle B",
            custom_domain="book.branding-b.example.test",
            canonical_url="https://book.branding-b.example.test",
            is_published=True,
            show_reviews=False,
            show_public_rankings=False,
            show_ai_assistant_section=False,
            aws_acm_certificate_arn=(
                "arn:aws:acm:us-east-1:222222222222:"
                "certificate/PRIVATE-AWS-CERT-B"
            ),
        )
        cls.site_inactive = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_inactive,
            site_title="Inactive Site",
            custom_domain="book.branding-inactive.example.test",
            canonical_url="https://book.branding-inactive.example.test",
            is_published=True,
        )

        cls.settings_a = TicketingSettings.objects.create(
            organisation=cls.org_a,
            default_currency="USD",
            allow_public_bookings=True,
            allow_seller_bookings=True,
            wellet_enabled=True,
        )
        cls.settings_b = TicketingSettings.objects.create(
            organisation=cls.org_b,
            default_currency="EUR",
            allow_public_bookings=True,
            allow_seller_bookings=False,
            wellet_enabled=False,
        )

        cls.payments_a = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_a,
            default_provider="stripe",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_PUBLIC_A",
            stripe_secret_key="sk_test_PRIVATE_A",
            stripe_webhook_secret="whsec_PRIVATE_A",
            stripe_connect_account_id="acct_PRIVATE_A",
            paypal_enabled=True,
            paypal_mode="sandbox",
            paypal_client_id="paypal-client-A",
            paypal_client_secret="paypal-secret-A-PRIVATE",
            paypal_merchant_id="paypal-merchant-A-PRIVATE",
            paypal_webhook_id="paypal-webhook-A-PRIVATE",
            is_active=True,
        )

        cls.email_a = TicketingEmailSettings.objects.create(
            organisation=cls.org_a,
            provider="google_oauth",
            sender_email="public@example.test",
            oauth_provider_account="private-google-account@example.test",
            oauth_access_token="GOOGLE-ACCESS-TOKEN-PRIVATE",
            oauth_refresh_token="GOOGLE-REFRESH-TOKEN-PRIVATE",
            smtp_password="SMTP-PASSWORD-PRIVATE",
            is_active=True,
        )

        cls.whatsapp_a = TicketingWhatsAppSettings.objects.create(
            organisation=cls.org_a,
            is_active=True,
            meta_app_id="meta-app-a",
            meta_app_secret="META-APP-SECRET-PRIVATE",
            business_account_id="WABA-A",
            phone_number_id="PHONE-A",
            access_token="META-ACCESS-TOKEN-PRIVATE",
            webhook_verify_token="WHATSAPP-VERIFY-TOKEN-PRIVATE",
            connection_status="connected",
        )

    def branding_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-branding-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def branding_query_url(self):
        return reverse("ticketing-public-branding")

    def domain_resolve_url(self):
        return reverse("ticketing-public-resolve-domain")

    def test_branding_route_reverses(self):
        self.assertEqual(
            self.branding_url(),
            f"/api/ticketing/public/{self.org_a.slug}/branding/",
        )

    def test_branding_query_route_resolves_tenant_by_slug_parameter(self):
        response = self.client.get(
            self.branding_query_url(),
            {"slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["organisation"]["slug"],
            self.org_a.slug,
        )

    def test_domain_resolve_route_reverses(self):
        self.assertEqual(
            self.domain_resolve_url(),
            "/api/ticketing/public/resolve-domain/",
        )

    def test_branding_is_tenant_scoped(self):
        response = self.client.get(self.branding_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn("Branding Site A", payload)
        self.assertNotIn("Branding Site B", payload)
        self.assertNotIn(self.org_b.slug, payload)

    def test_branding_public_feature_flags_are_exposed(self):
        response = self.client.get(self.branding_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        public_site = response.data["public_site"]
        self.assertTrue(public_site["show_reviews"])
        self.assertTrue(public_site["show_public_rankings"])
        self.assertTrue(public_site["show_ai_assistant_section"])
        self.assertEqual(
            public_site["ai_assistant_subtitle"],
            "Ask us about excursions.",
        )

    def test_branding_never_exposes_payment_provider_secrets(self):
        response = self.client.get(self.branding_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "sk_test_PRIVATE_A",
            "whsec_PRIVATE_A",
            "acct_PRIVATE_A",
            "paypal-client-A",
            "paypal-secret-A-PRIVATE",
            "paypal-merchant-A-PRIVATE",
            "paypal-webhook-A-PRIVATE",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "stripe_secret_key",
            "stripe_webhook_secret",
            "stripe_connect_account_id",
            "paypal_client_id",
            "paypal_client_secret",
            "paypal_merchant_id",
            "paypal_webhook_id",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_branding_never_exposes_email_or_google_credentials(self):
        response = self.client.get(self.branding_url(self.org_a))

        payload = str(response.data)
        for secret in (
            "GOOGLE-ACCESS-TOKEN-PRIVATE",
            "GOOGLE-REFRESH-TOKEN-PRIVATE",
            "SMTP-PASSWORD-PRIVATE",
            "private-google-account@example.test",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "oauth_access_token",
            "oauth_refresh_token",
            "smtp_password",
            "google_email",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_branding_never_exposes_whatsapp_credentials(self):
        response = self.client.get(self.branding_url(self.org_a))

        payload = str(response.data)
        for secret in (
            "META-APP-SECRET-PRIVATE",
            "META-ACCESS-TOKEN-PRIVATE",
            "WHATSAPP-VERIFY-TOKEN-PRIVATE",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "meta_app_secret",
            "access_token",
            "webhook_verify_token",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_branding_never_exposes_aws_or_internal_domain_diagnostics(self):
        response = self.client.get(self.branding_url(self.org_a))

        payload = str(response.data)
        self.assertNotIn("PRIVATE-AWS-CERT-A", payload)
        public_site = response.data["public_site"]
        self.assertNotIn("aws_acm_certificate_arn", public_site)
        self.assertNotIn("Internal domain diagnostic A", payload)
        self.assertNotIn("domain_error_message", public_site)

    def test_unpublished_site_branding_is_not_public(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.branding_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_organisation_branding_is_not_public(self):
        response = self.client.get(self.branding_url(self.org_inactive))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )

    def test_domain_resolve_matches_custom_domain_to_exact_tenant(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["organisation_slug"], self.org_a.slug)
        self.assertNotEqual(
            response.data["organisation_slug"],
            self.org_b.slug,
        )

    def test_domain_resolve_is_case_and_scheme_normalized_if_supported(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": f"HTTPS://{self.site_a.custom_domain.upper()}/"},
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_200_OK,
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )
        if response.status_code == status.HTTP_200_OK:
            self.assertEqual(
                response.data["organisation_slug"],
                self.org_a.slug,
            )

    def test_domain_resolve_unknown_domain_fails_closed(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": "unknown.example.test"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.org_a.slug, payload)
        self.assertNotIn(self.org_b.slug, payload)

    def test_domain_resolve_unpublished_site_fails_closed(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolve_inactive_organisation_fails_closed(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_inactive.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolve_does_not_trust_spoofed_host_without_domain_input(self):
        response = self.client.get(
            self.domain_resolve_url(),
            HTTP_HOST=self.site_b.custom_domain,
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_404_NOT_FOUND,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.org_b.slug, payload)

    def test_domain_resolve_explicit_domain_selects_exact_tenant(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["organisation_slug"], self.org_a.slug)
        self.assertNotEqual(
            response.data["organisation_slug"],
            self.org_b.slug,
        )

    def test_domain_resolve_response_never_exposes_infrastructure_secrets(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "PRIVATE-AWS-CERT-A",
            "sk_test_PRIVATE_A",
            "whsec_PRIVATE_A",
            "paypal-secret-A-PRIVATE",
            "GOOGLE-ACCESS-TOKEN-PRIVATE",
            "META-ACCESS-TOKEN-PRIVATE",
            "META-APP-SECRET-PRIVATE",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

    def test_domain_resolve_response_is_tenant_minimal(self):
        response = self.client.get(
            self.domain_resolve_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        forbidden_fields = (
            "aws_acm_certificate_arn",
            "domain_error_message",
            "stripe_secret_key",
            "paypal_client_secret",
            "oauth_access_token",
            "oauth_refresh_token",
            "access_token",
            "webhook_verify_token",
        )
        for field_name in forbidden_fields:
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)
