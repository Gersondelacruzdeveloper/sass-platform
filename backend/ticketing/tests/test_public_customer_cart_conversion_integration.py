"""End-to-end public Customer AI cart conversion integration tests.

Unlike the boundary/unit suites, these tests do not mock
DjangoCustomerCartConversionService or DjangoCustomerCartValidator. They
exercise the public endpoint through live tenant/product availability,
promotion evaluation, BookingSerializer persistence, cart consumption, and
idempotent replay.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.models import (
    Booking,
    ExperienceProduct,
    ProductAvailability,
    TicketingPublicSiteSettings,
)


class PublicCustomerCartConversionIntegrationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Customer Cart Integration A",
            slug="customer-cart-integration-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Customer Cart Integration B",
            slug="customer-cart-integration-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Customer Cart Integration Site A",
            custom_domain="customer-cart-integration-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Customer Cart Integration Site B",
            custom_domain="customer-cart-integration-b.example.test",
            is_published=True,
        )

        cls.service_date = date.today() + timedelta(days=10)

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Integration Excursion A",
            slug="integration-excursion-a",
            sku="CART-INTEGRATION-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=False,
            requires_pickup_location=False,
            adult_price=Decimal("100.00"),
            child_price=Decimal("50.00"),
            infant_price=Decimal("0.00"),
            base_price=Decimal("100.00"),
            deposit_amount=Decimal("25.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Integration Excursion",
            slug="foreign-integration-excursion",
            sku="CART-INTEGRATION-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=False,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        ProductAvailability.objects.create(
            product=cls.product_a,
            date=cls.service_date,
            available_capacity=20,
            booked_quantity=0,
            price_override=Decimal("100.00"),
            is_available=True,
        )
        ProductAvailability.objects.create(
            product=cls.product_b,
            date=cls.service_date,
            available_capacity=20,
            booked_quantity=0,
            price_override=Decimal("200.00"),
            is_available=True,
        )

    def setUp(self):
        self.conversation_a = CustomerAIConversation.objects.create(
            organisation=self.org_a,
            channel=CustomerAIConversation.CHANNEL_WEBCHAT,
            external_customer_id=f"integration-a-{timezone.now().timestamp()}",
            status=CustomerAIConversation.STATUS_ACTIVE,
            language="en",
            customer_name="Integration Customer",
            adults=1,
        )
        self.approval_a = CustomerAIMessage.objects.create(
            conversation=self.conversation_a,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id=f"approval-{self.conversation_a.pk}",
            text="Yes, I approve this exact itinerary.",
        )

        self.token_a, token_hash = CustomerItineraryCart.generate_token()
        now = timezone.now()
        self.cart_a = CustomerItineraryCart.objects.create(
            organisation=self.org_a,
            conversation=self.conversation_a,
            status=CustomerItineraryCart.STATUS_ACTIVE,
            token_hash=token_hash,
            idempotency_key=f"integration-cart-{self.conversation_a.pk}",
            language="en",
            currency="USD",
            subtotal=Decimal("100.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("100.00"),
            promotion_snapshot=[],
            customer_approved=True,
            customer_approval_message=self.approval_a,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=2),
        )
        self.item_a = CustomerItineraryCartItem.objects.create(
            cart=self.cart_a,
            position=1,
            product=self.product_a,
            service_date=self.service_date,
            adults=1,
            children=0,
            infants=0,
            product_name_snapshot=self.product_a.name,
            unit_price_snapshot=Decimal("100.00"),
            line_subtotal=Decimal("100.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("100.00"),
            currency="USD",
            availability_snapshot={"status": "available"},
        )

        self.conversation_b = CustomerAIConversation.objects.create(
            organisation=self.org_b,
            channel=CustomerAIConversation.CHANNEL_WEBCHAT,
            external_customer_id=f"integration-b-{timezone.now().timestamp()}",
            status=CustomerAIConversation.STATUS_ACTIVE,
            language="en",
            customer_name="Foreign Integration Customer",
            adults=1,
        )
        approval_b = CustomerAIMessage.objects.create(
            conversation=self.conversation_b,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id=f"approval-b-{self.conversation_b.pk}",
            text="Yes.",
        )
        self.token_b, token_hash_b = CustomerItineraryCart.generate_token()
        self.cart_b = CustomerItineraryCart.objects.create(
            organisation=self.org_b,
            conversation=self.conversation_b,
            status=CustomerItineraryCart.STATUS_ACTIVE,
            token_hash=token_hash_b,
            idempotency_key=f"integration-cart-b-{self.conversation_b.pk}",
            language="en",
            currency="USD",
            subtotal=Decimal("200.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("200.00"),
            promotion_snapshot=[],
            customer_approved=True,
            customer_approval_message=approval_b,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=2),
        )
        CustomerItineraryCartItem.objects.create(
            cart=self.cart_b,
            position=1,
            product=self.product_b,
            service_date=self.service_date,
            adults=1,
            product_name_snapshot=self.product_b.name,
            unit_price_snapshot=Decimal("200.00"),
            line_subtotal=Decimal("200.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("200.00"),
            currency="USD",
        )

    def url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-customer-cart-session-convert",
            kwargs={"organisation_slug": organisation.slug},
        )

    def payload(self, **overrides):
        data = {
            "token": self.token_a,
            "full_name": "Jane Integration Customer",
            "whatsapp": "+18095553001",
            "email": "integration@example.test",
            "hotel_name": "Integration Hotel",
            "notes": "Vegetarian lunch",
            "payment_choice": "pending",
        }
        data.update(overrides)
        return data

    def test_real_conversion_creates_one_booking_and_consumes_cart(self):
        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["success"])
        self.assertTrue(response.data["created"])

        self.assertEqual(
            Booking.objects.filter(organisation=self.org_a).count(),
            1,
        )
        booking = Booking.objects.get(organisation=self.org_a)
        self.assertEqual(booking.customer_name, "Jane Integration Customer")
        self.assertEqual(booking.customer_email, "integration@example.test")
        self.assertEqual(booking.customer_hotel, "Integration Hotel")
        self.assertEqual(booking.service_date, self.service_date)
        self.assertEqual(booking.subtotal_amount, Decimal("100.00"))
        self.assertEqual(booking.discount_amount, Decimal("0.00"))
        self.assertEqual(booking.total_amount, Decimal("100.00"))
        self.assertEqual(booking.balance_due, Decimal("100.00"))
        self.assertEqual(booking.items.count(), 1)
        self.assertEqual(
            booking.items.get().unit_price,
            Decimal("100.00"),
        )

        self.cart_a.refresh_from_db()
        self.assertEqual(
            self.cart_a.status,
            CustomerItineraryCart.STATUS_CONVERTED,
        )
        self.assertEqual(self.cart_a.converted_booking_id, booking.pk)
        self.assertIsNotNone(self.cart_a.converted_at)

    def test_real_conversion_replay_is_idempotent(self):
        first = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )
        second = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(first.data["created"])
        self.assertFalse(second.data["created"])
        self.assertEqual(
            first.data["booking"]["id"],
            second.data["booking"]["id"],
        )
        self.assertEqual(
            Booking.objects.filter(organisation=self.org_a).count(),
            1,
        )

    def test_real_conversion_revalidates_current_backend_price(self):
        self.product_a.adult_price = Decimal("125.00")
        self.product_a.base_price = Decimal("125.00")
        self.product_a.save(update_fields=["adult_price", "base_price"])

        availability = ProductAvailability.objects.get(
            product=self.product_a,
            date=self.service_date,
        )
        availability.price_override = Decimal("125.00")
        availability.save(update_fields=["price_override"])

        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_changed")
        self.assertEqual(
            Booking.objects.filter(organisation=self.org_a).count(),
            0,
        )
        self.cart_a.refresh_from_db()
        self.assertEqual(
            self.cart_a.status,
            CustomerItineraryCart.STATUS_ACTIVE,
        )
        self.assertIsNone(self.cart_a.converted_booking_id)

    def test_real_conversion_rejects_product_that_is_no_longer_public(self):
        self.product_a.public_enabled = False
        self.product_a.save(update_fields=["public_enabled"])

        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_changed")
        self.assertEqual(Booking.objects.count(), 0)

    def test_real_conversion_rejects_inactive_product(self):
        self.product_a.is_active = False
        self.product_a.save(update_fields=["is_active"])

        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_changed")
        self.assertEqual(Booking.objects.count(), 0)

    def test_real_conversion_rejects_sold_out_availability(self):
        availability = ProductAvailability.objects.get(
            product=self.product_a,
            date=self.service_date,
        )
        availability.booked_quantity = availability.available_capacity
        availability.save(update_fields=["booked_quantity"])

        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_changed")
        self.assertEqual(Booking.objects.count(), 0)

    def test_real_conversion_token_cannot_cross_tenants(self):
        response = self.client.post(
            self.url(self.org_a),
            self.payload(token=self.token_b),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "invalid_token")
        self.assertEqual(Booking.objects.count(), 0)
        self.assertNotIn(self.org_b.name, str(response.data))

    def test_real_conversion_browser_cannot_override_cart_finance_or_product(self):
        response = self.client.post(
            self.url(),
            self.payload(
                subtotal_amount="0.01",
                total_amount="0.01",
                discount_amount="99.99",
                owner_net_amount="0.00",
                seller_margin_percent="99.00",
                organisation=self.org_b.pk,
                product_id=self.product_b.pk,
                primary_product=self.product_b.pk,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(organisation=self.org_a)
        self.assertEqual(booking.primary_product_id, self.product_a.pk)
        self.assertEqual(booking.subtotal_amount, Decimal("100.00"))
        self.assertEqual(booking.discount_amount, Decimal("0.00"))
        self.assertEqual(booking.total_amount, Decimal("100.00"))
        self.assertNotEqual(booking.organisation_id, self.org_b.pk)

    def test_real_deposit_choice_uses_backend_product_deposit(self):
        response = self.client.post(
            self.url(),
            self.payload(payment_choice="deposit"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(organisation=self.org_a)
        self.assertEqual(booking.deposit_required, Decimal("25.00"))
        self.assertEqual(booking.total_amount, Decimal("100.00"))

        payment = booking.payments.get()
        self.assertEqual(payment.amount, Decimal("25.00"))
        self.assertEqual(payment.status, "pending")
        self.assertEqual(payment.payment_type, "deposit")

    def test_real_pending_choice_does_not_create_confirmed_payment(self):
        response = self.client.post(
            self.url(),
            self.payload(payment_choice="pending"),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(organisation=self.org_a)
        self.assertEqual(booking.payment_status, "unpaid")
        self.assertEqual(booking.status, "pending_payment")
        self.assertFalse(
            booking.payments.filter(status="confirmed").exists()
        )

    def test_real_conversion_response_is_public_whitelist(self):
        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payload = str(response.data)

        for internal_field in (
            "seller_margin_percent",
            "seller_commission_amount",
            "owner_net_amount",
            "owner_received_amount",
            "seller_collected_amount",
            "seller_due_to_company",
            "external_raw_response",
            "external_validation_response",
            "commissions",
            "payments",
            "cost_price",
            "profit_per_unit",
        ):
            with self.subTest(internal_field=internal_field):
                self.assertNotIn(internal_field, payload)

    def test_unpublished_site_blocks_real_conversion_without_consuming_cart(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.url(),
            self.payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(Booking.objects.count(), 0)

        self.cart_a.refresh_from_db()
        self.assertEqual(
            self.cart_a.status,
            CustomerItineraryCart.STATUS_ACTIVE,
        )
        self.assertIsNone(self.cart_a.converted_booking_id)
