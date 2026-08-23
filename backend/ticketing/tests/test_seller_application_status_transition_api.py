"""Seller application status transition and post-approval access tests.

These tests reproduce the real frontend lifecycle:

public invite -> seller applies -> seller logs in -> application status is pending
-> owner approves -> same seller session refreshes application status
-> API must return approved -> seller dashboard becomes accessible.

The purpose is to catch regressions where the frontend remains stuck on "Pending"
or receives a 404 after owner approval.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import ExperienceProduct, SellerApplication, SellerSignupInvite


class SellerApplicationStatusTransitionAPITests(APITestCase):
    PASSWORD = "Seller-transition-password-123!"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Seller Transition Organisation",
            slug="seller-transition-org",
            business_type="ticketing",
            is_active=True,
        )

        User = get_user_model()
        cls.owner = User.objects.create_user(
            username="seller-transition-owner",
            email="seller-transition-owner@example.test",
            password="Strong-owner-password-123!",
            organisation=cls.organisation,
        )

        Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )

        cls.product = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Seller Transition Product",
            slug="seller-transition-product",
            sku="SELLER-TRANSITION",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
        )

    def invite_list_url(self):
        return reverse("ticketing-seller-signup-invites-list")

    def public_apply_url(self, invite):
        return reverse(
            "ticketing-public-seller-apply",
            kwargs={"token": invite.token},
        )

    def approve_url(self, application):
        return reverse(
            "ticketing-seller-applications-approve",
            args=[application.pk],
        )

    def application_status_url(self):
        return "/api/ticketing/seller/application/"

    def dashboard_url(self):
        return reverse("ticketing-seller-dashboard")

    def organisation_params(self):
        # Current frontend uses the organisation slug as the tenant selector.
        return {"slug": self.organisation.slug}

    def authenticate_owner(self):
        self.client.force_authenticate(user=self.owner)

    def create_invite(self, *, can_access_dashboard=True):
        self.authenticate_owner()

        response = self.client.post(
            self.invite_list_url(),
            {
                "name": "Seller Transition Invite",
                "description": "Transition regression coverage",
                "default_role": "seller",
                "default_commission_type": "percentage",
                "default_commission_rate": "15.00",
                "default_fixed_commission_amount": "0.00",
                "default_margin_percent": "15.00",
                "default_max_customer_discount_percent": "10.00",
                "default_permissions": {
                    "can_access_dashboard": can_access_dashboard,
                    "can_create_bookings": True,
                    "can_view_own_sales": True,
                    "can_view_own_commissions": True,
                    "can_manage_sellers": False,
                    "can_manage_settings": False,
                    "can_manage_integrations": False,
                    "can_manage_products": False,
                    "can_view_reports": False,
                },
                "allowed_products": [self.product.pk],
                "allowed_product_types": ["excursion"],
                "require_profile_photo": False,
                "require_identification": False,
                "show_commission_offer": True,
                "terms_version": "seller-terms-v1",
                "max_uses": 10,
                "is_active": True,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            response.data,
        )

        invite = SellerSignupInvite.objects.get(pk=response.data["id"])
        self.client.force_authenticate(user=None)
        return invite

    def submit_application(self, invite, *, email):
        self.client.force_authenticate(user=None)

        response = self.client.post(
            self.public_apply_url(invite),
            {
                "legal_name": "Transition Seller",
                "display_name": "Transition Seller",
                "email": email,
                "phone": "+18095550101",
                "whatsapp": "+18095550101",
                "country": "Dominican Republic",
                "city": "Punta Cana",
                "preferred_language": "en",
                "seller_type": "independent",
                "business_name": "",
                "experience_years": 2,
                "biography": "Seller application transition test.",
                "languages": ["en", "es"],
                "product_interests": ["excursion"],
                "applicant_message": "Please review my seller application.",
                "terms_accepted": True,
                "password": self.PASSWORD,
                "password_confirm": self.PASSWORD,
            },
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_201_CREATED,
            response.data,
        )

        return SellerApplication.objects.select_related(
            "user",
            "seller",
            "organisation",
            "invite",
        ).get(pk=response.data["id"])

    def login_as_applicant(self, application):
        self.client.force_authenticate(user=None)
        self.client.logout()

        logged_in = self.client.login(
            email=application.user.email,
            password=self.PASSWORD,
        )
        self.assertTrue(logged_in)

    def approve_application(self, application):
        self.authenticate_owner()

        response = self.client.post(
            self.approve_url(application),
            {},
            format="json",
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            response.data,
        )

        application.refresh_from_db()
        application.seller.refresh_from_db()
        return response

    def test_pending_seller_can_refresh_own_application_status(self):
        invite = self.create_invite(can_access_dashboard=True)
        application = self.submit_application(
            invite,
            email="transition-pending@example.test",
        )
        self.login_as_applicant(application)

        response = self.client.get(
            self.application_status_url(),
            self.organisation_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["id"], application.pk)
        self.assertEqual(response.data["status"], "pending")
        self.assertTrue(response.data["is_editable_by_applicant"])

    def test_same_seller_session_refresh_returns_approved_after_owner_approval(self):
        invite = self.create_invite(can_access_dashboard=True)
        application = self.submit_application(
            invite,
            email="transition-approved@example.test",
        )

        # Establish the seller's real session before approval.
        self.login_as_applicant(application)

        before = self.client.get(
            self.application_status_url(),
            self.organisation_params(),
        )
        self.assertEqual(before.status_code, status.HTTP_200_OK, before.data)
        self.assertEqual(before.data["status"], "pending")

        # Owner approves in a separate authenticated context.
        self.approve_application(application)

        # Restore the same seller identity and perform the same refresh
        # request used by SellerApplicationStatusPage.
        self.login_as_applicant(application)

        after = self.client.get(
            self.application_status_url(),
            self.organisation_params(),
        )

        self.assertEqual(after.status_code, status.HTTP_200_OK, after.data)
        self.assertEqual(after.data["id"], application.pk)
        self.assertEqual(after.data["status"], "approved")
        self.assertEqual(
            after.data["permissions"]["can_access_dashboard"],
            True,
        )

    def test_approval_preserves_application_user_and_tenant_linkage(self):
        invite = self.create_invite(can_access_dashboard=True)
        application = self.submit_application(
            invite,
            email="transition-linkage@example.test",
        )

        original_user_id = application.user_id
        original_organisation_id = application.organisation_id
        original_seller_id = application.seller_id

        self.approve_application(application)
        application.refresh_from_db()

        self.assertEqual(application.user_id, original_user_id)
        self.assertEqual(application.organisation_id, original_organisation_id)
        self.assertEqual(application.seller_id, original_seller_id)
        self.assertEqual(application.seller.user_id, original_user_id)
        self.assertEqual(
            application.seller.organisation_id,
            original_organisation_id,
        )

    def test_approved_seller_with_dashboard_permission_can_open_dashboard(self):
        invite = self.create_invite(can_access_dashboard=True)
        application = self.submit_application(
            invite,
            email="transition-dashboard@example.test",
        )

        self.approve_application(application)
        self.login_as_applicant(application)

        response = self.client.get(
            self.dashboard_url(),
            self.organisation_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["seller"]["id"], application.seller_id)
        self.assertTrue(response.data["permissions"]["can_access_dashboard"])

    def test_approved_seller_without_dashboard_permission_refreshes_as_approved_but_dashboard_is_forbidden(self):
        invite = self.create_invite(can_access_dashboard=False)
        application = self.submit_application(
            invite,
            email="transition-approved-no-dashboard@example.test",
        )

        self.approve_application(application)
        self.login_as_applicant(application)

        status_response = self.client.get(
            self.application_status_url(),
            self.organisation_params(),
        )
        dashboard_response = self.client.get(
            self.dashboard_url(),
            self.organisation_params(),
        )

        self.assertEqual(
            status_response.status_code,
            status.HTTP_200_OK,
            status_response.data,
        )
        self.assertEqual(status_response.data["status"], "approved")
        self.assertFalse(
            status_response.data["permissions"]["can_access_dashboard"]
        )
        self.assertEqual(
            dashboard_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
