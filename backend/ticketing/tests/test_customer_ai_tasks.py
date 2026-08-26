"""Tests for retry-safe asynchronous customer AI message processing."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone

from organisations.models import Organisation
from ticketing.ai.customer.agent import CustomerAgentTurnResult
from ticketing.customer_ai_models import CustomerAIConversation, CustomerAIMessage
from ticketing.customer_ai_tasks import (
    AI_STATE_KEY,
    CustomerAITaskConfigurationError,
    CustomerAITaskRuntime,
    STATE_FAILED,
    STATE_GENERATED,
    STATE_PROCESSING,
    STATE_SENT,
    STATE_SHADOW,
    STATE_SKIPPED,
    get_customer_ai_runtime_factory,
    process_customer_ai_message_task,
)


class FakeAgent:
    def __init__(self):
        self.calls = []
        self.error = None
        self.before_return = None
        self.result = CustomerAgentTurnResult(
            reply_text="Saona is available Thursday. Would you like the link?",
            response_id="response-test-123",
            executed_tools=(),
        )

    def run_turn(self, context):
        self.calls.append(context)
        if self.error is not None:
            raise self.error
        if self.before_return is not None:
            self.before_return(context)
        return self.result


class FakeSender:
    def __init__(self):
        self.calls = []
        self.error = None
        self.provider_message_id = "wamid.outbound.task-test"

    def send_text(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.provider_message_id


class FakeRuntimeFactory:
    runtime = None
    calls = []

    @classmethod
    def reset(cls):
        cls.runtime = None
        cls.calls = []

    def build(self, **kwargs):
        self.__class__.calls.append(kwargs)
        return self.__class__.runtime


class RetryRequested(RuntimeError):
    """Raised by the mocked Celery retry method in failure-path tests."""


@override_settings(
    CUSTOMER_AI_RUNTIME_FACTORY=(
        "ticketing.tests.test_customer_ai_tasks.FakeRuntimeFactory"
    )
)
class CustomerAIMessageTaskTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Punta Cana Discovery",
            slug="customer-ai-task-org",
            business_type="ticketing",
            is_active=True,
        )

    def setUp(self):
        FakeRuntimeFactory.reset()
        self.agent = FakeAgent()
        self.sender = FakeSender()
        FakeRuntimeFactory.runtime = self.runtime()
        self.conversation = CustomerAIConversation.objects.create(
            organisation=self.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095554001",
            language="en",
        )
        self.inbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.inbound.task-test",
            message_type="text",
            text="Can I book Saona for Thursday?",
            metadata={"source": "meta_whatsapp"},
        )

    def runtime(
        self,
        *,
        enabled=True,
        shadow_mode=False,
        sender=True,
        max_reply_characters=600,
    ):
        return CustomerAITaskRuntime(
            agent=self.agent,
            sender=self.sender if sender else None,
            enabled=enabled,
            shadow_mode=shadow_mode,
            model="gpt-test",
            max_reply_characters=max_reply_characters,
        )

    def state(self):
        self.inbound.refresh_from_db()
        return self.inbound.metadata[AI_STATE_KEY]

    def run_task(self, message_id=None):
        return process_customer_ai_message_task.run(message_id or self.inbound.pk)

    def run_expecting_retry(self):
        with patch.object(
            process_customer_ai_message_task,
            "retry",
            side_effect=RetryRequested("retry requested"),
        ) as retry:
            with self.assertRaises(RetryRequested):
                self.run_task()
        return retry

    def test_missing_or_non_customer_inbound_message_returns_missing(self):
        missing = self.run_task(message_id=999999)
        outbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            text="Existing outbound",
        )
        wrong_direction = self.run_task(message_id=outbound.pk)

        self.assertEqual(missing, {"action": "missing"})
        self.assertEqual(wrong_direction, {"action": "missing"})
        self.assertEqual(FakeRuntimeFactory.calls, [])

    def test_success_generates_sends_and_checkpoints_once(self):
        result = self.run_task()

        self.assertEqual(result["action"], "sent")
        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(len(self.sender.calls), 1)
        context = self.agent.calls[0]
        self.assertEqual(context.customer_message, self.inbound.text)
        self.assertEqual(context.organisation, self.organisation)
        self.assertEqual(context.conversation, self.conversation)
        self.assertEqual(context.model, "gpt-test")
        self.assertEqual(context.metadata["inbound_message_id"], self.inbound.pk)
        self.assertNotIn("api_key", context.metadata)

        outbound = CustomerAIMessage.objects.get(
            pk=result["outbound_message_id"]
        )
        self.assertEqual(outbound.text, self.agent.result.reply_text)
        self.assertEqual(
            outbound.external_message_id, self.sender.provider_message_id
        )
        self.assertEqual(outbound.metadata["delivery_status"], "sent")
        self.assertEqual(outbound.metadata["reply_to_message_id"], self.inbound.external_message_id)
        self.assertEqual(self.state()["status"], STATE_SENT)
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.last_response_id, "response-test-123")
        self.assertIsNotNone(self.conversation.last_outbound_at)
        self.assertEqual(
            self.sender.calls[0]["idempotency_key"],
            f"customer-ai-reply:{self.inbound.pk}",
        )

    def test_repeated_finished_task_does_not_generate_or_send_twice(self):
        first = self.run_task()
        second = self.run_task()

        self.assertEqual(first["action"], "sent")
        self.assertEqual(second, {"action": "finished", "status": STATE_SENT})
        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(len(self.sender.calls), 1)
        self.assertEqual(
            CustomerAIMessage.objects.filter(
                direction=CustomerAIMessage.DIRECTION_OUTBOUND
            ).count(),
            1,
        )

    def test_disabled_runtime_skips_without_generation_or_delivery(self):
        FakeRuntimeFactory.runtime = self.runtime(enabled=False)
        result = self.run_task()

        self.assertEqual(result, {"action": "skipped", "reason": "disabled"})
        self.assertEqual(self.state()["status"], STATE_SKIPPED)
        self.assertEqual(self.agent.calls, [])
        self.assertEqual(self.sender.calls, [])

    def test_human_owned_conversation_is_skipped_before_factory_build(self):
        self.conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        self.conversation.save(update_fields=("status", "updated_at"))
        result = self.run_task()

        self.assertEqual(result, {"action": "skipped", "reason": "human_owned"})
        self.assertEqual(self.state()["status"], STATE_SKIPPED)
        self.assertEqual(FakeRuntimeFactory.calls, [])

    def test_shadow_mode_generates_without_sender_delivery(self):
        FakeRuntimeFactory.runtime = self.runtime(shadow_mode=True, sender=False)
        result = self.run_task()

        self.assertEqual(result["action"], "shadow")
        self.assertEqual(self.state()["status"], STATE_SHADOW)
        outbound = CustomerAIMessage.objects.get(pk=result["outbound_message_id"])
        self.assertTrue(outbound.metadata["shadow_mode"])
        self.assertEqual(outbound.external_message_id, "")
        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(self.sender.calls, [])

    def test_active_processing_lease_returns_busy(self):
        self.inbound.metadata = {
            AI_STATE_KEY: {
                "status": STATE_PROCESSING,
                "claimed_at": timezone.now().isoformat(),
                "attempts": 1,
            }
        }
        self.inbound.save(update_fields=("metadata",))
        result = self.run_task()

        self.assertEqual(result, {"action": "busy"})
        self.assertEqual(FakeRuntimeFactory.calls, [])

    def test_expired_processing_lease_is_reclaimed(self):
        self.inbound.metadata = {
            AI_STATE_KEY: {
                "status": STATE_PROCESSING,
                "claimed_at": (timezone.now() - timedelta(minutes=11)).isoformat(),
                "attempts": 2,
            }
        }
        self.inbound.save(update_fields=("metadata",))
        result = self.run_task()

        self.assertEqual(result["action"], "sent")
        self.assertEqual(self.state()["attempts"], 3)

    def test_generated_checkpoint_resumes_delivery_without_regeneration(self):
        outbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_OUTBOUND,
            role=CustomerAIMessage.ROLE_ASSISTANT,
            text="Previously generated reply",
            metadata={"shadow_mode": False},
        )
        self.inbound.metadata = {
            AI_STATE_KEY: {
                "status": STATE_GENERATED,
                "outbound_message_id": outbound.pk,
            }
        }
        self.inbound.save(update_fields=("metadata",))

        result = self.run_task()

        self.assertEqual(result["action"], "sent")
        self.assertEqual(self.agent.calls, [])
        self.assertEqual(len(self.sender.calls), 1)
        self.assertEqual(self.sender.calls[0]["text"], "Previously generated reply")
        self.assertEqual(self.state()["status"], STATE_SENT)

    def test_sender_failure_retries_then_resumes_without_second_generation(self):
        self.sender.error = RuntimeError("temporary Meta failure")
        retry = self.run_expecting_retry()

        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(len(self.sender.calls), 1)
        failed_state = self.state()
        self.assertEqual(failed_state["status"], STATE_FAILED)
        self.assertIn("outbound_message_id", failed_state)
        retry.assert_called_once()

        self.sender.error = None
        result = self.run_task()
        self.assertEqual(result["action"], "sent")
        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(len(self.sender.calls), 2)
        self.assertEqual(
            CustomerAIMessage.objects.filter(direction="outbound").count(), 1
        )

    def test_agent_failure_records_safe_error_type_and_requests_retry(self):
        self.agent.error = RuntimeError("provider secret details must not be stored")
        retry = self.run_expecting_retry()

        state = self.state()
        self.assertEqual(state["status"], STATE_FAILED)
        self.assertEqual(state["error_type"], "RuntimeError")
        self.assertNotIn("provider secret details", str(self.inbound.metadata))
        self.assertEqual(CustomerAIMessage.objects.filter(direction="outbound").count(), 0)
        retry.assert_called_once()

    def test_missing_sender_records_failure_after_generation(self):
        FakeRuntimeFactory.runtime = self.runtime(sender=False)
        self.run_expecting_retry()

        state = self.state()
        self.assertEqual(state["status"], STATE_FAILED)
        self.assertEqual(state["error_type"], "CustomerAITaskConfigurationError")
        self.assertIn("outbound_message_id", state)
        self.assertEqual(len(self.agent.calls), 1)

    def test_invalid_runtime_and_reply_limit_request_retry(self):
        invalid_values = (
            object(),
            self.runtime(max_reply_characters=79),
            self.runtime(max_reply_characters=1201),
        )
        for index, runtime in enumerate(invalid_values):
            with self.subTest(index=index):
                self.inbound.metadata = {}
                self.inbound.save(update_fields=("metadata",))
                FakeRuntimeFactory.runtime = runtime
                self.run_expecting_retry()
                self.assertEqual(self.state()["status"], STATE_FAILED)

    def test_human_ownership_started_during_generation_prevents_outbound(self):
        def take_ownership(_context):
            CustomerAIConversation.objects.filter(pk=self.conversation.pk).update(
                status=CustomerAIConversation.STATUS_HUMAN_OWNED,
                human_owned_at=timezone.now(),
            )

        self.agent.before_return = take_ownership
        self.run_expecting_retry()

        self.assertEqual(CustomerAIMessage.objects.filter(direction="outbound").count(), 0)
        self.assertEqual(self.state()["status"], STATE_FAILED)

    def test_handoff_requested_during_generation_sends_one_final_notice(self):
        def request_handoff(_context):
            CustomerAIConversation.objects.filter(pk=self.conversation.pk).update(
                status=CustomerAIConversation.STATUS_HANDOFF_REQUESTED,
                handoff_category="missing_information",
                handoff_reason="Pickup time requires confirmation.",
                handoff_requested_at=timezone.now(),
            )

        self.agent.result = CustomerAgentTurnResult(
            reply_text=(
                "I need our team to confirm the exact pickup time. "
                "We will reply shortly."
            ),
            response_id="response-handoff-123",
            executed_tools=("request_handoff",),
        )
        self.agent.before_return = request_handoff

        first = self.run_task()
        second = self.run_task()

        self.assertEqual(first["action"], "sent")
        self.assertEqual(second, {"action": "finished", "status": STATE_SENT})
        self.assertEqual(len(self.agent.calls), 1)
        self.assertEqual(len(self.sender.calls), 1)
        self.conversation.refresh_from_db()
        self.assertEqual(
            self.conversation.status,
            CustomerAIConversation.STATUS_HANDOFF_REQUESTED,
        )

        later_inbound = CustomerAIMessage.objects.create(
            conversation=self.conversation,
            direction=CustomerAIMessage.DIRECTION_INBOUND,
            role=CustomerAIMessage.ROLE_CUSTOMER,
            external_message_id="wamid.inbound.after-handoff",
            message_type="text",
            text="Any update?",
            metadata={"source": "meta_whatsapp"},
        )
        later_result = self.run_task(message_id=later_inbound.pk)
        later_inbound.refresh_from_db()

        self.assertEqual(
            later_result,
            {"action": "skipped", "reason": "human_owned"},
        )
        self.assertEqual(
            later_inbound.metadata[AI_STATE_KEY]["status"],
            STATE_SKIPPED,
        )
        self.assertEqual(len(self.sender.calls), 1)

    def test_provider_message_id_is_bounded_to_model_limit(self):
        self.sender.provider_message_id = "m" * 700
        result = self.run_task()
        outbound = CustomerAIMessage.objects.get(pk=result["outbound_message_id"])

        self.assertEqual(len(outbound.external_message_id), 512)
        self.assertEqual(self.state()["status"], STATE_SENT)

    def test_existing_finished_states_return_without_runtime_factory(self):
        for status in (STATE_SENT, STATE_SHADOW, STATE_SKIPPED):
            with self.subTest(status=status):
                self.inbound.metadata = {AI_STATE_KEY: {"status": status}}
                self.inbound.save(update_fields=("metadata",))
                result = self.run_task()
                self.assertEqual(result, {"action": "finished", "status": status})
        self.assertEqual(FakeRuntimeFactory.calls, [])

    @override_settings(CUSTOMER_AI_RUNTIME_FACTORY="")
    def test_runtime_factory_setting_is_required(self):
        with self.assertRaises(CustomerAITaskConfigurationError):
            get_customer_ai_runtime_factory()

    @override_settings(
        CUSTOMER_AI_RUNTIME_FACTORY="ticketing.tests.test_customer_ai_tasks.InvalidFactory"
    )
    def test_runtime_factory_must_provide_build_method(self):
        with self.assertRaises(CustomerAITaskConfigurationError):
            get_customer_ai_runtime_factory()


class InvalidFactory:
    pass
