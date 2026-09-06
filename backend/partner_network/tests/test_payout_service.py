from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
    ReferralCommission,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralPayout,
)
from partner_network.services.payout_service import (
    cancel_payout,
    generate_payout,
    mark_payout_paid,
)
from ticketing.models import Booking, ExperienceProduct, PickupLocation


class ReferralPayoutServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Payout Org",
            slug="partner-payout-org",
            business_type="ticketing",
            is_active=True,
        )
        PartnerNetworkSettings.objects.create(
            organisation=cls.organisation,
            enabled=True,
        )
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Payout Villa",
            slug="payout-villa",
            location_type="private_address",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Payout Villa",
            partner_type="villa",
            status="active",
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Payout Villa",
            property_type="villa",
            linked_pickup_location=cls.pickup,
            is_active=True,
        )
        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Payout Excursion",
            slug="payout-excursion",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )

    def make_booking(self, *, suffix: str):
        return Booking.objects.create(
            organisation=self.organisation,
            primary_product=self.product,
            source="public_site",
            status="confirmed",
            payment_status="paid",
            customer_name=f"Payout Guest {suffix}",
            customer_whatsapp=f"+18095550{suffix.zfill(4)}",
            adults=2,
            children=0,
            infants=0,
            subtotal_amount=Decimal("100.00"),
            total_amount=Decimal("100.00"),
            deposit_required=Decimal("20.00"),
            deposit_paid=Decimal("100.00"),
            balance_due=Decimal("0.00"),
        )

    def make_commission(
        self,
        *,
        suffix: str,
        amount: str,
        status=ReferralCommission.STATUS_EARNED,
        earned_at=None,
    ):
        booking = self.make_booking(suffix=suffix)
        commission = ReferralCommission.objects.create(
            organisation=self.organisation,
            partner=self.partner,
            partner_location=self.location,
            booking=booking,
            commission_rule_snapshot={
                "commission_type": "fixed_per_booking",
                "commission_value": amount,
            },
            trigger=PartnerNetworkSettings.COMMISSION_TRIGGER_DEPOSIT,
            currency="USD",
            amount=Decimal(amount),
            status=status,
            idempotency_key=f"payout-test-{suffix}",
            earned_at=earned_at or timezone.now(),
        )
        return commission

    def test_generate_payout_reserves_earned_commission_and_applies_debit(self):
        earned = self.make_commission(suffix="1001", amount="10.00")

        previously_paid = self.make_commission(
            suffix="1002",
            amount="6.00",
            status=ReferralCommission.STATUS_PAID,
        )
        previously_paid.paid_at = timezone.now() - timedelta(days=1)
        previously_paid.save(update_fields=["paid_at", "updated_at"])

        adjustment = ReferralBalanceAdjustment.objects.create(
            organisation=self.organisation,
            partner=self.partner,
            commission=previously_paid,
            currency="USD",
            amount=Decimal("6.00"),
            reason="Refunded after payout.",
        )

        today = timezone.localdate()
        payout = generate_payout(
            partner=self.partner,
            period_start=today - timedelta(days=1),
            period_end=today + timedelta(days=1),
            currency="USD",
        )

        earned.refresh_from_db()
        payout.refresh_from_db()

        self.assertEqual(earned.status, ReferralCommission.STATUS_PAYABLE)
        self.assertEqual(payout.status, ReferralPayout.STATUS_DRAFT)
        self.assertEqual(payout.lines.count(), 1)
        self.assertEqual(payout.lines.get().amount, Decimal("10.00"))
        self.assertEqual(payout.adjustment_lines.count(), 1)
        self.assertEqual(
            payout.adjustment_lines.get().adjustment_id,
            adjustment.pk,
        )
        self.assertEqual(
            payout.adjustment_lines.get().amount,
            Decimal("6.00"),
        )
        self.assertEqual(payout.total_amount, Decimal("4.00"))

    def test_mark_payout_paid_marks_commissions_paid(self):
        commission = self.make_commission(suffix="2001", amount="8.00")
        today = timezone.localdate()
        payout = generate_payout(
            partner=self.partner,
            period_start=today - timedelta(days=1),
            period_end=today + timedelta(days=1),
        )

        result = mark_payout_paid(
            payout=payout,
            payment_reference="BANK-REF-123",
            note="September payout",
        )

        result.refresh_from_db()
        commission.refresh_from_db()

        self.assertEqual(result.status, ReferralPayout.STATUS_PAID)
        self.assertEqual(result.payment_reference, "BANK-REF-123")
        self.assertEqual(result.internal_note, "September payout")
        self.assertIsNotNone(result.paid_at)
        self.assertEqual(commission.status, ReferralCommission.STATUS_PAID)
        self.assertIsNotNone(commission.paid_at)

    def test_cancel_payout_releases_commission_back_to_earned(self):
        commission = self.make_commission(suffix="3001", amount="7.50")
        today = timezone.localdate()
        payout = generate_payout(
            partner=self.partner,
            period_start=today - timedelta(days=1),
            period_end=today + timedelta(days=1),
        )

        result = cancel_payout(
            payout=payout,
            note="Rebuild payout.",
        )

        result.refresh_from_db()
        commission.refresh_from_db()

        self.assertEqual(result.status, ReferralPayout.STATUS_CANCELLED)
        self.assertEqual(result.internal_note, "Rebuild payout.")
        self.assertEqual(commission.status, ReferralCommission.STATUS_EARNED)

    def test_reversed_commission_in_stale_draft_cannot_be_paid(self):
        commission = self.make_commission(suffix="4001", amount="5.00")
        today = timezone.localdate()
        payout = generate_payout(
            partner=self.partner,
            period_start=today - timedelta(days=1),
            period_end=today + timedelta(days=1),
        )

        commission.status = ReferralCommission.STATUS_REVERSED
        commission.reversed_at = timezone.now()
        commission.reversal_reason = "Refunded."
        commission.save(
            update_fields=[
                "status",
                "reversed_at",
                "reversal_reason",
                "updated_at",
            ]
        )

        with self.assertRaisesMessage(
            ValueError,
            "This payout contains a reversed commission and cannot be paid.",
        ):
            mark_payout_paid(payout=payout)

        payout.refresh_from_db()
        commission.refresh_from_db()

        self.assertEqual(payout.status, ReferralPayout.STATUS_DRAFT)
        self.assertEqual(commission.status, ReferralCommission.STATUS_REVERSED)

    def test_generate_payout_rejects_period_without_earned_commissions(self):
        today = timezone.localdate()

        with self.assertRaisesMessage(
            ValueError,
            "There are no earned commissions available for this payout period.",
        ):
            generate_payout(
                partner=self.partner,
                period_start=today - timedelta(days=1),
                period_end=today + timedelta(days=1),
            )
