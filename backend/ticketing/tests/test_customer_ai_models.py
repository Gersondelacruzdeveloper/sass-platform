"""Database and validation tests for the customer AI persistence models."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.models import ExperienceProduct


class CustomerAIModelTests(TestCase):
    """Exercise application validation and database-level invariants."""

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="punta-cana-discovery-test",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Another Tours Company",
            slug="another-tours-company-test",
            business_type="ticketing",
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-island-test",
            product_type="excursion",
            adult_price=Decimal("90.00"),
            status="active",
            is_active=True,
        )
        cls.other_product = ExperienceProduct.objects.create(
            organisation=cls.other_organisation,
            name="Other Organisation Tour",
            slug="other-organisation-tour-test",
            product_type="excursion",
            adult_price=Decimal("50.00"),
            status="active",
            is_active=True,
        )

    def make_conversation(
        self,
        *,
        organisation=None,
        customer_id="18095550101",
        status=CustomerAIConversation.STATUS_ACTIVE,
        channel=CustomerAIConversation.CHANNEL_WHATSAPP,
    ):
        return CustomerAIConversation.objects.create(
            organisation=organisation or self.organisation,
            channel=channel,
            external_customer_id=customer_id,
            status=status,
        )

    def make_message(
        self,
        conversation,
        *,
        external_id="wamid.test.1",
        direction=CustomerAIMessage.DIRECTION_INBOUND,
        role=CustomerAIMessage.ROLE_CUSTOMER,
        text="I would like Saona.",
    ):
        return CustomerAIMessage.objects.create(
            conversation=conversation,
            direction=direction,
            role=role,
            external_message_id=external_id,
            text=text,
        )

    def make_cart(
        self,
        conversation,
        *,
        organisation=None,
        idempotency_key="cart:test:1",
        subtotal=Decimal("90.00"),
        discount=Decimal("10.00"),
        total=Decimal("80.00"),
        expires_at=None,
    ):
        _public_token, token_hash = CustomerItineraryCart.generate_token()
        return CustomerItineraryCart.objects.create(
            organisation=organisation or self.organisation,
            conversation=conversation,
            token_hash=token_hash,
            idempotency_key=idempotency_key,
            currency="USD",
            subtotal=subtotal,
            discount_total=discount,
            total=total,
            expires_at=expires_at or timezone.now() + timedelta(hours=2),
        )

    def make_item(
        self,
        cart,
        *,
        product=None,
        position=1,
        currency="USD",
        adults=1,
        subtotal=Decimal("90.00"),
        discount=Decimal("10.00"),
        total=Decimal("80.00"),
    ):
        return CustomerItineraryCartItem.objects.create(
            cart=cart,
            position=position,
            product=product or self.product,
            service_date=date.today() + timedelta(days=7),
            adults=adults,
            product_name_snapshot="Saona Island",
            unit_price_snapshot=Decimal("90.00"),
            line_subtotal=subtotal,
            line_discount=discount,
            line_total=total,
            currency=currency,
        )

    def test_conversation_defaults_and_ai_reply_status(self):
        conversation = self.make_conversation()

        self.assertEqual(conversation.status, CustomerAIConversation.STATUS_ACTIVE)
        self.assertEqual(conversation.interests, [])
        self.assertTrue(conversation.ai_may_reply)

        conversation.status = CustomerAIConversation.STATUS_HANDOFF_REQUESTED
        self.assertFalse(conversation.ai_may_reply)
        conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.assertFalse(conversation.ai_may_reply)
        conversation.status = CustomerAIConversation.STATUS_CLOSED
        self.assertFalse(conversation.ai_may_reply)

    def test_conversation_rejects_invalid_dates_and_interests(self):
        invalid_dates = CustomerAIConversation(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550102",
            travel_start_date=date(2026, 8, 20),
            travel_end_date=date(2026, 8, 19),
        )

        with self.assertRaises(ValidationError) as context:
            invalid_dates.full_clean()
        self.assertIn("travel_end_date", context.exception.message_dict)

        invalid_interests = CustomerAIConversation(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550102",
            interests={"beach": True},
        )
        with self.assertRaises(ValidationError) as context:
            invalid_interests.full_clean()
        self.assertIn("interests", context.exception.message_dict)

    def test_only_one_open_conversation_per_tenant_channel_customer(self):
        first = self.make_conversation(customer_id="18095550103")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_conversation(customer_id="18095550103")

        first.status = CustomerAIConversation.STATUS_CLOSED
        first.closed_at = timezone.now()
        first.save(update_fields=("status", "closed_at", "updated_at"))
        replacement = self.make_conversation(customer_id="18095550103")

        other_tenant = self.make_conversation(
            organisation=self.other_organisation,
            customer_id="18095550103",
        )
        self.assertNotEqual(replacement.pk, first.pk)
        self.assertNotEqual(other_tenant.organisation_id, replacement.organisation_id)

    def test_conversation_database_party_limit(self):
        with self.assertRaises(IntegrityError), transaction.atomic():
            CustomerAIConversation.objects.create(
                organisation=self.organisation,
                channel=CustomerAIConversation.CHANNEL_WHATSAPP,
                external_customer_id="18095550104",
                adults=101,
            )

    def test_message_validates_metadata_and_deduplicates_inbound_ids(self):
        conversation = self.make_conversation(customer_id="18095550105")
        message = CustomerAIMessage(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.duplicate",
            metadata=["not", "an", "object"],
        )
        with self.assertRaises(ValidationError) as context:
            message.full_clean()
        self.assertIn("metadata", context.exception.message_dict)

        self.make_message(conversation, external_id="wamid.duplicate")
        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_message(conversation, external_id="wamid.duplicate")

        outbound = self.make_message(
            conversation,
            external_id="wamid.duplicate",
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            text="Saona is available on Thursday.",
        )
        self.assertIsNotNone(outbound.pk)

    def test_handoff_rejects_cross_tenant_conversation(self):
        conversation = self.make_conversation(customer_id="18095550106")
        handoff = CustomerAIHandoff(
            organisation=self.other_organisation,
            conversation=conversation,
            category="customer_request",
            reason="Customer requested a person.",
            idempotency_key="handoff:test:cross-tenant",
        )

        with self.assertRaises(ValidationError) as context:
            handoff.full_clean()
        self.assertIn("conversation", context.exception.message_dict)

    def test_handoff_idempotency_is_unique_within_organisation(self):
        first_conversation = self.make_conversation(customer_id="18095550107")
        second_conversation = self.make_conversation(customer_id="18095550108")
        CustomerAIHandoff.objects.create(
            organisation=self.organisation,
            conversation=first_conversation,
            category="customer_request",
            reason="Customer requested help.",
            idempotency_key="handoff:test:same-key",
        )

        with self.assertRaises(IntegrityError), transaction.atomic():
            CustomerAIHandoff.objects.create(
                organisation=self.organisation,
                conversation=second_conversation,
                category="customer_request",
                reason="Another request.",
                idempotency_key="handoff:test:same-key",
            )

    def test_cart_token_generation_stores_only_sha256_hash(self):
        public_token, token_hash = CustomerItineraryCart.generate_token()

        self.assertTrue(public_token)
        self.assertEqual(len(token_hash), 64)
        self.assertNotEqual(public_token, token_hash)
        self.assertEqual(CustomerItineraryCart.hash_token(public_token), token_hash)
        with self.assertRaises(ValueError):
            CustomerItineraryCart.hash_token("  ")

    def test_cart_rejects_cross_tenant_conversation(self):
        conversation = self.make_conversation(customer_id="18095550109")
        cart = self.make_cart(
            conversation,
            organisation=self.other_organisation,
            idempotency_key="cart:test:cross-tenant",
        )

        with self.assertRaises(ValidationError) as context:
            cart.full_clean()
        self.assertIn("conversation", context.exception.message_dict)

    def test_approved_cart_requires_matching_inbound_evidence(self):
        conversation = self.make_conversation(customer_id="18095550110")
        cart = self.make_cart(conversation, idempotency_key="cart:test:approval")
        cart.customer_approved = True

        with self.assertRaises(ValidationError) as context:
            cart.full_clean()
        self.assertIn("customer_approval_message", context.exception.message_dict)

        outbound = self.make_message(
            conversation,
            external_id="wamid.outbound.approval",
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
        )
        cart.customer_approval_message = outbound
        with self.assertRaises(ValidationError) as context:
            cart.full_clean()
        self.assertIn("customer_approval_message", context.exception.message_dict)

    def test_cart_checkout_gate_requires_all_confirmations(self):
        conversation = self.make_conversation(customer_id="18095550111")
        approval = self.make_message(
            conversation,
            external_id="wamid.cart.approved",
            text="Yes, that itinerary is correct.",
        )
        cart = self.make_cart(conversation, idempotency_key="cart:test:checkout")
        self.assertFalse(cart.can_checkout)

        now = timezone.now()
        cart.customer_approved = True
        cart.customer_approval_message = approval
        cart.customer_approved_at = now
        cart.itinerary_revalidated_at = now
        cart.age_restrictions_validated_at = now
        cart.full_clean()
        self.assertTrue(cart.can_checkout)

        cart.status = CustomerItineraryCart.STATUS_CONVERTED
        self.assertFalse(cart.can_checkout)

    def test_expired_cart_cannot_checkout(self):
        conversation = self.make_conversation(customer_id="18095550112")
        cart = self.make_cart(
            conversation,
            idempotency_key="cart:test:expired",
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        cart.customer_approved = True
        cart.customer_approval_message_id = 999
        cart.itinerary_revalidated_at = timezone.now()
        cart.age_restrictions_validated_at = timezone.now()

        self.assertTrue(cart.is_expired)
        self.assertFalse(cart.can_checkout)

    def test_cart_database_rejects_bad_totals_and_duplicate_keys(self):
        conversation = self.make_conversation(customer_id="18095550113")
        self.make_cart(conversation, idempotency_key="cart:test:unique")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_cart(conversation, idempotency_key="cart:test:unique")

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_cart(
                conversation,
                idempotency_key="cart:test:bad-total",
                subtotal=Decimal("90.00"),
                discount=Decimal("10.00"),
                total=Decimal("79.99"),
            )

    def test_cart_item_rejects_cross_tenant_product_and_currency(self):
        conversation = self.make_conversation(customer_id="18095550114")
        cart = self.make_cart(conversation, idempotency_key="cart:test:item-validation")
        cross_tenant_item = CustomerItineraryCartItem(
            cart=cart,
            position=1,
            product=self.other_product,
            service_date=date.today() + timedelta(days=7),
            adults=1,
            product_name_snapshot="Wrong Tenant Tour",
            unit_price_snapshot=Decimal("50.00"),
            line_subtotal=Decimal("50.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("50.00"),
            currency="USD",
        )

        with self.assertRaises(ValidationError) as context:
            cross_tenant_item.full_clean()
        self.assertIn("product", context.exception.message_dict)

        wrong_currency_item = CustomerItineraryCartItem(
            cart=cart,
            position=1,
            product=self.product,
            service_date=date.today() + timedelta(days=7),
            adults=1,
            product_name_snapshot="Saona Island",
            unit_price_snapshot=Decimal("50.00"),
            line_subtotal=Decimal("50.00"),
            line_discount=Decimal("0.00"),
            line_total=Decimal("50.00"),
            currency="EUR",
        )
        with self.assertRaises(ValidationError) as context:
            wrong_currency_item.full_clean()
        self.assertIn("currency", context.exception.message_dict)

    def test_cart_item_database_constraints_and_ordering(self):
        conversation = self.make_conversation(customer_id="18095550115")
        cart = self.make_cart(conversation, idempotency_key="cart:test:items")
        second = self.make_item(cart, position=2)
        first = self.make_item(cart, position=1)
        self.assertEqual(list(cart.items.all()), [first, second])

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_item(cart, position=1)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_item(cart, position=3, adults=0)

        with self.assertRaises(IntegrityError), transaction.atomic():
            self.make_item(
                cart,
                position=4,
                subtotal=Decimal("90.00"),
                discount=Decimal("10.00"),
                total=Decimal("79.00"),
            )

    def test_product_is_protected_while_referenced_by_cart_item(self):
        conversation = self.make_conversation(customer_id="18095550116")
        cart = self.make_cart(conversation, idempotency_key="cart:test:protect")
        self.make_item(cart)

        with self.assertRaises(ProtectedError):
            self.product.delete()

    def test_deleting_conversation_cascades_customer_ai_records(self):
        conversation = self.make_conversation(customer_id="18095550117")
        conversation_id = conversation.pk
        message = self.make_message(conversation, external_id="wamid.cascade")
        CustomerAIHandoff.objects.create(
            organisation=self.organisation,
            conversation=conversation,
            category="customer_request",
            reason="Customer requested assistance.",
            idempotency_key="handoff:test:cascade",
        )
        cart = self.make_cart(conversation, idempotency_key="cart:test:cascade")
        self.make_item(cart)

        conversation.delete()

        self.assertFalse(CustomerAIMessage.objects.filter(pk=message.pk).exists())
        self.assertFalse(CustomerAIHandoff.objects.filter(conversation_id=conversation_id).exists())
        self.assertFalse(CustomerItineraryCart.objects.filter(pk=cart.pk).exists())
