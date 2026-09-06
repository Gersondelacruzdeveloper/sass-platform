from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
    ReferralPartner,
    ReferralPartnerLocation,
)
from partner_network.services.attribution_service import claim_referral_from_message
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)
from ticketing.customer_cart_conversion_service import (
    CustomerCartCheckoutDetails,
    DjangoCustomerCartConversionService,
)
from ticketing.customer_cart_service import ValidatedCart, ValidatedCartLine
from ticketing.models import Booking, ExperienceProduct, PickupLocation, TicketingSettings


class FakeCartValidator:
    def __init__(self, result):
        self.result = result
        self.calls = []

    def validate_for_checkout(self, **kwargs):
        self.calls.append(kwargs)
        return self.result


class ReferralCartBookingIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Cart Booking Org",
            slug="partner-cart-booking-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.network_settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            referral_session_hours=72,
            default_commission_trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
        )
        TicketingSettings.objects.update_or_create(
            organisation=cls.organisation,
            defaults={
                "is_active": True,
                "allow_full_payment": True,
                "allow_deposit_payment": True,
                "allow_pending_payment": True,
                "allow_cash_to_seller": True,
                "default_deposit_percentage": Decimal("20.00"),
            },
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            slug="jara-beach-cart-booking",
            location_type="hotel",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            partner_type="hotel",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Jara Beach",
            property_type="hotel",
            linked_pickup_location=cls.pickup,
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-partner-cart-booking",
            product_type="excursion",
            adult_price=Decimal("90.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=False,
        )
        cls.rule = ReferralCommissionRule.objects.create(
            organisation=cls.organisation,
            partner=cls.partner,
            commission_type=ReferralCommissionRule.TYPE_FIXED_BOOKING,
            commission_value=Decimal("6.00"),
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
            effective_from=date.today() - timedelta(days=1),
            is_active=True,
        )

    def setUp(self):
        self.now = timezone.now()
        self.service_date = date.today() + timedelta(days=7)
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095559901",
        )

        qr = generate_qr_for_location(self.location)
        self.referral_session, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{qr.token}",
        )
        self.assertIsNotNone(self.referral_session)

        unique_suffix = str(self.conversation.pk)
        self.approval = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id=f"wamid.partner-cart-{unique_suffix}",
            text="Yes, book this itinerary.",
        )
        self.token, token_hash = CustomerItineraryCart.generate_token()
        self.cart = CustomerItineraryCart.objects.create(
            organisation=self.organisation,
            conversation=self.conversation,
            token_hash=token_hash,
            idempotency_key=f"partner-cart-booking:{unique_suffix}",
            language="en",
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("90.00"),
            promotion_snapshot=[],
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
            line_discount=Decimal("0.00"),
            line_total=Decimal("90.00"),
            currency="USD",
        )
        self.checkout = CustomerCartCheckoutDetails(
            customer_name="Referral Guest",
            customer_whatsapp="+18095559901",
            customer_email="referral@example.com",
            customer_hotel="Jara Beach",
            payment_choice="pending",
        )

    def validated_cart(self):
        return ValidatedCart(
            lines=(
                ValidatedCartLine(
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
                    pickup_name="Jara Beach",
                    pickup_time=None,
                    unit_price=Decimal("90.00"),
                    subtotal=Decimal("90.00"),
                    discount=Decimal("0.00"),
                    total=Decimal("90.00"),
                    currency="USD",
                    availability_snapshot={"available": True},
                ),
            ),
            currency="USD",
            subtotal=Decimal("90.00"),
            discount_total=Decimal("0.00"),
            total=Decimal("90.00"),
            promotion_snapshot=(),
            age_restrictions_validated=True,
            availability_validated=True,
            pickup_validated=True,
        )

    def service(self):
        return DjangoCustomerCartConversionService(
            validator=FakeCartValidator(self.validated_cart()),
            clock=lambda: self.now + timedelta(minutes=5),
        )

    def convert(self):
        return self.service().convert(
            organisation=self.organisation,
            raw_token=self.token,
            checkout=self.checkout,
        )

    def test_referral_cart_conversion_creates_attribution_and_commission(self):
        result = self.convert()

        self.assertTrue(result.created)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(ReferralBookingAttribution.objects.count(), 1)
        self.assertEqual(ReferralCommission.objects.count(), 1)

        attribution = ReferralBookingAttribution.objects.get(booking=result.booking)
        self.assertEqual(attribution.referral_session, self.referral_session)
        self.assertEqual(attribution.partner, self.partner)
        self.assertEqual(attribution.partner_location, self.location)
        self.assertEqual(attribution.referral_qr, self.referral_session.qr_code)
        self.assertEqual(attribution.metadata["cart_id"], self.cart.pk)
        self.assertEqual(
            attribution.metadata["conversation_id"],
            self.conversation.pk,
        )

        commission = ReferralCommission.objects.get(booking=result.booking)
        self.assertEqual(commission.partner, self.partner)
        self.assertEqual(commission.partner_location, self.location)
        self.assertEqual(commission.amount, Decimal("6.00"))
        self.assertEqual(commission.status, ReferralCommission.STATUS_PENDING)
        self.assertEqual(commission.trigger, PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT)
        self.assertEqual(
            commission.commission_rule_snapshot["rule_id"],
            self.rule.pk,
        )
        self.assertEqual(
            commission.commission_rule_snapshot["commission_value"],
            "6.0000",
        )

    def test_duplicate_cart_conversion_does_not_duplicate_attribution_or_commission(self):
        first = self.convert()
        second = self.convert()

        self.assertTrue(first.created)
        self.assertFalse(second.created)
        self.assertEqual(second.booking.pk, first.booking.pk)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(ReferralBookingAttribution.objects.count(), 1)
        self.assertEqual(ReferralCommission.objects.count(), 1)

    def test_disabled_partner_network_converts_normally_without_referral_side_effects(self):
        self.network_settings.enabled = False
        self.network_settings.save(update_fields=["enabled"])

        result = self.convert()

        self.assertTrue(result.created)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(result.booking.total_amount, Decimal("90.00"))
        self.assertEqual(ReferralBookingAttribution.objects.count(), 0)
        self.assertEqual(ReferralCommission.objects.count(), 0)
