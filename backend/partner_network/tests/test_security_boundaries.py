from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from organisations.models import Organisation

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerAccess,
)
from partner_network.permissions import get_referral_partner_access


class ReferralPartnerSecurityBoundaryTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="PN Org A", slug="pn-org-a", business_type="ticketing", is_active=True
        )
        cls.org_b = Organisation.objects.create(
            name="PN Org B", slug="pn-org-b", business_type="ticketing", is_active=True
        )
        PartnerNetworkSettings.objects.create(organisation=cls.org_a, enabled=True)
        PartnerNetworkSettings.objects.create(organisation=cls.org_b, enabled=True)
        User = get_user_model()
        cls.user_a = User.objects.create_user(
            username="pn-partner-a",
            email="pn-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.partner_a = ReferralPartner.objects.create(
            organisation=cls.org_a, name="Partner A", status="active"
        )
        cls.partner_b = ReferralPartner.objects.create(
            organisation=cls.org_b, name="Partner B", status="active"
        )
        ReferralPartnerAccess.objects.create(
            organisation=cls.org_a,
            partner=cls.partner_a,
            user=cls.user_a,
            is_active=True,
        )

    def test_access_never_crosses_organisation_boundary(self):
        self.assertIsNotNone(get_referral_partner_access(self.user_a, self.org_a))
        self.assertIsNone(get_referral_partner_access(self.user_a, self.org_b))

    def test_partner_id_filter_cannot_select_other_partner(self):
        self.assertIsNone(
            get_referral_partner_access(
                self.user_a,
                self.org_a,
                partner_id=self.partner_b.pk,
            )
        )
