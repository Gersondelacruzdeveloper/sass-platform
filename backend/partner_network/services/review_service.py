from __future__ import annotations

from datetime import timedelta
from html import escape

from django.db import transaction
from django.utils import timezone

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBookingAttribution,
    ReferralFeedbackRequest,
)
from partner_network.services.settings_service import get_partner_network_settings
from ticketing.models import TicketingWhatsAppSettings
from ticketing.notifications.email_service import BookingEmailService
from ticketing.notifications.whatsapp_service import BookingWhatsAppService


def _feedback_copy(booking, review_url: str):
    customer_name = str(getattr(booking, "customer_name", "") or "there").strip()
    brand = getattr(booking.organisation, "name", "Punta Cana Discovery")
    text = (
        f"Hi {customer_name}, thank you for choosing {brand}. "
        "We would genuinely appreciate your feedback about your excursion."
    )
    if review_url:
        text += f" You can share your experience here: {review_url}"
    text += " Thank you for helping us improve the experience for every guest."
    html = (
        f"<p>Hi {escape(customer_name)},</p>"
        f"<p>Thank you for choosing {escape(str(brand))}. We would genuinely appreciate "
        "your feedback about your excursion.</p>"
    )
    if review_url:
        html += f'<p><a href="{escape(review_url)}">Share your experience</a></p>'
    html += "<p>Thank you for helping us improve the experience for every guest.</p>"
    return text, html


@transaction.atomic
def schedule_feedback_for_booking(booking):
    """Create one durable follow-up request after a referred booking completes.

    The function is deliberately safe to call from the central booking finance
    reconciliation path. It is a no-op for ordinary bookings and while the
    Partner Network/feedback feature is disabled.
    """
    settings_obj = get_partner_network_settings(booking.organisation)
    if settings_obj is None or settings_obj.feedback_channel == PartnerNetworkSettings.FEEDBACK_DISABLED:
        return None

    attribution = ReferralBookingAttribution.objects.select_related(
        "partner", "partner_location"
    ).filter(booking=booking).first()
    if attribution is None:
        return None

    existing = ReferralFeedbackRequest.objects.filter(booking=booking).first()

    if booking.status in {"cancelled", "refunded"} or booking.payment_status == "refunded":
        if existing and existing.status == ReferralFeedbackRequest.STATUS_PENDING:
            existing.status = ReferralFeedbackRequest.STATUS_SKIPPED
            existing.last_error = "Booking cancelled or refunded before follow-up."
            existing.save(update_fields=["status", "last_error", "updated_at"])
        return existing

    if booking.status != "completed":
        return existing

    if existing:
        return existing

    request_obj = ReferralFeedbackRequest.objects.create(
        organisation=booking.organisation,
        booking=booking,
        partner=attribution.partner,
        partner_location=attribution.partner_location,
        channel=settings_obj.feedback_channel,
        review_url_snapshot=settings_obj.google_review_url,
        scheduled_for=timezone.now() + timedelta(hours=settings_obj.feedback_delay_hours),
    )

    # Schedule after commit so the worker cannot race the database transaction.
    from partner_network.tasks import send_referral_feedback_task

    transaction.on_commit(
        lambda: send_referral_feedback_task.apply_async(
            args=[request_obj.pk],
            eta=request_obj.scheduled_for,
        )
    )
    return request_obj


@transaction.atomic
def send_feedback_request(feedback_request_id: int):
    request_obj = (
        ReferralFeedbackRequest.objects.select_for_update()
        .select_related("booking__organisation", "partner", "partner_location")
        .filter(pk=feedback_request_id)
        .first()
    )
    if request_obj is None:
        return {"action": "missing"}
    if request_obj.status in {
        ReferralFeedbackRequest.STATUS_SENT,
        ReferralFeedbackRequest.STATUS_SKIPPED,
    }:
        return {"action": request_obj.status}
    if request_obj.scheduled_for > timezone.now():
        return {"action": "not_due", "scheduled_for": request_obj.scheduled_for.isoformat()}

    booking = request_obj.booking
    settings_obj = get_partner_network_settings(booking.organisation)
    if settings_obj is None:
        request_obj.status = ReferralFeedbackRequest.STATUS_SKIPPED
        request_obj.last_error = "Partner Network is disabled."
        request_obj.save(update_fields=["status", "last_error", "updated_at"])
        return {"action": "skipped", "reason": "network_disabled"}
    if booking.status != "completed" or booking.payment_status == "refunded":
        request_obj.status = ReferralFeedbackRequest.STATUS_SKIPPED
        request_obj.last_error = "Booking is no longer eligible for feedback follow-up."
        request_obj.save(update_fields=["status", "last_error", "updated_at"])
        return {"action": "skipped", "reason": "booking_ineligible"}

    request_obj.attempt_count += 1
    text, html = _feedback_copy(booking, request_obj.review_url_snapshot)
    responses: dict[str, object] = {}
    failures: list[str] = []
    sent_any = False

    if request_obj.channel in {
        PartnerNetworkSettings.FEEDBACK_EMAIL,
        PartnerNetworkSettings.FEEDBACK_BOTH,
    }:
        if not booking.customer_email:
            responses["email"] = {"status": "skipped", "reason": "missing_customer_email"}
        else:
            try:
                log = BookingEmailService._send_email(
                    booking=booking,
                    recipient=booking.customer_email,
                    subject=f"How was your Punta Cana experience? - {booking.booking_code}",
                    text_body=text,
                    html_body=html,
                    attachments=[],
                    audience="customer_referral_feedback",
                )
                email_status = getattr(log, "status", "skipped") if log else "skipped"
                responses["email"] = {"status": email_status, "notification_log_id": getattr(log, "pk", None)}
                sent_any = sent_any or email_status == "sent"
                if email_status == "failed":
                    failures.append("Email delivery failed.")
            except Exception as exc:
                responses["email"] = {"status": "failed", "error_type": exc.__class__.__name__}
                failures.append("Email delivery failed.")

    if request_obj.channel in {
        PartnerNetworkSettings.FEEDBACK_WHATSAPP,
        PartnerNetworkSettings.FEEDBACK_BOTH,
    }:
        if not booking.customer_whatsapp:
            responses["whatsapp"] = {"status": "skipped", "reason": "missing_customer_whatsapp"}
        elif not settings_obj.feedback_whatsapp_template_name:
            responses["whatsapp"] = {"status": "skipped", "reason": "missing_approved_template"}
        else:
            whatsapp_settings = TicketingWhatsAppSettings.objects.filter(
                organisation=booking.organisation,
                is_active=True,
                connection_status="connected",
            ).first()
            if whatsapp_settings is None or not whatsapp_settings.is_connected:
                responses["whatsapp"] = {"status": "skipped", "reason": "whatsapp_not_connected"}
            else:
                try:
                    service = BookingWhatsAppService(whatsapp_settings)
                    # Expected approved Meta template body variables:
                    # {{1}} customer name, {{2}} public review/feedback URL.
                    result = service.send_template(
                        booking.customer_whatsapp,
                        template_name=settings_obj.feedback_whatsapp_template_name,
                        language_code=settings_obj.feedback_whatsapp_template_language or "en_US",
                        components=[
                            service.body_component([
                                booking.customer_name or "Guest",
                                request_obj.review_url_snapshot or "",
                            ])
                        ],
                    )
                    responses["whatsapp"] = {
                        "status": "sent",
                        "message_id": result.message_id,
                    }
                    sent_any = True
                except Exception as exc:
                    responses["whatsapp"] = {"status": "failed", "error_type": exc.__class__.__name__}
                    failures.append("WhatsApp delivery failed.")

    request_obj.provider_response = responses
    if sent_any:
        request_obj.status = ReferralFeedbackRequest.STATUS_SENT
        request_obj.sent_at = timezone.now()
        request_obj.last_error = "; ".join(failures)
    elif failures:
        request_obj.status = ReferralFeedbackRequest.STATUS_FAILED
        request_obj.last_error = "; ".join(failures)
    else:
        request_obj.status = ReferralFeedbackRequest.STATUS_SKIPPED
        request_obj.last_error = "No configured delivery channel was available."
    request_obj.save(
        update_fields=[
            "attempt_count",
            "provider_response",
            "status",
            "sent_at",
            "last_error",
            "updated_at",
        ]
    )
    return {"action": request_obj.status, "responses": responses}
