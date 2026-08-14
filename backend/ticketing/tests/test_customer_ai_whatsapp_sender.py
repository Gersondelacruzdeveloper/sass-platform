from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.ai.customer.whatsapp_sender import (
    CustomerWhatsAppSenderBusyError,
    CustomerWhatsAppSenderConfigurationError,
    CustomerWhatsAppSenderError,
    TenantWhatsAppCustomerSender,
    TenantWhatsAppCustomerSenderFactory,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIMessage,
)
from ticketing.models import TicketingWhatsAppSettings


class CustomerAIWhatsAppSenderTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="WhatsApp sender tenant",
            slug="whatsapp-sender-tenant",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other WhatsApp tenant",
            slug="other-whatsapp-tenant",
            is_active=True,
        )
        cls.whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=cls.organisation,
            is_active=True,
            business_account_id="waba-tenant-one",
            phone_number_id="phone-id-tenant-one",
            access_token="test-token",
            connection_status="connected",
            webhook_subscribed=True,
        )
        cls.other_whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=cls.other_organisation,
            is_active=True,
            business_account_id="waba-tenant-two",
            phone_number_id="phone-id-tenant-two",
            access_token="other-test-token",
            connection_status="connected",
            webhook_subscribed=True,
        )

    def setUp(self):
        cache.clear()
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550101",
            status=CustomerAIConversation.STATUS_ACTIVE,
            language="en",
        )
        self.inbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id=f"wamid.inbound.{self.conversation.pk}",
            message_type="text",
            text="Yes, please continue.",
            occurred_at=timezone.now(),
        )
        self.outbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            external_message_id="",
            message_type="text",
            text="Great! Here is your secure checkout link: https://tenant.test/checkout",
            metadata={
                "reply_to_message_id": self.inbound.external_message_id,
                "delivery_status": "generated",
            },
            occurred_at=timezone.now(),
        )
        self.service = Mock()
        self.service.normalize_phone_number.return_value = "18095550101"
        self.service.send_text.return_value = SimpleNamespace(
            message_id="wamid.outbound.123"
        )
        self.sender = TenantWhatsAppCustomerSender(
            organisation=self.organisation,
            conversation=self.conversation,
            whatsapp_settings=self.whatsapp_settings,
            service=self.service,
        )

    @property
    def idempotency_key(self):
        return f"customer-ai-reply:{self.inbound.pk}"

    def _send(self, **overrides):
        values = {
            "organisation": self.organisation,
            "conversation": self.conversation,
            "text": self.outbound.text,
            "idempotency_key": self.idempotency_key,
        }
        values.update(overrides)
        return self.sender.send_text(**values)

    def test_send_uses_bound_recipient_and_persists_provider_id(self):
        result = self._send()

        self.assertEqual(result, "wamid.outbound.123")
        self.service.send_text.assert_called_once_with(
            "18095550101",
            self.outbound.text,
            preview_url=True,
        )
        self.outbound.refresh_from_db()
        self.assertEqual(self.outbound.external_message_id, "wamid.outbound.123")
        self.assertEqual(self.outbound.metadata["delivery_status"], "accepted")
        self.assertEqual(
            self.outbound.metadata["send_idempotency_key"],
            self.idempotency_key,
        )

    def test_retry_returns_persisted_provider_id_without_resending(self):
        self.outbound.external_message_id = "wamid.existing"
        self.outbound.save(update_fields=("external_message_id",))

        result = self._send()

        self.assertEqual(result, "wamid.existing")
        self.service.send_text.assert_not_called()

    def test_cache_lock_blocks_concurrent_duplicate_send(self):
        with patch(
            "ticketing.ai.customer.whatsapp_sender.cache.add",
            return_value=False,
        ):
            with self.assertRaises(CustomerWhatsAppSenderBusyError):
                self._send()
        self.service.send_text.assert_not_called()

    def test_wrong_generated_text_is_rejected(self):
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send(text="Different model text")
        self.service.send_text.assert_not_called()

    def test_invalid_or_cross_conversation_idempotency_key_is_rejected(self):
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send(idempotency_key="unsafe-key")

        other_conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550199",
            status=CustomerAIConversation.STATUS_ACTIVE,
        )
        other_inbound = CustomerAIMessage.objects.create(
            conversation=other_conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.other",
            text="Yes",
        )
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send(
                idempotency_key=f"customer-ai-reply:{other_inbound.pk}"
            )
        self.service.send_text.assert_not_called()

    def test_unnormalized_recipient_is_rejected(self):
        self.conversation.external_customer_id = "+1 (809) 555-0101"
        self.conversation.save(update_fields=("external_customer_id",))
        self.service.normalize_phone_number.return_value = "18095550101"

        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send()
        self.service.send_text.assert_not_called()

    def test_human_ownership_beginning_before_send_blocks_delivery(self):
        self.conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.conversation.save(update_fields=("status",))

        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send()
        self.service.send_text.assert_not_called()

    def test_disconnected_settings_before_send_block_delivery(self):
        self.whatsapp_settings.connection_status = "disconnected"
        self.whatsapp_settings.save(update_fields=("connection_status",))

        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send()
        self.service.send_text.assert_not_called()

    def test_factory_rejects_cross_tenant_settings(self):
        factory = TenantWhatsAppCustomerSenderFactory()
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            factory.build_customer_sender(
                organisation=self.organisation,
                conversation=self.conversation,
                whatsapp_settings=self.other_whatsapp_settings,
            )

    def test_sender_rejects_different_tenant_at_call_time(self):
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send(organisation=self.other_organisation)
        self.service.send_text.assert_not_called()

    def test_missing_inbound_provider_id_is_rejected(self):
        self.inbound.external_message_id = ""
        self.inbound.save(update_fields=("external_message_id",))
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send()
        self.service.send_text.assert_not_called()

    def test_multiple_generated_replies_are_rejected(self):
        CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            text=self.outbound.text,
            metadata={"reply_to_message_id": self.inbound.external_message_id},
        )
        with self.assertRaises(CustomerWhatsAppSenderConfigurationError):
            self._send()
        self.service.send_text.assert_not_called()

    def test_service_failure_does_not_mark_outbound_as_sent(self):
        self.service.send_text.side_effect = CustomerWhatsAppSenderError(
            "Meta unavailable"
        )
        with self.assertRaises(CustomerWhatsAppSenderError):
            self._send()
        self.outbound.refresh_from_db()
        self.assertEqual(self.outbound.external_message_id, "")
        self.assertNotEqual(
            self.outbound.metadata.get("delivery_status"),
            "accepted",
        )
