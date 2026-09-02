"""Tests for the isolated, tenant-scoped Telegram conversation monitor."""

from __future__ import annotations

from unittest.mock import Mock, patch

import requests
from django.test import TestCase, override_settings

from organisations.models import Organisation
from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage
from ticketing.telegram_monitor import (
    TelegramMonitorDeliveryError,
    format_telegram_monitor_message,
    queue_telegram_monitor_message,
    send_telegram_monitor_message,
)


MONITOR_SETTINGS = {
    "TELEGRAM_MONITOR_ENABLED": True,
    "TELEGRAM_MONITOR_ORGANISATION_SLUG": "punta-cana-discovery",
    "TELEGRAM_MONITOR_BOT_TOKEN": "test-bot-token:secret",
    "TELEGRAM_MONITOR_CHAT_ID": "-1001234567890",
    "TELEGRAM_MONITOR_TIMEOUT_SECONDS": 7,
}


@override_settings(**MONITOR_SETTINGS)
class TelegramMonitorTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="punta-cana-discovery",
            business_type="ticketing",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Tours",
            slug="other-tours",
            business_type="ticketing",
            is_active=True,
        )

    def setUp(self):
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095553001",
            customer_name="María <Customer>",
        )
        self.inbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.telegram.inbound",
            message_type="text",
            text="Is <Saona> available & safe?",
        )

    @patch("ticketing.telegram_monitor.send_telegram_monitor_message_task.delay")
    def test_queue_is_enabled_only_for_configured_whatsapp_tenant(self, delay):
        queued = queue_telegram_monitor_message(self.inbound.pk)

        other_conversation = CustomerAIConversation.objects.create(
            organisation=self.other_organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095553002",
        )
        other_message = CustomerAIMessage.objects.create(
            conversation=other_conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            text="This must never reach the configured channel.",
        )
        rejected = queue_telegram_monitor_message(other_message.pk)

        self.assertTrue(queued)
        self.assertFalse(rejected)
        delay.assert_called_once_with(self.inbound.pk)

    @override_settings(TELEGRAM_MONITOR_ENABLED=False)
    @patch("ticketing.telegram_monitor.send_telegram_monitor_message_task.delay")
    def test_disabled_monitor_does_not_enqueue(self, delay):
        self.assertFalse(queue_telegram_monitor_message(self.inbound.pk))
        delay.assert_not_called()

    @override_settings(TELEGRAM_MONITOR_BOT_TOKEN="")
    @patch("ticketing.telegram_monitor.send_telegram_monitor_message_task.delay")
    def test_incomplete_configuration_fails_closed(self, delay):
        self.assertFalse(queue_telegram_monitor_message(self.inbound.pk))
        delay.assert_not_called()

    def test_formatter_escapes_customer_content_and_identifies_direction(self):
        inbound_text = format_telegram_monitor_message(self.inbound)
        self.assertIn("👤 Customer message", inbound_text)
        self.assertIn("María &lt;Customer&gt;", inbound_text)
        self.assertIn("Is &lt;Saona&gt; available &amp; safe?", inbound_text)
        self.assertNotIn("<Saona>", inbound_text)

        outbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            message_type="text",
            text="Yes, it is available.",
        )
        outbound_text = format_telegram_monitor_message(outbound)
        self.assertIn("🤖 AI response", outbound_text)
        self.assertIn("Yes, it is available.", outbound_text)

    @patch("ticketing.telegram_monitor.requests.post")
    def test_send_posts_to_private_chat_with_timeout(self, post):
        response = Mock(status_code=200)
        response.json.return_value = {"ok": True, "result": {"message_id": 10}}
        post.return_value = response

        result = send_telegram_monitor_message(self.inbound.pk)

        self.assertEqual(result, {"action": "sent", "message_id": self.inbound.pk})
        url = post.call_args.args[0]
        kwargs = post.call_args.kwargs
        self.assertEqual(
            url,
            "https://api.telegram.org/bottest-bot-token:secret/sendMessage",
        )
        self.assertEqual(kwargs["json"]["chat_id"], "-1001234567890")
        self.assertEqual(kwargs["json"]["parse_mode"], "HTML")
        self.assertEqual(kwargs["timeout"], 7)
        self.inbound.refresh_from_db()
        self.assertEqual(
            self.inbound.metadata["telegram_monitor"]["telegram_message_id"],
            "10",
        )

        repeated = send_telegram_monitor_message(self.inbound.pk)
        self.assertEqual(
            repeated,
            {"action": "already_sent", "message_id": self.inbound.pk},
        )
        self.assertEqual(post.call_count, 1)

    @patch("ticketing.telegram_monitor.requests.post")
    def test_request_failure_raises_sanitized_error(self, post):
        post.side_effect = requests.ConnectionError(
            "https://api.telegram.org/bottest-bot-token:secret/sendMessage failed"
        )

        with self.assertRaises(TelegramMonitorDeliveryError) as raised:
            send_telegram_monitor_message(self.inbound.pk)

        self.assertNotIn("test-bot-token", str(raised.exception))
        self.assertIsNone(raised.exception.__cause__)

    @patch("ticketing.telegram_monitor.requests.post")
    def test_rejected_response_does_not_expose_provider_body(self, post):
        response = Mock(status_code=401, text="token=test-bot-token:secret")
        post.return_value = response

        with self.assertRaises(TelegramMonitorDeliveryError) as raised:
            send_telegram_monitor_message(self.inbound.pk)

        self.assertNotIn("test-bot-token", str(raised.exception))
