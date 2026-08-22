"""Public product root-payload security coverage.

This suite focuses on the top-level public product representation. Nested
packages, availability, pickup schedules, transfer routes, event ticket types,
and gallery images are covered by their dedicated suites.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicProductCorePayloadSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Core Payload Organisation A",
            slug="core-payload-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Core Payload Organisation B",
            slug="core-payload-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Core Payload Site A",
            custom_domain="core-payload-a.example.test",
            canonical_url="https://core-payload-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Core Payload Site B",
            custom_domain="core-payload-b.example.test",
            canonical_url="https://core-payload-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Public Core Product A",
            slug="public-core-product-a",
            sku="PUBLIC-CORE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
            child_price=Decimal("50.00"),
            infant_price=Decimal("0.00"),
            short_description="Public short description",
            long_description="Public long description",
            duration_text="8 hours",
            location="Punta Cana",
            address="Public meeting address",
            instructions="Bring sunscreen.",
            pickup_instructions="Wait in the lobby.",
            cancellation_policy="Free cancellation within policy window.",
            imported_from_url="https://legacy.example.test/private-import-path",
            imported_from_domain="legacy.example.test",
            preserve_legacy_url=True,
            external_provider="wellet",
            external_product_id="PRIVATE-EXTERNAL-ID-A",
            seller_margin_percent=Decimal("25.00"),
            seller_allowed_discount_percent=Decimal("10.00"),
            cost_price=Decimal("60.00"),
            adult_cost_price=Decimal("60.00"),
            child_cost_price=Decimal("30.00"),
            infant_cost_price=Decimal("0.00"),
        )

        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Core Product A",
            slug="hidden-core-product-a",
            sku="HIDDEN-CORE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("110.00"),
            adult_price=Decimal("110.00"),
        )

        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Core Product A",
            slug="inactive-core-product-a",
            sku="INACTIVE-CORE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )

        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Core Product B",
            slug="foreign-core-product-b",
            sku="FOREIGN-CORE-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
            external_product_id="FOREIGN-PRIVATE-EXTERNAL-ID",
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

    def get_detail(self, product=None, organisation=None):
        return self.client.get(
            self.detail_url(product),
            self.tenant_params(organisation),
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

    def test_product_list_is_tenant_scoped_and_public_only(self):
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
        response = self.get_detail(
            product=self.product_b,
            organisation=self.org_a,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn("FOREIGN-PRIVATE-EXTERNAL-ID", payload)

    def test_hidden_and_inactive_products_are_not_public(self):
        hidden = self.get_detail(self.hidden_product_a)
        inactive = self.get_detail(self.inactive_product_a)

        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(inactive.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_public_products(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        listed = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )
        detailed = self.get_detail()

        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(listed), [])
        self.assertEqual(detailed.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_product_root_payload_excludes_admin_and_integration_fields(self):
        response = self.get_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        forbidden = {
            "organisation",
            "organisation_name",
            "category",
            "category_id",
            "category_detail",
            "sku",
            "external_provider",
            "external_product_id",
            "imported_from_url",
            "imported_from_domain",
            "preserve_legacy_url",
            "status",
            "is_active",
            "created_by",
            "created_at",
            "updated_at",
            "view_count",
            "booking_count",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
            "cost_price",
            "adult_cost_price",
            "child_cost_price",
            "infant_cost_price",
            "profit_per_unit",
            "url_aliases",
        }

        for field_name in forbidden:
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

        payload = str(response.data)
        self.assertNotIn("PRIVATE-EXTERNAL-ID-A", payload)
        self.assertNotIn("legacy.example.test", payload)
        self.assertNotIn("private-import-path", payload)

    def test_public_product_root_payload_keeps_customer_facing_fields(self):
        response = self.get_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.data

        self.assertEqual(data["id"], self.product_a.pk)
        self.assertEqual(data["name"], self.product_a.name)
        self.assertEqual(data["slug"], self.product_a.slug)
        self.assertEqual(data["product_type"], "excursion")
        self.assertEqual(Decimal(str(data["adult_price"])), Decimal("100.00"))
        self.assertEqual(Decimal(str(data["child_price"])), Decimal("50.00"))
        self.assertEqual(Decimal(str(data["infant_price"])), Decimal("0.00"))
        self.assertEqual(data["short_description"], "Public short description")
        self.assertEqual(data["long_description"], "Public long description")
        self.assertEqual(data["duration_text"], "8 hours")
        self.assertEqual(data["location"], "Punta Cana")
        self.assertEqual(data["instructions"], "Bring sunscreen.")
        self.assertEqual(data["pickup_instructions"], "Wait in the lobby.")
        self.assertEqual(
            data["cancellation_policy"],
            "Free cancellation within policy window.",
        )

    def test_public_product_nested_sections_remain_present(self):
        response = self.get_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        for field_name in (
            "packages",
            "availability",
            "pickup_schedules",
            "transfer_routes",
            "event_ticket_types",
            "gallery_images",
        ):
            with self.subTest(field_name=field_name):
                self.assertIn(field_name, response.data)
                self.assertIsInstance(response.data[field_name], list)

    def test_public_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Core Product",
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
                name="Anonymous Core Product",
            ).exists()
        )
