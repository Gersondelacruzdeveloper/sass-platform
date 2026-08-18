"""Private booking API contract, tenant-isolation, and lifecycle tests."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import Booking, Customer, ExperienceProduct, Seller


class BookingAPITests(APITestCase):
    password = "Strong-test-password-123"

    @classmethod
    def create_user(cls, username, organisation):
        return get_user_model().objects.create_user(
            username=username,
            email=f"{username}@example.test",
            password=cls.password,
            organisation=organisation,
        )

    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Booking API Organisation A",
            slug="booking-api-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Booking API Organisation B",
            slug="booking-api-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_organisation = Organisation.objects.create(
            name="Inactive Booking API Organisation",
            slug="booking-api-inactive-org",
            business_type="ticketing",
            is_active=False,
        )

        cls.owner_a = cls.create_user("booking-api-owner-a", cls.organisation_a)
        cls.owner_b = cls.create_user("booking-api-owner-b", cls.organisation_b)
        cls.inactive_member = cls.create_user(
            "booking-api-inactive-member", cls.organisation_a
        )
        cls.inactive_owner = cls.create_user(
            "booking-api-inactive-owner", cls.inactive_organisation
        )
        cls.seller_user = cls.create_user(
            "booking-api-seller", cls.organisation_a
        )
        cls.blocked_seller_user = cls.create_user(
            "booking-api-blocked-seller", cls.organisation_a
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
            user=cls.inactive_owner,
            organisation=cls.inactive_organisation,
            role="owner",
            is_active=True,
        )

        cls.seller_a = Seller.objects.create(
            organisation=cls.organisation_a,
            user=cls.seller_user,
            full_name="Booking Seller A",
            seller_slug="booking-api-seller-a",
            role="seller",
            application_status="approved",
            is_active=True,
            can_create_bookings=True,
            can_view_own_sales=True,
            can_cancel_bookings=False,
        )
        cls.blocked_seller = Seller.objects.create(
            organisation=cls.organisation_a,
            user=cls.blocked_seller_user,
            full_name="Blocked Booking Seller",
            seller_slug="booking-api-blocked-seller",
            role="seller",
            application_status="approved",
            is_active=True,
            can_create_bookings=False,
            can_view_own_sales=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.organisation_b,
            full_name="Booking Seller B",
            seller_slug="booking-api-seller-b",
            role="seller",
            application_status="approved",
            is_active=True,
        )

        cls.customer_a = Customer.objects.create(
            organisation=cls.organisation_a,
            full_name="Booking Customer A",
            email="booking-customer-a@example.test",
        )
        cls.customer_b = Customer.objects.create(
            organisation=cls.organisation_b,
            full_name="Booking Customer B",
            email="booking-customer-b@example.test",
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Booking Product A",
            slug="booking-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Booking Product B",
            slug="booking-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            status="active",
        )

    def setUp(self):
        # BookingSerializer currently contains verbose pricing diagnostics. They
        # are not part of the API contract and should not pollute test output.
        self.debug_patcher = patch(
            "ticketing.serializers.BookingSerializer._debug_booking_financial_state"
        )
        self.debug_patcher.start()
        self.addCleanup(self.debug_patcher.stop)

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def make_booking(self, organisation=None, **overrides):
        organisation = organisation or self.organisation_a
        defaults = {
            "organisation": organisation,
            "customer_name": "Existing API Booking",
            "service_date": date(2026, 9, 15),
            "adults": 2,
            "children": 0,
            "infants": 0,
            "total_amount": Decimal("200.00"),
            "deposit_paid": Decimal("50.00"),
            "balance_due": Decimal("150.00"),
        }
        defaults.update(overrides)
        return Booking.objects.create(**defaults)

    @property
    def list_url(self):
        return reverse("ticketing-bookings-list")

    def detail_url(self, booking):
        return reverse("ticketing-bookings-detail", args=[booking.pk])

    def action_url(self, booking, action):
        return reverse(f"ticketing-bookings-{action}", args=[booking.pk])

    def test_booking_url_names_reverse_to_expected_routes(self):
        booking = self.make_booking()

        self.assertEqual(self.list_url, "/api/ticketing/bookings/")
        self.assertEqual(
            self.detail_url(booking),
            f"/api/ticketing/bookings/{booking.pk}/",
        )
        expected_actions = {
            "confirm": "confirm",
            "approve": "approve",
            "cancel": "cancel",
            "complete": "complete",
            "mark-ticket-generated": "mark-ticket-generated",
            "add-payment": "add-payment",
            "settle": "settle",
            "override-pickup": "override-pickup",
        }
        for reverse_suffix, path_suffix in expected_actions.items():
            with self.subTest(action=reverse_suffix):
                self.assertEqual(
                    self.action_url(booking, reverse_suffix),
                    f"/api/ticketing/bookings/{booking.pk}/{path_suffix}/",
                )

    def test_booking_endpoints_require_authentication(self):
        booking = self.make_booking()

        for url in (self.list_url, self.detail_url(booking)):
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertIn(
                    response.status_code,
                    (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                )

    def test_inactive_membership_is_rejected(self):
        self.authenticate(self.inactive_member)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_organisation_is_rejected(self):
        self.authenticate(self.inactive_owner)
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_list_is_scoped_to_own_organisation(self):
        own = self.make_booking(customer_name="Own Tenant Booking")
        foreign = self.make_booking(
            organisation=self.organisation_b,
            customer_name="Foreign Tenant Booking",
        )
        self.authenticate(self.owner_a)

        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in response.data}
        self.assertIn(own.id, ids)
        self.assertNotIn(foreign.id, ids)

    def test_owner_cannot_retrieve_update_or_delete_foreign_booking(self):
        foreign = self.make_booking(organisation=self.organisation_b)
        self.authenticate(self.owner_a)

        requests = (
            ("get", {}),
            ("patch", {"customer_name": "Cross Tenant Update"}),
            ("delete", {}),
        )
        for method, payload in requests:
            with self.subTest(method=method):
                response = getattr(self.client, method)(
                    self.detail_url(foreign),
                    payload,
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

        foreign.refresh_from_db()
        self.assertNotEqual(foreign.customer_name, "Cross Tenant Update")

    def test_owner_cannot_borrow_other_tenant_by_query_slug(self):
        self.authenticate(self.owner_a)
        response = self.client.get(
            self.list_url,
            {"organisation_slug": self.organisation_b.slug},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_owner_can_create_booking_and_client_cannot_override_organisation(self):
        self.authenticate(self.owner_a)
        payload = {
            "organisation": self.organisation_b.id,
            "customer_name": "Created Through API",
            "customer_email": "created@example.test",
            "service_date": "2026-10-01",
            "adults": 2,
            "children": 1,
            "infants": 0,
        }

        response = self.client.post(self.list_url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.organisation, self.organisation_a)
        self.assertEqual(booking.created_by, self.owner_a)
        self.assertEqual(booking.customer.organisation, self.organisation_a)
        self.assertEqual(booking.customer.full_name, "Created Through API")
        self.assertEqual(booking.total_guests, 3)

    def test_create_rejects_foreign_tenant_customer(self):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.list_url,
            {
                "customer": self.customer_b.id,
                "customer_name": "Foreign Customer Attempt",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer", response.data)
        self.assertFalse(
            Booking.objects.filter(customer_name="Foreign Customer Attempt").exists()
        )

    def test_create_rejects_foreign_tenant_seller(self):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.list_url,
            {
                "seller": self.seller_b.id,
                "customer_name": "Foreign Seller Attempt",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("seller", response.data)

    def test_create_rejects_foreign_tenant_primary_product(self):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.list_url,
            {
                "primary_product": self.product_b.id,
                "customer_name": "Foreign Product Attempt",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("primary_product", response.data)

    def test_create_rejects_negative_guest_counts(self):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.list_url,
            {
                "customer_name": "Negative Guest Attempt",
                "adults": -1,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("adults", response.data)

    def test_patch_cannot_change_booking_organisation(self):
        booking = self.make_booking()
        self.authenticate(self.owner_a)

        response = self.client.patch(
            self.detail_url(booking),
            {
                "organisation": self.organisation_b.id,
                "customer_name": "Updated Name",
            },
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.organisation, self.organisation_a)
        self.assertEqual(booking.customer_name, "Updated Name")

    def test_patch_rejects_foreign_related_objects(self):
        booking = self.make_booking()
        self.authenticate(self.owner_a)

        for field, foreign_id in (
            ("customer", self.customer_b.id),
            ("seller", self.seller_b.id),
            ("primary_product", self.product_b.id),
        ):
            with self.subTest(field=field):
                response = self.client.patch(
                    self.detail_url(booking),
                    {field: foreign_id},
                    format="json",
                )
                self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
                self.assertIn(field, response.data)

    def test_owner_can_delete_own_booking(self):
        booking = self.make_booking()
        self.authenticate(self.owner_a)
        response = self.client.delete(self.detail_url(booking))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Booking.objects.filter(pk=booking.pk).exists())

    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_confirm_updates_status_and_confirmation_timestamp(self, recalculate):
        booking = self.make_booking(status="pending_payment")
        recalculate.side_effect = lambda obj: obj
        self.authenticate(self.owner_a)

        response = self.client.post(self.action_url(booking, "confirm"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")
        self.assertIsNotNone(booking.confirmed_at)
        recalculate.assert_called_once()

    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_approve_clears_supervisor_requirement_and_records_approver(self, recalculate):
        booking = self.make_booking(
            status="pending_approval",
            requires_supervisor_approval=True,
        )
        recalculate.side_effect = lambda obj: obj
        self.authenticate(self.owner_a)

        response = self.client.post(self.action_url(booking, "approve"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertFalse(booking.requires_supervisor_approval)
        self.assertEqual(booking.supervisor_approved_by, self.owner_a)
        self.assertIsNotNone(booking.supervisor_approved_at)
        self.assertEqual(booking.status, "confirmed")

    @patch("ticketing.views.booking_finance.sync_seller_commission_for_booking")
    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_cancel_sets_reason_and_timestamp(self, recalculate, sync_commission):
        booking = self.make_booking(status="confirmed")
        recalculate.side_effect = lambda obj: obj
        self.authenticate(self.owner_a)

        response = self.client.post(
            self.action_url(booking, "cancel"),
            {"reason": "Customer requested cancellation"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "cancelled")
        self.assertEqual(
            booking.cancellation_reason,
            "Customer requested cancellation",
        )
        self.assertIsNotNone(booking.cancelled_at)
        recalculate.assert_called_once()
        sync_commission.assert_called_once()

    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_complete_sets_completed_timestamp(self, recalculate):
        booking = self.make_booking(status="confirmed")
        recalculate.side_effect = lambda obj: obj
        self.authenticate(self.owner_a)

        response = self.client.post(self.action_url(booking, "complete"), {}, format="json")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "completed")
        self.assertIsNotNone(booking.completed_at)

    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_mark_ticket_generated_updates_status(self, recalculate):
        booking = self.make_booking(status="confirmed")
        recalculate.side_effect = lambda obj: obj
        self.authenticate(self.owner_a)

        response = self.client.post(
            self.action_url(booking, "mark-ticket-generated"),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "ticket_generated")

    def test_seller_create_is_forced_to_authenticated_seller_and_source(self):
        self.authenticate(self.seller_user)
        response = self.client.post(
            self.list_url,
            {
                "seller": self.seller_b.id,
                "customer_name": "Seller Created Booking",
                "adults": 1,
            },
            format="json",
        )

        # Serializer tenant validation runs before perform_create, so a seller
        # cannot smuggle a foreign seller even though perform_create overwrites
        # seller with the authenticated profile.
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("seller", response.data)

        response = self.client.post(
            self.list_url,
            {"customer_name": "Seller Created Booking", "adults": 1},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.organisation, self.organisation_a)
        self.assertEqual(booking.seller, self.seller_a)
        self.assertEqual(booking.source, "seller_dashboard")
        self.assertEqual(booking.created_by, self.seller_user)

    def test_seller_without_create_permission_is_rejected(self):
        self.authenticate(self.blocked_seller_user)
        response = self.client.post(
            self.list_url,
            {"customer_name": "Blocked Seller Booking"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Booking.objects.filter(customer_name="Blocked Seller Booking").exists()
        )

    def test_seller_without_cancel_permission_cannot_cancel_booking(self):
        booking = self.make_booking(seller=self.seller_a, status="confirmed")
        self.authenticate(self.seller_user)
        response = self.client.post(
            self.action_url(booking, "cancel"),
            {"reason": "Not permitted"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        booking.refresh_from_db()
        self.assertEqual(booking.status, "confirmed")

    def test_status_filter_does_not_escape_tenant_scope(self):
        own_confirmed = self.make_booking(status="confirmed")
        self.make_booking(status="cancelled")
        foreign_confirmed = self.make_booking(
            organisation=self.organisation_b,
            status="confirmed",
        )
        self.authenticate(self.owner_a)

        response = self.client.get(self.list_url, {"status": "confirmed"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in response.data}
        self.assertEqual(ids, {own_confirmed.id})
        self.assertNotIn(foreign_confirmed.id, ids)
