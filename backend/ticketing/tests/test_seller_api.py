"""API security and workflow tests for ticketing seller endpoints.

These tests intentionally exercise the HTTP boundary rather than duplicating
the deeper finance/model test suites.  No live provider integrations are used.
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    BookingPayment,
    ExperienceProduct,
    Seller,
    SellerCommission,
)


class SellerAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Seller API Organisation A",
            slug="seller-api-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Seller API Organisation B",
            slug="seller-api-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Seller API Inactive Organisation",
            slug="seller-api-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()

        cls.seller_user_a = User.objects.create_user(
            username="seller-api-a",
            email="seller-api-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_user_a2 = User.objects.create_user(
            username="seller-api-a2",
            email="seller-api-a2@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_user_b = User.objects.create_user(
            username="seller-api-b",
            email="seller-api-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.pending_user = User.objects.create_user(
            username="seller-api-pending",
            email="seller-api-pending@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.inactive_seller_user = User.objects.create_user(
            username="seller-api-disabled",
            email="seller-api-disabled@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.inactive_org_user = User.objects.create_user(
            username="seller-api-inactive-org",
            email="seller-api-inactive-org@example.test",
            password="Strong-test-password-123",
            organisation=cls.inactive_org,
        )
        cls.owner_a = User.objects.create_user(
            username="seller-api-owner-a",
            email="seller-api-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )

        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.org_a,
            role="owner",
            is_active=True,
        )

        common_permissions = dict(
            application_status="approved",
            is_active=True,
            can_access_dashboard=True,
            can_sell_excursions=True,
            can_create_bookings=True,
            can_view_own_sales=True,
            can_view_own_commissions=True,
            can_cancel_bookings=True,
            can_collect_cash_payment=True,
            can_take_deposits=True,
            can_take_full_payments=True,
            can_mark_cash_collected=True,
        )

        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a,
            full_name="Seller A",
            seller_slug="seller-a",
            **common_permissions,
        )
        cls.seller_a2 = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a2,
            full_name="Seller A2",
            seller_slug="seller-a2",
            **common_permissions,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.seller_user_b,
            full_name="Seller B",
            seller_slug="seller-b",
            **common_permissions,
        )
        cls.pending_seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.pending_user,
            full_name="Pending Seller",
            seller_slug="pending-seller-api",
            application_status="pending",
            is_active=True,
            can_access_dashboard=True,
            can_sell_excursions=True,
            can_view_own_sales=True,
        )
        cls.inactive_seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.inactive_seller_user,
            full_name="Inactive Seller",
            seller_slug="inactive-seller-api",
            application_status="approved",
            is_active=False,
            can_access_dashboard=True,
            can_sell_excursions=True,
            can_view_own_sales=True,
        )
        cls.inactive_org_seller = Seller.objects.create(
            organisation=cls.inactive_org,
            user=cls.inactive_org_user,
            full_name="Inactive Organisation Seller",
            seller_slug="inactive-org-seller",
            **common_permissions,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Seller Product A",
            slug="seller-product-a",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_a_disabled = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Disabled Seller Product A",
            slug="disabled-seller-product-a",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=False,
            adult_price=Decimal("90.00"),
            base_price=Decimal("90.00"),
        )
        cls.product_a_transfer = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Transfer Seller Product A",
            slug="transfer-seller-product-a",
            product_type="transfer",
            status="active",
            is_active=True,
            seller_enabled=True,
            adult_price=Decimal("75.00"),
            base_price=Decimal("75.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Seller Product B",
            slug="seller-product-b",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.booking_a = Booking.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a,
            primary_product=cls.product_a,
            source="seller_dashboard",
            customer_name="Customer A",
            customer_email="customer-a@example.test",
            status="confirmed",
            payment_status="partially_paid",
            total_amount=Decimal("100.00"),
            deposit_paid=Decimal("20.00"),
            balance_due=Decimal("80.00"),
            seller_due_to_company=Decimal("15.00"),
            seller_commission_amount=Decimal("10.00"),
            created_by=cls.seller_user_a,
        )
        cls.booking_a2 = Booking.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a2,
            primary_product=cls.product_a,
            source="seller_dashboard",
            customer_name="Customer A2",
            status="confirmed",
            total_amount=Decimal("80.00"),
            balance_due=Decimal("80.00"),
            created_by=cls.seller_user_a2,
        )
        cls.booking_b = Booking.objects.create(
            organisation=cls.org_b,
            seller=cls.seller_b,
            primary_product=cls.product_b,
            source="seller_dashboard",
            customer_name="Customer B",
            customer_email="foreign-customer@example.test",
            status="confirmed",
            total_amount=Decimal("200.00"),
            balance_due=Decimal("200.00"),
            created_by=cls.seller_user_b,
        )

        cls.payment_a = BookingPayment.objects.create(
            booking=cls.booking_a,
            seller=cls.seller_a,
            collected_by=cls.seller_user_a,
            amount=Decimal("20.00"),
            payment_type="deposit",
            payer_type="customer",
            method="cash",
            status="confirmed",
            collected_by_party="seller",
        )
        cls.payment_a2 = BookingPayment.objects.create(
            booking=cls.booking_a2,
            seller=cls.seller_a2,
            collected_by=cls.seller_user_a2,
            amount=Decimal("10.00"),
            payment_type="deposit",
            payer_type="customer",
            method="cash",
            status="confirmed",
            collected_by_party="seller",
        )
        cls.payment_b = BookingPayment.objects.create(
            booking=cls.booking_b,
            seller=cls.seller_b,
            collected_by=cls.seller_user_b,
            amount=Decimal("25.00"),
            payment_type="deposit",
            payer_type="customer",
            method="cash",
            status="confirmed",
            collected_by_party="seller",
        )

        cls.commission_a = SellerCommission.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a,
            booking=cls.booking_a,
            amount=Decimal("10.00"),
            rate_used=Decimal("10.00"),
            status="pending",
        )
        cls.commission_a2 = SellerCommission.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a2,
            booking=cls.booking_a2,
            amount=Decimal("8.00"),
            rate_used=Decimal("10.00"),
            status="pending",
        )
        cls.commission_b = SellerCommission.objects.create(
            organisation=cls.org_b,
            seller=cls.seller_b,
            booking=cls.booking_b,
            amount=Decimal("20.00"),
            rate_used=Decimal("10.00"),
            status="pending",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    @staticmethod
    def rows(response):
        data = response.data
        if isinstance(data, dict) and "results" in data:
            return data["results"]
        return data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def test_seller_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-seller-products-list"),
            "/api/ticketing/seller/products/",
        )
        self.assertEqual(
            reverse("ticketing-seller-bookings-list"),
            "/api/ticketing/seller/bookings/",
        )
        self.assertEqual(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_a.pk]),
            f"/api/ticketing/seller/bookings/{self.booking_a.pk}/",
        )
        self.assertEqual(
            reverse("ticketing-seller-payments-list"),
            "/api/ticketing/seller/payments/",
        )
        self.assertEqual(
            reverse("ticketing-seller-commissions-list"),
            "/api/ticketing/seller/commissions/",
        )
        self.assertEqual(
            reverse("ticketing-seller-dashboard"),
            "/api/ticketing/seller/dashboard/",
        )

    def test_seller_endpoints_require_authentication(self):
        for name in (
            "ticketing-seller-products-list",
            "ticketing-seller-bookings-list",
            "ticketing-seller-payments-list",
            "ticketing-seller-commissions-list",
            "ticketing-seller-dashboard",
        ):
            response = self.client.get(reverse(name))
            self.assertIn(
                response.status_code,
                (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN),
                name,
            )

    def test_pending_and_inactive_sellers_are_rejected(self):
        for user in (self.pending_user, self.inactive_seller_user):
            self.authenticate(user)
            response = self.client.get(reverse("ticketing-seller-bookings-list"))
            self.assertIn(
                response.status_code,
                (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
            )
            self.client.force_authenticate(user=None)

    def test_inactive_organisation_is_rejected_for_seller_dashboard(self):
        self.authenticate(self.inactive_org_user)
        response = self.client.get(reverse("ticketing-seller-dashboard"))
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )

    def test_seller_cannot_borrow_access_to_foreign_organisation_by_slug(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(
            reverse("ticketing-seller-bookings-list"),
            {"organisation_slug": self.org_b.slug},
        )
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
        )
        if response.status_code == status.HTTP_200_OK:
            self.assertNotIn(self.booking_b.pk, self.ids(response))

    def test_products_are_tenant_scoped_active_enabled_and_permission_scoped(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(reverse("ticketing-seller-products-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.product_a.pk, ids)
        self.assertNotIn(self.product_b.pk, ids)
        self.assertNotIn(self.product_a_disabled.pk, ids)
        self.assertNotIn(self.product_a_transfer.pk, ids)

    def test_assigned_products_restrict_seller_catalog(self):
        self.seller_a.assigned_products.set([self.product_a])
        self.authenticate(self.seller_user_a)

        response = self.client.get(reverse("ticketing-seller-products-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response), {self.product_a.pk})

    def test_seller_booking_list_contains_only_own_sales(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(reverse("ticketing-seller-bookings-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.booking_a.pk, ids)
        self.assertNotIn(self.booking_a2.pk, ids)
        self.assertNotIn(self.booking_b.pk, ids)

    def test_seller_without_view_sales_permission_gets_no_booking_rows(self):
        self.seller_a.can_view_own_sales = False
        self.seller_a.save(update_fields=["can_view_own_sales"])
        self.authenticate(self.seller_user_a)

        response = self.client.get(reverse("ticketing-seller-bookings-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_seller_cannot_retrieve_other_seller_booking_same_tenant(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_a2.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_seller_cannot_retrieve_foreign_tenant_booking(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_b.pk])
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(
            "foreign-customer@example.test",
            str(getattr(response, "data", "")),
        )

    def test_seller_booking_update_cannot_reassign_booking_to_other_seller(self):
        self.authenticate(self.seller_user_a)
        response = self.client.patch(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_a.pk]),
            {"seller": self.seller_a2.pk},
            format="json",
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_200_OK,
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_403_FORBIDDEN,
            ),
        )
        self.booking_a.refresh_from_db()
        self.assertEqual(self.booking_a.seller_id, self.seller_a.pk)

    def test_seller_booking_update_cannot_reassign_primary_product_cross_tenant(self):
        self.authenticate(self.seller_user_a)
        response = self.client.patch(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_a.pk]),
            {"primary_product": self.product_b.pk},
            format="json",
        )

        self.assertIn(
            response.status_code,
            (status.HTTP_400_BAD_REQUEST, status.HTTP_403_FORBIDDEN),
        )
        self.booking_a.refresh_from_db()
        self.assertEqual(self.booking_a.primary_product_id, self.product_a.pk)

    def test_seller_cannot_delete_other_seller_booking(self):
        self.authenticate(self.seller_user_a)
        response = self.client.delete(
            reverse("ticketing-seller-bookings-detail", args=[self.booking_a2.pk])
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(Booking.objects.filter(pk=self.booking_a2.pk).exists())

    @patch("ticketing.views.booking_finance.recalculate_booking_payment_totals")
    def test_seller_cancel_own_booking_with_permission(self, recalculate):
        recalculate.side_effect = lambda booking: booking
        self.authenticate(self.seller_user_a)

        response = self.client.post(
            reverse("ticketing-seller-bookings-cancel", args=[self.booking_a.pk]),
            {"reason": "Customer requested cancellation"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.booking_a.refresh_from_db()
        self.assertEqual(self.booking_a.status, "cancelled")
        self.assertEqual(
            self.booking_a.cancellation_reason,
            "Customer requested cancellation",
        )
        recalculate.assert_called_once()

    def test_seller_cancel_requires_permission(self):
        self.seller_a.can_cancel_bookings = False
        self.seller_a.save(update_fields=["can_cancel_bookings"])
        self.authenticate(self.seller_user_a)

        response = self.client.post(
            reverse("ticketing-seller-bookings-cancel", args=[self.booking_a.pk]),
            {"reason": "Should not cancel"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.booking_a.refresh_from_db()
        self.assertNotEqual(self.booking_a.status, "cancelled")

    def test_seller_cancel_cannot_act_on_other_seller_or_tenant_booking(self):
        self.authenticate(self.seller_user_a)

        for booking in (self.booking_a2, self.booking_b):
            response = self.client.post(
                reverse("ticketing-seller-bookings-cancel", args=[booking.pk]),
                {"reason": "Cross-owner attempt"},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
            booking.refresh_from_db()
            self.assertNotEqual(booking.status, "cancelled")

    def test_seller_payments_are_scoped_to_own_bookings(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(reverse("ticketing-seller-payments-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.payment_a.pk, ids)
        self.assertNotIn(self.payment_a2.pk, ids)
        self.assertNotIn(self.payment_b.pk, ids)

    def test_seller_commissions_are_scoped_to_own_rows(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(reverse("ticketing-seller-commissions-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.commission_a.pk, ids)
        self.assertNotIn(self.commission_a2.pk, ids)
        self.assertNotIn(self.commission_b.pk, ids)

    def test_seller_without_commission_permission_gets_no_commission_rows(self):
        self.seller_a.can_view_own_commissions = False
        self.seller_a.save(update_fields=["can_view_own_commissions"])
        self.authenticate(self.seller_user_a)

        response = self.client.get(reverse("ticketing-seller-commissions-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    @patch("ticketing.views.booking_finance.seller_finance_summary")
    def test_dashboard_does_not_include_other_sellers_or_tenants(self, finance_summary):
        finance_summary.return_value = {}
        self.authenticate(self.seller_user_a)

        response = self.client.get(reverse("ticketing-seller-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.booking_a.booking_code, payload)
        self.assertNotIn(self.booking_a2.booking_code, payload)
        self.assertNotIn(self.booking_b.booking_code, payload)
        self.assertNotIn("foreign-customer@example.test", payload)

    def test_booking_filters_cannot_expand_scope(self):
        self.authenticate(self.seller_user_a)
        response = self.client.get(
            reverse("ticketing-seller-bookings-list"),
            {
                "search": "Customer",
                "status": "confirmed",
                "product": self.product_a.pk,
                "owed_only": "true",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertNotIn(self.booking_a2.pk, ids)
        self.assertNotIn(self.booking_b.pk, ids)
