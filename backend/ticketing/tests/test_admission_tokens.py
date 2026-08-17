"""Service tests for secure admission-token lifecycle and QR resolution."""

from datetime import date, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.models import (
    AdmissionToken,
    Booking,
    BookingItem,
    ExperienceProduct,
    ProductBusinessAgreement,
    TicketScanAttempt,
    TicketingBusinessEntity,
)
from ticketing.operations.tokens import (
    AdmissionTokenValidationError,
    TokenResolution,
    _record_scan_attempt,
    build_qr_payload,
    default_total_admissions,
    default_validity_window,
    extract_token_uuid,
    get_active_agreement,
    get_client_ip,
    get_or_create_primary_token,
    issue_admission_token,
    refresh_token_status,
    resolve_admission_token,
    resolve_business_entity_for_item,
    revoke_admission_token,
    rotate_admission_token,
)


class AdmissionTokenServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Token Organisation A",
            slug="token-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Token Organisation B",
            slug="token-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Token Partner A",
            slug="token-partner-a",
            can_scan_tickets=True,
            is_active=True,
        )
        cls.entity_a_second = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Token Partner A Second",
            slug="token-partner-a-second",
            can_scan_tickets=True,
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Token Partner B",
            slug="token-partner-b",
            can_scan_tickets=True,
            is_active=True,
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Token Product A",
            slug="token-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Token Product B",
            slug="token-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            status="active",
        )

    def make_booking(self, organisation=None, **overrides):
        values = {
            "organisation": organisation or self.organisation_a,
            "customer_name": "Token Customer",
            "status": "confirmed",
            "service_date": date(2026, 8, 20),
            "service_time": time(10, 0),
            "total_guests": 2,
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
            "product_type": product.product_type,
            "service_date": booking.service_date,
            "service_time": booking.service_time,
            "quantity": 2,
            "unit_price": Decimal("50.00"),
            "unit_cost": Decimal("30.00"),
            "total": Decimal("100.00"),
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

    def test_extract_accepts_uuid_token_instance_plain_string_and_urls(self):
        token = self.make_token()
        value = token.token
        cases = (
            value,
            token,
            str(value),
            f"https://example.com/ticket/verify/{value}",
            f"https://example.com/check-in?token={value}",
            f"https://example.com/check-in?admission_token={value}",
            f"pcd://ticket/{value}",
        )

        for raw in cases:
            with self.subTest(raw=raw):
                self.assertEqual(extract_token_uuid(raw), value)

    def test_extract_decodes_url_encoded_token(self):
        value = uuid4()

        self.assertEqual(
            extract_token_uuid(f"https%3A//example.com/ticket/{value}"), value
        )

    def test_extract_rejects_blank_and_malformed_values(self):
        for raw, message in (
            ("", "A QR token is required."),
            (None, "A QR token is required."),
            ("not-a-ticket", "The scanned QR code is not valid."),
        ):
            with self.subTest(raw=raw):
                with self.assertRaisesMessage(AdmissionTokenValidationError, message):
                    extract_token_uuid(raw)

    def test_resolution_as_dict_contains_safe_related_details(self):
        token = self.make_token(admitted_quantity=1)
        attempt = TicketScanAttempt.objects.create(
            organisation=self.organisation_a,
            result="valid",
        )
        resolution = TokenResolution(
            ok=True,
            result="partially_used",
            message="Valid.",
            token=token,
            scan_attempt=attempt,
            remaining_admissions=1,
            requested_quantity=1,
            service_date=token.booking_item.service_date,
        )

        data = resolution.as_dict()

        self.assertEqual(data["token"], str(token.token))
        self.assertEqual(data["booking_code"], token.booking.booking_code)
        self.assertEqual(data["business_entity_id"], self.entity_a.id)
        self.assertEqual(data["remaining_admissions"], 1)
        self.assertEqual(data["scan_attempt_id"], attempt.id)

    def test_active_agreement_uses_latest_effective_version(self):
        item = self.make_item()
        ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            version=1,
            effective_from=date(2026, 1, 1),
        )
        latest = ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            version=2,
            effective_from=date(2026, 7, 1),
        )

        self.assertEqual(get_active_agreement(item), latest)

    def test_active_agreement_filters_entity_dates_and_inactive_rows(self):
        item = self.make_item()
        valid = ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            version=1,
            effective_from=date(2026, 1, 1),
            effective_until=date(2026, 12, 31),
        )
        ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a_second,
            product=self.product_a,
            version=1,
            effective_from=date(2026, 1, 1),
            is_active=False,
        )

        self.assertEqual(get_active_agreement(item, self.entity_a), valid)
        self.assertIsNone(get_active_agreement(item, self.entity_a_second))

    def test_active_agreement_returns_none_without_product(self):
        item = self.make_item(product=None)

        self.assertIsNone(get_active_agreement(item))

    def test_resolve_entity_accepts_same_tenant_and_rejects_cross_tenant(self):
        item = self.make_item()

        self.assertEqual(resolve_business_entity_for_item(item, self.entity_a), self.entity_a)
        with self.assertRaisesMessage(
            AdmissionTokenValidationError,
            "The business entity does not belong to this organisation.",
        ):
            resolve_business_entity_for_item(item, self.entity_b)

    def test_resolve_entity_uses_active_agreement(self):
        item = self.make_item()
        ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            effective_from=date(2026, 1, 1),
        )

        self.assertEqual(resolve_business_entity_for_item(item), self.entity_a)

    def test_default_total_uses_item_quantity_then_booking_guests(self):
        item = self.make_item(quantity=3)
        self.assertEqual(default_total_admissions(item), 3)

        BookingItem.objects.filter(pk=item.pk).update(quantity=0)
        item.refresh_from_db()
        self.assertEqual(default_total_admissions(item), 1)

        item.booking.total_guests = 0
        self.assertEqual(default_total_admissions(item), 1)

    def test_default_validity_window_returns_none_without_service_date(self):
        booking = self.make_booking(service_date=None, service_time=None)
        item = self.make_item(booking=booking, service_date=None, service_time=None)

        self.assertEqual(default_validity_window(item), (None, None))

    def test_default_validity_window_wraps_timed_service_by_twelve_hours(self):
        item = self.make_item(service_date=date(2026, 8, 20), service_time=time(10, 0))

        start, end = default_validity_window(item)

        self.assertEqual(end - start, timedelta(hours=24))
        self.assertEqual(timezone.localtime(start).hour, 22)
        self.assertEqual(timezone.localtime(end).hour, 22)

    def test_default_validity_window_covers_date_only_service_and_grace(self):
        booking = self.make_booking(service_time=None)
        item = self.make_item(booking=booking, service_time=None)

        start, end = default_validity_window(item, day_start_hour=1, grace_hours_after=6)

        self.assertEqual(timezone.localtime(start).hour, 1)
        self.assertEqual(end - start, timedelta(hours=30))

    def test_issue_creates_scoped_token_with_defaults_and_metadata(self):
        item = self.make_item()

        token = issue_admission_token(
            item,
            business_entity=self.entity_a,
            metadata={"channel": "owner"},
        )

        self.assertEqual(token.organisation, self.organisation_a)
        self.assertEqual(token.booking, item.booking)
        self.assertEqual(token.booking_item, item)
        self.assertEqual(token.business_entity, self.entity_a)
        self.assertEqual(token.total_admissions, 2)
        self.assertIsNotNone(token.valid_from)
        self.assertIsNotNone(token.valid_until)
        self.assertEqual(token.metadata["booking_item_id"], item.id)
        self.assertEqual(token.metadata["channel"], "owner")

    def test_issue_reuses_existing_active_primary_token(self):
        item = self.make_item()
        existing = issue_admission_token(item, business_entity=self.entity_a)

        returned = issue_admission_token(item, business_entity=self.entity_a)

        self.assertEqual(returned.pk, existing.pk)
        self.assertEqual(AdmissionToken.objects.filter(booking_item=item).count(), 1)

    def test_issue_replaces_existing_primary_when_requested(self):
        item = self.make_item()
        old = issue_admission_token(item, business_entity=self.entity_a)

        new = issue_admission_token(
            item,
            business_entity=self.entity_a,
            replace_existing_primary=True,
        )
        old.refresh_from_db()

        self.assertEqual(old.status, "revoked")
        self.assertFalse(old.is_primary)
        self.assertNotEqual(new.pk, old.pk)
        self.assertTrue(new.is_primary)

    def test_issue_rejects_inactive_or_non_scanning_entity(self):
        item = self.make_item()
        for active, can_scan, message in (
            (False, True, "The selected business entity is inactive."),
            (True, False, "The selected business entity cannot scan tickets."),
        ):
            with self.subTest(message=message):
                entity = TicketingBusinessEntity.objects.create(
                    organisation=self.organisation_a,
                    name=f"Blocked {active} {can_scan}",
                    slug=f"blocked-{active}-{can_scan}",
                    is_active=active,
                    can_scan_tickets=can_scan,
                )
                with self.assertRaisesMessage(AdmissionTokenValidationError, message):
                    issue_admission_token(item, business_entity=entity)

    def test_issue_rejects_explicit_nonpositive_total(self):
        for total in (0, -1):
            with self.subTest(total=total):
                item = self.make_item()
                with self.assertRaisesMessage(
                    AdmissionTokenValidationError,
                    "Total admissions must be at least one.",
                ):
                    issue_admission_token(item, total_admissions=total)

    def test_issue_rejects_invalid_explicit_validity_window(self):
        item = self.make_item()
        start = timezone.now()

        with self.assertRaisesMessage(
            AdmissionTokenValidationError,
            "Token valid-until must be later than valid-from.",
        ):
            issue_admission_token(item, valid_from=start, valid_until=start)

    def test_get_or_create_primary_reuses_then_creates_when_missing(self):
        item = self.make_item()
        created = get_or_create_primary_token(item, business_entity=self.entity_a)
        reused = get_or_create_primary_token(item, business_entity=self.entity_a)

        self.assertEqual(reused.pk, created.pk)

    def test_rotate_revokes_old_token_and_preserves_remaining_capacity(self):
        old = self.make_token(total_admissions=3, admitted_quantity=1, metadata={"a": 1})

        new = rotate_admission_token(old, metadata={"b": 2})
        old.refresh_from_db()

        self.assertEqual(old.status, "revoked")
        self.assertEqual(new.total_admissions, 2)
        self.assertEqual(new.metadata["a"], 1)
        self.assertEqual(new.metadata["b"], 2)
        self.assertEqual(new.metadata["rotated_from_token_id"], old.id)

    def test_revoke_is_idempotent_and_preserves_first_reason(self):
        token = self.make_token()
        first = revoke_admission_token(token, reason="First reason.")
        revoked_at = first.revoked_at
        second = revoke_admission_token(first, reason="Second reason.")

        self.assertEqual(second.status, "revoked")
        self.assertEqual(second.revoked_at, revoked_at)
        self.assertEqual(second.revocation_reason, "First reason.")

    def test_refresh_marks_consumed_before_expired(self):
        token = self.make_token(
            total_admissions=1,
            admitted_quantity=1,
            valid_until=timezone.now() - timedelta(hours=1),
        )

        token = refresh_token_status(token)

        self.assertEqual(token.status, "consumed")

    def test_refresh_marks_expired_and_preserves_nonactive_status(self):
        expired = self.make_token(valid_until=timezone.now() - timedelta(seconds=1))
        revoked = self.make_token(status="revoked")

        self.assertEqual(refresh_token_status(expired).status, "expired")
        self.assertEqual(refresh_token_status(revoked).status, "revoked")

    def test_client_ip_prefers_first_forwarded_address(self):
        request = SimpleNamespace(
            META={
                "HTTP_X_FORWARDED_FOR": "203.0.113.10, 10.0.0.1",
                "REMOTE_ADDR": "127.0.0.1",
            }
        )

        self.assertEqual(get_client_ip(request), "203.0.113.10")
        self.assertIsNone(get_client_ip(None))

    def test_record_attempt_is_idempotent_for_offline_event(self):
        offline_id = uuid4()
        first = _record_scan_attempt(
            organisation=self.organisation_a,
            result="invalid",
            scanned_value="bad",
            requested_quantity=1,
            offline_event_id=offline_id,
        )
        second = _record_scan_attempt(
            organisation=self.organisation_a,
            result="valid",
            scanned_value="different",
            requested_quantity=2,
            offline_event_id=offline_id,
        )

        self.assertEqual(second.pk, first.pk)
        self.assertEqual(TicketScanAttempt.objects.filter(offline_event_id=offline_id).count(), 1)

    def test_record_attempt_normalizes_quantity_length_and_request_metadata(self):
        request = SimpleNamespace(
            META={"REMOTE_ADDR": "192.0.2.10", "HTTP_USER_AGENT": "Scanner/1.0"}
        )

        attempt = _record_scan_attempt(
            organisation=self.organisation_a,
            result="invalid",
            scanned_value="x" * 700,
            requested_quantity=-5,
            request=request,
        )

        self.assertEqual(len(attempt.scanned_value), 600)
        self.assertEqual(attempt.requested_quantity, 0)
        self.assertEqual(str(attempt.ip_address), "192.0.2.10")
        self.assertEqual(attempt.user_agent, "Scanner/1.0")

    def test_resolve_invalid_and_unknown_values_record_failures(self):
        invalid = resolve_admission_token("bad", organisation=self.organisation_a)
        missing = resolve_admission_token(uuid4(), organisation=self.organisation_a)

        self.assertEqual((invalid.ok, invalid.result), (False, "invalid"))
        self.assertEqual((missing.ok, missing.result), (False, "not_found"))
        self.assertIsNotNone(invalid.scan_attempt)
        self.assertIsNotNone(missing.scan_attempt)

    def test_resolve_rejects_cross_tenant_and_wrong_partner(self):
        token = self.make_token()

        cross_tenant = resolve_admission_token(
            token.token, organisation=self.organisation_b, business_entity=self.entity_b
        )
        wrong_partner = resolve_admission_token(
            token.token,
            organisation=self.organisation_a,
            business_entity=self.entity_a_second,
        )

        self.assertEqual(cross_tenant.result, "unauthorised")
        self.assertEqual(wrong_partner.result, "wrong_partner")

    def test_resolve_maps_blocked_booking_statuses(self):
        expected = {
            "cancelled": "cancelled",
            "refunded": "refunded",
            "no_show": "invalid",
            "draft": "invalid",
            "pending_payment": "invalid",
            "pending_approval": "invalid",
        }
        for status, result in expected.items():
            with self.subTest(status=status):
                token = self.make_token(item=self.make_item(booking=self.make_booking(status=status)))
                resolution = resolve_admission_token(token.token, organisation=self.organisation_a)
                self.assertFalse(resolution.ok)
                self.assertEqual(resolution.result, result)

    def test_resolve_rejects_revoked_expired_consumed_and_wrong_date(self):
        now = timezone.now()
        cases = (
            ({"status": "revoked"}, "revoked"),
            ({"status": "expired"}, "expired"),
            ({"status": "consumed"}, "already_used"),
            ({"total_admissions": 1, "admitted_quantity": 1}, "already_used"),
            ({"valid_from": now + timedelta(hours=1)}, "wrong_date"),
            ({"valid_until": now - timedelta(seconds=1)}, "expired"),
        )
        for values, expected in cases:
            with self.subTest(expected=expected):
                token = self.make_token(**values)
                resolution = resolve_admission_token(token.token, organisation=self.organisation_a)
                self.assertFalse(resolution.ok)
                self.assertEqual(resolution.result, expected)

    def test_resolve_enforces_remaining_capacity(self):
        unused = self.make_token(total_admissions=2)
        partial = self.make_token(total_admissions=2, admitted_quantity=1)

        unused_result = resolve_admission_token(
            unused.token, organisation=self.organisation_a, requested_quantity=3
        )
        partial_result = resolve_admission_token(
            partial.token, organisation=self.organisation_a, requested_quantity=2
        )

        self.assertEqual(unused_result.result, "invalid")
        self.assertEqual(partial_result.result, "partially_used")
        self.assertFalse(partial_result.ok)

    def test_resolve_returns_valid_and_partially_used_successes(self):
        unused = self.make_token(total_admissions=2)
        partial = self.make_token(total_admissions=2, admitted_quantity=1)

        valid = resolve_admission_token(unused.token, organisation=self.organisation_a)
        partly_used = resolve_admission_token(partial.token, organisation=self.organisation_a)

        self.assertEqual((valid.ok, valid.result), (True, "valid"))
        self.assertEqual((partly_used.ok, partly_used.result), (True, "partially_used"))
        self.assertEqual(partly_used.remaining_admissions, 1)

    def test_resolve_rejects_nonpositive_requested_quantity(self):
        token = self.make_token()

        with self.assertRaisesMessage(
            AdmissionTokenValidationError,
            "Requested admission quantity must be at least one.",
        ):
            resolve_admission_token(
                token.token, organisation=self.organisation_a, requested_quantity=-1
            )

    def test_resolve_can_skip_scan_attempt_recording(self):
        token = self.make_token()

        resolution = resolve_admission_token(
            token.token,
            organisation=self.organisation_a,
            record_attempt=False,
        )

        self.assertTrue(resolution.ok)
        self.assertIsNone(resolution.scan_attempt)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_build_qr_payload_uses_uuid_or_normalized_base_url(self):
        token = self.make_token()

        self.assertEqual(build_qr_payload(token), str(token.token))
        self.assertEqual(
            build_qr_payload(token, base_url="https://example.com/verify/"),
            f"https://example.com/verify/{token.token}",
        )