"""Tests for atomic customer itinerary cart-to-booking conversion."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.ai.customer.cart_tools import CustomerCartValidationError
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.customer_cart_conversion_service import (
    CustomerCartCheckoutDetails,
    CustomerCartConversionChangedError,
    CustomerCartConversionNotFoundError,
    CustomerCartConversionValidationError,
    DjangoCustomerCartConversionService,
)
from ticketing.customer_cart_service import ValidatedCart, ValidatedCartLine
from ticketing.models import Booking, ExperienceProduct


class FakeCartValidator:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error
        self.calls = []

    def validate_for_checkout(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.result


class CustomerCartConversionServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="cart-conversion-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Tours",
            slug="cart-conversion-other-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="cart-conversion-saona",
            product_type="excursion",
            adult_price=Decimal("90.00"),
            deposit_amount=Decimal("20.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )

    def setUp(self):
        self.now = timezone.now()
        self.service_date = date.today() + timedelta(days=7)
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095553001",
        )
        self.approval = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.cart-conversion-approved",
            text="Yes, book this itinerary.",
        )
        self.token, token_hash = CustomerItineraryCart.generate_token()
        self.cart = CustomerItineraryCart.objects.create(
            organisation=self.organisation,
            conversation=self.conversation,
            token_hash=token_hash,
            idempotency_key="cart-conversion:test:1",
            language="en",
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("80.00"),
            promotion_snapshot=[{"promotion_id": 1}],
            customer_approved=True,
            customer_approval_message=self.approval,
            customer_approved_at=self.now,
            itinerary_revalidated_at=self.now,
            age_restrictions_validated_at=self.now,
            expires_at=self.now + timedelta(hours=2),
        )
        self.item = CustomerItineraryCartItem.objects.create(
            cart=self.cart,
            position=1,
            product=self.product,
            service_date=self.service_date,
            adults=1,
            children=0,
            infants=0,
            product_name_snapshot="Saona Island",
            unit_price_snapshot=Decimal("90.00"),
            line_subtotal=Decimal("90.00"),
            line_discount=Decimal("10.00"),
            line_total=Decimal("80.00"),
            currency="USD",
        )
        self.checkout = CustomerCartCheckoutDetails(
            customer_name="Jane Customer",
            customer_whatsapp="+18095553001",
            customer_email="jane@example.com",
            customer_hotel="Test Hotel",
            customer_notes="Vegetarian lunch",
            payment_choice="pending",
        )

    def validated_cart(self, **overrides):
        line = ValidatedCartLine(
            position=1,
            product=self.product,
            service_date=self.service_date,
            adults=1,
            children=0,
            infants=0,
            package_id=None,
            event_ticket_type_id=None,
            selected_external_option_id="",
            pickup_location_id=None,
            product_name="Saona Island",
            option_name="",
            pickup_name="Test Hotel",
            pickup_time=None,
            unit_price=Decimal("90.00"),
            subtotal=Decimal("90.00"),
            discount=Decimal("10.00"),
            total=Decimal("80.00"),
            currency="USD",
            availability_snapshot={"available": True},
        )
        values = {
            "lines": (line,),
            "currency": "USD",
            "subtotal": Decimal("90.00"),
            "discount_total": Decimal("10.00"),
            "total": Decimal("80.00"),
            "promotion_snapshot": ({"promotion_id": 1},),
            "age_restrictions_validated": True,
            "availability_validated": True,
            "pickup_validated": True,
        }
        values.update(overrides)
        return ValidatedCart(**values)

    def make_service(self, result=None, error=None):
        validator = FakeCartValidator(
            result=result or self.validated_cart(),
            error=error,
        )
        service = DjangoCustomerCartConversionService(
            validator=validator,
            clock=lambda: self.now + timedelta(minutes=5),
        )
        return service, validator

    def convert(self, *, service=None, checkout=None, organisation=None):
        service = service or self.make_service()[0]
        return service.convert(
            organisation=organisation or self.organisation,
            raw_token=self.token,
            checkout=checkout or self.checkout,
        )

    def test_successfully_converts_cart_and_reconciles_booking(self):
        service, validator = self.make_service()

        result = self.convert(service=service)

        self.assertTrue(result.created)
        self.assertEqual(Booking.objects.count(), 1)
        booking = result.booking
        self.assertEqual(booking.subtotal_amount, Decimal("90.00"))
        self.assertEqual(booking.discount_amount, Decimal("10.00"))
        self.assertEqual(booking.total_amount, Decimal("80.00"))
        self.assertEqual(booking.balance_due, Decimal("80.00"))
        self.assertEqual(booking.items.count(), 1)
        self.assertEqual(booking.items.get().unit_price, Decimal("90.00"))
        self.cart.refresh_from_db()
        self.assertEqual(self.cart.status, CustomerItineraryCart.STATUS_CONVERTED)
        self.assertEqual(self.cart.converted_booking, booking)
        self.assertEqual(len(validator.calls), 1)

    def test_duplicate_submission_returns_existing_booking(self):
        service, validator = self.make_service()

        first = self.convert(service=service)
        second = self.convert(service=service)

        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(second.booking.pk, first.booking.pk)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(len(validator.calls), 1)

    def test_token_is_tenant_scoped_and_unknown_token_is_hidden(self):
        service, _validator = self.make_service()

        with self.assertRaises(CustomerCartConversionNotFoundError):
            self.convert(service=service, organisation=self.other_organisation)

        with self.assertRaises(CustomerCartConversionNotFoundError):
            service.convert(
                organisation=self.organisation,
                raw_token="unknown-cart-token-with-safe-length-123",
                checkout=self.checkout,
            )
        self.assertEqual(Booking.objects.count(), 0)

    def test_expired_and_unapproved_carts_are_rejected(self):
        service, _validator = self.make_service()
        self.cart.expires_at = self.now - timedelta(seconds=1)
        self.cart.save(update_fields=["expires_at"])

        with self.assertRaises(CustomerCartConversionValidationError):
            self.convert(service=service)

        self.cart.expires_at = self.now + timedelta(hours=1)
        self.cart.customer_approved = False
        self.cart.save(update_fields=["expires_at", "customer_approved"])
        with self.assertRaises(CustomerCartConversionValidationError):
            self.convert(service=service)
        self.assertEqual(Booking.objects.count(), 0)

    def test_changed_price_rolls_back_without_consuming_cart(self):
        changed = self.validated_cart(
            subtotal=Decimal("100.00"),
            discount_total=Decimal("10.00"),
            total=Decimal("90.00"),
        )
        service, _validator = self.make_service(result=changed)

        with self.assertRaises(CustomerCartConversionChangedError):
            self.convert(service=service)

        self.cart.refresh_from_db()
        self.assertEqual(self.cart.status, CustomerItineraryCart.STATUS_ACTIVE)
        self.assertIsNone(self.cart.converted_booking_id)
        self.assertEqual(Booking.objects.count(), 0)

    def test_validator_failure_rolls_back_without_booking(self):
        service, _validator = self.make_service(
            error=CustomerCartValidationError("The excursion sold out."),
        )

        with self.assertRaises(CustomerCartConversionChangedError):
            self.convert(service=service)

        self.assertEqual(Booking.objects.count(), 0)
        self.cart.refresh_from_db()
        self.assertEqual(self.cart.status, CustomerItineraryCart.STATUS_ACTIVE)

    def test_mixed_passenger_groups_are_rejected_before_validation(self):
        CustomerItineraryCartItem.objects.create(
            cart=self.cart,
            position=2,
            product=self.product,
            service_date=self.service_date + timedelta(days=1),
            adults=2,
            product_name_snapshot="Saona Island",
            unit_price_snapshot=Decimal("90.00"),
            line_subtotal=Decimal("90.00"),
            line_discount=Decimal("10.00"),
            line_total=Decimal("80.00"),
            currency="USD",
        )
        service, validator = self.make_service()

        with self.assertRaises(CustomerCartConversionValidationError):
            self.convert(service=service)

        self.assertEqual(len(validator.calls), 0)
        self.assertEqual(Booking.objects.count(), 0)

    def test_deposit_amount_is_calculated_from_product_configuration(self):
        deposit_checkout = CustomerCartCheckoutDetails(
            customer_name=self.checkout.customer_name,
            customer_whatsapp=self.checkout.customer_whatsapp,
            customer_email=self.checkout.customer_email,
            payment_choice="deposit",
        )

        result = self.convert(checkout=deposit_checkout)

        self.assertEqual(result.booking.deposit_required, Decimal("20.00"))
        payment = result.booking.payments.get()
        self.assertEqual(payment.amount, Decimal("20.00"))
        self.assertEqual(payment.status, "pending")

    def test_required_customer_details_and_payment_choice_are_validated(self):
        invalid_values = (
            CustomerCartCheckoutDetails("", "+18095553001", "jane@example.com"),
            CustomerCartCheckoutDetails("Jane", "", "jane@example.com"),
            CustomerCartCheckoutDetails("Jane", "+18095553001", ""),
            CustomerCartCheckoutDetails(
                "Jane",
                "+18095553001",
                "jane@example.com",
                payment_choice="unsupported",
            ),
        )
        for checkout in invalid_values:
            with self.subTest(checkout=checkout):
                with self.assertRaises(CustomerCartConversionValidationError):
                    self.convert(checkout=checkout)
        self.assertEqual(Booking.objects.count(), 0)
