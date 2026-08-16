"""Public, tenant-scoped customer itinerary cart-session API tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from organisations.models import Organisation
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.models import ExperienceProduct


class PublicCustomerCartSessionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="public-cart-session-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Excursions",
            slug="public-cart-session-other-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="public-cart-session-saona",
            product_type="excursion",
            adult_price=Decimal("90.00"),
            status="active",
            is_active=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095552001",
        )
        self.approval_message = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.public-cart-approved",
            text="Yes, this itinerary is correct.",
        )

    def endpoint(self, organisation=None):
        return reverse(
            "ticketing-public-customer-cart-session-resolve",
            kwargs={
                "organisation_slug": (
                    organisation or self.organisation
                ).slug,
            },
        )

    def make_cart(
        self,
        *,
        ready=True,
        status=CustomerItineraryCart.STATUS_ACTIVE,
        expires_at=None,
    ):
        token, token_hash = CustomerItineraryCart.generate_token()
        now = timezone.now()
        cart = CustomerItineraryCart.objects.create(
            organisation=self.organisation,
            conversation=self.conversation,
            token_hash=token_hash,
            idempotency_key=f"public-cart:{token_hash}",
            status=status,
            language="en",
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("80.00"),
            promotion_snapshot=[
                {
                    "promotion_id": 7,
                    "name": "Two Tour Offer",
                    "discount_amount": "10.00",
                    "currency": "USD",
                    "eligible_item_positions": [1],
                    "code": "PRIVATE-CODE",
                    "internal_rule": "do-not-expose",
                }
            ],
            customer_approved=ready,
            customer_approval_message=(
                self.approval_message if ready else None
            ),
            customer_approved_at=now if ready else None,
            itinerary_revalidated_at=now if ready else None,
            age_restrictions_validated_at=now if ready else None,
            expires_at=expires_at or now + timedelta(hours=2),
        )
        CustomerItineraryCartItem.objects.create(
            cart=cart,
            position=1,
            product=self.product,
            service_date=date.today() + timedelta(days=7),
            adults=2,
            children=1,
            infants=0,
            selected_external_option_id="standard",
            product_name_snapshot="Saona Island",
            option_name_snapshot="Standard",
            pickup_name_snapshot="Hotel lobby",
            unit_price_snapshot=Decimal("30.00"),
            line_subtotal=Decimal("90.00"),
            line_discount=Decimal("10.00"),
            line_total=Decimal("80.00"),
            currency="USD",
            availability_snapshot={
                "available": True,
                "supplier_internal_reference": "PRIVATE",
            },
        )
        return token, cart

    def test_valid_token_returns_checkout_safe_cart(self):
        token, cart = self.make_cart()

        response = self.client.post(
            self.endpoint(),
            {"token": token},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["success"])
        payload = response.data["cart"]
        self.assertEqual(payload["cart_id"], cart.pk)
        self.assertEqual(payload["organisation"]["slug"], self.organisation.slug)
        self.assertEqual(payload["total"], Decimal("80.00"))
        self.assertTrue(payload["can_checkout"])
        self.assertEqual(len(payload["items"]), 1)
        self.assertEqual(payload["items"][0]["product_slug"], self.product.slug)
        self.assertEqual(
            payload["items"][0]["product_url"],
            self.product.current_public_path,
        )
        self.assertEqual(response["Cache-Control"], "no-store, private")
        self.assertEqual(response["Pragma"], "no-cache")

    def test_response_does_not_expose_sensitive_fields(self):
        token, _cart = self.make_cart()

        response = self.client.post(
            self.endpoint(),
            {"token": token},
            format="json",
        )

        cart_payload = response.data["cart"]
        forbidden_cart_fields = {
            "conversation",
            "conversation_id",
            "token",
            "token_hash",
            "idempotency_key",
            "customer_approval_message",
            "customer_approval_message_id",
        }
        self.assertTrue(forbidden_cart_fields.isdisjoint(cart_payload))
        self.assertNotIn("availability_snapshot", cart_payload["items"][0])
        self.assertNotIn("code", cart_payload["promotions"][0])
        self.assertNotIn("internal_rule", cart_payload["promotions"][0])

    def test_token_cannot_be_resolved_through_another_tenant(self):
        token, _cart = self.make_cart()

        response = self.client.post(
            self.endpoint(self.other_organisation),
            {"token": token},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "invalid_token")

    def test_unknown_token_returns_generic_not_found(self):
        response = self.client.post(
            self.endpoint(),
            {"token": "unknown-public-cart-token-123456789"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "invalid_token")
        self.assertNotIn("organisation", response.data)

    def test_missing_or_malformed_token_is_rejected(self):
        for body in ({}, {"token": "short"}, {"token": 12345}):
            with self.subTest(body=body):
                response = self.client.post(self.endpoint(), body, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.data["code"], "invalid_request")

    def test_expired_cart_is_rejected(self):
        token, _cart = self.make_cart(
            expires_at=timezone.now() - timedelta(seconds=1),
        )

        response = self.client.post(
            self.endpoint(),
            {"token": token},
            format="json",
        )

        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.data["code"], "cart_expired")

    def test_non_active_cart_is_rejected(self):
        for cart_status in (
            CustomerItineraryCart.STATUS_CONVERTED,
            CustomerItineraryCart.STATUS_ABANDONED,
        ):
            with self.subTest(status=cart_status):
                token, _cart = self.make_cart(status=cart_status)
                response = self.client.post(
                    self.endpoint(),
                    {"token": token},
                    format="json",
                )
                self.assertEqual(response.status_code, 409)
                self.assertEqual(response.data["code"], "cart_unavailable")

    def test_cart_without_checkout_confirmations_is_rejected(self):
        token, _cart = self.make_cart(ready=False)

        response = self.client.post(
            self.endpoint(),
            {"token": token},
            format="json",
        )

        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "cart_not_ready")

    def test_inactive_or_unknown_organisation_is_not_enumerable(self):
        token, _cart = self.make_cart()
        self.organisation.is_active = False
        self.organisation.save(update_fields=["is_active"])

        inactive_response = self.client.post(
            self.endpoint(),
            {"token": token},
            format="json",
        )
        unknown_response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": "unknown-tenant"},
            ),
            {"token": token},
            format="json",
        )

        self.assertEqual(inactive_response.status_code, 404)
        self.assertEqual(unknown_response.status_code, 404)
        self.assertEqual(inactive_response.data, unknown_response.data)
