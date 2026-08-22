"""Public payment-provider API tests for the ticketing application.

External provider calls are always mocked at the boundary imported by
``ticketing.views``.  This module must never contact Stripe, PayPal, email, or
other live services.
"""

from __future__ import annotations

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    BookingPayment,
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
    TicketingSettings,
)


class FakeHTTPResponse:
    def __init__(self, payload, *, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class PaymentProviderAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Payment API Organisation",
            slug="payment-api-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Payment API Organisation",
            slug="other-payment-api-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Payment API Organisation",
            slug="inactive-payment-api-org",
            business_type="ticketing",
            is_active=False,
        )

        TicketingSettings.objects.create(
            organisation=cls.organisation,
            default_currency="USD",
        )
        TicketingSettings.objects.create(
            organisation=cls.other_organisation,
            default_currency="EUR",
        )

        TicketingPublicSiteSettings.objects.create(
            organisation=cls.organisation,
            site_title="Payment API Site",
            is_published=True,
        )
        TicketingPublicSiteSettings.objects.create(
            organisation=cls.other_organisation,
            site_title="Other Payment API Site",
            is_published=True,
        )

    def setUp(self):
        # Network/provider guard rails.  Individual tests explicitly configure
        # these mocks when they need a successful provider response.
        self.requests_post_patcher = patch(
            "ticketing.views.requests.post",
            side_effect=AssertionError("Live HTTP provider call attempted in a test."),
        )
        self.stripe_create_patcher = patch(
            "ticketing.views.stripe.checkout.Session.create",
            side_effect=AssertionError("Live Stripe create call attempted in a test."),
        )
        self.stripe_retrieve_patcher = patch(
            "ticketing.views.stripe.checkout.Session.retrieve",
            side_effect=AssertionError("Live Stripe retrieve call attempted in a test."),
        )
        self.stripe_webhook_patcher = patch(
            "ticketing.views.stripe.Webhook.construct_event",
            side_effect=AssertionError("Live Stripe webhook verification attempted in a test."),
        )
        self.notification_patcher = patch(
            "ticketing.views.BookingNotificationService.payment_confirmed"
        )

        self.requests_post = self.requests_post_patcher.start()
        self.stripe_create = self.stripe_create_patcher.start()
        self.stripe_retrieve = self.stripe_retrieve_patcher.start()
        self.stripe_construct_event = self.stripe_webhook_patcher.start()
        self.payment_notification = self.notification_patcher.start()

        self.addCleanup(self.requests_post_patcher.stop)
        self.addCleanup(self.stripe_create_patcher.stop)
        self.addCleanup(self.stripe_retrieve_patcher.stop)
        self.addCleanup(self.stripe_webhook_patcher.stop)
        self.addCleanup(self.notification_patcher.stop)

    def make_booking(self, organisation=None, **overrides):
        values = {
            "organisation": organisation or self.organisation,
            "customer_name": "Payment API Customer",
            "subtotal_amount": Decimal("100.00"),
            "total_amount": Decimal("100.00"),
            "deposit_required": Decimal("25.00"),
            "balance_due": Decimal("100.00"),
            "payment_status": "unpaid",
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_provider_settings(self, organisation=None, **overrides):
        values = {
            "organisation": organisation or self.organisation,
            "default_provider": "stripe",
            "stripe_enabled": True,
            "stripe_publishable_key": "pk_test_public_value",
            "stripe_secret_key": "sk_test_private_value",
            "stripe_webhook_secret": "whsec_private_value",
            "paypal_enabled": True,
            "paypal_mode": "sandbox",
            "paypal_client_id": "paypal-client-id",
            "paypal_client_secret": "paypal-client-secret",
            "is_active": True,
        }
        values.update(overrides)
        return TicketingPaymentProviderSettings.objects.create(**values)

    def url(self, name, organisation=None):
        organisation = organisation or self.organisation
        return reverse(name, kwargs={"organisation_slug": organisation.slug})

    # ------------------------------------------------------------------ URLs

    def test_all_public_payment_url_names_reverse(self):
        expected = {
            "ticketing-public-payment-options": f"/ticketing/public/{self.organisation.slug}/payments/options/",
            "ticketing-public-stripe-create-checkout-session": f"/ticketing/public/{self.organisation.slug}/payments/stripe/create-checkout-session/",
            "ticketing-public-stripe-confirm-session": f"/ticketing/public/{self.organisation.slug}/payments/stripe/confirm-session/",
            "ticketing-public-paypal-create-order": f"/ticketing/public/{self.organisation.slug}/payments/paypal/create-order/",
            "ticketing-public-paypal-capture-order": f"/ticketing/public/{self.organisation.slug}/payments/paypal/capture-order/",
        }

        for name, suffix in expected.items():
            with self.subTest(name=name):
                self.assertTrue(self.url(name).endswith(suffix))

        self.assertTrue(reverse("ticketing-stripe-webhook").endswith("/ticketing/payments/stripe/webhook/"))

    # --------------------------------------------------------- payment options

    def test_payment_options_are_public_and_safe_when_unconfigured(self):
        response = self.client.get(self.url("ticketing-public-payment-options"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["default_provider"], "none")
        self.assertFalse(response.data["stripe_enabled"])
        self.assertFalse(response.data["paypal_enabled"])
        self.assertNotIn("stripe_secret_key", response.data)
        self.assertNotIn("stripe_webhook_secret", response.data)
        self.assertNotIn("paypal_client_secret", response.data)

    def test_payment_options_expose_publishable_configuration_but_never_secrets(self):
        self.make_provider_settings()

        response = self.client.get(self.url("ticketing-public-payment-options"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["stripe_enabled"])
        self.assertTrue(response.data["paypal_enabled"])
        self.assertEqual(response.data["stripe_publishable_key"], "pk_test_public_value")
        serialized = json.dumps(response.data)
        self.assertNotIn("sk_test_private_value", serialized)
        self.assertNotIn("whsec_private_value", serialized)
        self.assertNotIn("paypal-client-secret", serialized)

    def test_inactive_provider_settings_are_treated_as_unconfigured(self):
        self.make_provider_settings(is_active=False)

        response = self.client.get(self.url("ticketing-public-payment-options"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["stripe_enabled"])
        self.assertFalse(response.data["paypal_enabled"])

    def test_inactive_organisation_is_not_available_to_public_payment_endpoints(self):
        response = self.client.get(
            self.url("ticketing-public-payment-options", self.inactive_organisation)
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    # ------------------------------------------------------------- Stripe create

    def test_stripe_checkout_rejects_unconfigured_provider_without_provider_call(self):
        booking = self.make_booking()

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_id": booking.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.stripe_create.assert_not_called()

    def test_stripe_checkout_cannot_use_booking_from_another_tenant(self):
        self.make_provider_settings()
        foreign_booking = self.make_booking(organisation=self.other_organisation)

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_id": foreign_booking.id, "booking_code": foreign_booking.booking_code},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.stripe_create.assert_not_called()
        self.assertFalse(BookingPayment.objects.exists())

    def test_stripe_checkout_rejects_zero_amount(self):
        self.make_provider_settings()
        booking = self.make_booking(total_amount=Decimal("0.00"), balance_due=Decimal("0.00"))

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_id": booking.id, "payment_type": "full"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.stripe_create.assert_not_called()
        self.assertFalse(BookingPayment.objects.exists())

    def test_stripe_checkout_uses_decimal_minor_units_and_persists_pending_payment(self):
        self.make_provider_settings()
        booking = self.make_booking(total_amount=Decimal("10.37"), balance_due=Decimal("10.37"))
        self.stripe_create.side_effect = None
        self.stripe_create.return_value = SimpleNamespace(
            id="cs_test_1",
            url="https://checkout.stripe.test/cs_test_1",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_id": booking.id, "payment_type": "full"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = self.stripe_create.call_args.kwargs
        self.assertEqual(payload["line_items"][0]["price_data"]["unit_amount"], 1037)
        self.assertEqual(payload["line_items"][0]["price_data"]["currency"], "usd")
        self.assertEqual(payload["metadata"]["organisation_id"], str(self.organisation.id))
        payment = BookingPayment.objects.get(provider="stripe", provider_checkout_id="cs_test_1")
        self.assertEqual(payment.amount, Decimal("10.37"))
        self.assertEqual(payment.status, "pending")
        self.assertEqual(response.data["session_id"], "cs_test_1")

    def test_stripe_checkout_deposit_uses_deposit_required(self):
        self.make_provider_settings()
        booking = self.make_booking(
            total_amount=Decimal("100.00"),
            deposit_required=Decimal("22.45"),
            balance_due=Decimal("100.00"),
        )
        self.stripe_create.side_effect = None
        self.stripe_create.return_value = SimpleNamespace(
            id="cs_deposit",
            url="https://checkout.stripe.test/deposit",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_code": booking.booking_code, "payment_type": "deposit"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        unit_amount = self.stripe_create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"]
        self.assertEqual(unit_amount, 2245)

    def test_duplicate_stripe_checkout_session_is_idempotently_updated_not_duplicated(self):
        self.make_provider_settings()
        booking = self.make_booking()
        self.stripe_create.side_effect = None
        self.stripe_create.return_value = SimpleNamespace(
            id="cs_same",
            url="https://checkout.stripe.test/same",
            payment_status="unpaid",
        )
        url = self.url("ticketing-public-stripe-create-checkout-session")

        first = self.client.post(url, {"booking_id": booking.id}, format="json")
        second = self.client.post(url, {"booking_id": booking.id}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(
            BookingPayment.objects.filter(provider="stripe", provider_checkout_id="cs_same").count(),
            1,
        )

    def test_stripe_checkout_provider_error_is_sanitized(self):
        self.make_provider_settings()
        booking = self.make_booking()
        secret = "sk_live_DO_NOT_LEAK_PROVIDER_SECRET"
        self.stripe_create.side_effect = RuntimeError(f"provider failed using {secret}")

        response = self.client.post(
            self.url("ticketing-public-stripe-create-checkout-session"),
            {"booking_id": booking.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, json.dumps(response.data))
        self.assertFalse(BookingPayment.objects.exists())

    # ----------------------------------------------------------- Stripe confirm

    def test_stripe_confirm_requires_session_id(self):
        self.make_provider_settings()
        response = self.client.post(
            self.url("ticketing-public-stripe-confirm-session"), {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.stripe_retrieve.assert_not_called()

    def test_stripe_confirm_rejects_session_metadata_for_other_tenant(self):
        self.make_provider_settings()
        booking = self.make_booking()
        self.stripe_retrieve.side_effect = None
        self.stripe_retrieve.return_value = {
            "id": "cs_foreign_metadata",
            "payment_status": "paid",
            "amount_total": 10000,
            "metadata": {
                "booking_id": str(booking.id),
                "booking_code": booking.booking_code,
                "organisation_id": str(self.other_organisation.id),
                "payment_type": "full",
            },
        }

        with patch("ticketing.views.booking_finance.mark_booking_payment_confirmed") as confirm:
            response = self.client.post(
                self.url("ticketing-public-stripe-confirm-session"),
                {"session_id": "cs_foreign_metadata"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        confirm.assert_not_called()

    def test_stripe_confirm_pending_session_does_not_confirm_payment(self):
        self.make_provider_settings()
        booking = self.make_booking()
        self.stripe_retrieve.side_effect = None
        self.stripe_retrieve.return_value = {
            "id": "cs_pending",
            "payment_status": "unpaid",
            "amount_total": 10000,
            "metadata": {
                "booking_id": str(booking.id),
                "booking_code": booking.booking_code,
                "organisation_id": str(self.organisation.id),
                "payment_type": "full",
            },
        }

        with patch("ticketing.views.booking_finance.mark_booking_payment_confirmed") as confirm:
            response = self.client.post(
                self.url("ticketing-public-stripe-confirm-session"),
                {"session_id": "cs_pending"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertFalse(response.data["confirmed"])
        confirm.assert_not_called()

    def test_stripe_confirm_paid_session_forwards_decimal_and_provider_identifiers(self):
        self.make_provider_settings()
        booking = self.make_booking(total_amount=Decimal("12.34"), balance_due=Decimal("12.34"))
        self.stripe_retrieve.side_effect = None
        self.stripe_retrieve.return_value = {
            "id": "cs_paid",
            "payment_status": "paid",
            "amount_total": 1234,
            "payment_intent": {"id": "pi_paid"},
            "metadata": {
                "booking_id": str(booking.id),
                "booking_code": booking.booking_code,
                "organisation_id": str(self.organisation.id),
                "payment_type": "full",
            },
        }
        fake_payment = SimpleNamespace(id=321)

        with patch(
            "ticketing.views.booking_finance.mark_booking_payment_confirmed",
            return_value=(fake_payment, booking),
        ) as confirm:
            response = self.client.post(
                self.url("ticketing-public-stripe-confirm-session"),
                {"session_id": "cs_paid"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["confirmed"])
        kwargs = confirm.call_args.kwargs
        self.assertEqual(kwargs["amount"], Decimal("12.34"))
        self.assertEqual(kwargs["provider_payment_id"], "pi_paid")
        self.assertEqual(kwargs["provider_checkout_id"], "cs_paid")
        self.assertEqual(kwargs["provider"], "stripe")

    def test_stripe_confirm_provider_error_is_sanitized(self):
        self.make_provider_settings()
        secret = "stripe-internal-secret-value"
        self.stripe_retrieve.side_effect = RuntimeError(secret)

        response = self.client.post(
            self.url("ticketing-public-stripe-confirm-session"),
            {"session_id": "cs_error"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, json.dumps(response.data))

    # ------------------------------------------------------------- PayPal create

    def test_paypal_create_rejects_unconfigured_provider_without_http_call(self):
        booking = self.make_booking()
        response = self.client.post(
            self.url("ticketing-public-paypal-create-order"),
            {"booking_id": booking.id},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.requests_post.assert_not_called()

    def test_paypal_create_cannot_use_foreign_tenant_booking(self):
        self.make_provider_settings()
        foreign_booking = self.make_booking(organisation=self.other_organisation)

        with patch("ticketing.views.get_paypal_access_token") as token:
            response = self.client.post(
                self.url("ticketing-public-paypal-create-order"),
                {"booking_id": foreign_booking.id},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        token.assert_not_called()
        self.requests_post.assert_not_called()

    def test_paypal_create_uses_decimal_string_and_persists_pending_payment(self):
        self.make_provider_settings()
        booking = self.make_booking(total_amount=Decimal("19.99"), balance_due=Decimal("19.99"))
        self.requests_post.side_effect = None
        self.requests_post.return_value = FakeHTTPResponse(
            {
                "id": "PAYPAL-ORDER-1",
                "status": "CREATED",
                "links": [{"rel": "approve", "href": "https://paypal.test/approve/1"}],
            }
        )

        with patch("ticketing.views.get_paypal_access_token", return_value="access-token"):
            response = self.client.post(
                self.url("ticketing-public-paypal-create-order"),
                {"booking_id": booking.id, "payment_type": "full"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        request_json = self.requests_post.call_args.kwargs["json"]
        self.assertEqual(request_json["purchase_units"][0]["amount"]["value"], "19.99")
        self.assertEqual(request_json["purchase_units"][0]["amount"]["currency_code"], "USD")
        payment = BookingPayment.objects.get(provider="paypal", provider_order_id="PAYPAL-ORDER-1")
        self.assertEqual(payment.amount, Decimal("19.99"))
        self.assertEqual(payment.status, "pending")
        self.assertEqual(response.data["approve_url"], "https://paypal.test/approve/1")

    def test_duplicate_paypal_order_is_idempotently_updated_not_duplicated(self):
        self.make_provider_settings()
        booking = self.make_booking()
        self.requests_post.side_effect = None
        self.requests_post.return_value = FakeHTTPResponse(
            {"id": "PAYPAL-SAME", "status": "CREATED", "links": []}
        )
        url = self.url("ticketing-public-paypal-create-order")

        with patch("ticketing.views.get_paypal_access_token", return_value="token"):
            first = self.client.post(url, {"booking_id": booking.id}, format="json")
            second = self.client.post(url, {"booking_id": booking.id}, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(
            BookingPayment.objects.filter(provider="paypal", provider_order_id="PAYPAL-SAME").count(),
            1,
        )

    def test_paypal_create_provider_error_is_sanitized(self):
        self.make_provider_settings()
        booking = self.make_booking()
        secret = "paypal-client-secret-must-not-leak"

        with patch("ticketing.views.get_paypal_access_token", side_effect=RuntimeError(secret)):
            response = self.client.post(
                self.url("ticketing-public-paypal-create-order"),
                {"booking_id": booking.id},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, json.dumps(response.data))
        self.assertFalse(BookingPayment.objects.exists())

    # ------------------------------------------------------------ PayPal capture

    def test_paypal_capture_requires_order_id(self):
        self.make_provider_settings()
        response = self.client.post(
            self.url("ticketing-public-paypal-capture-order"), {}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.requests_post.assert_not_called()

    def test_paypal_capture_cannot_find_payment_from_other_tenant(self):
        self.make_provider_settings()
        foreign_booking = self.make_booking(organisation=self.other_organisation)
        BookingPayment.objects.create(
            booking=foreign_booking,
            amount=Decimal("10.00"),
            payment_type="full",
            method="paypal",
            provider="paypal",
            provider_order_id="FOREIGN-ORDER",
            status="pending",
        )

        response = self.client.post(
            self.url("ticketing-public-paypal-capture-order"),
            {"order_id": "FOREIGN-ORDER"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.requests_post.assert_not_called()

    def test_paypal_capture_forwards_identifiers_and_mocks_notification_boundary(self):
        self.make_provider_settings()
        booking = self.make_booking(total_amount=Decimal("25.00"), balance_due=Decimal("25.00"))
        pending = BookingPayment.objects.create(
            booking=booking,
            amount=Decimal("25.00"),
            payment_type="full",
            method="paypal",
            provider="paypal",
            provider_order_id="ORDER-CAPTURE",
            status="pending",
        )
        self.requests_post.side_effect = None
        self.requests_post.return_value = FakeHTTPResponse(
            {
                "id": "ORDER-CAPTURE",
                "status": "COMPLETED",
                "purchase_units": [
                    {"payments": {"captures": [{"id": "CAPTURE-1"}]}}
                ],
            }
        )
        fake_confirmed = SimpleNamespace(id=pending.id)

        with patch("ticketing.views.get_paypal_access_token", return_value="token"), patch(
            "ticketing.views.booking_finance.mark_booking_payment_confirmed",
            return_value=(fake_confirmed, booking),
        ) as confirm:
            response = self.client.post(
                self.url("ticketing-public-paypal-capture-order"),
                {"order_id": "ORDER-CAPTURE"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = confirm.call_args.kwargs
        self.assertEqual(kwargs["amount"], Decimal("25.00"))
        self.assertEqual(kwargs["provider_order_id"], "ORDER-CAPTURE")
        self.assertEqual(kwargs["provider_capture_id"], "CAPTURE-1")
        self.payment_notification.assert_called_once_with(booking)

    def test_paypal_capture_provider_error_is_sanitized(self):
        self.make_provider_settings()
        booking = self.make_booking()
        BookingPayment.objects.create(
            booking=booking,
            amount=Decimal("100.00"),
            payment_type="full",
            method="paypal",
            provider="paypal",
            provider_order_id="ORDER-ERROR",
            status="pending",
        )
        secret = "paypal-provider-internal-secret"

        with patch("ticketing.views.get_paypal_access_token", side_effect=RuntimeError(secret)):
            response = self.client.post(
                self.url("ticketing-public-paypal-capture-order"),
                {"order_id": "ORDER-ERROR"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, json.dumps(response.data))

    # ------------------------------------------------------------ Stripe webhook

    def stripe_webhook_payload(self, *, booking, payment_status="paid", event_id="evt_1"):
        return {
            "id": event_id,
            "type": "checkout.session.completed",
            "data": {
                "object": {
                    "id": "cs_webhook",
                    "payment_status": payment_status,
                    "amount_total": 10000,
                    "payment_intent": "pi_webhook",
                    "metadata": {
                        "organisation_id": str(booking.organisation_id),
                        "booking_id": str(booking.id),
                        "booking_code": booking.booking_code,
                        "payment_type": "full",
                    },
                }
            },
        }

    def test_stripe_webhook_invalid_json_never_calls_stripe_or_finance(self):
        with patch("ticketing.views.booking_finance.mark_booking_payment_confirmed") as confirm, patch(
            "ticketing.views.StripeWebhookAPIView.webhook_log"
        ):
            response = self.client.post(
                reverse("ticketing-stripe-webhook"),
                data=b"{not-json",
                content_type="application/json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.stripe_construct_event.assert_not_called()
        confirm.assert_not_called()

    def test_stripe_webhook_without_configured_webhook_secret_is_rejected_not_trusted(self):
        self.make_provider_settings(stripe_webhook_secret="")
        booking = self.make_booking()
        payload = self.stripe_webhook_payload(booking=booking)

        with patch("ticketing.views.booking_finance.mark_booking_payment_confirmed") as confirm, patch(
            "ticketing.views.StripeWebhookAPIView.webhook_log"
        ):
            response = self.client.post(
                reverse("ticketing-stripe-webhook"),
                data=json.dumps(payload),
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="attacker-controlled",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        confirm.assert_not_called()

    def test_stripe_webhook_signature_failure_is_sanitized_in_response_and_logs(self):
        self.make_provider_settings()
        booking = self.make_booking()
        payload = self.stripe_webhook_payload(booking=booking)
        secret = "signature-debug-secret-must-not-leak"
        self.stripe_construct_event.side_effect = RuntimeError(secret)

        with patch("ticketing.views.StripeWebhookAPIView.webhook_log") as webhook_log:
            response = self.client.post(
                reverse("ticketing-stripe-webhook"),
                data=json.dumps(payload),
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="bad-signature",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn(secret, json.dumps(response.data))
        logged_text = " ".join(str(call) for call in webhook_log.call_args_list)
        self.assertNotIn(secret, logged_text)

    def test_stripe_webhook_valid_paid_event_forwards_decimal_and_is_tenant_scoped(self):
        self.make_provider_settings()
        booking = self.make_booking()
        payload = self.stripe_webhook_payload(booking=booking, event_id="evt_paid")
        self.stripe_construct_event.side_effect = None
        self.stripe_construct_event.return_value = payload
        fake_payment = SimpleNamespace(id=77, status="confirmed")
        booking.status = "confirmed"
        booking.payment_status = "paid"
        booking.deposit_paid = Decimal("100.00")
        booking.balance_due = Decimal("0.00")

        with patch(
            "ticketing.views.booking_finance.mark_booking_payment_confirmed",
            return_value=(fake_payment, booking),
        ) as confirm, patch("ticketing.views.StripeWebhookAPIView.webhook_log"):
            response = self.client.post(
                reverse("ticketing-stripe-webhook"),
                data=json.dumps(payload),
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="valid-signature",
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["confirmed"])
        kwargs = confirm.call_args.kwargs
        self.assertEqual(kwargs["booking"].organisation_id, self.organisation.id)
        self.assertEqual(kwargs["amount"], Decimal("100.00"))
        self.assertEqual(kwargs["provider_checkout_id"], "cs_webhook")
        self.assertEqual(kwargs["provider_payment_id"], "pi_webhook")

    def test_stripe_webhook_does_not_process_booking_from_different_organisation(self):
        self.make_provider_settings()
        foreign_booking = self.make_booking(organisation=self.other_organisation)
        # Forge metadata so the request routes to organisation A while naming a
        # real booking from organisation B.
        payload = self.stripe_webhook_payload(booking=foreign_booking)
        payload["data"]["object"]["metadata"]["organisation_id"] = str(self.organisation.id)
        self.stripe_construct_event.side_effect = None
        self.stripe_construct_event.return_value = payload

        with patch("ticketing.views.booking_finance.mark_booking_payment_confirmed") as confirm, patch(
            "ticketing.views.StripeWebhookAPIView.webhook_log"
        ):
            response = self.client.post(
                reverse("ticketing-stripe-webhook"),
                data=json.dumps(payload),
                content_type="application/json",
                HTTP_STRIPE_SIGNATURE="valid-signature",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        confirm.assert_not_called()
