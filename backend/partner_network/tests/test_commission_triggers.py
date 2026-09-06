from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
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
    sync_referral_commissions_for_booking,
)
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.models import Booking, ExperienceProduct, PickupLocation


class ReferralCommissionTriggerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Commission Org",
            slug="partner-commission-org",
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
            name="Commission Villa",
            slug="commission-villa",
            location_type="private_address",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Commission Villa",
            partner_type="villa",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Commission Villa",
            property_type="villa",
            linked_pickup_location=cls.pickup,
            is_active=True,
        )
        cls.qr = ReferralQRCode.objects.create(partner_location=cls.location)
        cls.conversation = CustomerAIConversation.objects.create(
            organisation=cls.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550991",
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
            name="Commission Excursion",
            slug="commission-excursion",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )

    def make_booking(self, *, payment_status="unpaid", status="confirmed"):
        booking = Booking.objects.create(
            organisation=self.organisation,
            primary_product=self.product,
            source="public_site",
            status=status,
            payment_status=payment_status,
            customer_name="Referral Guest",
            customer_whatsapp="+18095550991",
            adults=2,
            children=0,
            infants=0,
            subtotal_amount=Decimal("100.00"),
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
            is_active=True,
        )

    def test_deposit_trigger_earns_on_deposit_and_snapshots_rule(self):
        rule = self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT
        )
        booking = self.make_booking(payment_status="unpaid")

        created = create_pending_commissions_for_booking(booking)

        self.assertEqual(len(created), 1)
        commission = created[0]
        self.assertEqual(commission.status, ReferralCommission.STATUS_PENDING)
        self.assertEqual(commission.amount, Decimal("6.00"))
        self.assertEqual(
            commission.commission_rule_snapshot["commission_value"],
            "6.0000",
        )

        # Changing the live rule later must not rewrite historical booking terms.
        rule.commission_value = Decimal("9.00")
        rule.save()
        commission.refresh_from_db()
        self.assertEqual(
            commission.commission_rule_snapshot["commission_value"],
            "6.0000",
        )

        booking.payment_status = "deposit_paid"
        booking.deposit_paid = Decimal("20.00")
        booking.balance_due = Decimal("80.00")
        booking.save(update_fields=["payment_status", "deposit_paid", "balance_due", "updated_at"])

        sync_referral_commissions_for_booking(booking)
        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_EARNED)
        self.assertIsNotNone(commission.earned_at)

    def test_full_payment_trigger_waits_until_fully_paid(self):
        self.make_rule(trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_FULL)
        booking = self.make_booking(payment_status="deposit_paid")

        created = create_pending_commissions_for_booking(booking)
        commission = created[0]
        self.assertEqual(commission.status, ReferralCommission.STATUS_PENDING)

        booking.payment_status = "paid"
        booking.deposit_paid = Decimal("100.00")
        booking.balance_due = Decimal("0.00")
        booking.save(update_fields=["payment_status", "deposit_paid", "balance_due", "updated_at"])

        sync_referral_commissions_for_booking(booking)
        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_EARNED)

    def test_service_completed_trigger_waits_for_completed_booking(self):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_COMPLETED
        )
        booking = self.make_booking(payment_status="paid", status="confirmed")

        created = create_pending_commissions_for_booking(booking)
        commission = created[0]
        self.assertEqual(commission.status, ReferralCommission.STATUS_PENDING)

        booking.status = "completed"
        booking.save(update_fields=["status", "updated_at"])

        sync_referral_commissions_for_booking(booking)
        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_EARNED)

    def test_cancelled_booking_reverses_earned_commission(self):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT
        )
        booking = self.make_booking(payment_status="deposit_paid")

        commission = create_pending_commissions_for_booking(booking)[0]
        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_EARNED)

        booking.status = "cancelled"
        booking.save(update_fields=["status", "updated_at"])
        sync_referral_commissions_for_booking(
            booking,
            reversal_reason="Customer cancelled.",
        )

        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_REVERSED)
        self.assertEqual(commission.reversal_reason, "Customer cancelled.")
        self.assertIsNotNone(commission.reversed_at)

    def test_refund_after_paid_commission_creates_one_balance_adjustment(self):
        self.make_rule(
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT
        )
        booking = self.make_booking(payment_status="deposit_paid")

        commission = create_pending_commissions_for_booking(booking)[0]
        commission.status = ReferralCommission.STATUS_PAID
        commission.paid_at = timezone.now()
        commission.save(update_fields=["status", "paid_at", "updated_at"])

        booking.payment_status = "refunded"
        booking.status = "refunded"
        booking.save(update_fields=["payment_status", "status", "updated_at"])

        sync_referral_commissions_for_booking(booking, reversal_reason="Refunded.")
        sync_referral_commissions_for_booking(booking, reversal_reason="Refunded.")

        commission.refresh_from_db()
        self.assertEqual(commission.status, ReferralCommission.STATUS_REVERSED)
        self.assertEqual(
            ReferralBalanceAdjustment.objects.filter(commission=commission).count(),
            1,
        )
        adjustment = ReferralBalanceAdjustment.objects.get(commission=commission)
        self.assertEqual(adjustment.amount, Decimal("6.00"))
        self.assertEqual(adjustment.reason, "Refunded.")
