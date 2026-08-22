"""Public Customer AI cart-session API coverage.

Covers bearer-token resolution and conversion boundaries: tenant isolation,
token hashing, cart status/expiry/readiness, no-store caching, public payload
whitelists, unpublished-site boundary, checkout-field validation, browser
financial-field injection, conversion service tenant binding, idempotent
conversion responses, and safe repository/provider errors.

External AI/payment/provider services are never called.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.utils import timezone
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.customer_cart_conversion_service import (
    CustomerCartConversionChangedError,
    CustomerCartConversionNotFoundError,
    CustomerCartConversionRepositoryError,
    CustomerCartConversionValidationError,
)
from ticketing.models import (
    Booking,
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicCustomerAIAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Customer AI Organisation A",
            slug="customer-ai-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Customer AI Organisation B",
            slug="customer-ai-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Customer AI Site A",
            custom_domain="customer-ai-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Customer AI Site B",
            custom_domain="customer-ai-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Customer AI Product A",
            slug="customer-ai-product-a",
            sku="CUSTOMER-AI-A",
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
            name="Foreign Customer AI Product",
            slug="foreign-customer-ai-product",
            sku="CUSTOMER-AI-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
            adult_price=Decimal("200.00"),
        )

        cls.conversation_a = CustomerAIConversation.objects.create(
            organisation=cls.org_a,
            channel="webchat",
            external_customer_id="web-customer-a",
            status="active",
            language="en",
            customer_name="Customer A",
            adults=1,
        )
        cls.conversation_b = CustomerAIConversation.objects.create(
            organisation=cls.org_b,
            channel="webchat",
            external_customer_id="web-customer-b",
            status="active",
            language="en",
            customer_name="Customer B",
            adults=1,
        )

        cls.approval_a = CustomerAIMessage.objects.create(
            conversation=cls.conversation_a,
            direction="inbound",
            role="customer",
            external_message_id="approval-a",
            text="Yes, book this itinerary.",
        )
        cls.approval_b = CustomerAIMessage.objects.create(
            conversation=cls.conversation_b,
            direction="inbound",
            role="customer",
            external_message_id="approval-b",
            text="Yes.",
        )

        cls.token_a = "cart-session-token-A-abcdefghijklmnopqrstuvwxyz"
        cls.token_b = "cart-session-token-B-abcdefghijklmnopqrstuvwxyz"

        now = timezone.now()

        cls.cart_a = CustomerItineraryCart.objects.create(
            organisation=cls.org_a,
            conversation=cls.conversation_a,
            status="active",
            token_hash=CustomerItineraryCart.hash_token(cls.token_a),
            idempotency_key="customer-ai-cart-a",
            language="en",
            currency="USD",
            subtotal=Decimal("100.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("90.00"),
            promotion_snapshot=[
                {
                    "promotion_id": 10,
                    "name": "Public promo",
                    "description": "Save ten",
                    "discount_type": "fixed",
                    "discount_value": "10.00",
                    "discount_amount": "10.00",
                    "currency": "USD",
                    "eligible_item_positions": [1],
                    "internal_rule": "DO-NOT-EXPOSE",
                    "secret_notes": "PROMOTION-SECRET",
                }
            ],
            customer_approved=True,
            customer_approval_message=cls.approval_a,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=2),
        )
        cls.item_a = CustomerItineraryCartItem.objects.create(
            cart=cls.cart_a,
            position=1,
            product=cls.product_a,
            service_date=date.today() + timedelta(days=7),
            adults=1,
            children=0,
            infants=0,
            product_name_snapshot="Customer AI Product A",
            unit_price_snapshot=Decimal("100.00"),
            line_subtotal=Decimal("100.00"),
            line_discount=Decimal("10.00"),
            line_total=Decimal("90.00"),
            currency="USD",
            availability_snapshot={
                "provider_secret": "AVAILABILITY-SECRET",
                "internal_cost": "60.00",
            },
        )

        cls.cart_b = CustomerItineraryCart.objects.create(
            organisation=cls.org_b,
            conversation=cls.conversation_b,
            status="active",
            token_hash=CustomerItineraryCart.hash_token(cls.token_b),
            idempotency_key="customer-ai-cart-b",
            language="en",
            currency="USD",
            subtotal=Decimal("200.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("200.00"),
            customer_approved=True,
            customer_approval_message=cls.approval_b,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=2),
        )
        CustomerItineraryCartItem.objects.create(
            cart=cls.cart_b,
            position=1,
            product=cls.product_b,
            service_date=date.today() + timedelta(days=7),
            adults=1,
            product_name_snapshot="Foreign Customer AI Product",
            unit_price_snapshot=Decimal("200.00"),
            line_subtotal=Decimal("200.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("200.00"),
            currency="USD",
        )

        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Converted Customer",
            customer_email="converted@example.test",
            customer_hotel="Hotel A",
            service_date=date.today() + timedelta(days=7),
            adults=1,
            status="pending_payment",
            payment_status="unpaid",
            payment_mode="pending_payment",
            payment_method="none",
            subtotal_amount=Decimal("90.00"),
            total_amount=Decimal("90.00"),
            deposit_required=Decimal("20.00"),
            balance_due=Decimal("90.00"),
            seller_margin_percent=Decimal("25.00"),
            owner_net_amount=Decimal("50.00"),
            external_raw_response={"secret": "BOOKING-RAW-SECRET"},
        )

    def resolve_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-customer-cart-session-resolve",
            kwargs={"organisation_slug": organisation.slug},
        )

    def convert_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-customer-cart-session-convert",
            kwargs={"organisation_slug": organisation.slug},
        )

    def checkout_payload(self, **overrides):
        payload = {
            "token": self.token_a,
            "full_name": "Checkout Customer",
            "whatsapp": "+18095550101",
            "email": "checkout@example.test",
            "hotel_name": "Hotel A",
            "notes": "Customer checkout note",
            "payment_choice": "pending",
        }
        payload.update(overrides)
        return payload

    def test_public_customer_ai_routes_reverse(self):
        self.assertEqual(
            self.resolve_url(),
            f"/api/ticketing/public/{self.org_a.slug}/customer-cart-session/resolve/",
        )
        self.assertEqual(
            self.convert_url(),
            f"/api/ticketing/public/{self.org_a.slug}/customer-cart-session/convert/",
        )

    def test_resolve_requires_valid_token_shape(self):
        response = self.client.post(
            self.resolve_url(),
            {"token": "short"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "invalid_request")

    def test_resolve_valid_token_is_tenant_bound(self):
        response = self.client.post(
            self.resolve_url(self.org_a),
            {"token": self.token_b},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "invalid_token")
        payload = str(response.data)
        self.assertNotIn(self.org_b.name, payload)
        self.assertNotIn(self.product_b.name, payload)

    def test_resolve_returns_public_cart_without_token_or_hash(self):
        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["success"])
        cart = response.data["cart"]
        self.assertEqual(cart["cart_id"], self.cart_a.pk)
        self.assertEqual(cart["organisation"]["slug"], self.org_a.slug)

        payload = str(response.data)
        self.assertNotIn(self.token_a, payload)
        self.assertNotIn(self.cart_a.token_hash, payload)
        self.assertNotIn("token_hash", payload)
        self.assertNotIn("idempotency_key", payload)

    def test_resolve_public_item_uses_server_snapshots_and_hides_internal_availability(self):
        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        item = response.data["cart"]["items"][0]
        self.assertEqual(item["unit_price_snapshot"], Decimal("100.00"))
        self.assertEqual(item["line_total"], Decimal("90.00"))
        self.assertEqual(item["product_id"], self.product_a.pk)

        payload = str(response.data)
        self.assertNotIn("AVAILABILITY-SECRET", payload)
        self.assertNotIn("availability_snapshot", payload)
        self.assertNotIn("cost_price", payload)

    def test_resolve_promotions_are_whitelisted(self):
        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        promotion = response.data["cart"]["promotions"][0]
        self.assertEqual(promotion["name"], "Public promo")
        self.assertNotIn("internal_rule", promotion)
        self.assertNotIn("secret_notes", promotion)
        self.assertNotIn("PROMOTION-SECRET", str(response.data))

    def test_resolve_sets_sensitive_no_cache_headers(self):
        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response["Cache-Control"], "no-store, private")
        self.assertEqual(response["Pragma"], "no-cache")

    def test_resolve_expired_cart_returns_410(self):
        self.cart_a.expires_at = timezone.now() - timedelta(seconds=1)
        self.cart_a.save(update_fields=["expires_at"])

        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_410_GONE)
        self.assertEqual(response.data["code"], "cart_expired")

    def test_resolve_non_active_cart_returns_conflict(self):
        self.cart_a.status = "abandoned"
        self.cart_a.save(update_fields=["status"])

        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_unavailable")

    def test_resolve_not_ready_cart_returns_conflict(self):
        self.cart_a.customer_approved = False
        self.cart_a.save(update_fields=["customer_approved"])

        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data["code"], "cart_not_ready")

    def test_unpublished_site_cannot_resolve_cart(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.product_a.name, str(response.data))

    def test_convert_validates_customer_input_before_service(self):
        with patch(
            "ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert"
        ) as convert:
            response = self.client.post(
                self.convert_url(),
                {
                    "token": self.token_a,
                    "full_name": "",
                    "whatsapp": "",
                    "email": "not-an-email",
                },
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "invalid_request")
        convert.assert_not_called()

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_binds_service_to_url_organisation_and_customer_fields_only(
        self,
        convert,
    ):
        convert.return_value = SimpleNamespace(
            created=True,
            booking=self.booking_a,
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(
                total_amount="0.01",
                subtotal_amount="0.01",
                discount_amount="999.00",
                seller_margin_percent="99.00",
                owner_net_amount="0.00",
                organisation=self.org_b.pk,
                product_id=self.product_b.pk,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        kwargs = convert.call_args.kwargs
        self.assertEqual(kwargs["organisation"].pk, self.org_a.pk)
        self.assertEqual(kwargs["raw_token"], self.token_a)
        checkout = kwargs["checkout"]
        self.assertEqual(checkout.customer_name, "Checkout Customer")
        self.assertEqual(checkout.customer_email, "checkout@example.test")
        self.assertEqual(checkout.payment_choice, "pending")

        # Browser financial/product/tenant fields never enter checkout details.
        checkout_payload = vars(checkout)
        self.assertNotIn("total_amount", checkout_payload)
        self.assertNotIn("seller_margin_percent", checkout_payload)
        self.assertNotIn("organisation", checkout_payload)
        self.assertNotIn("product_id", checkout_payload)

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_cross_tenant_token_not_found_is_generic(self, convert):
        convert.side_effect = CustomerCartConversionNotFoundError()

        response = self.client.post(
            self.convert_url(self.org_a),
            self.checkout_payload(token=self.token_b),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "invalid_token")
        payload = str(response.data)
        self.assertNotIn(self.org_b.name, payload)
        self.assertNotIn(self.token_b, payload)

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_created_response_uses_public_booking_whitelist(self, convert):
        convert.return_value = SimpleNamespace(
            created=True,
            booking=self.booking_a,
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["created"])
        booking = response.data["booking"]
        self.assertEqual(booking["booking_code"], self.booking_a.booking_code)

        payload = str(response.data)
        for internal_field in (
            "seller_margin_percent",
            "seller_commission_amount",
            "owner_net_amount",
            "owner_received_amount",
            "seller_collected_amount",
            "seller_due_to_company",
            "commissions",
            "payments",
            "external_raw_response",
            "external_validation_response",
            "cost_price",
            "profit_per_unit",
        ):
            with self.subTest(internal_field=internal_field):
                self.assertNotIn(internal_field, payload)

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_idempotent_existing_booking_returns_200(self, convert):
        convert.return_value = SimpleNamespace(
            created=False,
            booking=self.booking_a,
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["created"])
        self.assertEqual(
            response.data["booking"]["id"],
            self.booking_a.pk,
        )

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_changed_cart_returns_sanitized_conflict(self, convert):
        convert.side_effect = CustomerCartConversionChangedError(
            "The cart changed. Review it before checkout."
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(response.data["success"])
        self.assertNotIn(self.cart_a.token_hash, str(response.data))

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_validation_error_returns_conflict(self, convert):
        convert.side_effect = CustomerCartConversionValidationError(
            "Cart is no longer valid."
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertFalse(response.data["success"])

    @patch("ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert")
    def test_convert_repository_error_is_sanitized(self, convert):
        convert.side_effect = CustomerCartConversionRepositoryError(
            "database PRIVATE internal details"
        )

        response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        payload = str(response.data)
        self.assertNotIn("database PRIVATE internal details", payload)
        self.assertEqual(response.data["code"], "cart_conversion_unavailable")

    def test_unpublished_site_cannot_convert_cart(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        with patch(
            "ticketing.customer_ai_views.DjangoCustomerCartConversionService.convert"
        ) as convert:
            response = self.client.post(
                self.convert_url(),
                self.checkout_payload(),
                format="json",
            )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        convert.assert_not_called()

    def test_inactive_organisation_cannot_resolve_or_convert(self):
        self.org_a.is_active = False
        self.org_a.save(update_fields=["is_active"])

        resolve_response = self.client.post(
            self.resolve_url(),
            {"token": self.token_a},
            format="json",
        )
        convert_response = self.client.post(
            self.convert_url(),
            self.checkout_payload(),
            format="json",
        )

        self.assertEqual(resolve_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(convert_response.status_code, status.HTTP_404_NOT_FOUND)
