"""Deterministic tests for the ticketing booking finance calculator."""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from ticketing.finance.calculator import (
    _get_item_external_option_identifiers,
    apply_booking_financial_snapshot,
    calculate_booking_financial_snapshot,
    calculate_booking_pricing,
    calculate_confirmed_payments,
    calculate_deposit_required,
    calculate_settlement_status,
    get_booking_customer_discount_percent,
    get_booking_original_price,
    get_booking_seller_margin_percent,
    get_item_default_seller_margin_percent,
    get_payment_receiver,
    payment_affects_owner_received,
    payment_affects_seller_collected,
    recalculate_booking,
)
from ticketing.finance.constants import (
    BOOKING_PAYMENT_DEPOSIT,
    BOOKING_PAYMENT_PAID,
    BOOKING_PAYMENT_PARTIAL,
    BOOKING_PAYMENT_REFUNDED,
    BOOKING_PAYMENT_UNPAID,
    SETTLEMENT_PARTIALLY_SETTLED,
    SETTLEMENT_PENDING,
    SETTLEMENT_SETTLED,
    ZERO,
)


class FakeRelatedManager:
    def __init__(self, values=()):
        self.values = list(values)

    def select_related(self, *fields):
        return self

    def all(self):
        return list(self.values)

    def filter(self, **criteria):
        return [
            value
            for value in self.values
            if all(getattr(value, key, None) == expected for key, expected in criteria.items())
        ]


def make_item(price="50.00", quantity=1, **overrides):
    values = {
        "id": 1,
        "product_id": 10,
        "product": SimpleNamespace(
            id=10,
            seller_margin_percent=Decimal("20.00"),
            seller_allowed_discount_percent=ZERO,
        ),
        "package_id": None,
        "event_ticket_type_id": None,
        "external_product_id": "",
        "external_variant_id": "",
        "external_availability_id": "",
        "original_unit_price": Decimal(price),
        "unit_price": Decimal(price),
        "quantity": quantity,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_payment(amount, **overrides):
    values = {
        "amount": Decimal(amount),
        "payment_type": "full",
        "status": "confirmed",
        "method": "cash",
        "provider": "",
        "seller": None,
        "collected_by_party": None,
        "affects_owner_received": None,
        "affects_seller_collected": None,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_booking(items=(), payments=(), **overrides):
    values = {
        "organisation_id": 1,
        "seller_id": None,
        "seller": None,
        "primary_product": None,
        "items": FakeRelatedManager(items),
        "payments": FakeRelatedManager(payments),
        "original_price": ZERO,
        "subtotal_amount": ZERO,
        "seller_margin_percent": ZERO,
        "customer_discount_percent": ZERO,
        "customer_discount_amount": ZERO,
        "discount_amount": ZERO,
        "deposit_required": ZERO,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FinanceCalculatorTests(SimpleTestCase):
    def test_original_price_uses_item_prices_and_quantities(self):
        booking = make_booking(items=(make_item("19.995", 2), make_item("10.00", 3)))

        self.assertEqual(get_booking_original_price(booking), Decimal("70.00"))

    def test_original_price_falls_back_to_booking_fields(self):
        self.assertEqual(
            get_booking_original_price(make_booking(original_price=Decimal("75.00"))),
            Decimal("75.00"),
        )
        self.assertEqual(
            get_booking_original_price(make_booking(subtotal_amount=Decimal("60.00"))),
            Decimal("60.00"),
        )

    def test_original_price_returns_zero_when_item_relation_fails(self):
        booking = make_booking()
        booking.items = Mock()
        booking.items.select_related.side_effect = RuntimeError("database unavailable")
        booking.items.all.side_effect = RuntimeError("database unavailable")

        self.assertEqual(get_booking_original_price(booking), ZERO)

    def test_booking_margin_uses_documented_priority(self):
        seller = SimpleNamespace(
            default_margin_percent=Decimal("12.00"), commission_rate=Decimal("8.00")
        )
        product = SimpleNamespace(
            seller_margin_percent=Decimal("15.00"),
            seller_allowed_discount_percent=Decimal("10.00"),
        )

        self.assertEqual(
            get_booking_seller_margin_percent(
                make_booking(
                    seller_margin_percent=Decimal("20.00"),
                    primary_product=product,
                    seller=seller,
                )
            ),
            Decimal("20.00"),
        )
        self.assertEqual(
            get_booking_seller_margin_percent(make_booking(primary_product=product, seller=seller)),
            Decimal("15.00"),
        )
        self.assertEqual(
            get_booking_seller_margin_percent(make_booking(seller=seller)),
            Decimal("12.00"),
        )

    def test_item_margin_prefers_item_product_over_primary_product(self):
        item = make_item()
        booking = make_booking(
            primary_product=SimpleNamespace(seller_margin_percent=Decimal("10.00")),
            seller=SimpleNamespace(default_margin_percent=Decimal("5.00")),
        )

        self.assertEqual(
            get_item_default_seller_margin_percent(booking, item), Decimal("20.00")
        )

    def test_customer_discount_percent_uses_explicit_percent_first(self):
        booking = make_booking(
            items=(make_item("100.00"),),
            customer_discount_percent=Decimal("7.50"),
            customer_discount_amount=Decimal("20.00"),
        )

        self.assertEqual(get_booking_customer_discount_percent(booking), Decimal("7.50"))

    def test_customer_discount_percent_is_derived_from_amount(self):
        booking = make_booking(
            items=(make_item("80.00"),), customer_discount_amount=Decimal("12.00")
        )

        self.assertEqual(get_booking_customer_discount_percent(booking), Decimal("15.00"))

    def test_external_option_identifiers_are_trimmed_and_deduplicated(self):
        item = make_item(
            external_product_id=" option-1 ",
            external_variant_id="option-1",
            external_availability_id="availability-2",
        )

        self.assertEqual(
            _get_item_external_option_identifiers(item),
            ["option-1", "availability-2"],
        )

    @patch("ticketing.finance.calculator.resolve_seller_commission_rule_for_item")
    def test_booking_pricing_aggregates_percentage_items(self, resolve_rule):
        resolve_rule.return_value = None
        booking = make_booking(
            items=(make_item("100.00"), make_item("50.00", 2, id=2)),
            customer_discount_percent=Decimal("10.00"),
        )

        result = calculate_booking_pricing(booking)

        self.assertEqual(result["original_price"], Decimal("200.00"))
        self.assertEqual(result["customer_discount_amount"], Decimal("20.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("20.00"))
        self.assertEqual(result["owner_net_amount"], Decimal("160.00"))
        self.assertEqual(result["commission_rule_source"], "legacy_percentage")

    @patch("ticketing.finance.calculator.resolve_seller_commission_rule_for_item")
    def test_global_fixed_commission_is_applied_once_for_multiple_items(self, resolve_rule):
        resolve_rule.return_value = None
        seller = SimpleNamespace(
            fixed_commission_amount=Decimal("30.00"),
            default_margin_percent=ZERO,
            commission_rate=ZERO,
        )
        booking = make_booking(
            items=(make_item("100.00"), make_item("50.00", id=2)),
            seller=seller,
            seller_id=7,
            customer_discount_percent=Decimal("10.00"),
        )

        result = calculate_booking_pricing(booking)

        self.assertEqual(result["seller_margin_amount"], Decimal("30.00"))
        self.assertEqual(result["customer_discount_amount"], Decimal("15.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("15.00"))
        self.assertEqual(result["commission_rule_source"], "seller_global_fixed")

    @patch("ticketing.finance.calculator.resolve_seller_commission_rule_for_item")
    def test_fixed_item_rule_can_apply_per_unit(self, resolve_rule):
        resolve_rule.return_value = {
            "rule_type": "fixed",
            "fixed_amount": Decimal("12.00"),
            "percentage": ZERO,
            "is_per_unit": True,
        }
        booking = make_booking(
            items=(make_item("50.00", quantity=2),),
            seller=SimpleNamespace(fixed_commission_amount=Decimal("99.00")),
            seller_id=7,
        )

        result = calculate_booking_pricing(booking)

        self.assertEqual(result["seller_margin_amount"], Decimal("24.00"))
        self.assertEqual(result["seller_commission_amount"], Decimal("24.00"))
        self.assertEqual(result["commission_rule_source"], "seller_product_rules")

    def test_payment_receiver_prefers_explicit_receiver(self):
        payment = make_payment("10.00", collected_by_party="seller", method="stripe")

        self.assertEqual(get_payment_receiver(payment), "seller")

    def test_payment_receiver_falls_back_to_seller_and_providers(self):
        cases = (
            (make_payment("10", seller=object()), "seller"),
            (make_payment("10", provider="stripe"), "stripe"),
            (make_payment("10", method="paypal"), "paypal"),
            (make_payment("10", method="bank_transfer"), "bank"),
            (make_payment("10"), "owner"),
        )

        for payment, expected in cases:
            with self.subTest(expected=expected):
                self.assertEqual(get_payment_receiver(payment), expected)

    def test_payment_affect_flags_override_receiver_defaults(self):
        payment = make_payment(
            "10.00",
            collected_by_party="seller",
            affects_owner_received=True,
            affects_seller_collected=False,
        )

        self.assertTrue(payment_affects_owner_received(payment))
        self.assertFalse(payment_affects_seller_collected(payment))

    def test_confirmed_payments_ignore_nonconfirmed_rows(self):
        booking = make_booking(
            payments=(
                make_payment("30.00", collected_by_party="owner"),
                make_payment("70.00", status="pending", collected_by_party="owner"),
            )
        )

        result = calculate_confirmed_payments(booking)

        self.assertEqual(result["customer_paid_total"], Decimal("30.00"))
        self.assertEqual(result["owner_received_amount"], Decimal("30.00"))

    def test_confirmed_payments_separate_owner_and_seller_collections(self):
        booking = make_booking(
            payments=(
                make_payment("40.00", collected_by_party="owner"),
                make_payment("60.00", collected_by_party="seller"),
            )
        )

        result = calculate_confirmed_payments(booking)

        self.assertEqual(result["customer_paid_total"], Decimal("100.00"))
        self.assertEqual(result["owner_received_amount"], Decimal("40.00"))
        self.assertEqual(result["seller_collected_amount"], Decimal("60.00"))

    def test_refunds_reduce_matching_totals_without_returning_negative_balances(self):
        booking = make_booking(
            payments=(
                make_payment("20.00", collected_by_party="owner"),
                make_payment(
                    "30.00", payment_type="refund", collected_by_party="owner"
                ),
            )
        )

        result = calculate_confirmed_payments(booking)

        self.assertEqual(result["customer_paid_total"], ZERO)
        self.assertEqual(result["owner_received_amount"], ZERO)
        self.assertEqual(result["refunded_total"], Decimal("30.00"))

    def test_existing_positive_deposit_requirement_has_priority(self):
        booking = make_booking(
            deposit_required=Decimal("25.00"),
            primary_product=SimpleNamespace(
                deposit_amount=Decimal("40.00"), deposit_percentage=Decimal("50.00")
            ),
        )

        self.assertEqual(calculate_deposit_required(booking, "100.00"), Decimal("25.00"))

    def test_product_deposit_amount_is_capped_at_customer_price(self):
        booking = make_booking(
            primary_product=SimpleNamespace(
                deposit_amount=Decimal("120.00"), deposit_percentage=ZERO
            )
        )

        self.assertEqual(calculate_deposit_required(booking, "100.00"), Decimal("100.00"))

    def test_product_deposit_percentage_is_calculated_with_decimal_rounding(self):
        booking = make_booking(
            primary_product=SimpleNamespace(
                deposit_amount=ZERO, deposit_percentage=Decimal("33.33")
            )
        )

        self.assertEqual(calculate_deposit_required(booking, "99.99"), Decimal("33.33"))

    def test_settlement_status_covers_pending_partial_and_settled(self):
        cases = (
            (("0", "0", "0"), SETTLEMENT_SETTLED),
            (("80", "0", "0"), SETTLEMENT_PENDING),
            (("80", "20", "0"), SETTLEMENT_PARTIALLY_SETTLED),
            (("80", "80", "0"), SETTLEMENT_SETTLED),
            (("80", "80", "10"), SETTLEMENT_PARTIALLY_SETTLED),
        )

        for arguments, expected in cases:
            with self.subTest(arguments=arguments):
                self.assertEqual(calculate_settlement_status(*arguments), expected)

    def test_snapshot_marks_booking_unpaid_without_confirmed_payments(self):
        booking = make_booking(items=(make_item("100.00"),))

        with patch(
            "ticketing.finance.calculator.resolve_seller_commission_rule_for_item",
            return_value=None,
        ):
            result = calculate_booking_financial_snapshot(booking)

        self.assertEqual(result["payment_status"], BOOKING_PAYMENT_UNPAID)
        self.assertEqual(result["balance_due"], Decimal("100.00"))

    def test_snapshot_distinguishes_partial_deposit_and_paid_statuses(self):
        product = SimpleNamespace(
            seller_margin_percent=Decimal("20.00"),
            seller_allowed_discount_percent=ZERO,
            deposit_amount=Decimal("25.00"),
            deposit_percentage=ZERO,
        )
        cases = (
            ("10.00", BOOKING_PAYMENT_PARTIAL),
            ("25.00", BOOKING_PAYMENT_DEPOSIT),
            ("100.00", BOOKING_PAYMENT_PAID),
        )

        for amount, expected in cases:
            with self.subTest(amount=amount):
                booking = make_booking(
                    items=(make_item("100.00"),),
                    payments=(make_payment(amount, collected_by_party="owner"),),
                    primary_product=product,
                )
                with patch(
                    "ticketing.finance.calculator.resolve_seller_commission_rule_for_item",
                    return_value=None,
                ):
                    result = calculate_booking_financial_snapshot(booking)
                self.assertEqual(result["payment_status"], expected)

    def test_snapshot_marks_fully_reversed_payment_as_refunded(self):
        booking = make_booking(
            items=(make_item("100.00"),),
            payments=(
                make_payment("100.00", collected_by_party="owner"),
                make_payment(
                    "100.00", payment_type="refund", collected_by_party="owner"
                ),
            ),
        )

        with patch(
            "ticketing.finance.calculator.resolve_seller_commission_rule_for_item",
            return_value=None,
        ):
            result = calculate_booking_financial_snapshot(booking)

        self.assertEqual(result["payment_status"], BOOKING_PAYMENT_REFUNDED)
        self.assertEqual(result["balance_due"], Decimal("100.00"))

    def test_apply_snapshot_updates_supported_fields_and_confirms_booking(self):
        booking = SimpleNamespace(
            total_amount=ZERO,
            balance_due=ZERO,
            payment_status=BOOKING_PAYMENT_UNPAID,
            status="pending_payment",
            confirmed_at=None,
            save=Mock(),
        )
        snapshot = {
            "total_amount": Decimal("90.00"),
            "balance_due": Decimal("65.00"),
            "payment_status": BOOKING_PAYMENT_DEPOSIT,
            "unknown_field": "ignored",
        }

        result = apply_booking_financial_snapshot(booking, snapshot)

        self.assertIs(result, booking)
        self.assertEqual(booking.total_amount, Decimal("90.00"))
        self.assertEqual(booking.status, "confirmed")
        self.assertIsNotNone(booking.confirmed_at)
        saved_fields = booking.save.call_args.kwargs["update_fields"]
        self.assertIn("status", saved_fields)
        self.assertIn("confirmed_at", saved_fields)
        self.assertEqual(len(saved_fields), len(set(saved_fields)))

    @patch("ticketing.finance.calculator.apply_booking_financial_snapshot")
    @patch("ticketing.finance.calculator.calculate_booking_financial_snapshot")
    def test_recalculate_booking_calculates_then_applies_one_snapshot(
        self, calculate_snapshot, apply_snapshot
    ):
        booking = object()
        snapshot = {"total_amount": Decimal("10.00")}
        calculate_snapshot.return_value = snapshot
        apply_snapshot.return_value = booking

        self.assertIs(recalculate_booking(booking), booking)
        calculate_snapshot.assert_called_once_with(booking)
        apply_snapshot.assert_called_once_with(booking, snapshot)
