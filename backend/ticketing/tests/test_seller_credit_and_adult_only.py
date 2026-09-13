"""Regression tests for seller-credit tickets and adult-only event bookings.

Run from the backend directory with:
    python manage.py test ticketing.tests.test_seller_credit_and_adult_only -v 2
"""

from datetime import timedelta
from decimal import Decimal
from unittest.mock import patch

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
    ExperienceProduct,
    TicketScanAttempt,
    TicketingBusinessEntity,
)
from ticketing.operations.admissions import AdmissionValidationError, admit_guests


class SellerCreditAndAdultOnlyTests(APITestCase):
    password = "Strong-test-password-123"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Seller Credit Regression Organisation",
            slug="seller-credit-regression",
            business_type="ticketing",
            is_active=True,
        )

        cls.owner = get_user_model().objects.create_user(
            username="seller-credit-owner",
            email="seller-credit-owner@example.test",
            password=cls.password,
            organisation=cls.organisation,
        )

        Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )

        cls.event_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Adults Only Event",
            slug="adults-only-event",
            product_type="event",
            adult_price=Decimal("100.00"),
            status="active",
        )

        cls.nightlife_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Adults Only Nightlife",
            slug="adults-only-nightlife",
            product_type="nightlife",
            adult_price=Decimal("100.00"),
            status="active",
        )

        cls.excursion_product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Family Excursion",
            slug="family-excursion",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            child_price=Decimal("50.00"),
            status="active",
        )

        cls.scanner_entity = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation,
            name="Main Entrance",
            slug="seller-credit-main-entrance",
            can_scan_tickets=True,
            is_active=True,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.owner)
        self.bookings_url = reverse("ticketing-bookings-list")

    def make_booking(self, **overrides):
        values = {
            "organisation": self.organisation,
            "primary_product": self.event_product,
            "customer_name": "Credit Ticket Customer",
            "status": "confirmed",
            "service_date": timezone.localdate() + timedelta(days=1),
            "adults": 1,
            "children": 0,
            "infants": 0,
            "total_guests": 1,
            "total_amount": Decimal("100.00"),
        }

        values.update(overrides)
        return Booking.objects.create(**values)

    def make_token(self, booking):
        item = BookingItem.objects.create(
            booking=booking,
            product=booking.primary_product,
            product_name=booking.primary_product.name,
            product_type=booking.primary_product.product_type,
            service_date=booking.service_date,
            quantity=1,
            unit_price=Decimal("100.00"),
            unit_cost=Decimal("50.00"),
            total=Decimal("100.00"),
        )

        return AdmissionToken.objects.create(
            organisation=self.organisation,
            booking=booking,
            booking_item=item,
            business_entity=self.scanner_entity,
            total_admissions=1,
            status="active",
        )

    def booking_action_url(self, booking, action):
        return reverse(
            f"ticketing-bookings-{action}",
            args=[booking.pk],
        )

    # ---------------------------------------------------------
    # CHILDREN / ADULT-ONLY EVENTS
    # ---------------------------------------------------------

    def test_event_rejects_children(self):
        response = self.client.post(
            self.bookings_url,
            {
                "primary_product": self.event_product.id,
                "customer_name": "Event Child Test",
                "service_date": str(
                    timezone.localdate() + timedelta(days=1)
                ),
                "adults": 1,
                "children": 1,
                "infants": 0,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("children", response.data)

        self.assertIn(
            "Children and infants cannot be added",
            str(response.data["children"]),
        )

    def test_nightlife_rejects_infants(self):
        response = self.client.post(
            self.bookings_url,
            {
                "primary_product": self.nightlife_product.id,
                "customer_name": "Nightlife Infant Test",
                "service_date": str(
                    timezone.localdate() + timedelta(days=1)
                ),
                "adults": 1,
                "children": 0,
                "infants": 1,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        self.assertIn("children", response.data)

    @patch(
        "ticketing.views.booking_finance."
        "recalculate_booking_payment_totals"
    )
    def test_non_event_product_still_allows_children(
        self,
        recalculate,
    ):
        recalculate.side_effect = lambda booking: booking

        response = self.client.post(
            self.bookings_url,
            {
                "primary_product": self.excursion_product.id,
                "customer_name": "Family Excursion Test",
                "service_date": str(
                    timezone.localdate() + timedelta(days=1)
                ),
                "adults": 1,
                "children": 1,
                "infants": 0,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
        )

        booking = Booking.objects.get(pk=response.data["id"])

        self.assertEqual(
            booking.children,
            1,
        )

    # ---------------------------------------------------------
    # SELLER CREDIT
    # ---------------------------------------------------------

    @patch(
        "ticketing.views.booking_finance."
        "recalculate_booking_payment_totals"
    )
    def test_mark_ticket_generated_starts_pending_collection(
        self,
        recalculate,
    ):
        recalculate.side_effect = lambda booking: booking

        booking = self.make_booking()

        response = self.client.post(
            self.booking_action_url(
                booking,
                "mark-ticket-generated",
            ),
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        booking.refresh_from_db()

        self.assertEqual(
            booking.status,
            "ticket_generated",
        )

        self.assertEqual(
            booking.seller_credit_status,
            "pending_collection",
        )

        self.assertEqual(
            booking.seller_credit_updated_by,
            self.owner,
        )

        self.assertIsNotNone(
            booking.seller_credit_updated_at,
        )

    def test_admin_can_mark_seller_credit_as_settled(self):
        booking = self.make_booking(
            status="ticket_generated",
            seller_credit_status="pending_collection",
        )

        response = self.client.post(
            self.booking_action_url(
                booking,
                "seller-credit-status",
            ),
            {
                "status": "settled",
                "note": "Lucas paid the company in cash.",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        booking.refresh_from_db()

        self.assertEqual(
            booking.seller_credit_status,
            "settled",
        )

        self.assertEqual(
            booking.seller_credit_updated_by,
            self.owner,
        )

        self.assertEqual(
            booking.seller_credit_note,
            "Lucas paid the company in cash.",
        )

    def test_admin_can_block_unpaid_seller_credit_ticket(self):
        booking = self.make_booking(
            status="ticket_generated",
            seller_credit_status="pending_collection",
        )

        response = self.client.post(
            self.booking_action_url(
                booking,
                "seller-credit-status",
            ),
            {
                "status": "blocked",
                "note": "Seller has not delivered the money.",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        booking.refresh_from_db()

        self.assertEqual(
            booking.seller_credit_status,
            "blocked",
        )

        self.assertEqual(
            booking.seller_credit_note,
            "Seller has not delivered the money.",
        )

    def test_invalid_seller_credit_status_is_rejected(self):
        booking = self.make_booking(
            status="ticket_generated",
            seller_credit_status="pending_collection",
        )

        response = self.client.post(
            self.booking_action_url(
                booking,
                "seller-credit-status",
            ),
            {
                "status": "made_up_status",
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

        booking.refresh_from_db()

        self.assertEqual(
            booking.seller_credit_status,
            "pending_collection",
        )

    def test_seller_credit_filter_returns_only_credit_tickets(self):
        credit = self.make_booking(
            customer_name="Credit Booking",
            seller_credit_status="pending_collection",
        )

        normal = self.make_booking(
            customer_name="Normal Booking",
            seller_credit_status="not_applicable",
        )

        response = self.client.get(
            self.bookings_url,
            {
                "seller_credit": "true",
            },
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
        )

        ids = {
            row["id"]
            for row in response.data
        }

        self.assertIn(
            credit.id,
            ids,
        )

        self.assertNotIn(
            normal.id,
            ids,
        )

    # ---------------------------------------------------------
    # QR / SCANNER
    # ---------------------------------------------------------

    def test_blocked_seller_credit_qr_is_rejected_at_scanner(self):
        booking = self.make_booking(
            status="ticket_generated",
            seller_credit_status="blocked",
        )

        token = self.make_token(booking)

        with self.assertRaisesMessage(
            AdmissionValidationError,
            (
                "Payment is required. This seller-issued ticket "
                "has not been paid to the company."
            ),
        ):
            admit_guests(
                token.token,
                organisation=self.organisation,
                business_entity=self.scanner_entity,
                requested_quantity=1,
            )

        token.refresh_from_db()

        self.assertEqual(
            token.admitted_quantity,
            0,
        )

        attempt = (
            TicketScanAttempt.objects
            .filter(admission_token=token)
            .latest("id")
        )

        self.assertEqual(
            attempt.result,
            "invalid",
        )

        self.assertIn(
            "Payment is required",
            attempt.failure_reason,
        )

    def test_settled_seller_credit_qr_can_be_admitted(self):
        booking = self.make_booking(
            status="ticket_generated",
            seller_credit_status="settled",
        )

        token = self.make_token(booking)

        result = admit_guests(
            token.token,
            organisation=self.organisation,
            business_entity=self.scanner_entity,
            requested_quantity=1,
        )

        token.refresh_from_db()

        self.assertTrue(result.ok)

        self.assertEqual(
            token.admitted_quantity,
            1,
        )

        self.assertEqual(
            token.status,
            "consumed",
        )