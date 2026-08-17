"""Model-level integrity tests for bookings, items, and pickup snapshots."""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from organisations.models import Organisation

from ticketing.models import (
    Booking,
    BookingItem,
    BookingPickupInfo,
    Customer,
    ExperienceProduct,
    PickupLocation,
    PickupZone,
    ProductPickupSchedule,
    Seller,
)


class BookingModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Booking Organisation A",
            slug="booking-model-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Booking Organisation B",
            slug="booking-model-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.customer_a = Customer.objects.create(
            organisation=cls.organisation_a,
            full_name="Customer A",
            email="customer-a@example.com",
        )
        cls.customer_b = Customer.objects.create(
            organisation=cls.organisation_b,
            full_name="Customer B",
            email="customer-b@example.com",
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            full_name="Seller A",
            seller_slug="booking-seller-a",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Seller B",
            seller_slug="booking-seller-b",
            application_status="approved",
            is_active=True,
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Saona A",
            slug="saona-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Saona B",
            slug="saona-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            adult_cost_price=Decimal("70.00"),
            status="active",
        )

    def make_booking(self, **overrides):
        values = {
            "organisation": self.organisation_a,
            "customer": self.customer_a,
            "seller": self.seller_a,
            "primary_product": self.product_a,
            "customer_name": "Customer A",
            "adults": 2,
            "children": 1,
            "infants": 0,
            "total_amount": Decimal("250.00"),
            "deposit_paid": Decimal("50.00"),
            "balance_due": Decimal("200.00"),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def test_save_generates_booking_code_and_guest_total(self):
        booking = self.make_booking()

        self.assertRegex(booking.booking_code, r"^PCD-[0-9A-F]{8}$")
        self.assertEqual(booking.total_guests, 3)
        self.assertEqual(str(booking), booking.booking_code)

    def test_save_recalculates_guest_total_after_passenger_change(self):
        booking = self.make_booking()
        booking.adults = 1
        booking.children = 2
        booking.infants = 1
        booking.total_guests = 999
        booking.save()
        booking.refresh_from_db()

        self.assertEqual(booking.total_guests, 4)

    def test_booking_codes_are_unique_at_database_level(self):
        self.make_booking(booking_code="PCD-FIXED001")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_booking(booking_code="PCD-FIXED001")

    def test_booking_defaults_are_financially_neutral(self):
        booking = Booking.objects.create(
            organisation=self.organisation_a,
            customer_name="Default Customer",
        )

        self.assertEqual(booking.status, "pending_payment")
        self.assertEqual(booking.payment_status, "unpaid")
        self.assertEqual(booking.payment_mode, "pending_payment")
        self.assertEqual(booking.payment_method, "none")
        self.assertEqual(booking.payment_receiver, "none")
        self.assertEqual(booking.settlement_status, "not_required")
        self.assertEqual(booking.total_amount, Decimal("0.00"))
        self.assertEqual(booking.total_guests, 1)

    def test_recalculate_balance_due_uses_deposit_paid_and_caps_at_zero(self):
        booking = self.make_booking(
            total_amount=Decimal("100.00"),
            deposit_paid=Decimal("25.00"),
        )
        booking.recalculate_balance_due()
        self.assertEqual(booking.balance_due, Decimal("75.00"))

        booking.deposit_paid = Decimal("125.00")
        booking.recalculate_balance_due()
        self.assertEqual(booking.balance_due, Decimal("0.00"))

    def test_is_fully_paid_accepts_paid_status_or_zero_balance(self):
        unpaid = self.make_booking(payment_status="unpaid", balance_due=Decimal("1.00"))
        zero_balance = self.make_booking(
            payment_status="unpaid",
            balance_due=Decimal("0.00"),
        )
        paid = self.make_booking(payment_status="paid", balance_due=Decimal("20.00"))

        self.assertFalse(unpaid.is_fully_paid)
        self.assertTrue(zero_balance.is_fully_paid)
        self.assertTrue(paid.is_fully_paid)

    def test_commission_pending_amount_never_becomes_negative(self):
        booking = self.make_booking(
            seller_commission_amount=Decimal("25.00"),
            commission_paid_amount=Decimal("10.00"),
        )
        self.assertEqual(booking.commission_pending_amount, Decimal("15.00"))

        booking.commission_paid_amount = Decimal("30.00")
        self.assertEqual(booking.commission_pending_amount, Decimal("0.00"))

    def test_owner_outstanding_amount_never_becomes_negative(self):
        booking = self.make_booking(
            owner_net_amount=Decimal("85.00"),
            owner_received_amount=Decimal("20.00"),
        )
        self.assertEqual(booking.owner_outstanding_amount, Decimal("65.00"))

        booking.owner_received_amount = Decimal("100.00")
        self.assertEqual(booking.owner_outstanding_amount, Decimal("0.00"))

    def test_full_clean_rejects_invalid_booking_choices(self):
        booking = Booking(
            organisation=self.organisation_a,
            customer_name="Invalid Choice",
            status="invented-status",
            payment_status="invented-payment-status",
        )

        with self.assertRaises(ValidationError) as context:
            booking.full_clean()

        self.assertIn("status", context.exception.message_dict)
        self.assertIn("payment_status", context.exception.message_dict)

    def test_full_clean_rejects_negative_guest_counts(self):
        booking = Booking(
            organisation=self.organisation_a,
            customer_name="Negative Guests",
            adults=-1,
        )

        with self.assertRaises(ValidationError) as context:
            booking.full_clean()

        self.assertIn("adults", context.exception.message_dict)

    def test_full_clean_rejects_negative_booking_money(self):
        money_fields = (
            "subtotal_amount",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "deposit_required",
            "deposit_paid",
            "balance_due",
            "seller_collected_amount",
            "seller_commission_amount",
            "owner_net_amount",
            "owner_received_amount",
        )

        for field in money_fields:
            with self.subTest(field=field):
                booking = Booking(
                    organisation=self.organisation_a,
                    customer_name="Negative Money",
                    **{field: Decimal("-0.01")},
                )
                with self.assertRaises(ValidationError) as context:
                    booking.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_full_clean_rejects_cross_tenant_customer_seller_and_product(self):
        relations = {
            "customer": self.customer_b,
            "seller": self.seller_b,
            "primary_product": self.product_b,
        }

        for field, foreign_object in relations.items():
            with self.subTest(field=field):
                booking = Booking(
                    organisation=self.organisation_a,
                    customer_name="Cross Tenant",
                    **{field: foreign_object},
                )
                with self.assertRaises(ValidationError) as context:
                    booking.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_booking_item_save_recalculates_total_and_snapshots_product_type(self):
        booking = self.make_booking()
        item = BookingItem.objects.create(
            booking=booking,
            product=self.product_a,
            product_name="Saona Snapshot",
            quantity=3,
            unit_price=Decimal("99.99"),
            unit_cost=Decimal("60.00"),
            total=Decimal("0.00"),
        )

        self.assertEqual(item.total, Decimal("299.97"))
        self.assertEqual(item.product_type, "excursion")
        self.assertEqual(str(item), "Saona Snapshot x 3")

    def test_booking_item_save_preserves_explicit_product_type_snapshot(self):
        item = BookingItem.objects.create(
            booking=self.make_booking(),
            product=self.product_a,
            product_name="Historical Type",
            product_type="custom",
            quantity=1,
            unit_price=Decimal("50.00"),
            total=Decimal("0.00"),
        )

        self.assertEqual(item.product_type, "custom")

    def test_booking_item_profit_uses_cost_and_quantity(self):
        item = BookingItem(
            booking=self.make_booking(),
            product_name="Profit Item",
            quantity=4,
            unit_price=Decimal("25.00"),
            unit_cost=Decimal("10.50"),
            total=Decimal("100.00"),
        )

        self.assertEqual(item.profit, Decimal("58.00"))

    def test_booking_item_full_clean_rejects_zero_quantity_and_negative_money(self):
        invalid_values = {
            "quantity": 0,
            "unit_price": Decimal("-0.01"),
            "unit_cost": Decimal("-0.01"),
            "total": Decimal("-0.01"),
        }

        for field, value in invalid_values.items():
            with self.subTest(field=field):
                item = BookingItem(
                    booking=self.make_booking(),
                    product_name="Invalid Item",
                    quantity=1,
                    unit_price=Decimal("10.00"),
                    unit_cost=Decimal("5.00"),
                    total=Decimal("10.00"),
                )
                setattr(item, field, value)
                with self.assertRaises(ValidationError) as context:
                    item.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_booking_item_full_clean_rejects_cross_tenant_product(self):
        item = BookingItem(
            booking=self.make_booking(),
            product=self.product_b,
            product_name="Cross Tenant Product",
            quantity=1,
            unit_price=Decimal("100.00"),
            total=Decimal("100.00"),
        )

        with self.assertRaises(ValidationError) as context:
            item.full_clean()

        self.assertIn("product", context.exception.message_dict)

    def test_deleting_product_preserves_item_snapshots(self):
        booking = self.make_booking()
        product = ExperienceProduct.objects.create(
            organisation=self.organisation_a,
            name="Temporary Product",
            slug="temporary-product",
            product_type="ticket",
            adult_price=Decimal("40.00"),
        )
        item = BookingItem.objects.create(
            booking=booking,
            product=product,
            product_name="Permanent Snapshot Name",
            product_type="ticket",
            quantity=2,
            unit_price=Decimal("40.00"),
            total=Decimal("80.00"),
        )

        product.delete()
        item.refresh_from_db()

        self.assertIsNone(item.product)
        self.assertEqual(item.product_name, "Permanent Snapshot Name")
        self.assertEqual(item.product_type, "ticket")
        self.assertEqual(item.total, Decimal("80.00"))

    def test_deleting_booking_cascades_items_and_pickup_info(self):
        booking = self.make_booking()
        item = BookingItem.objects.create(
            booking=booking,
            product_name="Cascade Item",
            quantity=1,
            unit_price=Decimal("20.00"),
            total=Decimal("20.00"),
        )
        pickup = BookingPickupInfo.objects.create(
            booking=booking,
            hotel_or_location_name="Cascade Hotel",
        )

        booking.delete()

        self.assertFalse(BookingItem.objects.filter(pk=item.pk).exists())
        self.assertFalse(BookingPickupInfo.objects.filter(pk=pickup.pk).exists())

    def test_pickup_apply_schedule_copies_authoritative_snapshot_fields(self):
        zone = PickupZone.objects.create(
            organisation=self.organisation_a,
            name="Bavaro",
        )
        location = PickupLocation.objects.create(
            organisation=self.organisation_a,
            zone=zone,
            name="Example Resort",
            slug="example-resort",
            default_pickup_point="Main lobby",
            default_instructions="Wait near reception.",
        )
        schedule = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=location,
            specific_date=date(2026, 8, 20),
            pickup_time=time(8, 30),
            pickup_point="Tour desk",
            instructions="Arrive ten minutes early.",
        )
        pickup = BookingPickupInfo(
            booking=self.make_booking(),
            hotel_or_location_name="Placeholder",
        )

        pickup.apply_schedule(schedule)

        self.assertEqual(pickup.pickup_schedule, schedule)
        self.assertEqual(pickup.pickup_location, location)
        self.assertEqual(pickup.hotel_or_location_name, "Example Resort")
        self.assertEqual(pickup.pickup_zone_name, "Bavaro")
        self.assertEqual(pickup.pickup_time, time(8, 30))
        self.assertEqual(pickup.pickup_point, "Tour desk")
        self.assertEqual(pickup.instructions, "Arrive ten minutes early.")

    def test_pickup_apply_schedule_uses_location_fallbacks(self):
        location = PickupLocation.objects.create(
            organisation=self.organisation_a,
            name="Fallback Resort",
            slug="fallback-resort",
            default_pickup_point="Security gate",
            default_instructions="Bring confirmation.",
        )
        schedule = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=location,
            day_of_week=0,
            pickup_time=time(9, 0),
        )
        pickup = BookingPickupInfo(
            booking=self.make_booking(),
            hotel_or_location_name="Placeholder",
        )

        pickup.apply_schedule(schedule)

        self.assertEqual(pickup.pickup_zone_name, "")
        self.assertEqual(pickup.pickup_point, "Security gate")
        self.assertEqual(pickup.instructions, "Bring confirmation.")

    def test_pickup_info_is_unique_per_booking(self):
        booking = self.make_booking()
        BookingPickupInfo.objects.create(
            booking=booking,
            hotel_or_location_name="First Hotel",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                BookingPickupInfo.objects.create(
                    booking=booking,
                    hotel_or_location_name="Second Hotel",
                )
