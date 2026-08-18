"""Public blog API coverage for ticketing.

Covers published/scheduled visibility, tenant isolation, category/search/
featured/ordering filters, detail view counts, related products, and unpublished
site behavior. No external providers are contacted.
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


class PublicBlogAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Public Blog Organisation A",
            slug="public-blog-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Public Blog Organisation B",
            slug="public-blog-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Blog Site A",
            custom_domain="blog-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Blog Site B",
            custom_domain="blog-b.example.test",
            is_published=True,
        )

        cls.category_a = BlogCategory.objects.create(
            organisation=cls.org_a,
            name="Travel Tips",
            slug="travel-tips",
            is_active=True,
        )
        cls.category_a_hidden = BlogCategory.objects.create(
            organisation=cls.org_a,
            name="Hidden Category",
            slug="hidden-category",
            is_active=False,
        )
        cls.category_b = BlogCategory.objects.create(
            organisation=cls.org_b,
            name="Foreign Category",
            slug="foreign-category",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Blog Related Product A",
            slug="blog-related-a",
            sku="BLOG-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Related Product",
            slug="foreign-related-product",
            sku="BLOG-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        User = get_user_model()
        cls.author_a = User.objects.create_user(
            username="public-blog-author-a",
            email="public-blog-author-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
            first_name="Blog",
            last_name="Author",
        )
        cls.author_b = User.objects.create_user(
            username="public-blog-author-b",
            email="public-blog-author-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )

        now = timezone.now()

        cls.published_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            author=cls.author_a,
            title="Published Blog A",
            slug="published-blog-a",
            excerpt="Public travel guide.",
            content="<p>Helpful travel content for Punta Cana visitors.</p>",
            status="published",
            is_active=True,
            is_featured=True,
            published_at=now - timedelta(days=2),
            seo_title="Published SEO",
        )
        cls.published_a.related_products.add(cls.product_a)

        cls.published_a2 = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            author_name="Guest Writer",
            title="Second Published Blog A",
            slug="second-published-blog-a",
            excerpt="Another useful public article.",
            content="<p>More useful content and recommendations.</p>",
            status="published",
            is_active=True,
            is_featured=False,
            published_at=now - timedelta(days=1),
        )

        cls.scheduled_past = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Scheduled Now Visible",
            slug="scheduled-visible",
            excerpt="Scheduled and already due.",
            content="<p>Visible scheduled article.</p>",
            status="scheduled",
            is_active=True,
            published_at=now - timedelta(hours=1),
        )

        cls.scheduled_future = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Future Scheduled",
            slug="future-scheduled",
            excerpt="Not yet public.",
            content="<p>Future article.</p>",
            status="scheduled",
            is_active=True,
            published_at=now + timedelta(days=2),
        )

        cls.draft_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Draft Blog A",
            slug="draft-blog-a",
            excerpt="Draft only.",
            content="<p>Draft content.</p>",
            status="draft",
            is_active=True,
            published_at=now - timedelta(days=3),
        )

        cls.inactive_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            title="Inactive Blog A",
            slug="inactive-blog-a",
            excerpt="Inactive.",
            content="<p>Inactive content.</p>",
            status="published",
            is_active=False,
            published_at=now - timedelta(days=3),
        )

        cls.foreign_b = BlogPost.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            author=cls.author_b,
            title="Foreign Blog B",
            slug="foreign-blog-b",
            excerpt="Foreign private article.",
            content="<p>Foreign content.</p>",
            status="published",
            is_active=True,
            published_at=now - timedelta(days=1),
        )
        cls.foreign_b.related_products.add(cls.product_b)

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def test_public_blog_url_names_reverse(self):
        self.assertEqual(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            f"/api/ticketing/public/{self.org_a.slug}/blog/",
        )
        self.assertEqual(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.published_a.slug,
                },
            ),
            (
                f"/api/ticketing/public/{self.org_a.slug}/blog/"
                f"{self.published_a.slug}/"
            ),
        )
        self.assertEqual(
            reverse(
                "ticketing-public-blog-categories",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            f"/api/ticketing/public/{self.org_a.slug}/blog-categories/",
        )

    def test_public_blog_list_is_tenant_scoped(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.published_a.pk, ids)
        self.assertIn(self.published_a2.pk, ids)
        self.assertIn(self.scheduled_past.pk, ids)
        self.assertNotIn(self.foreign_b.pk, ids)

    def test_public_blog_list_hides_draft_inactive_and_future_scheduled(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        ids = self.ids(response)
        self.assertNotIn(self.draft_a.pk, ids)
        self.assertNotIn(self.inactive_a.pk, ids)
        self.assertNotIn(self.scheduled_future.pk, ids)

    def test_public_blog_list_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_blog_category_filter_accepts_slug(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"category": self.category_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.published_a.pk, ids)
        self.assertIn(self.published_a2.pk, ids)
        self.assertNotIn(self.foreign_b.pk, ids)

    def test_public_blog_featured_filter(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"featured": "true"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response), {self.published_a.pk})

    def test_public_blog_search_is_tenant_scoped(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"search": "Foreign"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(self.foreign_b.pk, self.ids(response))
        self.assertNotIn("Foreign Blog B", str(response.data))

    def test_public_blog_ordering_title(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {"ordering": "title"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        titles = [row["title"] for row in self.rows(response)]
        self.assertEqual(titles, sorted(titles))

    def test_public_blog_detail_returns_full_content_and_related_products(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.published_a.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.published_a.pk)
        self.assertIn("Helpful travel content", response.data["content"])
        related_ids = {
            product["id"] for product in response.data["related_products"]
        }
        self.assertIn(self.product_a.pk, related_ids)
        self.assertNotIn(self.product_b.pk, related_ids)

    def test_public_blog_detail_increments_view_count(self):
        before = self.published_a.view_count

        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.published_a.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.published_a.refresh_from_db()
        self.assertEqual(self.published_a.view_count, before + 1)
        self.assertEqual(response.data["view_count"], before + 1)

    def test_public_blog_detail_hides_foreign_tenant_post(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.foreign_b.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn("Foreign content", str(getattr(response, "data", "")))

    def test_public_blog_detail_hides_future_scheduled_post(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.scheduled_future.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_blog_detail_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.published_a.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_blog_categories_are_tenant_scoped(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-categories",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.category_a.pk, ids)
        self.assertNotIn(self.category_b.pk, ids)
        self.assertNotIn(self.category_a_hidden.pk, ids)

    def test_public_blog_categories_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse(
                "ticketing-public-blog-categories",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_blog_list_author_name_resolution(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-list",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        rows = {
            row["id"]: row
            for row in self.rows(response)
        }
        self.assertEqual(
            rows[self.published_a.pk]["author_name"],
            "Blog Author",
        )
        self.assertEqual(
            rows[self.published_a2.pk]["author_name"],
            "Guest Writer",
        )

    def test_public_blog_reading_time_is_positive(self):
        response = self.client.get(
            reverse(
                "ticketing-public-blog-detail",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "slug": self.published_a.slug,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data["reading_time_minutes"], 1)
