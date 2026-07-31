from __future__ import annotations

import logging
from typing import Any, Callable, TypeVar

from django.utils import timezone

from ticketing.models import (
    NotificationLog,
    TicketingEmailSettings,
    TicketingSettings,
    TicketingWhatsAppSettings,
)

from .email_service import BookingEmailService
from .pdf_tickets import build_ticket_attachment
from .whatsapp_service import (
    BookingWhatsAppService,
    WhatsAppAPIError,
    WhatsAppConfigurationError,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BookingNotificationService:
    """
    Central booking notification dispatcher.

    Ticket-delivery rules
    ---------------------
    Whenever a ticket is issued:

    - Customer: email with PDF when customer email delivery is enabled.
    - Organisation owner: email with the same booking PDF whenever the
      organisation email integration is available.
    - Assigned seller: email with the same booking PDF whenever the booking has
      a seller. This covers seller-dashboard bookings and bookings made through
      a seller public link/token.
    - Supplier/business entity: email with the booking PDF when a supplier
      contact email is configured, plus WhatsApp when the supplier WhatsApp
      recipient and channel switches are enabled. Each supplier receives only
      the booking items assigned to that supplier in the message body.

    Events
    ------
    - booking_created:
        Immediately issues the ticket only for a direct seller-dashboard
        booking. Public bookings, including seller-link/token bookings, wait
        for a confirmed payment or deposit.
    - payment_confirmed:
        Issues the complete ticket package after payment/deposit confirmation.
    - ticket_generated:
        Issues the complete ticket package when a seller/admin explicitly
        generates a ticket without customer online payment.

    The booking organisation's connected Meta WhatsApp number is the sender.
    """

    PAID_PAYMENT_STATUSES = {"paid", "deposit_paid"}
    DIRECT_SELLER_SOURCES = {"seller_dashboard"}

    # ------------------------------------------------------------------
    # Settings and shared helpers
    # ------------------------------------------------------------------

    @classmethod
    def get_settings(cls, booking):
        settings_obj, _ = TicketingSettings.objects.get_or_create(
            organisation=booking.organisation,
        )

        email_settings, _ = TicketingEmailSettings.objects.get_or_create(
            organisation=booking.organisation,
            defaults={"provider": "google_oauth"},
        )

        whatsapp_settings, _ = TicketingWhatsAppSettings.objects.get_or_create(
            organisation=booking.organisation,
            defaults={"provider": "meta_cloud_api"},
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
    def _safe_dispatch(
        cls,
        *,
        booking,
        label: str,
        callback: Callable[[], T],
        default: T,
    ) -> T:
        """
        Keep one failed notification from blocking the remaining recipients.

        BookingEmailService handles provider failures internally, but template
        rendering can fail before its internal NotificationLog is created. This
        wrapper protects the rest of the delivery package in that situation.
        """
        try:
            return callback()
        except Exception:
            logger.exception(
                "%s failed for booking %s.",
                label,
                booking.booking_code,
            )
            return default

    @classmethod
    def _already_sent(
        cls,
        *,
        booking,
        channel,
        audience,
        recipient=None,
        supplier_key=None,
    ):
        """Prevent duplicate successful notifications for the same booking."""
        queryset = NotificationLog.objects.filter(
            booking=booking,
            channel=channel,
            status="sent",
        )

        if recipient:
            queryset = queryset.filter(recipient=str(recipient))

        try:
            queryset = queryset.filter(
                provider_response__audience=audience,
            )

            if supplier_key:
                queryset = queryset.filter(
                    provider_response__supplier_key=str(supplier_key),
                )

            return queryset.exists()
        except Exception:
            # Ticket delivery must not fail only because JSON-key querying is
            # unavailable on a particular database/backend configuration.
            logger.debug(
                "Could not query NotificationLog duplicate marker for "
                "booking %s.",
                booking.booking_code,
                exc_info=True,
            )
            return False

    @classmethod
    def _create_whatsapp_log(
        cls,
        *,
        booking,
        recipient,
        subject,
        message,
        audience,
        event,
        status="pending",
        provider_response=None,
        sent_at=None,
    ):
        response_data = {
            "audience": audience,
            "event": event,
        }
        response_data.update(provider_response or {})

        return NotificationLog.objects.create(
            organisation=booking.organisation,
            booking=booking,
            channel="whatsapp",
            recipient=str(recipient or ""),
            subject=str(subject or ""),
            message=str(message or ""),
            status=status,
            provider_response=response_data,
            sent_at=sent_at,
        )

    @staticmethod
    def _format_date(value):
        if not value:
            return ""
        if hasattr(value, "strftime"):
            return value.strftime("%Y-%m-%d")
        return str(value)

    @staticmethod
    def _format_time(value):
        if not value:
            return ""
        if hasattr(value, "strftime"):
            return value.strftime("%I:%M %p")
        return str(value)

    @classmethod
    def _guest_summary(cls, booking):
        guest_parts = []

        if getattr(booking, "adults", 0):
            guest_parts.append(f"{booking.adults} adult(s)")
        if getattr(booking, "children", 0):
            guest_parts.append(f"{booking.children} child(ren)")
        if getattr(booking, "infants", 0):
            guest_parts.append(f"{booking.infants} infant(s)")

        return ", ".join(guest_parts) or str(
            getattr(booking, "total_guests", 0) or 1
        )

    @classmethod
    def _pickup_or_hotel(cls, booking):
        pickup_or_hotel = str(
            getattr(booking, "customer_hotel", "") or ""
        )

        try:
            pickup_info = booking.pickup_info
        except Exception:
            pickup_info = None

        if pickup_info:
            pickup_or_hotel = (
                getattr(pickup_info, "hotel_or_location_name", "")
                or getattr(pickup_info, "pickup_point", "")
                or pickup_or_hotel
            )

        return str(pickup_or_hotel or "")

    @staticmethod
    def _item_name(item):
        product = getattr(item, "product", None)

        return str(
            getattr(item, "external_option_name", "")
            or getattr(item, "product_name", "")
            or getattr(product, "name", "")
            or "Product"
        )

    @classmethod
    def _item_summary(cls, items):
        values = []

        for item in items:
            quantity = getattr(item, "quantity", 1) or 1
            values.append(f"{cls._item_name(item)} x {quantity}")

        return "; ".join(values)

    # ------------------------------------------------------------------
    # Customer WhatsApp template values
    # ------------------------------------------------------------------

    @classmethod
    def _customer_template_values(cls, booking) -> list[str]:
        """
        Approved customer template body-variable order:

        1. Customer name
        2. Booking code
        3. Product/ticket name
        4. Service date
        5. Service time
        6. Guest summary
        7. Pickup/hotel
        8. Payment status
        """
        first_item = booking.items.order_by("id").first()

        if first_item:
            product_name = cls._item_name(first_item)
        else:
            primary_product = getattr(booking, "primary_product", None)
            product_name = str(
                getattr(primary_product, "name", "") or ""
            )

        try:
            payment_status_display = booking.get_payment_status_display()
        except Exception:
            payment_status_display = str(
                getattr(booking, "payment_status", "") or ""
            )

        return [
            str(getattr(booking, "customer_name", "") or ""),
            str(getattr(booking, "booking_code", "") or ""),
            product_name,
            cls._format_date(getattr(booking, "service_date", None)),
            cls._format_time(getattr(booking, "service_time", None)),
            cls._guest_summary(booking),
            cls._pickup_or_hotel(booking),
            payment_status_display,
        ]

    # ------------------------------------------------------------------
    # Seller resolution
    # ------------------------------------------------------------------

    @classmethod
    def _resolve_seller_email(cls, booking):
        """
        Seller.email is the primary recipient. The linked user's email is the
        fallback when Seller.email is blank.
        """
        seller = getattr(booking, "seller", None)

        if not seller:
            return ""

        seller_email = str(getattr(seller, "email", "") or "").strip()
        if seller_email:
            return seller_email

        seller_user = getattr(seller, "user", None)
        return str(getattr(seller_user, "email", "") or "").strip()

    # ------------------------------------------------------------------
    # Supplier routing and template values
    # ------------------------------------------------------------------

    @classmethod
    def _resolve_supplier_email_item(cls, item):
        """
        Resolve the supplier email for one BookingItem.

        Email recipient priority:
        1. BookingItem.supplier_email_snapshot, when added in the future.
        2. ProductBusinessAgreement.supplier_email_override, when added.
        3. TicketingBusinessEntity.contact_email.

        Email delivery is independent from the WhatsApp number and WhatsApp
        toggle. A supplier can therefore receive email even when WhatsApp is
        blank or disabled.
        """
        agreement = getattr(item, "agreement", None)
        business_entity = getattr(item, "business_entity", None)

        if business_entity is None:
            return None

        if not bool(getattr(business_entity, "is_active", True)):
            return None

        if agreement is not None and not bool(
            getattr(agreement, "is_active", True)
        ):
            return None

        # These optional toggles are supported automatically if they are added
        # to the models later. With the current models they default to enabled.
        if not bool(
            getattr(business_entity, "email_notifications_enabled", True)
        ):
            return None

        if agreement is not None and not bool(
            getattr(agreement, "send_supplier_email_notification", True)
        ):
            return None

        recipient = str(
            getattr(item, "supplier_email_snapshot", "")
            or getattr(agreement, "supplier_email_override", "")
            or getattr(business_entity, "contact_email", "")
            or ""
        ).strip()

        if not recipient:
            return None

        supplier_name = str(
            getattr(item, "supplier_name_snapshot", "")
            or getattr(business_entity, "name", "")
            or "Supplier"
        ).strip()

        entity_id = getattr(item, "business_entity_id", None)
        agreement_id = getattr(item, "agreement_id", None)
        recipient_key = recipient.lower()

        if entity_id:
            supplier_key = f"entity:{entity_id}:email:{recipient_key}"
        elif agreement_id:
            supplier_key = f"agreement:{agreement_id}:email:{recipient_key}"
        else:
            supplier_key = f"email:{recipient_key}"

        return {
            "recipient": recipient,
            "supplier_name": supplier_name,
            "supplier_key": supplier_key,
            "business_entity_id": entity_id,
            "agreement_id": agreement_id,
            "item": item,
        }

    @classmethod
    def _group_supplier_email_items(cls, booking):
        """Group booking items by supplier email recipient."""
        groups: dict[str, dict[str, Any]] = {}

        items = booking.items.select_related(
            "product",
            "business_entity",
            "agreement",
        ).all()

        for item in items:
            resolved = cls._resolve_supplier_email_item(item)

            if not resolved:
                continue

            key = resolved["supplier_key"]

            if key not in groups:
                groups[key] = {
                    "recipient": resolved["recipient"],
                    "supplier_name": resolved["supplier_name"],
                    "supplier_key": key,
                    "business_entity_id": resolved[
                        "business_entity_id"
                    ],
                    "agreement_id": resolved["agreement_id"],
                    "items": [],
                }

            groups[key]["items"].append(item)

        return list(groups.values())

    @classmethod
    def _resolve_supplier_item(cls, item):
        """
        Resolve one BookingItem's supplier.

        WhatsApp recipient priority:
        1. BookingItem.supplier_whatsapp_snapshot
        2. ProductBusinessAgreement.supplier_whatsapp_override
        3. TicketingBusinessEntity.contact_whatsapp
        """
        agreement = getattr(item, "agreement", None)
        business_entity = getattr(item, "business_entity", None)

        if business_entity is not None:
            if not bool(getattr(business_entity, "is_active", True)):
                return None
            if not bool(
                getattr(
                    business_entity,
                    "whatsapp_notifications_enabled",
                    True,
                )
            ):
                return None

        if agreement is not None:
            if not bool(getattr(agreement, "is_active", True)):
                return None
            if not bool(
                getattr(
                    agreement,
                    "send_supplier_booking_notification",
                    True,
                )
            ):
                return None

        recipient = str(
            getattr(item, "supplier_whatsapp_snapshot", "")
            or getattr(agreement, "supplier_whatsapp_override", "")
            or getattr(business_entity, "contact_whatsapp", "")
            or ""
        ).strip()

        if not recipient:
            return None

        supplier_name = str(
            getattr(item, "supplier_name_snapshot", "")
            or getattr(business_entity, "name", "")
            or "Supplier"
        ).strip()

        entity_id = getattr(item, "business_entity_id", None)
        agreement_id = getattr(item, "agreement_id", None)
        recipient_key = "".join(
            character for character in recipient if character.isdigit()
        ) or recipient

        # Group all items for the same company/number into one WhatsApp. Keep
        # different override numbers separate even when the entity is the same.
        if entity_id:
            supplier_key = f"entity:{entity_id}:recipient:{recipient_key}"
        elif agreement_id:
            supplier_key = f"agreement:{agreement_id}:recipient:{recipient_key}"
        else:
            supplier_key = f"recipient:{recipient_key}"

        return {
            "recipient": recipient,
            "supplier_name": supplier_name,
            "supplier_key": supplier_key,
            "business_entity_id": entity_id,
            "agreement_id": agreement_id,
            "item": item,
        }

    @classmethod
    def _group_supplier_items(cls, booking):
        groups: dict[str, dict[str, Any]] = {}

        items = booking.items.select_related(
            "product",
            "business_entity",
            "agreement",
        ).all()

        for item in items:
            resolved = cls._resolve_supplier_item(item)

            if not resolved:
                continue

            key = resolved["supplier_key"]

            if key not in groups:
                groups[key] = {
                    "recipient": resolved["recipient"],
                    "supplier_name": resolved["supplier_name"],
                    "supplier_key": key,
                    "business_entity_id": resolved["business_entity_id"],
                    "agreement_id": resolved["agreement_id"],
                    "items": [],
                }

            groups[key]["items"].append(item)

        return list(groups.values())

    @classmethod
    def _supplier_template_values(
        cls,
        booking,
        *,
        supplier_name,
        items,
    ) -> list[str]:
        """
        Approved supplier template body-variable order:

        1. Supplier/company name
        2. Booking code
        3. Customer name
        4. Reserved item(s)
        5. Service date
        6. Service time
        7. Guest summary
        8. Pickup/hotel
        9. Customer WhatsApp
        """
        return [
            str(supplier_name or "Supplier"),
            str(getattr(booking, "booking_code", "") or ""),
            str(getattr(booking, "customer_name", "") or ""),
            cls._item_summary(items),
            cls._format_date(getattr(booking, "service_date", None)),
            cls._format_time(getattr(booking, "service_time", None)),
            cls._guest_summary(booking),
            cls._pickup_or_hotel(booking),
            str(getattr(booking, "customer_whatsapp", "") or ""),
        ]

    # ------------------------------------------------------------------
    # Email audiences
    # ------------------------------------------------------------------

    @classmethod
    def send_owner_notification(cls, booking, *, force=False):
        """
        Send the owner email with PDF.

        This is part of every ticket-delivery event. Optional owner-notification
        toggles do not suppress this required ticket copy.
        """
        _, email_settings, _ = cls.get_settings(booking)

        if not cls.can_send_email(email_settings):
            return None

        if not force and cls._already_sent(
            booking=booking,
            channel="email",
            audience="owner",
        ):
            return None

        return BookingEmailService.send_owner_notification(booking)

    @classmethod
    def send_seller_notification(cls, booking, *, force=False):
        """Send the booking PDF to the seller assigned to the booking."""
        if not getattr(booking, "seller_id", None):
            return None

        _, email_settings, _ = cls.get_settings(booking)

        if not cls.can_send_email(email_settings):
            return None

        recipient = cls._resolve_seller_email(booking)

        if not recipient:
            logger.warning(
                "Booking %s has seller_id=%s but no seller email.",
                booking.booking_code,
                booking.seller_id,
            )
            return None

        if not force and cls._already_sent(
            booking=booking,
            channel="email",
            audience="seller",
            recipient=recipient,
        ):
            return None

        return BookingEmailService.send_seller_notification(
            booking,
            recipient=recipient,
        )

    @classmethod
    def send_supplier_email_notifications(
        cls,
        booking,
        *,
        force=False,
        event="ticket_delivery",
    ):
        """
        Email the booking PDF to every supplier with a configured contact email.

        Supplier email delivery does not depend on WhatsApp being connected or
        on whatsapp_notifications_enabled. The booked items are grouped by
        supplier so the email body lists only that supplier's items.
        """
        _, email_settings, _ = cls.get_settings(booking)

        if not cls.can_send_email(email_settings):
            return []

        supplier_groups = cls._group_supplier_email_items(booking)

        if not supplier_groups:
            logger.info(
                "No supplier email recipients found for booking %s.",
                booking.booking_code,
            )
            return []

        # Generate the same booking PDF once and reuse it for all suppliers.
        attachment = build_ticket_attachment(booking)
        logs = []

        for supplier_group in supplier_groups:
            recipient = supplier_group["recipient"]
            supplier_name = supplier_group["supplier_name"]
            supplier_key = supplier_group["supplier_key"]
            items = supplier_group["items"]

            if not force and cls._already_sent(
                booking=booking,
                channel="email",
                audience="supplier",
                recipient=recipient,
                supplier_key=supplier_key,
            ):
                continue

            log = BookingEmailService.send_supplier_booking(
                booking=booking,
                recipient=recipient,
                supplier_name=supplier_name,
                booking_items=items,
                attachments=[attachment],
            )

            if not log:
                continue

            provider_response = dict(log.provider_response or {})
            provider_response.update(
                {
                    "audience": "supplier",
                    "event": event,
                    "supplier_key": supplier_key,
                    "supplier_name": supplier_name,
                    "business_entity_id": supplier_group[
                        "business_entity_id"
                    ],
                    "agreement_id": supplier_group["agreement_id"],
                    "item_ids": [
                        getattr(item, "id", None) for item in items
                    ],
                    "attachment": attachment.get("filename", ""),
                }
            )
            log.provider_response = provider_response
            log.save(update_fields=["provider_response"])
            logs.append(log)

        return logs

    @classmethod
    def send_customer_email_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
        force=False,
    ):
        settings_obj, email_settings, _ = cls.get_settings(booking)

        if require_payment and not cls.is_payment_confirmed(booking):
            logger.info(
                "Skipping customer email for booking %s because "
                "payment_status=%s.",
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

        if not force and cls._already_sent(
            booking=booking,
            channel="email",
            audience="customer",
            recipient=booking.customer_email,
        ):
            return None

        return BookingEmailService.send_customer_confirmation(booking)

    # ------------------------------------------------------------------
    # Customer WhatsApp
    # ------------------------------------------------------------------

    @classmethod
    def send_customer_whatsapp_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
        force=False,
        event="ticket_delivery",
    ):
        settings_obj, _, whatsapp_settings = cls.get_settings(booking)

        if require_payment and not cls.is_payment_confirmed(booking):
            return None

        if not booking.customer_whatsapp:
            return None

        if not (
            settings_obj.send_customer_whatsapp
            and whatsapp_settings.send_customer_confirmation
            and cls.can_send_whatsapp(whatsapp_settings)
        ):
            return None

        if not force and cls._already_sent(
            booking=booking,
            channel="whatsapp",
            audience="customer",
            recipient=booking.customer_whatsapp,
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
                    "Customer WhatsApp skipped because no approved Meta "
                    "template is configured."
                ),
                audience="customer",
                event=event,
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
            audience="customer",
            event=event,
            provider_response={"template_name": template_name},
        )

        try:
            service = BookingWhatsAppService(whatsapp_settings)
            result = service.send_customer_confirmation(
                booking.customer_whatsapp,
                body_values=cls._customer_template_values(booking),
            )

            log.status = "sent"
            log.provider_response = {
                "audience": "customer",
                "event": event,
                "template_name": template_name,
                **service.serialize_result(result),
            }
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
                "audience": "customer",
                "event": event,
                "template_name": template_name,
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
            log.save(update_fields=["status", "provider_response"])

            whatsapp_settings.last_error_message = str(exc)
            whatsapp_settings.save(
                update_fields=["last_error_message", "updated_at"]
            )

            logger.exception(
                "Customer WhatsApp failed for booking %s.",
                booking.booking_code,
            )
            return log

        except Exception as exc:
            log.status = "failed"
            log.provider_response = {
                "audience": "customer",
                "event": event,
                "template_name": template_name,
                "error": str(exc),
                "error_type": exc.__class__.__name__,
            }
            log.save(update_fields=["status", "provider_response"])

            logger.exception(
                "Unexpected customer WhatsApp failure for booking %s.",
                booking.booking_code,
            )
            return log

    # ------------------------------------------------------------------
    # Supplier WhatsApp
    # ------------------------------------------------------------------

    @classmethod
    def send_supplier_whatsapp_notifications(
        cls,
        booking,
        *,
        force=False,
        event="ticket_delivery",
    ):
        _, _, whatsapp_settings = cls.get_settings(booking)

        if not cls.can_send_whatsapp(whatsapp_settings):
            return []

        if not whatsapp_settings.send_supplier_booking_notification:
            return []

        template_name = str(
            whatsapp_settings.supplier_booking_template or ""
        ).strip()

        service = BookingWhatsAppService(whatsapp_settings)
        logs = []

        for supplier_group in cls._group_supplier_items(booking):
            recipient = supplier_group["recipient"]
            supplier_name = supplier_group["supplier_name"]
            supplier_key = supplier_group["supplier_key"]
            items = supplier_group["items"]

            if not force and cls._already_sent(
                booking=booking,
                channel="whatsapp",
                audience="supplier",
                supplier_key=supplier_key,
            ):
                continue

            subject = f"Supplier booking - {supplier_name}"
            common_response = {
                "template_name": template_name,
                "supplier_key": supplier_key,
                "supplier_name": supplier_name,
                "business_entity_id": supplier_group[
                    "business_entity_id"
                ],
                "agreement_id": supplier_group["agreement_id"],
                "item_ids": [getattr(item, "id", None) for item in items],
            }

            if not template_name:
                log = cls._create_whatsapp_log(
                    booking=booking,
                    recipient=recipient,
                    subject=subject,
                    message=(
                        "Supplier WhatsApp skipped because no approved "
                        "supplier template is configured."
                    ),
                    audience="supplier",
                    event=event,
                    status="skipped",
                    provider_response={
                        **common_response,
                        "reason": "missing_supplier_booking_template",
                    },
                )
                logs.append(log)
                continue

            log = cls._create_whatsapp_log(
                booking=booking,
                recipient=recipient,
                subject=subject,
                message=f"Template: {template_name}",
                audience="supplier",
                event=event,
                provider_response=common_response,
            )

            try:
                result = service.send_supplier_booking(
                    recipient,
                    body_values=cls._supplier_template_values(
                        booking,
                        supplier_name=supplier_name,
                        items=items,
                    ),
                )

                log.status = "sent"
                log.provider_response = {
                    "audience": "supplier",
                    "event": event,
                    **common_response,
                    **service.serialize_result(result),
                }
                log.sent_at = timezone.now()
                log.save(
                    update_fields=[
                        "status",
                        "provider_response",
                        "sent_at",
                    ]
                )
                logs.append(log)

            except (
                WhatsAppConfigurationError,
                WhatsAppAPIError,
                ValueError,
            ) as exc:
                provider_response: dict[str, Any] = {
                    "audience": "supplier",
                    "event": event,
                    **common_response,
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
                log.save(update_fields=["status", "provider_response"])
                logs.append(log)

                whatsapp_settings.last_error_message = str(exc)
                whatsapp_settings.save(
                    update_fields=["last_error_message", "updated_at"]
                )

                logger.exception(
                    "Supplier WhatsApp failed for booking %s and supplier %s.",
                    booking.booking_code,
                    supplier_name,
                )

            except Exception as exc:
                log.status = "failed"
                log.provider_response = {
                    "audience": "supplier",
                    "event": event,
                    **common_response,
                    "error": str(exc),
                    "error_type": exc.__class__.__name__,
                }
                log.save(update_fields=["status", "provider_response"])
                logs.append(log)

                logger.exception(
                    "Unexpected supplier WhatsApp failure for booking %s and "
                    "supplier %s.",
                    booking.booking_code,
                    supplier_name,
                )

        return logs

    # ------------------------------------------------------------------
    # Combined dispatchers
    # ------------------------------------------------------------------

    @classmethod
    def send_customer_confirmation(
        cls,
        booking,
        *,
        require_payment=True,
        force=False,
        event="ticket_delivery",
    ):
        """Backwards-compatible customer-only dispatcher."""
        logs = []

        email_log = cls._safe_dispatch(
            booking=booking,
            label="Customer email",
            callback=lambda: cls.send_customer_email_confirmation(
                booking,
                require_payment=require_payment,
                force=force,
            ),
            default=None,
        )
        if email_log:
            logs.append(email_log)

        whatsapp_log = cls._safe_dispatch(
            booking=booking,
            label="Customer WhatsApp",
            callback=lambda: cls.send_customer_whatsapp_confirmation(
                booking,
                require_payment=require_payment,
                force=force,
                event=event,
            ),
            default=None,
        )
        if whatsapp_log:
            logs.append(whatsapp_log)

        return logs

    @classmethod
    def send_ticket_notifications(
        cls,
        booking,
        *,
        require_payment=True,
        force=False,
        event="ticket_delivery",
    ):
        """
        Send the complete ticket package.

        One failed recipient does not block customer, owner, seller, or supplier
        delivery to the remaining recipients.
        """
        logs = []

        customer_logs = cls.send_customer_confirmation(
            booking,
            require_payment=require_payment,
            force=force,
            event=event,
        )
        logs.extend(customer_logs)

        owner_log = cls._safe_dispatch(
            booking=booking,
            label="Owner email",
            callback=lambda: cls.send_owner_notification(
                booking,
                force=force,
            ),
            default=None,
        )
        if owner_log:
            logs.append(owner_log)

        seller_log = cls._safe_dispatch(
            booking=booking,
            label="Seller email",
            callback=lambda: cls.send_seller_notification(
                booking,
                force=force,
            ),
            default=None,
        )
        if seller_log:
            logs.append(seller_log)

        supplier_email_logs = cls._safe_dispatch(
            booking=booking,
            label="Supplier email",
            callback=lambda: cls.send_supplier_email_notifications(
                booking,
                force=force,
                event=event,
            ),
            default=[],
        )
        logs.extend(supplier_email_logs)

        supplier_whatsapp_logs = cls._safe_dispatch(
            booking=booking,
            label="Supplier WhatsApp",
            callback=lambda: cls.send_supplier_whatsapp_notifications(
                booking,
                force=force,
                event=event,
            ),
            default=[],
        )
        logs.extend(supplier_whatsapp_logs)

        return logs

    # ------------------------------------------------------------------
    # Public event entry points
    # ------------------------------------------------------------------

    @classmethod
    def booking_created(cls, booking):
        """
        Direct seller-dashboard bookings issue the ticket immediately.

        Public bookings and seller public-link/token bookings wait for payment
        and are handled by payment_confirmed().
        """
        source = str(getattr(booking, "source", "") or "").strip().lower()

        if (
            getattr(booking, "seller_id", None)
            and source in cls.DIRECT_SELLER_SOURCES
        ):
            return cls.send_ticket_notifications(
                booking,
                require_payment=False,
                event="seller_booking_created",
            )

        return []

    @classmethod
    def payment_confirmed(cls, booking):
        """
        Called after an online or manual full payment/deposit is confirmed.

        Customer and owner receive the PDF. An assigned seller receives the PDF,
        including when the customer booked through that seller's token/link.
        Relevant suppliers receive email with PDF and, when configured,
        WhatsApp reservations.
        """
        return cls.send_ticket_notifications(
            booking,
            require_payment=True,
            event="payment_confirmed",
        )

    @classmethod
    def ticket_generated(cls, booking):
        """
        Called when a seller/admin generates a ticket without online payment.
        """
        return cls.send_ticket_notifications(
            booking,
            require_payment=False,
            event="ticket_generated",
        )

    @classmethod
    def send(cls, booking):
        """Backwards-compatible alias for existing booking-created callers."""
        return cls.booking_created(booking)
