"""Public product resolver, redirects, and URL alias security coverage.

Covers canonical path resolution, active/inactive aliases, redirect types,
legacy paths, tenant isolation, unpublished/inactive product boundaries,
cross-tenant alias protection, alias hit tracking, malformed paths, and
seller-offer token tenant/product binding.

No external provider calls are made.
"""

from __future__ import annotations

from decimal import Decimal

from ticketing.views import _build_seller_offer_token
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceProduct,
    ProductURLAlias,
    Seller,
    TicketingPublicSiteSettings,
)


class PublicRedirectsAndURLAliasesAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="URL Alias Organisation A",
            slug="url-alias-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="URL Alias Organisation B",
            slug="url-alias-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Alias Site A",
            custom_domain="alias-a.example.test",
            canonical_url="https://alias-a.example.test",
            product_url_pattern="/product/{slug}",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Alias Site B",
            custom_domain="alias-b.example.test",
            canonical_url="https://alias-b.example.test",
            product_url_pattern="/product/{slug}",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Alias Product A",
            slug="alias-product-a",
            sku="ALIAS-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Alias Product A",
            slug="hidden-alias-product-a",
            sku="ALIAS-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("150.00"),
            adult_price=Decimal("150.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Alias Product A",
            slug="inactive-alias-product-a",
            sku="ALIAS-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("175.00"),
            adult_price=Decimal("175.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Alias Product B",
            slug="foreign-alias-product-b",
            sku="ALIAS-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("220.00"),
            adult_price=Decimal("220.00"),
        )

        cls.alias_redirect = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            path="/excursions/detail/alias-product-a",
            is_primary=False,
            is_active=True,
            redirect_to_primary=True,
            redirect_type=301,
            source="legacy",
        )
        cls.alias_no_redirect = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            path="/legacy/alias-product-a",
            is_primary=False,
            is_active=True,
            redirect_to_primary=False,
            redirect_type=302,
            source="manual",
        )
        cls.inactive_alias = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            path="/old/inactive-alias-product-a",
            is_primary=False,
            is_active=False,
            redirect_to_primary=True,
            redirect_type=301,
            source="manual",
        )
        cls.foreign_alias = ProductURLAlias.objects.create(
            organisation=cls.org_b,
            product=cls.product_b,
            path="/excursions/detail/foreign-alias-product-b",
            is_primary=False,
            is_active=True,
            redirect_to_primary=True,
            redirect_type=301,
            source="legacy",
        )

        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            full_name="Alias Seller A",
            seller_slug="alias-seller-a",
            application_status="approved",
            is_active=True,
            can_create_bookings=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            full_name="Alias Seller B",
            seller_slug="alias-seller-b",
            application_status="approved",
            is_active=True,
            can_create_bookings=True,
        )

    def resolve_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-product-resolve-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def query_resolve_url(self):
        return reverse("ticketing-public-product-resolve")

    def test_product_resolve_routes_reverse(self):
        self.assertEqual(
            self.resolve_url(),
            f"/api/ticketing/public/{self.org_a.slug}/product-resolve/",
        )
        self.assertEqual(
            self.query_resolve_url(),
            "/api/ticketing/public/product-resolve/",
        )

    def test_canonical_product_path_resolves_without_redirect(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": f"/product/{self.product_a.slug}"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])
        self.assertEqual(response.data["product"]["id"], self.product_a.pk)
        self.assertEqual(
            response.data["canonical_path"],
            f"/product/{self.product_a.slug}",
        )
        self.assertEqual(
            response.data["canonical_url"],
            f"https://alias-a.example.test/product/{self.product_a.slug}",
        )
        self.assertFalse(response.data["offer_valid"])

    def test_query_route_resolves_tenant_by_slug_parameter(self):
        response = self.client.get(
            self.query_resolve_url(),
            {
                "slug": self.org_a.slug,
                "path": f"/product/{self.product_a.slug}",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["product"]["id"], self.product_a.pk)

    def test_active_alias_reports_canonical_redirect_in_resolver_payload(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": self.alias_redirect.path},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])
        self.assertTrue(response.data["should_redirect"])
        self.assertEqual(
            response.data["redirect_path"],
            f"/product/{self.product_a.slug}",
        )
        self.assertEqual(response.data["redirect_type"], 301)
        self.assertEqual(
            response.data["resolved_by"],
            "alias_redirect",
        )

        self.alias_redirect.refresh_from_db()
        self.assertEqual(self.alias_redirect.hit_count, 1)
        self.assertIsNotNone(self.alias_redirect.last_hit_at)

    def test_alias_with_redirect_disabled_resolves_product_in_place(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": self.alias_no_redirect.path},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["product"]["id"], self.product_a.pk)
        self.assertEqual(
            response.data["canonical_path"],
            f"/product/{self.product_a.slug}",
        )

        self.alias_no_redirect.refresh_from_db()
        self.assertEqual(self.alias_no_redirect.hit_count, 1)

    def test_inactive_alias_does_not_resolve(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": self.inactive_alias.path},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.inactive_alias.refresh_from_db()
        self.assertEqual(self.inactive_alias.hit_count, 0)

    def test_alias_cannot_resolve_foreign_tenant_product(self):
        response = self.client.get(
            self.resolve_url(self.org_a),
            {"path": self.foreign_alias.path},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn(self.org_b.slug, payload)

    def test_hidden_product_does_not_resolve_by_slug(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": f"/product/{self.hidden_product_a.slug}"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_product_does_not_resolve_by_slug(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": f"/product/{self.inactive_product_a.slug}"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_blocks_product_resolution(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.resolve_url(),
            {"path": f"/product/{self.product_a.slug}"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.product_a.name, str(response.data))

    def test_path_normalization_accepts_full_url_without_crossing_tenant(self):
        response = self.client.get(
            self.resolve_url(),
            {
                "url": (
                    "https://another-host.example.test/"
                    f"product/{self.product_a.slug}?utm_source=test"
                )
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["product"]["id"], self.product_a.pk)
        self.assertNotIn(self.product_b.name, str(response.data))

    def test_unknown_path_fails_closed(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": "/product/does-not-exist"},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(response.data["found"])

    def test_alias_path_is_normalized_on_save(self):
        alias = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path=(
                "https://legacy.example.test/"
                "excursions/detail/normalised-alias/?foo=bar#fragment"
            ),
            is_active=True,
            redirect_to_primary=True,
            source="import",
        )

        self.assertEqual(
            alias.path,
            "/excursions/detail/normalised-alias",
        )

    def test_same_alias_path_may_exist_in_different_tenants(self):
        path = "/legacy/shared-path"
        ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path=path,
            is_active=True,
            redirect_to_primary=False,
        )
        ProductURLAlias.objects.create(
            organisation=self.org_b,
            product=self.product_b,
            path=path,
            is_active=True,
            redirect_to_primary=False,
        )

        response_a = self.client.get(
            self.resolve_url(self.org_a),
            {"path": path},
        )
        response_b = self.client.get(
            self.resolve_url(self.org_b),
            {"path": path},
        )

        self.assertEqual(response_a.status_code, status.HTTP_200_OK)
        self.assertEqual(response_b.status_code, status.HTTP_200_OK)
        self.assertEqual(response_a.data["product"]["id"], self.product_a.pk)
        self.assertEqual(response_b.data["product"]["id"], self.product_b.pk)

    def test_alias_cannot_point_to_hidden_product_publicly(self):
        alias = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.hidden_product_a,
            path="/legacy/hidden-product",
            is_active=True,
            redirect_to_primary=False,
        )

        response = self.client.get(
            self.resolve_url(),
            {"path": alias.path},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_offer_token_is_rejected_without_product_leakage(self):
        response = self.client.get(
            self.resolve_url(),
            {
                "path": f"/product/{self.product_a.slug}",
                "offer_token": "invalid-signed-token",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["offer_valid"])
        self.assertNotIn("cost_price", str(response.data))

    def test_offer_token_is_tenant_bound(self):
        token = _build_seller_offer_token(
            organisation=self.org_b,
            seller=self.seller_b,
            product=self.product_a,
            discount_percent=Decimal("0.00"),
            unit_price="100.00",
            quantity=1,
            original_price="100.00",
            customer_final_price="100.00",
            customer_discount_amount="0.00",
            seller_allowance_amount="0.00",
            seller_commission_amount="0.00",
            owner_net_amount="100.00",
        )

        response = self.client.get(
            self.resolve_url(self.org_a),
            {
                "path": f"/product/{self.product_a.slug}",
                "offer_token": token,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["offer_valid"])
        self.assertIn(
            "does not belong to this organisation",
            response.data["detail"],
        )

    def test_offer_token_is_product_bound(self):
        token = _build_seller_offer_token(
            organisation=self.org_a,
            seller=self.seller_a,
            product=self.hidden_product_a,
            discount_percent=Decimal("0.00"),
            unit_price="100.00",
            quantity=1,
            original_price="100.00",
            customer_final_price="100.00",
            customer_discount_amount="0.00",
            seller_allowance_amount="0.00",
            seller_commission_amount="0.00",
            owner_net_amount="100.00",
        )

        response = self.client.get(
            self.resolve_url(self.org_a),
            {
                "path": f"/product/{self.product_a.slug}",
                "offer_token": token,
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(response.data["offer_valid"])
        self.assertIn(
            "does not belong to this product",
            response.data["detail"],
        )

    def test_public_resolver_response_does_not_expose_cost_or_internal_alias_data(self):
        response = self.client.get(
            self.resolve_url(),
            {"path": f"/product/{self.product_a.slug}"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        for internal_field in (
            "cost_price",
            "adult_cost_price",
            "child_cost_price",
            "infant_cost_price",
            "profit_per_unit",
            "hit_count",
            "last_hit_at",
            "notes",
            "original_full_url",
        ):
            with self.subTest(internal_field=internal_field):
                self.assertNotIn(internal_field, payload)
