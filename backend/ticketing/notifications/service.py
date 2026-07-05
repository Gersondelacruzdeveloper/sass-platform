import logging

from ticketing.models import (
    TicketingSettings,
    TicketingEmailSettings,
)

from .email_service import BookingEmailService

logger = logging.getLogger(__name__)


class BookingNotificationService:
    """
    Central notification dispatcher.

    Event rules:
    - booking_created: notify owner only
    - payment_confirmed: notify customer after payment/deposit is confirmed
    - reminders/reviews: future scheduled jobs
    """

    PAID_PAYMENT_STATUSES = {"paid", "deposit_paid"}

    @classmethod
    def get_settings(cls, booking):
        settings_obj, _ = TicketingSettings.objects.get_or_create(
            organisation=booking.organisation,
        )

        email_settings, _ = TicketingEmailSettings.objects.get_or_create(
            organisation=booking.organisation,
            defaults={
                "provider": "google_oauth",
            },
        )

        return settings_obj, email_settings

    @classmethod
    def can_send_email(cls, email_settings):
        return bool(email_settings and email_settings.is_active)

    @classmethod
    def is_payment_confirmed(cls, booking):
        return booking.payment_status in cls.PAID_PAYMENT_STATUSES

    @classmethod
    def send_owner_notification(cls, booking):
        settings_obj, email_settings = cls.get_settings(booking)

        if not (
            cls.can_send_email(email_settings)
            and email_settings.send_owner_notification
            and settings_obj.notify_owner_on_booking
        ):
            return None

        return BookingEmailService.send_owner_notification(booking)

    @classmethod
    def send_customer_confirmation(cls, booking, require_payment=True):
        settings_obj, email_settings = cls.get_settings(booking)

        if require_payment and not cls.is_payment_confirmed(booking):
            logger.info(
                "Skipping customer confirmation for booking %s because payment_status=%s",
                booking.booking_code,
                booking.payment_status,
            )
            return None

        if not (
            cls.can_send_email(email_settings)
            and email_settings.send_customer_confirmation
            and settings_obj.send_customer_email
            and booking.customer_email
        ):
            return None

        return BookingEmailService.send_customer_confirmation(booking)

    @classmethod
    def booking_created(cls, booking):
        """
        Called immediately after booking creation.

        Customer confirmation is intentionally not sent here because online
        bookings may still be unpaid.
        """
        logs = []

        log = cls.send_owner_notification(booking)
        if log:
            logs.append(log)

        return logs

    @classmethod
    def payment_confirmed(cls, booking):
        """
        Called after an online/manual payment is confirmed.

        This is where the customer receives the booking confirmation.
        """
        logs = []

        log = cls.send_customer_confirmation(booking, require_payment=True)
        if log:
            logs.append(log)

        return logs

    @classmethod
    def send(cls, booking):
        """
        Backwards-compatible alias.

        IMPORTANT:
        This now behaves like booking_created(), so old callers do not send
        customer confirmations too early.
        """
        return cls.booking_created(booking)
