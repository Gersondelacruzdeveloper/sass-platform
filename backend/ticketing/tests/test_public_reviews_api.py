"""Public review/rating surface coverage.

There is currently no dedicated unauthenticated ProductReview endpoint.
The public review surface is:
- aggregate rating/review_count exposed through public products;
- review-derived SEO/JSON-LD;
while the CRUD /reviews/ endpoint must remain authenticated.

These tests cover tenant isolation, review visibility feature flags, private
review endpoint protection, approval/publication boundaries, and customer
privacy.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Organisation, Membership
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Customer,
    ExperienceProduct,
    ProductReview,
    TicketingPublicSiteSettings,
)


class PublicReviewsAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Review Organisation A",
            slug="review-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Review Organisation B",
            slug="review-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Review Site A",
            custom_domain="reviews-a.example.test",
            is_published=True,
            show_reviews=True,
            show_public_rankings=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Review Site B",
            custom_domain="reviews-b.example.test",
            is_published=True,
            show_reviews=True,
            show_public_rankings=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Reviewed Product A",
            slug="reviewed-product-a",
            sku="REVIEW-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
            average_rating=Decimal("4.50"),
            review_count=2,
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Reviewed Product",
            slug="hidden-reviewed-product",
            sku="REVIEW-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            adult_price=Decimal("80.00"),
            base_price=Decimal("80.00"),
            average_rating=Decimal("5.00"),
            review_count=99,
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Reviewed Product",
            slug="foreign-reviewed-product",
            sku="REVIEW-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
            average_rating=Decimal("1.00"),
            review_count=77,
        )

        cls.customer_a = Customer.objects.create(
            organisation=cls.org_a,
            full_name="Private Review Customer",
            whatsapp="+18095550111",
            phone="+18095550222",
            email="private-review@example.test",
            hotel_name="Sensitive Hotel",
            notes="Sensitive internal customer notes",
        )
        cls.customer_b = Customer.objects.create(
            organisation=cls.org_b,
            full_name="Foreign Review Customer",
            email="foreign-review@example.test",
        )

        cls.public_approved_a = ProductReview.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            customer=cls.customer_a,
            customer_name="Public Display Name",
            rating=5,
            title="Excellent trip",
            comment="Wonderful public experience.",
            is_public=True,
            is_approved=True,
        )
        cls.public_approved_a2 = ProductReview.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            customer_name="Another Guest",
            rating=4,
            title="Great day",
            comment="Another approved public review.",
            is_public=True,
            is_approved=True,
        )
        cls.unapproved_a = ProductReview.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            customer=cls.customer_a,
            customer_name="Pending Guest",
            rating=1,
            title="Pending review",
            comment="This must never be publicly rendered yet.",
            is_public=True,
            is_approved=False,
        )
        cls.private_a = ProductReview.objects.create(
            organisation=cls.org_a,
            product=cls.product_a,
            customer=cls.customer_a,
            customer_name="Private Guest",
            rating=1,
            title="Private review",
            comment="This review is explicitly private.",
            is_public=False,
            is_approved=True,
        )
        cls.foreign_b = ProductReview.objects.create(
            organisation=cls.org_b,
            product=cls.product_b,
            customer=cls.customer_b,
            customer_name="Foreign Guest",
            rating=1,
            title="Foreign review",
            comment="Foreign tenant review content.",
            is_public=True,
            is_approved=True,
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="review-owner-a",
            email="review-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        Membership.objects.create(
            organisation=cls.org_a,
            user=cls.owner_a,
            role="owner",
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def public_product_detail_url(self, product):
        return reverse(
            "ticketing-public-products-detail",
            args=[product.slug],
        )

    def test_reviews_crud_endpoint_is_not_public(self):
        response = self.client.get(reverse("ticketing-reviews-list"))

        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
            ),
        )

    def test_reviews_crud_detail_is_not_public(self):
        response = self.client.get(
            reverse(
                "ticketing-reviews-detail",
                args=[self.public_approved_a.pk],
            )
        )

        self.assertIn(
            response.status_code,
            (
                status.HTTP_401_UNAUTHORIZED,
                status.HTTP_403_FORBIDDEN,
            ),
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn(self.customer_a.email, payload)
        self.assertNotIn(self.customer_a.whatsapp, payload)

    def test_private_review_api_is_tenant_scoped_when_authenticated(self):
        self.client.force_authenticate(self.owner_a)

        response = self.client.get(reverse("ticketing-reviews-list"))

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in self.rows(response)}
        self.assertIn(self.public_approved_a.pk, ids)
        self.assertIn(self.unapproved_a.pk, ids)
        self.assertIn(self.private_a.pk, ids)
        self.assertNotIn(self.foreign_b.pk, ids)

    def test_public_product_exposes_rating_aggregates_for_visible_product(self):
        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["average_rating"], "4.50")
        self.assertEqual(response.data["review_count"], 2)

    def test_public_product_rating_aggregates_never_cross_tenants(self):
        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotEqual(response.data["review_count"], self.product_b.review_count)

    def test_hidden_product_cannot_expose_review_aggregates_publicly(self):
        response = self.client.get(
            self.public_product_detail_url(self.hidden_product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_reviewed_product(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_show_reviews_false_hides_public_rating_aggregates(self):
        self.site_a.show_reviews = False
        self.site_a.save(update_fields=["show_reviews"])

        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn("average_rating", response.data)
        self.assertNotIn("review_count", response.data)

    def test_public_product_response_never_exposes_review_customer_contact_data(self):
        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        for secret in (
            self.customer_a.email,
            self.customer_a.whatsapp,
            self.customer_a.phone,
            self.customer_a.notes,
            self.customer_a.hotel_name,
        ):
            with self.subTest(secret=secret):
                self.assertNotIn(secret, payload)

    def test_public_product_response_does_not_embed_private_or_unapproved_review_text(self):
        response = self.client.get(
            self.public_product_detail_url(self.product_a),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(self.private_a.comment, payload)
        self.assertNotIn(self.unapproved_a.comment, payload)

    def test_public_branding_exposes_review_feature_flag_but_not_customer_data(self):
        response = self.client.get(
            reverse("ticketing-public-branding"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["public_site"]["show_reviews"])
        payload = str(response.data)
        self.assertNotIn(self.customer_a.email, payload)
        self.assertNotIn(self.customer_a.whatsapp, payload)

    def test_public_seo_does_not_include_private_or_unapproved_review_text(self):
        response = self.client.get(
            reverse(
                "ticketing-public-seo-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(self.private_a.comment, payload)
        self.assertNotIn(self.unapproved_a.comment, payload)
        self.assertNotIn(self.customer_a.email, payload)

    def test_public_seo_never_includes_foreign_review_content(self):
        response = self.client.get(
            reverse(
                "ticketing-public-seo-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn(self.foreign_b.comment, payload)
        self.assertNotIn(self.customer_b.email, payload)
