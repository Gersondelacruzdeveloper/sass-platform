"""Public product availability security coverage.

Covers tenant isolation, unpublished/inactive boundaries, date validation,
sold-out capacity, package scoping, public price/deposit overrides, and strict
non-exposure of internal notes/cost/provider data.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperiencePackage,
    ExperienceProduct,
    ProductAvailability,
    TicketingPublicSiteSettings,
)


class PublicProductAvailabilitySecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Availability Organisation A",
            slug="availability-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Availability Organisation B",
            slug="availability-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Availability Site A",
            custom_domain="availability-a.example.test",
            canonical_url="https://availability-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Availability Site B",
            custom_domain="availability-b.example.test",
            canonical_url="https://availability-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Availability Product A",
            slug="availability-product-a",
            sku="AVAIL-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            deposit_amount=Decimal("20.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Availability Product A",
            slug="hidden-availability-product-a",
            sku="AVAIL-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("150.00"),
            adult_price=Decimal("150.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Availability Product A",
            slug="inactive-availability-product-a",
            sku="AVAIL-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("175.00"),
            adult_price=Decimal("175.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Availability Product B",
            slug="foreign-availability-product-b",
            sku="AVAIL-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("220.00"),
            adult_price=Decimal("220.00"),
        )

        cls.package_a = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Package A",
            description="Public package",
            price=Decimal("120.00"),
            cost_price=Decimal("70.00"),
            deposit_amount=Decimal("30.00"),
            capacity=10,
            is_default=True,
            is_active=True,
        )
        cls.package_b = ExperiencePackage.objects.create(
            product=cls.product_b,
            name="Foreign Package B",
            description="Foreign package",
            price=Decimal("240.00"),
            cost_price=Decimal("150.00"),
            deposit_amount=Decimal("40.00"),
            capacity=10,
            is_default=True,
            is_active=True,
        )

        cls.future_date = date.today() + timedelta(days=7)
        cls.sold_out_date = date.today() + timedelta(days=8)
        cls.past_date = date.today() - timedelta(days=1)

        cls.availability_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.future_date,
            available_capacity=10,
            booked_quantity=3,
            price_override=Decimal("125.00"),
            deposit_override=Decimal("35.00"),
            is_available=True,
            note="INTERNAL PROVIDER NOTE A",
        )
        cls.sold_out_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.sold_out_date,
            available_capacity=5,
            booked_quantity=5,
            price_override=Decimal("130.00"),
            deposit_override=Decimal("40.00"),
            is_available=True,
            note="SOLD OUT INTERNAL NOTE",
        )
        cls.past_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.past_date,
            available_capacity=10,
            booked_quantity=0,
            price_override=Decimal("90.00"),
            deposit_override=Decimal("15.00"),
            is_available=True,
            note="PAST INTERNAL NOTE",
        )
        cls.foreign_availability = ProductAvailability.objects.create(
            product=cls.product_b,
            package=cls.package_b,
            date=cls.future_date,
            available_capacity=20,
            booked_quantity=1,
            price_override=Decimal("250.00"),
            deposit_override=Decimal("50.00"),
            is_available=True,
            note="FOREIGN INTERNAL PROVIDER NOTE",
        )

    def url(self, product=None, organisation=None):
        product = product or self.product_a
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-product-availability",
            kwargs={
                "organisation_slug": organisation.slug,
                "product_slug": product.slug,
            },
        )

    def test_public_availability_route_reverses(self):
        self.assertEqual(
            self.url(),
            (
                f"/api/ticketing/public/{self.org_a.slug}/products/"
                f"{self.product_a.slug}/availability/"
            ),
        )

    def test_public_availability_is_tenant_scoped(self):
        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.product_a.name, payload)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn("FOREIGN INTERNAL PROVIDER NOTE", payload)

    def test_cross_tenant_product_slug_fails_closed(self):
        response = self.client.get(
            self.url(
                product=self.product_b,
                organisation=self.org_a,
            ),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_hidden_product_has_no_public_availability(self):
        response = self.client.get(
            self.url(product=self.hidden_product_a),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_product_has_no_public_availability(self):
        response = self.client.get(
            self.url(product=self.inactive_product_a),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_blocks_public_availability(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_missing_date_uses_safe_default_contract(self):
        response = self.client.get(self.url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["ok"])
        self.assertIn("options", response.data)
        self.assertNotIn("INTERNAL PROVIDER NOTE A", str(response.data))

    def test_invalid_date_is_rejected(self):
        response = self.client.get(
            self.url(),
            {"date": "not-a-date"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_past_date_is_not_exposed_as_bookable(self):
        response = self.client.get(
            self.url(),
            {"date": self.past_date.isoformat()},
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_200_OK,
                status.HTTP_400_BAD_REQUEST,
                status.HTTP_404_NOT_FOUND,
            ),
        )
        if response.status_code == status.HTTP_200_OK:
            payload = str(response.data)
            self.assertNotIn("PAST INTERNAL NOTE", payload)
            if isinstance(response.data, dict):
                self.assertFalse(
                    bool(
                        response.data.get("is_available")
                        or response.data.get("available")
                    )
                )

    def test_public_availability_exposes_safe_available_quantity(self):
        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["ok"])
        self.assertEqual(len(response.data["options"]), 1)

        option = response.data["options"][0]
        self.assertEqual(option["product_id"], self.product_a.pk)
        self.assertEqual(option["package_id"], self.package_a.pk)
        self.assertEqual(option["available_quantity"], 7)
        self.assertTrue(option["available"])
        self.assertFalse(option["sold_out"])

    def test_public_availability_exposes_resolved_price_and_deposit(self):
        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(
            Decimal(str(option["price"])),
            Decimal("125.00"),
        )
        self.assertEqual(
            Decimal(str(option["deposit_amount"])),
            Decimal("35.00"),
        )

    def test_public_availability_never_exposes_internal_note_or_costs(self):
        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["provider"], "local")
        self.assertEqual(response.data["options"][0]["provider"], "local")
        payload = str(response.data)

        for forbidden in (
            "INTERNAL PROVIDER NOTE A",
            "note",
            "cost_price",
            "adult_cost_price",
            "profit_per_unit",
            "external_provider",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_sold_out_date_reports_no_available_quantity(self):
        response = self.client.get(
            self.url(),
            {"date": self.sold_out_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(option["available_quantity"], 0)
        self.assertFalse(option["available"])
        self.assertTrue(option["sold_out"])
        self.assertNotIn("SOLD OUT INTERNAL NOTE", str(response.data))

    def test_foreign_package_id_query_does_not_cross_tenant(self):
        response = self.client.get(
            self.url(),
            {
                "date": self.future_date.isoformat(),
                "package_id": self.package_b.pk,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["options"]), 1)

        option = response.data["options"][0]
        self.assertEqual(option["product_id"], self.product_a.pk)
        self.assertEqual(option["package_id"], self.package_a.pk)

        payload = str(response.data)
        self.assertNotIn(self.package_b.name, payload)
        self.assertNotIn("FOREIGN INTERNAL PROVIDER NOTE", payload)

    def test_same_tenant_package_id_query_returns_local_option(self):
        response = self.client.get(
            self.url(),
            {
                "date": self.future_date.isoformat(),
                "package_id": self.package_a.pk,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["options"]), 1)
        self.assertEqual(
            response.data["options"][0]["package_id"],
            self.package_a.pk,
        )

    def test_public_availability_response_has_no_cross_tenant_ids(self):
        response = self.client.get(
            self.url(),
            {"date": self.future_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(f"'product': {self.product_b.pk}", payload)
        self.assertNotIn(f"'package': {self.package_b.pk}", payload)
