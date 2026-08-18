"""Public product availability / inventory API coverage.

Covers tenant isolation, published-site boundaries, public product visibility,
date validation, local availability rows, package fallback, sold-out behavior,
remaining capacity, price/deposit overrides, and provider failure handling.
External availability providers are never contacted.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from unittest.mock import patch

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


class PublicAvailabilityAPITests(APITestCase):
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
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Availability Site B",
            custom_domain="availability-b.example.test",
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
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
            deposit_amount=Decimal("20.00"),
            capacity=20,
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Availability Product",
            slug="foreign-availability-product",
            sku="AVAIL-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
            deposit_amount=Decimal("40.00"),
            capacity=30,
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Availability Product",
            slug="hidden-availability-product",
            sku="AVAIL-HIDDEN",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("80.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Availability Product",
            slug="inactive-availability-product",
            sku="AVAIL-INACTIVE",
            product_type="excursion",
            status="active",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("70.00"),
        )
        cls.sold_out_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Sold Out Product",
            slug="sold-out-product",
            sku="AVAIL-SOLD",
            product_type="excursion",
            status="sold_out",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("60.00"),
        )

        cls.package_a = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="VIP Package",
            price=Decimal("150.00"),
            cost_price=Decimal("90.00"),
            deposit_amount=Decimal("30.00"),
            capacity=8,
            is_default=True,
            is_active=True,
        )

        cls.available_date = date.today() + timedelta(days=7)
        cls.sold_out_date = date.today() + timedelta(days=8)
        cls.unavailable_date = date.today() + timedelta(days=9)

        cls.availability_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.available_date,
            available_capacity=10,
            booked_quantity=3,
            price_override=Decimal("140.00"),
            deposit_override=Decimal("25.00"),
            is_available=True,
            note="Special date pricing",
        )
        cls.sold_out_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.sold_out_date,
            available_capacity=5,
            booked_quantity=5,
            is_available=True,
        )
        cls.unavailable_a = ProductAvailability.objects.create(
            product=cls.product_a,
            package=cls.package_a,
            date=cls.unavailable_date,
            available_capacity=10,
            booked_quantity=0,
            is_available=False,
        )
        cls.foreign_availability = ProductAvailability.objects.create(
            product=cls.product_b,
            date=cls.available_date,
            available_capacity=50,
            booked_quantity=0,
            is_available=True,
        )

    def availability_url(self, organisation, product):
        return reverse(
            "ticketing-public-product-availability",
            kwargs={
                "organisation_slug": organisation.slug,
                "product_slug": product.slug,
            },
        )

    def test_public_availability_url_reverses(self):
        self.assertEqual(
            self.availability_url(self.org_a, self.product_a),
            (
                f"/api/ticketing/public/{self.org_a.slug}/products/"
                f"{self.product_a.slug}/availability/"
            ),
        )

    def test_public_availability_is_tenant_scoped(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["product"]["id"], self.product_a.pk)
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_public_availability_rejects_foreign_tenant_product(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_b),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_availability_rejects_non_public_product(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.hidden_product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_availability_rejects_inactive_product(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.inactive_product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_availability_rejects_non_active_status_product(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.sold_out_product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_availability_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_availability_rejects_invalid_date(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": "not-a-date"},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("YYYY-MM-DD", str(response.data))

    def test_local_availability_uses_remaining_capacity(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(option["available_quantity"], 7)
        self.assertTrue(option["available"])
        self.assertFalse(option["sold_out"])

    def test_local_availability_applies_price_and_deposit_overrides(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        option = response.data["options"][0]
        self.assertEqual(option["price"], "140.00")
        self.assertEqual(option["deposit_amount"], "25.00")
        self.assertEqual(option["package_id"], self.package_a.pk)

    def test_local_availability_marks_zero_remaining_capacity_sold_out(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.sold_out_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(option["available_quantity"], 0)
        self.assertFalse(option["available"])
        self.assertTrue(option["sold_out"])

    def test_is_available_false_row_is_not_exposed(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.unavailable_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Since the disabled row is ignored, the local service falls back to
        # the active package rather than leaking the disabled availability row.
        option = response.data["options"][0]
        self.assertEqual(option["package_id"], self.package_a.pk)
        self.assertTrue(option["available"])
        self.assertNotIn(
            self.unavailable_a.pk,
            {
                item.get("raw", {}).get("availability_id")
                for item in response.data["options"]
                if isinstance(item, dict)
            },
        )

    def test_package_fallback_uses_package_price_deposit_and_capacity(self):
        no_row_date = date.today() + timedelta(days=20)

        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": no_row_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(option["price"], "150.00")
        self.assertEqual(option["deposit_amount"], "30.00")
        self.assertEqual(option["available_quantity"], 8)
        self.assertTrue(option["available"])

    def test_product_without_rows_or_packages_falls_back_to_product_capacity(self):
        product = ExperienceProduct.objects.create(
            organisation=self.org_a,
            name="Simple Availability Product",
            slug="simple-availability-product",
            sku="AVAIL-SIMPLE",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("75.00"),
            deposit_amount=Decimal("15.00"),
            capacity=12,
        )

        response = self.client.get(
            self.availability_url(self.org_a, product),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        option = response.data["options"][0]
        self.assertEqual(option["price"], "75.00")
        self.assertEqual(option["deposit_amount"], "15.00")
        self.assertEqual(option["available_quantity"], 12)

    def test_remaining_capacity_property_never_negative(self):
        row = ProductAvailability(
            product=self.product_a,
            date=self.available_date,
            available_capacity=2,
            booked_quantity=5,
        )

        self.assertEqual(row.remaining_capacity, 0)

    def test_availability_without_date_can_return_multiple_rows(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a)
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        dates = {
            option["service_date"]
            for option in response.data["options"]
        }
        self.assertIn(self.available_date.isoformat(), dates)
        self.assertIn(self.sold_out_date.isoformat(), dates)
        self.assertNotIn(self.unavailable_date.isoformat(), dates)

    @patch("ticketing.views.get_live_product_availability")
    def test_provider_failure_is_safely_returned_as_400(self, live):
        live.return_value = {
            "ok": False,
            "provider": "wellet",
            "product": {
                "id": self.product_a.pk,
                "name": self.product_a.name,
                "slug": self.product_a.slug,
            },
            "service_date": self.available_date.isoformat(),
            "options": [],
            "raw": None,
            "error": "Provider temporarily unavailable.",
        }

        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["ok"], False)
        self.assertEqual(response.data["options"], [])
        live.assert_called_once()

    @patch("ticketing.views.get_live_product_availability")
    def test_availability_service_receives_exact_tenant_product_and_date(self, live):
        live.return_value = {
            "ok": True,
            "provider": "local",
            "product": {
                "id": self.product_a.pk,
                "name": self.product_a.name,
                "slug": self.product_a.slug,
            },
            "service_date": self.available_date.isoformat(),
            "options": [],
            "raw": None,
            "error": "",
        }

        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"service_date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        kwargs = live.call_args.kwargs
        self.assertEqual(kwargs["organisation"].pk, self.org_a.pk)
        self.assertEqual(kwargs["product"].pk, self.product_a.pk)
        self.assertEqual(kwargs["service_date"], self.available_date)
        self.assertFalse(kwargs["include_raw"])

    @patch("ticketing.views.get_live_product_availability")
    def test_foreign_product_never_reaches_availability_service(self, live):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_b),
            {"date": self.available_date.isoformat()},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        live.assert_not_called()

    def test_public_availability_does_not_expose_foreign_inventory_ids(self):
        response = self.client.get(
            self.availability_url(self.org_a, self.product_a),
            {"date": self.available_date.isoformat()},
        )

        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn(
            str(self.foreign_availability.pk),
            {
                str(option.get("raw", {}).get("availability_id"))
                for option in response.data["options"]
                if isinstance(option, dict)
            },
        )
