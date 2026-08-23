"""Public seller application response contract tests.

Protects the frontend redirect contract after a seller submits an application:
the public response must include the organisation slug so the frontend can send
the applicant to /ticketing/<slug>/login instead of the generic /ticketing route.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import ExperienceProduct, SellerSignupInvite


class PublicSellerApplicationResponseAPITests(APITestCase):
    PASSWORD = "Seller-response-password-123!"

    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Seller Response Organisation",
            slug="seller-response-org",
            business_type="ticketing",
            is_active=True,
        )

        User = get_user_model()
        cls.owner = User.objects.create_user(
            username="seller-response-owner",
            email="seller-response-owner@example.test",
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
            name="Seller Response Product",
            slug="seller-response-product",
            sku="SELLER-RESPONSE",
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

    def create_invite(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(
            self.invite_list_url(),
            {
                "name": "Seller Response Invite",
                "description": "Response contract test",
                "default_role": "seller",
                "default_commission_type": "percentage",
                "default_commission_rate": "15.00",
                "default_fixed_commission_amount": "0.00",
                "default_margin_percent": "15.00",
                "default_max_customer_discount_percent": "10.00",
                "default_permissions": {
                    "can_access_dashboard": True,
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

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        invite = SellerSignupInvite.objects.get(pk=response.data["id"])
        self.client.force_authenticate(user=None)
        return invite

    def application_payload(self):
        return {
            "legal_name": "Seller Response Applicant",
            "display_name": "Seller Response Applicant",
            "email": "seller-response-applicant@example.test",
            "phone": "+18095550101",
            "whatsapp": "+18095550101",
            "country": "Dominican Republic",
            "city": "Punta Cana",
            "preferred_language": "es",
            "seller_type": "independent",
            "business_name": "",
            "experience_years": 2,
            "biography": "Public seller application response contract test.",
            "languages": ["es", "en"],
            "product_interests": ["excursion"],
            "applicant_message": "Quiero ser vendedor.",
            "terms_accepted": True,
            "password": self.PASSWORD,
            "password_confirm": self.PASSWORD,
        }

    def test_successful_public_application_returns_organisation_slug(self):
        invite = self.create_invite()

        response = self.client.post(
            self.public_apply_url(invite),
            self.application_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data["status"], "pending")
        self.assertEqual(
            response.data["organisation_slug"],
            self.organisation.slug,
        )
        self.assertEqual(
            response.data["organisation"],
            self.organisation.name,
        )

    def test_response_does_not_expose_internal_invite_or_password_data(self):
        invite = self.create_invite()

        response = self.client.post(
            self.public_apply_url(invite),
            self.application_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)

        payload = repr(response.data)
        self.assertNotIn(self.PASSWORD, payload)
        self.assertNotIn(str(invite.token), payload)
        self.assertNotIn("token_hash", payload)
        self.assertNotIn("default_permissions", payload)
