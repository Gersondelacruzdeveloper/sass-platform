from __future__ import annotations

import logging
from html import escape
from typing import Any, Iterable, Mapping, Sequence

from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils import timezone

from ticketing.google_oauth import send_gmail_email
from ticketing.models import NotificationLog
from ticketing.notifications.pdf_tickets import build_ticket_attachment

from .utils import (
    build_booking_context,
    get_email_connection,
    get_email_settings,
    get_owner_email,
)

logger = logging.getLogger(__name__)


class BookingEmailService:
    """
    Multi-tenant booking email service.

    Sender credentials always come from the booking organisation's
    TicketingEmailSettings.

    Supported audiences:
    - Customer
    - Organisation owner
    - Supplier/business entity

    Every attempt is recorded in NotificationLog.
    """

    @classmethod
    def send_customer_confirmation(cls, booking):
        if not booking.customer_email:
            return None

        subject = f"Booking confirmation {booking.booking_code}"
        recipient = booking.customer_email
        context = build_booking_context(booking)
        attachments = [build_ticket_attachment(booking)]

        return cls._send_template_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_template="ticketing/emails/customer_confirmation.txt",
            html_template="ticketing/emails/customer_confirmation.html",
            context=context,
            attachments=attachments,
            audience="customer",
        )

    @classmethod
    def send_owner_notification(cls, booking):
        recipient = get_owner_email(booking)

        if not recipient:
            return None

        subject = f"New booking {booking.booking_code}"
        context = build_booking_context(booking)

        return cls._send_template_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_template="ticketing/emails/owner_notification.txt",
            html_template="ticketing/emails/owner_notification.html",
            context=context,
            audience="owner",
        )

    @classmethod
    def send_supplier_booking(
        cls,
        *,
        booking,
        recipient,
        supplier_name="",
        booking_items=None,
        attachments=None,
    ):
        """
        Send a supplier reservation report.

        This method intentionally accepts an already-resolved recipient and
        item collection. Supplier/contact resolution belongs to the central
        notification dispatcher, which groups booking items by business entity.

        A dedicated supplier-voucher PDF can be supplied later through
        ``attachments`` without changing this service.
        """
        if not recipient:
            return None

        items = list(booking_items or booking.items.all())
        supplier_label = supplier_name or "Supplier"
        subject = f"New reservation {booking.booking_code} - {supplier_label}"

        text_body = cls._build_supplier_text_body(
            booking=booking,
            supplier_name=supplier_label,
            booking_items=items,
        )
        html_body = cls._build_supplier_html_body(
            booking=booking,
            supplier_name=supplier_label,
            booking_items=items,
        )

        return cls._send_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            attachments=attachments or [],
            audience="supplier",
        )

    @classmethod
    def _send_template_email(
        cls,
        *,
        booking,
        recipient,
        subject,
        text_template,
        html_template,
        context,
        attachments=None,
        audience="",
    ):
        text_body = render_to_string(text_template, context)
        html_body = render_to_string(html_template, context)

        return cls._send_email(
            booking=booking,
            recipient=recipient,
            subject=subject,
            text_body=text_body,
            html_body=html_body,
            attachments=attachments or [],
            audience=audience,
        )

    @classmethod
    def _send_email(
        cls,
        *,
        booking,
        recipient,
        subject,
        text_body,
        html_body,
        attachments=None,
        audience="",
    ):
        recipients = cls._normalize_recipients(recipient)
        attachments = cls._normalize_attachments(attachments or [])

        if not recipients:
            return None

        recipient_value = ", ".join(recipients)

        log = NotificationLog.objects.create(
            organisation=booking.organisation,
            booking=booking,
            channel="email",
            recipient=recipient_value,
            subject=subject,
            message=text_body,
            status="pending",
            provider_response={
                "audience": audience,
            },
        )

        email_settings = get_email_settings(booking.organisation)

        if not email_settings.has_credentials:
            log.status = "skipped"
            log.provider_response = {
                "audience": audience,
                "reason": "Ticketing email settings are not configured.",
                "provider": email_settings.provider,
            }
            log.save(update_fields=["status", "provider_response"])
            return log

        try:
            if email_settings.provider == "google_oauth":
                gmail_responses = []

                for recipient_email in recipients:
                    gmail_response = send_gmail_email(
                        email_settings=email_settings,
                        to_email=recipient_email,
                        subject=subject,
                        body=text_body,
                        html_body=html_body,
                        attachments=attachments,
                    )
                    gmail_responses.append(
                        {
                            "recipient": recipient_email,
                            "response": gmail_response,
                        }
                    )

                log.status = "sent"
                log.sent_at = timezone.now()
                log.provider_response = {
                    "audience": audience,
                    "backend": "gmail_api",
                    "provider": email_settings.provider,
                    "from_email": (
                        email_settings.sender_email
                        or email_settings.oauth_provider_account
                    ),
                    "attachments": [
                        attachment["filename"]
                        for attachment in attachments
                    ],
                    "gmail_responses": gmail_responses,
                }
                log.save(
                    update_fields=[
                        "status",
                        "sent_at",
                        "provider_response",
                    ]
                )
                return log

            connection = get_email_connection(email_settings)

            email = EmailMultiAlternatives(
                subject=subject,
                body=text_body,
                from_email=email_settings.from_email,
                to=recipients,
                reply_to=[email_settings.reply_to_email]
                if email_settings.reply_to_email
                else None,
                connection=connection,
            )
            email.attach_alternative(html_body, "text/html")

            for attachment in attachments:
                email.attach(
                    attachment["filename"],
                    attachment["content"],
                    attachment.get("mime_type")
                    or "application/octet-stream",
                )

            email.send(fail_silently=False)

            log.status = "sent"
            log.sent_at = timezone.now()
            log.provider_response = {
                "audience": audience,
                "backend": "tenant_smtp",
                "provider": email_settings.provider,
                "from_email": email_settings.from_email,
                "attachments": [
                    attachment["filename"]
                    for attachment in attachments
                ],
            }
            log.save(
                update_fields=[
                    "status",
                    "sent_at",
                    "provider_response",
                ]
            )
            return log

        except Exception as exc:
            logger.exception(
                "Booking email failed for booking %s",
                booking.booking_code,
            )

            log.status = "failed"
            log.provider_response = {
                "audience": audience,
                "error": str(exc),
                "error_type": exc.__class__.__name__,
                "provider": email_settings.provider,
            }
            log.save(update_fields=["status", "provider_response"])
            return log

    @staticmethod
    def _normalize_recipients(
        recipient: str | Sequence[str],
    ) -> list[str]:
        if isinstance(recipient, str):
            values = recipient.split(",")
        else:
            values = list(recipient or [])

        recipients = []
        seen = set()

        for value in values:
            email = str(value or "").strip()
            key = email.lower()

            if not email or key in seen:
                continue

            recipients.append(email)
            seen.add(key)

        return recipients

    @staticmethod
    def _normalize_attachments(
        attachments: Iterable[Mapping[str, Any]],
    ) -> list[dict[str, Any]]:
        normalized = []

        for attachment in attachments:
            filename = str(attachment.get("filename") or "").strip()
            content = attachment.get("content")

            if not filename or content is None:
                continue

            normalized.append(
                {
                    "filename": filename,
                    "content": content,
                    "mime_type": (
                        attachment.get("mime_type")
                        or "application/octet-stream"
                    ),
                }
            )

        return normalized

    @classmethod
    def _build_supplier_text_body(
        cls,
        *,
        booking,
        supplier_name,
        booking_items,
    ) -> str:
        lines = [
            f"New reservation for {supplier_name}",
            "",
            f"Booking: {booking.booking_code}",
            f"Customer: {booking.customer_name}",
            f"Service date: {booking.service_date or ''}",
            f"Service time: {booking.service_time or ''}",
            f"Guests: {booking.total_guests or 0}",
            f"Hotel/Pickup: {booking.customer_hotel or ''}",
            f"Customer WhatsApp: {booking.customer_whatsapp or ''}",
            "",
            "Reserved items:",
        ]

        for item in booking_items:
            item_name = (
                getattr(item, "external_option_name", "")
                or getattr(item, "product_name", "")
                or (
                    item.product.name
                    if getattr(item, "product", None)
                    else "Product"
                )
            )
            lines.append(
                f"- {item_name} x {getattr(item, 'quantity', 1)}"
            )

        if booking.customer_notes:
            lines.extend(
                [
                    "",
                    "Customer notes:",
                    booking.customer_notes,
                ]
            )

        lines.extend(
            [
                "",
                "Please confirm this reservation according to your agreement.",
            ]
        )

        return "\n".join(lines)

    @classmethod
    def _build_supplier_html_body(
        cls,
        *,
        booking,
        supplier_name,
        booking_items,
    ) -> str:
        item_rows = []

        for item in booking_items:
            item_name = (
                getattr(item, "external_option_name", "")
                or getattr(item, "product_name", "")
                or (
                    item.product.name
                    if getattr(item, "product", None)
                    else "Product"
                )
            )
            item_rows.append(
                "<li>"
                f"{escape(str(item_name))} × "
                f"{escape(str(getattr(item, 'quantity', 1)))}"
                "</li>"
            )

        notes_html = ""
        if booking.customer_notes:
            notes_html = (
                "<p><strong>Customer notes:</strong><br>"
                f"{escape(str(booking.customer_notes))}</p>"
            )

        return f"""
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>New reservation for {escape(str(supplier_name))}</h2>
          <p><strong>Booking:</strong> {escape(str(booking.booking_code))}</p>
          <p><strong>Customer:</strong> {escape(str(booking.customer_name))}</p>
          <p><strong>Service date:</strong> {escape(str(booking.service_date or ""))}</p>
          <p><strong>Service time:</strong> {escape(str(booking.service_time or ""))}</p>
          <p><strong>Guests:</strong> {escape(str(booking.total_guests or 0))}</p>
          <p><strong>Hotel/Pickup:</strong> {escape(str(booking.customer_hotel or ""))}</p>
          <p><strong>Customer WhatsApp:</strong> {escape(str(booking.customer_whatsapp or ""))}</p>
          <h3>Reserved items</h3>
          <ul>{''.join(item_rows)}</ul>
          {notes_html}
          <p>Please confirm this reservation according to your agreement.</p>
        </div>
        """
