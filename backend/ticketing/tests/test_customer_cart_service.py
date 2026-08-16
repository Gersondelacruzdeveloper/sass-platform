"""Tests for atomic, approval-gated customer itinerary cart persistence."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone as datetime_timezone
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from organisations.models import Organisation
from ticketing.ai.customer.cart_tools import (
    CartItemRequest,
    CustomerCartRepositoryError,
    CustomerCartValidationError,
    SaveCartRequest,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
)
from ticketing.customer_cart_service import DjangoCustomerCartService
from ticketing.models import ExperienceProduct


FIXED_NOW = datetime(2030, 8, 14, 12, 0, tzinfo=datetime_timezone.utc)
SERVICE_DATE = date(2026, 8, 21)


class FakeValidator:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def validate_for_checkout(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


class FakeCheckoutURLBuilder:
    def __init__(self, url="https://www.example.com/checkout/customer-cart"):
        self.url = url
        self.calls = []

    def build_checkout_url(self, **kwargs):
        self.calls.append(kwargs)
        token = kwargs["cart_token"]
        return f"{self.url}/{token}"


class FakeApprovalPolicy:
    def __init__(self, approved=True):
        self.approved = approved
        self.calls = []

    def is_explicit_approval(self, **kwargs):
        self.calls.append(kwargs)
        return self.approved


@override_settings(SECRET_KEY="customer-cart-test-secret")
class DjangoCustomerCartServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="customer-cart-service-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Excursions",
            slug="customer-cart-service-other-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="customer-cart-service-saona",
            product_type="excursion",
            adult_price=Decimal("90.00"),
            status="active",
            is_active=True,
        )
        cls.other_product = ExperienceProduct.objects.create(
            organisation=cls.other_organisation,
            name="Other Tenant Tour",
            slug="customer-cart-service-other-tour",
            product_type="excursion",
            adult_price=Decimal("50.00"),
            status="active",
            is_active=True,
        )

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095551001",
        )
        self.approval_message = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.customer-approved-cart",
            text="Yes, this itinerary is correct.",
            occurred_at=FIXED_NOW - timedelta(minutes=1),
        )
        self.request = self.make_request()
        self.validator = FakeValidator(self.valid_result())
        self.url_builder = FakeCheckoutURLBuilder()
        self.approval_policy = FakeApprovalPolicy()
        self.service = self.make_service()

    def make_service(self, *, lifetime=timedelta(hours=2)):
        return DjangoCustomerCartService(
            validator=self.validator,
            checkout_url_builder=self.url_builder,
            approval_policy=self.approval_policy,
            cart_lifetime=lifetime,
            clock=lambda: FIXED_NOW,
        )

    def make_request(
        self,
        *,
        cart_token=None,
        idempotency_key="cart-service:test:1",
        product_id=None,
        service_date=SERVICE_DATE,
        language="en",
    ):
        return SaveCartRequest(
            cart_token=cart_token,
            items=(
                CartItemRequest(
                    position=1,
                    product_id=product_id or self.product.pk,
                    service_date=service_date,
                    adults=1,
                    children=0,
                    infants=0,
                    package_id=None,
                    event_ticket_type_id=None,
                    selected_external_option_id=None,
                    pickup_location_id=None,
                ),
            ),
            language=language,
            customer_approved=True,
            idempotency_key=idempotency_key,
        )

    def valid_result(
        self,
        *,
        product=None,
        service_date=SERVICE_DATE,
        subtotal="90.00",
        discount="10.00",
        total="80.00",
        currency="USD",
        age_valid=True,
        availability_valid=True,
        pickup_valid=True,
        product_name="Saona Island",
    ):
        return {
            "lines": [
                {
                    "position": 1,
                    "product": product or self.product,
                    "service_date": service_date,
                    "adults": 1,
                    "children": 0,
                    "infants": 0,
                    "package_id": None,
                    "event_ticket_type_id": None,
                    "selected_external_option_id": "",
                    "pickup_location_id": None,
                    "product_name": product_name,
                    "option_name": "Standard",
                    "pickup_name": "Hotel lobby",
                    "pickup_time": None,
                    "unit_price": subtotal,
                    "subtotal": subtotal,
                    "discount": discount,
                    "total": total,
                    "currency": currency,
                    "availability_snapshot": {"available": True},
                }
            ],
            "currency": currency,
            "subtotal": subtotal,
            "discount_total": discount,
            "total": total,
            "promotion_snapshot": [{"code": "MULTI10", "amount": discount}],
            "age_restrictions_validated": age_valid,
            "availability_validated": availability_valid,
            "pickup_validated": pickup_valid,
        }

    def approval_metadata(self, **overrides):
        value = {
            "approval_message_id": self.approval_message.pk,
            "external_message_id": self.approval_message.external_message_id,
        }
        value.update(overrides)
        return value

    def save(self, *, request=None, metadata=None, organisation=None, conversation=None):
        return self.service.save_validated_cart(
            organisation=organisation or self.organisation,
            conversation=conversation or self.conversation,
            request=request or self.request,
            metadata=metadata if metadata is not None else self.approval_metadata(),
        )

    def test_constructor_requires_dependencies_and_valid_lifetime(self):
        with self.assertRaises(CustomerCartRepositoryError):
            DjangoCustomerCartService(
                validator=None,
                checkout_url_builder=self.url_builder,
                approval_policy=self.approval_policy,
            )
        with self.assertRaises(CustomerCartRepositoryError):
            self.make_service(lifetime=timedelta(0))
        with self.assertRaises(CustomerCartRepositoryError):
            self.make_service(lifetime=timedelta(hours=25))

    def test_new_cart_is_revalidated_and_persisted_without_booking_side_effects(self):
        result = self.save()

        cart = CustomerItineraryCart.objects.get()
        item = cart.items.get()
        self.assertEqual(result["status"], "active")
        self.assertEqual(result["organisation_id"], self.organisation.pk)
        self.assertEqual(result["conversation_id"], self.conversation.pk)
        self.assertEqual(result["item_count"], 1)
        self.assertEqual(result["subtotal"], "90.00")
        self.assertEqual(result["discount_total"], "10.00")
        self.assertEqual(result["total"], "80.00")
        self.assertFalse(result["booking_created"])
        self.assertFalse(result["payment_created"])
        self.assertFalse(result["inventory_reserved"])
        self.assertTrue(result["checkout_url"].startswith("https://"))
        self.assertTrue(cart.customer_approved)
        self.assertEqual(cart.customer_approval_message, self.approval_message)
        self.assertEqual(cart.expires_at, FIXED_NOW + timedelta(hours=2))
        self.assertEqual(item.product, self.product)
        self.assertEqual(item.product_name_snapshot, "Saona Island")
        self.assertEqual(item.line_total, Decimal("80.00"))
        self.assertEqual(len(self.validator.calls), 1)

    def test_public_token_is_returned_but_only_hash_is_stored(self):
        result = self.save()
        cart = CustomerItineraryCart.objects.get()

        self.assertNotEqual(cart.token_hash, result["cart_token"])
        self.assertEqual(
            cart.token_hash,
            CustomerItineraryCart.hash_token(result["cart_token"]),
        )

    def test_duplicate_idempotency_key_returns_same_cart_without_revalidation(self):
        first = self.save()
        second = self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 1)
        self.assertEqual(first["cart_token"], second["cart_token"])
        self.assertEqual(first["checkout_url"], second["checkout_url"])
        self.assertEqual(second["status"], "active")
        self.assertEqual(len(self.validator.calls), 1)

    def test_existing_token_can_update_same_cart_with_new_idempotency_key(self):
        first = self.save()
        self.validator.result = self.valid_result(
            subtotal="90.00",
            discount="15.00",
            total="75.00",
        )
        update_request = self.make_request(
            cart_token=first["cart_token"],
            idempotency_key="cart-service:test:update",
        )

        updated = self.save(request=update_request)
        cart = CustomerItineraryCart.objects.get()

        self.assertEqual(updated["status"], "updated")
        self.assertEqual(updated["cart_token"], first["cart_token"])
        self.assertEqual(updated["total"], "75.00")
        self.assertEqual(cart.idempotency_key, "cart-service:test:update")
        self.assertEqual(cart.items.count(), 1)
        self.assertEqual(len(self.validator.calls), 2)

    def test_missing_or_unverifiable_approval_message_is_rejected(self):
        with self.assertRaises(CustomerCartValidationError):
            self.save(metadata={})
        with self.assertRaises(CustomerCartValidationError):
            self.save(metadata={"approval_message_id": 999999})
        self.assertEqual(CustomerItineraryCart.objects.count(), 0)
        self.assertEqual(len(self.validator.calls), 0)

    def test_empty_or_outbound_message_cannot_prove_approval(self):
        empty = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.empty-approval",
            text="   ",
        )
        outbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            external_message_id="wamid.outbound-approval",
            text="Here is the itinerary.",
        )

        with self.assertRaises(CustomerCartValidationError):
            self.save(metadata={"approval_message_id": empty.pk})
        with self.assertRaises(CustomerCartValidationError):
            self.save(metadata={"approval_message_id": outbound.pk})
        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_approval_policy_must_accept_exact_itinerary(self):
        self.approval_policy.approved = False

        with self.assertRaises(CustomerCartValidationError):
            self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)
        self.assertEqual(len(self.validator.calls), 0)

    def test_staff_owned_conversation_cannot_create_or_change_cart(self):
        self.conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.conversation.save(update_fields=("status", "updated_at"))

        with self.assertRaises(CustomerCartValidationError):
            self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_cross_tenant_conversation_is_rejected(self):
        with self.assertRaises(CustomerCartValidationError):
            self.save(organisation=self.other_organisation)

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_all_authoritative_validations_are_required(self):
        for field in (
            "age_restrictions_validated",
            "availability_validated",
            "pickup_validated",
        ):
            result = self.valid_result()
            result[field] = False
            self.validator.result = result
            with self.subTest(field=field):
                with self.assertRaises(CustomerCartValidationError):
                    self.save(
                        request=self.make_request(
                            idempotency_key=f"cart-service:test:{field}"
                        )
                    )
        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_validator_must_return_reconciled_authoritative_totals(self):
        self.validator.result = self.valid_result(total="79.99")

        with self.assertRaises(CustomerCartRepositoryError):
            self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_validator_cannot_substitute_product_date_or_tenant(self):
        invalid_results = (
            self.valid_result(product=self.other_product),
            self.valid_result(service_date=SERVICE_DATE + timedelta(days=1)),
        )
        for index, invalid in enumerate(invalid_results, start=1):
            self.validator.result = invalid
            with self.subTest(case=index):
                with self.assertRaises(CustomerCartRepositoryError):
                    self.save(
                        request=self.make_request(
                            idempotency_key=f"cart-service:test:substitution:{index}"
                        )
                    )
        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_unsafe_checkout_url_rolls_back_cart_and_items(self):
        self.url_builder.url = "http://www.example.com/checkout"

        with self.assertRaises(CustomerCartRepositoryError):
            self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)

    def test_expired_or_unknown_supplied_token_is_rejected(self):
        first = self.save()
        cart = CustomerItineraryCart.objects.get()
        cart.expires_at = timezone.now() - timedelta(seconds=1)
        cart.save(update_fields=("expires_at", "updated_at"))
        request = self.make_request(
            cart_token=first["cart_token"],
            idempotency_key="cart-service:test:expired",
        )
        with self.assertRaises(CustomerCartValidationError):
            self.save(request=request)

        unknown = self.make_request(
            cart_token="unknown-safe-token",
            idempotency_key="cart-service:test:unknown",
        )
        with self.assertRaises(CustomerCartValidationError):
            self.save(request=unknown)

    def test_supplied_token_cannot_cross_conversations(self):
        first = self.save()
        other_conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095551002",
        )
        other_approval = CustomerAIMessage.objects.create(
            conversation=other_conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.other-conversation-approval",
            text="Yes, approved.",
        )
        request = self.make_request(
            cart_token=first["cart_token"],
            idempotency_key="cart-service:test:other-conversation",
        )

        with self.assertRaises(CustomerCartValidationError):
            self.save(
                request=request,
                conversation=other_conversation,
                metadata={"approval_message_id": other_approval.pk},
            )

    def test_idempotency_key_cannot_cross_conversations(self):
        self.save()
        other_conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095551003",
        )
        other_approval = CustomerAIMessage.objects.create(
            conversation=other_conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.other-idempotency-approval",
            text="Yes, approved.",
        )

        with self.assertRaises(CustomerCartRepositoryError):
            self.save(
                conversation=other_conversation,
                metadata={"approval_message_id": other_approval.pk},
            )

        self.assertEqual(CustomerItineraryCart.objects.count(), 1)

    def test_existing_cart_token_hash_must_match_deterministic_token(self):
        self.save()
        cart = CustomerItineraryCart.objects.get()
        cart.token_hash = CustomerItineraryCart.hash_token("tampered-token")
        cart.save(update_fields=("token_hash", "updated_at"))

        with self.assertRaises(CustomerCartRepositoryError):
            self.save()

    def test_invalid_clock_value_is_rejected_without_writes(self):
        self.service.clock = lambda: "not-a-datetime"

        with self.assertRaises(CustomerCartRepositoryError):
            self.save()

        self.assertEqual(CustomerItineraryCart.objects.count(), 0)
