"""Seller onboarding and seller-panel permission security tests."""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import ExperienceProduct, Seller


class SellerOnboardingPanelPermissionAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Seller Panel Organisation A",
            slug="seller-panel-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Seller Panel Organisation B",
            slug="seller-panel-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Seller Panel Inactive Organisation",
            slug="seller-panel-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="seller-panel-owner-a",
            email="seller-panel-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.owner_b = User.objects.create_user(
            username="seller-panel-owner-b",
            email="seller-panel-owner-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.inactive_org_owner = User.objects.create_user(
            username="seller-panel-inactive-owner",
            email="seller-panel-inactive-owner@example.test",
            password="Strong-test-password-123",
            organisation=cls.inactive_org,
        )

        for user, org in (
            (cls.owner_a, cls.org_a),
            (cls.owner_b, cls.org_b),
            (cls.inactive_org_owner, cls.inactive_org),
        ):
            Membership.objects.create(
                user=user,
                organisation=org,
                role="owner",
                is_active=True,
            )

        cls.foreign_user = User.objects.create_user(
            username="seller-panel-foreign",
            email="seller-panel-foreign@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.foreign_seller = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.foreign_user,
            full_name="Foreign Seller",
            seller_slug="foreign-panel-seller",
            role="seller",
            application_status="approved",
            approved_by=cls.owner_b,
            approved_at=timezone.now(),
            is_active=True,
            can_access_dashboard=True,
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def seller_list_url(self):
        return reverse("ticketing-sellers-list")

    def seller_detail_url(self, seller):
        return reverse("ticketing-sellers-detail", args=[seller.pk])

    def dashboard_url(self):
        return reverse("ticketing-seller-dashboard")

    def create_payload(
        self,
        *,
        username,
        email,
        can_access_dashboard=False,
        can_manage_sellers=False,
        **extra,
    ):
        payload = {
            "full_name": "New Panel Seller",
            "seller_slug": f"{username}-slug",
            "role": "seller",
            "email": email,
            "create_login": True,
            "login_username": username,
            "login_email": email,
            "login_password": "Seller-login-password-123",
            "apply_role_defaults": False,
            "can_access_dashboard": can_access_dashboard,
            "can_manage_sellers": can_manage_sellers,
            "can_manage_products": False,
            "can_manage_settings": False,
            "can_manage_integrations": False,
            "can_view_reports": False,
            "can_create_bookings": False,
            "can_view_own_sales": True,
            "can_view_own_commissions": True,
            "is_active": True,
        }
        payload.update(extra)
        return payload

    def create_seller(
        self,
        *,
        username="new-panel-seller",
        email="new-panel-seller@example.test",
        can_access_dashboard=False,
        can_manage_sellers=False,
        **extra,
    ):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.seller_list_url(),
            self.create_payload(
                username=username,
                email=email,
                can_access_dashboard=can_access_dashboard,
                can_manage_sellers=can_manage_sellers,
                **extra,
            ),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        seller = Seller.objects.select_related("user", "organisation").get(
            pk=response.data["id"]
        )
        return response, seller

    def approve(self, seller):
        seller.application_status = "approved"
        seller.approved_by = self.owner_a
        seller.approved_at = timezone.now()
        seller.save(
            update_fields=[
                "application_status",
                "approved_by",
                "approved_at",
                "updated_at",
            ]
        )

    def assert_panel_denied(self, user, organisation_slug=None):
        self.authenticate(user)
        params = {}
        if organisation_slug:
            params["organisation_slug"] = organisation_slug
        response = self.client.get(self.dashboard_url(), params)
        self.assertIn(
            response.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
            response.data,
        )
        return response

    def test_owner_can_create_seller_with_login_inside_own_tenant(self):
        response, seller = self.create_seller()

        self.assertEqual(seller.organisation_id, self.org_a.pk)
        self.assertIsNotNone(seller.user_id)
        self.assertEqual(seller.user.organisation_id, self.org_a.pk)
        self.assertEqual(seller.user.username, "new-panel-seller")
        self.assertTrue(seller.user.check_password("Seller-login-password-123"))
        self.assertNotIn("login_password", response.data)
        self.assertNotIn("Seller-login-password-123", str(response.data))

    def test_pending_seller_cannot_enter_panel_even_if_dashboard_flag_is_true(self):
        _response, seller = self.create_seller(
            username="pending-panel-seller",
            email="pending-panel-seller@example.test",
            can_access_dashboard=True,
        )

        seller.application_status = "pending"
        seller.approved_by = None
        seller.approved_at = None
        seller.save(
            update_fields=[
                "application_status",
                "approved_by",
                "approved_at",
                "updated_at",
            ]
        )

        self.assertTrue(seller.can_access_dashboard)
        self.assertEqual(seller.application_status, "pending")
        self.assert_panel_denied(seller.user)

    def test_approved_active_seller_without_dashboard_permission_is_denied(self):
        _response, seller = self.create_seller(
            username="approved-no-panel",
            email="approved-no-panel@example.test",
            can_access_dashboard=False,
        )
        self.approve(seller)
        self.assert_panel_denied(seller.user)

    def test_owner_grants_dashboard_permission_and_seller_can_enter_panel(self):
        _response, seller = self.create_seller(
            username="grant-panel",
            email="grant-panel@example.test",
            can_access_dashboard=False,
        )
        self.approve(seller)
        self.assert_panel_denied(seller.user)

        self.authenticate(self.owner_a)
        grant = self.client.patch(
            self.seller_detail_url(seller),
            {"can_access_dashboard": True, "apply_role_defaults": False},
            format="json",
        )
        self.assertEqual(grant.status_code, status.HTTP_200_OK, grant.data)

        seller.refresh_from_db()
        self.authenticate(seller.user)
        dashboard = self.client.get(self.dashboard_url())
        self.assertEqual(dashboard.status_code, status.HTTP_200_OK, dashboard.data)
        self.assertEqual(dashboard.data["seller"]["id"], seller.pk)
        self.assertTrue(dashboard.data["permissions"]["can_access_dashboard"])

    def test_owner_can_revoke_dashboard_permission_immediately(self):
        _response, seller = self.create_seller(
            username="revoke-panel",
            email="revoke-panel@example.test",
            can_access_dashboard=True,
        )
        self.approve(seller)

        self.authenticate(seller.user)
        self.assertEqual(
            self.client.get(self.dashboard_url()).status_code,
            status.HTTP_200_OK,
        )

        self.authenticate(self.owner_a)
        revoked = self.client.patch(
            self.seller_detail_url(seller),
            {"can_access_dashboard": False, "apply_role_defaults": False},
            format="json",
        )
        self.assertEqual(revoked.status_code, status.HTTP_200_OK, revoked.data)
        self.assert_panel_denied(seller.user)

    def test_dashboard_access_does_not_grant_owner_dashboard(self):
        _response, seller = self.create_seller(
            username="seller-not-owner",
            email="seller-not-owner@example.test",
            can_access_dashboard=True,
        )
        self.approve(seller)
        self.authenticate(seller.user)

        self.assertEqual(
            self.client.get(self.dashboard_url()).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(reverse("ticketing-dashboard")).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_dashboard_access_does_not_grant_seller_management(self):
        _response, seller = self.create_seller(
            username="seller-no-management",
            email="seller-no-management@example.test",
            can_access_dashboard=True,
            can_manage_sellers=False,
        )
        self.approve(seller)
        self.authenticate(seller.user)

        self.assertEqual(
            self.client.get(self.dashboard_url()).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(self.seller_list_url()).status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_can_manage_sellers_is_independent_and_tenant_scoped(self):
        _response, seller = self.create_seller(
            username="seller-manager",
            email="seller-manager@example.test",
            can_access_dashboard=True,
            can_manage_sellers=True,
        )
        self.approve(seller)
        self.authenticate(seller.user)

        response = self.client.get(self.seller_list_url())
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)

        rows = response.data["results"] if isinstance(response.data, dict) and "results" in response.data else response.data
        ids = {row["id"] for row in rows}
        self.assertIn(seller.pk, ids)
        self.assertNotIn(self.foreign_seller.pk, ids)
        self.assertNotIn("Foreign Seller", str(response.data))

    def test_seller_cannot_self_grant_management_permission_without_permission(self):
        _response, seller = self.create_seller(
            username="self-escalation",
            email="self-escalation@example.test",
            can_access_dashboard=True,
            can_manage_sellers=False,
        )
        self.approve(seller)
        self.authenticate(seller.user)

        response = self.client.patch(
            self.seller_detail_url(seller),
            {"can_manage_sellers": True, "apply_role_defaults": False},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        seller.refresh_from_db()
        self.assertFalse(seller.can_manage_sellers)

    def test_other_tenant_owner_cannot_read_or_update_foreign_seller(self):
        _response, seller = self.create_seller(
            username="tenant-a-seller",
            email="tenant-a-seller@example.test",
        )
        self.authenticate(self.owner_b)

        detail = self.client.get(self.seller_detail_url(seller))
        update = self.client.patch(
            self.seller_detail_url(seller),
            {"can_access_dashboard": True, "apply_role_defaults": False},
            format="json",
        )

        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(update.status_code, status.HTTP_404_NOT_FOUND)

    def test_seller_cannot_borrow_foreign_tenant_for_panel_access(self):
        _response, seller = self.create_seller(
            username="tenant-borrow",
            email="tenant-borrow@example.test",
            can_access_dashboard=True,
        )
        self.approve(seller)
        denied = self.assert_panel_denied(
            seller.user,
            organisation_slug=self.org_b.slug,
        )
        self.assertNotIn("Foreign Seller", str(getattr(denied, "data", "")))

    def test_inactive_seller_cannot_enter_even_with_dashboard_permission(self):
        _response, seller = self.create_seller(
            username="inactive-panel-seller",
            email="inactive-panel-seller@example.test",
            can_access_dashboard=True,
        )
        self.approve(seller)
        seller.is_active = False
        seller.save(update_fields=["is_active", "updated_at"])
        self.assert_panel_denied(seller.user)

    def test_inactive_organisation_blocks_seller_panel(self):
        User = get_user_model()
        user = User.objects.create_user(
            username="inactive-org-panel-seller",
            email="inactive-org-panel-seller@example.test",
            password="Strong-test-password-123",
            organisation=self.inactive_org,
        )
        Seller.objects.create(
            organisation=self.inactive_org,
            user=user,
            full_name="Inactive Organisation Panel Seller",
            seller_slug="inactive-org-panel-seller",
            role="seller",
            application_status="approved",
            approved_by=self.inactive_org_owner,
            approved_at=timezone.now(),
            is_active=True,
            can_access_dashboard=True,
        )
        self.assert_panel_denied(user)

    def test_owner_cannot_assign_cross_tenant_products_during_seller_creation(self):
        foreign_product = ExperienceProduct.objects.create(
            organisation=self.org_b,
            name="Foreign Assigned Product",
            slug="foreign-assigned-product",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
        )

        self.authenticate(self.owner_a)
        response = self.client.post(
            self.seller_list_url(),
            self.create_payload(
                username="cross-product-seller",
                email="cross-product-seller@example.test",
                assigned_products=[foreign_product.pk],
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_products", response.data)

    def test_login_creation_rejects_duplicate_email_without_creating_seller(self):
        self.authenticate(self.owner_a)
        response = self.client.post(
            self.seller_list_url(),
            self.create_payload(
                username="duplicate-login-seller",
                email=self.owner_a.email,
            ),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("login_email", response.data)
