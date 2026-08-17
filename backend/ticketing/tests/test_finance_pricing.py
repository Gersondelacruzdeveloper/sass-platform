"""Deterministic tests for ticketing.finance.pricing."""

from decimal import Decimal
from types import SimpleNamespace

from django.test import SimpleTestCase

from ticketing.finance.constants import ZERO
from ticketing.finance.pricing import (
    calculate_customer_discount_amount,
    calculate_customer_final_price,
    calculate_fixed_seller_commission_amount,
    calculate_fixed_seller_margin_total,
    calculate_owner_net_amount,
    calculate_pricing,
    calculate_pricing_from_booking_values,
    calculate_pricing_from_product,
    calculate_seller_commission_amount,
    calculate_seller_margin_amount,
    explain_pricing,
)


class FinancePricingTests(SimpleTestCase):
    def test_seller_margin_amount_uses_decimal_percentage(self):
        self.assertEqual(
            calculate_seller_margin_amount("99.99", "15.00"),
            Decimal("15.00"),
        )

    def test_customer_discount_amount_uses_decimal_percentage(self):
        self.assertEqual(
            calculate_customer_discount_amount("90.00", "10.00"),
            Decimal("9.00"),
        )

    def test_customer_final_price_subtracts_discount(self):
        self.assertEqual(
            calculate_customer_final_price("90.00", "9.00"),
            Decimal("81.00"),
        )

    def test_customer_final_price_never_becomes_negative(self):
        self.assertEqual(calculate_customer_final_price("10.00", "12.00"), ZERO)

    def test_percentage_commission_is_unused_seller_margin(self):
        self.assertEqual(
            calculate_seller_commission_amount("90.00", "15.00", "10.00"),
            Decimal("4.50"),
        )

    def test_percentage_commission_never_becomes_negative(self):
        self.assertEqual(
            calculate_seller_commission_amount("90.00", "10.00", "15.00"),
            ZERO,
        )

    def test_fixed_commission_subtracts_customer_discount(self):
        self.assertEqual(
            calculate_fixed_seller_commission_amount("20.00", "5.00"),
            Decimal("15.00"),
        )

    def test_fixed_commission_never_becomes_negative(self):
        self.assertEqual(
            calculate_fixed_seller_commission_amount("5.00", "20.00"),
            ZERO,
        )

    def test_fixed_margin_total_multiplies_per_unit(self):
        self.assertEqual(
            calculate_fixed_seller_margin_total("12.50", 3),
            Decimal("37.50"),
        )

    def test_fixed_margin_total_can_apply_once_per_booking_item(self):
        self.assertEqual(
            calculate_fixed_seller_margin_total("12.50", 3, is_per_unit=False),
            Decimal("12.50"),
        )

    def test_fixed_margin_total_normalizes_invalid_quantities_safely(self):
        for quantity in (None, 0, -2, "invalid"):
            with self.subTest(quantity=quantity):
                self.assertEqual(
                    calculate_fixed_seller_margin_total("10.00", quantity),
                    Decimal("10.00"),
                )

    def test_fixed_margin_total_rejects_negative_allowance_safely(self):
        self.assertEqual(calculate_fixed_seller_margin_total("-5.00", 3), ZERO)

    def test_owner_net_subtracts_seller_commission(self):
        self.assertEqual(
            calculate_owner_net_amount("81.00", "4.50"),
            Decimal("76.50"),
        )

    def test_owner_net_never_becomes_negative(self):
        self.assertEqual(calculate_owner_net_amount("5.00", "10.00"), ZERO)

    def test_percentage_pricing_returns_reconciled_snapshot(self):
        result = calculate_pricing(
            original_price="90.00",
            seller_margin_percent="15.00",
            customer_discount_percent="10.00",
        )

        self.assertEqual(result["seller_margin_amount"], Decimal("13.50"))
        self.assertEqual(result["customer_discount_amount"], Decimal("9.00"))
        self.assertEqual(result["customer_final_price"], Decimal("81.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("4.50"))
        self.assertEqual(result["owner_net_amount"], Decimal("76.50"))
        self.assertEqual(result["commission_rule_type"], "percentage")
        self.assertIsNone(result["fixed_seller_margin_amount"])

    def test_percentage_pricing_clamps_discount_to_available_margin(self):
        result = calculate_pricing("100.00", "15.00", "30.00")

        self.assertEqual(result["customer_discount_percent"], Decimal("15.00"))
        self.assertEqual(result["seller_commission_amount"], ZERO)
        self.assertEqual(result["owner_net_amount"], Decimal("85.00"))

    def test_percentage_pricing_can_reject_excessive_discount(self):
        with self.assertRaisesMessage(
            ValueError,
            "customer_discount_percent cannot exceed seller_margin_percent.",
        ):
            calculate_pricing(
                "100.00",
                "15.00",
                "15.01",
                allow_discount_clamp=False,
            )

    def test_percentage_pricing_rejects_invalid_percentages(self):
        cases = (
            ({"seller_margin_percent": "-0.01"}, "seller_margin_percent"),
            ({"seller_margin_percent": "100.01"}, "seller_margin_percent"),
            ({"customer_discount_percent": "-0.01"}, "customer_discount_percent"),
            ({"customer_discount_percent": "100.01"}, "customer_discount_percent"),
        )

        for values, field in cases:
            with self.subTest(values=values):
                with self.assertRaisesRegex(ValueError, field):
                    calculate_pricing("100.00", **values)

    def test_fixed_pricing_returns_reconciled_snapshot(self):
        result = calculate_pricing(
            original_price="100.00",
            customer_discount_percent="10.00",
            fixed_seller_margin_amount="25.00",
        )

        self.assertEqual(result["seller_margin_percent"], Decimal("25.00"))
        self.assertEqual(result["seller_margin_amount"], Decimal("25.00"))
        self.assertEqual(result["customer_discount_amount"], Decimal("10.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("15.00"))
        self.assertEqual(result["owner_net_amount"], Decimal("75.00"))
        self.assertEqual(result["commission_rule_type"], "fixed_amount")
        self.assertEqual(result["fixed_seller_margin_amount"], Decimal("25.00"))

    def test_fixed_allowance_is_capped_at_retail_price(self):
        result = calculate_pricing(
            "80.00", fixed_seller_margin_amount="100.00"
        )

        self.assertEqual(result["seller_margin_amount"], Decimal("80.00"))
        self.assertEqual(result["seller_margin_percent"], Decimal("100.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("80.00"))
        self.assertEqual(result["owner_net_amount"], ZERO)

    def test_negative_fixed_allowance_is_normalized_to_zero(self):
        result = calculate_pricing(
            "80.00", fixed_seller_margin_amount="-1.00"
        )

        self.assertEqual(result["seller_margin_amount"], ZERO)
        self.assertEqual(result["seller_commission_amount"], ZERO)
        self.assertEqual(result["owner_net_amount"], Decimal("80.00"))

    def test_fixed_pricing_clamps_discount_to_fixed_allowance(self):
        result = calculate_pricing(
            "100.00",
            customer_discount_percent="30.00",
            fixed_seller_margin_amount="20.00",
        )

        self.assertEqual(result["customer_discount_percent"], Decimal("20.00"))
        self.assertEqual(result["customer_discount_amount"], Decimal("20.00"))
        self.assertEqual(result["seller_commission_amount"], ZERO)

    def test_fixed_pricing_can_reject_discount_above_allowance(self):
        with self.assertRaisesMessage(
            ValueError,
            "Customer discount cannot exceed the fixed seller margin amount.",
        ):
            calculate_pricing(
                "100.00",
                customer_discount_percent="20.01",
                fixed_seller_margin_amount="20.00",
                allow_discount_clamp=False,
            )

    def test_zero_fixed_allowance_activates_fixed_mode(self):
        result = calculate_pricing(
            "100.00",
            seller_margin_percent="30.00",
            fixed_seller_margin_amount=ZERO,
        )

        self.assertEqual(result["commission_rule_type"], "fixed_amount")
        self.assertEqual(result["seller_margin_percent"], ZERO)
        self.assertEqual(result["seller_commission_amount"], ZERO)

    def test_pricing_uses_money_rounding_for_all_outputs(self):
        result = calculate_pricing("99.99", "33.33", "11.11")

        expected = {
            "original_price": Decimal("99.99"),
            "seller_margin_amount": Decimal("33.33"),
            "customer_discount_amount": Decimal("11.11"),
            "customer_final_price": Decimal("88.88"),
            "seller_commission_amount": Decimal("22.22"),
            "owner_net_amount": Decimal("66.66"),
        }
        for field, value in expected.items():
            with self.subTest(field=field):
                self.assertEqual(result[field], value)

    def test_booking_values_wrapper_matches_main_calculator(self):
        arguments = {
            "seller_margin_percent": Decimal("18.00"),
            "customer_discount_percent": Decimal("7.00"),
        }

        self.assertEqual(
            calculate_pricing_from_booking_values("125.00", **arguments),
            calculate_pricing("125.00", **arguments),
        )

    def test_product_pricing_multiplies_base_price_by_quantity(self):
        product = SimpleNamespace(
            base_price=Decimal("45.00"),
            seller_margin_percent=Decimal("20.00"),
            seller_allowed_discount_percent=ZERO,
        )

        result = calculate_pricing_from_product(
            product, quantity=3, customer_discount_percent="5.00"
        )

        self.assertEqual(result["original_price"], Decimal("135.00"))
        self.assertEqual(result["seller_margin_amount"], Decimal("27.00"))

    def test_product_pricing_falls_back_to_allowed_discount_percent(self):
        product = SimpleNamespace(
            base_price=Decimal("100.00"),
            seller_margin_percent=ZERO,
            seller_allowed_discount_percent=Decimal("12.00"),
        )

        result = calculate_pricing_from_product(product)

        self.assertEqual(result["seller_margin_percent"], Decimal("12.00"))

    def test_explicit_product_margin_overrides_product_default(self):
        product = SimpleNamespace(
            base_price=Decimal("100.00"),
            seller_margin_percent=Decimal("12.00"),
            seller_allowed_discount_percent=ZERO,
        )

        result = calculate_pricing_from_product(
            product, seller_margin_percent=Decimal("25.00")
        )

        self.assertEqual(result["seller_margin_percent"], Decimal("25.00"))

    def test_product_fixed_allowance_ignores_percentage_default(self):
        product = SimpleNamespace(
            base_price=Decimal("100.00"),
            seller_margin_percent=Decimal("50.00"),
            seller_allowed_discount_percent=ZERO,
        )

        result = calculate_pricing_from_product(
            product, quantity=2, fixed_seller_margin_amount=Decimal("30.00")
        )

        self.assertEqual(result["original_price"], Decimal("200.00"))
        self.assertEqual(result["seller_margin_amount"], Decimal("30.00"))
        self.assertEqual(result["seller_margin_percent"], Decimal("15.00"))

    def test_explain_pricing_preserves_snapshot_and_describes_percentage(self):
        snapshot = calculate_pricing("90.00", "15.00", "10.00")

        explanation = explain_pricing(snapshot)

        self.assertIs(explanation["details"], snapshot)
        self.assertIn("Percentage seller allowance 15.00%", explanation["summary"])
        self.assertIn("Owner net 76.50", explanation["summary"])

    def test_explain_pricing_describes_fixed_allowance(self):
        snapshot = calculate_pricing(
            "100.00", fixed_seller_margin_amount="20.00"
        )

        explanation = explain_pricing(snapshot)

        self.assertIn("Fixed seller allowance 20.00", explanation["summary"])
