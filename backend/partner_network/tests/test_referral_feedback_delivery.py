from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBookingAttribution,
    ReferralFeedbackRequest,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralQRCode,
    ReferralSession,
)
from partner_network.services.review_service import send_feedback_request
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import Booking, ExperienceProduct, PickupLocation


class ReferralFeedbackDeliveryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Feedback Org",
            slug="partner-feedback-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            google_review_url="https://example.com/google-review",
            feedback_channel=PartnerNetworkSettings.FEEDBACK_EMAIL,
            feedback_delay_hours=24,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Feedback Hotel",
            slug="feedback-hotel",
            location_type="hotel",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Feedback Hotel",
            partner_type="hotel",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Feedback Hotel",
            property_type="hotel",
            linked_pickup_location=cls.pickup,
            is_active=True,
        )
        cls.qr = ReferralQRCode.objects.create(
            partner_location=cls.location,
        )
        cls.conversation = CustomerAIConversation.objects.create(
            organisation=cls.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095553333",
        )
        now = timezone.now()
        cls.session = ReferralSession.objects.create(
            organisation=cls.organisation,
            conversation=cls.conversation,
            partner=cls.partner,
            partner_location=cls.location,
            qr_code=cls.qr,
            status=ReferralSession.STATUS_ACTIVE,
            started_at=now,
            last_activity_at=now,
            expires_at=now + timedelta(hours=72),
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Feedback Excursion",
            slug="feedback-excursion",
            product_type="excursion",
            adult_price=Decimal("80.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )

    def make_booking(self, *, customer_email="guest@example.com"):
        booking = Booking.objects.create(
            organisation=self.organisation,
            primary_product=self.product,
            source="public_site",
            status="completed",
            payment_status="paid",
            customer_name="Feedback Guest",
            customer_whatsapp="+18095553333",
            customer_email=customer_email,
            adults=1,
            children=0,
            infants=0,
            subtotal_amount=Decimal("80.00"),
            original_price=Decimal("80.00"),
            total_amount=Decimal("80.00"),
            deposit_required=Decimal("20.00"),
            deposit_paid=Decimal("80.00"),
            balance_due=Decimal("0.00"),
            completed_at=timezone.now(),
        )
        ReferralBookingAttribution.objects.create(
            booking=booking,
            referral_session=self.session,
            partner=self.partner,
            partner_location=self.location,
            referral_qr=self.qr,
            source="qr_whatsapp",
        )
        return booking

    def make_due_feedback(self, booking):
        return ReferralFeedbackRequest.objects.create(
            organisation=self.organisation,
            booking=booking,
            partner=self.partner,
            partner_location=self.location,
            channel=PartnerNetworkSettings.FEEDBACK_EMAIL,
            review_url_snapshot="https://example.com/google-review",
            scheduled_for=timezone.now() - timedelta(minutes=1),
        )

    @patch(
        "partner_network.services.review_service."
        "BookingEmailService._send_email"
    )
    def test_due_feedback_email_sends_same_public_review_link(self, send_email):
        booking = self.make_booking()
        feedback = self.make_due_feedback(booking)
        send_email.return_value = SimpleNamespace(status="sent", pk=321)

        result = send_feedback_request(feedback.pk)

        feedback.refresh_from_db()

        self.assertEqual(result["action"], ReferralFeedbackRequest.STATUS_SENT)
        self.assertEqual(feedback.status, ReferralFeedbackRequest.STATUS_SENT)
        self.assertEqual(feedback.attempt_count, 1)
        self.assertIsNotNone(feedback.sent_at)

        send_email.assert_called_once()
        kwargs = send_email.call_args.kwargs
        self.assertEqual(kwargs["booking"], booking)
        self.assertEqual(kwargs["recipient"], "guest@example.com")
        self.assertIn(
            "https://example.com/google-review",
            kwargs["text_body"],
        )
        self.assertIn(
            "https://example.com/google-review",
            kwargs["html_body"],
        )
        self.assertEqual(kwargs["audience"], "customer_referral_feedback")

        # There is no rating/sentiment branch in this delivery call. The
        # configured external review link is presented consistently.
        self.assertNotIn("rating", kwargs)
        self.assertNotIn("sentiment", kwargs)

    @patch(
        "partner_network.services.review_service."
        "BookingEmailService._send_email"
    )
    def test_disabled_partner_network_skips_due_feedback(self, send_email):
        booking = self.make_booking()
        feedback = self.make_due_feedback(booking)

        self.settings.enabled = False
        self.settings.save(update_fields=["enabled"])

        result = send_feedback_request(feedback.pk)

        feedback.refresh_from_db()

        self.assertEqual(result["action"], "skipped")
        self.assertEqual(result["reason"], "network_disabled")
        self.assertEqual(feedback.status, ReferralFeedbackRequest.STATUS_SKIPPED)
        self.assertEqual(feedback.attempt_count, 0)
        send_email.assert_not_called()

    @patch(
        "partner_network.services.review_service."
        "BookingEmailService._send_email"
    )
    def test_missing_customer_email_skips_without_failure(self, send_email):
        booking = self.make_booking(customer_email="")
        feedback = self.make_due_feedback(booking)

        result = send_feedback_request(feedback.pk)

        feedback.refresh_from_db()

        self.assertEqual(result["action"], ReferralFeedbackRequest.STATUS_SKIPPED)
        self.assertEqual(feedback.status, ReferralFeedbackRequest.STATUS_SKIPPED)
        self.assertEqual(feedback.attempt_count, 1)
        self.assertEqual(
            feedback.provider_response["email"]["reason"],
            "missing_customer_email",
        )
        send_email.assert_not_called()
