"""Public catalog, branding, domain, and product-resolution coverage.

These tests exercise public read-only catalog boundaries only. They do not
contact AWS, Stripe, PayPal, Meta, OpenAI, email services, or product providers.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceCategory,
    ExperienceProduct,
    ProductURLAlias,
    TicketingPublicSiteSettings,
    TicketingSettings,
)


class PublicCatalogAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Public Catalog Organisation A",
            slug="public-catalog-a",
            business_type="ticketing",
            is_active=True,
            email="catalog-a@example.test",
            phone="+18095550101",
        )
        cls.org_b = Organisation.objects.create(
            name="Public Catalog Organisation B",
            slug="public-catalog-b",
            business_type="ticketing",
            is_active=True,
            email="catalog-b@example.test",
            phone="+18095550202",
        )
        cls.inactive_org = Organisation.objects.create(
            name="Public Catalog Inactive",
            slug="public-catalog-inactive",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Catalog Site A",
            custom_domain="catalog-a.example.test",
            canonical_url="https://catalog-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Catalog Site B",
            custom_domain="www.catalog-b.example.test",
            canonical_url="https://www.catalog-b.example.test",
            is_published=True,
        )
        cls.inactive_site = TicketingPublicSiteSettings.objects.create(
            organisation=cls.inactive_org,
            site_title="Inactive Catalog Site",
            custom_domain="inactive-catalog.example.test",
            is_published=True,
        )

        cls.settings_a = TicketingSettings.objects.create(
            organisation=cls.org_a,
            public_brand_name="Catalog Brand A",
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Excursions A",
            slug="excursions-a",
            is_active=True,
        )
        cls.category_a_hidden = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Hidden Category A",
            slug="hidden-category-a",
            is_active=False,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Excursions B",
            slug="excursions-b",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Saona Public A",
            slug="saona-public-a",
            sku="CAT-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            is_featured=True,
            is_recommended=False,
            short_description="Beautiful island experience",
            location="Bayahibe",
            keywords_tags="saona,island",
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_a_recommended = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Buggy Public A",
            slug="buggy-public-a",
            sku="CAT-A2",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            is_featured=False,
            is_recommended=True,
            short_description="Macao buggy adventure",
            location="Macao",
            keywords_tags="buggy,macao",
            adult_price=Decimal("50.00"),
            base_price=Decimal("50.00"),
        )
        cls.product_a_hidden = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Hidden Product A",
            slug="hidden-product-a",
            sku="CAT-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            adult_price=Decimal("80.00"),
            base_price=Decimal("80.00"),
        )
        cls.product_a_inactive = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Inactive Product A",
            slug="inactive-product-a",
            sku="CAT-INACTIVE-A",
            product_type="excursion",
            status="active",
            is_active=False,
            public_enabled=True,
            adult_price=Decimal("70.00"),
            base_price=Decimal("70.00"),
        )
        cls.product_a_draft = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Draft Product A",
            slug="draft-product-a",
            sku="CAT-DRAFT-A",
            product_type="excursion",
            status="draft",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("60.00"),
            base_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Foreign Public Product",
            slug="foreign-public-product",
            sku="CAT-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.primary_alias = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            path="/product/saona-public-a",
            is_primary=True,
            is_active=True,
        )
        cls.legacy_alias = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            path="/old-saona-url",
            is_primary=False,
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def product_list_url(self, organisation=None):
        url = reverse("ticketing-public-products-list")
        if organisation:
            return f"{url}?organisation_slug={organisation.slug}"
        return url

    def category_list_url(self, organisation=None):
        url = reverse("ticketing-public-categories-list")
        if organisation:
            return f"{url}?organisation_slug={organisation.slug}"
        return url

    # ------------------------------------------------------------------
    # URL contracts
    # ------------------------------------------------------------------

    def test_public_catalog_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-public-products-list"),
            "/api/ticketing/public/products/",
        )
        self.assertEqual(
            reverse("ticketing-public-categories-list"),
            "/api/ticketing/public/categories/",
        )
        self.assertEqual(
            reverse("ticketing-public-branding"),
            "/api/ticketing/public/branding/",
        )
        self.assertEqual(
            reverse("ticketing-public-resolve-domain"),
            "/api/ticketing/public/resolve-domain/",
        )
        self.assertEqual(
            reverse("ticketing-public-product-resolve"),
            "/api/ticketing/public/product-resolve/",
        )

    # ------------------------------------------------------------------
    # Public product list / filters
    # ------------------------------------------------------------------

    def test_public_product_list_requires_tenant_resolution(self):
        response = self.client.get(reverse("ticketing-public-products-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_product_list_is_tenant_scoped(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.product_a.pk, ids)
        self.assertIn(self.product_a_recommended.pk, ids)
        self.assertNotIn(self.product_b.pk, ids)

    def test_public_product_list_hides_nonpublic_inactive_and_draft_products(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {"organisation_slug": self.org_a.slug},
        )

        ids = self.ids(response)
        self.assertNotIn(self.product_a_hidden.pk, ids)
        self.assertNotIn(self.product_a_inactive.pk, ids)
        self.assertNotIn(self.product_a_draft.pk, ids)

    def test_public_product_list_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_product_filters_do_not_expand_tenant_scope(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {
                "organisation_slug": self.org_a.slug,
                "product_type": "excursion",
                "search": "Public",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertNotIn(self.product_b.pk, ids)

    def test_public_product_featured_filter(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {
                "organisation_slug": self.org_a.slug,
                "featured": "true",
            },
        )

        self.assertEqual(self.ids(response), {self.product_a.pk})

    def test_public_product_recommended_filter(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {
                "organisation_slug": self.org_a.slug,
                "recommended": "true",
            },
        )

        self.assertEqual(
            self.ids(response),
            {self.product_a_recommended.pk},
        )

    def test_public_product_category_filter_accepts_slug(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {
                "organisation_slug": self.org_a.slug,
                "category": self.category_a.slug,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.product_a.pk, ids)
        self.assertIn(self.product_a_recommended.pk, ids)
        self.assertNotIn(self.product_b.pk, ids)

    def test_public_product_category_filter_accepts_numeric_id(self):
        response = self.client.get(
            reverse("ticketing-public-products-list"),
            {
                "organisation_slug": self.org_a.slug,
                "category": str(self.category_a.pk),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.product_a.pk, ids)
        self.assertIn(self.product_a_recommended.pk, ids)
        self.assertNotIn(self.product_b.pk, ids)

    # ------------------------------------------------------------------
    # Product detail / URL resolution
    # ------------------------------------------------------------------

    def test_public_product_detail_is_tenant_scoped(self):
        listed = self.client.get(
            reverse("ticketing-public-products-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(listed.status_code, status.HTTP_200_OK)
        self.assertIn(
            self.product_a.pk,
            self.ids(listed),
            msg=f"Expected public product in list, got: {listed.data}",
        )

        response = self.client.get(
            reverse(
                "ticketing-public-products-detail",
                args=[self.product_a.slug],
            ),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_200_OK,
            msg=f"Public product detail response was: {getattr(response, 'data', None)}",
        )
        self.assertEqual(response.data["id"], self.product_a.pk)
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_public_product_detail_cannot_resolve_foreign_tenant_slug(self):
        response = self.client.get(
            reverse(
                "ticketing-public-products-detail",
                args=[self.product_b.slug],
            ),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_product_detail_hides_nonpublic_product(self):
        response = self.client.get(
            reverse(
                "ticketing-public-products-detail",
                args=[self.product_a_hidden.slug],
            ),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_product_resolver_finds_primary_public_path(self):
        response = self.client.get(
            reverse("ticketing-public-product-resolve"),
            {
                "organisation_slug": self.org_a.slug,
                "path": "/product/saona-public-a",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.product_a.name, payload)
        self.assertNotIn(self.product_b.name, payload)

    def test_product_resolver_never_crosses_tenants(self):
        response = self.client.get(
            reverse("ticketing-public-product-resolve"),
            {
                "organisation_slug": self.org_a.slug,
                "path": f"/product/{self.product_b.slug}",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_legacy_alias_resolves_to_same_product_or_redirect(self):
        response = self.client.get(
            reverse("ticketing-public-product-resolve"),
            {
                "organisation_slug": self.org_a.slug,
                "path": self.legacy_alias.path,
            },
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_200_OK,
                status.HTTP_301_MOVED_PERMANENTLY,
                status.HTTP_302_FOUND,
                status.HTTP_307_TEMPORARY_REDIRECT,
                status.HTTP_308_PERMANENT_REDIRECT,
            ),
        )
        if hasattr(response, "data"):
            self.assertNotIn(self.product_b.name, str(response.data))

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------

    def test_public_category_list_is_tenant_scoped(self):
        response = self.client.get(
            reverse("ticketing-public-categories-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.category_a.pk, ids)
        self.assertNotIn(self.category_b.pk, ids)

    def test_public_category_list_does_not_expose_inactive_category(self):
        response = self.client.get(
            reverse("ticketing-public-categories-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertNotIn(self.category_a_hidden.pk, self.ids(response))

    def test_public_categories_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("ticketing-public-categories-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    # ------------------------------------------------------------------
    # Branding / domain
    # ------------------------------------------------------------------

    def test_public_branding_is_tenant_scoped(self):
        response = self.client.get(
            reverse("ticketing-public-branding"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["organisation"]["id"],
            self.org_a.pk,
        )
        self.assertEqual(
            response.data["organisation"]["slug"],
            self.org_a.slug,
        )
        self.assertNotIn(self.org_b.name, str(response.data))

    def test_public_branding_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("ticketing-public-branding"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolver_normalizes_scheme_www_path_and_port(self):
        for raw in (
            "https://catalog-a.example.test/path",
            "http://catalog-a.example.test:443",
            "www.catalog-a.example.test",
        ):
            with self.subTest(raw=raw):
                response = self.client.get(
                    reverse("ticketing-public-resolve-domain"),
                    {"domain": raw},
                )
                self.assertEqual(response.status_code, status.HTTP_200_OK)
                self.assertEqual(
                    response.data["organisation_id"],
                    self.org_a.pk,
                )

    def test_domain_resolver_supports_non_www_variant(self):
        response = self.client.get(
            reverse("ticketing-public-resolve-domain"),
            {"domain": "catalog-b.example.test"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["organisation_id"], self.org_b.pk)

    def test_domain_resolver_rejects_unknown_domain(self):
        response = self.client.get(
            reverse("ticketing-public-resolve-domain"),
            {"domain": "unknown.example.test"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolver_rejects_missing_domain(self):
        response = self.client.get(
            reverse("ticketing-public-resolve-domain")
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_domain_resolver_rejects_inactive_organisation(self):
        response = self.client.get(
            reverse("ticketing-public-resolve-domain"),
            {"domain": self.inactive_site.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolver_rejects_unpublished_site(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("ticketing-public-resolve-domain"),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolver_does_not_expose_cross_tenant_catalog_data(self):
        response = self.client.get(
            reverse("ticketing-public-resolve-domain"),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn(self.org_b.email, payload)
