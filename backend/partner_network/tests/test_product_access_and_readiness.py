from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

from django.test import TestCase
from organisations.models import Organisation

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralPartner,
    ReferralPartnerLocation,
    ReferralProductAccess,
)
from partner_network.services.product_access_service import allowed_product_queryset
from partner_network.services.readiness_service import get_location_readiness
from ticketing.models import ExperienceProduct, PickupLocation, ProductPickupSchedule


class ProductAccessAndReadinessTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Partner Product Org",
            slug="partner-product-org",
            business_type="ticketing",
            is_active=True,
        )
        PartnerNetworkSettings.objects.create(organisation=cls.organisation, enabled=True)
        cls.pickup = PickupLocation.objects.create(
            organisation=cls.organisation,
            name="Villa Test",
            slug="villa-test",
            location_type="private_address",
            is_active=True,
        )
        cls.partner = ReferralPartner.objects.create(
            organisation=cls.organisation,
            name="Villa Test",
            partner_type="villa",
            status="active",
            product_access_mode=ReferralPartner.PRODUCT_ACCESS_CUSTOM,
        )
        cls.location = ReferralPartnerLocation.objects.create(
            partner=cls.partner,
            display_name="Villa Test",
            property_type="villa",
            linked_pickup_location=cls.pickup,
            is_active=False,
        )
        cls.saona = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-referral",
            product_type="excursion",
            adult_price=Decimal("69.00"),
            status="active",
            is_active=True,
            public_enabled=True,
            requires_pickup_location=True,
        )
        cls.coco = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Coco Bongo",
            slug="coco-referral",
            product_type="excursion",
            adult_price=Decimal("85.00"),
            status="active",
            is_active=True,
            public_enabled=True,
        )
        ReferralProductAccess.objects.create(
            organisation=cls.organisation,
            partner=cls.partner,
            product=cls.saona,
            is_active=True,
        )

    def test_custom_partner_allowlist_filters_products(self):
        ids = set(allowed_product_queryset(
            organisation=self.organisation,
            partner=self.partner,
            partner_location=self.location,
        ).values_list("id", flat=True))
        self.assertEqual(ids, {self.saona.id})

    def test_readiness_detects_missing_pickup_schedule(self):
        result = get_location_readiness(self.location)
        self.assertIn("missing_pickup_schedule", result["problems"])
        self.assertEqual(result["status"], "incomplete")

    def test_readiness_becomes_ready_after_schedule(self):
        service_date = date.today() + timedelta(days=7)
        ProductPickupSchedule.objects.create(
            product=self.saona,
            pickup_location=self.pickup,
            day_of_week=service_date.weekday(),
            pickup_time=time(7, 20),
            is_active=True,
        )
        result = get_location_readiness(self.location)
        self.assertNotIn("missing_pickup_schedule", result["problems"])
        self.assertEqual(result["status"], "ready")
