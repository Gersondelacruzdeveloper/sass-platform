"""API tests for the ticket scanner endpoints.

These tests intentionally exercise the HTTP boundary rather than duplicating the
lower-level token/admission service suite.  They verify authentication,
organisation and business-entity isolation, validation, idempotency, and safe
responses without contacting external services.
"""

from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    AdmissionToken,
    Booking,
    BookingItem,
    BusinessEntityUserAccess,
    ExperienceProduct,
    TicketAdmission,
    TicketScanAttempt,
    TicketingBusinessEntity,
)


class TicketScannerAPITests(APITestCase):
    @classmethod
    def create_user(cls, username, organisation):
        return get_user_model().objects.create_user(
            username=username,
            email=f"{username}@example.com",
            password="Strong-test-password-123",
            organisation=organisation,
        )

    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Scanner API Organisation A",
            slug="scanner-api-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Scanner API Organisation B",
            slug="scanner-api-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Scanner API Inactive Organisation",
            slug="scanner-api-inactive",
            business_type="ticketing",
            is_active=False,
        )

        cls.owner_a = cls.create_user("scanner-owner-a", cls.organisation_a)
        cls.owner_b = cls.create_user("scanner-owner-b", cls.organisation_b)
        cls.scanner_a = cls.create_user("scanner-partner-a", cls.organisation_a)
        cls.inactive_member = cls.create_user(
            "scanner-inactive-member", cls.organisation_a
        )
        cls.inactive_org_owner = cls.create_user(
            "scanner-inactive-org-owner", cls.inactive_organisation
        )

        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.organisation_a,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.owner_b,
            organisation=cls.organisation_b,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.inactive_member,
            organisation=cls.organisation_a,
            role="owner",
            is_active=False,
        )
        Membership.objects.create(
            user=cls.inactive_org_owner,
            organisation=cls.inactive_organisation,
            role="owner",
            is_active=True,
        )

        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Scanner Partner A",
            slug="scanner-partner-a",
            can_scan_tickets=True,
            allow_offline_scanning=True,
            is_active=True,
        )
        cls.entity_a_offline_disabled = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Scanner Partner Offline Disabled",
            slug="scanner-partner-offline-disabled",
            can_scan_tickets=True,
            allow_offline_scanning=False,
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Scanner Partner B",
            slug="scanner-partner-b",
            can_scan_tickets=True,
            allow_offline_scanning=True,
            is_active=True,
        )

        cls.scanner_access = BusinessEntityUserAccess.objects.create(
            organisation=cls.organisation_a,
            business_entity=cls.entity_a,
            user=cls.scanner_a,
            role="scanner",
            can_scan=True,
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Scanner Product A",
            slug="scanner-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Scanner Product B",
            slug="scanner-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            status="active",
        )

    def setUp(self):
        self.resolve_url = reverse("ticketing-scanner-resolve")
        self.admit_url = reverse("ticketing-scanner-admit")
        self.sync_offline_url = reverse("ticketing-scanner-sync-offline")

    def make_booking(self, organisation=None, **overrides):
        organisation = organisation or self.organisation_a
        values = {
            "organisation": organisation,
            "customer_name": "Scanner Customer",
            "status": "confirmed",
            "service_date": timezone.localdate() + timedelta(days=1),
            "adults": 2,
            "total_guests": 2,
            "total_amount": Decimal("200.00"),
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
            "quantity": 2,
            "unit_price": Decimal("100.00"),
            "unit_cost": Decimal("40.00"),
            "total": Decimal("200.00"),
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

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_scanner_action_url_names_reverse_to_expected_routes(self):
        self.assertEqual(self.resolve_url, "/api/ticketing/scanner/resolve/")
        self.assertEqual(self.admit_url, "/api/ticketing/scanner/admit/")
        self.assertEqual(
            self.sync_offline_url,
            "/api/ticketing/scanner/sync-offline/",
        )

    def test_unauthenticated_scanner_request_is_rejected(self):
        token = self.make_token()

        response = self.client.post(
            self.resolve_url,
            {"token": str(token.token), "business_entity_id": self.entity_a.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_inactive_membership_is_rejected(self):
        token = self.make_token()
        self.authenticate(self.inactive_member)

        response = self.client.post(
            self.resolve_url,
            {"token": str(token.token), "business_entity_id": self.entity_a.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_inactive_organisation_is_rejected(self):
        self.authenticate(self.inactive_org_owner)

        response = self.client.post(
            self.resolve_url,
            {"token": str(uuid4())},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_partner_scanner_can_resolve_own_tenant_token(self):
        token = self.make_token()
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.resolve_url,
            {
                "token": str(token.token),
                "business_entity_id": self.entity_a.id,
                "requested_quantity": 1,
                "scanner_device_id": "door-tablet-1",
                "metadata": {"private_marker": "must-not-be-returned"},
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["result"], "valid")
        self.assertEqual(response.data["booking_id"], token.booking_id)
        self.assertEqual(response.data["business_entity_id"], self.entity_a.id)
        self.assertNotIn("metadata", response.data)
        self.assertNotIn("private_marker", str(response.data))

        attempt = TicketScanAttempt.objects.get(pk=response.data["scan_attempt_id"])
        self.assertEqual(attempt.organisation, self.organisation_a)
        self.assertEqual(attempt.business_entity, self.entity_a)
        self.assertEqual(attempt.scanned_by, self.scanner_a)
        self.assertEqual(attempt.scanner_device_id, "door-tablet-1")

    def test_malformed_token_is_rejected_before_scan_attempt_is_created(self):
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.resolve_url,
            {"token": "not-a-uuid", "business_entity_id": self.entity_a.id},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("token", response.data)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_foreign_tenant_token_is_hidden_from_scanner(self):
        foreign_token = self.make_token(
            item=self.make_item(booking=self.make_booking(self.organisation_b))
        )
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.resolve_url,
            {
                "token": str(foreign_token.token),
                "business_entity_id": self.entity_a.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["ok"])
        self.assertEqual(response.data["result"], "unauthorised")
        self.assertEqual(
            response.data["message"],
            "This ticket belongs to another organisation.",
        )
        self.assertIsNone(response.data["token_id"])
        self.assertIsNone(response.data["booking_id"])
        self.assertNotIn(foreign_token.booking.booking_code, str(response.data))

    def test_foreign_business_entity_cannot_be_selected(self):
        token = self.make_token()
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.resolve_url,
            {
                "token": str(token.token),
                "business_entity_id": self.entity_b.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(TicketScanAttempt.objects.exists())

    def test_owner_cannot_borrow_access_to_another_organisation_by_slug(self):
        foreign_token = self.make_token(
            item=self.make_item(booking=self.make_booking(self.organisation_b))
        )
        self.authenticate(self.owner_a)

        response = self.client.post(
            f"{self.resolve_url}?organisation_slug={self.organisation_b.slug}",
            {
                "token": str(foreign_token.token),
                "business_entity_id": self.entity_b.id,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admit_creates_admission_and_consumes_requested_capacity(self):
        token = self.make_token(total_admissions=2)
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.admit_url,
            {
                "token": str(token.token),
                "business_entity_id": self.entity_a.id,
                "requested_quantity": 1,
                "scanner_device_id": "door-tablet-2",
                "notes": "Guest checked in.",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["ok"])
        self.assertEqual(response.data["admitted_quantity"], 1)
        self.assertEqual(response.data["remaining_admissions"], 1)

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 1)
        admission = TicketAdmission.objects.get(admission_token=token)
        self.assertEqual(admission.organisation, self.organisation_a)
        self.assertEqual(admission.business_entity, self.entity_a)
        self.assertEqual(admission.admitted_by, self.scanner_a)

    def test_admit_rejects_quantity_above_remaining_without_partial_write(self):
        token = self.make_token(total_admissions=1)
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.admit_url,
            {
                "token": str(token.token),
                "business_entity_id": self.entity_a.id,
                "requested_quantity": 2,
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(TicketAdmission.objects.exists())
        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 0)

    def test_duplicate_offline_event_admission_is_idempotent(self):
        token = self.make_token(total_admissions=2)
        event_id = uuid4()
        self.authenticate(self.scanner_a)
        payload = {
            "token": str(token.token),
            "business_entity_id": self.entity_a.id,
            "requested_quantity": 1,
            "offline_event_id": str(event_id),
        }

        first = self.client.post(self.admit_url, payload, format="json")
        second = self.client.post(self.admit_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertTrue(first.data["ok"])
        self.assertTrue(second.data["ok"])
        self.assertEqual(first.data["admission_id"], second.data["admission_id"])
        self.assertEqual(TicketAdmission.objects.count(), 1)

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 1)

    def test_offline_sync_requires_events_list(self):
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.sync_offline_url,
            {"business_entity_id": self.entity_a.id, "events": "not-a-list"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("events", response.data)

    def test_offline_sync_rejects_entity_with_offline_scanning_disabled(self):
        BusinessEntityUserAccess.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a_offline_disabled,
            user=self.scanner_a,
            role="scanner",
            can_scan=True,
            is_active=True,
        )
        self.authenticate(self.scanner_a)

        response = self.client.post(
            self.sync_offline_url,
            {
                "business_entity_id": self.entity_a_offline_disabled.id,
                "events": [],
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_offline_sync_replay_is_idempotent(self):
        token = self.make_token(total_admissions=2)
        event_id = uuid4()
        self.authenticate(self.scanner_a)
        payload = {
            "business_entity_id": self.entity_a.id,
            "events": [
                {
                    "token": str(token.token),
                    "requested_quantity": 1,
                    "offline_event_id": str(event_id),
                    "scanner_device_id": "offline-device-1",
                }
            ],
        }

        first = self.client.post(self.sync_offline_url, payload, format="json")
        second = self.client.post(self.sync_offline_url, payload, format="json")

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.data["successful"], 1)
        self.assertEqual(second.data["successful"], 1)
        self.assertEqual(
            first.data["results"][0]["admission_id"],
            second.data["results"][0]["admission_id"],
        )
        self.assertEqual(TicketAdmission.objects.count(), 1)

        token.refresh_from_db()
        self.assertEqual(token.admitted_quantity, 1)
