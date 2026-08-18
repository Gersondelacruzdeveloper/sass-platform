"""External integration boundary tests for the ticketing application.

Every network/provider boundary is mocked.  These tests must never contact
Google/Gmail, SMTP servers, Meta WhatsApp, AWS ACM, CloudFront, or any other
external service.
"""

from __future__ import annotations

from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, Mock, patch

from django.test import TestCase, override_settings
from django.utils import timezone
from google.auth.exceptions import RefreshError
from organisations.models import Organisation

from ticketing.google_oauth import GoogleOAuthReconnectRequired
from ticketing import google_oauth
from ticketing.models import (
    Booking,
    NotificationLog,
    TicketingEmailSettings,
    TicketingPublicSiteSettings,
    TicketingWhatsAppSettings,
)
from ticketing.notifications.email_service import BookingEmailService
from ticketing.notifications.whatsapp_service import (
    BookingWhatsAppService,
    WhatsAppAPIError,
    WhatsAppConfigurationError,
)
from ticketing import services as ticketing_services


class IntegrationBoundaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Integration Boundary A",
            slug="integration-boundary-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Integration Boundary B",
            slug="integration-boundary-b",
            business_type="ticketing",
            is_active=True,
        )

    def setUp(self):
        self.email_settings = TicketingEmailSettings.objects.create(
            organisation=self.org_a,
            provider="google_oauth",
            is_active=True,
            oauth_connected=True,
            oauth_provider_account="owner-a@example.test",
            oauth_access_token="google-access-token-A",
            oauth_refresh_token="google-refresh-token-A",
            oauth_token_expiry=timezone.now() + timedelta(hours=1),
            sender_email="bookings-a@example.test",
            reply_to_email="support-a@example.test",
            connection_status="connected",
        )
        self.whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=self.org_a,
            provider="meta_cloud_api",
            is_active=True,
            meta_app_id="meta-app-a",
            meta_app_secret="meta-app-secret-A",
            business_account_id="waba-a",
            phone_number_id="phone-number-id-a",
            access_token="meta-access-token-A",
            connection_status="connected",
        )
        self.site_settings = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            custom_domain="bookings.example.test",
            domain_status="pending_aws_setup",
        )
        self.booking = Booking.objects.create(
            organisation=self.org_a,
            customer_name="Integration Customer",
            customer_email="customer@example.test",
            customer_whatsapp="+1 809 555 0101",
            status="pending",
        )

    # ------------------------------------------------------------------
    # Google / Gmail
    # ------------------------------------------------------------------

    @override_settings(
        GOOGLE_CLIENT_ID="",
        GOOGLE_CLIENT_SECRET="",
        GOOGLE_OAUTH_REDIRECT_URI="",
    )
    def test_google_oauth_missing_configuration_fails_before_external_call(self):
        with patch("ticketing.google_oauth.Flow.from_client_config") as flow:
            with self.assertRaises(ValueError):
                google_oauth.build_google_flow(state="state-a")
        flow.assert_not_called()

    @override_settings(
        GOOGLE_CLIENT_ID="client-id-test",
        GOOGLE_CLIENT_SECRET="client-secret-test",
        GOOGLE_OAUTH_REDIRECT_URI="https://app.example.test/oauth/google/callback",
    )
    @patch("ticketing.google_oauth.Flow.from_client_config")
    def test_google_flow_is_built_with_project_configuration_only(self, from_config):
        flow = Mock()
        from_config.return_value = flow

        result = google_oauth.build_google_flow(state="tenant-state")

        self.assertIs(result, flow)
        self.assertEqual(
            flow.redirect_uri,
            "https://app.example.test/oauth/google/callback",
        )
        args, kwargs = from_config.call_args
        config = args[0]
        self.assertEqual(config["web"]["client_id"], "client-id-test")
        self.assertEqual(config["web"]["client_secret"], "client-secret-test")
        self.assertEqual(kwargs["state"], "tenant-state")

    @override_settings(
        GOOGLE_CLIENT_ID="client-id-test",
        GOOGLE_CLIENT_SECRET="client-secret-test",
        GOOGLE_OAUTH_REDIRECT_URI="https://app.example.test/oauth/google/callback",
    )
    @patch("ticketing.google_oauth.Credentials")
    def test_google_refresh_missing_refresh_token_does_not_contact_google(
        self,
        credentials_cls,
    ):
        self.email_settings.oauth_refresh_token = ""
        self.email_settings.save(update_fields=["oauth_refresh_token"])

        with self.assertRaises(GoogleOAuthReconnectRequired):
            google_oauth.refresh_google_credentials(self.email_settings)

        credentials_cls.assert_not_called()
        self.email_settings.refresh_from_db()
        self.assertFalse(self.email_settings.oauth_connected)
        self.assertEqual(self.email_settings.oauth_access_token, "")
        self.assertEqual(self.email_settings.oauth_refresh_token, "")
        self.assertEqual(self.email_settings.connection_status, "failed")

    @override_settings(
        GOOGLE_CLIENT_ID="client-id-test",
        GOOGLE_CLIENT_SECRET="client-secret-test",
        GOOGLE_OAUTH_REDIRECT_URI="https://app.example.test/oauth/google/callback",
    )
    @patch("ticketing.google_oauth.Request")
    @patch("ticketing.google_oauth.Credentials")
    def test_google_refresh_failure_does_not_store_or_log_provider_secret(
        self,
        credentials_cls,
        request_cls,
    ):
        secret = "GOOGLE-provider-debug-SECRET"
        credentials = Mock()
        credentials.expired = True
        credentials.refresh.side_effect = RefreshError(
            f"invalid_grant diagnostic={secret}"
        )
        credentials_cls.return_value = credentials

        self.email_settings.oauth_token_expiry = timezone.now() - timedelta(minutes=1)
        self.email_settings.save(update_fields=["oauth_token_expiry"])

        with self.assertLogs("ticketing.google_oauth", level="WARNING") as captured:
            with self.assertRaises(GoogleOAuthReconnectRequired) as ctx:
                google_oauth.refresh_google_credentials(self.email_settings)

        self.assertNotIn(secret, str(ctx.exception))
        self.assertNotIn(secret, "\n".join(captured.output))
        self.email_settings.refresh_from_db()
        self.assertNotIn(secret, self.email_settings.last_error_message)
        self.assertEqual(self.email_settings.oauth_access_token, "")
        self.assertEqual(self.email_settings.oauth_refresh_token, "")
        request_cls.assert_called_once()

    @patch("ticketing.google_oauth.build")
    @patch("ticketing.google_oauth.refresh_google_credentials")
    def test_send_gmail_uses_google_boundary_and_returns_provider_result(
        self,
        refresh_credentials,
        build,
    ):
        credentials = object()
        refresh_credentials.return_value = credentials

        execute = Mock(return_value={"id": "gmail-message-123"})
        send = Mock()
        send.execute = execute
        messages = Mock()
        messages.send.return_value = send
        users = Mock()
        users.messages.return_value = messages
        service = Mock()
        service.users.return_value = users
        build.return_value = service

        result = google_oauth.send_gmail_email(
            self.email_settings,
            "customer@example.test",
            "Booking confirmation",
            "Plain text body",
            html_body="<p>HTML body</p>",
        )

        self.assertEqual(result, {"id": "gmail-message-123"})
        build.assert_called_once_with("gmail", "v1", credentials=credentials)
        messages.send.assert_called_once()
        _, kwargs = messages.send.call_args
        self.assertEqual(kwargs["userId"], "me")
        self.assertIn("raw", kwargs["body"])
        self.assertNotIn(
            self.email_settings.oauth_access_token,
            str(kwargs["body"]),
        )

    # ------------------------------------------------------------------
    # Email dispatch
    # ------------------------------------------------------------------

    @patch("ticketing.notifications.email_service.send_gmail_email")
    def test_email_service_google_provider_never_uses_smtp(
        self,
        send_gmail_email,
    ):
        send_gmail_email.return_value = {"id": "gmail-accepted"}

        with patch(
            "ticketing.notifications.email_service.get_email_connection"
        ) as smtp_connection:
            log = BookingEmailService._send_email(
                booking=self.booking,
                recipient="customer@example.test",
                subject="Subject",
                text_body="Text",
                html_body="<p>Text</p>",
                audience="customer",
            )

        self.assertEqual(log.status, "sent")
        send_gmail_email.assert_called_once()
        smtp_connection.assert_not_called()

    @patch("ticketing.notifications.email_service.EmailMultiAlternatives")
    @patch("ticketing.notifications.email_service.get_email_connection")
    def test_email_service_smtp_provider_uses_injected_tenant_connection(
        self,
        get_connection,
        email_cls,
    ):
        self.email_settings.provider = "custom"
        self.email_settings.smtp_host = "smtp.example.test"
        self.email_settings.smtp_username = "smtp-user@example.test"
        self.email_settings.smtp_password = "smtp-password-A"
        self.email_settings.save()

        connection = object()
        get_connection.return_value = connection
        email = Mock()
        email_cls.return_value = email

        log = BookingEmailService._send_email(
            booking=self.booking,
            recipient="customer@example.test",
            subject="Subject",
            text_body="Text",
            html_body="<p>Text</p>",
            audience="customer",
        )

        self.assertEqual(log.status, "sent")
        email_cls.assert_called_once()
        self.assertIs(email_cls.call_args.kwargs["connection"], connection)
        email.send.assert_called_once_with(fail_silently=False)

    @patch("ticketing.notifications.email_service.send_gmail_email")
    def test_email_failure_log_does_not_store_provider_secret(
        self,
        send_gmail_email,
    ):
        secret = "gmail-provider-internal-SECRET"
        send_gmail_email.side_effect = RuntimeError(
            f"provider failed credential={secret}"
        )

        with self.assertLogs(
            "ticketing.notifications.email_service",
            level="ERROR",
        ) as captured:
            log = BookingEmailService._send_email(
                booking=self.booking,
                recipient="customer@example.test",
                subject="Subject",
                text_body="Text",
                html_body="<p>Text</p>",
                audience="customer",
            )

        log.refresh_from_db()
        self.assertEqual(log.status, "failed")
        self.assertNotIn(secret, str(log.provider_response))
        self.assertNotIn(secret, "\n".join(captured.output))

    # ------------------------------------------------------------------
    # Meta WhatsApp
    # ------------------------------------------------------------------

    def test_whatsapp_service_requires_connected_tenant_configuration(self):
        self.whatsapp_settings.connection_status = "disconnected"
        self.whatsapp_settings.save(update_fields=["connection_status"])
        session = Mock()
        service = BookingWhatsAppService(
            self.whatsapp_settings,
            session=session,
        )

        with self.assertRaises(WhatsAppConfigurationError):
            service._request(
                "POST",
                service.messages_url,
                json_payload={"messaging_product": "whatsapp"},
            )

        session.request.assert_not_called()

    def test_whatsapp_request_uses_tenant_token_only_at_http_boundary(self):
        session = Mock()
        response = Mock()
        response.ok = True
        response.status_code = 200
        response.content = b'{"messages":[{"id":"wamid.123"}]}'
        response.json.return_value = {"messages": [{"id": "wamid.123"}]}
        session.request.return_value = response

        service = BookingWhatsAppService(
            self.whatsapp_settings,
            session=session,
            timeout=7,
        )

        payload = service._request(
            "POST",
            service.messages_url,
            json_payload={
                "messaging_product": "whatsapp",
                "to": "18095550101",
            },
        )

        self.assertEqual(payload["messages"][0]["id"], "wamid.123")
        kwargs = session.request.call_args.kwargs
        self.assertEqual(
            kwargs["headers"]["Authorization"],
            "Bearer meta-access-token-A",
        )
        self.assertEqual(kwargs["timeout"], 7)
        self.assertNotIn("meta-access-token-A", str(payload))

    def test_whatsapp_transport_failure_does_not_propagate_access_token(
        self,
    ):
        secret = self.whatsapp_settings.access_token
        session = Mock()
        from requests import RequestException

        session.request.side_effect = RequestException(
            f"connection failed Authorization=Bearer {secret}"
        )
        service = BookingWhatsAppService(
            self.whatsapp_settings,
            session=session,
        )

        with self.assertRaises(WhatsAppAPIError) as ctx:
            service._request(
                "POST",
                service.messages_url,
                json_payload={"messaging_product": "whatsapp"},
            )

        self.assertNotIn(secret, str(ctx.exception))
        self.assertNotIn(secret, str(ctx.exception.response_data))

    def test_whatsapp_service_for_organisation_never_uses_other_tenant_settings(self):
        TicketingWhatsAppSettings.objects.create(
            organisation=self.org_b,
            provider="meta_cloud_api",
            is_active=True,
            phone_number_id="phone-number-id-b",
            access_token="meta-access-token-B",
            connection_status="connected",
        )
        service = BookingWhatsAppService.for_organisation(
            self.org_a,
            session=Mock(),
        )

        self.assertEqual(service.settings.organisation_id, self.org_a.pk)
        self.assertEqual(service.phone_number_id, "phone-number-id-a")
        self.assertEqual(service.access_token, "meta-access-token-A")
        self.assertNotEqual(service.access_token, "meta-access-token-B")

    # ------------------------------------------------------------------
    # AWS ACM / CloudFront
    # ------------------------------------------------------------------

    def test_acm_idempotency_token_is_deterministic_and_tenant_specific(self):
        same_one = ticketing_services.build_acm_idempotency_token(
            self.site_settings,
            "bookings.example.test",
        )
        same_two = ticketing_services.build_acm_idempotency_token(
            self.site_settings,
            "bookings.example.test",
        )

        other_site = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_b,
            custom_domain="bookings.example.test",
        )
        other_token = ticketing_services.build_acm_idempotency_token(
            other_site,
            "bookings.example.test",
        )

        self.assertEqual(same_one, same_two)
        self.assertNotEqual(same_one, other_token)
        self.assertLessEqual(len(same_one), 32)

    @patch("ticketing.services.get_acm_client")
    def test_acm_existing_certificate_is_reused_without_requesting_new_one(
        self,
        get_acm_client,
    ):
        arn = "arn:aws:acm:us-east-1:123:certificate/existing"
        self.site_settings.aws_acm_certificate_arn = arn
        self.site_settings.save(update_fields=["aws_acm_certificate_arn"])

        acm = Mock()
        acm.describe_certificate.return_value = {
            "Certificate": {"CertificateArn": arn}
        }
        get_acm_client.return_value = acm

        result = ticketing_services.request_or_reuse_acm_certificate(
            self.site_settings,
            self.site_settings.custom_domain,
        )

        self.assertEqual(result, arn)
        acm.request_certificate.assert_not_called()

    @patch("ticketing.services.get_acm_client")
    def test_acm_new_certificate_request_uses_idempotency_and_tenant_tag(
        self,
        get_acm_client,
    ):
        acm = Mock()
        acm.request_certificate.return_value = {
            "CertificateArn": "arn:aws:acm:us-east-1:123:certificate/new"
        }
        get_acm_client.return_value = acm

        result = ticketing_services.request_or_reuse_acm_certificate(
            self.site_settings,
            self.site_settings.custom_domain,
        )

        self.assertEqual(
            result,
            "arn:aws:acm:us-east-1:123:certificate/new",
        )
        kwargs = acm.request_certificate.call_args.kwargs
        self.assertEqual(kwargs["DomainName"], "bookings.example.test")
        self.assertEqual(kwargs["ValidationMethod"], "DNS")
        self.assertEqual(
            kwargs["IdempotencyToken"],
            ticketing_services.build_acm_idempotency_token(
                self.site_settings,
                "bookings.example.test",
            ),
        )
        tags = {tag["Key"]: tag["Value"] for tag in kwargs["Tags"]}
        self.assertEqual(tags["OrganisationSlug"], self.org_a.slug)

    @override_settings(
        AWS_CLOUDFRONT_DISTRIBUTION_ID="DIST-TEST-A",
        AWS_CLOUDFRONT_DOMAIN="distribution-a.cloudfront.net",
    )
    @patch("ticketing.services.get_cloudfront_client")
    def test_cloudfront_alias_update_is_mocked_and_does_not_duplicate_alias(
        self,
        get_cloudfront_client,
    ):
        self.site_settings.aws_acm_certificate_arn = (
            "arn:aws:acm:us-east-1:123:certificate/test"
        )
        self.site_settings.save(
            update_fields=["aws_acm_certificate_arn"]
        )

        cloudfront = Mock()
        cloudfront.get_distribution_config.return_value = {
            "ETag": "etag-1",
            "DistributionConfig": {
                "Aliases": {
                    "Quantity": 1,
                    "Items": ["bookings.example.test"],
                },
                "ViewerCertificate": {
                    "ACMCertificateArn": self.site_settings.aws_acm_certificate_arn,
                },
            },
        }
        cloudfront.update_distribution.return_value = {
            "Distribution": {"Status": "InProgress"}
        }
        get_cloudfront_client.return_value = cloudfront

        result = ticketing_services.ensure_cloudfront_alias(
            self.site_settings
        )

        self.assertTrue(result["updated"])
        config = cloudfront.update_distribution.call_args.kwargs[
            "DistributionConfig"
        ]
        self.assertEqual(
            config["Aliases"]["Items"],
            ["bookings.example.test"],
        )
        self.assertEqual(config["Aliases"]["Quantity"], 1)

    @patch("ticketing.services.get_boto3_client")
    def test_aws_helpers_use_expected_services_without_live_aws(
        self,
        get_boto3_client,
    ):
        acm_client = object()
        cloudfront_client = object()
        get_boto3_client.side_effect = [acm_client, cloudfront_client]

        self.assertIs(ticketing_services.get_acm_client(), acm_client)
        self.assertIs(
            ticketing_services.get_cloudfront_client(),
            cloudfront_client,
        )

        self.assertEqual(
            get_boto3_client.call_args_list[0].args[0],
            "acm",
        )
        self.assertEqual(
            get_boto3_client.call_args_list[1].args[0],
            "cloudfront",
        )
