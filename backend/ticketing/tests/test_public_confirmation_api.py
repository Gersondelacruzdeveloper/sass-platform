"""Public booking confirmation API coverage.

Covers booking-code-only retrieval, tenant isolation, published-site boundary,
payment-state representation, safe receipt exposure, transfer fields, seller
public identity, and strict non-exposure of internal finance/provider data.

No external services are called.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    BookingPayment,
    ExperienceProduct,
    Receipt,
    Seller,
    TicketingPublicSiteSettings,
)


class PublicConfirmationAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Confirmation Organisation A",
            slug="confirmation-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Confirmation Organisation B",
            slug="confirmation-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Confirmation Site A",
            custom_domain="confirmation-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Confirmation Site B",
            custom_domain="confirmation-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Confirmation Product A",
            slug="confirmation-product-a",
            sku="CONFIRM-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("120.00"),
            cost_price=Decimal("65.00"),
            adult_price=Decimal("120.00"),
            adult_cost_price=Decimal("65.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Confirmation Product",
            slug="foreign-confirmation-product",
            sku="CONFIRM-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("220.00"),
            cost_price=Decimal("130.00"),
            adult_price=Decimal("220.00"),
            adult_cost_price=Decimal("130.00"),
        )

        User = get_user_model()
        cls.seller_user_a = User.objects.create_user(
            username="confirmation-seller-a",
            email="confirmation-seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a,
            full_name="Public Confirmation Seller",
            seller_slug="confirmation-seller",
            application_status="approved",
            is_active=True,
            commission_rate=Decimal("17.00"),
            default_margin_percent=Decimal("20.00"),
            max_customer_discount_percent=Decimal("10.00"),
            can_create_bookings=True,
            can_manage_settings=True,
            can_manage_integrations=True,
        )

        service_date = date.today() + timedelta(days=7)

        cls.unpaid = Booking.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a,
            primary_product=cls.product_a,
            source="seller_public_link",
            customer_name="Unpaid Customer",
            customer_whatsapp="+18095550101",
            customer_email="unpaid@example.test",
            customer_hotel="Hotel A",
            customer_notes="Public customer note",
            service_date=service_date,
            adults=1,
            status="pending_payment",
            payment_status="unpaid",
            payment_mode="pending_payment",
            payment_method="none",
            original_price=Decimal("120.00"),
            subtotal_amount=Decimal("120.00"),
            total_amount=Decimal("120.00"),
            deposit_required=Decimal("30.00"),
            deposit_paid=Decimal("0.00"),
            balance_due=Decimal("120.00"),
            seller_margin_percent=Decimal("20.00"),
            seller_commission_amount=Decimal("20.40"),
            owner_net_amount=Decimal("99.60"),
            external_provider="private-provider",
            external_reference="PRIVATE-REFERENCE-A",
            external_order_id="PRIVATE-ORDER-A",
            external_validation_response={"secret": "VALIDATION-SECRET-A"},
            external_raw_response={"secret": "RAW-SECRET-A"},
        )

        cls.deposit_paid = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Deposit Customer",
            customer_email="deposit@example.test",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="deposit_paid",
            payment_mode="customer_deposit_online",
            payment_method="stripe",
            subtotal_amount=Decimal("120.00"),
            total_amount=Decimal("120.00"),
            deposit_required=Decimal("30.00"),
            deposit_paid=Decimal("30.00"),
            balance_due=Decimal("90.00"),
        )

        cls.paid = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Paid Customer",
            customer_email="paid@example.test",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="paid",
            payment_mode="customer_full_online",
            payment_method="paypal",
            subtotal_amount=Decimal("120.00"),
            total_amount=Decimal("120.00"),
            deposit_required=Decimal("30.00"),
            deposit_paid=Decimal("120.00"),
            balance_due=Decimal("0.00"),
        )

        cls.transfer = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Transfer Customer",
            customer_email="transfer@example.test",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="unpaid",
            total_amount=Decimal("75.00"),
            balance_due=Decimal("75.00"),
            transfer_origin="PUJ Airport",
            transfer_destination="Hotel A",
            transfer_airport="PUJ",
            transfer_flight_number="AA123",
            transfer_vehicle_type="SUV",
            transfer_round_trip=True,
            transfer_return_date=service_date + timedelta(days=5),
            transfer_status="pending_assignment",
        )

        cls.foreign = Booking.objects.create(
            organisation=cls.org_b,
            primary_product=cls.product_b,
            customer_name="Foreign Confirmation Customer",
            customer_email="foreign-confirmation@example.test",
            service_date=service_date,
            adults=1,
            status="confirmed",
            payment_status="paid",
            subtotal_amount=Decimal("220.00"),
            total_amount=Decimal("220.00"),
            deposit_paid=Decimal("220.00"),
            balance_due=Decimal("0.00"),
        )

        cls.receipt = Receipt.objects.create(
            booking=cls.paid,
            receipt_data={
                "private_internal_snapshot": "RECEIPT-SNAPSHOT-SECRET",
                "provider_secret": "RECEIPT-PROVIDER-SECRET",
            },
            sent_by_email=True,
            sent_by_whatsapp=True,
        )

        cls.pending_payment_record = BookingPayment.objects.create(
            booking=cls.unpaid,
            amount=Decimal("30.00"),
            payment_type="deposit",
            payer_type="customer",
            method="stripe",
            status="pending",
            provider="stripe",
            provider_checkout_id="cs_PRIVATE_CONFIRMATION",
            provider_status="open",
            provider_response={
                "secret": "PROVIDER-RESPONSE-SECRET",
                "client_secret": "PAYMENT-CLIENT-SECRET",
            },
            reference="PRIVATE-PAYMENT-REFERENCE",
            note="Internal payment note",
        )

    def url(self, booking, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-booking-confirmation",
            kwargs={
                "organisation_slug": organisation.slug,
                "booking_code": booking.booking_code,
            },
        )

    def test_confirmation_url_reverses(self):
        self.assertEqual(
            self.url(self.unpaid),
            (
                f"/api/ticketing/public/{self.org_a.slug}/confirmation/"
                f"{self.unpaid.booking_code}/"
            ),
        )

    def test_confirmation_returns_exact_booking_code_only(self):
        response = self.client.get(self.url(self.unpaid))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.unpaid.pk)
        self.assertEqual(
            response.data[0]["booking_code"],
            self.unpaid.booking_code,
        )

    def test_confirmation_unknown_booking_code_returns_empty_result(self):
        response = self.client.get(
            reverse(
                "ticketing-public-booking-confirmation",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "booking_code": "PCD-DOES-NOT-EXIST",
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_confirmation_cannot_read_foreign_tenant_booking_code(self):
        response = self.client.get(
            self.url(self.foreign, organisation=self.org_a)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, [])

    def test_confirmation_unpaid_state_is_represented(self):
        response = self.client.get(self.url(self.unpaid))
        booking = response.data[0]

        self.assertEqual(booking["status"], "pending_payment")
        self.assertEqual(booking["payment_status"], "unpaid")
        self.assertEqual(booking["deposit_paid"], "0.00")
        self.assertEqual(booking["balance_due"], "120.00")
        self.assertFalse(booking["is_fully_paid"])

    def test_confirmation_deposit_paid_state_is_represented(self):
        response = self.client.get(self.url(self.deposit_paid))
        booking = response.data[0]

        self.assertEqual(booking["payment_status"], "deposit_paid")
        self.assertEqual(booking["deposit_required"], "30.00")
        self.assertEqual(booking["deposit_paid"], "30.00")
        self.assertEqual(booking["balance_due"], "90.00")
        self.assertFalse(booking["is_fully_paid"])

    def test_confirmation_paid_state_is_represented(self):
        response = self.client.get(self.url(self.paid))
        booking = response.data[0]

        self.assertEqual(booking["payment_status"], "paid")
        self.assertEqual(booking["deposit_paid"], "120.00")
        self.assertEqual(booking["balance_due"], "0.00")
        self.assertTrue(booking["is_fully_paid"])

    def test_confirmation_exposes_safe_receipt_reference_only(self):
        response = self.client.get(self.url(self.paid))
        receipt = response.data[0]["receipt"]

        self.assertEqual(receipt["receipt_number"], self.receipt.receipt_number)
        self.assertEqual(
            receipt["public_url_token"],
            self.receipt.public_url_token,
        )
        self.assertEqual(
            set(receipt.keys()),
            {"receipt_number", "public_url_token"},
        )

        payload = str(response.data)
        self.assertNotIn("RECEIPT-SNAPSHOT-SECRET", payload)
        self.assertNotIn("RECEIPT-PROVIDER-SECRET", payload)
        self.assertNotIn("receipt_data", payload)

    def test_confirmation_exposes_customer_facing_transfer_fields(self):
        response = self.client.get(self.url(self.transfer))
        booking = response.data[0]

        self.assertEqual(booking["transfer_origin"], "PUJ Airport")
        self.assertEqual(booking["transfer_destination"], "Hotel A")
        self.assertEqual(booking["transfer_airport"], "PUJ")
        self.assertEqual(booking["transfer_flight_number"], "AA123")
        self.assertEqual(booking["transfer_vehicle_type"], "SUV")
        self.assertTrue(booking["transfer_round_trip"])
        self.assertEqual(
            booking["transfer_status"],
            "pending_assignment",
        )

    def test_confirmation_seller_detail_is_public_identity_only(self):
        response = self.client.get(self.url(self.unpaid))
        seller = response.data[0]["seller_detail"]

        self.assertEqual(seller["id"], self.seller_a.pk)
        self.assertEqual(seller["full_name"], self.seller_a.full_name)
        self.assertEqual(seller["seller_slug"], self.seller_a.seller_slug)
        self.assertNotIn("commission_rate", seller)
        self.assertNotIn("permissions", seller)
        self.assertNotIn("can_manage_settings", seller)
        self.assertNotIn("can_manage_integrations", seller)

    def test_confirmation_product_detail_never_exposes_cost_or_profit(self):
        response = self.client.get(self.url(self.unpaid))
        product = response.data[0]["primary_product_detail"]

        for field_name in (
            "cost_price",
            "adult_cost_price",
            "child_cost_price",
            "infant_cost_price",
            "profit_per_unit",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, product)

    def test_confirmation_never_exposes_internal_booking_finance(self):
        response = self.client.get(self.url(self.unpaid))
        payload = str(response.data)

        for field_name in (
            "seller_margin_percent",
            "seller_commission_amount",
            "owner_net_amount",
            "owner_received_amount",
            "seller_collected_amount",
            "seller_due_to_company",
            "commission_paid_amount",
            "commission_pending_amount",
            "settlement_status",
            "payment_receiver",
            "requires_supervisor_approval",
            "supervisor_approved_by",
            "supervisor_notes",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, payload)

    def test_confirmation_never_exposes_provider_payloads_or_payment_records(self):
        response = self.client.get(self.url(self.unpaid))
        payload = str(response.data)

        for secret in (
            "PRIVATE-REFERENCE-A",
            "PRIVATE-ORDER-A",
            "VALIDATION-SECRET-A",
            "RAW-SECRET-A",
            "cs_PRIVATE_CONFIRMATION",
            "PROVIDER-RESPONSE-SECRET",
            "PAYMENT-CLIENT-SECRET",
            "PRIVATE-PAYMENT-REFERENCE",
            "Internal payment note",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        for field_name in (
            "external_provider",
            "external_reference",
            "external_order_id",
            "external_validation_response",
            "external_raw_response",
            "payments",
            "commissions",
            "provider_response",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, payload)

    def test_confirmation_public_payload_has_expected_top_level_fields(self):
        response = self.client.get(self.url(self.unpaid))
        booking = response.data[0]

        allowed = {
            "id",
            "booking_code",
            "seller",
            "seller_detail",
            "primary_product",
            "primary_product_detail",
            "source",
            "status",
            "payment_status",
            "payment_mode",
            "payment_method",
            "service_date",
            "service_time",
            "customer_name",
            "customer_whatsapp",
            "customer_email",
            "customer_hotel",
            "customer_notes",
            "adults",
            "children",
            "infants",
            "total_guests",
            "original_price",
            "subtotal_amount",
            "customer_discount_percent",
            "customer_discount_amount",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "deposit_required",
            "deposit_paid",
            "balance_due",
            "is_fully_paid",
            "transfer_origin",
            "transfer_destination",
            "transfer_airport",
            "transfer_flight_number",
            "transfer_vehicle_type",
            "transfer_round_trip",
            "transfer_return_date",
            "transfer_return_time",
            "transfer_status",
            "items",
            "receipt",
            "created_at",
            "confirmed_at",
        }
        self.assertEqual(set(booking.keys()), allowed)

    def test_unpublished_site_cannot_expose_confirmation(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.url(self.unpaid))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.unpaid.customer_email, payload)
        self.assertNotIn(self.unpaid.booking_code, payload)

    def test_inactive_organisation_cannot_expose_confirmation(self):
        self.org_a.is_active = False
        self.org_a.save(update_fields=["is_active"])

        response = self.client.get(self.url(self.unpaid))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.unpaid.customer_email, payload)
