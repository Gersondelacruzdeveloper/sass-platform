"""Public blog security coverage.

Covers tenant isolation, published/draft/scheduled visibility, category
scoping, slug collisions between tenants, unpublished-site boundaries,
search/filter behavior, view-count updates, SEO/public fields, related-product
safety, and non-exposure of administrative/internal fields.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    BlogCategory,
    BlogPost,
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicBlogSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Blog Organisation A",
            slug="blog-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Blog Organisation B",
            slug="blog-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Blog Site A",
            custom_domain="blog-a.example.test",
            canonical_url="https://blog-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Blog Site B",
            custom_domain="blog-b.example.test",
            canonical_url="https://blog-b.example.test",
            is_published=True,
        )

        cls.category_a = BlogCategory.objects.create(
            organisation=cls.org_a,
            name="Travel Tips",
            slug="travel-tips",
            description="Public category A",
            seo_title="Travel Tips SEO",
            meta_description="Travel tips meta",
            is_active=True,
        )
        cls.category_a_inactive = BlogCategory.objects.create(
            organisation=cls.org_a,
            name="Inactive Category",
            slug="inactive-category",
            description="Inactive category content",
            is_active=False,
        )
        cls.category_b = BlogCategory.objects.create(
            organisation=cls.org_b,
            name="Foreign Travel Tips",
            slug="travel-tips",
            description="FOREIGN CATEGORY CONTENT",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Related Product A",
            slug="related-product-a",
            sku="BLOG-PROD-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Related Product B",
            slug="foreign-related-product-b",
            sku="BLOG-PROD-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
        )

        User = get_user_model()
        cls.author_a = User.objects.create_user(
            username="blog-author-a",
            email="private-author-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.author_b = User.objects.create_user(
            username="blog-author-b",
            email="private-author-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )

        now = timezone.now()

        cls.public_post_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            author=cls.author_a,
            author_name="Public Author A",
            title="Public Blog Post",
            slug="shared-blog-slug",
            excerpt="Public excerpt A",
            content="Public content A about beaches.",
            status="published",
            is_active=True,
            is_featured=True,
            published_at=now - timedelta(hours=2),
            seo_title="Public Blog SEO Title",
            meta_description="Public blog meta description",
            canonical_url="https://blog-a.example.test/blog/shared-blog-slug/",
            og_title="Public OG Title",
            og_description="Public OG Description",
            twitter_title="Public Twitter Title",
            twitter_description="Public Twitter Description",
            keywords_tags=["beach", "travel"],
            json_ld_override={"@type": "Article"},
            robots_allow_indexing=True,
        )
        cls.public_post_a.related_products.add(cls.product_a)

        cls.draft_post_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Draft Blog Post",
            slug="draft-blog-post",
            excerpt="DRAFT PRIVATE EXCERPT",
            content="DRAFT PRIVATE CONTENT",
            status="draft",
            is_active=True,
            published_at=None,
        )

        cls.future_post_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Future Scheduled Blog Post",
            slug="future-blog-post",
            excerpt="FUTURE PRIVATE EXCERPT",
            content="FUTURE PRIVATE CONTENT",
            status="scheduled",
            is_active=True,
            published_at=now + timedelta(days=2),
        )

        cls.past_scheduled_post_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Past Scheduled Blog Post",
            slug="past-scheduled-blog-post",
            excerpt="Past scheduled public excerpt",
            content="Past scheduled public content",
            status="scheduled",
            is_active=True,
            published_at=now - timedelta(minutes=30),
        )

        cls.inactive_post_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Inactive Blog Post",
            slug="inactive-blog-post",
            excerpt="INACTIVE PRIVATE EXCERPT",
            content="INACTIVE PRIVATE CONTENT",
            status="published",
            is_active=False,
            published_at=now - timedelta(hours=1),
        )

        cls.public_post_b = BlogPost.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            author=cls.author_b,
            author_name="Foreign Public Author B",
            title="Foreign Public Blog Post",
            slug="shared-blog-slug",
            excerpt="FOREIGN BLOG EXCERPT",
            content="FOREIGN BLOG PRIVATE TENANT CONTENT",
            status="published",
            is_active=True,
            published_at=now - timedelta(hours=1),
        )
        cls.public_post_b.related_products.add(cls.product_b)

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def list_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-blog-list",
            kwargs={"organisation_slug": organisation.slug},
        )

    def detail_url(self, post=None, organisation=None):
        post = post or self.public_post_a
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-blog-detail",
            kwargs={
                "organisation_slug": organisation.slug,
                "slug": post.slug,
            },
        )

    def categories_url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-blog-categories",
            kwargs={"organisation_slug": organisation.slug},
        )

    def test_public_blog_routes_reverse(self):
        self.assertEqual(
            self.list_url(),
            f"/api/ticketing/public/{self.org_a.slug}/blog/",
        )
        self.assertEqual(
            self.detail_url(),
            (
                f"/api/ticketing/public/{self.org_a.slug}/blog/"
                f"{self.public_post_a.slug}/"
            ),
        )
        self.assertEqual(
            self.categories_url(),
            f"/api/ticketing/public/{self.org_a.slug}/blog-categories/",
        )

    def test_public_blog_list_is_tenant_scoped(self):
        response = self.client.get(self.list_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        titles = {row["title"] for row in rows}

        self.assertIn(self.public_post_a.title, titles)
        self.assertIn(self.past_scheduled_post_a.title, titles)
        self.assertNotIn(self.public_post_b.title, titles)

        payload = str(response.data)
        self.assertNotIn("FOREIGN BLOG PRIVATE TENANT CONTENT", payload)

    def test_draft_future_and_inactive_posts_are_not_public(self):
        response = self.client.get(self.list_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for private_value in (
            self.draft_post_a.title,
            "DRAFT PRIVATE CONTENT",
            self.future_post_a.title,
            "FUTURE PRIVATE CONTENT",
            self.inactive_post_a.title,
            "INACTIVE PRIVATE CONTENT",
        ):
            with self.subTest(private_value=private_value):
                self.assertNotIn(private_value, payload)

    def test_past_scheduled_post_is_public(self):
        response = self.client.get(self.list_url())

        titles = {row["title"] for row in self.rows(response)}
        self.assertIn(self.past_scheduled_post_a.title, titles)

    def test_same_slug_in_different_tenants_resolves_exact_tenant_post(self):
        response_a = self.client.get(
            self.detail_url(
                post=self.public_post_a,
                organisation=self.org_a,
            )
        )
        response_b = self.client.get(
            self.detail_url(
                post=self.public_post_b,
                organisation=self.org_b,
            )
        )

        self.assertEqual(response_a.status_code, status.HTTP_200_OK)
        self.assertEqual(response_b.status_code, status.HTTP_200_OK)
        self.assertEqual(response_a.data["title"], self.public_post_a.title)
        self.assertEqual(response_b.data["title"], self.public_post_b.title)

    def test_foreign_slug_cannot_be_borrowed_by_other_tenant(self):
        foreign_only = BlogPost.objects.create(
            organisation=self.org_b,
            category=self.category_b,
            title="Foreign Only Post",
            slug="foreign-only-post",
            content="FOREIGN ONLY PRIVATE CONTENT",
            status="published",
            is_active=True,
            published_at=timezone.now() - timedelta(minutes=10),
        )

        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": foreign_only.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("FOREIGN ONLY PRIVATE CONTENT", str(response.data))

    def test_draft_detail_returns_404(self):
        response = self.client.get(
            self.detail_url(post=self.draft_post_a)
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_future_scheduled_detail_returns_404(self):
        response = self.client.get(
            self.detail_url(post=self.future_post_a)
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_blog_list_detail_and_categories(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(self.list_url())
        detail_response = self.client.get(self.detail_url())
        category_response = self.client.get(self.categories_url())

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(category_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(category_response), [])

    def test_categories_are_active_and_tenant_scoped(self):
        response = self.client.get(self.categories_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        slugs = {row["slug"] for row in rows}

        self.assertIn(self.category_a.slug, slugs)
        self.assertNotIn(self.category_a_inactive.slug, slugs)

        payload = str(response.data)
        self.assertNotIn("FOREIGN CATEGORY CONTENT", payload)

    def test_category_filter_accepts_slug_and_does_not_cross_tenants(self):
        response = self.client.get(
            self.list_url(),
            {"category": self.category_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertTrue(rows)
        self.assertTrue(
            all(
                row["category"]["slug"] == self.category_a.slug
                for row in rows
            )
        )
        self.assertNotIn(self.public_post_b.title, str(response.data))

    def test_featured_filter_only_returns_featured_posts(self):
        response = self.client.get(
            self.list_url(),
            {"featured": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertTrue(rows)
        self.assertTrue(
            all(row["is_featured"] for row in rows)
        )

    def test_search_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            {"search": "beaches"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = {row["title"] for row in self.rows(response)}
        self.assertIn(self.public_post_a.title, titles)
        self.assertNotIn(self.public_post_b.title, titles)

    def test_list_serializer_does_not_expose_full_content_or_internal_fields(self):
        response = self.client.get(self.list_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        row = next(
            row
            for row in self.rows(response)
            if row["slug"] == self.public_post_a.slug
        )

        for field_name in (
            "content",
            "organisation",
            "author",
            "author_email",
            "translations",
            "created_at",
            "status",
            "is_active",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, row)

    def test_detail_exposes_public_seo_fields_but_not_admin_identity(self):
        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["seo_title"], "Public Blog SEO Title")
        self.assertEqual(
            response.data["meta_description"],
            "Public blog meta description",
        )
        self.assertEqual(
            response.data["canonical_url"],
            "https://blog-a.example.test/blog/shared-blog-slug/",
        )
        self.assertEqual(response.data["author_name"], "Public Author A")

        payload = str(response.data)
        self.assertNotIn("private-author-a@example.test", payload)
        self.assertNotIn("blog-author-a", payload)

        for internal_field in (
            "organisation",
            "author",
            "author_id",
            "created_at",
            "status",
            "is_active",
            "translations",
        ):
            with self.subTest(internal_field=internal_field):
                self.assertNotIn(internal_field, response.data)

    def test_detail_related_products_never_cross_tenants_or_expose_costs(self):
        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        related = response.data["related_products"]
        self.assertEqual(len(related), 1)
        self.assertEqual(related[0]["id"], self.product_a.pk)

        payload = str(related)
        self.assertNotIn(self.product_b.name, payload)

        for forbidden in (
            "cost_price",
            "adult_cost_price",
            "profit_per_unit",
            "seller_margin_percent",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_detail_view_count_increments_once_per_request(self):
        before = self.public_post_a.view_count

        response = self.client.get(self.detail_url())

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.public_post_a.refresh_from_db()
        self.assertEqual(self.public_post_a.view_count, before + 1)
        self.assertEqual(response.data["view_count"], before + 1)

    def test_public_blog_is_read_only(self):
        post_response = self.client.post(
            self.list_url(),
            {
                "title": "Anonymous Write Attempt",
                "slug": "anonymous-write-attempt",
                "content": "Must not be created.",
            },
            format="json",
        )
        delete_response = self.client.delete(self.detail_url())

        self.assertEqual(
            post_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            delete_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertFalse(
            BlogPost.objects.filter(
                organisation=self.org_a,
                slug="anonymous-write-attempt",
            ).exists()
        )
