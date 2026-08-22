"""Nested public product availability security coverage.

This suite is intentionally distinct from PublicProductAvailabilityAPIView
coverage. It validates the `availability` rows embedded inside the public
product payload and ensures only current, public-safe availability data is
exposed.
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


class PublicAvailabilitySecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Nested Availability Organisation A",
            slug="nested-availability-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Nested Availability Organisation B",
            slug="nested-availability-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Nested Availability Site A",
            custom_domain="nested-availability-a.example.test",
            canonical_url="https://nested-availability-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Nested Availability Site B",
            custom_domain="nested-availability-b.example.test",
            canonical_url="https://nested-availability-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Nested Availability Product A",
            slug="nested-availability-product-a",
            sku="NESTED-AVAIL-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Nested Availability Product A",
            slug="hidden-nested-availability-product-a",
            sku="NESTED-AVAIL-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("110.00"),
            adult_price=Decimal("110.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Nested Availability Product A",
            slug="inactive-nested-availability-product-a",
            sku="NESTED-AVAIL-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Nested Availability Product B",
            slug="foreign-nested-availability-product-b",
            sku="NESTED-AVAIL-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
        )

        cls.package_a = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Nested Availability Package A",
            description="Public package A",
            price=Decimal("120.00"),
            cost_price=Decimal("70.00"),
            deposit_amount=Decimal("30.00"),
            capacity=20,
            is_default=True,
            is_active=True,
            sort_order=1,
        )
        cls.package_b = ExperiencePackage.objects.create(
            product=cls.product_b,
            name="Foreign Nested Availability Package B",
            description="Foreign package B",
            price=Decimal("250.00"),
            cost_price=Decimal("150.00"),
            deposit_amount=Decimal("50.00"),
            capacity=20,
            is_default=True,
            is_active=True,
            sort_order=1,
        )

        cls.future_date = date.today() + timedelta(days=7)
        cls.future_date_2 = date.today() + timedelta(days=8)
        cls.past_date = date.today() - timedelta(days=1)

        cls.future_available = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.future_date,
            available_capacity=10,
            booked_quantity=3,
            price_override=Decimal("125.00"),
            deposit_override=Decimal("35.00"),
            is_available=True,
            note="INTERNAL AVAILABILITY NOTE A",
        )
        cls.future_unavailable = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.future_date_2,
            available_capacity=10,
            booked_quantity=0,
            price_override=Decimal("130.00"),
            deposit_override=Decimal("40.00"),
            is_available=False,
            note="UNAVAILABLE INTERNAL NOTE",
        )
        cls.past_available = ProductAvailability.objects.create(
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
            available_capacity=25,
            booked_quantity=2,
            price_override=Decimal("260.00"),
            deposit_override=Decimal("60.00"),
            is_available=True,
            note="FOREIGN INTERNAL AVAILABILITY NOTE",
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def list_url(self):
        return reverse("ticketing-public-products-list")

    def detail_url(self, product=None):
        product = product or self.product_a
        return reverse(
            "ticketing-public-products-detail",
            kwargs={"slug": product.slug},
        )

    def tenant_params(self, organisation=None, **extra):
        organisation = organisation or self.org_a
        return {"slug": organisation.slug, **extra}

    def get_product_detail(self):
        return self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

    def test_public_product_routes_reverse(self):
        self.assertEqual(
            self.list_url(),
            "/api/ticketing/public/products/",
        )
        self.assertEqual(
            self.detail_url(),
            f"/api/ticketing/public/products/{self.product_a.slug}/",
        )

    def test_product_list_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {row["name"] for row in self.rows(response)}
        self.assertIn(self.product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.product_b.name, names)

    def test_cross_tenant_product_slug_cannot_be_borrowed(self):
        response = self.client.get(
            self.detail_url(self.product_b),
            self.tenant_params(self.org_a),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn("FOREIGN INTERNAL AVAILABILITY NOTE", payload)

    def test_hidden_and_inactive_products_are_not_public(self):
        hidden = self.client.get(
            self.detail_url(self.hidden_product_a),
            self.tenant_params(),
        )
        inactive = self.client.get(
            self.detail_url(self.inactive_product_a),
            self.tenant_params(),
        )

        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(inactive.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_nested_availability(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )
        detail_response = self.get_product_detail()

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_product_exposes_only_future_available_rows(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        availability = response.data["availability"]

        self.assertEqual(len(availability), 1)
        self.assertEqual(
            str(availability[0]["date"]),
            self.future_date.isoformat(),
        )

        payload = str(response.data)
        self.assertNotIn(self.past_date.isoformat(), payload)
        self.assertNotIn(self.future_date_2.isoformat(), payload)

    def test_public_availability_exposes_customer_facing_capacity_and_overrides(self):
        response = self.get_product_detail()

        availability = response.data["availability"][0]
        self.assertEqual(availability["available_capacity"], 10)
        self.assertEqual(availability["booked_quantity"], 3)
        self.assertEqual(availability["remaining_capacity"], 7)
        self.assertEqual(
            Decimal(str(availability["price_override"])),
            Decimal("125.00"),
        )
        self.assertEqual(
            Decimal(str(availability["deposit_override"])),
            Decimal("35.00"),
        )

    def test_public_availability_payload_avoids_internal_linkage_and_notes(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        availability = response.data["availability"][0]

        for field_name in (
            "product",
            "product_name",
            "package",
            "package_name",
            "is_available",
            "note",
            "created_at",
            "updated_at",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, availability)

        payload = str(response.data)
        self.assertNotIn("INTERNAL AVAILABILITY NOTE A", payload)

    def test_foreign_availability_never_appears_in_tenant_a_payload(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for foreign in (
            "FOREIGN INTERNAL AVAILABILITY NOTE",
            self.product_b.name,
            self.package_b.name,
            "260.00",
            "60.00",
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_public_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Availability Product",
                "product_type": "excursion",
            },
            format="json",
        )
        delete_response = self.client.delete(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(
            create_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            delete_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertFalse(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
                name="Anonymous Availability Product",
            ).exists()
        )
