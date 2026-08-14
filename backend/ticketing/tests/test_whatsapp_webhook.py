"""Integration tests for the signed Meta WhatsApp webhook endpoint."""

from __future__ import annotations

import hashlib
import hmac
import json
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone

from organisations.models import Organisation
from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage
from ticketing.models import TicketingWhatsAppSettings


class WhatsAppWebhookTests(TestCase):
    APP_SECRET = "meta-app-secret-for-tests"
    OTHER_APP_SECRET = "other-meta-app-secret"
    WABA_ID = "waba-10001"
    PHONE_NUMBER_ID = "phone-20001"
    OTHER_WABA_ID = "waba-10002"
    OTHER_PHONE_NUMBER_ID = "phone-20002"
    CUSTOMER_ID = "18095553001"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="whatsapp-webhook-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other WhatsApp Tours",
            slug="whatsapp-webhook-other-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=cls.organisation,
            is_active=True,
            meta_app_secret=cls.APP_SECRET,
            business_account_id=cls.WABA_ID,
            phone_number_id=cls.PHONE_NUMBER_ID,
            webhook_verify_token="verify-token-one",
            webhook_subscribed=False,
        )
        cls.other_whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=cls.other_organisation,
            is_active=True,
            meta_app_secret=cls.OTHER_APP_SECRET,
            business_account_id=cls.OTHER_WABA_ID,
            phone_number_id=cls.OTHER_PHONE_NUMBER_ID,
            webhook_verify_token="verify-token-two",
            webhook_subscribed=False,
        )

    def setUp(self):
        self.url = reverse("ticketing-whatsapp-webhook")

    def message_payload(
        self,
        *,
        message_id="wamid.webhook.1",
        customer_id=None,
        message_type="text",
        text="I would like to book Saona.",
        customer_name="Maria Customer",
        waba_id=None,
        phone_number_id=None,
        timestamp="1786723200",
    ):
        customer_id = customer_id or self.CUSTOMER_ID
        message = {
            "from": customer_id,
            "id": message_id,
            "timestamp": timestamp,
            "type": message_type,
        }
        if message_type == "text":
            message["text"] = {"body": text}
        elif message_type == "button":
            message["button"] = {"text": text, "payload": "button-payload"}
        elif message_type == "interactive":
            message["interactive"] = {
                "type": "button_reply",
                "button_reply": {"id": "yes", "title": text},
            }
        else:
            message[message_type] = {"id": "media-id-not-downloaded"}
        return {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": waba_id or self.WABA_ID,
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "messaging_product": "whatsapp",
                                "metadata": {
                                    "phone_number_id": (
                                        phone_number_id or self.PHONE_NUMBER_ID
                                    )
                                },
                                "contacts": [
                                    {
                                        "wa_id": customer_id,
                                        "profile": {"name": customer_name},
                                    }
                                ],
                                "messages": [message],
                            },
                        }
                    ],
                }
            ],
        }

    def status_payload(
        self,
        *,
        external_message_id,
        delivery_status="delivered",
        errors=None,
        waba_id=None,
        phone_number_id=None,
    ):
        status = {
            "id": external_message_id,
            "status": delivery_status,
            "timestamp": "1786723260",
            "recipient_id": self.CUSTOMER_ID,
        }
        if errors is not None:
            status["errors"] = errors
        return {
            "object": "whatsapp_business_account",
            "entry": [
                {
                    "id": waba_id or self.WABA_ID,
                    "changes": [
                        {
                            "field": "messages",
                            "value": {
                                "metadata": {
                                    "phone_number_id": (
                                        phone_number_id or self.PHONE_NUMBER_ID
                                    )
                                },
                                "statuses": [status],
                            },
                        }
                    ],
                }
            ],
        }

    @staticmethod
    def encode(payload):
        return json.dumps(payload, separators=(",", ":")).encode("utf-8")

    @staticmethod
    def signature(raw_body, secret):
        digest = hmac.new(
            secret.encode("utf-8"), raw_body, hashlib.sha256
        ).hexdigest()
        return f"sha256={digest}"

    def post_payload(self, payload, *, secret=None, signature=None, raw_body=None):
        raw = raw_body if raw_body is not None else self.encode(payload)
        supplied_signature = signature or self.signature(
            raw, secret or self.APP_SECRET
        )
        return self.client.post(
            self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256=supplied_signature,
        )

    def test_get_verification_marks_subscription_and_returns_plain_challenge(self):
        response = self.client.get(
            self.url,
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "verify-token-one",
                "hub.challenge": "123456789",
            },
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content, b"123456789")
        self.assertTrue(response["Content-Type"].startswith("text/plain"))
        self.whatsapp_settings.refresh_from_db()
        self.assertTrue(self.whatsapp_settings.webhook_subscribed)
        self.assertIsNotNone(self.whatsapp_settings.webhook_subscribed_at)

    def test_get_verification_rejects_wrong_mode_or_token(self):
        wrong_mode = self.client.get(
            self.url,
            {
                "hub.mode": "wrong",
                "hub.verify_token": "verify-token-one",
                "hub.challenge": "1",
            },
        )
        wrong_token = self.client.get(
            self.url,
            {
                "hub.mode": "subscribe",
                "hub.verify_token": "wrong-token",
                "hub.challenge": "1",
            },
        )
        blank_token = self.client.get(
            self.url,
            {"hub.mode": "subscribe", "hub.verify_token": "", "hub.challenge": "1"},
        )
        self.assertEqual(wrong_mode.status_code, 400)
        self.assertEqual(wrong_token.status_code, 403)
        self.assertEqual(blank_token.status_code, 403)

    def test_unsupported_http_method_returns_405(self):
        response = self.client.put(
            self.url, data=b"{}", content_type="application/json"
        )
        self.assertEqual(response.status_code, 405)

    def test_invalid_json_or_non_object_payload_returns_400(self):
        invalid = self.client.post(
            self.url,
            data=b"{not-json",
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256="sha256=invalid",
        )
        non_object_raw = b"[]"
        non_object = self.client.post(
            self.url,
            data=non_object_raw,
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256=self.signature(
                non_object_raw, self.APP_SECRET
            ),
        )
        self.assertEqual(invalid.status_code, 400)
        self.assertEqual(non_object.status_code, 400)

    @override_settings(WHATSAPP_WEBHOOK_MAX_BYTES=50)
    def test_oversized_payload_is_rejected_before_processing(self):
        raw = self.encode(self.message_payload())
        response = self.client.post(
            self.url,
            data=raw,
            content_type="application/json",
            HTTP_X_HUB_SIGNATURE_256=self.signature(raw, self.APP_SECRET),
        )
        self.assertEqual(response.status_code, 413)
        self.assertEqual(CustomerAIMessage.objects.count(), 0)

    def test_unknown_destination_returns_404(self):
        payload = self.message_payload(
            waba_id="unknown-waba", phone_number_id="unknown-phone"
        )
        response = self.post_payload(payload)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CustomerAIMessage.objects.count(), 0)

    def test_invalid_or_missing_signature_returns_403_without_storage(self):
        payload = self.message_payload()
        raw = self.encode(payload)
        invalid = self.post_payload(payload, signature="sha256=wrong", raw_body=raw)
        missing = self.client.post(
            self.url, data=raw, content_type="application/json"
        )
        self.assertEqual(invalid.status_code, 403)
        self.assertEqual(missing.status_code, 403)
        self.assertEqual(CustomerAIMessage.objects.count(), 0)

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_valid_text_message_is_stored_and_queued_after_commit(self, delay):
        payload = self.message_payload()
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 1)
        self.assertEqual(response.json()["queued"], 1)
        conversation = CustomerAIConversation.objects.get()
        message = CustomerAIMessage.objects.get()
        self.assertEqual(conversation.organisation, self.organisation)
        self.assertEqual(conversation.external_customer_id, self.CUSTOMER_ID)
        self.assertEqual(conversation.customer_name, "Maria Customer")
        self.assertEqual(message.text, "I would like to book Saona.")
        self.assertEqual(message.direction, CustomerAIMessage.DIRECTION_INBOUND)
        self.assertTrue(message.metadata["ai_eligible"])
        self.assertNotIn("payload", message.metadata)
        delay.assert_called_once_with(message.pk)

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_duplicate_message_is_idempotent_and_not_queued_twice(self, delay):
        payload = self.message_payload(message_id="wamid.webhook.duplicate")
        with self.captureOnCommitCallbacks(execute=True):
            first = self.post_payload(payload)
        with self.captureOnCommitCallbacks(execute=True):
            second = self.post_payload(payload)

        self.assertEqual(first.json()["stored"], 1)
        self.assertEqual(second.json()["stored"], 0)
        self.assertEqual(second.json()["duplicates_or_invalid"], 1)
        self.assertEqual(CustomerAIMessage.objects.count(), 1)
        self.assertEqual(delay.call_count, 1)

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_button_and_interactive_replies_are_eligible_text(self, delay):
        button = self.message_payload(
            message_id="wamid.webhook.button",
            message_type="button",
            text="Yes, please",
        )
        interactive = self.message_payload(
            message_id="wamid.webhook.interactive",
            message_type="interactive",
            text="Thursday",
        )
        with self.captureOnCommitCallbacks(execute=True):
            first = self.post_payload(button)
        with self.captureOnCommitCallbacks(execute=True):
            second = self.post_payload(interactive)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(
            list(CustomerAIMessage.objects.values_list("text", flat=True)),
            ["Yes, please", "Thursday"],
        )
        self.assertEqual(delay.call_count, 2)

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_media_message_is_stored_without_download_or_ai_queue(self, delay):
        payload = self.message_payload(
            message_id="wamid.webhook.image", message_type="image"
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        message = CustomerAIMessage.objects.get()
        self.assertEqual(response.json()["stored"], 1)
        self.assertEqual(response.json()["queued"], 0)
        self.assertEqual(message.message_type, "image")
        self.assertEqual(message.text, "")
        self.assertFalse(message.metadata["ai_eligible"])
        delay.assert_not_called()

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_inactive_channel_stores_message_without_ai_queue(self, delay):
        self.whatsapp_settings.is_active = False
        self.whatsapp_settings.save(update_fields=("is_active", "updated_at"))
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(self.message_payload())

        self.assertEqual(response.json()["stored"], 1)
        self.assertEqual(response.json()["queued"], 0)
        delay.assert_not_called()

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_human_owned_conversation_stores_message_without_ai_queue(self, delay):
        conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id=self.CUSTOMER_ID,
            status=CustomerAIConversation.STATUS_HUMAN_OWNED,
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(self.message_payload())

        message = CustomerAIMessage.objects.get()
        self.assertEqual(message.conversation, conversation)
        self.assertEqual(response.json()["queued"], 0)
        delay.assert_not_called()

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_invalid_customer_identifier_is_ignored(self, delay):
        payload = self.message_payload(customer_id="123")
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["stored"], 0)
        self.assertEqual(response.json()["duplicates_or_invalid"], 1)
        self.assertEqual(CustomerAIConversation.objects.count(), 0)
        delay.assert_not_called()

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_all_entries_changes_and_messages_are_processed(self, delay):
        payload = self.message_payload(message_id="wamid.webhook.multi.1")
        second_change = self.message_payload(
            message_id="wamid.webhook.multi.2",
            customer_id="18095553002",
        )["entry"][0]["changes"][0]
        second_entry = self.message_payload(
            message_id="wamid.webhook.multi.3",
            customer_id="18095553003",
        )["entry"][0]
        payload["entry"][0]["changes"].append(second_change)
        payload["entry"].append(second_entry)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload)

        self.assertEqual(response.json()["stored"], 3)
        self.assertEqual(response.json()["queued"], 3)
        self.assertEqual(CustomerAIConversation.objects.count(), 3)
        self.assertEqual(CustomerAIMessage.objects.count(), 3)
        self.assertEqual(delay.call_count, 3)

    def test_mixed_organisation_payload_is_rejected_as_ambiguous(self):
        payload = self.message_payload()
        other_entry = self.message_payload(
            message_id="wamid.other-org",
            waba_id=self.OTHER_WABA_ID,
            phone_number_id=self.OTHER_PHONE_NUMBER_ID,
        )["entry"][0]
        payload["entry"].append(other_entry)
        response = self.post_payload(payload)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CustomerAIMessage.objects.count(), 0)

    def test_waba_and_phone_must_match_the_same_configuration(self):
        payload = self.message_payload(phone_number_id=self.OTHER_PHONE_NUMBER_ID)
        response = self.post_payload(payload)
        self.assertEqual(response.status_code, 404)
        self.assertEqual(CustomerAIMessage.objects.count(), 0)

    @patch("ticketing.whatsapp_webhook_views.process_customer_ai_message_task.delay")
    def test_other_organisation_routes_only_to_its_own_conversation(self, delay):
        payload = self.message_payload(
            message_id="wamid.webhook.other-tenant",
            waba_id=self.OTHER_WABA_ID,
            phone_number_id=self.OTHER_PHONE_NUMBER_ID,
        )
        with self.captureOnCommitCallbacks(execute=True):
            response = self.post_payload(payload, secret=self.OTHER_APP_SECRET)

        self.assertEqual(response.status_code, 200)
        conversation = CustomerAIConversation.objects.get()
        self.assertEqual(conversation.organisation, self.other_organisation)
        delay.assert_called_once()

    def test_delivery_status_updates_only_matching_tenant_outbound_message(self):
        conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id=self.CUSTOMER_ID,
        )
        outbound = CustomerAIMessage.objects.create(
            conversation=conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            external_message_id="wamid.outbound.delivery",
            text="Your itinerary is ready.",
            metadata={"existing": True},
        )
        other_conversation = CustomerAIConversation.objects.create(
            organisation=self.other_organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095553999",
        )
        other_outbound = CustomerAIMessage.objects.create(
            conversation=other_conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            external_message_id="wamid.outbound.delivery",
            text="Other tenant message.",
            metadata={"other": True},
        )
        payload = self.status_payload(
            external_message_id="wamid.outbound.delivery",
            delivery_status="failed",
            errors=[{"code": 131047, "title": "Not stored"}],
        )
        response = self.post_payload(payload)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["statuses"], 1)
        outbound.refresh_from_db()
        other_outbound.refresh_from_db()
        delivery = outbound.metadata["whatsapp_delivery"]
        self.assertEqual(delivery["status"], "failed")
        self.assertEqual(delivery["error_codes"], ["131047"])
        self.assertTrue(outbound.metadata["existing"])
        self.assertEqual(other_outbound.metadata, {"other": True})

    def test_unknown_delivery_status_is_acknowledged_without_changes(self):
        response = self.post_payload(
            self.status_payload(external_message_id="wamid.unknown-status")
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["statuses"], 0)

    def test_valid_post_marks_webhook_subscribed(self):
        self.assertFalse(self.whatsapp_settings.webhook_subscribed)
        response = self.post_payload(self.message_payload())
        self.assertEqual(response.status_code, 200)
        self.whatsapp_settings.refresh_from_db()
        self.assertTrue(self.whatsapp_settings.webhook_subscribed)
        self.assertIsNotNone(self.whatsapp_settings.webhook_subscribed_at)
