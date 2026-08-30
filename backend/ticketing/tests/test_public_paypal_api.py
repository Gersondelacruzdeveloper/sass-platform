"""Public PayPal API coverage.

Covers create-order and capture-order boundaries: tenant isolation, published
site boundary, provider configuration, sandbox/live endpoint selection, exact
full/deposit/balance amounts, safe provider errors, payment persistence,
capture id propagation, retry/idempotency behavior, and public-response secrecy.

All PayPal HTTP calls are mocked.
"""

from __future__ import annotations

from datetime import date, timedelta
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
    ExperienceProduct,
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
    TicketingSettings,
)


class PublicPayPalAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="PayPal Organisation A",
            slug="paypal-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="PayPal Organisation B",
            slug="paypal-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="PayPal Site A",
            custom_domain="paypal-a.example.test",
            canonical_url="https://paypal-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="PayPal Site B",
            custom_domain="paypal-b.example.test",
            canonical_url="https://paypal-b.example.test",
            is_published=True,
        )

        cls.settings_a = TicketingSettings.objects.create(
            organisation=cls.org_a,
            default_currency="USD",
            allow_public_bookings=True,
        )
        cls.settings_b = TicketingSettings.objects.create(
            organisation=cls.org_b,
            default_currency="EUR",
            allow_public_bookings=True,
        )

        cls.provider_a = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_a,
            default_provider="paypal",
            paypal_enabled=True,
            paypal_mode="sandbox",
            paypal_client_id="paypal-client-a",
            paypal_client_secret="paypal-secret-A-PRIVATE",
            paypal_merchant_id="merchant-A-PRIVATE",
            paypal_webhook_id="webhook-A-PRIVATE",
            is_active=True,
        )
        cls.provider_b = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_b,
            default_provider="paypal",
            paypal_enabled=True,
            paypal_mode="live",
            paypal_client_id="paypal-client-b",
            paypal_client_secret="paypal-secret-B-PRIVATE",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="PayPal Product A",
            slug="paypal-product-a",
            sku="PAYPAL-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
            deposit_amount=Decimal("30.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign PayPal Product",
            slug="foreign-paypal-product",
            sku="PAYPAL-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("220.00"),
            adult_price=Decimal("220.00"),
            deposit_amount=Decimal("40.00"),
        )

        service_date = date.today() + timedelta(days=7)

        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="PayPal Customer A",
            customer_email="paypal-a@example.test",
            service_date=service_date,
            adults=1,
            status="pending_payment",
            payment_status="unpaid",
            total_amount=Decimal("120.00"),
            subtotal_amount=Decimal("120.00"),
            deposit_required=Decimal("30.00"),
            deposit_paid=Decimal("0.00"),
            balance_due=Decimal("120.00"),
        )
        cls.booking_b = Booking.objects.create(
            organisation=cls.org_b,
            primary_product=cls.product_b,
            customer_name="Foreign PayPal Customer",
            customer_email="paypal-b@example.test",
            service_date=service_date,
            adults=1,
            status="pending_payment",
            payment_status="unpaid",
            total_amount=Decimal("220.00"),
            subtotal_amount=Decimal("220.00"),
            deposit_required=Decimal("40.00"),
            deposit_paid=Decimal("0.00"),
            balance_due=Decimal("220.00"),
        )

    def create_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-paypal-create-order",
            kwargs={"organisation_slug": organisation.slug},
        )

    def capture_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-paypal-capture-order",
            kwargs={"organisation_slug": organisation.slug},
        )

    @staticmethod
    def paypal_response(payload):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = payload
        return response

    def mocked_create_calls(self, order_id="ORDER-A-1"):
        token_response = self.paypal_response({"access_token": "ACCESS-TOKEN-A"})
        order_response = self.paypal_response(
            {
                "id": order_id,
                "status": "CREATED",
                "links": [
                    {
                        "rel": "approve",
                        "href": f"https://paypal.example.test/approve/{order_id}",
                    }
                ],
            }
        )
        return token_response, order_response

    def create_payment_record(self, *, booking=None, order_id="ORDER-CAPTURE-A"):
        booking = booking or self.booking_a
        return BookingPayment.objects.create(
            booking=booking,
            amount=Decimal("30.00"),
            payment_type="deposit",
            payer_type="customer",
            method="paypal",
            status="pending",
            provider="paypal",
            provider_order_id=order_id,
            reference=order_id,
            provider_status="CREATED",
        )

    def test_paypal_routes_reverse(self):
        self.assertEqual(
            self.create_url(),
            f"/api/ticketing/public/{self.org_a.slug}/payments/paypal/create-order/",
        )
        self.assertEqual(
            self.capture_url(),
            f"/api/ticketing/public/{self.org_a.slug}/payments/paypal/capture-order/",
        )

    def test_create_order_rejects_missing_paypal_configuration(self):
        self.provider_a.paypal_client_secret = ""
        self.provider_a.save(update_fields=["paypal_client_secret"])

        with patch("ticketing.views.requests.post") as post:
            response = self.client.post(
                self.create_url(),
                {"booking_id": self.booking_a.pk},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        post.assert_not_called()

    def test_create_order_rejects_foreign_tenant_booking(self):
        with patch("ticketing.views.requests.post") as post:
            response = self.client.post(
                self.create_url(self.org_a),
                {"booking_id": self.booking_b.pk},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    def test_create_order_rejects_unknown_booking(self):
        with patch("ticketing.views.requests.post") as post:
            response = self.client.post(
                self.create_url(),
                {"booking_id": 999999},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_create_order_uses_full_booking_total(self, post):
        post.side_effect = self.mocked_create_calls("ORDER-FULL")

        response = self.client.post(
            self.create_url(),
            {
                "booking_id": self.booking_a.pk,
                "payment_type": "full",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_call = post.call_args_list[1]
        unit = order_call.kwargs["json"]["purchase_units"][0]
        self.assertEqual(unit["amount"]["value"], "120.00")
        self.assertEqual(unit["amount"]["currency_code"], "USD")
        self.assertEqual(unit["reference_id"], self.booking_a.booking_code)
        self.assertEqual(unit["custom_id"], str(self.booking_a.pk))

        payment = BookingPayment.objects.get(provider_order_id="ORDER-FULL")
        self.assertEqual(payment.amount, Decimal("120.00"))
        self.assertEqual(payment.payment_type, "full")
        self.assertEqual(payment.booking_id, self.booking_a.pk)

    @patch("ticketing.views.requests.post")
    def test_create_order_uses_deposit_amount(self, post):
        post.side_effect = self.mocked_create_calls("ORDER-DEPOSIT")

        response = self.client.post(
            self.create_url(),
            {
                "booking_code": self.booking_a.booking_code,
                "payment_type": "deposit",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_call = post.call_args_list[1]
        self.assertEqual(
            order_call.kwargs["json"]["purchase_units"][0]["amount"]["value"],
            "30.00",
        )
        payment = BookingPayment.objects.get(provider_order_id="ORDER-DEPOSIT")
        self.assertEqual(payment.amount, Decimal("30.00"))
        self.assertEqual(payment.payment_type, "deposit")

    @patch("ticketing.views.requests.post")
    def test_create_order_uses_balance_due(self, post):
        self.booking_a.balance_due = Decimal("75.00")
        self.booking_a.save(update_fields=["balance_due"])
        post.side_effect = self.mocked_create_calls("ORDER-BALANCE")

        response = self.client.post(
            self.create_url(),
            {
                "booking_id": self.booking_a.pk,
                "payment_type": "balance",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order_call = post.call_args_list[1]
        self.assertEqual(
            order_call.kwargs["json"]["purchase_units"][0]["amount"]["value"],
            "75.00",
        )

    def test_create_order_rejects_zero_payment_amount_before_paypal_call(self):
        self.booking_a.total_amount = Decimal("0.00")
        self.booking_a.balance_due = Decimal("0.00")
        self.booking_a.save(update_fields=["total_amount", "balance_due"])

        with patch("ticketing.views.requests.post") as post:
            response = self.client.post(
                self.create_url(),
                {
                    "booking_id": self.booking_a.pk,
                    "payment_type": "full",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_sandbox_mode_uses_sandbox_paypal_endpoints(self, post):
        post.side_effect = self.mocked_create_calls("ORDER-SANDBOX")

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            post.call_args_list[0].args[0],
            "https://api-m.sandbox.paypal.com/v1/oauth2/token",
        )
        self.assertEqual(
            post.call_args_list[1].args[0],
            "https://api-m.sandbox.paypal.com/v2/checkout/orders",
        )

    @patch("ticketing.views.requests.post")
    def test_live_mode_uses_live_paypal_endpoints(self, post):
        post.side_effect = (
            self.paypal_response({"access_token": "ACCESS-B"}),
            self.paypal_response(
                {
                    "id": "ORDER-LIVE-B",
                    "status": "CREATED",
                    "links": [],
                }
            ),
        )

        response = self.client.post(
            self.create_url(self.org_b),
            {"booking_id": self.booking_b.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            post.call_args_list[0].args[0],
            "https://api-m.paypal.com/v1/oauth2/token",
        )
        self.assertEqual(
            post.call_args_list[1].args[0],
            "https://api-m.paypal.com/v2/checkout/orders",
        )
        self.assertEqual(
            post.call_args_list[1].kwargs["json"]["purchase_units"][0]["amount"][
                "currency_code"
            ],
            "EUR",
        )

    @patch("ticketing.views.requests.post")
    def test_create_order_sends_tenant_credentials_only_at_paypal_boundary(self, post):
        post.side_effect = self.mocked_create_calls("ORDER-CREDS")

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        token_call = post.call_args_list[0]
        self.assertEqual(
            token_call.kwargs["auth"],
            ("paypal-client-a", "paypal-secret-A-PRIVATE"),
        )
        payload = str(response.data)
        self.assertNotIn("paypal-secret-A-PRIVATE", payload)
        self.assertNotIn("paypal-client-a", payload)

    @patch("ticketing.views.requests.post")
    def test_create_order_provider_error_is_sanitized(self, post):
        post.side_effect = RuntimeError(
            "provider diagnostic paypal-secret-A-PRIVATE ACCESS-TOKEN-A"
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = str(response.data)
        self.assertNotIn("paypal-secret-A-PRIVATE", payload)
        self.assertNotIn("ACCESS-TOKEN-A", payload)
        self.assertIn("Payment provider request failed", payload)

    @patch("ticketing.views.requests.post")
    def test_create_order_persists_only_order_response_not_access_token(self, post):
        post.side_effect = self.mocked_create_calls("ORDER-NO-TOKEN")

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payment = BookingPayment.objects.get(provider_order_id="ORDER-NO-TOKEN")
        payload = str(payment.provider_response)
        self.assertNotIn("ACCESS-TOKEN-A", payload)
        self.assertNotIn("paypal-secret-A-PRIVATE", payload)

    @patch("ticketing.views.requests.post")
    def test_capture_requires_order_id(self, post):
        response = self.client.post(
            self.capture_url(),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("order_id", response.data)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_capture_rejects_foreign_tenant_payment(self, post):
        foreign_payment = self.create_payment_record(
            booking=self.booking_b,
            order_id="ORDER-FOREIGN",
        )

        response = self.client.post(
            self.capture_url(self.org_a),
            {"order_id": foreign_payment.provider_order_id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_capture_rejects_unknown_order(self, post):
        response = self.client.post(
            self.capture_url(),
            {"order_id": "ORDER-DOES-NOT-EXIST"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    @patch("ticketing.views.BookingNotificationService.payment_confirmed")
    @patch("ticketing.views.booking_finance.mark_booking_payment_confirmed")
    @patch("ticketing.views.requests.post")
    def test_capture_calls_finance_boundary_with_exact_tenant_payment(
        self,
        post,
        mark_confirmed,
        notify,
    ):
        payment = self.create_payment_record(order_id="ORDER-CAPTURE-OK")
        token_response = self.paypal_response({"access_token": "ACCESS-CAPTURE"})
        capture_payload = {
            "id": "ORDER-CAPTURE-OK",
            "status": "COMPLETED",
            "purchase_units": [
                {
                    "payments": {
                        "captures": [
                            {"id": "CAPTURE-A-123"}
                        ]
                    }
                }
            ],
        }
        post.side_effect = (
            token_response,
            self.paypal_response(capture_payload),
        )
        mark_confirmed.return_value = (payment, self.booking_a)

        response = self.client.post(
            self.capture_url(),
            {"order_id": "ORDER-CAPTURE-OK"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = mark_confirmed.call_args.kwargs
        self.assertEqual(kwargs["booking"].pk, self.booking_a.pk)
        self.assertEqual(kwargs["amount"], Decimal("30.00"))
        self.assertEqual(kwargs["provider"], "paypal")
        self.assertEqual(kwargs["payment_type"], "deposit")
        self.assertEqual(kwargs["provider_order_id"], "ORDER-CAPTURE-OK")
        self.assertEqual(kwargs["provider_capture_id"], "CAPTURE-A-123")
        self.assertEqual(kwargs["provider_status"], "COMPLETED")
        notify.assert_called_once()

    @patch("ticketing.views.requests.post")
    def test_capture_provider_error_is_sanitized(self, post):
        self.create_payment_record(order_id="ORDER-CAPTURE-ERROR")
        post.side_effect = RuntimeError(
            "capture diagnostic paypal-secret-A-PRIVATE ACCESS-CAPTURE"
        )

        response = self.client.post(
            self.capture_url(),
            {"order_id": "ORDER-CAPTURE-ERROR"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = str(response.data)
        self.assertNotIn("paypal-secret-A-PRIVATE", payload)
        self.assertNotIn("ACCESS-CAPTURE", payload)
        self.assertIn("Payment provider request failed", payload)

    @patch("ticketing.views.BookingNotificationService.payment_confirmed")
    @patch("ticketing.views.booking_finance.mark_booking_payment_confirmed")
    @patch("ticketing.views.requests.post")
    def test_capture_public_response_does_not_expose_internal_booking_finance(
        self,
        post,
        mark_confirmed,
        notify,
    ):
        payment = self.create_payment_record(order_id="ORDER-CAPTURE-SAFE")
        capture_payload = {
            "id": "ORDER-CAPTURE-SAFE",
            "status": "COMPLETED",
            "purchase_units": [
                {"payments": {"captures": [{"id": "CAPTURE-SAFE"}]}}
            ],
        }
        post.side_effect = (
            self.paypal_response({"access_token": "ACCESS-SAFE"}),
            self.paypal_response(capture_payload),
        )
        mark_confirmed.return_value = (payment, self.booking_a)

        response = self.client.post(
            self.capture_url(),
            {"order_id": "ORDER-CAPTURE-SAFE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        for internal_field in (
            "seller_margin_percent",
            "seller_commission_amount",
            "owner_net_amount",
            "owner_received_amount",
            "seller_collected_amount",
            "seller_due_to_company",
            "commission_pending_amount",
            "external_validation_response",
            "external_raw_response",
            "commissions",
            "payments",
            "cost_price",
            "profit_per_unit",
        ):
            with self.subTest(internal_field=internal_field):
                self.assertNotIn(internal_field, payload)

    @patch("ticketing.views.requests.post")
    def test_unpublished_site_rejects_create_order_before_paypal_call(self, post):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_unpublished_site_rejects_capture_order_before_paypal_call(self, post):
        self.create_payment_record(order_id="ORDER-UNPUBLISHED")
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.capture_url(),
            {"order_id": "ORDER-UNPUBLISHED"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        post.assert_not_called()

    @patch("ticketing.views.requests.post")
    def test_repeated_create_order_same_provider_order_updates_not_duplicates(self, post):
        post.side_effect = (
            *self.mocked_create_calls("ORDER-IDEMPOTENT"),
            *self.mocked_create_calls("ORDER-IDEMPOTENT"),
        )

        first = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk, "payment_type": "deposit"},
            format="json",
        )
        second = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk, "payment_type": "deposit"},
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(
            BookingPayment.objects.filter(
                provider="paypal",
                provider_order_id="ORDER-IDEMPOTENT",
            ).count(),
            1,
        )
