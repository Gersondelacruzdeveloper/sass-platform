"""Public receipt surface coverage.

There is currently no dedicated unauthenticated endpoint that resolves
Receipt.public_url_token. Receipt CRUD is private. The public receipt surface
is the restricted receipt reference embedded in public booking confirmation.

These tests protect that contract: private CRUD authentication/tenant scope,
safe receipt reference exposure, snapshot/provider secrecy, cross-tenant
isolation, unpublished-site boundary, and token non-enumerability.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Organisation, Membership
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    BookingPayment,
    ExperienceProduct,
    Receipt,
    TicketingPublicSiteSettings,
)


class PublicReceiptAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Receipt Organisation A",
            slug="receipt-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Receipt Organisation B",
            slug="receipt-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Receipt Site A",
            custom_domain="receipt-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Receipt Site B",
            custom_domain="receipt-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Receipt Product A",
            slug="receipt-product-a",
            sku="RECEIPT-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Receipt Product",
            slug="foreign-receipt-product",
            sku="RECEIPT-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
            adult_price=Decimal("200.00"),
            adult_cost_price=Decimal("120.00"),
        )

        service_date = date.today() + timedelta(days=7)

        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Receipt Customer A",
            customer_email="receipt-a@example.test",
            customer_whatsapp="+18095550101",
            customer_hotel="Hotel A",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="paid",
            subtotal_amount=Decimal("100.00"),
            total_amount=Decimal("100.00"),
            deposit_required=Decimal("20.00"),
            deposit_paid=Decimal("100.00"),
            balance_due=Decimal("0.00"),
        )
        cls.booking_b = Booking.objects.create(
            organisation=cls.org_b,
            primary_product=cls.product_b,
            customer_name="Foreign Receipt Customer",
            customer_email="receipt-b@example.test",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="paid",
            subtotal_amount=Decimal("200.00"),
            total_amount=Decimal("200.00"),
            deposit_paid=Decimal("200.00"),
            balance_due=Decimal("0.00"),
        )

        cls.receipt_a = Receipt.objects.create(
            booking=cls.booking_a,
            receipt_data={
                "booking_code": cls.booking_a.booking_code,
                "provider_secret": "RECEIPT-A-PROVIDER-SECRET",
                "payment_internal": "RECEIPT-A-INTERNAL-PAYMENT",
                "cost_price": "60.00",
                "profit": "40.00",
            },
            sent_by_email=True,
            sent_by_whatsapp=True,
        )
        cls.receipt_b = Receipt.objects.create(
            booking=cls.booking_b,
            receipt_data={
                "provider_secret": "FOREIGN-RECEIPT-SECRET",
            },
        )

        cls.payment_a = BookingPayment.objects.create(
            booking=cls.booking_a,
            amount=Decimal("100.00"),
            payment_type="full",
            payer_type="customer",
            method="stripe",
            status="confirmed",
            provider="stripe",
            provider_checkout_id="cs_RECEIPT_PRIVATE",
            provider_payment_id="pi_RECEIPT_PRIVATE",
            provider_status="paid",
            provider_response={
                "client_secret": "STRIPE-CLIENT-SECRET-PRIVATE",
            },
            reference="PRIVATE-RECEIPT-PAYMENT-REFERENCE",
            note="Private receipt payment note",
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="receipt-owner-a",
            email="receipt-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        Membership.objects.create(
            organisation=cls.org_a,
            user=cls.owner_a,
            role="owner",
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def confirmation_url(self, booking=None, organisation=None):
        booking = booking or self.booking_a
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-booking-confirmation",
            kwargs={
                "organisation_slug": organisation.slug,
                "booking_code": booking.booking_code,
            },
        )

    def test_receipt_crud_endpoint_is_not_public(self):
        response = self.client.get(reverse("ticketing-receipts-list"))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
            ),
        )

    def test_receipt_crud_detail_is_not_public_even_with_known_receipt_id(self):
        response = self.client.get(
            reverse("ticketing-receipts-detail", args=[self.receipt_a.pk])
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("RECEIPT-A-PROVIDER-SECRET", payload)

    def test_private_receipt_list_is_tenant_scoped_for_owner(self):
        self.client.force_authenticate(self.owner_a)

        response = self.client.get(reverse("ticketing-receipts-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in self.rows(response)}
        self.assertIn(self.receipt_a.pk, ids)
        self.assertNotIn(self.receipt_b.pk, ids)

    def test_public_confirmation_exposes_only_safe_receipt_reference(self):
        response = self.client.get(self.confirmation_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        receipt = response.data[0]["receipt"]

        self.assertEqual(
            set(receipt.keys()),
            {"receipt_number", "public_url_token"},
        )
        self.assertEqual(
            receipt["receipt_number"],
            self.receipt_a.receipt_number,
        )
        self.assertEqual(
            receipt["public_url_token"],
            self.receipt_a.public_url_token,
        )

    def test_public_confirmation_never_exposes_receipt_snapshot(self):
        response = self.client.get(self.confirmation_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "RECEIPT-A-PROVIDER-SECRET",
            "RECEIPT-A-INTERNAL-PAYMENT",
            "STRIPE-CLIENT-SECRET-PRIVATE",
            "PRIVATE-RECEIPT-PAYMENT-REFERENCE",
            "Private receipt payment note",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "receipt_data",
            "provider_response",
            "payments",
            "provider_checkout_id",
            "provider_payment_id",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, payload)

    def test_public_receipt_reference_does_not_expose_pdf_or_delivery_metadata(self):
        response = self.client.get(self.confirmation_url())
        receipt = response.data[0]["receipt"]

        for field_name in (
            "pdf_file",
            "sent_by_email",
            "sent_by_whatsapp",
            "email_sent_at",
            "whatsapp_sent_at",
            "created_at",
            "booking",
            "customer_name",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, receipt)

    def test_public_confirmation_cannot_expose_foreign_receipt(self):
        response = self.client.get(
            self.confirmation_url(
                booking=self.booking_b,
                organisation=self.org_a,
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])
        payload = str(response.data)
        self.assertNotIn(self.receipt_b.receipt_number, payload)
        self.assertNotIn(self.receipt_b.public_url_token, payload)
        self.assertNotIn("FOREIGN-RECEIPT-SECRET", payload)

    def test_public_receipt_tokens_are_distinct_between_tenants(self):
        self.assertTrue(self.receipt_a.public_url_token)
        self.assertTrue(self.receipt_b.public_url_token)
        self.assertNotEqual(
            self.receipt_a.public_url_token,
            self.receipt_b.public_url_token,
        )

    def test_public_receipt_token_is_not_accepted_by_private_receipt_detail_route(self):
        # The private router resolves receipts by numeric pk. A public token
        # must not turn the private CRUD endpoint into an unauthenticated
        # token lookup.
        response = self.client.get(
            f"/api/ticketing/receipts/{self.receipt_a.public_url_token}/"
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("RECEIPT-A-PROVIDER-SECRET", payload)

    def test_unpublished_site_cannot_expose_receipt_reference(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.confirmation_url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.receipt_a.receipt_number, payload)
        self.assertNotIn(self.receipt_a.public_url_token, payload)

    def test_inactive_organisation_cannot_expose_receipt_reference(self):
        self.org_a.is_active = False
        self.org_a.save(update_fields=["is_active"])

        response = self.client.get(self.confirmation_url())

        self.assertIn(
            response.status_code,
            (
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.receipt_a.public_url_token, payload)

    def test_receipt_token_and_number_are_not_present_without_receipt(self):
        booking = Booking.objects.create(
            organisation=self.org_a,
            primary_product=self.product_a,
            customer_name="No Receipt Customer",
            customer_email="no-receipt@example.test",
            service_date=self.booking_a.service_date,
            adults=1,
            status="confirmed",
            payment_status="unpaid",
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
        )

        response = self.client.get(self.confirmation_url(booking=booking))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNone(response.data[0]["receipt"])

    def test_public_confirmation_product_does_not_reveal_receipt_cost_snapshot(self):
        response = self.client.get(self.confirmation_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn('"cost_price": "60.00"', payload)
        self.assertNotIn("RECEIPT-A-INTERNAL-PAYMENT", payload)
