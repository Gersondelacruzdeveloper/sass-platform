"""Tests for atomic guest admission and reversal operations."""

from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch
from uuid import uuid4

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
from ticketing.operations.admissions import (
    AdmissionConflictError,
    AdmissionResult,
    AdmissionValidationError,
    _normalise_offline_event_id,
    admit_guests,
    resolve_and_admit,
    reverse_admission,
)
from ticketing.operations.tokens import TokenResolution


class AdmissionServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Admission Service A",
            slug="admission-service-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Admission Service B",
            slug="admission-service-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Admission Partner A",
            slug="admission-partner-a",
            can_scan_tickets=True,
            is_active=True,
        )
        cls.entity_a_other = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Admission Partner A Other",
            slug="admission-partner-a-other",
            can_scan_tickets=True,
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Admission Partner B",
            slug="admission-partner-b",
            can_scan_tickets=True,
            is_active=True,
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
        organisation = organisation or self.organisation_a
        values = {
            "organisation": organisation,
            "customer_name": "Admission Customer",
            "status": "confirmed",
            "service_date": date(2026, 8, 20),
            "service_time": time(10, 0),
            "adults": 3,
            "total_guests": 3,
            "total_amount": Decimal("150.00"),
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
            "product_type": product.product_type,
            "service_date": booking.service_date,
            "service_time": booking.service_time,
            "quantity": 3,
            "unit_price": Decimal("50.00"),
            "unit_cost": Decimal("30.00"),
            "total": Decimal("150.00"),
        }
        values.update(overrides)
        return BookingItem.objects.create(**values)

    def make_token(self, item=None, **overrides):
        item = item or self.make_item()
        entity = (
            self.entity_a
            if item.booking.organisation_id == self.organisation_a.id
            else self.entity_b
        )
        values = {
            "organisation": item.booking.organisation,
            "booking": item.booking,
            "booking_item": item,
            "business_entity": entity,
            "total_admissions": item.quantity,
            "status": "active",
        }
        values.update(overrides)
        return AdmissionToken.objects.create(**values)

    def make_attempt(self, token=None, **overrides):
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
        }
        values.update(overrides)
        return TicketScanAttempt.objects.create(**values)

    def test_offline_event_normalisation_accepts_blank_uuid_and_string(self):
        value = uuid4()

        self.assertIsNone(_normalise_offline_event_id(None))
        self.assertIsNone(_normalise_offline_event_id(""))
        self.assertEqual(_normalise_offline_event_id(value), value)
        self.assertEqual(_normalise_offline_event_id(str(value)), value)

    def test_offline_event_normalisation_rejects_malformed_values(self):
        for value in ("not-a-uuid", object()):
            with self.subTest(value=value):
                with self.assertRaisesMessage(
                    AdmissionValidationError, "Offline event ID is invalid."
                ):
                    _normalise_offline_event_id(value)

    def test_admission_result_as_dict_contains_safe_operational_details(self):
        token = self.make_token(admitted_quantity=1)
        result = AdmissionResult(
            ok=True,
            message="Admitted.",
            token=token,
            admitted_quantity=1,
            remaining_admissions=2,
        )

        data = result.as_dict()

        self.assertEqual(data["token"], str(token.token))
        self.assertEqual(data["booking_code"], token.booking.booking_code)
        self.assertEqual(data["business_entity_id"], self.entity_a.id)
        self.assertEqual(data["admitted_quantity"], 1)
        self.assertEqual(data["remaining_admissions"], 2)

    def test_admit_guests_creates_linked_audit_records_and_metadata(self):
        token = self.make_token()
        event_id = uuid4()

        result = admit_guests(
            token.token,
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            requested_quantity=2,
            scanner_device_id="door-tablet-1",
            scanner_name="Main Door",
            location_name="Lobby",
            notes="Family arrived together.",
            offline_event_id=event_id,
            metadata={"source": "offline-sync"},
        )

        token.refresh_from_db()
        admission = result.admission
        attempt = result.scan_attempt
        self.assertTrue(result.ok)
        self.assertEqual(result.remaining_admissions, 1)
        self.assertEqual(token.admitted_quantity, 2)
        self.assertEqual(token.status, "active")
        self.assertEqual(admission.organisation, self.organisation_a)
        self.assertEqual(admission.business_entity, self.entity_a)
        self.assertEqual(admission.quantity_admitted, 2)
        self.assertEqual(admission.scanner_device_id, "door-tablet-1")
        self.assertEqual(admission.location_name, "Lobby")
        self.assertEqual(admission.metadata["scanner_name"], "Main Door")
        self.assertEqual(admission.metadata["offline_event_id"], str(event_id))
        self.assertEqual(admission.metadata["source"], "offline-sync")
        self.assertEqual(attempt.result, "admitted")
        self.assertEqual(attempt.admitted_quantity, 2)
        self.assertEqual(attempt.admission, admission)

    def test_full_admission_consumes_token(self):
        token = self.make_token(total_admissions=2)

        result = admit_guests(
            token.token,
            organisation=self.organisation_a,
            requested_quantity=2,
        )

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 2)
        self.assertEqual(token.status, "consumed")
        self.assertEqual(result.remaining_admissions, 0)

    def test_admit_rejects_explicit_zero_and_negative_quantities(self):
        for quantity in (0, -1):
            with self.subTest(quantity=quantity):
                token = self.make_token()
                with self.assertRaisesMessage(
                    AdmissionValidationError,
                    "Admission quantity must be at least one.",
                ):
                    admit_guests(
                        token.token,
                        organisation=self.organisation_a,
                        requested_quantity=quantity,
                    )
                token.refresh_from_db()
                self.assertEqual(token.admitted_quantity, 0)
                self.assertFalse(token.admissions.exists())

    def test_admit_rejects_quantity_above_remaining_and_records_failure(self):
        token = self.make_token(total_admissions=3, admitted_quantity=2)

        with self.assertRaisesMessage(
            AdmissionConflictError, "Only 1 admission(s) remain."
        ):
            admit_guests(
                token.token,
                organisation=self.organisation_a,
                requested_quantity=2,
            )

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 2)
        attempt = token.scan_attempts.get()
        self.assertEqual(attempt.result, "already_used")
        self.assertEqual(attempt.failure_reason, "Only 1 admission(s) remain.")

    def test_consumed_token_rejects_reuse_without_new_admission(self):
        token = self.make_token(
            total_admissions=1, admitted_quantity=1, status="consumed"
        )

        with self.assertRaisesMessage(
            AdmissionConflictError, "This ticket has already been fully used."
        ):
            admit_guests(token.token, organisation=self.organisation_a)

        self.assertFalse(token.admissions.exists())
        self.assertEqual(token.scan_attempts.get().result, "already_used")

    def test_admit_is_tenant_scoped_and_does_not_leak_foreign_token(self):
        token = self.make_token()

        with self.assertRaisesMessage(AdmissionValidationError, "Ticket not found."):
            admit_guests(token.token, organisation=self.organisation_b)

        self.assertFalse(token.admissions.exists())
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_admit_rejects_wrong_cross_tenant_inactive_and_disabled_entities(self):
        token = self.make_token()
        cases = (
            (self.entity_a_other, "This ticket belongs to another business entity."),
            (
                self.entity_b,
                "The scanner business entity belongs to another organisation.",
            ),
        )
        for entity, message in cases:
            with self.subTest(entity=entity.slug):
                with self.assertRaisesMessage(AdmissionValidationError, message):
                    admit_guests(
                        token.token,
                        organisation=self.organisation_a,
                        business_entity=entity,
                    )

        self.entity_a.is_active = False
        self.entity_a.save(update_fields=["is_active"])
        with self.assertRaisesMessage(
            AdmissionValidationError, "The scanner business entity is inactive."
        ):
            admit_guests(
                token.token,
                organisation=self.organisation_a,
                business_entity=self.entity_a,
            )

        self.entity_a.is_active = True
        self.entity_a.can_scan_tickets = False
        self.entity_a.save(update_fields=["is_active", "can_scan_tickets"])
        with self.assertRaisesMessage(
            AdmissionValidationError,
            "The scanner business entity cannot scan tickets.",
        ):
            admit_guests(
                token.token,
                organisation=self.organisation_a,
                business_entity=self.entity_a,
            )

    def test_admit_rejects_blocked_booking_statuses(self):
        cases = {
            "draft": "This booking is still a draft.",
            "pending_payment": "This booking is awaiting payment.",
            "pending_approval": "This booking is awaiting approval.",
            "cancelled": "This booking was cancelled.",
            "refunded": "This booking was refunded.",
            "no_show": "This booking is marked as a no-show.",
        }
        for status, message in cases.items():
            with self.subTest(status=status):
                booking = self.make_booking(status=status)
                token = self.make_token(item=self.make_item(booking=booking))
                with self.assertRaisesMessage(AdmissionValidationError, message):
                    admit_guests(token.token, organisation=self.organisation_a)

    def test_admit_rejects_revoked_expired_and_not_yet_valid_tokens(self):
        now = timezone.now()
        cases = (
            ({"status": "revoked"}, "This ticket was revoked."),
            ({"status": "expired"}, "This ticket has expired."),
            (
                {"valid_from": now + timedelta(hours=1)},
                "This ticket is not valid yet.",
            ),
        )
        for values, message in cases:
            with self.subTest(values=values):
                token = self.make_token(**values)
                with self.assertRaisesMessage(AdmissionValidationError, message):
                    admit_guests(token.token, organisation=self.organisation_a)

    def test_past_valid_until_marks_token_expired(self):
        token = self.make_token(valid_until=timezone.now() - timedelta(seconds=1))

        with self.assertRaisesMessage(AdmissionValidationError, "This ticket has expired."):
            admit_guests(token.token, organisation=self.organisation_a)

        token.refresh_from_db()
        self.assertEqual(token.status, "expired")
        self.assertFalse(token.admissions.exists())

    def test_offline_event_replay_returns_original_admission_idempotently(self):
        token = self.make_token()
        event_id = uuid4()
        first = admit_guests(
            token.token,
            organisation=self.organisation_a,
            requested_quantity=1,
            offline_event_id=event_id,
        )

        replay = admit_guests(
            token.token,
            organisation=self.organisation_a,
            requested_quantity=1,
            offline_event_id=event_id,
        )

        token.refresh_from_db()
        self.assertTrue(replay.already_processed)
        self.assertEqual(replay.admission, first.admission)
        self.assertEqual(replay.scan_attempt, first.scan_attempt)
        self.assertEqual(token.admitted_quantity, 1)
        self.assertEqual(TicketAdmission.objects.count(), 1)

    def test_offline_event_without_admission_cannot_be_reprocessed(self):
        token = self.make_token()
        event_id = uuid4()
        self.make_attempt(token=token, offline_event_id=event_id)

        with self.assertRaisesMessage(
            AdmissionConflictError, "This offline scan event was already processed."
        ):
            admit_guests(
                token.token,
                organisation=self.organisation_a,
                offline_event_id=event_id,
            )

        self.assertFalse(token.admissions.exists())

    def test_provided_scan_attempt_must_belong_to_token(self):
        token = self.make_token()
        other_token = self.make_token()
        attempt = self.make_attempt(token=other_token)

        with self.assertRaisesMessage(
            AdmissionValidationError,
            "The scan attempt does not belong to this admission token.",
        ):
            admit_guests(
                token.token,
                organisation=self.organisation_a,
                scan_attempt=attempt,
            )

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 0)
        self.assertFalse(token.admissions.exists())

    def test_provided_attempt_with_admission_returns_existing_result(self):
        token = self.make_token()
        first = admit_guests(token.token, organisation=self.organisation_a)

        replay = admit_guests(
            token.token,
            organisation=self.organisation_a,
            scan_attempt=first.scan_attempt,
        )

        token.refresh_from_db()
        self.assertTrue(replay.already_processed)
        self.assertEqual(replay.admission, first.admission)
        self.assertEqual(token.admitted_quantity, 1)
        self.assertEqual(TicketAdmission.objects.count(), 1)

    @patch("ticketing.operations.admissions._post_admission_ledger_or_event")
    def test_admission_rolls_back_if_post_admission_boundary_fails(self, post_event):
        post_event.side_effect = RuntimeError("ledger unavailable")
        token = self.make_token()

        with self.assertRaisesMessage(RuntimeError, "ledger unavailable"):
            admit_guests(token.token, organisation=self.organisation_a)

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 0)
        self.assertEqual(token.status, "active")
        self.assertFalse(TicketAdmission.objects.exists())
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_resolve_and_admit_rejects_unsuccessful_resolution(self):
        token = self.make_token()
        resolution = TokenResolution(
            ok=False,
            result="wrong_date",
            message="Ticket is for another date.",
            token=token,
            remaining_admissions=3,
            requested_quantity=1,
        )

        with patch(
            "ticketing.operations.admissions.resolve_admission_token",
            return_value=resolution,
        ):
            with self.assertRaisesMessage(
                AdmissionValidationError, "Ticket is for another date."
            ):
                resolve_and_admit(token.token, organisation=self.organisation_a)

        self.assertFalse(token.admissions.exists())

    def test_resolve_and_admit_reuses_resolution_scan_attempt(self):
        token = self.make_token()
        attempt = self.make_attempt(token=token)
        resolution = TokenResolution(
            ok=True,
            result="valid",
            message="Valid ticket.",
            token=token,
            scan_attempt=attempt,
            remaining_admissions=3,
            requested_quantity=1,
            service_date=token.booking_item.service_date,
        )

        with patch(
            "ticketing.operations.admissions.resolve_admission_token",
            return_value=resolution,
        ) as resolve:
            result = resolve_and_admit(
                token.token,
                organisation=self.organisation_a,
                business_entity=self.entity_a,
                requested_quantity=1,
                scanner_device_id="device-7",
                scanner_name="Scanner Seven",
                location_name="Gate Seven",
                notes="Resolved first.",
            )

        self.assertEqual(result.scan_attempt, attempt)
        self.assertEqual(result.admission.scan_attempt, attempt)
        resolve.assert_called_once()
        self.assertTrue(resolve.call_args.kwargs["record_attempt"])

    def test_reverse_requires_nonblank_reason_without_mutation(self):
        token = self.make_token(total_admissions=1)
        admission = admit_guests(
            token.token, organisation=self.organisation_a
        ).admission

        for reason in ("", "   ", None):
            with self.subTest(reason=reason):
                with self.assertRaisesMessage(
                    AdmissionValidationError, "A reversal reason is required."
                ):
                    reverse_admission(admission, reason=reason)

        admission.refresh_from_db()
        token.refresh_from_db()
        self.assertEqual(admission.status, "admitted")
        self.assertEqual(token.status, "consumed")
        self.assertEqual(token.admitted_quantity, 1)

    def test_reverse_restores_capacity_and_updates_scan_audit(self):
        token = self.make_token(total_admissions=2)
        result = admit_guests(
            token.token,
            organisation=self.organisation_a,
            requested_quantity=2,
        )

        reversed_record = reverse_admission(
            result.admission, reason="Operator corrected duplicate entry."
        )

        token.refresh_from_db()
        result.scan_attempt.refresh_from_db()
        self.assertEqual(reversed_record.status, "reversed")
        self.assertIsNotNone(reversed_record.reversed_at)
        self.assertEqual(
            reversed_record.reversal_reason,
            "Operator corrected duplicate entry.",
        )
        self.assertEqual(token.admitted_quantity, 0)
        self.assertEqual(token.status, "active")
        self.assertTrue(result.scan_attempt.metadata["admission_reversed"])
        self.assertEqual(
            result.scan_attempt.metadata["reversal_reason"],
            "Operator corrected duplicate entry.",
        )

    def test_reverse_is_idempotent_and_does_not_restore_twice(self):
        token = self.make_token(total_admissions=3)
        admission = admit_guests(
            token.token,
            organisation=self.organisation_a,
            requested_quantity=2,
        ).admission

        first = reverse_admission(admission, reason="First reversal.")
        first_reversed_at = first.reversed_at
        second = reverse_admission(admission, reason="Second reversal.")

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 0)
        self.assertEqual(second.reversal_reason, "First reversal.")
        self.assertEqual(second.reversed_at, first_reversed_at)

    def test_reverse_preserves_revoked_or_expired_token_status(self):
        for final_status in ("revoked", "expired"):
            with self.subTest(final_status=final_status):
                token = self.make_token(total_admissions=1)
                admission = admit_guests(
                    token.token, organisation=self.organisation_a
                ).admission
                token.status = final_status
                fields = ["status"]
                if final_status == "expired":
                    token.valid_until = timezone.now() - timedelta(seconds=1)
                    fields.append("valid_until")
                token.save(update_fields=fields)

                reverse_admission(admission, reason="Status preservation test.")

                token.refresh_from_db()
                self.assertEqual(token.status, final_status)
                self.assertEqual(token.admitted_quantity, 0)

    @patch("ticketing.operations.admissions._post_admission_reversal_ledger_or_event")
    def test_reversal_rolls_back_if_post_reversal_boundary_fails(self, post_event):
        token = self.make_token(total_admissions=1)
        admission = admit_guests(
            token.token, organisation=self.organisation_a
        ).admission
        post_event.side_effect = RuntimeError("reversal ledger unavailable")

        with self.assertRaisesMessage(RuntimeError, "reversal ledger unavailable"):
            reverse_admission(admission, reason="Rollback test.")

        token.refresh_from_db()
        admission.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 1)
        self.assertEqual(token.status, "consumed")
        self.assertEqual(admission.status, "admitted")
        self.assertIsNone(admission.reversed_at)

