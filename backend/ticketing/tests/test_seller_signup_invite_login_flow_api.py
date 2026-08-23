"""End-to-end seller signup-link, approval, permission, and login tests.

This suite exercises the real workflow:
owner creates invite -> public applicant opens link -> applicant submits credentials
-> owner approves -> invite permissions are applied -> seller logs in with the
password supplied through the public link -> seller dashboard enforces access.
"""

from __future__ import annotations

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
    ExperienceProduct,
    Seller,
    SellerApplication,
    SellerSignupInvite,
)


class SellerSignupInviteLoginFlowAPITests(APITestCase):
    PASSWORD = "Seller-link-password-123!"

    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Seller Invite Organisation A",
            slug="seller-invite-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Seller Invite Organisation B",
            slug="seller-invite-b",
            business_type="ticketing",
            is_active=True,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="seller-invite-owner-a",
            email="seller-invite-owner-a@example.test",
            password="Strong-owner-password-123!",
            organisation=cls.org_a,
        )
        cls.owner_b = User.objects.create_user(
            username="seller-invite-owner-b",
            email="seller-invite-owner-b@example.test",
            password="Strong-owner-password-123!",
            organisation=cls.org_b,
        )

        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.org_a,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=cls.owner_b,
            organisation=cls.org_b,
            role="owner",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Invite Product A",
            slug="invite-product-a",
            sku="INVITE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
            public_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Invite Product",
            slug="foreign-invite-product",
            sku="INVITE-B",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
            public_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

    def authenticate_owner(self, owner=None):
        self.client.force_authenticate(user=owner or self.owner_a)

    def invite_list_url(self):
        return reverse("ticketing-seller-signup-invites-list")

    def application_detail_url(self, application):
        return reverse(
            "ticketing-seller-applications-detail",
            args=[application.pk],
        )

    def approve_url(self, application):
        return reverse(
            "ticketing-seller-applications-approve",
            args=[application.pk],
        )

    def public_apply_url(self, invite):
        return reverse(
            "ticketing-public-seller-apply",
            kwargs={"token": invite.token},
        )

    def dashboard_url(self):
        return reverse("ticketing-seller-dashboard")

    def invite_payload(
        self,
        *,
        can_access_dashboard=True,
        can_create_bookings=True,
        can_view_own_sales=True,
        max_uses=10,
        **extra,
    ):
        payload = {
            "name": "Public Seller Signup",
            "description": "Seller registration invitation",
            "default_role": "seller",
            "default_commission_type": "percentage",
            "default_commission_rate": "15.00",
            "default_fixed_commission_amount": "0.00",
            "default_margin_percent": "15.00",
            "default_max_customer_discount_percent": "10.00",
            "default_permissions": {
                "can_access_dashboard": can_access_dashboard,
                "can_create_bookings": can_create_bookings,
                "can_view_own_sales": can_view_own_sales,
                "can_view_own_commissions": True,
                "can_manage_sellers": False,
                "can_manage_settings": False,
                "can_manage_integrations": False,
                "can_manage_products": False,
                "can_view_reports": False,
            },
            "allowed_products": [self.product_a.pk],
            "allowed_product_types": ["excursion"],
            "require_profile_photo": False,
            "require_identification": False,
            "show_commission_offer": True,
            "terms_version": "seller-terms-v1",
            "max_uses": max_uses,
            "is_active": True,
        }
        payload.update(extra)
        return payload

    def create_invite_via_owner_api(self, **overrides):
        self.authenticate_owner()
        response = self.client.post(
            self.invite_list_url(),
            self.invite_payload(**overrides),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        invite = SellerSignupInvite.objects.get(pk=response.data["id"])
        self.client.force_authenticate(user=None)
        return response, invite

    def application_payload(self, *, email="new-link-seller@example.test", **extra):
        payload = {
            "legal_name": "New Link Seller",
            "display_name": "Link Seller",
            "email": email,
            "phone": "+18095550101",
            "whatsapp": "+18095550101",
            "country": "Dominican Republic",
            "city": "Punta Cana",
            "preferred_language": "en",
            "seller_type": "independent",
            "experience_years": 2,
            "biography": "Seller signup-link test applicant.",
            "languages": ["en", "es"],
            "product_interests": ["excursion"],
            "applicant_message": "I would like to sell excursions.",
            "terms_accepted": True,
            "password": self.PASSWORD,
            "password_confirm": self.PASSWORD,
        }
        payload.update(extra)
        return payload

    def submit_application(self, invite, **payload_overrides):
        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.public_apply_url(invite),
            self.application_payload(**payload_overrides),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        application = SellerApplication.objects.select_related(
            "user", "seller", "invite", "organisation"
        ).get(pk=response.data["id"])
        return response, application

    def approve_application(self, application, owner=None, payload=None):
        self.authenticate_owner(owner)
        response = self.client.post(
            self.approve_url(application),
            payload or {},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        application.refresh_from_db()
        application.seller.refresh_from_db()
        return response

    def login_as_applicant(self, application, password=None):
        self.client.force_authenticate(user=None)
        self.client.logout()
        return self.client.login(
            email=application.user.email,
            password=password or self.PASSWORD,
        )

    def test_owner_creates_public_signup_link_with_permissions(self):
        response, invite = self.create_invite_via_owner_api()

        self.assertEqual(invite.organisation_id, self.org_a.pk)
        self.assertEqual(invite.created_by_id, self.owner_a.pk)
        self.assertTrue(invite.is_available)
        self.assertTrue(invite.default_permissions["can_access_dashboard"])
        self.assertFalse(invite.default_permissions["can_manage_sellers"])
        self.assertEqual(
            list(invite.allowed_products.values_list("id", flat=True)),
            [self.product_a.pk],
        )
        self.assertIn(str(invite.token), response.data["signup_url"])

    def test_public_link_can_be_opened_without_authentication(self):
        _response, invite = self.create_invite_via_owner_api()

        response = self.client.get(self.public_apply_url(invite))

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["organisation_name"], self.org_a.name)
        self.assertTrue(response.data["is_available"])
        self.assertEqual(
            [item["id"] for item in response.data["allowed_products"]],
            [self.product_a.pk],
        )
        self.assertNotIn("default_permissions", response.data)
        self.assertNotIn("token", response.data)

    def test_public_signup_creates_user_seller_and_pending_application(self):
        _response, invite = self.create_invite_via_owner_api()
        response, application = self.submit_application(invite)

        self.assertEqual(application.organisation_id, self.org_a.pk)
        self.assertEqual(application.invite_id, invite.pk)
        self.assertEqual(application.user.organisation_id, self.org_a.pk)
        self.assertEqual(application.seller.organisation_id, self.org_a.pk)
        self.assertEqual(application.seller.user_id, application.user_id)
        self.assertEqual(application.status, "pending")
        self.assertNotEqual(application.seller.application_status, "approved")
        self.assertTrue(application.user.check_password(self.PASSWORD))
        self.assertEqual(response.data["status"], "pending")
        self.assertNotIn("password", str(response.data))

    def test_pending_applicant_credentials_are_valid_but_panel_is_denied(self):
        _response, invite = self.create_invite_via_owner_api()
        _response, application = self.submit_application(invite)

        self.assertTrue(self.login_as_applicant(application))

        dashboard = self.client.get(self.dashboard_url())
        self.assertIn(
            dashboard.status_code,
            (status.HTTP_403_FORBIDDEN, status.HTTP_404_NOT_FOUND),
            dashboard.data,
        )

    def test_owner_approval_applies_invite_permissions_and_products(self):
        _response, invite = self.create_invite_via_owner_api(
            can_access_dashboard=True,
            can_create_bookings=True,
            can_view_own_sales=True,
        )
        _response, application = self.submit_application(invite)

        self.approve_application(application)

        seller = Seller.objects.get(pk=application.seller_id)
        self.assertEqual(seller.application_status, "approved")
        self.assertTrue(seller.is_active)
        self.assertTrue(seller.can_access_dashboard)
        self.assertTrue(seller.can_create_bookings)
        self.assertTrue(seller.can_view_own_sales)
        self.assertTrue(seller.can_view_own_commissions)
        self.assertFalse(seller.can_manage_sellers)
        self.assertFalse(seller.can_manage_settings)
        self.assertEqual(
            list(seller.assigned_products.values_list("id", flat=True)),
            [self.product_a.pk],
        )

    def test_full_link_to_login_to_dashboard_flow_works(self):
        _response, invite = self.create_invite_via_owner_api(
            can_access_dashboard=True,
        )
        _response, application = self.submit_application(
            invite,
            email="full-flow-seller@example.test",
        )

        self.approve_application(application)

        # Real Django authentication: no force_authenticate for the seller.
        self.assertTrue(self.login_as_applicant(application))

        dashboard = self.client.get(self.dashboard_url())

        self.assertEqual(dashboard.status_code, status.HTTP_200_OK, dashboard.data)
        self.assertEqual(dashboard.data["seller"]["id"], application.seller_id)
        self.assertTrue(dashboard.data["permissions"]["can_access_dashboard"])

    def test_wrong_password_cannot_log_in_after_approval(self):
        _response, invite = self.create_invite_via_owner_api()
        _response, application = self.submit_application(
            invite,
            email="wrong-password-seller@example.test",
        )
        self.approve_application(application)

        self.assertFalse(
            self.login_as_applicant(
                application,
                password="Definitely-wrong-password-123!",
            )
        )

    def test_approved_seller_without_dashboard_permission_cannot_enter(self):
        _response, invite = self.create_invite_via_owner_api(
            can_access_dashboard=False,
        )
        _response, application = self.submit_application(
            invite,
            email="no-dashboard-seller@example.test",
        )
        self.approve_application(application)

        seller = Seller.objects.get(pk=application.seller_id)
        self.assertFalse(seller.can_access_dashboard)
        self.assertTrue(self.login_as_applicant(application))

        dashboard = self.client.get(self.dashboard_url())
        self.assertEqual(dashboard.status_code, status.HTTP_403_FORBIDDEN)

    def test_applicant_cannot_choose_or_escalate_permissions_in_public_payload(self):
        _response, invite = self.create_invite_via_owner_api(
            can_access_dashboard=False,
        )
        payload = self.application_payload(
            email="permission-injection@example.test",
        )
        payload.update(
            {
                "can_access_dashboard": True,
                "can_manage_sellers": True,
                "default_permissions": {
                    "can_access_dashboard": True,
                    "can_manage_sellers": True,
                },
            }
        )

        self.client.force_authenticate(user=None)
        response = self.client.post(
            self.public_apply_url(invite),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        application = SellerApplication.objects.get(pk=response.data["id"])
        seller = Seller.objects.get(pk=application.seller_id)

        self.assertFalse(seller.can_manage_sellers)

        self.approve_application(application)
        seller.refresh_from_db()
        self.assertFalse(seller.can_access_dashboard)
        self.assertFalse(seller.can_manage_sellers)

    def test_other_tenant_owner_cannot_approve_application(self):
        _response, invite = self.create_invite_via_owner_api()
        _response, application = self.submit_application(
            invite,
            email="cross-tenant-approval@example.test",
        )

        self.authenticate_owner(self.owner_b)
        response = self.client.post(
            self.approve_url(application),
            {},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        application.refresh_from_db()
        self.assertEqual(application.status, "pending")

    def test_expired_or_disabled_link_cannot_accept_application(self):
        for mode in ("expired", "disabled"):
            with self.subTest(mode=mode):
                _response, invite = self.create_invite_via_owner_api()
                if mode == "expired":
                    invite.expires_at = timezone.now() - timedelta(seconds=1)
                    invite.save(update_fields=["expires_at", "updated_at"])
                else:
                    invite.is_active = False
                    invite.save(update_fields=["is_active", "updated_at"])

                self.client.force_authenticate(user=None)
                get_response = self.client.get(self.public_apply_url(invite))
                post_response = self.client.post(
                    self.public_apply_url(invite),
                    self.application_payload(
                        email=f"{mode}-seller@example.test",
                    ),
                    format="json",
                )

                self.assertEqual(get_response.status_code, status.HTTP_410_GONE)
                self.assertEqual(post_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_use_limit_blocks_reuse_after_first_application(self):
        _response, invite = self.create_invite_via_owner_api(max_uses=1)

        self.submit_application(
            invite,
            email="single-use-first@example.test",
        )
        invite.refresh_from_db()
        self.assertEqual(invite.use_count, 1)
        self.assertFalse(invite.is_available)

        self.client.force_authenticate(user=None)
        second = self.client.post(
            self.public_apply_url(invite),
            self.application_payload(
                email="single-use-second@example.test",
            ),
            format="json",
        )

        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_signup_token_returns_404_without_tenant_details(self):
        response = self.client.get(
            reverse(
                "ticketing-public-seller-apply",
                kwargs={"token": uuid4()},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.org_a.name, str(response.data))
        self.assertNotIn(self.org_b.name, str(response.data))
