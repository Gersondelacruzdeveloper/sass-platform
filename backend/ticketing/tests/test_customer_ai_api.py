"""Customer AI, handoff, and itinerary-cart API coverage.

All AI/provider-facing application services are mocked at the view import
boundary. These tests never contact OpenAI, Meta, email providers, or any live
external service.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.models import Booking, ExperienceProduct


class CustomerAIAPITests(APITestCase):
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
        cls.inactive_org = Organisation.objects.create(
            name="Customer AI Inactive",
            slug="customer-ai-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="customer-ai-owner-a",
            email="customer-ai-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.viewer_a = User.objects.create_user(
            username="customer-ai-viewer-a",
            email="customer-ai-viewer-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.inactive_member_a = User.objects.create_user(
            username="customer-ai-inactive-member",
            email="customer-ai-inactive-member@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.owner_b = User.objects.create_user(
            username="customer-ai-owner-b",
            email="customer-ai-owner-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.inactive_owner = User.objects.create_user(
            username="customer-ai-inactive-owner",
            email="customer-ai-inactive-owner@example.test",
            password="Strong-test-password-123",
            organisation=cls.inactive_org,
        )

        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.org_a,
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
            user=cls.inactive_member_a,
            organisation=cls.org_a,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=cls.owner_b,
            organisation=cls.org_b,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_owner,
            organisation=cls.inactive_org,
            role="owner",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="AI Product A",
            slug="ai-product-a",
            sku="AI-A",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="AI Product B",
            slug="ai-product-b",
            sku="AI-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.conversation_a = CustomerAIConversation.objects.create(
            organisation=cls.org_a,
            channel="webchat",
            external_customer_id="customer-a",
            customer_name="Customer A",
            hotel_name="Hotel A",
            status="active",
        )
        cls.conversation_b = CustomerAIConversation.objects.create(
            organisation=cls.org_b,
            channel="webchat",
            external_customer_id="customer-b",
            customer_name="Foreign Customer",
            hotel_name="Foreign Hotel",
            status="active",
        )
        cls.message_a = CustomerAIMessage.objects.create(
            conversation=cls.conversation_a,
            direction="inbound",
            role="customer",
            external_message_id="msg-a",
            text="I approve this itinerary.",
        )
        cls.message_b = CustomerAIMessage.objects.create(
            conversation=cls.conversation_b,
            direction="inbound",
            role="customer",
            external_message_id="msg-b",
            text="Foreign private message",
        )

        cls.handoff_a = CustomerAIHandoff.objects.create(
            organisation=cls.org_a,
            conversation=cls.conversation_a,
            status="pending",
            category="booking_help",
            priority="normal",
            reason="Customer requested human help",
            idempotency_key="handoff-a-0001",
        )
        cls.handoff_b = CustomerAIHandoff.objects.create(
            organisation=cls.org_b,
            conversation=cls.conversation_b,
            status="pending",
            category="booking_help",
            priority="urgent",
            reason="Foreign handoff",
            idempotency_key="handoff-b-0001",
        )

        cls.raw_token_a = "customer-cart-token-a-1234567890"
        cls.raw_token_b = "customer-cart-token-b-1234567890"
        now = timezone.now()
        cls.cart_a = CustomerItineraryCart.objects.create(
            organisation=cls.org_a,
            conversation=cls.conversation_a,
            status="active",
            token_hash=CustomerItineraryCart.hash_token(cls.raw_token_a),
            idempotency_key="cart-a-idempotency",
            language="en",
            currency="USD",
            subtotal=Decimal("100.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("100.00"),
            promotion_snapshot=[],
            customer_approved=True,
            customer_approval_message=cls.message_a,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=1),
        )
        cls.cart_b = CustomerItineraryCart.objects.create(
            organisation=cls.org_b,
            conversation=cls.conversation_b,
            status="active",
            token_hash=CustomerItineraryCart.hash_token(cls.raw_token_b),
            idempotency_key="cart-b-idempotency",
            language="en",
            currency="USD",
            subtotal=Decimal("200.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("200.00"),
            customer_approved=True,
            customer_approval_message=cls.message_b,
            customer_approved_at=now,
            itinerary_revalidated_at=now,
            age_restrictions_validated_at=now,
            expires_at=now + timedelta(hours=1),
        )
        cls.cart_item_a = CustomerItineraryCartItem.objects.create(
            cart=cls.cart_a,
            position=1,
            product=cls.product_a,
            service_date=date.today() + timedelta(days=5),
            adults=1,
            children=0,
            infants=0,
            product_name_snapshot=cls.product_a.name,
            unit_price_snapshot=Decimal("100.00"),
            line_subtotal=Decimal("100.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("100.00"),
            currency="USD",
        )
        cls.cart_item_b = CustomerItineraryCartItem.objects.create(
            cart=cls.cart_b,
            position=1,
            product=cls.product_b,
            service_date=date.today() + timedelta(days=5),
            adults=1,
            children=0,
            infants=0,
            product_name_snapshot=cls.product_b.name,
            unit_price_snapshot=Decimal("200.00"),
            line_subtotal=Decimal("200.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("200.00"),
            currency="USD",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def test_customer_ai_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-customer-ai-conversations-list"),
            "/api/ticketing/customer-ai/conversations/",
        )
        self.assertEqual(
            reverse("ticketing-customer-ai-handoffs-list"),
            "/api/ticketing/customer-ai/handoffs/",
        )
        self.assertEqual(
            reverse("ticketing-customer-ai-carts-list"),
            "/api/ticketing/customer-ai/carts/",
        )
        self.assertEqual(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            f"/api/ticketing/public/{self.org_a.slug}/customer-cart-session/resolve/",
        )

    def test_staff_customer_ai_endpoints_require_authentication(self):
        for name in (
            "ticketing-customer-ai-conversations-list",
            "ticketing-customer-ai-handoffs-list",
            "ticketing-customer-ai-carts-list",
        ):
            with self.subTest(name=name):
                response = self.client.get(reverse(name))
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_viewer_role_is_denied_customer_ai_staff_access(self):
        self.authenticate(self.viewer_a)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_membership_and_inactive_organisation_are_rejected(self):
        for user in (self.inactive_member_a, self.inactive_owner):
            self.authenticate(user)
            response = self.client.get(
                reverse("ticketing-customer-ai-conversations-list")
            )
            self.assertIn(
                response.status_code,
                (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN),
            )
            self.client.force_authenticate(user=None)

    def test_conversation_list_is_tenant_scoped(self):
        self.authenticate(self.owner_a)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list")
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.conversation_a.pk, ids)
        self.assertNotIn(self.conversation_b.pk, ids)
        self.assertNotIn("Foreign Customer", str(response.data))

    def test_conversation_detail_hides_foreign_tenant_object(self):
        self.authenticate(self.owner_a)
        response = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-detail",
                args=[self.conversation_b.pk],
            )
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Foreign private message", str(getattr(response, "data", "")))

    def test_conversation_messages_are_scoped_through_parent_conversation(self):
        self.authenticate(self.owner_a)
        response = self.client.get(
            reverse(
                "ticketing-customer-ai-conversations-messages",
                args=[self.conversation_a.pk],
            )
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn("I approve this itinerary.", payload)
        self.assertNotIn("Foreign private message", payload)

    def test_handoff_list_and_detail_are_tenant_scoped(self):
        self.authenticate(self.owner_a)
        listed = self.client.get(
            reverse("ticketing-customer-ai-handoffs-list")
        )
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(self.handoff_a.pk, self.ids(listed))
        self.assertNotIn(self.handoff_b.pk, self.ids(listed))

        foreign = self.client.get(
            reverse(
                "ticketing-customer-ai-handoffs-detail",
                args=[self.handoff_b.pk],
            )
        )
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    def test_cart_list_and_detail_are_tenant_scoped(self):
        self.authenticate(self.owner_a)
        listed = self.client.get(reverse("ticketing-customer-ai-carts-list"))
        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(self.cart_a.pk, self.ids(listed))
        self.assertNotIn(self.cart_b.pk, self.ids(listed))

        foreign = self.client.get(
            reverse("ticketing-customer-ai-carts-detail", args=[self.cart_b.pk])
        )
        self.assertEqual(foreign.status_code, status.HTTP_404_NOT_FOUND)

    @patch("ticketing.customer_ai_views._handoff_service")
    def test_handoff_assign_uses_mocked_service_boundary(self, service_factory):
        self.authenticate(self.owner_a)
        service = Mock()
        assigned = CustomerAIHandoff.objects.get(pk=self.handoff_a.pk)
        assigned.status = "assigned"
        assigned.assigned_to = self.owner_a
        service.assign_to_staff.return_value = (assigned, self.conversation_a)
        service_factory.return_value = service

        response = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-assign",
                args=[self.handoff_a.pk],
            ),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        service.assign_to_staff.assert_called_once()
        self.assertNotIn("openai", str(response.data).lower())

    @patch("ticketing.customer_ai_views._handoff_service")
    def test_foreign_handoff_never_reaches_service(self, service_factory):
        self.authenticate(self.owner_a)
        response = self.client.post(
            reverse(
                "ticketing-customer-ai-handoffs-assign",
                args=[self.handoff_b.pk],
            ),
            {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        service_factory.assert_not_called()

    def test_public_cart_resolve_rejects_short_token(self):
        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": "short"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["code"], "invalid_request")
        self.assertEqual(response["Cache-Control"], "no-store, private")

    def test_public_cart_resolve_is_tenant_bound(self):
        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": self.raw_token_b},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "invalid_token")
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_public_cart_resolve_success_never_exposes_token_hash(self):
        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": self.raw_token_a},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.product_a.name, payload)
        self.assertNotIn(self.cart_a.token_hash, payload)
        self.assertNotIn(self.raw_token_a, payload)
        self.assertEqual(response["Cache-Control"], "no-store, private")

    def test_public_cart_resolve_expired_cart_returns_gone(self):
        self.cart_a.expires_at = timezone.now() - timedelta(seconds=1)
        self.cart_a.save(update_fields=["expires_at"])

        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": self.raw_token_a},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_410_GONE)
        self.assertEqual(response.data["code"], "cart_expired")

    @patch(
        "ticketing.customer_ai_views.DjangoCustomerCartConversionService"
    )
    def test_public_cart_convert_calls_mocked_conversion_service(
        self,
        service_cls,
    ):
        booking = Booking.objects.create(
            organisation=self.org_a,
            primary_product=self.product_a,
            customer_name="Converted Customer",
            customer_email="converted@example.test",
            customer_hotel="Hotel A",
            adults=1,
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
            status="pending",
        )
        service = Mock()
        service.convert.return_value = SimpleNamespace(
            created=True,
            booking=booking,
        )
        service_cls.return_value = service

        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-convert",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {
                "token": self.raw_token_a,
                "full_name": "Converted Customer",
                "whatsapp": "+18095550199",
                "email": "converted@example.test",
                "hotel_name": "Hotel A",
                "payment_choice": "pending",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        service.convert.assert_called_once()
        kwargs = service.convert.call_args.kwargs
        self.assertEqual(kwargs["organisation"].pk, self.org_a.pk)
        self.assertEqual(kwargs["raw_token"], self.raw_token_a)
        self.assertEqual(response["Cache-Control"], "no-store, private")
        self.assertNotIn(self.cart_a.token_hash, str(response.data))

    @patch(
        "ticketing.customer_ai_views.DjangoCustomerCartConversionService"
    )
    def test_public_cart_convert_invalid_payload_never_calls_service(
        self,
        service_cls,
    ):
        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-convert",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": "short", "email": "not-email"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        service_cls.assert_not_called()

    @patch(
        "ticketing.customer_ai_views.DjangoCustomerCartConversionService"
    )
    def test_public_cart_convert_inactive_or_foreign_slug_never_changes_tenant(
        self,
        service_cls,
    ):
        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-convert",
                kwargs={"organisation_slug": self.inactive_org.slug},
            ),
            {
                "token": self.raw_token_a,
                "full_name": "Customer",
                "whatsapp": "+18095550199",
                "email": "customer@example.test",
                "payment_choice": "pending",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        service_cls.assert_not_called()

    def test_public_cart_response_whitelists_promotion_fields(self):
        self.cart_a.promotion_snapshot = [
            {
                "promotion_id": 1,
                "name": "Summer",
                "description": "Public",
                "discount_type": "percentage",
                "discount_value": "10.00",
                "discount_amount": "10.00",
                "currency": "USD",
                "eligible_item_positions": [1],
                "internal_rule_secret": "DO-NOT-EXPOSE",
            }
        ]
        self.cart_a.save(update_fields=["promotion_snapshot"])

        response = self.client.post(
            reverse(
                "ticketing-public-customer-cart-session-resolve",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"token": self.raw_token_a},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("DO-NOT-EXPOSE", str(response.data))

    def test_customer_ai_filters_cannot_expand_tenant_scope(self):
        self.authenticate(self.owner_a)
        response = self.client.get(
            reverse("ticketing-customer-ai-conversations-list"),
            {"search": "Foreign", "status": "active", "channel": "webchat"},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(self.conversation_b.pk, self.ids(response))
        self.assertNotIn("Foreign Customer", str(response.data))
