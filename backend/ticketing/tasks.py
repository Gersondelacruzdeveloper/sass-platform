from __future__ import annotations

import logging
from typing import Any

from celery import shared_task
from django.db import close_old_connections

from ticketing.models import Booking, NotificationLog
from ticketing.notifications.service import BookingNotificationService

logger = logging.getLogger(__name__)


RETRYABLE_NOTIFICATION_STATUSES = {"failed"}
DEFAULT_RETRY_DELAY_SECONDS = 60
DEFAULT_MAX_RETRIES = 3


def _load_booking(booking_id: int) -> Booking:
    """
    Reload a booking with the relationships used by notification services.

    Celery tasks must receive primitive values such as IDs, never Django model
    instances, because model instances can become stale and are not safe task
    payloads.
    """
    return (
        Booking.objects.select_related(
            "organisation",
            "customer",
            "seller",
            "primary_product",
        )
        .prefetch_related(
            "items",
            "items__product",
            "payments",
        )
        .get(pk=booking_id)
    )


def _serialize_logs(logs: Any) -> list[dict[str, Any]]:
    """
    Return a small JSON-serializable summary suitable for Celery results/logs.
    """
    if logs is None:
        return []

    if not isinstance(logs, (list, tuple)):
        logs = [logs]

    serialized = []

    for log in logs:
        if not log:
            continue

        serialized.append(
            {
                "notification_log_id": getattr(log, "id", None),
                "channel": getattr(log, "channel", ""),
                "recipient": getattr(log, "recipient", ""),
                "status": getattr(log, "status", ""),
            }
        )

    return serialized


def _has_failed_logs(logs: Any) -> bool:
    if logs is None:
        return False

    if not isinstance(logs, (list, tuple)):
        logs = [logs]

    return any(
        getattr(log, "status", "") in RETRYABLE_NOTIFICATION_STATUSES
        for log in logs
        if log
    )


@shared_task(
    bind=True,
    autoretry_for=(),
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
    retry_backoff=True,
    retry_backoff_max=15 * 60,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_booking_created_notifications_task(
    self,
    booking_id: int,
) -> list[dict[str, Any]]:
    """
    Send notifications associated with the booking-created event.

    Current rule:
    - Owner email only.

    Customer email/WhatsApp is intentionally not sent here because a newly
    created public booking may still be unpaid.
    """
    close_old_connections()

    try:
        booking = _load_booking(booking_id)
        logs = BookingNotificationService.booking_created(booking)

        if _has_failed_logs(logs):
            raise self.retry(
                exc=RuntimeError(
                    f"One or more booking-created notifications failed for "
                    f"booking {booking.booking_code}."
                )
            )

        return _serialize_logs(logs)

    except Booking.DoesNotExist:
        logger.warning(
            "Booking-created notification task skipped: booking id=%s "
            "does not exist.",
            booking_id,
        )
        return []

    except self.MaxRetriesExceededError:
        logger.exception(
            "Booking-created notifications exhausted retries for booking id=%s.",
            booking_id,
        )
        raise

    except Exception as exc:
        logger.exception(
            "Booking-created notification task failed for booking id=%s.",
            booking_id,
        )
        raise self.retry(exc=exc)

    finally:
        close_old_connections()


@shared_task(
    bind=True,
    autoretry_for=(),
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
    retry_backoff=True,
    retry_backoff_max=15 * 60,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_payment_confirmed_notifications_task(
    self,
    booking_id: int,
) -> list[dict[str, Any]]:
    """
    Send notifications associated with a confirmed customer payment/deposit.

    Current rule:
    - Customer confirmation email, when enabled.
    - Customer WhatsApp confirmation, when enabled.

    Supplier notification will be added after supplier recipient and agreement
    notification settings are finalized.
    """
    close_old_connections()

    try:
        booking = _load_booking(booking_id)

        if not BookingNotificationService.is_payment_confirmed(booking):
            logger.info(
                "Payment-confirmed notification task skipped for booking %s "
                "because payment_status=%s.",
                booking.booking_code,
                booking.payment_status,
            )
            return []

        logs = BookingNotificationService.payment_confirmed(booking)

        if _has_failed_logs(logs):
            raise self.retry(
                exc=RuntimeError(
                    f"One or more payment-confirmed notifications failed for "
                    f"booking {booking.booking_code}."
                )
            )

        return _serialize_logs(logs)

    except Booking.DoesNotExist:
        logger.warning(
            "Payment-confirmed notification task skipped: booking id=%s "
            "does not exist.",
            booking_id,
        )
        return []

    except self.MaxRetriesExceededError:
        logger.exception(
            "Payment-confirmed notifications exhausted retries for "
            "booking id=%s.",
            booking_id,
        )
        raise

    except Exception as exc:
        logger.exception(
            "Payment-confirmed notification task failed for booking id=%s.",
            booking_id,
        )
        raise self.retry(exc=exc)

    finally:
        close_old_connections()


@shared_task(
    bind=True,
    autoretry_for=(),
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
    retry_backoff=True,
    retry_backoff_max=15 * 60,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def send_booking_notifications_task(
    self,
    booking_id: int,
    event: str = "booking_created",
) -> list[dict[str, Any]]:
    """
    General event dispatcher retained for convenient integration.

    Supported events:
    - booking_created
    - payment_confirmed

    Prefer calling the dedicated task functions when the event is known.
    """
    normalized_event = str(event or "").strip().lower()

    if normalized_event == "booking_created":
        result = send_booking_created_notifications_task.apply(
            args=[booking_id],
            throw=True,
        )
        return result.result or []

    if normalized_event == "payment_confirmed":
        result = send_payment_confirmed_notifications_task.apply(
            args=[booking_id],
            throw=True,
        )
        return result.result or []

    raise ValueError(
        "Unsupported booking notification event. Expected "
        "'booking_created' or 'payment_confirmed'."
    )


@shared_task(
    bind=True,
    autoretry_for=(),
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
    retry_backoff=True,
    retry_backoff_max=15 * 60,
    retry_jitter=True,
    acks_late=True,
    reject_on_worker_lost=True,
)
def retry_failed_notification_task(
    self,
    notification_log_id: int,
) -> list[dict[str, Any]]:
    """
    Retry the event associated with a failed NotificationLog.

    This initial implementation supports customer/owner booking notifications.
    Supplier-specific retry routing will be added with supplier notifications.
    """
    close_old_connections()

    try:
        log = NotificationLog.objects.select_related(
            "booking",
            "booking__organisation",
        ).get(pk=notification_log_id)

        if log.status != "failed":
            logger.info(
                "Notification retry skipped for log id=%s because status=%s.",
                notification_log_id,
                log.status,
            )
            return _serialize_logs([log])

        booking = _load_booking(log.booking_id)
        provider_response = log.provider_response or {}
        audience = str(provider_response.get("audience") or "").lower()

        if audience == "owner":
            new_log = BookingNotificationService.send_owner_notification(booking)
            logs = [new_log] if new_log else []
        elif audience == "customer":
            if log.channel == "email":
                new_log = (
                    BookingNotificationService.send_customer_email_confirmation(
                        booking,
                        require_payment=True,
                    )
                )
            elif log.channel == "whatsapp":
                new_log = (
                    BookingNotificationService.send_customer_whatsapp_confirmation(
                        booking,
                        require_payment=True,
                    )
                )
            else:
                new_log = None

            logs = [new_log] if new_log else []
        else:
            # Older logs may not contain audience metadata. Use the safest event
            # based on current booking payment state.
            if BookingNotificationService.is_payment_confirmed(booking):
                logs = BookingNotificationService.payment_confirmed(booking)
            else:
                logs = BookingNotificationService.booking_created(booking)

        if _has_failed_logs(logs):
            raise self.retry(
                exc=RuntimeError(
                    f"Notification retry created another failed log for "
                    f"booking {booking.booking_code}."
                )
            )

        return _serialize_logs(logs)

    except NotificationLog.DoesNotExist:
        logger.warning(
            "Notification retry skipped: notification log id=%s does not exist.",
            notification_log_id,
        )
        return []

    except Booking.DoesNotExist:
        logger.warning(
            "Notification retry skipped because its booking no longer exists. "
            "notification_log_id=%s",
            notification_log_id,
        )
        return []

    except self.MaxRetriesExceededError:
        logger.exception(
            "Notification retry exhausted retries for log id=%s.",
            notification_log_id,
        )
        raise

    except Exception as exc:
        logger.exception(
            "Notification retry task failed for log id=%s.",
            notification_log_id,
        )
        raise self.retry(exc=exc)

    finally:
        close_old_connections()
