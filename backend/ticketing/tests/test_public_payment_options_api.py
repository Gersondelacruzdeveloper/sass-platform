"""Public payment-options API coverage.

Covers tenant isolation, published-site boundary, active provider settings,
Stripe/PayPal enablement based on usable credentials, safe public fields,
fallback behavior, and non-exposure of provider secrets/internal identifiers.

No external provider calls are made.
"""

from __future__ import annotations

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
)


class PublicPaymentOptionsAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Payment Options Organisation A",
            slug="payment-options-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Payment Options Organisation B",
            slug="payment-options-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Payment Site A",
            custom_domain="payments-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Payment Site B",
            custom_domain="payments-b.example.test",
            is_published=True,
        )

        cls.provider_a = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_a,
            default_provider="stripe",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_PUBLIC_A",
            stripe_secret_key="sk_test_PRIVATE_A",
            stripe_webhook_secret="whsec_PRIVATE_A",
            stripe_connect_account_id="acct_PRIVATE_A",
            stripe_connect_status="connected",
            paypal_enabled=True,
            paypal_mode="sandbox",
            paypal_client_id="paypal-public-client-a",
            paypal_client_secret="paypal-private-secret-a",
            paypal_merchant_id="paypal-private-merchant-a",
            paypal_webhook_id="paypal-private-webhook-a",
            payment_success_message="A payment success.",
            payment_pending_message="A payment pending.",
            is_active=True,
        )

        cls.provider_b = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_b,
            default_provider="paypal",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_PUBLIC_B",
            stripe_secret_key="sk_test_PRIVATE_B",
            stripe_webhook_secret="whsec_PRIVATE_B",
            paypal_enabled=True,
            paypal_mode="live",
            paypal_client_id="paypal-public-client-b",
            paypal_client_secret="paypal-private-secret-b",
            paypal_merchant_id="paypal-private-merchant-b",
            paypal_webhook_id="paypal-private-webhook-b",
            is_active=True,
        )

    def url(self, organisation):
        return reverse(
            "ticketing-public-payment-options",
            kwargs={"organisation_slug": organisation.slug},
        )

    def test_public_payment_options_url_reverses(self):
        self.assertEqual(
            self.url(self.org_a),
            f"/api/ticketing/public/{self.org_a.slug}/payments/options/",
        )

    def test_public_payment_options_are_tenant_scoped(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["default_provider"], "stripe")
        self.assertEqual(
            response.data["stripe_publishable_key"],
            "pk_test_PUBLIC_A",
        )
        self.assertEqual(response.data["paypal_mode"], "sandbox")

        payload = str(response.data)
        self.assertNotIn("pk_test_PUBLIC_B", payload)
        self.assertNotIn("paypal-public-client-b", payload)

    def test_stripe_is_enabled_only_with_enabled_flag_and_secret_key(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["stripe_enabled"])

        self.provider_a.stripe_secret_key = ""
        self.provider_a.save(update_fields=["stripe_secret_key"])

        response = self.client.get(self.url(self.org_a))
        self.assertFalse(response.data["stripe_enabled"])

    def test_stripe_disabled_flag_wins_even_when_credentials_exist(self):
        self.provider_a.stripe_enabled = False
        self.provider_a.save(update_fields=["stripe_enabled"])

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["stripe_enabled"])

    def test_paypal_is_enabled_only_with_client_id_and_secret(self):
        self.provider_a.default_provider = "paypal"
        self.provider_a.save(update_fields=["default_provider"])

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["paypal_enabled"])

        self.provider_a.paypal_client_secret = ""
        self.provider_a.save(update_fields=["paypal_client_secret"])

        response = self.client.get(self.url(self.org_a))
        self.assertFalse(response.data["paypal_enabled"])

    def test_paypal_disabled_flag_wins_even_when_credentials_exist(self):
        self.provider_a.paypal_enabled = False
        self.provider_a.save(update_fields=["paypal_enabled"])

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["paypal_enabled"])

    def test_inactive_provider_settings_fall_back_to_no_providers(self):
        self.provider_a.is_active = False
        self.provider_a.save(update_fields=["is_active"])

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["default_provider"], "none")
        self.assertFalse(response.data["stripe_enabled"])
        self.assertFalse(response.data["paypal_enabled"])
        self.assertEqual(response.data["stripe_publishable_key"], "")
        self.assertEqual(response.data["paypal_mode"], "sandbox")

    def test_missing_provider_settings_use_safe_defaults(self):
        self.provider_a.delete()

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data,
            {
                "default_provider": "none",
                "default_customer_payment_choice": "pending",
                "available_payment_choices": [],
                "stripe_enabled": False,
                "paypal_enabled": False,
                "stripe_publishable_key": "",
                "paypal_mode": "sandbox",
                "payment_success_message": (
                    "Payment received. Your booking is confirmed."
                ),
                "payment_pending_message": (
                    "Your booking was created. Payment is pending confirmation."
                ),
            },
        )

    def test_public_payment_options_return_public_messages(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["payment_success_message"],
            "A payment success.",
        )
        self.assertEqual(
            response.data["payment_pending_message"],
            "A payment pending.",
        )

    def test_public_payment_options_never_expose_stripe_secrets(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "sk_test_PRIVATE_A",
            "whsec_PRIVATE_A",
            "acct_PRIVATE_A",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "stripe_secret_key",
            "stripe_webhook_secret",
            "stripe_connect_account_id",
            "stripe_connect_status",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_public_payment_options_never_expose_paypal_credentials(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "paypal-public-client-a",
            "paypal-private-secret-a",
            "paypal-private-merchant-a",
            "paypal-private-webhook-a",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "paypal_client_id",
            "paypal_client_secret",
            "paypal_merchant_id",
            "paypal_webhook_id",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_public_payment_options_expose_only_expected_fields(self):
        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            set(response.data.keys()),
            {
                "default_provider",
                "default_customer_payment_choice",
                "available_payment_choices",
                "stripe_enabled",
                "paypal_enabled",
                "stripe_publishable_key",
                "paypal_mode",
                "payment_success_message",
                "payment_pending_message",
            },
        )

    def test_unpublished_site_cannot_expose_payment_provider_options(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("pk_test_PUBLIC_A", payload)
        self.assertNotIn("A payment success.", payload)

    def test_inactive_organisation_cannot_expose_payment_provider_options(self):
        self.org_a.is_active = False
        self.org_a.save(update_fields=["is_active"])

        response = self.client.get(self.url(self.org_a))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("pk_test_PUBLIC_A", payload)
        self.assertNotIn("sk_test_PRIVATE_A", payload)
