from __future__ import annotations

from decimal import Decimal

from django.test import TestCase

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralProductAccess,
)
from partner_network.services.ai_context_service import get_referral_context
from partner_network.services.attribution_service import claim_referral_from_message
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import ExperienceProduct, PickupLocation


class ReferralAIContextTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner AI Context Org",
            slug="partner-ai-context-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            referral_session_hours=72,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Jara Beach Pickup",
            slug="jara-beach-ai-context",
            location_type="hotel",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Jara Beach",
            partner_type="hotel",
            status="active",
            product_access_mode=ReferralPartner.PRODUCT_ACCESS_CUSTOM,
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Jara Beach",
            property_type="hotel",
            linked_pickup_location=cls.pickup,
            welcome_message="Welcome to Jara Beach concierge.",
            property_information="Guests are staying at Jara Beach.",
            concierge_introduction="Punta Cana Discovery excursion concierge.",
            is_active=True,
        )

        cls.allowed_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-ai-context",
            product_type="excursion",
            adult_price=Decimal("69.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=True,
        )
        cls.blocked_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Blocked Excursion",
            slug="blocked-ai-context",
            product_type="excursion",
            adult_price=Decimal("99.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )
        ReferralProductAccess.objects.create(
            organisation=cls.organisation,
            partner=cls.partner,
            product=cls.allowed_product,
            is_active=True,
            is_recommended=True,
        )

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095557777",
        )

    def activate_referral(self):
        qr = generate_qr_for_location(self.location)
        session, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{qr.token}",
        )
        self.assertIsNotNone(session)
        return session

    def test_active_referral_context_contains_property_and_pickup(self):
        session = self.activate_referral()

        context = get_referral_context(self.conversation)

        self.assertIsNotNone(context)
        self.assertEqual(context["partner_id"], self.partner.pk)
        self.assertEqual(context["partner_name"], "Jara Beach")
        self.assertEqual(context["property_id"], self.location.pk)
        self.assertEqual(context["property_name"], "Jara Beach")
        self.assertEqual(context["pickup_location_id"], self.pickup.pk)
        self.assertEqual(context["pickup_location_name"], "Jara Beach Pickup")
        self.assertEqual(context["session_id"], session.pk)
        self.assertEqual(
            context["welcome_message"],
            "Welcome to Jara Beach concierge.",
        )
        self.assertEqual(
            context["property_information"],
            "Guests are staying at Jara Beach.",
        )
        self.assertEqual(
            context["concierge_introduction"],
            "Punta Cana Discovery excursion concierge.",
        )

    def test_context_only_exposes_partner_allowed_products(self):
        self.activate_referral()

        context = get_referral_context(self.conversation)

        allowed_ids = {item["id"] for item in context["allowed_products"]}
        self.assertEqual(allowed_ids, {self.allowed_product.pk})
        self.assertNotIn(self.blocked_product.pk, allowed_ids)

    def test_context_exposes_recommended_product_ids(self):
        self.activate_referral()

        context = get_referral_context(self.conversation)

        self.assertEqual(
            context["recommended_product_ids"],
            [self.allowed_product.pk],
        )

    def test_direct_customer_without_referral_gets_no_partner_context(self):
        self.assertIsNone(get_referral_context(self.conversation))

    def test_disabling_partner_network_removes_existing_referral_context(self):
        self.activate_referral()
        self.assertIsNotNone(get_referral_context(self.conversation))

        self.settings.enabled = False
        self.settings.save(update_fields=["enabled"])

        self.assertIsNone(get_referral_context(self.conversation))
