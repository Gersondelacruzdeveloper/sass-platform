from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
    ReferralFeedbackRequest,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralQRCode,
    ReferralSession,
)
from partner_network.services.commission_service import (
    create_pending_commissions_for_booking,
)
from ticketing import booking_finance_service
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import Booking, ExperienceProduct, PickupLocation


class ReferralServiceCompletionIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Completion Org",
            slug="partner-completion-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            default_commission_trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_COMPLETED,
            google_review_url="https://example.com/reviews",
            feedback_delay_hours=24,
            feedback_channel=PartnerNetworkSettings.FEEDBACK_EMAIL,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Completion Hotel",
            slug="completion-hotel",
            location_type="hotel",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Completion Hotel",
            partner_type="hotel",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Completion Hotel",
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
            external_customer_id="18095554321",
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
            name="Completion Excursion",
            slug="completion-excursion",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )
        cls.rule = ReferralCommissionRule.objects.create(
            organisation=cls.organisation,
            partner=cls.partner,
            commission_type=ReferralCommissionRule.TYPE_FIXED_BOOKING,
            commission_value=Decimal("6.00"),
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_COMPLETED,
            effective_from=date.today() - timedelta(days=1),
            is_active=True,
        )

    def make_booking(self, *, attributed=True):
        booking = Booking.objects.create(
            organisation=self.organisation,
            primary_product=self.product,
            source="public_site",
            status="confirmed",
            payment_status="paid",
            customer_name="Completion Guest",
            customer_whatsapp="+18095554321",
            customer_email="guest@example.com",
            adults=2,
            children=0,
            infants=0,
            subtotal_amount=Decimal("100.00"),
            original_price=Decimal("100.00"),
            total_amount=Decimal("100.00"),
            deposit_required=Decimal("20.00"),
            deposit_paid=Decimal("100.00"),
            balance_due=Decimal("0.00"),
        )
        if attributed:
            ReferralBookingAttribution.objects.create(
                booking=booking,
                referral_session=self.session,
                partner=self.partner,
                partner_location=self.location,
                referral_qr=self.qr,
                source="qr_whatsapp",
            )
        return booking

    @patch("partner_network.tasks.send_referral_feedback_task.apply_async")
    def test_completion_earns_service_commission_and_schedules_feedback(self, apply_async):
        booking = self.make_booking()
        commission = create_pending_commissions_for_booking(booking)[0]

        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_PENDING,
        )
        self.assertEqual(ReferralFeedbackRequest.objects.count(), 0)

        booking.status = "completed"
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at", "updated_at"])

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.recalculate_booking_payment_totals(booking)

        commission.refresh_from_db()
        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_EARNED,
        )
        self.assertIsNotNone(commission.earned_at)

        feedback = ReferralFeedbackRequest.objects.get(booking=booking)
        self.assertEqual(feedback.partner, self.partner)
        self.assertEqual(feedback.partner_location, self.location)
        self.assertEqual(
            feedback.channel,
            PartnerNetworkSettings.FEEDBACK_EMAIL,
        )
        self.assertEqual(
            feedback.review_url_snapshot,
            "https://example.com/reviews",
        )
        self.assertEqual(
            feedback.status,
            ReferralFeedbackRequest.STATUS_PENDING,
        )
        self.assertGreater(
            feedback.scheduled_for,
            timezone.now() + timedelta(hours=23),
        )
        apply_async.assert_called_once()
        kwargs = apply_async.call_args.kwargs
        self.assertEqual(
            apply_async.call_args.args,
            (),
        )
        self.assertEqual(
            apply_async.call_args.kwargs["args"],
            [feedback.pk],
        )
        self.assertEqual(
            apply_async.call_args.kwargs["eta"],
            feedback.scheduled_for,
        )

    @patch("partner_network.tasks.send_referral_feedback_task.apply_async")
    def test_repeated_completion_reconciliation_does_not_duplicate_side_effects(self, apply_async):
        booking = self.make_booking()
        create_pending_commissions_for_booking(booking)

        booking.status = "completed"
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at", "updated_at"])

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.recalculate_booking_payment_totals(booking)

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.recalculate_booking_payment_totals(booking)

        self.assertEqual(
            ReferralCommission.objects.filter(booking=booking).count(),
            1,
        )
        self.assertEqual(
            ReferralFeedbackRequest.objects.filter(booking=booking).count(),
            1,
        )
        self.assertEqual(apply_async.call_count, 1)

    @patch("partner_network.tasks.send_referral_feedback_task.apply_async")
    def test_direct_completed_booking_has_no_referral_feedback_side_effects(self, apply_async):
        booking = self.make_booking(attributed=False)

        booking.status = "completed"
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at", "updated_at"])

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.recalculate_booking_payment_totals(booking)

        self.assertEqual(
            ReferralCommission.objects.filter(booking=booking).count(),
            0,
        )
        self.assertEqual(
            ReferralFeedbackRequest.objects.filter(booking=booking).count(),
            0,
        )
        apply_async.assert_not_called()
