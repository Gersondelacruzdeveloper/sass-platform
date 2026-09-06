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


class ReferralPaymentIntegrationTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Payment Org",
            slug="partner-payment-org",
            business_type="ticketing",
            is_active=True,
        )
        cls.settings = PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
            default_commission_trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Payment Villa",
            slug="payment-villa",
            location_type="private_address",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Payment Villa",
            partner_type="villa",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Payment Villa",
            property_type="villa",
            linked_pickup_location=cls.pickup,
            is_active=True,
        )
        cls.qr = ReferralQRCode.objects.create(
            partner_location=cls.location,
        )
        cls.conversation = CustomerAIConversation.objects.create(
            organisation=cls.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095551234",
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
            name="Payment Excursion",
            slug="payment-excursion",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )

    def make_booking(self):
        booking = Booking.objects.create(
            organisation=self.organisation,
            primary_product=self.product,
            source="public_site",
            status="confirmed",
            payment_status="unpaid",
            customer_name="Referral Guest",
            customer_whatsapp="+18095551234",
            adults=2,
            children=0,
            infants=0,
            subtotal_amount=Decimal("100.00"),
            original_price=Decimal("100.00"),
            total_amount=Decimal("100.00"),
            deposit_required=Decimal("20.00"),
            deposit_paid=Decimal("0.00"),
            balance_due=Decimal("100.00"),
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

    def make_rule(self, *, trigger):
        return ReferralCommissionRule.objects.create(
            organisation=self.organisation,
            partner=self.partner,
            commission_type=ReferralCommissionRule.TYPE_FIXED_BOOKING,
            commission_value=Decimal("6.00"),
            trigger=trigger,
            effective_from=date.today() - timedelta(days=1),
            is_active=True,
        )

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_real_deposit_payment_earns_deposit_triggered_commission(self, delay):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
        )
        booking = self.make_booking()
        commission = create_pending_commissions_for_booking(booking)[0]

        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_PENDING,
        )

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.record_customer_cash_to_owner(
                booking,
                Decimal("20.00"),
                payment_type="deposit",
                reference="partner-deposit-1",
            )

        booking.refresh_from_db()
        commission.refresh_from_db()

        self.assertEqual(booking.payment_status, "deposit_paid")
        self.assertEqual(booking.deposit_paid, Decimal("20.00"))
        self.assertEqual(booking.balance_due, Decimal("80.00"))
        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_EARNED,
        )
        self.assertIsNotNone(commission.earned_at)
        self.assertGreaterEqual(delay.call_count, 1)

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_full_payment_trigger_waits_for_balance_payment(self, delay):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_FULL,
        )
        booking = self.make_booking()
        commission = create_pending_commissions_for_booking(booking)[0]

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.record_customer_cash_to_owner(
                booking,
                Decimal("20.00"),
                payment_type="deposit",
                reference="partner-full-trigger-deposit",
            )

        booking.refresh_from_db()
        commission.refresh_from_db()
        self.assertEqual(booking.payment_status, "deposit_paid")
        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_PENDING,
        )

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.record_customer_cash_to_owner(
                booking,
                Decimal("80.00"),
                payment_type="balance",
                reference="partner-full-trigger-balance",
            )

        booking.refresh_from_db()
        commission.refresh_from_db()
        self.assertEqual(booking.payment_status, "paid")
        self.assertEqual(booking.deposit_paid, Decimal("100.00"))
        self.assertEqual(booking.balance_due, Decimal("0.00"))
        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_EARNED,
        )
        self.assertIsNotNone(commission.earned_at)

    @patch("ticketing.tasks.send_payment_confirmed_notifications_task.delay")
    def test_reprocessing_finance_state_does_not_duplicate_commission(self, delay):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
        )
        booking = self.make_booking()
        create_pending_commissions_for_booking(booking)

        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.record_customer_cash_to_owner(
                booking,
                Decimal("20.00"),
                payment_type="deposit",
                reference="partner-idempotent-deposit",
            )

        booking.refresh_from_db()

        # Simulate the same financial state being recalculated again by another
        # webhook/view path. Referral synchronization must remain idempotent.
        with self.captureOnCommitCallbacks(execute=True):
            booking_finance_service.recalculate_booking_payment_totals(
                booking,
            )

        self.assertEqual(
            ReferralCommission.objects.filter(booking=booking).count(),
            1,
        )
        commission = ReferralCommission.objects.get(booking=booking)
        self.assertEqual(
            commission.status,
            ReferralCommission.STATUS_EARNED,
        )
