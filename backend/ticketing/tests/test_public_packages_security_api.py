"""Public package security coverage.

The public contract exposes ExperiencePackage rows nested on public products.
This suite covers tenant isolation, inactive packages, public pricing/deposit/
capacity, hidden/inactive products, unpublished sites, read-only behavior,
and non-exposure of cost/admin metadata.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperiencePackage,
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicPackagesSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Package Organisation A",
            slug="package-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Package Organisation B",
            slug="package-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Package Site A",
            custom_domain="package-a.example.test",
            canonical_url="https://package-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Package Site B",
            custom_domain="package-b.example.test",
            canonical_url="https://package-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Package Product A",
            slug="package-product-a",
            sku="PACKAGE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
            cost_price=Decimal("55.00"),
            adult_cost_price=Decimal("55.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Package Product A",
            slug="hidden-package-product-a",
            sku="PACKAGE-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("110.00"),
            adult_price=Decimal("110.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Package Product A",
            slug="inactive-package-product-a",
            sku="PACKAGE-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Package Product B",
            slug="foreign-package-product-b",
            sku="PACKAGE-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
        )

        cls.package_a = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Standard Package",
            description="Standard public package",
            price=Decimal("120.00"),
            cost_price=Decimal("70.00"),
            deposit_amount=Decimal("30.00"),
            capacity=10,
            is_default=True,
            is_active=True,
            sort_order=1,
        )
        cls.package_a_2 = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Premium Package",
            description="Premium public package",
            price=Decimal("180.00"),
            cost_price=Decimal("95.00"),
            deposit_amount=Decimal("50.00"),
            capacity=5,
            is_default=False,
            is_active=True,
            sort_order=2,
        )
        cls.inactive_package = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Internal Inactive Package",
            description="INTERNAL PACKAGE CONTENT",
            price=Decimal("999.00"),
            cost_price=Decimal("500.00"),
            deposit_amount=Decimal("400.00"),
            capacity=99,
            is_default=False,
            is_active=False,
            sort_order=3,
        )
        cls.foreign_package = ExperiencePackage.objects.create(
            product=cls.product_b,
            name="Foreign Package B",
            description="FOREIGN PACKAGE PRIVATE CONTENT",
            price=Decimal("300.00"),
            cost_price=Decimal("200.00"),
            deposit_amount=Decimal("100.00"),
            capacity=20,
            is_default=True,
            is_active=True,
            sort_order=1,
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
        self.assertNotIn(self.foreign_package.name, payload)

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

    def test_unpublished_site_hides_products_and_packages(self):
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

    def test_public_product_detail_exposes_active_packages_only(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        packages = response.data["packages"]

        self.assertEqual(
            [package["name"] for package in packages],
            ["Standard Package", "Premium Package"],
        )
        self.assertNotIn("Internal Inactive Package", str(response.data))

    def test_package_pricing_deposit_and_capacity_are_public(self):
        response = self.get_product_detail()

        packages = {
            package["name"]: package
            for package in response.data["packages"]
        }

        standard = packages["Standard Package"]
        self.assertEqual(
            Decimal(str(standard["price"])),
            Decimal("120.00"),
        )
        self.assertEqual(
            Decimal(str(standard["deposit_amount"])),
            Decimal("30.00"),
        )
        self.assertEqual(standard["capacity"], 10)
        self.assertTrue(standard["is_default"])

        premium = packages["Premium Package"]
        self.assertEqual(
            Decimal(str(premium["price"])),
            Decimal("180.00"),
        )
        self.assertEqual(
            Decimal(str(premium["deposit_amount"])),
            Decimal("50.00"),
        )
        self.assertEqual(premium["capacity"], 5)
        self.assertFalse(premium["is_default"])

    def test_public_package_payload_does_not_expose_cost_or_admin_linkage(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        package = response.data["packages"][0]

        for field_name in (
            "product",
            "product_name",
            "cost_price",
            "is_active",
            "created_at",
            "updated_at",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, package)

    def test_public_product_payload_does_not_expose_costs_or_margins(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for forbidden in (
            "cost_price",
            "adult_cost_price",
            "child_cost_price",
            "infant_cost_price",
            "profit_per_unit",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_foreign_package_content_never_appears_in_tenant_a_product(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for foreign in (
            self.foreign_package.name,
            "FOREIGN PACKAGE PRIVATE CONTENT",
            "300.00",
            "200.00",
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_public_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Package Product",
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
                name="Anonymous Package Product",
            ).exists()
        )
