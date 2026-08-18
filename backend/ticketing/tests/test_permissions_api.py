"""API-level permission and tenant-isolation tests for ticketing.

The lower-level permission helpers already have focused unit tests. This module
pins those permissions to real ticketing HTTP endpoints so role/tenant changes
cannot silently widen API access.
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
    BusinessEntityUserAccess,
    ExperienceCategory,
    ExperienceProduct,
    ExternalProviderConfig,
    Seller,
    TicketingBusinessEntity,
)


class TicketingPermissionAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Permission API Organisation A",
            slug="permission-api-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Permission API Organisation B",
            slug="permission-api-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="Permission API Inactive Organisation",
            slug="permission-api-inactive",
            business_type="ticketing",
            is_active=False,
        )

        User = get_user_model()

        def user(username, organisation=None, **extra):
            return User.objects.create_user(
                username=username,
                email=f"{username}@example.test",
                password="Strong-test-password-123",
                organisation=organisation,
                **extra,
            )

        cls.owner_a = user("permission-api-owner-a", cls.org_a)
        cls.manager_a = user("permission-api-manager-a", cls.org_a)
        cls.viewer_a = user("permission-api-viewer-a", cls.org_a)
        cls.inactive_member_a = user(
            "permission-api-inactive-member-a",
            cls.org_a,
        )
        cls.owner_b = user("permission-api-owner-b", cls.org_b)
        cls.inactive_owner = user(
            "permission-api-inactive-owner",
            cls.inactive_org,
        )
        cls.platform_admin = user(
            "permission-api-platform-admin",
            None,
            is_staff=True,
            is_superuser=True,
        )

        for member_user, organisation, role, active in (
            (cls.owner_a, cls.org_a, "owner", True),
            (cls.manager_a, cls.org_a, "manager", True),
            (cls.viewer_a, cls.org_a, "viewer", True),
            (cls.inactive_member_a, cls.org_a, "owner", False),
            (cls.owner_b, cls.org_b, "owner", True),
            (cls.inactive_owner, cls.inactive_org, "owner", True),
        ):
            Membership.objects.create(
                user=member_user,
                organisation=organisation,
                role=role,
                is_active=active,
            )

        cls.seller_user = user("permission-api-seller", cls.org_a)
        cls.pending_seller_user = user(
            "permission-api-pending-seller",
            cls.org_a,
        )
        cls.inactive_seller_user = user(
            "permission-api-inactive-seller",
            cls.org_a,
        )

        cls.seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user,
            full_name="Permission Seller",
            seller_slug="permission-seller",
            application_status="approved",
            is_active=True,
            can_access_dashboard=True,
            can_sell_excursions=True,
            can_manage_settings=False,
            can_manage_integrations=False,
            can_manage_products=False,
            can_manage_sellers=False,
            can_view_reports=False,
        )
        cls.pending_seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.pending_seller_user,
            full_name="Pending Permission Seller",
            seller_slug="pending-permission-seller",
            application_status="pending",
            is_active=True,
            can_access_dashboard=True,
            can_manage_settings=True,
            can_manage_integrations=True,
            can_manage_products=True,
            can_manage_sellers=True,
            can_view_reports=True,
        )
        cls.inactive_seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.inactive_seller_user,
            full_name="Inactive Permission Seller",
            seller_slug="inactive-permission-seller",
            application_status="approved",
            is_active=False,
            can_access_dashboard=True,
            can_manage_settings=True,
            can_manage_integrations=True,
            can_manage_products=True,
            can_manage_sellers=True,
            can_view_reports=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Permission Category A",
            slug="permission-category-a",
            is_active=True,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Permission Category B",
            slug="permission-category-b",
            is_active=True,
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Permission Product A",
            slug="permission-product-a",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Permission Product B",
            slug="permission-product-b",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.integration_a = ExternalProviderConfig.objects.create(
            organisation=cls.org_a,
            provider="other",
            is_enabled=True,
            api_base_url="https://provider-a.example.test",
        )
        cls.integration_b = ExternalProviderConfig.objects.create(
            organisation=cls.org_b,
            provider="other",
            is_enabled=True,
            api_base_url="https://provider-b.example.test",
        )

        cls.partner_user = user("permission-api-partner", cls.org_a)
        cls.partner_entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Permission Partner Entity A",
            slug="permission-partner-a",
            entity_type="partner",
            is_active=True,
        )
        cls.partner_access = BusinessEntityUserAccess.objects.create(
            organisation=cls.org_a,
            business_entity=cls.partner_entity_a,
            user=cls.partner_user,
            role="scanner",
            is_active=True,
            can_access_dashboard=True,
            can_view_today_bookings=True,
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

    def assert_denied(self, response):
        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
                status.HTTP_404_NOT_FOUND,
            ),
        )

    def test_permission_sensitive_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-settings-mine"),
            "/api/ticketing/settings/mine/",
        )
        self.assertEqual(
            reverse("ticketing-integrations-list"),
            "/api/ticketing/integrations/",
        )
        self.assertEqual(
            reverse("ticketing-products-list"),
            "/api/ticketing/products/",
        )
        self.assertEqual(
            reverse("ticketing-sellers-list"),
            "/api/ticketing/sellers/",
        )
        self.assertEqual(
            reverse("ticketing-dashboard"),
            "/api/ticketing/dashboard/",
        )
        self.assertEqual(
            reverse("ticketing-reports"),
            "/api/ticketing/reports/",
        )

    def test_private_permission_endpoints_require_authentication(self):
        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-products-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-dashboard"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assert_denied(self.client.get(url))

    def test_viewer_membership_does_not_grant_privileged_management_access(self):
        self.authenticate(self.viewer_a)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-dashboard"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    @patch("ticketing.views.booking_finance.seller_leaderboard", return_value=[])
    @patch(
        "ticketing.views.booking_finance.owner_finance_summary",
        return_value={},
    )
    def test_owner_can_access_privileged_management_endpoints(
        self,
        owner_finance_summary,
        seller_leaderboard,
    ):
        self.authenticate(self.owner_a)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-dashboard"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_200_OK,
                )

    @patch("ticketing.views.booking_finance.seller_leaderboard", return_value=[])
    @patch(
        "ticketing.views.booking_finance.owner_finance_summary",
        return_value={},
    )
    def test_manager_membership_has_same_admin_permission_boundary(
        self,
        owner_finance_summary,
        seller_leaderboard,
    ):
        self.authenticate(self.manager_a)

        self.assertEqual(
            self.client.get(reverse("ticketing-settings-mine")).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(reverse("ticketing-dashboard")).status_code,
            status.HTTP_200_OK,
        )
        self.assertEqual(
            self.client.get(reverse("ticketing-reports")).status_code,
            status.HTTP_200_OK,
        )

    def test_inactive_membership_is_rejected_even_when_role_is_owner(self):
        self.authenticate(self.inactive_member_a)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-dashboard"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_inactive_organisation_is_rejected_even_with_active_owner_membership(self):
        self.authenticate(self.inactive_owner)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-dashboard"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assert_denied(self.client.get(url))

    def test_owner_cannot_borrow_admin_access_to_other_tenant_by_slug(self):
        self.authenticate(self.owner_a)

        response = self.client.get(
            reverse("ticketing-settings-mine"),
            {"organisation_slug": self.org_b.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_viewer_direct_user_organisation_relationship_is_not_admin_access(self):
        self.authenticate(self.viewer_a)

        response = self.client.get(reverse("ticketing-settings-mine"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_seller_without_settings_flag_is_denied_settings(self):
        self.authenticate(self.seller_user)

        response = self.client.get(reverse("ticketing-settings-mine"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_approved_seller_with_settings_flag_can_access_settings(self):
        self.seller.can_manage_settings = True
        self.seller.save(update_fields=["can_manage_settings"])
        self.authenticate(self.seller_user)

        response = self.client.get(reverse("ticketing-settings-mine"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_pending_seller_cannot_use_management_flags(self):
        self.authenticate(self.pending_seller_user)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_inactive_seller_cannot_use_management_flags(self):
        self.authenticate(self.inactive_seller_user)

        for url in (
            reverse("ticketing-settings-mine"),
            reverse("ticketing-integrations-list"),
            reverse("ticketing-sellers-list"),
            reverse("ticketing-reports"),
        ):
            with self.subTest(url=url):
                self.assertEqual(
                    self.client.get(url).status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_seller_integration_permission_is_flag_scoped(self):
        self.authenticate(self.seller_user)
        url = reverse("ticketing-integrations-list")

        denied = self.client.get(url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.seller.can_manage_integrations = True
        self.seller.save(update_fields=["can_manage_integrations"])

        allowed = self.client.get(url)
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertIn(self.integration_a.pk, self.ids(allowed))
        self.assertNotIn(self.integration_b.pk, self.ids(allowed))

    def test_seller_manage_products_flag_controls_write_not_read(self):
        self.authenticate(self.seller_user)
        list_url = reverse("ticketing-products-list")

        # Product reads are shared private access for an approved seller.
        read_response = self.client.get(list_url)
        self.assertEqual(read_response.status_code, status.HTTP_200_OK)
        self.assertIn(self.product_a.pk, self.ids(read_response))
        self.assertNotIn(self.product_b.pk, self.ids(read_response))

        payload = {
            "name": "Seller Permission Created Product",
            "slug": "seller-permission-created-product",
            "product_type": "excursion",
            "status": "active",
            "is_active": True,
            "category_id": self.category_a.pk,
            "adult_price": "50.00",
            "base_price": "50.00",
        }

        denied = self.client.post(list_url, payload, format="json")
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.seller.can_manage_products = True
        self.seller.save(update_fields=["can_manage_products"])
        allowed = self.client.post(list_url, payload, format="json")
        self.assertIn(
            allowed.status_code,
            (status.HTTP_201_CREATED, status.HTTP_400_BAD_REQUEST),
        )
        self.assertNotEqual(allowed.status_code, status.HTTP_403_FORBIDDEN)

    def test_seller_manage_sellers_flag_controls_seller_management(self):
        self.authenticate(self.seller_user)
        url = reverse("ticketing-sellers-list")

        denied = self.client.get(url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.seller.can_manage_sellers = True
        self.seller.save(update_fields=["can_manage_sellers"])

        allowed = self.client.get(url)
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)
        self.assertIn(self.seller.pk, self.ids(allowed))

    def test_seller_reports_flag_controls_reports_endpoint(self):
        self.authenticate(self.seller_user)
        url = reverse("ticketing-reports")

        denied = self.client.get(url)
        self.assertEqual(denied.status_code, status.HTTP_403_FORBIDDEN)

        self.seller.can_view_reports = True
        self.seller.save(update_fields=["can_view_reports"])

        allowed = self.client.get(url)
        self.assertEqual(allowed.status_code, status.HTTP_200_OK)

    def test_seller_dashboard_flag_does_not_grant_owner_dashboard(self):
        # The seller profile already has can_access_dashboard=True. That flag
        # belongs to the seller dashboard, not the organisation-wide owner one.
        self.authenticate(self.seller_user)

        response = self.client.get(reverse("ticketing-dashboard"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_partner_business_entity_access_does_not_expose_product_catalog_without_seller_profile(self):
        self.authenticate(self.partner_user)

        response = self.client.get(reverse("ticketing-products-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])
        self.assertNotIn(self.product_a.pk, self.ids(response))
        self.assertNotIn(self.product_b.pk, self.ids(response))

    def test_partner_cannot_borrow_shared_access_to_other_tenant(self):
        self.authenticate(self.partner_user)

        response = self.client.get(
            reverse("ticketing-products-list"),
            {"organisation_slug": self.org_b.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_business_entity_access_removes_shared_private_access(self):
        self.partner_access.is_active = False
        self.partner_access.save(update_fields=["is_active"])
        self.authenticate(self.partner_user)

        response = self.client.get(reverse("ticketing-products-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_business_entity_removes_shared_private_access(self):
        self.partner_entity_a.is_active = False
        self.partner_entity_a.save(update_fields=["is_active"])
        self.authenticate(self.partner_user)

        response = self.client.get(reverse("ticketing-products-list"))

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    @patch("ticketing.views.booking_finance.seller_leaderboard", return_value=[])
    @patch(
        "ticketing.views.booking_finance.owner_finance_summary",
        return_value={},
    )
    def test_platform_admin_can_access_explicit_active_tenant(
        self,
        owner_finance_summary,
        seller_leaderboard,
    ):
        self.authenticate(self.platform_admin)

        response = self.client.get(
            reverse("ticketing-dashboard"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_permission_failure_does_not_expose_other_tenant_objects(self):
        self.authenticate(self.owner_a)

        response = self.client.get(
            reverse("ticketing-integrations-list"),
            {"organisation_slug": self.org_b.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("provider-b.example.test", payload)
        self.assertNotIn(str(self.integration_b.pk), payload)
