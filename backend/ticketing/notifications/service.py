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

    Future channels:
        - Email
        - WhatsApp
        - SMS
        - Push Notifications
        - PDF Tickets
        - QR Codes
        - Calendar Invites
    """

    @classmethod
    def send(cls, booking):
        settings_obj, _ = TicketingSettings.objects.get_or_create(
            organisation=booking.organisation
        )

        email_settings, _ = TicketingEmailSettings.objects.get_or_create(
            organisation=booking.organisation,
            defaults={
                "provider": "gmail",
                "smtp_host": "smtp.gmail.com",
                "smtp_port": 587,
                "smtp_encryption": "tls",
            },
        )

        logs = []

        if (
            email_settings.is_active
            and email_settings.send_customer_confirmation
            and settings_obj.send_customer_email
            and booking.customer_email
        ):
            log = BookingEmailService.send_customer_confirmation(booking)
            if log:
                logs.append(log)

        if (
            email_settings.is_active
            and email_settings.send_owner_notification
            and settings_obj.notify_owner_on_booking
        ):
            log = BookingEmailService.send_owner_notification(booking)
            if log:
                logs.append(log)

        return logs
