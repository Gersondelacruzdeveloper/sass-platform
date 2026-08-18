"""Public Stripe API coverage.

Covers create-checkout-session and confirm-session boundaries: tenant isolation,
published-site boundary, provider configuration, exact payment amounts,
currency/metadata correctness, Stripe Connect transfer destination, safe
provider errors, pending vs paid confirmation behavior, finance boundary,
idempotent payment lookup, and non-exposure of Stripe secrets/internal booking
finance.

All Stripe SDK calls are mocked.
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


class PublicStripeAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Stripe Organisation A",
            slug="stripe-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Stripe Organisation B",
            slug="stripe-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Stripe Site A",
            custom_domain="stripe-a.example.test",
            canonical_url="https://stripe-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Stripe Site B",
            custom_domain="stripe-b.example.test",
            canonical_url="https://stripe-b.example.test",
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
            default_provider="stripe",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_PUBLIC_A",
            stripe_secret_key="sk_test_PRIVATE_A",
            stripe_webhook_secret="whsec_PRIVATE_A",
            stripe_connect_account_id="acct_CONNECT_A",
            stripe_connect_status="connected",
            is_active=True,
        )
        cls.provider_b = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_b,
            default_provider="stripe",
            stripe_enabled=True,
            stripe_publishable_key="pk_test_PUBLIC_B",
            stripe_secret_key="sk_test_PRIVATE_B",
            stripe_webhook_secret="whsec_PRIVATE_B",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Stripe Product A",
            slug="stripe-product-a",
            sku="STRIPE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Stripe Product",
            slug="foreign-stripe-product",
            sku="STRIPE-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("220.00"),
            adult_price=Decimal("220.00"),
        )

        service_date = date.today() + timedelta(days=7)
        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Stripe Customer A",
            customer_email="stripe-a@example.test",
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
            customer_name="Foreign Stripe Customer",
            customer_email="stripe-b@example.test",
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
            "ticketing-public-stripe-create-checkout-session",
            kwargs={"organisation_slug": organisation.slug},
        )

    def confirm_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-stripe-confirm-session",
            kwargs={"organisation_slug": organisation.slug},
        )

    @staticmethod
    def session_obj(
        *,
        session_id="cs_test_A",
        payment_status="unpaid",
        amount_total=12000,
        booking=None,
        organisation=None,
        payment_type="full",
        payment_intent="pi_test_A",
    ):
        booking = booking
        organisation = organisation
        metadata = {}
        if booking is not None:
            metadata["booking_id"] = str(booking.pk)
            metadata["booking_code"] = booking.booking_code
        if organisation is not None:
            metadata["organisation_id"] = str(organisation.pk)
        metadata["payment_type"] = payment_type
        return {
            "id": session_id,
            "payment_status": payment_status,
            "amount_total": amount_total,
            "metadata": metadata,
            "payment_intent": {"id": payment_intent} if payment_intent else "",
        }

    def test_stripe_routes_reverse(self):
        self.assertEqual(
            self.create_url(),
            f"/api/ticketing/public/{self.org_a.slug}/payments/stripe/create-checkout-session/",
        )
        self.assertEqual(
            self.confirm_url(),
            f"/api/ticketing/public/{self.org_a.slug}/payments/stripe/confirm-session/",
        )

    def test_create_session_rejects_missing_stripe_configuration(self):
        self.provider_a.stripe_secret_key = ""
        self.provider_a.save(update_fields=["stripe_secret_key"])

        with patch("ticketing.views.stripe.checkout.Session.create") as create:
            response = self.client.post(
                self.create_url(),
                {"booking_id": self.booking_a.pk},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        create.assert_not_called()

    def test_create_session_rejects_foreign_tenant_booking(self):
        with patch("ticketing.views.stripe.checkout.Session.create") as create:
            response = self.client.post(
                self.create_url(self.org_a),
                {"booking_id": self.booking_b.pk},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        create.assert_not_called()

    def test_create_session_rejects_unknown_booking(self):
        with patch("ticketing.views.stripe.checkout.Session.create") as create:
            response = self.client.post(
                self.create_url(),
                {"booking_id": 999999},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        create.assert_not_called()

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_uses_full_amount_currency_and_tenant_metadata(self, create):
        create.return_value = SimpleNamespace(
            id="cs_full_A",
            url="https://checkout.stripe.test/cs_full_A",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk, "payment_type": "full"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = create.call_args.kwargs
        self.assertEqual(
            kwargs["line_items"][0]["price_data"]["unit_amount"],
            12000,
        )
        self.assertEqual(
            kwargs["line_items"][0]["price_data"]["currency"],
            "usd",
        )
        self.assertEqual(
            kwargs["metadata"]["organisation_id"],
            str(self.org_a.pk),
        )
        self.assertEqual(
            kwargs["metadata"]["booking_id"],
            str(self.booking_a.pk),
        )
        self.assertEqual(
            kwargs["metadata"]["booking_code"],
            self.booking_a.booking_code,
        )
        self.assertEqual(kwargs["metadata"]["payment_type"], "full")

        payment = BookingPayment.objects.get(provider_checkout_id="cs_full_A")
        self.assertEqual(payment.booking_id, self.booking_a.pk)
        self.assertEqual(payment.amount, Decimal("120.00"))
        self.assertEqual(payment.payment_type, "full")
        self.assertEqual(payment.status, "pending")

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_uses_deposit_amount(self, create):
        create.return_value = SimpleNamespace(
            id="cs_deposit_A",
            url="https://checkout.stripe.test/cs_deposit_A",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(),
            {
                "booking_code": self.booking_a.booking_code,
                "payment_type": "deposit",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"],
            3000,
        )
        payment = BookingPayment.objects.get(provider_checkout_id="cs_deposit_A")
        self.assertEqual(payment.amount, Decimal("30.00"))
        self.assertEqual(payment.payment_type, "deposit")

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_uses_balance_due(self, create):
        self.booking_a.balance_due = Decimal("75.00")
        self.booking_a.save(update_fields=["balance_due"])
        create.return_value = SimpleNamespace(
            id="cs_balance_A",
            url="https://checkout.stripe.test/cs_balance_A",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk, "payment_type": "balance"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            create.call_args.kwargs["line_items"][0]["price_data"]["unit_amount"],
            7500,
        )

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_includes_connect_destination(self, create):
        create.return_value = SimpleNamespace(
            id="cs_connect_A",
            url="https://checkout.stripe.test/cs_connect_A",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            create.call_args.kwargs["payment_intent_data"]["transfer_data"][
                "destination"
            ],
            "acct_CONNECT_A",
        )

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_uses_tenant_secret_only_at_sdk_boundary(self, create):
        create.return_value = SimpleNamespace(
            id="cs_secret_A",
            url="https://checkout.stripe.test/cs_secret_A",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        import ticketing.views as ticketing_views

        self.assertEqual(ticketing_views.stripe.api_key, "sk_test_PRIVATE_A")
        payload = str(response.data)
        self.assertNotIn("sk_test_PRIVATE_A", payload)
        self.assertNotIn("whsec_PRIVATE_A", payload)

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_provider_error_is_sanitized(self, create):
        create.side_effect = RuntimeError(
            "stripe diagnostic sk_test_PRIVATE_A whsec_PRIVATE_A"
        )

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = str(response.data)
        self.assertNotIn("sk_test_PRIVATE_A", payload)
        self.assertNotIn("whsec_PRIVATE_A", payload)
        self.assertIn("Payment provider request failed", payload)

    def test_create_session_rejects_zero_amount_before_stripe_call(self):
        self.booking_a.total_amount = Decimal("0.00")
        self.booking_a.balance_due = Decimal("0.00")
        self.booking_a.save(update_fields=["total_amount", "balance_due"])

        with patch("ticketing.views.stripe.checkout.Session.create") as create:
            response = self.client.post(
                self.create_url(),
                {"booking_id": self.booking_a.pk, "payment_type": "full"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        create.assert_not_called()

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_repeated_same_checkout_session_does_not_duplicate_payment(self, create):
        create.return_value = SimpleNamespace(
            id="cs_idempotent_A",
            url="https://checkout.stripe.test/cs_idempotent_A",
            payment_status="unpaid",
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
                provider="stripe",
                provider_checkout_id="cs_idempotent_A",
            ).count(),
            1,
        )

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_create_session_live_tenant_currency_isolated(self, create):
        create.return_value = SimpleNamespace(
            id="cs_live_B",
            url="https://checkout.stripe.test/cs_live_B",
            payment_status="unpaid",
        )

        response = self.client.post(
            self.create_url(self.org_b),
            {"booking_id": self.booking_b.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            create.call_args.kwargs["line_items"][0]["price_data"]["currency"],
            "eur",
        )
        self.assertEqual(
            create.call_args.kwargs["metadata"]["organisation_id"],
            str(self.org_b.pk),
        )

    def test_confirm_requires_session_id(self):
        with patch("ticketing.views.stripe.checkout.Session.retrieve") as retrieve:
            response = self.client.post(
                self.confirm_url(),
                {},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        retrieve.assert_not_called()

    def test_confirm_rejects_missing_stripe_configuration(self):
        self.provider_a.stripe_secret_key = ""
        self.provider_a.save(update_fields=["stripe_secret_key"])

        with patch("ticketing.views.stripe.checkout.Session.retrieve") as retrieve:
            response = self.client.post(
                self.confirm_url(),
                {"session_id": "cs_missing_config"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        retrieve.assert_not_called()

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_provider_error_is_sanitized(self, retrieve):
        retrieve.side_effect = RuntimeError(
            "stripe retrieve sk_test_PRIVATE_A whsec_PRIVATE_A"
        )

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_error_A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        payload = str(response.data)
        self.assertNotIn("sk_test_PRIVATE_A", payload)
        self.assertNotIn("whsec_PRIVATE_A", payload)
        self.assertIn("Payment provider request failed", payload)

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_rejects_metadata_for_other_tenant(self, retrieve):
        retrieve.return_value = self.session_obj(
            session_id="cs_foreign_metadata",
            payment_status="paid",
            amount_total=12000,
            booking=self.booking_a,
            organisation=self.org_b,
        )

        response = self.client.post(
            self.confirm_url(self.org_a),
            {"session_id": "cs_foreign_metadata"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_cannot_resolve_foreign_tenant_booking(self, retrieve):
        retrieve.return_value = self.session_obj(
            session_id="cs_foreign_booking",
            payment_status="paid",
            amount_total=22000,
            booking=self.booking_b,
            organisation=self.org_a,
        )

        response = self.client.post(
            self.confirm_url(self.org_a),
            {"session_id": "cs_foreign_booking"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_can_fallback_to_same_tenant_pending_payment_by_session_id(
        self,
        retrieve,
    ):
        payment = BookingPayment.objects.create(
            booking=self.booking_a,
            amount=Decimal("30.00"),
            payment_type="deposit",
            payer_type="customer",
            method="stripe",
            status="pending",
            provider="stripe",
            provider_checkout_id="cs_fallback_A",
        )
        retrieve.return_value = {
            "id": "cs_fallback_A",
            "payment_status": "unpaid",
            "amount_total": 3000,
            "metadata": {},
            "payment_intent": "",
        }

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_fallback_A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertEqual(response.data["confirmed"], False)
        self.assertEqual(response.data["booking"]["id"], self.booking_a.pk)

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_pending_session_does_not_call_finance(self, retrieve):
        retrieve.return_value = self.session_obj(
            session_id="cs_pending_A",
            payment_status="unpaid",
            amount_total=12000,
            booking=self.booking_a,
            organisation=self.org_a,
        )

        with patch(
            "ticketing.views.booking_finance.mark_booking_payment_confirmed"
        ) as mark_confirmed:
            response = self.client.post(
                self.confirm_url(),
                {"session_id": "cs_pending_A"},
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        self.assertFalse(response.data["confirmed"])
        mark_confirmed.assert_not_called()

    @patch("ticketing.views.booking_finance.mark_booking_payment_confirmed")
    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_paid_session_calls_finance_with_exact_metadata(
        self,
        retrieve,
        mark_confirmed,
    ):
        existing_payment = BookingPayment.objects.create(
            booking=self.booking_a,
            amount=Decimal("30.00"),
            payment_type="deposit",
            payer_type="customer",
            method="stripe",
            status="pending",
            provider="stripe",
            provider_checkout_id="cs_paid_A",
        )
        retrieve.return_value = self.session_obj(
            session_id="cs_paid_A",
            payment_status="paid",
            amount_total=3000,
            booking=self.booking_a,
            organisation=self.org_a,
            payment_type="deposit",
            payment_intent="pi_paid_A",
        )
        mark_confirmed.return_value = (existing_payment, self.booking_a)

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_paid_A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = mark_confirmed.call_args.kwargs
        self.assertEqual(kwargs["booking"].pk, self.booking_a.pk)
        self.assertEqual(kwargs["amount"], Decimal("30"))
        self.assertEqual(kwargs["provider"], "stripe")
        self.assertEqual(kwargs["payment_type"], "deposit")
        self.assertEqual(kwargs["provider_payment_id"], "pi_paid_A")
        self.assertEqual(kwargs["provider_checkout_id"], "cs_paid_A")
        self.assertEqual(kwargs["provider_status"], "paid")

    @patch("ticketing.views.booking_finance.mark_booking_payment_confirmed")
    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_paid_response_does_not_expose_internal_booking_finance(
        self,
        retrieve,
        mark_confirmed,
    ):
        payment = BookingPayment.objects.create(
            booking=self.booking_a,
            amount=Decimal("120.00"),
            payment_type="full",
            payer_type="customer",
            method="stripe",
            status="pending",
            provider="stripe",
            provider_checkout_id="cs_safe_A",
        )
        retrieve.return_value = self.session_obj(
            session_id="cs_safe_A",
            payment_status="paid",
            amount_total=12000,
            booking=self.booking_a,
            organisation=self.org_a,
            payment_type="full",
            payment_intent="pi_safe_A",
        )
        mark_confirmed.return_value = (payment, self.booking_a)

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_safe_A"},
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

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_confirm_pending_response_does_not_expose_internal_booking_finance(
        self,
        retrieve,
    ):
        retrieve.return_value = self.session_obj(
            session_id="cs_pending_safe_A",
            payment_status="unpaid",
            amount_total=12000,
            booking=self.booking_a,
            organisation=self.org_a,
        )

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_pending_safe_A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_202_ACCEPTED)
        payload = str(response.data)
        self.assertNotIn("cost_price", payload)
        self.assertNotIn("profit_per_unit", payload)
        self.assertNotIn("payments", payload)
        self.assertNotIn("commissions", payload)

    @patch("ticketing.views.stripe.checkout.Session.create")
    def test_unpublished_site_rejects_create_session_before_stripe_call(self, create):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.create_url(),
            {"booking_id": self.booking_a.pk},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        create.assert_not_called()

    @patch("ticketing.views.stripe.checkout.Session.retrieve")
    def test_unpublished_site_rejects_confirm_before_stripe_call(self, retrieve):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.confirm_url(),
            {"session_id": "cs_unpublished_A"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        retrieve.assert_not_called()
