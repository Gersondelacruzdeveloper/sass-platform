"""Public product gallery security coverage.

The public contract exposes ProductGalleryImage rows nested on public products.
This suite covers tenant isolation, inactive gallery images, hidden/inactive
products, unpublished sites, sort/cover behavior, public alt/caption metadata,
read-only behavior, and non-exposure of product/admin linkage.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceProduct,
    ProductGalleryImage,
    TicketingPublicSiteSettings,
)


class PublicGallerySecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Gallery Organisation A",
            slug="gallery-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Gallery Organisation B",
            slug="gallery-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Gallery Site A",
            custom_domain="gallery-a.example.test",
            canonical_url="https://gallery-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Gallery Site B",
            custom_domain="gallery-b.example.test",
            canonical_url="https://gallery-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Gallery Product A",
            slug="gallery-product-a",
            sku="GALLERY-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Gallery Product A",
            slug="hidden-gallery-product-a",
            sku="GALLERY-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("110.00"),
            adult_price=Decimal("110.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Gallery Product A",
            slug="inactive-gallery-product-a",
            sku="GALLERY-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Gallery Product B",
            slug="foreign-gallery-product-b",
            sku="GALLERY-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
        )

        cls.cover_a = ProductGalleryImage.objects.create(
            product=cls.product_a,
            image="products/gallery-a-cover.jpg",
            alt_text="Cover image A",
            caption="Public cover caption A",
            sort_order=1,
            is_cover=True,
            is_active=True,
        )
        cls.gallery_a_2 = ProductGalleryImage.objects.create(
            product=cls.product_a,
            image="products/gallery-a-second.jpg",
            alt_text="Second image A",
            caption="Public second caption A",
            sort_order=2,
            is_cover=False,
            is_active=True,
        )
        cls.inactive_gallery_a = ProductGalleryImage.objects.create(
            product=cls.product_a,
            image="products/gallery-a-inactive.jpg",
            alt_text="INACTIVE PRIVATE ALT",
            caption="INACTIVE PRIVATE CAPTION",
            sort_order=3,
            is_cover=False,
            is_active=False,
        )
        cls.foreign_gallery_b = ProductGalleryImage.objects.create(
            product=cls.product_b,
            image="products/gallery-b.jpg",
            alt_text="FOREIGN PRIVATE ALT",
            caption="FOREIGN PRIVATE CAPTION",
            sort_order=1,
            is_cover=True,
            is_active=True,
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
        self.assertNotIn("FOREIGN PRIVATE ALT", payload)
        self.assertNotIn("FOREIGN PRIVATE CAPTION", payload)

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

    def test_unpublished_site_hides_product_gallery(self):
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

    def test_public_gallery_exposes_active_images_only(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        gallery = response.data["gallery_images"]

        self.assertEqual(
            [image["alt_text"] for image in gallery],
            ["Cover image A", "Second image A"],
        )
        self.assertNotIn("INACTIVE PRIVATE ALT", str(response.data))
        self.assertNotIn("INACTIVE PRIVATE CAPTION", str(response.data))

    def test_public_gallery_preserves_sort_order_and_cover_flag(self):
        response = self.get_product_detail()

        gallery = response.data["gallery_images"]
        self.assertEqual(len(gallery), 2)

        self.assertEqual(gallery[0]["sort_order"], 1)
        self.assertTrue(gallery[0]["is_cover"])
        self.assertEqual(gallery[0]["alt_text"], "Cover image A")

        self.assertEqual(gallery[1]["sort_order"], 2)
        self.assertFalse(gallery[1]["is_cover"])
        self.assertEqual(gallery[1]["alt_text"], "Second image A")

    def test_public_gallery_keeps_customer_facing_caption_and_image_url(self):
        response = self.get_product_detail()

        gallery = response.data["gallery_images"]
        first = gallery[0]

        self.assertEqual(first["caption"], "Public cover caption A")
        self.assertIn("image_url", first)
        self.assertTrue(
            first["image_url"] is None
            or "gallery-a-cover.jpg" in str(first["image_url"])
        )

    def test_public_gallery_payload_avoids_admin_linkage(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        image = response.data["gallery_images"][0]

        for field_name in (
            "product",
            "product_name",
            "is_active",
            "created_at",
            "updated_at",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, image)

    def test_foreign_gallery_content_never_appears_in_tenant_a_product(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for foreign in (
            "FOREIGN PRIVATE ALT",
            "FOREIGN PRIVATE CAPTION",
            "products/gallery-b.jpg",
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_public_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Gallery Product",
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
                name="Anonymous Gallery Product",
            ).exists()
        )
