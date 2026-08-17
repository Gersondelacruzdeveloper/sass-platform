"""Model integrity tests for immutable booking financial snapshots."""

from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.models import (
    Booking,
    BookingFinancialSnapshot,
    BookingItem,
    ExperienceProduct,
    ProductBusinessAgreement,
    TicketingBusinessEntity,
)


class FinancialSnapshotModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Snapshot Organisation A",
            slug="snapshot-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Snapshot Organisation B",
            slug="snapshot-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Snapshot Partner A",
            slug="snapshot-partner-a",
        )
        cls.entity_a_second = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Snapshot Partner A Second",
            slug="snapshot-partner-a-second",
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Snapshot Partner B",
            slug="snapshot-partner-b",
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Snapshot Product A",
            slug="snapshot-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Snapshot Product B",
            slug="snapshot-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            adult_cost_price=Decimal("70.00"),
            status="active",
        )
        cls.agreement_a = ProductBusinessAgreement.objects.create(
            organisation=cls.organisation_a,
            business_entity=cls.entity_a,
            product=cls.product_a,
            name="Snapshot Agreement A",
            version=1,
            effective_from=date(2026, 1, 1),
        )
        cls.agreement_a_second = ProductBusinessAgreement.objects.create(
            organisation=cls.organisation_a,
            business_entity=cls.entity_a_second,
            product=cls.product_a,
            name="Snapshot Agreement A Second",
            version=1,
            effective_from=date(2026, 1, 1),
        )
        cls.agreement_b = ProductBusinessAgreement.objects.create(
            organisation=cls.organisation_b,
            business_entity=cls.entity_b,
            product=cls.product_b,
            name="Snapshot Agreement B",
            version=1,
            effective_from=date(2026, 1, 1),
        )

    def make_booking(self, organisation=None, **overrides):
        values = {
            "organisation": organisation or self.organisation_a,
            "customer_name": "Snapshot Customer",
            "status": "confirmed",
            "total_amount": Decimal("100.00"),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_item(self, booking=None, **overrides):
        booking = booking or self.make_booking()
        default_product = (
            self.product_a
            if booking.organisation_id == self.organisation_a.id
            else self.product_b
        )
        values = {
            "booking": booking,
            "product": default_product,
            "product_name": default_product.name,
            "product_type": default_product.product_type,
            "quantity": 2,
            "unit_price": Decimal("50.00"),
            "unit_cost": Decimal("30.00"),
            "total": Decimal("100.00"),
        }
        values.update(overrides)
        return BookingItem.objects.create(**values)

    def make_snapshot(self, booking_item=None, **overrides):
        booking_item = booking_item or self.make_item()
        is_tenant_a = booking_item.booking.organisation_id == self.organisation_a.id
        values = {
            "organisation": booking_item.booking.organisation,
            "booking": booking_item.booking,
            "booking_item": booking_item,
            "business_entity": self.entity_a if is_tenant_a else self.entity_b,
            "agreement": self.agreement_a if is_tenant_a else self.agreement_b,
            "agreement_version": 1,
            "settlement_basis": "checked_in",
            "currency": "USD",
            "quantity": 2,
            "gross_amount": Decimal("100.00"),
            "discount_amount": Decimal("10.00"),
            "tax_amount": Decimal("0.00"),
            "net_customer_amount": Decimal("90.00"),
            "partner_entitlement": Decimal("55.00"),
            "platform_entitlement": Decimal("25.00"),
            "seller_entitlement": Decimal("10.00"),
            "collected_by_platform": Decimal("40.00"),
            "collected_by_partner": Decimal("30.00"),
            "collected_by_seller": Decimal("10.00"),
            "customer_balance_due": Decimal("10.00"),
            "primary_collection_party": "mixed",
        }
        values.update(overrides)
        return BookingFinancialSnapshot.objects.create(**values)

    def test_snapshot_defaults_are_financially_neutral(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot.objects.create(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
        )

        self.assertEqual(snapshot.agreement_version, 0)
        self.assertEqual(snapshot.currency, "USD")
        self.assertEqual(snapshot.quantity, 1)
        self.assertEqual(snapshot.primary_collection_party, "none")
        self.assertEqual(snapshot.allocated_total, Decimal("0.00"))
        self.assertEqual(snapshot.collected_total, Decimal("0.00"))
        self.assertEqual(snapshot.customer_balance_due, Decimal("0.00"))

    def test_allocated_total_sums_all_entitlement_parties(self):
        snapshot = self.make_snapshot()

        self.assertEqual(snapshot.allocated_total, Decimal("90.00"))

    def test_collected_total_sums_all_collection_parties(self):
        snapshot = self.make_snapshot()

        self.assertEqual(snapshot.collected_total, Decimal("80.00"))

    def test_snapshot_string_identifies_booking_and_item(self):
        snapshot = self.make_snapshot()

        self.assertEqual(
            str(snapshot),
            f"Financial snapshot - {snapshot.booking.booking_code} / item {snapshot.booking_item_id}",
        )

    def test_save_derives_booking_and_organisation_from_item(self):
        item = self.make_item()
        snapshot = self.make_snapshot(
            booking_item=item,
            organisation=self.organisation_b,
            booking=self.make_booking(organisation=self.organisation_b),
        )

        self.assertEqual(snapshot.booking, item.booking)
        self.assertEqual(snapshot.organisation, self.organisation_a)

    def test_resaving_after_item_change_realigns_booking_scope(self):
        snapshot = self.make_snapshot()
        booking_b = self.make_booking(organisation=self.organisation_b)
        item_b = self.make_item(booking=booking_b)

        snapshot.booking_item = item_b
        snapshot.save()
        snapshot.refresh_from_db()

        self.assertEqual(snapshot.booking, booking_b)
        self.assertEqual(snapshot.organisation, self.organisation_b)

    def test_calculation_data_defaults_are_independent(self):
        first = self.make_snapshot()
        second = self.make_snapshot()

        first.calculation_data["source"] = "agreement"

        self.assertEqual(second.calculation_data, {})

    def test_captured_at_defaults_to_current_time(self):
        before = timezone.now()
        snapshot = self.make_snapshot()
        after = timezone.now()

        self.assertLessEqual(before, snapshot.captured_at)
        self.assertLessEqual(snapshot.captured_at, after)

    def test_booking_item_has_only_one_financial_snapshot(self):
        item = self.make_item()
        self.make_snapshot(booking_item=item)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_snapshot(booking_item=item)

    def test_different_items_can_have_independent_snapshots(self):
        first = self.make_snapshot()
        second = self.make_snapshot()

        self.assertNotEqual(first.booking_item_id, second.booking_item_id)

    def test_full_clean_rejects_invalid_collection_party(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            primary_collection_party="invented-party",
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("primary_collection_party", context.exception.message_dict)

    def test_full_clean_rejects_zero_quantity(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            quantity=0,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("quantity", context.exception.message_dict)

    def test_full_clean_rejects_negative_financial_values(self):
        fields = (
            "gross_amount",
            "discount_amount",
            "tax_amount",
            "net_customer_amount",
            "partner_entitlement",
            "platform_entitlement",
            "seller_entitlement",
            "collected_by_platform",
            "collected_by_partner",
            "collected_by_seller",
            "customer_balance_due",
        )

        for field in fields:
            with self.subTest(field=field):
                item = self.make_item()
                snapshot = BookingFinancialSnapshot(
                    organisation=self.organisation_a,
                    booking=item.booking,
                    booking_item=item,
                    **{field: Decimal("-0.01")},
                )
                with self.assertRaises(ValidationError) as context:
                    snapshot.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_full_clean_rejects_cross_tenant_business_entity(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            business_entity=self.entity_b,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("business_entity", context.exception.message_dict)

    def test_full_clean_rejects_cross_tenant_agreement(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            agreement=self.agreement_b,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("agreement", context.exception.message_dict)

    def test_full_clean_rejects_agreement_for_different_business_entity(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            business_entity=self.entity_a,
            agreement=self.agreement_a_second,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("agreement", context.exception.message_dict)

    def test_full_clean_rejects_booking_that_differs_from_item_booking(self):
        item = self.make_item()
        other_booking = self.make_booking()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_a,
            booking=other_booking,
            booking_item=item,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("booking", context.exception.message_dict)

    def test_full_clean_rejects_organisation_that_differs_from_item_booking(self):
        item = self.make_item()
        snapshot = BookingFinancialSnapshot(
            organisation=self.organisation_b,
            booking=item.booking,
            booking_item=item,
        )

        with self.assertRaises(ValidationError) as context:
            snapshot.full_clean()

        self.assertIn("organisation", context.exception.message_dict)

    def test_deleting_booking_item_cascades_snapshot(self):
        snapshot = self.make_snapshot()

        snapshot.booking_item.delete()

        self.assertFalse(
            BookingFinancialSnapshot.objects.filter(pk=snapshot.pk).exists()
        )

    def test_deleting_booking_cascades_snapshot(self):
        snapshot = self.make_snapshot()

        snapshot.booking.delete()

        self.assertFalse(
            BookingFinancialSnapshot.objects.filter(pk=snapshot.pk).exists()
        )

    def test_deleting_business_entity_preserves_snapshot_and_clears_relation(self):
        entity = TicketingBusinessEntity.objects.create(
            organisation=self.organisation_a,
            name="Temporary Snapshot Partner",
            slug="temporary-snapshot-partner",
        )
        snapshot = self.make_snapshot(business_entity=entity, agreement=None)

        entity.delete()
        snapshot.refresh_from_db()

        self.assertIsNone(snapshot.business_entity)

    def test_deleting_agreement_preserves_snapshot_and_clears_relation(self):
        agreement = ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            version=99,
            effective_from=date(2026, 1, 1),
        )
        snapshot = self.make_snapshot(agreement=agreement)

        agreement.delete()
        snapshot.refresh_from_db()

        self.assertIsNone(snapshot.agreement)

    def test_deleting_organisation_cascades_snapshots(self):
        booking_b = self.make_booking(organisation=self.organisation_b)
        item_b = self.make_item(booking=booking_b)
        snapshot = self.make_snapshot(booking_item=item_b)

        self.organisation_b.delete()

        self.assertFalse(
            BookingFinancialSnapshot.objects.filter(pk=snapshot.pk).exists()
        )

