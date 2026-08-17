"""Integrity tests for payments, seller commissions, and receipts."""

from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from organisations.models import Organisation

from ticketing.models import (
    Booking,
    BookingPayment,
    Receipt,
    Seller,
    SellerCommission,
)


class PaymentModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Payment Organisation A",
            slug="payment-model-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Payment Organisation B",
            slug="payment-model-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Payment Seller A",
            seller_slug="payment-seller-a",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Payment Seller B",
            seller_slug="payment-seller-b",
            application_status="approved",
            is_active=True,
        )

    def make_booking(self, organisation=None, seller=None, **overrides):
        organisation = organisation or self.organisation_a
        values = {
            "organisation": organisation,
            "seller": seller,
            "customer_name": "Payment Customer",
            "total_amount": Decimal("100.00"),
            "balance_due": Decimal("100.00"),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_payment(self, booking=None, **overrides):
        values = {
            "booking": booking or self.make_booking(),
            "amount": Decimal("25.00"),
            "payment_type": "partial",
            "payer_type": "customer",
            "method": "cash",
            "status": "confirmed",
        }
        values.update(overrides)
        return BookingPayment.objects.create(**values)

    def make_commission(self, booking=None, seller=None, organisation=None, **overrides):
        seller = seller or self.seller_a
        organisation = organisation or self.organisation_a
        booking = booking or self.make_booking(organisation=organisation, seller=seller)
        values = {
            "organisation": organisation,
            "seller": seller,
            "booking": booking,
            "amount": Decimal("15.00"),
            "rate_used": Decimal("15.00"),
            "margin_percent_used": Decimal("15.00"),
            "customer_discount_amount": Decimal("0.00"),
            "owner_net_amount": Decimal("85.00"),
        }
        values.update(overrides)
        return SellerCommission.objects.create(**values)

    def test_payment_defaults_and_string_representation(self):
        payment = BookingPayment.objects.create(
            booking=self.make_booking(),
            amount=Decimal("25.00"),
            payment_type="deposit",
            method="cash",
        )

        self.assertEqual(payment.payer_type, "customer")
        self.assertEqual(payment.status, "confirmed")
        self.assertEqual(payment.collected_by_party, "owner")
        self.assertTrue(payment.affects_owner_received)
        self.assertFalse(payment.affects_seller_collected)
        self.assertEqual(payment.settlement_status, "not_required")
        self.assertEqual(str(payment), f"{payment.booking.booking_code} - 25.00")

    def test_provider_response_defaults_are_independent(self):
        first = self.make_payment()
        second = self.make_payment()

        first.provider_response["private"] = "first-only"

        self.assertEqual(second.provider_response, {})

    def test_payment_full_clean_rejects_invalid_choices(self):
        payment = BookingPayment(
            booking=self.make_booking(),
            amount=Decimal("10.00"),
            payment_type="invented",
            payer_type="invented",
            method="invented",
            status="invented",
            collected_by_party="invented",
            settlement_status="invented",
        )

        with self.assertRaises(ValidationError) as context:
            payment.full_clean()

        for field in (
            "payment_type",
            "payer_type",
            "method",
            "status",
            "collected_by_party",
            "settlement_status",
        ):
            self.assertIn(field, context.exception.message_dict)

    def test_payment_full_clean_requires_positive_amount_for_every_payment_type(self):
        for payment_type in ("full", "deposit", "balance", "partial", "refund"):
            for amount in (Decimal("0.00"), Decimal("-0.01")):
                with self.subTest(payment_type=payment_type, amount=amount):
                    payment = BookingPayment(
                        booking=self.make_booking(),
                        amount=amount,
                        payment_type=payment_type,
                        method="cash",
                    )
                    with self.assertRaises(ValidationError) as context:
                        payment.full_clean()
                    self.assertIn("amount", context.exception.message_dict)

    def test_payment_full_clean_rejects_seller_from_another_tenant(self):
        payment = BookingPayment(
            booking=self.make_booking(organisation=self.organisation_a),
            seller=self.seller_b,
            amount=Decimal("25.00"),
            payment_type="partial",
            method="cash",
        )

        with self.assertRaises(ValidationError) as context:
            payment.full_clean()

        self.assertIn("seller", context.exception.message_dict)

    def test_payment_allows_booking_seller_from_same_tenant(self):
        booking = self.make_booking(seller=self.seller_a)
        payment = BookingPayment(
            booking=booking,
            seller=self.seller_a,
            amount=Decimal("25.00"),
            payment_type="partial",
            method="cash",
        )

        payment.full_clean()

    def test_duplicate_nonempty_provider_identifiers_are_database_rejected(self):
        identifier_fields = (
            "provider_payment_id",
            "provider_checkout_id",
            "provider_order_id",
            "provider_capture_id",
        )

        for field in identifier_fields:
            with self.subTest(field=field):
                booking = self.make_booking()
                identifier = f"stripe-{field}-duplicate"
                self.make_payment(
                    booking=booking,
                    provider="stripe",
                    **{field: identifier},
                )
                with self.assertRaises(IntegrityError):
                    with transaction.atomic():
                        self.make_payment(
                            booking=booking,
                            provider="stripe",
                            **{field: identifier},
                        )

    def test_same_provider_identifier_can_exist_for_different_providers(self):
        booking = self.make_booking()
        stripe = self.make_payment(
            booking=booking,
            provider="stripe",
            provider_payment_id="shared-provider-id",
        )
        paypal = self.make_payment(
            booking=booking,
            provider="paypal",
            provider_payment_id="shared-provider-id",
        )

        self.assertNotEqual(stripe.pk, paypal.pk)

    def test_blank_provider_identifiers_can_repeat(self):
        first = self.make_payment(provider="")
        second = self.make_payment(provider="")

        self.assertNotEqual(first.pk, second.pk)
        self.assertEqual(first.provider_payment_id, "")
        self.assertEqual(second.provider_payment_id, "")

    def test_deleting_booking_cascades_payments(self):
        booking = self.make_booking()
        payment = self.make_payment(booking=booking)

        booking.delete()

        self.assertFalse(BookingPayment.objects.filter(pk=payment.pk).exists())

    def test_deleting_seller_preserves_payment_and_clears_seller(self):
        seller = Seller.objects.create(
            organisation=self.organisation_a,
            full_name="Temporary Payment Seller",
            seller_slug="temporary-payment-seller",
        )
        payment = self.make_payment(
            booking=self.make_booking(seller=seller),
            seller=seller,
        )

        seller.delete()
        payment.refresh_from_db()

        self.assertIsNone(payment.seller)

    def test_commission_is_unique_per_seller_and_booking(self):
        booking = self.make_booking(seller=self.seller_a)
        self.make_commission(booking=booking, seller=self.seller_a)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_commission(booking=booking, seller=self.seller_a)

    def test_different_sellers_can_have_commissions_for_same_booking(self):
        other_seller = Seller.objects.create(
            organisation=self.organisation_a,
            full_name="Other Commission Seller",
            seller_slug="other-commission-seller",
        )
        booking = self.make_booking(seller=self.seller_a)
        first = self.make_commission(booking=booking, seller=self.seller_a)
        second = self.make_commission(booking=booking, seller=other_seller)

        self.assertNotEqual(first.pk, second.pk)

    def test_commission_full_clean_rejects_cross_tenant_relationships(self):
        booking_a = self.make_booking(organisation=self.organisation_a)
        cases = (
            {
                "organisation": self.organisation_a,
                "seller": self.seller_b,
                "booking": booking_a,
                "expected_field": "seller",
            },
            {
                "organisation": self.organisation_b,
                "seller": self.seller_b,
                "booking": booking_a,
                "expected_field": "booking",
            },
        )

        for case in cases:
            with self.subTest(expected_field=case["expected_field"]):
                commission = SellerCommission(
                    organisation=case["organisation"],
                    seller=case["seller"],
                    booking=case["booking"],
                    amount=Decimal("10.00"),
                )
                with self.assertRaises(ValidationError) as context:
                    commission.full_clean()
                self.assertIn(case["expected_field"], context.exception.message_dict)

    def test_commission_full_clean_rejects_negative_money_and_invalid_percentages(self):
        invalid_values = {
            "amount": Decimal("-0.01"),
            "rate_used": Decimal("-0.01"),
            "margin_percent_used": Decimal("100.01"),
            "customer_discount_amount": Decimal("-0.01"),
            "owner_net_amount": Decimal("-0.01"),
        }

        for field, value in invalid_values.items():
            with self.subTest(field=field):
                values = {
                    "organisation": self.organisation_a,
                    "seller": self.seller_a,
                    "booking": self.make_booking(seller=self.seller_a),
                    "amount": Decimal("10.00"),
                }
                values[field] = value
                commission = SellerCommission(**values)
                with self.assertRaises(ValidationError) as context:
                    commission.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_commission_string_contains_seller_booking_and_amount(self):
        commission = self.make_commission()

        self.assertEqual(
            str(commission),
            (
                f"{commission.seller.full_name} - "
                f"{commission.booking.booking_code} - 15.00"
            ),
        )

    def test_deleting_booking_cascades_commission(self):
        booking = self.make_booking(seller=self.seller_a)
        commission = self.make_commission(booking=booking, seller=self.seller_a)

        booking.delete()

        self.assertFalse(SellerCommission.objects.filter(pk=commission.pk).exists())

    def test_receipt_generates_unguessable_identifiers(self):
        receipt = Receipt.objects.create(booking=self.make_booking())

        self.assertRegex(receipt.receipt_number, r"^R-[0-9A-F]{8}$")
        self.assertRegex(receipt.public_url_token, r"^[0-9a-f]{32}$")
        self.assertEqual(str(receipt), receipt.receipt_number)

    def test_receipt_preserves_explicit_identifiers(self):
        receipt = Receipt.objects.create(
            booking=self.make_booking(),
            receipt_number="R-CUSTOM01",
            public_url_token="explicit-public-token",
        )

        self.assertEqual(receipt.receipt_number, "R-CUSTOM01")
        self.assertEqual(receipt.public_url_token, "explicit-public-token")

    def test_receipt_is_unique_per_booking(self):
        booking = self.make_booking()
        Receipt.objects.create(booking=booking)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Receipt.objects.create(booking=booking)

    def test_receipt_number_is_globally_unique(self):
        Receipt.objects.create(
            booking=self.make_booking(),
            receipt_number="R-UNIQUE01",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Receipt.objects.create(
                    booking=self.make_booking(),
                    receipt_number="R-UNIQUE01",
                )

    def test_receipt_data_defaults_are_independent(self):
        first = Receipt.objects.create(booking=self.make_booking())
        second = Receipt.objects.create(booking=self.make_booking())

        first.receipt_data["private"] = "first-only"

        self.assertEqual(second.receipt_data, {})

    def test_deleting_booking_cascades_receipt(self):
        booking = self.make_booking()
        receipt = Receipt.objects.create(booking=booking)

        booking.delete()

        self.assertFalse(Receipt.objects.filter(pk=receipt.pk).exists())
