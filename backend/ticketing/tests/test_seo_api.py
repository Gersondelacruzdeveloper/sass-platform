"""Public SEO, sitemap, robots and tenant-resolution API tests.

These tests exercise the public HTTP boundary only. They intentionally verify
that public SEO responses do not expose private infrastructure diagnostics.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from django.utils import timezone
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    BlogPost,
    ExperienceCategory,
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicSEOAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="SEO Organisation A",
            slug="seo-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="SEO Organisation B",
            slug="seo-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.inactive_org = Organisation.objects.create(
            name="SEO Inactive Organisation",
            slug="seo-inactive-org",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="SEO Site A",
            public_description="Public description A",
            custom_domain="www.seo-a.example.test",
            canonical_url="https://www.seo-a.example.test",
            seo_title="SEO title A",
            meta_description="SEO description A",
            is_published=True,
            robots_allow_indexing=True,
            robots_allow_ai_crawlers=True,
            allow_gptbot=True,
            allow_oai_searchbot=True,
            json_ld_local_business={
                "@type": "TravelAgency",
                "name": "SEO Organisation A",
            },
            # Deliberately sensitive operational values. Public endpoints
            # should never expose these.
            domain_error_message="AWS diagnostic SECRET-internal-error",
            aws_acm_certificate_arn=(
                "arn:aws:acm:us-east-1:123456789012:"
                "certificate/private-seo-certificate"
            ),
            aws_acm_validation_record_name="_private-validation.example.test",
            aws_acm_validation_record_value="_private-value.acm-validations.aws",
            cloudfront_distribution_id="EPRIVATE123456",
            cloudfront_domain_name="dprivate.cloudfront.net",
            dns_records_payload=[
                {
                    "purpose": "ssl_validation",
                    "host": "_private-validation.example.test",
                    "value": "_private-value.acm-validations.aws",
                }
            ],
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="SEO Site B",
            custom_domain="seo-b.example.test",
            canonical_url="https://seo-b.example.test",
            seo_title="SEO title B",
            is_published=True,
            robots_allow_indexing=True,
        )
        cls.inactive_site = TicketingPublicSiteSettings.objects.create(
            organisation=cls.inactive_org,
            site_title="Inactive SEO Site",
            custom_domain="inactive-seo.example.test",
            canonical_url="https://inactive-seo.example.test",
            is_published=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Excursions",
            slug="excursions",
            is_active=True,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Foreign Category",
            slug="foreign-category",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Saona SEO",
            slug="saona-seo",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("99.50"),
            base_price=Decimal("99.50"),
            short_description="Public Saona description",
            sku="SEO-SAONA-A",
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Hidden SEO Product",
            slug="hidden-seo-product",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            adult_price=Decimal("50.00"),
            base_price=Decimal("50.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Inactive SEO Product",
            slug="inactive-seo-product",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            adult_price=Decimal("60.00"),
            base_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Foreign SEO Product",
            slug="foreign-seo-product",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Public SEO Blog",
            slug="public-seo-blog",
            status="published",
            is_active=True,
            published_at=timezone.now(),
            robots_allow_indexing=True,
        )
        cls.noindex_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Noindex SEO Blog",
            slug="noindex-seo-blog",
            status="published",
            is_active=True,
            published_at=timezone.now(),
            robots_allow_indexing=False,
        )
        cls.future_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Future SEO Blog",
            slug="future-seo-blog",
            status="scheduled",
            is_active=True,
            published_at=timezone.now() + timezone.timedelta(days=2),
            robots_allow_indexing=True,
        )
        cls.blog_b = BlogPost.objects.create(
            organisation=cls.org_b,
            title="Foreign SEO Blog",
            slug="foreign-seo-blog",
            status="published",
            is_active=True,
            published_at=timezone.now(),
            robots_allow_indexing=True,
        )

    def seo_url(self, organisation=None):
        if organisation:
            return reverse(
                "ticketing-public-seo-by-slug",
                kwargs={"organisation_slug": organisation.slug},
            )
        return reverse("ticketing-public-seo")

    def sitemap_url(self, organisation=None):
        if organisation:
            return reverse(
                "ticketing-public-sitemap-by-slug",
                kwargs={"organisation_slug": organisation.slug},
            )
        return reverse("ticketing-public-sitemap")

    def robots_url(self, organisation=None):
        if organisation:
            return reverse(
                "ticketing-public-robots-by-slug",
                kwargs={"organisation_slug": organisation.slug},
            )
        return reverse("ticketing-public-robots")

    def test_public_seo_url_names_reverse(self):
        self.assertEqual(
            self.seo_url(),
            "/api/ticketing/public/seo/",
        )
        self.assertEqual(
            self.seo_url(self.org_a),
            f"/api/ticketing/public/{self.org_a.slug}/seo/",
        )
        self.assertEqual(
            self.sitemap_url(),
            "/api/ticketing/public/sitemap.xml",
        )
        self.assertEqual(
            self.sitemap_url(self.org_a),
            f"/api/ticketing/public/{self.org_a.slug}/sitemap.xml",
        )
        self.assertEqual(
            self.robots_url(),
            "/api/ticketing/public/robots.txt",
        )
        self.assertEqual(
            self.robots_url(self.org_a),
            f"/api/ticketing/public/{self.org_a.slug}/robots.txt",
        )

    def test_public_seo_requires_tenant_resolution(self):
        response = self.client.get(self.seo_url())
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_seo_rejects_inactive_organisation(self):
        response = self.client.get(self.seo_url(self.inactive_org))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_public_site_is_hidden(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.seo_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_domain_resolution_is_case_insensitive_and_accepts_www_variant(self):
        response = self.client.get(
            self.seo_url(),
            {"domain": "SEO-A.EXAMPLE.TEST"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["site"]["organisation"], self.org_a.pk)

    def test_domain_header_can_resolve_public_tenant(self):
        response = self.client.get(
            self.seo_url(),
            HTTP_X_PUBLIC_DOMAIN="https://www.seo-a.example.test/some/path",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["site"]["organisation"], self.org_a.pk)

    def test_foreign_domain_cannot_change_path_slug_tenant(self):
        response = self.client.get(
            self.seo_url(self.org_a),
            {"domain": self.site_b.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["site"]["organisation"], self.org_a.pk)
        self.assertNotEqual(response.data["site"]["organisation"], self.org_b.pk)

    def test_public_seo_contains_only_public_active_tenant_products(self):
        response = self.client.get(self.seo_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        products = response.data["json_ld"]["products"]
        names = {row["name"] for row in products}

        self.assertIn(self.product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.product_b.name, names)

    def test_public_seo_product_offer_uses_decimal_string(self):
        response = self.client.get(self.seo_url(self.org_a))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        product = next(
            row
            for row in response.data["json_ld"]["products"]
            if row["name"] == self.product_a.name
        )
        self.assertEqual(product["offers"]["price"], "99.50")
        self.assertEqual(product["offers"]["priceCurrency"], "USD")

    def test_public_seo_does_not_expose_infrastructure_or_error_diagnostics(self):
        response = self.client.get(self.seo_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "SECRET-internal-error",
            "arn:aws:acm:",
            "private-seo-certificate",
            "_private-validation.example.test",
            "_private-value.acm-validations.aws",
            "EPRIVATE123456",
            "dprivate.cloudfront.net",
        ):
            self.assertNotIn(secret, payload)

    def test_sitemap_is_public_xml_and_tenant_scoped(self):
        response = self.client.get(self.sitemap_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response["Content-Type"].startswith("application/xml"))
        body = response.content.decode()

        self.assertIn("https://www.seo-a.example.test", body)
        self.assertIn("/product/saona-seo", body)
        self.assertIn("/category/excursions", body)
        self.assertIn("/blog/public-seo-blog/", body)

        self.assertNotIn("hidden-seo-product", body)
        self.assertNotIn("inactive-seo-product", body)
        self.assertNotIn("foreign-seo-product", body)
        self.assertNotIn("foreign-seo-blog", body)
        self.assertNotIn("noindex-seo-blog", body)
        self.assertNotIn("future-seo-blog", body)
        self.assertNotIn("seo-b.example.test", body)

    def test_sitemap_for_unpublished_site_returns_404(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.sitemap_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_sitemap_domain_resolution_cannot_cross_tenants(self):
        response = self.client.get(
            self.sitemap_url(),
            {"domain": self.site_a.custom_domain},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode()
        self.assertIn("seo-a.example.test", body)
        self.assertNotIn("seo-b.example.test", body)

    def test_robots_disallows_all_when_indexing_disabled(self):
        self.site_a.robots_allow_indexing = False
        self.site_a.save(update_fields=["robots_allow_indexing"])

        response = self.client.get(self.robots_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.content.decode(),
            "User-agent: *\nDisallow: /",
        )

    def test_robots_allows_configured_ai_crawlers(self):
        response = self.client.get(self.robots_url(self.org_a))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode()

        self.assertIn("User-agent: *\nAllow: /", body)
        self.assertIn("User-agent: GPTBot\nAllow: /", body)
        self.assertIn("User-agent: OAI-SearchBot\nAllow: /", body)
        self.assertIn(
            "Sitemap: https://www.seo-a.example.test/sitemap.xml",
            body,
        )

    def test_robots_can_block_ai_crawlers_without_blocking_standard_indexing(self):
        self.site_a.robots_allow_ai_crawlers = False
        self.site_a.save(update_fields=["robots_allow_ai_crawlers"])

        response = self.client.get(self.robots_url(self.org_a))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode()

        self.assertIn("User-agent: *\nAllow: /", body)
        self.assertIn("User-agent: GPTBot\nDisallow: /", body)
        self.assertIn("User-agent: OAI-SearchBot\nDisallow: /", body)

    def test_robots_missing_tenant_fails_closed(self):
        response = self.client.get(self.robots_url())

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.content.decode(),
            "User-agent: *\nDisallow: /",
        )

    def test_robots_for_inactive_organisation_does_not_publish_site(self):
        response = self.client.get(self.robots_url(self.inactive_org))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Allow: /", response.content.decode())
