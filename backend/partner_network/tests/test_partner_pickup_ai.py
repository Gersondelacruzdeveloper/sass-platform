from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone as dt_timezone
from decimal import Decimal

from django.test import TestCase

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
)
from partner_network.services.ai_context_service import get_referral_context
from partner_network.services.attribution_service import claim_referral_from_message
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.ai.customer.django_tool_adapters import DjangoCustomerPickupRepository
from ticketing.ai.customer.pickup_tools import CustomerPickupTools
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import (
    ExperienceProduct,
    PickupLocation,
    ProductPickupSchedule,
)


class ReferralPickupAITests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Pickup AI Org",
            slug="partner-pickup-ai-org",
            business_type="ticketing",
            is_active=True,
        )
        PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            referral_session_hours=72,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            slug="jara-beach-partner-pickup-ai",
            location_type="hotel",
            default_pickup_point="Main Lobby",
            default_instructions="Please be ready 10 minutes before pickup.",
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
            slug="saona-partner-pickup-ai",
            product_type="excursion",
            adult_price=Decimal("69.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=True,
        )

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095556666",
        )
        qr = generate_qr_for_location(self.location)
        session, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{qr.token}",
        )
        self.assertIsNotNone(session)

        self.service_date = date(2026, 9, 13)
        self.tools = CustomerPickupTools(
            repository=DjangoCustomerPickupRepository(),
            clock=lambda: datetime(2026, 9, 6, 12, 0, tzinfo=dt_timezone.utc),
        )

    def resolve(self):
        context = get_referral_context(self.conversation)
        self.assertIsNotNone(context)
        self.assertEqual(context["pickup_location_id"], self.pickup.pk)

        return self.tools.resolve_pickup_schedule(
            arguments={
                "product_id": self.product.pk,
                "pickup_location_id": context["pickup_location_id"],
                "service_date": self.service_date.isoformat(),
            },
            organisation=self.organisation,
            conversation=self.conversation,
            metadata={},
        )

    def test_partner_pickup_uses_exact_configured_time(self):
        schedule = ProductPickupSchedule.objects.create(
            product=self.product,
            pickup_location=self.pickup,
            pickup_time=time(7, 20),
            is_active=True,
        )

        result = self.resolve()

        self.assertTrue(result["ok"])
        self.assertTrue(result["pickup_confirmed"])
        self.assertFalse(result["estimated"])
        self.assertEqual(result["schedule"]["status"], "confirmed")
        self.assertEqual(result["schedule"]["pickup_time"], "07:20")
        self.assertEqual(result["schedule"]["schedule_id"], schedule.pk)
        self.assertEqual(result["schedule"]["meeting_point"], "Main Lobby")

    def test_specific_date_override_wins_for_partner_pickup(self):
        ProductPickupSchedule.objects.create(
            product=self.product,
            pickup_location=self.pickup,
            pickup_time=time(7, 20),
            is_active=True,
        )
        override = ProductPickupSchedule.objects.create(
            product=self.product,
            pickup_location=self.pickup,
            specific_date=self.service_date,
            pickup_time=time(6, 55),
            pickup_point="Reception Desk",
            is_active=True,
        )

        result = self.resolve()

        self.assertTrue(result["pickup_confirmed"])
        self.assertFalse(result["estimated"])
        self.assertEqual(result["schedule"]["pickup_time"], "06:55")
        self.assertEqual(result["schedule"]["schedule_id"], override.pk)
        self.assertEqual(result["schedule"]["meeting_point"], "Reception Desk")

    def test_missing_schedule_returns_pending_and_never_estimates(self):
        result = self.resolve()

        self.assertTrue(result["ok"])
        self.assertFalse(result["pickup_confirmed"])
        self.assertFalse(result["estimated"])
        self.assertEqual(result["schedule"]["status"], "not_configured")
        self.assertIsNone(result["schedule"]["pickup_time"])
        self.assertIsNone(result["schedule"]["schedule_id"])
        self.assertFalse(result["schedule"]["estimated"])
