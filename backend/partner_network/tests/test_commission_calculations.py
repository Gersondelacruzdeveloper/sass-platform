from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from partner_network.models import ReferralCommissionRule
from partner_network.services.commission_service import calculate_commission_amount


class ReferralCommissionCalculationTests(SimpleTestCase):
    def make_rule(self, *, commission_type: str, value: str):
        return SimpleNamespace(
            commission_type=commission_type,
            commission_value=Decimal(value),
        )

    def test_fixed_per_booking(self):
        rule = self.make_rule(
            commission_type=ReferralCommissionRule.TYPE_FIXED_BOOKING,
            value="6.00",
        )
        booking = SimpleNamespace()

        amount = calculate_commission_amount(
            rule=rule,
            booking=booking,
        )

        self.assertEqual(amount, Decimal("6.00"))

    def test_fixed_per_guest(self):
        rule = self.make_rule(
            commission_type=ReferralCommissionRule.TYPE_FIXED_GUEST,
            value="4.00",
        )
        booking = SimpleNamespace(total_guests=3)

        amount = calculate_commission_amount(
            rule=rule,
            booking=booking,
        )

        self.assertEqual(amount, Decimal("12.00"))

    def test_percentage_of_sale(self):
        rule = self.make_rule(
            commission_type=ReferralCommissionRule.TYPE_PERCENT_SALE,
            value="10.00",
        )
        booking = SimpleNamespace(total_amount=Decimal("125.00"))

        amount = calculate_commission_amount(
            rule=rule,
            booking=booking,
        )

        self.assertEqual(amount, Decimal("12.50"))

    def test_percentage_of_platform_margin(self):
        rule = self.make_rule(
            commission_type=ReferralCommissionRule.TYPE_PERCENT_MARGIN,
            value="25.00",
        )
        booking = SimpleNamespace()
        item = SimpleNamespace(
            total=Decimal("100.00"),
            unit_cost=Decimal("60.00"),
            quantity=1,
        )

        amount = calculate_commission_amount(
            rule=rule,
            booking=booking,
            item=item,
        )

        self.assertEqual(amount, Decimal("10.00"))

    def test_platform_margin_never_goes_negative(self):
        rule = self.make_rule(
            commission_type=ReferralCommissionRule.TYPE_PERCENT_MARGIN,
            value="50.00",
        )
        booking = SimpleNamespace()
        item = SimpleNamespace(
            total=Decimal("50.00"),
            unit_cost=Decimal("70.00"),
            quantity=1,
        )

        amount = calculate_commission_amount(
            rule=rule,
            booking=booking,
            item=item,
        )

        self.assertEqual(amount, Decimal("0.00"))
