"""Deterministic tests for the database-free ticketing finance helpers."""

from decimal import Decimal

from django.test import SimpleTestCase

from ticketing.finance.constants import ZERO
from ticketing.finance.utils import (
    add,
    clamp,
    clamp_discount_percent,
    deposit_met,
    divide,
    is_negative,
    is_positive,
    is_zero,
    money,
    money_str,
    multiply,
    owner_amount_remaining,
    paid_in_full,
    percent,
    percentage_amount,
    percent_str,
    remaining_balance,
    require_non_negative,
    require_percentage,
    round_money,
    seller_amount_owed_to_company,
    subtract,
    zero,
)


class FinanceUtilityTests(SimpleTestCase):
    def test_zero_returns_decimal_zero(self):
        result = zero()

        self.assertIsInstance(result, Decimal)
        self.assertEqual(result, Decimal("0.00"))
        self.assertEqual(result, ZERO)

    def test_money_converts_supported_values_without_using_float_arithmetic(self):
        cases = (
            (None, Decimal("0.00")),
            ("", Decimal("0.00")),
            (0, Decimal("0.00")),
            (12, Decimal("12.00")),
            ("12.345", Decimal("12.35")),
            (Decimal("12.344"), Decimal("12.34")),
            (1.1, Decimal("1.10")),
        )

        for value, expected in cases:
            with self.subTest(value=value):
                result = money(value)
                self.assertIsInstance(result, Decimal)
                self.assertEqual(result, expected)

    def test_money_uses_round_half_up_for_positive_and_negative_values(self):
        self.assertEqual(money("1.005"), Decimal("1.01"))
        self.assertEqual(money("-1.005"), Decimal("-1.01"))
        self.assertEqual(round_money("2.675"), Decimal("2.68"))

    def test_money_rejects_invalid_and_non_finite_values_safely(self):
        for value in (
            "not-money",
            object(),
            Decimal("NaN"),
            Decimal("Infinity"),
            Decimal("-Infinity"),
        ):
            with self.subTest(value=repr(value)):
                self.assertEqual(money(value), ZERO)

    def test_percent_normalizes_to_two_decimal_places(self):
        self.assertEqual(percent("15.555"), Decimal("15.56"))
        self.assertEqual(percent(None), ZERO)

    def test_percentage_amount_uses_decimal_rounding(self):
        self.assertEqual(
            percentage_amount(Decimal("99.99"), Decimal("15.00")),
            Decimal("15.00"),
        )
        self.assertEqual(percentage_amount("10.00", "33.33"), Decimal("3.33"))
        self.assertEqual(percentage_amount("100.00", "-5.00"), Decimal("-5.00"))

    def test_clamp_enforces_default_zero_minimum(self):
        self.assertEqual(clamp("-0.01"), ZERO)
        self.assertEqual(clamp("5.126"), Decimal("5.13"))

    def test_clamp_enforces_custom_minimum_and_maximum(self):
        self.assertEqual(clamp("5", minimum="10", maximum="20"), Decimal("10.00"))
        self.assertEqual(clamp("25", minimum="10", maximum="20"), Decimal("20.00"))
        self.assertEqual(clamp("15", minimum="10", maximum="20"), Decimal("15.00"))

    def test_discount_clamp_rejects_negative_and_caps_excess(self):
        self.assertEqual(clamp_discount_percent("-1", "15"), ZERO)
        self.assertEqual(clamp_discount_percent("10", "15"), Decimal("10.00"))
        self.assertEqual(clamp_discount_percent("22", "15"), Decimal("15.00"))

    def test_add_normalizes_each_operand_and_result(self):
        self.assertEqual(add("10.005", "2.005", None), Decimal("12.02"))
        self.assertEqual(add(), ZERO)

    def test_subtract_supports_multiple_operands(self):
        self.assertEqual(subtract("100", "15.25", "4.75"), Decimal("80.00"))
        self.assertEqual(subtract("5", "10"), Decimal("-5.00"))

    def test_multiply_uses_money_precision(self):
        self.assertEqual(multiply("12.50", "3"), Decimal("37.50"))
        self.assertEqual(multiply("1.005", "2"), Decimal("2.02"))

    def test_divide_rounds_and_returns_zero_for_zero_divisor(self):
        self.assertEqual(divide("10", "4"), Decimal("2.50"))
        self.assertEqual(divide("10", 0), ZERO)
        self.assertEqual(divide("10", None), ZERO)

    def test_money_comparison_helpers_use_normalized_values(self):
        self.assertTrue(is_zero(None))
        self.assertTrue(is_zero("0.004"))
        self.assertTrue(is_positive("0.005"))
        self.assertTrue(is_negative("-0.005"))
        self.assertFalse(is_positive("0"))
        self.assertFalse(is_negative("0"))

    def test_remaining_balance_never_becomes_negative(self):
        self.assertEqual(remaining_balance("100", "25.50"), Decimal("74.50"))
        self.assertEqual(remaining_balance("100", "100"), ZERO)
        self.assertEqual(remaining_balance("100", "125"), ZERO)

    def test_paid_in_full_accepts_exact_payment_and_overpayment(self):
        self.assertFalse(paid_in_full("100", "99.99"))
        self.assertTrue(paid_in_full("100", "100"))
        self.assertTrue(paid_in_full("100", "125"))

    def test_deposit_met_requires_positive_requirement(self):
        self.assertFalse(deposit_met("0", "100"))
        self.assertFalse(deposit_met("-1", "100"))
        self.assertFalse(deposit_met("25", "24.99"))
        self.assertTrue(deposit_met("25", "25"))
        self.assertTrue(deposit_met("25", "30"))

    def test_seller_amount_owed_to_company_never_becomes_negative(self):
        self.assertEqual(
            seller_amount_owed_to_company("100", "15"),
            Decimal("85.00"),
        )
        self.assertEqual(seller_amount_owed_to_company("10", "15"), ZERO)

    def test_owner_amount_remaining_never_becomes_negative(self):
        self.assertEqual(owner_amount_remaining("85", "20"), Decimal("65.00"))
        self.assertEqual(owner_amount_remaining("85", "85"), ZERO)
        self.assertEqual(owner_amount_remaining("85", "100"), ZERO)

    def test_display_helpers_have_stable_two_decimal_format(self):
        self.assertEqual(money_str("12.5"), "12.50")
        self.assertEqual(money_str(None), "0.00")
        self.assertEqual(percent_str("15.5"), "15.50%")

    def test_require_non_negative_accepts_zero_and_positive_values(self):
        self.assertEqual(require_non_negative("0"), ZERO)
        self.assertEqual(require_non_negative("10.129"), Decimal("10.13"))

    def test_require_non_negative_rejects_negative_value_with_field_name(self):
        with self.assertRaisesMessage(ValueError, "refund_amount cannot be negative."):
            require_non_negative("-0.01", field_name="refund_amount")

    def test_require_percentage_accepts_inclusive_boundaries(self):
        self.assertEqual(require_percentage("0"), ZERO)
        self.assertEqual(require_percentage("100"), Decimal("100.00"))
        self.assertEqual(require_percentage("33.335"), Decimal("33.34"))

    def test_require_percentage_rejects_values_outside_range(self):
        for value in ("-0.01", "100.01"):
            with self.subTest(value=value):
                with self.assertRaisesMessage(
                    ValueError,
                    "discount_percent must be between 0 and 100.",
                ):
                    require_percentage(value, field_name="discount_percent")
