from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from organisations.models import Membership, Organisation
from rest_framework.test import APIClient

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerAccess,
    ReferralPartnerLocation,
)


class PartnerNetworkAPIPermissionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Partner API Org A",
            slug="partner-api-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Partner API Org B",
            slug="partner-api-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.settings_a = PartnerNetworkSettings.objects.create(
            organisation=cls.org_a,
            enabled=True,
        )
        PartnerNetworkSettings.objects.create(
            organisation=cls.org_b,
            enabled=True,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="partner-api-owner-a",
            email="partner-api-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        Membership.objects.create(
            user=cls.owner_a,
            organisation=cls.org_a,
            role="owner",
            is_active=True,
        )

        cls.partner_user_a = User.objects.create_user(
            username="partner-api-user-a",
            email="partner-api-user-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )

        cls.partner_a = ReferralPartner.objects.create(
            organisation=cls.org_a,
            name="Partner A",
            partner_type="hotel",
            status="active",
        )
        cls.partner_b_same_org = ReferralPartner.objects.create(
            organisation=cls.org_a,
            name="Partner B Same Org",
            partner_type="villa",
            status="active",
        )
        cls.partner_b_other_org = ReferralPartner.objects.create(
            organisation=cls.org_b,
            name="Partner B Other Org",
            partner_type="hotel",
            status="active",
        )

        cls.location_a = ReferralPartnerLocation.objects.create(
            partner=cls.partner_a,
            display_name="Partner A Hotel",
            property_type="hotel",
            welcome_message="Welcome A",
            is_active=True,
        )
        cls.location_b_same_org = ReferralPartnerLocation.objects.create(
            partner=cls.partner_b_same_org,
            display_name="Partner B Villa",
            property_type="villa",
            welcome_message="Welcome B",
            is_active=True,
        )

        ReferralPartnerAccess.objects.create(
            organisation=cls.org_a,
            partner=cls.partner_a,
            user=cls.partner_user_a,
            is_active=True,
            can_access_dashboard=True,
            can_view_earnings=True,
            can_edit_concierge=True,
            can_download_qr=True,
        )

    def setUp(self):
        self.client = APIClient()

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_unauthenticated_user_cannot_open_owner_or_partner_portal(self):
        owner_response = self.client.get(
            "/api/partner-network/overview/",
            {"organisation_slug": self.org_a.slug},
        )
        portal_response = self.client.get(
            "/api/partner-network/portal/dashboard/",
            {"organisation_slug": self.org_a.slug},
        )

        self.assertIn(owner_response.status_code, {401, 403})
        self.assertIn(portal_response.status_code, {401, 403})

    def test_referral_partner_user_cannot_open_owner_admin_api(self):
        self.authenticate(self.partner_user_a)

        response = self.client.get(
            "/api/partner-network/overview/",
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, 403)

    def test_owner_access_is_tenant_scoped(self):
        self.authenticate(self.owner_a)

        allowed = self.client.get(
            "/api/partner-network/overview/",
            {"organisation_slug": self.org_a.slug},
        )
        denied = self.client.get(
            "/api/partner-network/overview/",
            {"organisation_slug": self.org_b.slug},
        )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(denied.status_code, 403)

    def test_partner_portal_cannot_forge_another_partner_id(self):
        self.authenticate(self.partner_user_a)

        allowed = self.client.get(
            "/api/partner-network/portal/dashboard/",
            {
                "organisation_slug": self.org_a.slug,
                "partner_id": self.partner_a.pk,
            },
        )
        denied = self.client.get(
            "/api/partner-network/portal/dashboard/",
            {
                "organisation_slug": self.org_a.slug,
                "partner_id": self.partner_b_same_org.pk,
            },
        )

        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(denied.status_code, 403)

    def test_partner_cannot_edit_another_partners_location_by_forged_id(self):
        self.authenticate(self.partner_user_a)

        response = self.client.patch(
            (
                "/api/partner-network/portal/settings/"
                f"?organisation_slug={self.org_a.slug}"
            ),
            {
                "location_id": self.location_b_same_org.pk,
                "welcome_message": "Forged update",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 400)
        self.location_b_same_org.refresh_from_db()
        self.assertEqual(self.location_b_same_org.welcome_message, "Welcome B")

    def test_disabled_network_fails_closed_for_owner_and_partner_runtime_portals(self):
        self.settings_a.enabled = False
        self.settings_a.save(update_fields=["enabled"])

        self.authenticate(self.owner_a)
        owner_response = self.client.get(
            "/api/partner-network/overview/",
            {"organisation_slug": self.org_a.slug},
        )
        self.assertEqual(owner_response.status_code, 403)

        self.authenticate(self.partner_user_a)
        partner_response = self.client.get(
            "/api/partner-network/portal/dashboard/",
            {"organisation_slug": self.org_a.slug},
        )
        self.assertEqual(partner_response.status_code, 403)
