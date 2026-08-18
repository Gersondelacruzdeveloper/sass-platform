import json

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation
from ticketing.models import (
    TicketingEmailSettings,
    TicketingPaymentProviderSettings,
    TicketingWhatsAppSettings,
)


class SettingsSecurityAPITests(APITestCase):
    """Security and tenant-isolation tests for ticketing integration settings."""

    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Settings Security A",
            slug="settings-security-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Settings Security B",
            slug="settings-security-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Settings Security Inactive",
            slug="settings-security-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="settings-owner-a",
            email="settings-owner-a@example.com",
            password="Strong-test-password-123",
        )
        cls.owner_b = User.objects.create_user(
            username="settings-owner-b",
            email="settings-owner-b@example.com",
            password="Strong-test-password-123",
        )
        cls.viewer_a = User.objects.create_user(
            username="settings-viewer-a",
            email="settings-viewer-a@example.com",
            password="Strong-test-password-123",
        )
        cls.inactive_member = User.objects.create_user(
            username="settings-inactive-member",
            email="settings-inactive-member@example.com",
            password="Strong-test-password-123",
        )
        cls.inactive_org_owner = User.objects.create_user(
            username="settings-inactive-org-owner",
            email="settings-inactive-org-owner@example.com",
            password="Strong-test-password-123",
        )

        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.org_a,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.owner_b,
            organisation=cls.org_b,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.viewer_a,
            organisation=cls.org_a,
            role="viewer",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_member,
            organisation=cls.org_a,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=cls.inactive_org_owner,
            organisation=cls.inactive_org,
            role="owner",
            is_active=True,
        )

        cls.payment_a = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_a,
            default_provider="stripe",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_public_a",
            stripe_secret_key="sk_test_SECRET_A",
            stripe_webhook_secret="whsec_SECRET_A",
            paypal_enabled=True,
            paypal_mode="sandbox",
            paypal_client_id="paypal-public-client-a",
            paypal_client_secret="paypal-SECRET-A",
            paypal_webhook_id="paypal-webhook-SECRET-A",
        )
        cls.payment_b = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_b,
            stripe_enabled=True,
            stripe_publishable_key="pk_test_public_b",
            stripe_secret_key="sk_test_SECRET_B",
            stripe_webhook_secret="whsec_SECRET_B",
        )
        cls.email_a = TicketingEmailSettings.objects.create(
            organisation=cls.org_a,
            provider="custom",
            is_active=True,
            smtp_host="smtp.example.test",
            smtp_username="mailer@example.test",
            smtp_password="smtp-SECRET-A",
            oauth_access_token="oauth-access-SECRET-A",
            oauth_refresh_token="oauth-refresh-SECRET-A",
            oauth_connection_id="oauth-connection-SECRET-A",
            sender_email="sender@example.test",
        )
        cls.email_b = TicketingEmailSettings.objects.create(
            organisation=cls.org_b,
            provider="custom",
            is_active=True,
            smtp_host="smtp-b.example.test",
            smtp_username="mailer-b@example.test",
            smtp_password="smtp-SECRET-B",
        )
        cls.whatsapp_a = TicketingWhatsAppSettings.objects.create(
            organisation=cls.org_a,
            is_active=True,
            meta_app_id="meta-app-public-a",
            meta_app_secret="meta-app-SECRET-A",
            business_account_id="waba-public-a",
            phone_number_id="123456789012345",
            access_token="whatsapp-access-SECRET-A",
            webhook_verify_token="whatsapp-verify-SECRET-A",
        )
        cls.whatsapp_b = TicketingWhatsAppSettings.objects.create(
            organisation=cls.org_b,
            is_active=True,
            meta_app_id="meta-app-public-b",
            meta_app_secret="meta-app-SECRET-B",
            business_account_id="waba-public-b",
            phone_number_id="987654321098765",
            access_token="whatsapp-access-SECRET-B",
            webhook_verify_token="whatsapp-verify-SECRET-B",
        )

    def setUp(self):
        self.client.force_authenticate(self.owner_a)

    @staticmethod
    def as_json(response):
        return json.dumps(response.data, default=str)

    def url(self, basename, action="mine", organisation=None):
        name = f"{basename}-{action}"
        url = reverse(name)
        organisation = organisation or self.org_a
        return f"{url}?organisation_slug={organisation.slug}"

    def assert_secrets_absent(self, response, *secrets):
        payload = self.as_json(response)
        for secret in secrets:
            self.assertNotIn(secret, payload)

    def test_settings_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-payment-provider-settings-mine"),
            "/api/ticketing/payment-provider-settings/mine/",
        )
        self.assertEqual(
            reverse("ticketing-email-settings-mine"),
            "/api/ticketing/email-settings/mine/",
        )
        self.assertEqual(
            reverse("ticketing-whatsapp-settings-mine"),
            "/api/ticketing/whatsapp-settings/mine/",
        )

    def test_settings_endpoints_require_authentication(self):
        self.client.force_authenticate(user=None)
        for basename in (
            "ticketing-payment-provider-settings",
            "ticketing-email-settings",
            "ticketing-whatsapp-settings",
        ):
            with self.subTest(basename=basename):
                response = self.client.get(self.url(basename))
                self.assertIn(
                    response.status_code,
                    {status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN},
                )

    def test_viewer_cannot_manage_integration_settings(self):
        self.client.force_authenticate(self.viewer_a)
        for basename in (
            "ticketing-payment-provider-settings",
            "ticketing-email-settings",
            "ticketing-whatsapp-settings",
        ):
            with self.subTest(basename=basename):
                response = self.client.get(self.url(basename))
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_membership_is_rejected(self):
        self.client.force_authenticate(self.inactive_member)
        response = self.client.get(self.url("ticketing-email-settings"))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_organisation_is_rejected(self):
        self.client.force_authenticate(self.inactive_org_owner)
        response = self.client.get(
            self.url("ticketing-payment-provider-settings", organisation=self.inactive_org)
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_cannot_borrow_other_tenant_settings_by_slug(self):
        for basename in (
            "ticketing-payment-provider-settings",
            "ticketing-email-settings",
            "ticketing-whatsapp-settings",
        ):
            with self.subTest(basename=basename):
                response = self.client.get(self.url(basename, organisation=self.org_b))
                self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
                self.assert_secrets_absent(
                    response,
                    "sk_test_SECRET_B",
                    "smtp-SECRET-B",
                    "whatsapp-access-SECRET-B",
                )

    def test_payment_settings_response_never_serializes_secret_fields(self):
        response = self.client.get(self.url("ticketing-payment-provider-settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["stripe_publishable_key"], "pk_test_public_a")
        self.assertEqual(response.data["paypal_client_id"], "paypal-public-client-a")
        for key in (
            "stripe_secret_key",
            "stripe_webhook_secret",
            "paypal_client_secret",
            "paypal_webhook_id",
        ):
            self.assertNotIn(key, response.data)
        self.assert_secrets_absent(
            response,
            "sk_test_SECRET_A",
            "whsec_SECRET_A",
            "paypal-SECRET-A",
            "paypal-webhook-SECRET-A",
        )

    def test_payment_settings_patch_accepts_secrets_but_never_echoes_them(self):
        new_stripe_secret = "sk_live_NEW_SECRET"
        new_webhook_secret = "whsec_NEW_SECRET"
        new_paypal_secret = "paypal-NEW-SECRET"
        response = self.client.patch(
            self.url("ticketing-payment-provider-settings"),
            {
                "stripe_secret_key": new_stripe_secret,
                "stripe_webhook_secret": new_webhook_secret,
                "paypal_client_secret": new_paypal_secret,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment_a.refresh_from_db()
        self.assertEqual(self.payment_a.stripe_secret_key, new_stripe_secret)
        self.assertEqual(self.payment_a.stripe_webhook_secret, new_webhook_secret)
        self.assertEqual(self.payment_a.paypal_client_secret, new_paypal_secret)
        self.assert_secrets_absent(
            response, new_stripe_secret, new_webhook_secret, new_paypal_secret
        )

    def test_payment_settings_blank_secret_patch_preserves_saved_credentials(self):
        response = self.client.patch(
            self.url("ticketing-payment-provider-settings"),
            {
                "stripe_secret_key": "",
                "stripe_webhook_secret": "",
                "paypal_client_secret": "",
                "paypal_webhook_id": "",
                "payment_success_message": "Updated safely",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment_a.refresh_from_db()
        self.assertEqual(self.payment_a.stripe_secret_key, "sk_test_SECRET_A")
        self.assertEqual(self.payment_a.stripe_webhook_secret, "whsec_SECRET_A")
        self.assertEqual(self.payment_a.paypal_client_secret, "paypal-SECRET-A")
        self.assertEqual(self.payment_a.paypal_webhook_id, "paypal-webhook-SECRET-A")
        self.assertEqual(self.payment_a.payment_success_message, "Updated safely")

    def test_payment_settings_cannot_reassign_organisation(self):
        response = self.client.patch(
            self.url("ticketing-payment-provider-settings"),
            {"organisation": self.org_b.pk, "default_provider": "paypal"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment_a.refresh_from_db()
        self.assertEqual(self.payment_a.organisation_id, self.org_a.id)

    def test_email_settings_response_never_serializes_password_or_oauth_tokens(self):
        response = self.client.get(self.url("ticketing-email-settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        for key in (
            "smtp_password",
            "oauth_access_token",
            "oauth_refresh_token",
            "oauth_connection_id",
        ):
            self.assertNotIn(key, response.data)
        self.assert_secrets_absent(
            response,
            "smtp-SECRET-A",
            "oauth-access-SECRET-A",
            "oauth-refresh-SECRET-A",
            "oauth-connection-SECRET-A",
        )

    def test_email_settings_patch_accepts_password_without_echoing_it(self):
        new_password = "smtp-NEW-SECRET"
        response = self.client.patch(
            self.url("ticketing-email-settings"),
            {"smtp_password": new_password, "sender_name": "Safe Sender"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.email_a.refresh_from_db()
        self.assertEqual(self.email_a.smtp_password, new_password)
        self.assertEqual(self.email_a.sender_name, "Safe Sender")
        self.assertNotIn("smtp_password", response.data)
        self.assert_secrets_absent(response, new_password)

    def test_email_settings_blank_password_preserves_saved_password(self):
        response = self.client.patch(
            self.url("ticketing-email-settings"),
            {"smtp_password": "", "sender_name": "Updated Sender"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.email_a.refresh_from_db()
        self.assertEqual(self.email_a.smtp_password, "smtp-SECRET-A")
        self.assertEqual(self.email_a.sender_name, "Updated Sender")

    def test_email_settings_cannot_write_oauth_tokens_through_general_settings_api(self):
        response = self.client.patch(
            self.url("ticketing-email-settings"),
            {
                "oauth_access_token": "attacker-access-token",
                "oauth_refresh_token": "attacker-refresh-token",
                "oauth_connection_id": "attacker-connection-id",
                "sender_name": "Allowed Field",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.email_a.refresh_from_db()
        self.assertEqual(self.email_a.oauth_access_token, "oauth-access-SECRET-A")
        self.assertEqual(self.email_a.oauth_refresh_token, "oauth-refresh-SECRET-A")
        self.assertEqual(self.email_a.oauth_connection_id, "oauth-connection-SECRET-A")
        self.assertEqual(self.email_a.sender_name, "Allowed Field")

    def test_email_last_error_must_not_expose_sensitive_provider_values(self):
        secret = "smtp-provider-debug-SECRET"
        self.email_a.last_error_message = f"Authentication failed password={secret}"
        self.email_a.save(update_fields=["last_error_message"])
        response = self.client.get(self.url("ticketing-email-settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(secret, self.as_json(response))

    def test_whatsapp_settings_response_never_serializes_secret_credentials(self):
        response = self.client.get(self.url("ticketing-whatsapp-settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["meta_app_id"], "meta-app-public-a")
        self.assertEqual(response.data["business_account_id"], "waba-public-a")
        for key in ("meta_app_secret", "access_token", "webhook_verify_token"):
            self.assertNotIn(key, response.data)
        self.assert_secrets_absent(
            response,
            "meta-app-SECRET-A",
            "whatsapp-access-SECRET-A",
            "whatsapp-verify-SECRET-A",
        )

    def test_whatsapp_settings_patch_accepts_secrets_without_echoing_them(self):
        new_app_secret = "meta-app-NEW-SECRET"
        new_access_token = "whatsapp-access-NEW-SECRET"
        new_verify_token = "whatsapp-verify-NEW-SECRET"
        response = self.client.patch(
            self.url("ticketing-whatsapp-settings"),
            {
                "meta_app_secret": new_app_secret,
                "access_token": new_access_token,
                "webhook_verify_token": new_verify_token,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.whatsapp_a.refresh_from_db()
        self.assertEqual(self.whatsapp_a.meta_app_secret, new_app_secret)
        self.assertEqual(self.whatsapp_a.access_token, new_access_token)
        self.assertEqual(self.whatsapp_a.webhook_verify_token, new_verify_token)
        self.assert_secrets_absent(
            response, new_app_secret, new_access_token, new_verify_token
        )

    def test_whatsapp_blank_or_masked_secrets_do_not_erase_saved_credentials(self):
        response = self.client.patch(
            self.url("ticketing-whatsapp-settings"),
            {
                "meta_app_secret": "",
                "access_token": "",
                "webhook_verify_token": "",
                "customer_confirmation_template": "booking_confirmation_v2",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.whatsapp_a.refresh_from_db()
        self.assertEqual(self.whatsapp_a.meta_app_secret, "meta-app-SECRET-A")
        self.assertEqual(self.whatsapp_a.access_token, "whatsapp-access-SECRET-A")
        self.assertEqual(self.whatsapp_a.webhook_verify_token, "whatsapp-verify-SECRET-A")
        self.assertEqual(
            self.whatsapp_a.customer_confirmation_template,
            "booking_confirmation_v2",
        )

    def test_whatsapp_credential_change_resets_connection_status(self):
        self.whatsapp_a.connection_status = "connected"
        self.whatsapp_a.last_error_message = "old error"
        self.whatsapp_a.save(update_fields=["connection_status", "last_error_message"])
        response = self.client.patch(
            self.url("ticketing-whatsapp-settings"),
            {"access_token": "replacement-secret-token"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.whatsapp_a.refresh_from_db()
        self.assertEqual(self.whatsapp_a.connection_status, "pending")
        self.assertEqual(self.whatsapp_a.last_error_message, "")
        self.assert_secrets_absent(response, "replacement-secret-token")

    def test_whatsapp_last_error_must_not_expose_sensitive_provider_values(self):
        secret = "meta-provider-debug-SECRET"
        self.whatsapp_a.last_error_message = f"Meta rejected access_token={secret}"
        self.whatsapp_a.save(update_fields=["last_error_message"])
        response = self.client.get(self.url("ticketing-whatsapp-settings"))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(secret, self.as_json(response))

    def test_list_endpoints_are_tenant_scoped_and_do_not_expose_other_tenant_secrets(self):
        for basename, foreign_secret in (
            ("ticketing-payment-provider-settings", "sk_test_SECRET_B"),
            ("ticketing-email-settings", "smtp-SECRET-B"),
            ("ticketing-whatsapp-settings", "whatsapp-access-SECRET-B"),
        ):
            with self.subTest(basename=basename):
                response = self.client.get(
                    f"{reverse(basename + '-list')}?organisation_slug={self.org_a.slug}"
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(len(response.data), 1)
                self.assertEqual(response.data[0]["organisation"], self.org_a.id)
                self.assertNotIn(foreign_secret, self.as_json(response))
