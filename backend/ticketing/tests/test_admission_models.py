"""Model integrity tests for admission tokens, scans, and admission records."""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.models import (
    AdmissionToken,
    Booking,
    BookingItem,
    ExperienceProduct,
    TicketAdmission,
    TicketScanAttempt,
    TicketingBusinessEntity,
)


class AdmissionModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Admission Organisation A",
            slug="admission-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Admission Organisation B",
            slug="admission-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Admission Partner A",
            slug="admission-partner-a",
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Admission Partner B",
            slug="admission-partner-b",
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Admission Product A",
            slug="admission-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Admission Product B",
            slug="admission-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            status="active",
        )

    def make_booking(self, organisation=None, **overrides):
        values = {
            "organisation": organisation or self.organisation_a,
            "customer_name": "Admission Customer",
            "status": "confirmed",
            "total_amount": Decimal("100.00"),
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    def make_item(self, booking=None, **overrides):
        booking = booking or self.make_booking()
        product = (
            self.product_a
            if booking.organisation_id == self.organisation_a.id
            else self.product_b
        )
        values = {
            "booking": booking,
            "product": product,
            "product_name": product.name,
            "quantity": 2,
            "unit_price": Decimal("50.00"),
            "unit_cost": Decimal("30.00"),
            "total": Decimal("100.00"),
        }
        values.update(overrides)
        return BookingItem.objects.create(**values)

    def make_token(self, booking_item=None, **overrides):
        booking_item = booking_item or self.make_item()
        entity = (
            self.entity_a
            if booking_item.booking.organisation_id == self.organisation_a.id
            else self.entity_b
        )
        values = {
            "organisation": booking_item.booking.organisation,
            "booking": booking_item.booking,
            "booking_item": booking_item,
            "business_entity": entity,
            "total_admissions": booking_item.quantity,
            "admitted_quantity": 0,
            "status": "active",
        }
        values.update(overrides)
        return AdmissionToken.objects.create(**values)

    def make_scan(self, token=None, **overrides):
        token = token or self.make_token()
        values = {
            "organisation": token.organisation,
            "business_entity": token.business_entity,
            "admission_token": token,
            "booking": token.booking,
            "booking_item": token.booking_item,
            "scanned_value": str(token.token),
            "result": "valid",
            "requested_quantity": 1,
            "admitted_quantity": 0,
        }
        values.update(overrides)
        return TicketScanAttempt.objects.create(**values)

    def make_admission(self, token=None, **overrides):
        token = token or self.make_token()
        values = {
            "organisation": token.organisation,
            "business_entity": token.business_entity,
            "booking": token.booking,
            "booking_item": token.booking_item,
            "admission_token": token,
            "quantity_admitted": 1,
            "status": "admitted",
        }
        values.update(overrides)
        return TicketAdmission.objects.create(**values)

    def test_token_defaults_and_string_representation(self):
        item = self.make_item()
        token = AdmissionToken.objects.create(
            organisation=item.booking.organisation,
            booking=item.booking,
            booking_item=item,
        )

        self.assertEqual(token.status, "active")
        self.assertEqual(token.total_admissions, 1)
        self.assertEqual(token.admitted_quantity, 0)
        self.assertTrue(token.is_primary)
        self.assertIsNotNone(token.token)
        self.assertIn(item.booking.booking_code, str(token))

    def test_token_values_are_unique(self):
        first = self.make_token()
        second = self.make_token()

        self.assertNotEqual(first.token, second.token)

    def test_database_rejects_duplicate_token_value(self):
        value = uuid4()
        self.make_token(token=value)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_token(token=value)

    def test_remaining_admissions_never_becomes_negative(self):
        token = self.make_token(total_admissions=2, admitted_quantity=1)
        self.assertEqual(token.remaining_admissions, 1)

        token.admitted_quantity = 5
        self.assertEqual(token.remaining_admissions, 0)

    def test_current_validity_requires_active_status_and_capacity(self):
        token = self.make_token(total_admissions=2, admitted_quantity=1)
        self.assertTrue(token.is_currently_valid)

        for status in ("revoked", "expired", "consumed"):
            with self.subTest(status=status):
                token.status = status
                self.assertFalse(token.is_currently_valid)

        token.status = "active"
        token.admitted_quantity = 2
        self.assertFalse(token.is_currently_valid)

    def test_current_validity_honours_time_window(self):
        now = timezone.now()
        future = self.make_token(valid_from=now + timedelta(hours=1))
        expired = self.make_token(valid_until=now - timedelta(seconds=1))
        current = self.make_token(
            valid_from=now - timedelta(hours=1),
            valid_until=now + timedelta(hours=1),
        )

        self.assertFalse(future.is_currently_valid)
        self.assertFalse(expired.is_currently_valid)
        self.assertTrue(current.is_currently_valid)

    def test_revoke_sets_status_timestamp_and_reason(self):
        token = self.make_token()

        token.revoke(reason="Booking cancelled.")
        token.refresh_from_db()

        self.assertEqual(token.status, "revoked")
        self.assertIsNotNone(token.revoked_at)
        self.assertEqual(token.revocation_reason, "Booking cancelled.")

    def test_new_primary_token_demotes_previous_primary(self):
        item = self.make_item()
        first = self.make_token(booking_item=item, is_primary=True)
        second = self.make_token(booking_item=item, is_primary=True)
        first.refresh_from_db()

        self.assertFalse(first.is_primary)
        self.assertTrue(second.is_primary)

    def test_nonprimary_token_does_not_demote_primary(self):
        item = self.make_item()
        primary = self.make_token(booking_item=item, is_primary=True)
        secondary = self.make_token(booking_item=item, is_primary=False)
        primary.refresh_from_db()

        self.assertTrue(primary.is_primary)
        self.assertFalse(secondary.is_primary)

    def test_token_save_derives_booking_and_organisation_from_item(self):
        item = self.make_item()
        token = self.make_token(
            booking_item=item,
            booking=self.make_booking(organisation=self.organisation_b),
            organisation=self.organisation_b,
        )

        self.assertEqual(token.booking, item.booking)
        self.assertEqual(token.organisation, self.organisation_a)

    def test_token_full_clean_rejects_invalid_status_and_zero_capacity(self):
        item = self.make_item()
        token = AdmissionToken(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            status="invented-status",
            total_admissions=0,
        )

        with self.assertRaises(ValidationError) as context:
            token.full_clean()

        self.assertIn("status", context.exception.message_dict)
        self.assertIn("total_admissions", context.exception.message_dict)

    def test_token_full_clean_rejects_admitted_above_total(self):
        item = self.make_item()
        token = AdmissionToken(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            total_admissions=1,
            admitted_quantity=2,
        )

        with self.assertRaises(ValidationError):
            token.full_clean()

    def test_database_rejects_admitted_above_total(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_token(total_admissions=1, admitted_quantity=2)

    def test_token_full_clean_rejects_invalid_date_range(self):
        item = self.make_item()
        token = AdmissionToken(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            valid_from=timezone.now(),
            valid_until=timezone.now() - timedelta(hours=1),
        )

        with self.assertRaises(ValidationError) as context:
            token.full_clean()

        self.assertIn("valid_until", context.exception.message_dict)

    def test_token_full_clean_rejects_cross_tenant_business_entity(self):
        item = self.make_item()
        token = AdmissionToken(
            organisation=self.organisation_a,
            booking=item.booking,
            booking_item=item,
            business_entity=self.entity_b,
        )

        with self.assertRaises(ValidationError) as context:
            token.full_clean()

        self.assertIn("business_entity", context.exception.message_dict)

    def test_token_metadata_defaults_are_independent(self):
        first = self.make_token()
        second = self.make_token()

        first.metadata["source"] = "web"

        self.assertEqual(second.metadata, {})

    def test_scan_defaults_and_string_representation(self):
        token = self.make_token()
        scan = TicketScanAttempt.objects.create(
            organisation=token.organisation,
            admission_token=token,
            result="valid",
        )

        self.assertEqual(scan.requested_quantity, 0)
        self.assertEqual(scan.admitted_quantity, 0)
        self.assertIn("valid", str(scan))

    def test_scan_full_clean_rejects_invalid_result(self):
        scan = TicketScanAttempt(
            organisation=self.organisation_a,
            result="invented-result",
        )

        with self.assertRaises(ValidationError) as context:
            scan.full_clean()

        self.assertIn("result", context.exception.message_dict)

    def test_scan_offline_event_id_is_unique(self):
        offline_id = uuid4()
        self.make_scan(offline_event_id=offline_id)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_scan(offline_event_id=offline_id)

    def test_scan_metadata_defaults_are_independent(self):
        first = self.make_scan()
        second = self.make_scan()

        first.metadata["offline"] = True

        self.assertEqual(second.metadata, {})

    def test_scan_full_clean_rejects_cross_tenant_token_and_entity(self):
        token = self.make_token()
        scan = TicketScanAttempt(
            organisation=self.organisation_b,
            business_entity=self.entity_b,
            admission_token=token,
            booking=token.booking,
            booking_item=token.booking_item,
            result="valid",
        )

        with self.assertRaises(ValidationError):
            scan.full_clean()

    def test_admission_defaults_effective_quantity_and_string(self):
        admission = self.make_admission()

        self.assertEqual(admission.status, "admitted")
        self.assertEqual(admission.quantity_admitted, 1)
        self.assertEqual(admission.effective_quantity, 1)
        self.assertIn(admission.booking.booking_code, str(admission))

    def test_reversed_and_void_admissions_have_zero_effective_quantity(self):
        admission = self.make_admission(quantity_admitted=2)

        for status in ("reversed", "void"):
            with self.subTest(status=status):
                admission.status = status
                self.assertEqual(admission.effective_quantity, 0)

    def test_reverse_sets_audit_fields_and_is_idempotent(self):
        admission = self.make_admission()

        admission.reverse(reason="Duplicate scan.")
        first_reversed_at = admission.reversed_at
        admission.reverse(reason="Should not replace original.")
        admission.refresh_from_db()

        self.assertEqual(admission.status, "reversed")
        self.assertEqual(admission.reversed_at, first_reversed_at)
        self.assertEqual(admission.reversal_reason, "Duplicate scan.")

    def test_admission_save_derives_booking_and_organisation_from_item(self):
        token = self.make_token()
        admission = self.make_admission(
            token=token,
            booking=self.make_booking(organisation=self.organisation_b),
            organisation=self.organisation_b,
        )

        self.assertEqual(admission.booking, token.booking_item.booking)
        self.assertEqual(admission.organisation, self.organisation_a)

    def test_admission_full_clean_rejects_invalid_status_and_zero_quantity(self):
        token = self.make_token()
        admission = TicketAdmission(
            organisation=token.organisation,
            booking=token.booking,
            booking_item=token.booking_item,
            admission_token=token,
            status="invented-status",
            quantity_admitted=0,
        )

        with self.assertRaises(ValidationError) as context:
            admission.full_clean()

        self.assertIn("status", context.exception.message_dict)
        self.assertIn("quantity_admitted", context.exception.message_dict)

    def test_admission_full_clean_rejects_mismatched_token_or_entity(self):
        token = self.make_token()
        other_token = self.make_token()
        admission = TicketAdmission(
            organisation=token.organisation,
            booking=token.booking,
            booking_item=token.booking_item,
            admission_token=other_token,
            business_entity=self.entity_b,
        )

        with self.assertRaises(ValidationError):
            admission.full_clean()

    def test_admission_scan_attempt_is_one_to_one(self):
        token = self.make_token()
        scan = self.make_scan(token=token)
        self.make_admission(token=token, scan_attempt=scan)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_admission(token=token, scan_attempt=scan)

    def test_admission_token_is_protected_while_admission_exists(self):
        token = self.make_token()
        self.make_admission(token=token)

        with self.assertRaises(ProtectedError):
            token.delete()

    def test_deleting_booking_with_admission_is_protected_for_audit_integrity(self):
        token = self.make_token()
        scan = self.make_scan(token=token)
        admission = self.make_admission(token=token, scan_attempt=scan)
        booking = token.booking

        with self.assertRaises(ProtectedError):
            booking.delete()

        self.assertTrue(Booking.objects.filter(pk=booking.pk).exists())
        self.assertTrue(AdmissionToken.objects.filter(pk=token.pk).exists())
        self.assertTrue(TicketScanAttempt.objects.filter(pk=scan.pk).exists())
        self.assertTrue(TicketAdmission.objects.filter(pk=admission.pk).exists())
