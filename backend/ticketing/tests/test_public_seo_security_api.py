"""Public SEO, sitemap, and robots security coverage.

Covers tenant isolation, query-slug/path-slug routes, unpublished/inactive
boundaries, canonical URLs, public-only products/blog posts/categories,
cross-tenant exclusion, robots crawler policy, and strict non-exposure of
infrastructure/provider secrets through the SEO JSON endpoint.
"""

from __future__ import annotations

from datetime import timedelta
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
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
    TicketingWhatsAppSettings,
)


class PublicSEOSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="SEO Organisation A",
            slug="seo-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="SEO Organisation B",
            slug="seo-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_inactive = Organisation.objects.create(
            name="Inactive SEO Organisation",
            slug="seo-inactive",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="SEO Site A",
            custom_domain="seo-a.example.test",
            canonical_url="https://seo-a.example.test",
            is_published=True,
            robots_allow_indexing=True,
            robots_allow_ai_crawlers=True,
            allow_gptbot=True,
            allow_oai_searchbot=True,
            json_ld_local_business={
                "@type": "LocalBusiness",
                "name": "SEO Site A",
            },
            aws_acm_certificate_arn=(
                "arn:aws:acm:us-east-1:111111111111:"
                "certificate/SEO-AWS-PRIVATE"
            ),
            aws_acm_validation_record_value="SEO-DNS-PRIVATE",
            cloudfront_distribution_id="SEO-CLOUDFRONT-PRIVATE",
            cloudfront_domain_name="private.cloudfront.example.test",
            domain_error_message="SEO INTERNAL DOMAIN ERROR",
            dns_records_payload=[
                {
                    "purpose": "ssl_validation",
                    "value": "SEO-DNS-PAYLOAD-PRIVATE",
                }
            ],
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="SEO Site B",
            custom_domain="seo-b.example.test",
            canonical_url="https://seo-b.example.test",
            is_published=True,
            robots_allow_indexing=True,
        )
        cls.site_inactive = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_inactive,
            site_title="Inactive SEO Site",
            custom_domain="seo-inactive.example.test",
            canonical_url="https://seo-inactive.example.test",
            is_published=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Public Category A",
            slug="public-category-a",
            is_active=True,
        )
        cls.category_a_inactive = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Inactive Category A",
            slug="inactive-category-a",
            is_active=False,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Foreign Category B",
            slug="foreign-category-b",
            is_active=True,
        )

        cls.public_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Public SEO Product A",
            slug="public-seo-product-a",
            sku="SEO-PUBLIC-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            short_description="Public product description A",
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
            cost_price=Decimal("61.00"),
            adult_cost_price=Decimal("61.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Hidden SEO Product A",
            slug="hidden-seo-product-a",
            sku="SEO-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("150.00"),
            adult_price=Decimal("150.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Inactive SEO Product A",
            slug="inactive-seo-product-a",
            sku="SEO-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("175.00"),
            adult_price=Decimal("175.00"),
        )
        cls.public_product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Foreign SEO Product B",
            slug="foreign-seo-product-b",
            sku="SEO-FOREIGN-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            short_description="FOREIGN PRODUCT PRIVATE TENANT CONTENT",
            base_price=Decimal("220.00"),
            adult_price=Decimal("220.00"),
        )

        now = timezone.now()
        cls.public_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Public SEO Blog A",
            slug="public-seo-blog-a",
            excerpt="Public excerpt A",
            content="Public blog content A",
            status="published",
            is_active=True,
            published_at=now - timedelta(hours=1),
            robots_allow_indexing=True,
        )
        cls.noindex_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Noindex SEO Blog A",
            slug="noindex-seo-blog-a",
            status="published",
            is_active=True,
            published_at=now - timedelta(hours=1),
            robots_allow_indexing=False,
        )
        cls.draft_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Draft SEO Blog A",
            slug="draft-seo-blog-a",
            status="draft",
            is_active=True,
        )
        cls.future_blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            title="Future SEO Blog A",
            slug="future-seo-blog-a",
            status="scheduled",
            is_active=True,
            published_at=now + timedelta(days=2),
            robots_allow_indexing=True,
        )
        cls.public_blog_b = BlogPost.objects.create(
            organisation=cls.org_b,
            title="Foreign SEO Blog B",
            slug="foreign-seo-blog-b",
            content="FOREIGN BLOG PRIVATE TENANT CONTENT",
            status="published",
            is_active=True,
            published_at=now - timedelta(hours=1),
            robots_allow_indexing=True,
        )

        cls.payment_settings_a = TicketingPaymentProviderSettings.objects.create(
            organisation=cls.org_a,
            stripe_enabled=True,
            stripe_publishable_key="pk_test_SEO_PUBLIC",
            stripe_secret_key="sk_test_SEO_PRIVATE",
            stripe_webhook_secret="whsec_SEO_PRIVATE",
            paypal_enabled=True,
            paypal_client_id="paypal-seo-client",
            paypal_client_secret="paypal-seo-secret-PRIVATE",
            is_active=True,
        )
        cls.whatsapp_a = TicketingWhatsAppSettings.objects.create(
            organisation=cls.org_a,
            is_active=True,
            business_account_id="SEO-WABA",
            phone_number_id="SEO-PHONE",
            access_token="SEO-META-ACCESS-PRIVATE",
            meta_app_secret="SEO-META-APP-PRIVATE",
            webhook_verify_token="SEO-WEBHOOK-VERIFY-PRIVATE",
        )

    def seo_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-seo-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def seo_query_url(self):
        return reverse("ticketing-public-seo")

    def sitemap_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-sitemap-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def robots_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-robots-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def test_public_seo_routes_reverse(self):
        self.assertEqual(
            self.seo_url(),
            f"/api/ticketing/public/{self.org_a.slug}/seo/",
        )
        self.assertEqual(
            self.sitemap_url(),
            f"/api/ticketing/public/{self.org_a.slug}/sitemap.xml",
        )
        self.assertEqual(
            self.robots_url(),
            f"/api/ticketing/public/{self.org_a.slug}/robots.txt",
        )

    def test_seo_query_route_resolves_slug_parameter(self):
        response = self.client.get(
            self.seo_query_url(),
            {"slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["site"]["organisation"],
            self.org_a.pk,
        )

    def test_seo_json_ld_is_tenant_scoped_and_public_products_only(self):
        response = self.client.get(self.seo_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        products = response.data["json_ld"]["products"]
        names = {item["name"] for item in products}

        self.assertIn(self.public_product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.public_product_b.name, names)

        payload = str(response.data)
        self.assertNotIn("FOREIGN PRODUCT PRIVATE TENANT CONTENT", payload)

    def test_seo_product_json_ld_uses_public_url_and_sell_price_only(self):
        response = self.client.get(self.seo_url())

        product = next(
            item
            for item in response.data["json_ld"]["products"]
            if item["name"] == self.public_product_a.name
        )

        self.assertEqual(
            product["url"],
            "https://seo-a.example.test/product/public-seo-product-a",
        )
        self.assertEqual(product["offers"]["price"], "100.00")
        self.assertEqual(product["offers"]["priceCurrency"], "USD")
        payload = str(product)
        self.assertNotIn("61.00", payload)
        self.assertNotIn("cost_price", payload)
        self.assertNotIn("profit_per_unit", payload)

    def test_seo_never_exposes_infrastructure_or_provider_secrets(self):
        response = self.client.get(self.seo_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for secret in (
            "SEO-AWS-PRIVATE",
            "SEO-DNS-PRIVATE",
            "SEO-DNS-PAYLOAD-PRIVATE",
            "SEO-CLOUDFRONT-PRIVATE",
            "private.cloudfront.example.test",
            "SEO INTERNAL DOMAIN ERROR",
            "sk_test_SEO_PRIVATE",
            "whsec_SEO_PRIVATE",
            "paypal-seo-secret-PRIVATE",
            "SEO-META-ACCESS-PRIVATE",
            "SEO-META-APP-PRIVATE",
            "SEO-WEBHOOK-VERIFY-PRIVATE",
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

        site = response.data["site"]
        for field_name in (
            "aws_acm_certificate_arn",
            "aws_acm_certificate_status",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "dns_records_payload",
            "domain_dns_records",
            "domain_error_message",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, site)

    def test_unpublished_site_seo_fails_closed(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.seo_url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_organisation_seo_fails_closed(self):
        response = self.client.get(self.seo_url(self.org_inactive))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_404_NOT_FOUND,
                status.HTTP_400_BAD_REQUEST,
            ),
        )

    def test_sitemap_contains_only_same_tenant_public_products_and_categories(self):
        response = self.client.get(self.sitemap_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        xml = response.content.decode()

        self.assertIn(
            "https://seo-a.example.test/product/public-seo-product-a",
            xml,
        )
        self.assertIn(
            "https://seo-a.example.test/category/public-category-a",
            xml,
        )
        self.assertNotIn(self.hidden_product_a.slug, xml)
        self.assertNotIn(self.inactive_product_a.slug, xml)
        self.assertNotIn(self.category_a_inactive.slug, xml)
        self.assertNotIn(self.public_product_b.slug, xml)
        self.assertNotIn(self.category_b.slug, xml)

    def test_sitemap_contains_only_indexable_published_blog_posts(self):
        response = self.client.get(self.sitemap_url())

        xml = response.content.decode()
        self.assertIn(
            "https://seo-a.example.test/blog/public-seo-blog-a/",
            xml,
        )
        self.assertNotIn(self.noindex_blog_a.slug, xml)
        self.assertNotIn(self.draft_blog_a.slug, xml)
        self.assertNotIn(self.future_blog_a.slug, xml)
        self.assertNotIn(self.public_blog_b.slug, xml)

    def test_sitemap_uses_tenant_canonical_base_and_never_foreign_domain(self):
        response = self.client.get(self.sitemap_url())

        xml = response.content.decode()
        self.assertIn("https://seo-a.example.test", xml)
        self.assertNotIn("https://seo-b.example.test", xml)
        self.assertNotIn("FOREIGN BLOG PRIVATE TENANT CONTENT", xml)

    def test_unpublished_site_sitemap_returns_404(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.sitemap_url())

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(
            self.public_product_a.slug,
            response.content.decode(),
        )

    def test_inactive_organisation_sitemap_fails_closed(self):
        response = self.client.get(self.sitemap_url(self.org_inactive))

        self.assertIn(response.status_code, (400, 404))
        self.assertNotIn(
            "seo-inactive.example.test",
            response.content.decode(),
        )

    def test_robots_allows_indexing_and_declares_canonical_sitemap(self):
        response = self.client.get(self.robots_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.content.decode()
        self.assertIn("User-agent: *", body)
        self.assertIn("Allow: /", body)
        self.assertIn(
            "Sitemap: https://seo-a.example.test/sitemap.xml",
            body,
        )
        self.assertIn("User-agent: GPTBot", body)
        self.assertIn("User-agent: OAI-SearchBot", body)

    def test_robots_ai_crawler_policy_can_disallow_ai_only(self):
        self.site_a.robots_allow_ai_crawlers = False
        self.site_a.save(update_fields=["robots_allow_ai_crawlers"])

        response = self.client.get(self.robots_url())

        body = response.content.decode()
        self.assertIn("User-agent: *\nAllow: /", body)
        self.assertIn("User-agent: GPTBot\nDisallow: /", body)
        self.assertIn("User-agent: OAI-SearchBot\nDisallow: /", body)

    def test_robots_indexing_disabled_fails_closed(self):
        self.site_a.robots_allow_indexing = False
        self.site_a.save(update_fields=["robots_allow_indexing"])

        response = self.client.get(self.robots_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.content.decode(),
            "User-agent: *\nDisallow: /",
        )

    def test_unpublished_site_robots_disallows_everything(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(self.robots_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.content.decode(),
            "User-agent: *\nDisallow: /",
        )
        self.assertNotIn("Sitemap:", response.content.decode())

    def test_inactive_organisation_robots_fails_closed(self):
        response = self.client.get(self.robots_url(self.org_inactive))

        self.assertIn(response.status_code, (200, 400, 404))

        if response.status_code == status.HTTP_200_OK:
            body = response.content.decode()
            self.assertIn("Disallow: /", body)
            self.assertNotIn(
                "seo-inactive.example.test/sitemap.xml",
                body,
            )
        else:
            payload = response.content.decode()
            self.assertNotIn(
                "seo-inactive.example.test/sitemap.xml",
                payload,
            )

    def test_seo_response_never_contains_cross_tenant_content(self):
        response = self.client.get(self.seo_url())

        payload = str(response.data)
        for foreign_value in (
            self.org_b.name,
            self.org_b.slug,
            self.site_b.custom_domain,
            self.public_product_b.name,
            self.public_blog_b.title,
            "FOREIGN PRODUCT PRIVATE TENANT CONTENT",
            "FOREIGN BLOG PRIVATE TENANT CONTENT",
        ):
            with self.subTest(foreign_value=foreign_value):
                self.assertNotIn(foreign_value, payload)
