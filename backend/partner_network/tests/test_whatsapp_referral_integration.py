from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import patch

from django.test import TestCase
from django.urls import reverse

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralSession,
)
from partner_network.services.qr_service import generate_qr_for_location
from ticketing.customer_ai_models import CustomerAIMessage
from ticketing.models import PickupLocation, TicketingWhatsAppSettings


class ReferralWhatsAppIntegrationTests(TestCase):
    APP_SECRET = "partner-network-meta-secret"
    WABA_ID = "partner-network-waba"
    PHONE_NUMBER_ID = "partner-network-phone"
    CUSTOMER_ID = "18095558888"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner WhatsApp Org",
            slug="partner-whatsapp-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.network_settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            referral_session_hours=72,
        )
        cls.whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=cls.organisation,
            is_active=True,
            meta_app_secret=cls.APP_SECRET,
            business_account_id=cls.WABA_ID,
            phone_number_id=cls.PHONE_NUMBER_ID,
            webhook_verify_token="partner-network-verify-token",
            webhook_subscribed=False,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Jara Beach WhatsApp",
            slug="jara-beach-whatsapp",
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
        self.url = reverse("ticketing-whatsapp-webhook")
        self.qr = generate_qr_for_location(self.location)

    def payload(self, *, message_id: str, text: str):
        return {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": self.WABA_ID,
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "messaging_product": "whatsapp",
                                "metadata": {
                                    "phone_number_id": self.PHONE_NUMBER_ID,
                                },
                                "contacts": [
                                    {
                                        "wa_id": self.CUSTOMER_ID,
                                        "profile": {"name": "Referral Guest"},
                                    }
                                ],
                                "messages": [
                                    {
                                        "from": self.CUSTOMER_ID,
                                        "id": message_id,
                                        "timestamp": "1786723200",
                                        "type": "text",
                                        "text": {"body": text},
                                    }
                                ],
                            },
                        }
                    ],
                }
            ],
        }

    @classmethod
    def encode(cls, payload):
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")

    @classmethod
    def signature(cls, raw_body):
        digest = hmac.new(
            cls.APP_SECRET.encode("utf-8"),
            raw_body,
            hashlib.sha256,
        ).hexdigest()
        return f"sha256={digest}"

    def post_payload(self, payload):
        raw = self.encode(payload)
        return self.client.post(
            self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256=self.signature(raw),
        )

    @patch("ticketing.whatsapp_webhook_views.queue_telegram_monitor_message")
    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_valid_referral_marker_creates_session_and_is_not_stored_as_chat_text(
        self,
        ai_delay,
        telegram_queue,
    ):
        payload = self.payload(
            message_id="wamid.partner.referral.1",
            text=f"Hi, I want excursions. Ref: PCDREF:{self.qr.token}",
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 1)

        message = CustomerAIMessage.objects.get()
        self.assertNotIn(self.qr.token, message.text)
        self.assertEqual(message.text, "Hi, I want excursions")

        session = ReferralSession.objects.get()
        self.assertEqual(session.partner, self.partner)
        self.assertEqual(session.partner_location, self.location)
        self.assertEqual(session.qr_code, self.qr)

        ai_delay.assert_called_once_with(message.pk)
        telegram_queue.assert_called_once_with(message.pk)

    @patch("ticketing.whatsapp_webhook_views.queue_telegram_monitor_message")
    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_duplicate_whatsapp_message_does_not_create_second_referral_session(
        self,
        ai_delay,
        telegram_queue,
    ):
        payload = self.payload(
            message_id="wamid.partner.referral.duplicate",
            text=f"PCDREF:{self.qr.token}",
        )

        with self.captureOnCommitCallbacks(execute=True):
            first = self.post_payload(payload)
        with self.captureOnCommitCallbacks(execute=True):
            second = self.post_payload(payload)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["stored"], 1)
        self.assertEqual(second.json()["stored"], 0)
        self.assertEqual(CustomerAIMessage.objects.count(), 1)
        self.assertEqual(ReferralSession.objects.count(), 1)
        self.assertEqual(ai_delay.call_count, 1)
        self.assertEqual(telegram_queue.call_count, 1)

    @patch("ticketing.whatsapp_webhook_views.queue_telegram_monitor_message")
    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_disabled_partner_network_leaves_direct_whatsapp_message_unchanged(
        self,
        ai_delay,
        telegram_queue,
    ):
        self.network_settings.enabled = False
        self.network_settings.save(update_fields=["enabled"])

        original_text = f"Hi PCDREF:{self.qr.token} this should stay direct."
        payload = self.payload(
            message_id="wamid.partner.disabled",
            text=original_text,
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 1)

        message = CustomerAIMessage.objects.get()
        self.assertEqual(message.text, original_text)
        self.assertEqual(ReferralSession.objects.count(), 0)

        ai_delay.assert_called_once_with(message.pk)
        telegram_queue.assert_called_once_with(message.pk)

    @patch("ticketing.whatsapp_webhook_views.queue_telegram_monitor_message")
    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_forged_referral_marker_is_not_stripped_or_attributed(
        self,
        ai_delay,
        telegram_queue,
    ):
        forged_token = "FORGEDTOKEN0123456789ABCDEFGHIJ"
        original_text = (
            f"Hi, I need help with Saona. Ref: PCDREF:{forged_token}"
        )
        payload = self.payload(
            message_id="wamid.partner.forged",
            text=original_text,
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 1)

        message = CustomerAIMessage.objects.get()
        self.assertEqual(message.text, original_text)
        self.assertEqual(ReferralSession.objects.count(), 0)

        ai_delay.assert_called_once_with(message.pk)
        telegram_queue.assert_called_once_with(message.pk)

    @patch("ticketing.whatsapp_webhook_views.queue_telegram_monitor_message")
    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_revoked_referral_marker_is_not_stripped_or_attributed(
        self,
        ai_delay,
        telegram_queue,
    ):
        self.qr.revoke()

        original_text = (
            f"Hi, I need excursions. Ref: PCDREF:{self.qr.token}"
        )
        payload = self.payload(
            message_id="wamid.partner.revoked",
            text=original_text,
        )

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 1)

        message = CustomerAIMessage.objects.get()
        self.assertEqual(message.text, original_text)
        self.assertEqual(ReferralSession.objects.count(), 0)

        ai_delay.assert_called_once_with(message.pk)
        telegram_queue.assert_called_once_with(message.pk)
