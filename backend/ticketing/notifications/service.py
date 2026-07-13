import logging
from typing import Any

from django.utils import timezone

from ticketing.models import (
    NotificationLog,
    TicketingEmailSettings,
    TicketingSettings,
    TicketingWhatsAppSettings,
)

from .email_service import BookingEmailService
from .whatsapp_service import (
    BookingWhatsAppService,
    WhatsAppAPIError,
    WhatsAppConfigurationError,
)

logger = logging.getLogger(__name__)


class BookingNotificationService:
    """
    Central booking notification dispatcher.

    Current event rules:
    - booking_created:
        notify the organisation owner by email only.
    - payment_confirmed:
        notify the customer by email and WhatsApp after a full payment or
        deposit is confirmed.
    - reminders, supplier messages and delivery webhooks:
        connected in later notification phases.

    WhatsApp sender:
        The booking organisation's connected Meta WhatsApp number.

    WhatsApp customer recipient:
        booking.customer_whatsapp.
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

        whatsapp_settings, _ = TicketingWhatsAppSettings.objects.get_or_create(
            organisation=booking.organisation,
            defaults={
                "provider": "meta_cloud_api",
            },
        )

        return settings_obj, email_settings, whatsapp_settings

    @classmethod
    def can_send_email(cls, email_settings):
        return bool(
            email_settings
            and email_settings.is_active
            and email_settings.has_credentials
        )

    @classmethod
    def can_send_whatsapp(cls, whatsapp_settings):
        return bool(
            whatsapp_settings
            and whatsapp_settings.is_active
            and whatsapp_settings.is_connected
        )

    @classmethod
    def is_payment_confirmed(cls, booking):
        return booking.payment_status in cls.PAID_PAYMENT_STATUSES

    @classmethod
    def _create_whatsapp_log(
        cls,
        *,
        booking,
        recipient,
        subject,
        message,
        status="pending",
        provider_response=None,
        sent_at=None,
    ):
        return NotificationLog.objects.create(
            organisation=booking.organisation,
            booking=booking,
            channel="whatsapp",
            recipient=str(recipient or ""),
            subject=str(subject or ""),
            message=str(message or ""),
            status=status,
            provider_response=provider_response or {},
            sent_at=sent_at,
        )

    @classmethod
    def _customer_template_values(cls, booking) -> list[str]:
        """
        Default customer template variable order.

        Configure the approved Meta template to use these body variables:

        1. Customer name
        2. Booking code
        3. Product/ticket name
        4. Service date
        5. Service time
        6. Guest summary
        7. Pickup/hotel
        8. Payment status

        A later PDF phase can add the ticket as a document header without
        changing these body values.
        """
        product_name = ""

        first_item = booking.items.order_by("id").first()
        if first_item:
            product_name = (
                first_item.external_option_name
                or first_item.product_name
                or (
                    first_item.product.name
                    if first_item.product
                    else ""
                )
            )
        elif booking.primary_product:
            product_name = booking.primary_product.name

        service_date = (
            booking.service_date.strftime("%Y-%m-%d")
            if booking.service_date
            else ""
        )
        service_time = (
            booking.service_time.strftime("%I:%M %p")
            if booking.service_time
            else ""
        )

        guest_parts = []
        if booking.adults:
            guest_parts.append(f"{booking.adults} adult(s)")
        if booking.children:
            guest_parts.append(f"{booking.children} child(ren)")
        if booking.infants:
            guest_parts.append(f"{booking.infants} infant(s)")

        guest_summary = ", ".join(guest_parts) or str(
            booking.total_guests or 1
        )

        pickup_or_hotel = booking.customer_hotel or ""

        try:
            pickup_info = booking.pickup_info
        except Exception:
            pickup_info = None

        if pickup_info:
            pickup_or_hotel = (
                pickup_info.hotel_or_location_name
                or pickup_info.pickup_point
                or pickup_or_hotel
            )

        return [
            booking.customer_name or "",
            booking.booking_code or "",
            product_name,
            service_date,
            service_time,
            guest_summary,
            pickup_or_hotel,
            booking.get_payment_status_display(),
        ]

    @classmethod
    def send_owner_notification(cls, booking):
        settings_obj, email_settings, _ = cls.get_settings(booking)

        if not (
            cls.can_send_email(email_settings)
            and email_settings.send_owner_notification
            and settings_obj.notify_owner_on_booking
        ):
            return None

        return BookingEmailService.send_owner_notification(booking)

    @classmethod
    def send_customer_email_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
    ):
        settings_obj, email_settings, _ = cls.get_settings(booking)

        if require_payment and not cls.is_payment_confirmed(booking):
            logger.info(
                "Skipping customer email confirmation for booking %s "
                "because payment_status=%s",
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
    def send_customer_whatsapp_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
    ):
        settings_obj, _, whatsapp_settings = cls.get_settings(booking)

        if require_payment and not cls.is_payment_confirmed(booking):
            logger.info(
                "Skipping customer WhatsApp confirmation for booking %s "
                "because payment_status=%s",
                booking.booking_code,
                booking.payment_status,
            )
            return None

        if not booking.customer_whatsapp:
            return None

        if not (
            settings_obj.send_customer_whatsapp
            and whatsapp_settings.send_customer_confirmation
            and cls.can_send_whatsapp(whatsapp_settings)
        ):
            return None

        subject = "Customer booking confirmation"
        template_name = whatsapp_settings.customer_confirmation_template

        if not template_name:
            return cls._create_whatsapp_log(
                booking=booking,
                recipient=booking.customer_whatsapp,
                subject=subject,
                message=(
                    "Customer WhatsApp confirmation was skipped because no "
                    "approved Meta template is configured."
                ),
                status="skipped",
                provider_response={
                    "reason": "missing_customer_confirmation_template",
                },
            )

        log = cls._create_whatsapp_log(
            booking=booking,
            recipient=booking.customer_whatsapp,
            subject=subject,
            message=f"Template: {template_name}",
            status="pending",
        )

        try:
            service = BookingWhatsAppService(whatsapp_settings)
            result = service.send_customer_confirmation(
                booking.customer_whatsapp,
                body_values=cls._customer_template_values(booking),
            )

            log.status = "sent"
            log.provider_response = service.serialize_result(result)
            log.sent_at = timezone.now()
            log.save(
                update_fields=[
                    "status",
                    "provider_response",
                    "sent_at",
                ]
            )

            return log

        except (
            WhatsAppConfigurationError,
            WhatsAppAPIError,
            ValueError,
        ) as exc:
            provider_response: dict[str, Any] = {
                "error": str(exc),
                "error_type": exc.__class__.__name__,
            }

            if isinstance(exc, WhatsAppAPIError):
                provider_response.update(
                    {
                        "status_code": exc.status_code,
                        "error_code": exc.error_code,
                        "error_subcode": exc.error_subcode,
                        "meta_response": exc.response_data,
                    }
                )

            log.status = "failed"
            log.provider_response = provider_response
            log.save(
                update_fields=[
                    "status",
                    "provider_response",
                ]
            )

            whatsapp_settings.last_error_message = str(exc)
            whatsapp_settings.save(
                update_fields=[
                    "last_error_message",
                    "updated_at",
                ]
            )

            logger.exception(
                "Customer WhatsApp confirmation failed for booking %s",
                booking.booking_code,
            )
            return log

        except Exception as exc:
            log.status = "failed"
            log.provider_response = {
                "error": str(exc),
                "error_type": exc.__class__.__name__,
            }
            log.save(
                update_fields=[
                    "status",
                    "provider_response",
                ]
            )

            logger.exception(
                "Unexpected customer WhatsApp failure for booking %s",
                booking.booking_code,
            )
            return log

    @classmethod
    def send_customer_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
    ):
        """
        Send all enabled customer confirmation channels.

        This preserves the old public method name while expanding it from email
        only to email plus WhatsApp.
        """
        logs = []

        email_log = cls.send_customer_email_confirmation(
            booking,
            require_payment=require_payment,
        )
        if email_log:
            logs.append(email_log)

        whatsapp_log = cls.send_customer_whatsapp_confirmation(
            booking,
            require_payment=require_payment,
        )
        if whatsapp_log:
            logs.append(whatsapp_log)

        return logs

    @classmethod
    def booking_created(cls, booking):
        """
        Called immediately after booking creation.

        Customer confirmation is intentionally not sent here because public
        bookings may still be unpaid. The supplier flow will later be connected
        to its separately configured trigger.
        """
        logs = []

        log = cls.send_owner_notification(booking)
        if log:
            logs.append(log)

        return logs

    @classmethod
    def payment_confirmed(cls, booking):
        """
        Called after an online or manual payment/deposit is confirmed.

        The customer receives every enabled confirmation channel.
        """
        return cls.send_customer_confirmation(
            booking,
            require_payment=True,
        )

    @classmethod
    def send(cls, booking):
        """
        Backwards-compatible alias.

        This behaves like booking_created(), so old callers do not send customer
        confirmations before the payment/deposit is confirmed.
        """
        return cls.booking_created(booking)
