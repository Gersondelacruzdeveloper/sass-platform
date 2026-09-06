from __future__ import annotations

from django.test import TestCase
from organisations.models import Organisation

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralSession,
)
from partner_network.services.attribution_service import (
    claim_referral_from_message,
    get_active_referral_session,
    extract_referral_token,
    strip_referral_marker,
)
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import PickupLocation


class ReferralAttributionAndQrTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="partner-network-attribution",
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
            slug="jara-beach",
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

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550123",
        )

    def test_qr_token_is_opaque_and_referral_marker_is_parsed(self):
        qr = generate_qr_for_location(self.location)
        self.assertGreaterEqual(len(qr.token), 30)
        self.assertNotEqual(qr.token, str(qr.pk))
        text = f"Hi. Ref: PCDREF:{qr.token}"
        self.assertEqual(extract_referral_token(text), qr.token)
        self.assertNotIn(qr.token, strip_referral_marker(text))

    def test_claim_creates_partner_scoped_referral_session(self):
        qr = generate_qr_for_location(self.location)
        session, sanitized = claim_referral_from_message(
            conversation=self.conversation,
            text=f"Hi, I need an excursion. Ref: PCDREF:{qr.token}",
        )
        self.assertIsNotNone(session)
        self.assertEqual(session.partner, self.partner)
        self.assertEqual(session.partner_location, self.location)
        self.assertEqual(session.qr_code, qr)
        self.assertNotIn(qr.token, sanitized)
        self.assertEqual(
            ReferralSession.objects.filter(conversation=self.conversation).count(),
            1,
        )

    def test_new_qr_claim_closes_previous_active_session(self):
        first_qr = generate_qr_for_location(self.location)
        first, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{first_qr.token}",
        )
        second_qr = generate_qr_for_location(self.location)
        second, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{second_qr.token}",
        )
        first.refresh_from_db()
        self.assertEqual(first.status, ReferralSession.STATUS_CLOSED)
        self.assertEqual(second.status, ReferralSession.STATUS_ACTIVE)

    def test_disabled_partner_network_hides_existing_active_session(self):
        qr = generate_qr_for_location(self.location)
        session, _ = claim_referral_from_message(
            conversation=self.conversation,
            text=f"PCDREF:{qr.token}",
        )
        self.assertIsNotNone(session)
        self.assertIsNotNone(get_active_referral_session(self.conversation))

        settings_obj = PartnerNetworkSettings.objects.get(
            organisation=self.organisation
        )
        settings_obj.enabled = False
        settings_obj.save(update_fields=["enabled"])

        self.assertIsNone(get_active_referral_session(self.conversation))

