import logging

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from ticketing.models import NotificationLog

from .utils import (
    build_booking_context,
    get_email_connection,
    get_email_settings,
    get_owner_email,
)

logger = logging.getLogger(__name__)


class BookingEmailService:
    @classmethod
    def send_customer_confirmation(cls, booking):
        if not booking.customer_email:
            return None

        subject = f"Booking confirmation {booking.booking_code}"
        recipient = booking.customer_email
        context = build_booking_context(booking)

        return cls._send_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_template="ticketing/emails/customer_confirmation.txt",
            html_template="ticketing/emails/customer_confirmation.html",
            context=context,
        )

    @classmethod
    def send_owner_notification(cls, booking):
        recipient = get_owner_email(booking)

        if not recipient:
            return None

        subject = f"New booking {booking.booking_code}"
        context = build_booking_context(booking)

        return cls._send_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_template="ticketing/emails/owner_notification.txt",
            html_template="ticketing/emails/owner_notification.html",
            context=context,
        )

    @classmethod
    def _send_email(
        cls,
        booking,
        recipient,
        subject,
        text_template,
        html_template,
        context,
    ):
        text_body = render_to_string(text_template, context)
        html_body = render_to_string(html_template, context)

        log = NotificationLog.objects.create(
            organisation=booking.organisation,
            booking=booking,
            channel="email",
            recipient=recipient,
            subject=subject,
            message=text_body,
            status="pending",
        )

        email_settings = get_email_settings(booking.organisation)

        if not email_settings.has_credentials:
            log.status = "skipped"
            log.provider_response = {
                "reason": "Ticketing email settings are not configured.",
            }
            log.save(update_fields=["status", "provider_response"])
            return log

        try:
            connection = get_email_connection(email_settings)

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=email_settings.from_email,
                to=[recipient],
                reply_to=[email_settings.reply_to_email]
                if email_settings.reply_to_email
                else None,
                connection=connection,
            )
            email.attach_alternative(html_body, "text/html")
            email.send(fail_silently=False)

            log.status = "sent"
            log.sent_at = timezone.now()
            log.provider_response = {
                "backend": "tenant_smtp",
                "provider": email_settings.provider,
                "from_email": email_settings.from_email,
            }
            log.save(update_fields=["status", "sent_at", "provider_response"])

            return log

        except Exception as exc:
            logger.exception("Booking email failed for booking %s", booking.booking_code)

            log.status = "failed"
            log.provider_response = {
                "error": str(exc),
                "provider": email_settings.provider,
            }
            log.save(update_fields=["status", "provider_response"])

            return log
