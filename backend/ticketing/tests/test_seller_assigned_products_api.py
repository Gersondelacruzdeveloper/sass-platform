"""Seller assigned-product administration tests."""

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Membership, Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import ExperienceProduct, Seller


class SellerAssignedProductsAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Assigned Products Tenant",
            slug="assigned-products-tenant",
            business_type="ticketing",
            is_active=True,
        )
        cls.foreign_organisation = Organisation.objects.create(
            name="Foreign Assigned Products Tenant",
            slug="foreign-assigned-products-tenant",
            business_type="ticketing",
            is_active=True,
        )

        User = get_user_model()
        cls.owner = User.objects.create_user(
            username="assigned-products-owner",
            email="assigned-products-owner@example.test",
            password="Strong-test-password-123",
            organisation=cls.organisation,
        )
        Membership.objects.create(
            user=cls.owner,
            organisation=cls.organisation,
            role="owner",
            is_active=True,
        )

        cls.saona = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Saona Island Full Day",
            slug="saona-assigned-products",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
        )
        cls.coco_bongo = ExperienceProduct.objects.create(
            organisation=cls.organisation,
            name="Coco Bongo Punta Cana",
            slug="coco-bongo-assigned-products",
            product_type="nightlife",
            status="active",
            is_active=True,
            seller_enabled=True,
        )
        cls.foreign_product = ExperienceProduct.objects.create(
            organisation=cls.foreign_organisation,
            name="Foreign Product",
            slug="foreign-assigned-product-update",
            product_type="excursion",
            status="active",
            is_active=True,
            seller_enabled=True,
        )
        cls.seller = Seller.objects.create(
            organisation=cls.organisation,
            full_name="Assigned Products Seller",
            seller_slug="assigned-products-seller",
            role="seller",
            is_active=True,
            can_sell_excursions=True,
            can_sell_cocobongo=True,
        )

    def setUp(self):
        self.client.force_authenticate(user=self.owner)
        self.seller.assigned_products.clear()

    def detail_url(self):
        return reverse("ticketing-sellers-detail", args=[self.seller.pk])

    def assigned_product_ids(self):
        return set(
            self.seller.assigned_products.values_list("id", flat=True)
        )

    def test_owner_can_assign_products_when_updating_seller(self):
        response = self.client.patch(
            self.detail_url(),
            {"assigned_products": [self.saona.pk, self.coco_bongo.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.seller.refresh_from_db()
        self.assertEqual(
            self.assigned_product_ids(),
            {self.saona.pk, self.coco_bongo.pk},
        )
        self.assertEqual(
            set(response.data["assigned_products"]),
            {self.saona.pk, self.coco_bongo.pk},
        )

    def test_update_replaces_previous_assigned_products(self):
        self.seller.assigned_products.set([self.coco_bongo])

        response = self.client.patch(
            self.detail_url(),
            {"assigned_products": [self.saona.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.seller.refresh_from_db()
        self.assertEqual(self.assigned_product_ids(), {self.saona.pk})
        self.assertEqual(response.data["assigned_products"], [self.saona.pk])

    def test_empty_assigned_products_clears_product_restriction(self):
        self.seller.assigned_products.set([self.saona, self.coco_bongo])

        response = self.client.patch(
            self.detail_url(),
            {"assigned_products": []},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.seller.refresh_from_db()
        self.assertEqual(self.assigned_product_ids(), set())
        self.assertEqual(response.data["assigned_products"], [])

    def test_owner_cannot_assign_foreign_tenant_product_during_update(self):
        self.seller.assigned_products.set([self.saona])

        response = self.client.patch(
            self.detail_url(),
            {"assigned_products": [self.foreign_product.pk]},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("assigned_products", response.data)
        self.seller.refresh_from_db()
        self.assertEqual(self.assigned_product_ids(), {self.saona.pk})
