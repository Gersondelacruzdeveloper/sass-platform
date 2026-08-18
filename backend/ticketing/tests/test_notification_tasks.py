"""Tests for retry-safe booking notification Celery tasks.

All notification delivery is mocked at the boundary imported by ``ticketing.tasks``.
These tests never contact email, Meta/WhatsApp, Stripe, PayPal, OpenAI, or any
other external provider and run synchronously without a Celery worker.
"""

from __future__ import annotations

from unittest.mock import Mock, patch

from celery.exceptions import MaxRetriesExceededError
from django.test import TestCase

from organisations.models import Organisation
from ticketing.models import Booking, NotificationLog
from ticketing.tasks import (
    _has_failed_logs,
    _serialize_logs,
    retry_failed_notification_task,
    send_booking_created_notifications_task,
    send_booking_notifications_task,
    send_payment_confirmed_notifications_task,
)


class RetryRequested(RuntimeError):
    """Sentinel raised by mocked Celery ``retry`` calls in unit tests."""


class NotificationTaskTests(TestCase):
    def setUp(self):
        super().setUp()
        self._close_connections_patcher = patch("ticketing.tasks.close_old_connections")
        self.close_old_connections = self._close_connections_patcher.start()
        self.addCleanup(self._close_connections_patcher.stop)

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Notification Task Organisation",
            slug="notification-task-organisation",
            business_type="ticketing",
            is_active=True,
        )

    def make_booking(self, **overrides):
        values = {
            "organisation": self.organisation,
            "customer_name": "Notification Customer",
            "customer_email": "customer@example.com",
            "customer_whatsapp": "+18095550123",
            "total_amount": "100.00",
            "balance_due": "100.00",
            "payment_status": "unpaid",
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_log(self, booking, **overrides):
        values = {
            "organisation": booking.organisation,
            "booking": booking,
            "channel": "email",
            "recipient": "customer@example.com",
            "subject": "Booking update",
            "message": "Safe notification body",
            "status": "sent",
            "provider_response": {
                "audience": "customer",
                "provider_message_id": "provider-message-123",
            },
        }
        values.update(overrides)
        return NotificationLog.objects.create(**values)

    def run_expecting_retry(self, task, *args):
        with patch.object(
            task,
            "retry",
            side_effect=RetryRequested("retry requested"),
        ) as retry:
            with self.assertRaises(RetryRequested):
                task.run(*args)
        return retry

    # ------------------------------------------------------------------
    # Pure task helpers
    # ------------------------------------------------------------------

    def test_serialize_logs_returns_only_safe_task_result_fields(self):
        booking = self.make_booking()
        log = self.make_log(
            booking,
            provider_response={
                "audience": "customer",
                "access_token": "super-secret-token",
                "encrypted_credentials": "ciphertext-must-not-leak",
                "provider_payload": {"authorization": "Bearer secret"},
            },
            message="message-body-must-not-be-in-task-result",
        )

        result = _serialize_logs([log])

        self.assertEqual(
            result,
            [
                {
                    "notification_log_id": log.id,
                    "channel": "email",
                    "recipient": "customer@example.com",
                    "status": "sent",
                }
            ],
        )
        serialized_text = repr(result)
        self.assertNotIn("super-secret-token", serialized_text)
        self.assertNotIn("ciphertext-must-not-leak", serialized_text)
        self.assertNotIn("Bearer secret", serialized_text)
        self.assertNotIn("message-body-must-not-be-in-task-result", serialized_text)

    def test_serialize_logs_accepts_none_single_log_and_falsey_values(self):
        booking = self.make_booking()
        log = self.make_log(booking)

        self.assertEqual(_serialize_logs(None), [])
        self.assertEqual(_serialize_logs([None]), [])
        self.assertEqual(_serialize_logs(log)[0]["notification_log_id"], log.id)

    def test_has_failed_logs_only_treats_failed_status_as_retryable(self):
        booking = self.make_booking()
        sent = self.make_log(booking, status="sent")
        skipped = self.make_log(
            booking,
            channel="whatsapp",
            recipient="+18095550123",
            status="skipped",
        )
        failed = self.make_log(
            booking,
            channel="whatsapp",
            recipient="+18095550124",
            status="failed",
        )

        self.assertFalse(_has_failed_logs(None))
        self.assertFalse(_has_failed_logs([sent, skipped]))
        self.assertTrue(_has_failed_logs(failed))
        self.assertTrue(_has_failed_logs([sent, failed]))

    # ------------------------------------------------------------------
    # Booking-created task
    # ------------------------------------------------------------------

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_booking_created_success_returns_serialized_logs(self, booking_created):
        booking = self.make_booking()
        log = self.make_log(
            booking,
            recipient="owner@example.com",
            provider_response={"audience": "owner"},
        )
        booking_created.return_value = [log]

        result = send_booking_created_notifications_task.run(booking.id)

        booking_created.assert_called_once()
        called_booking = booking_created.call_args.args[0]
        self.assertEqual(called_booking.id, booking.id)
        self.assertEqual(
            result,
            [
                {
                    "notification_log_id": log.id,
                    "channel": "email",
                    "recipient": "owner@example.com",
                    "status": "sent",
                }
            ],
        )

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_booking_created_missing_booking_is_safe_noop(self, booking_created):
        result = send_booking_created_notifications_task.run(999999)

        self.assertEqual(result, [])
        booking_created.assert_not_called()

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_booking_created_failed_log_requests_retry(self, booking_created):
        booking = self.make_booking()
        failed = self.make_log(
            booking,
            recipient="owner@example.com",
            status="failed",
            provider_response={"audience": "owner"},
        )
        booking_created.return_value = [failed]

        retry = self.run_expecting_retry(
            send_booking_created_notifications_task,
            booking.id,
        )

        retry.assert_called_once()
        retry_exc = retry.call_args.kwargs["exc"]
        self.assertIsInstance(retry_exc, RuntimeError)
        self.assertIn("notifications failed", str(retry_exc))

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_booking_created_service_exception_requests_retry_without_returning_secret(
        self,
        booking_created,
    ):
        booking = self.make_booking()
        secret = "provider-secret-must-not-be-returned"
        booking_created.side_effect = RuntimeError(secret)

        retry = self.run_expecting_retry(
            send_booking_created_notifications_task,
            booking.id,
        )

        retry.assert_called_once()
        self.assertIsInstance(retry.call_args.kwargs["exc"], RuntimeError)
        # The task raises retry rather than returning provider exception text.
        self.assertNotEqual(str(retry.call_args.kwargs["exc"]), "retry requested")

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_booking_created_permanent_failure_propagates_max_retries(
        self,
        booking_created,
    ):
        booking = self.make_booking()
        booking_created.return_value = [
            self.make_log(booking, status="failed")
        ]

        with patch.object(
            send_booking_created_notifications_task,
            "retry",
            side_effect=MaxRetriesExceededError(),
        ) as retry:
            with self.assertRaises(MaxRetriesExceededError):
                send_booking_created_notifications_task.run(booking.id)

        retry.assert_called_once()

    # ------------------------------------------------------------------
    # Payment-confirmed task
    # ------------------------------------------------------------------

    @patch("ticketing.tasks.BookingNotificationService.payment_confirmed")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_payment_confirmed_unpaid_booking_is_skipped_without_delivery(
        self,
        is_payment_confirmed,
        payment_confirmed,
    ):
        booking = self.make_booking(payment_status="unpaid")
        is_payment_confirmed.return_value = False

        result = send_payment_confirmed_notifications_task.run(booking.id)

        self.assertEqual(result, [])
        is_payment_confirmed.assert_called_once()
        payment_confirmed.assert_not_called()

    @patch("ticketing.tasks.BookingNotificationService.payment_confirmed")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_payment_confirmed_success_returns_email_and_whatsapp_logs(
        self,
        is_payment_confirmed,
        payment_confirmed,
    ):
        booking = self.make_booking(
            payment_status="deposit_paid",
            balance_due="75.00",
        )
        is_payment_confirmed.return_value = True
        email_log = self.make_log(booking, channel="email")
        whatsapp_log = self.make_log(
            booking,
            channel="whatsapp",
            recipient="+18095550123",
        )
        payment_confirmed.return_value = [email_log, whatsapp_log]

        result = send_payment_confirmed_notifications_task.run(booking.id)

        payment_confirmed.assert_called_once()
        self.assertEqual(len(result), 2)
        self.assertEqual(
            {item["notification_log_id"] for item in result},
            {email_log.id, whatsapp_log.id},
        )

    @patch("ticketing.tasks.BookingNotificationService.payment_confirmed")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_payment_confirmed_failed_log_requests_retry(
        self,
        is_payment_confirmed,
        payment_confirmed,
    ):
        booking = self.make_booking(payment_status="paid", balance_due="0.00")
        is_payment_confirmed.return_value = True
        payment_confirmed.return_value = [self.make_log(booking, status="failed")]

        retry = self.run_expecting_retry(
            send_payment_confirmed_notifications_task,
            booking.id,
        )

        retry.assert_called_once()
        self.assertIn(
            "payment-confirmed notifications failed",
            str(retry.call_args.kwargs["exc"]),
        )

    @patch("ticketing.tasks.BookingNotificationService.payment_confirmed")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_payment_confirmed_service_exception_requests_retry(
        self,
        is_payment_confirmed,
        payment_confirmed,
    ):
        booking = self.make_booking(payment_status="paid", balance_due="0.00")
        is_payment_confirmed.return_value = True
        payment_confirmed.side_effect = ConnectionError("temporary provider outage")

        retry = self.run_expecting_retry(
            send_payment_confirmed_notifications_task,
            booking.id,
        )

        retry.assert_called_once()
        self.assertIsInstance(retry.call_args.kwargs["exc"], ConnectionError)

    # ------------------------------------------------------------------
    # Dispatcher
    # ------------------------------------------------------------------

    @patch("ticketing.tasks.send_booking_created_notifications_task.apply")
    def test_dispatcher_routes_booking_created_event_synchronously(self, apply):
        apply.return_value = Mock(result=[{"status": "sent"}])

        result = send_booking_notifications_task.run(123, " BOOKING_CREATED ")

        apply.assert_called_once_with(args=[123], throw=True)
        self.assertEqual(result, [{"status": "sent"}])

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.apply")
    def test_dispatcher_routes_payment_confirmed_event_synchronously(self, apply):
        apply.return_value = Mock(result=None)

        result = send_booking_notifications_task.run(456, "payment_confirmed")

        apply.assert_called_once_with(args=[456], throw=True)
        self.assertEqual(result, [])

    def test_dispatcher_rejects_unsupported_event_without_delivery(self):
        with patch(
            "ticketing.tasks.send_booking_created_notifications_task.apply"
        ) as created_apply, patch(
            "ticketing.tasks.send_payment_confirmed_notifications_task.apply"
        ) as payment_apply:
            with self.assertRaisesMessage(
                ValueError,
                "Unsupported booking notification event",
            ):
                send_booking_notifications_task.run(1, "refund_completed")

        created_apply.assert_not_called()
        payment_apply.assert_not_called()

    # ------------------------------------------------------------------
    # Failed-notification retry task
    # ------------------------------------------------------------------

    @patch("ticketing.tasks.BookingNotificationService.send_owner_notification")
    def test_retry_failed_owner_notification_routes_by_audience(self, send_owner):
        booking = self.make_booking()
        failed_log = self.make_log(
            booking,
            recipient="owner@example.com",
            status="failed",
            provider_response={"audience": "owner"},
        )
        replacement = self.make_log(
            booking,
            recipient="owner@example.com",
            status="sent",
            provider_response={"audience": "owner"},
        )
        send_owner.return_value = replacement

        result = retry_failed_notification_task.run(failed_log.id)

        send_owner.assert_called_once()
        self.assertEqual(result[0]["notification_log_id"], replacement.id)

    @patch(
        "ticketing.tasks.BookingNotificationService.send_customer_email_confirmation"
    )
    def test_retry_failed_customer_email_routes_by_channel(self, send_email):
        booking = self.make_booking(payment_status="paid", balance_due="0.00")
        failed_log = self.make_log(
            booking,
            channel="email",
            status="failed",
            provider_response={"audience": "customer"},
        )
        replacement = self.make_log(booking, channel="email", status="sent")
        send_email.return_value = replacement

        result = retry_failed_notification_task.run(failed_log.id)

        send_email.assert_called_once()
        called_booking = send_email.call_args.args[0]
        self.assertEqual(called_booking.id, booking.id)
        self.assertTrue(send_email.call_args.kwargs["require_payment"])
        self.assertEqual(result[0]["notification_log_id"], replacement.id)

    @patch(
        "ticketing.tasks.BookingNotificationService.send_customer_whatsapp_confirmation"
    )
    def test_retry_failed_customer_whatsapp_routes_by_channel(self, send_whatsapp):
        booking = self.make_booking(payment_status="paid", balance_due="0.00")
        failed_log = self.make_log(
            booking,
            channel="whatsapp",
            recipient="+18095550123",
            status="failed",
            provider_response={"audience": "customer"},
        )
        replacement = self.make_log(
            booking,
            channel="whatsapp",
            recipient="+18095550123",
            status="sent",
        )
        send_whatsapp.return_value = replacement

        result = retry_failed_notification_task.run(failed_log.id)

        send_whatsapp.assert_called_once()
        self.assertTrue(send_whatsapp.call_args.kwargs["require_payment"])
        self.assertEqual(result[0]["notification_log_id"], replacement.id)

    def test_retry_nonfailed_log_is_idempotent_noop(self):
        booking = self.make_booking()
        sent_log = self.make_log(booking, status="sent")

        with patch(
            "ticketing.tasks.BookingNotificationService.send_owner_notification"
        ) as owner, patch(
            "ticketing.tasks.BookingNotificationService.payment_confirmed"
        ) as payment, patch(
            "ticketing.tasks.BookingNotificationService.booking_created"
        ) as created:
            first = retry_failed_notification_task.run(sent_log.id)
            second = retry_failed_notification_task.run(sent_log.id)

        self.assertEqual(first, second)
        self.assertEqual(first[0]["notification_log_id"], sent_log.id)
        owner.assert_not_called()
        payment.assert_not_called()
        created.assert_not_called()

    def test_retry_missing_notification_log_is_safe_noop(self):
        self.assertEqual(retry_failed_notification_task.run(999999), [])

    @patch("ticketing.tasks.BookingNotificationService.payment_confirmed")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_retry_legacy_log_uses_payment_event_when_booking_is_confirmed(
        self,
        is_payment_confirmed,
        payment_confirmed,
    ):
        booking = self.make_booking(payment_status="paid", balance_due="0.00")
        failed_log = self.make_log(
            booking,
            status="failed",
            provider_response={},
        )
        replacement = self.make_log(booking, status="sent")
        is_payment_confirmed.return_value = True
        payment_confirmed.return_value = [replacement]

        result = retry_failed_notification_task.run(failed_log.id)

        payment_confirmed.assert_called_once()
        self.assertEqual(result[0]["notification_log_id"], replacement.id)

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    @patch("ticketing.tasks.BookingNotificationService.is_payment_confirmed")
    def test_retry_legacy_log_uses_booking_created_when_payment_not_confirmed(
        self,
        is_payment_confirmed,
        booking_created,
    ):
        booking = self.make_booking(payment_status="unpaid")
        failed_log = self.make_log(
            booking,
            status="failed",
            provider_response={},
        )
        replacement = self.make_log(booking, status="sent")
        is_payment_confirmed.return_value = False
        booking_created.return_value = [replacement]

        result = retry_failed_notification_task.run(failed_log.id)

        booking_created.assert_called_once()
        self.assertEqual(result[0]["notification_log_id"], replacement.id)

    @patch("ticketing.tasks.BookingNotificationService.send_owner_notification")
    def test_retry_task_retries_when_replacement_log_also_fails(self, send_owner):
        booking = self.make_booking()
        failed_log = self.make_log(
            booking,
            status="failed",
            provider_response={"audience": "owner"},
        )
        send_owner.return_value = self.make_log(
            booking,
            recipient="owner@example.com",
            status="failed",
            provider_response={"audience": "owner"},
        )

        retry = self.run_expecting_retry(
            retry_failed_notification_task,
            failed_log.id,
        )

        retry.assert_called_once()
        self.assertIn(
            "created another failed log",
            str(retry.call_args.kwargs["exc"]),
        )

    @patch("ticketing.tasks.BookingNotificationService.send_owner_notification")
    def test_retry_task_permanent_failure_propagates_max_retries(self, send_owner):
        booking = self.make_booking()
        failed_log = self.make_log(
            booking,
            status="failed",
            provider_response={"audience": "owner"},
        )
        send_owner.return_value = self.make_log(
            booking,
            status="failed",
            provider_response={"audience": "owner"},
        )

        with patch.object(
            retry_failed_notification_task,
            "retry",
            side_effect=MaxRetriesExceededError(),
        ) as retry:
            with self.assertRaises(MaxRetriesExceededError):
                retry_failed_notification_task.run(failed_log.id)

        retry.assert_called_once()

    @patch("ticketing.tasks.BookingNotificationService.booking_created")
    def test_task_closes_old_database_connections_before_and_after_work(
        self,
        booking_created,
    ):
        booking = self.make_booking()
        booking_created.return_value = []
        self.close_old_connections.reset_mock()

        result = send_booking_created_notifications_task.run(booking.id)

        self.assertEqual(result, [])
        self.assertEqual(self.close_old_connections.call_count, 2)
