"""Manager, related-manager, and queryset-boundary tests for ticketing.

The ticketing app currently uses Django's standard model managers rather than
custom Manager/QuerySet subclasses. These tests therefore protect the
organisation-scoped query boundaries and model helper methods that act as the
query API in practice.
"""

from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models.manager import Manager
from django.test import TestCase
from organisations.models import Organisation

from ticketing.models import (
    BlogCategory,
    BlogPost,
    ExperienceCategory,
    ExperienceProduct,
    ProductURLAlias,
    Seller,
    SellerPayoutAccount,
    TicketingBusinessEntity,
)


class TicketingManagerAndQuerysetTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Manager Organisation A",
            slug="manager-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Manager Organisation B",
            slug="manager-org-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Category A",
            slug="manager-category-a",
            is_active=True,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Category B",
            slug="manager-category-b",
            is_active=True,
        )

        cls.product_a1 = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Product A1",
            slug="manager-product-a1",
            sku="MANAGER-A1",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_a2 = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Product A2",
            slug="manager-product-a2",
            sku="MANAGER-A2",
            product_type="ticket",
            status="inactive",
            is_active=False,
            adult_price=Decimal("50.00"),
            base_price=Decimal("50.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Product B",
            slug="manager-product-b",
            sku="MANAGER-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.alias_a_primary = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a1,
            path="/product/manager-product-a1",
            is_primary=True,
            is_active=True,
        )
        cls.alias_a_legacy = ProductURLAlias.objects.create(
            organisation=cls.org_a,
            product=cls.product_a1,
            path="/legacy/manager-product-a1",
            is_primary=False,
            is_active=True,
        )
        cls.alias_b = ProductURLAlias.objects.create(
            organisation=cls.org_b,
            product=cls.product_b,
            path="/product/manager-product-b",
            is_primary=True,
            is_active=True,
        )

        cls.blog_category_a = BlogCategory.objects.create(
            organisation=cls.org_a,
            name="Blog A",
            slug="manager-blog-a",
            is_active=True,
        )
        cls.blog_category_b = BlogCategory.objects.create(
            organisation=cls.org_b,
            name="Blog B",
            slug="manager-blog-b",
            is_active=True,
        )
        cls.blog_a = BlogPost.objects.create(
            organisation=cls.org_a,
            category=cls.blog_category_a,
            title="Post A",
            slug="manager-post-a",
            status="published",
            is_active=True,
        )
        cls.blog_b = BlogPost.objects.create(
            organisation=cls.org_b,
            category=cls.blog_category_b,
            title="Post B",
            slug="manager-post-b",
            status="published",
            is_active=True,
        )

        User = get_user_model()
        cls.seller_user_a = User.objects.create_user(
            username="manager-seller-a",
            email="manager-seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_user_b = User.objects.create_user(
            username="manager-seller-b",
            email="manager-seller-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a,
            full_name="Manager Seller A",
            seller_slug="manager-seller-a",
            application_status="approved",
            is_active=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.seller_user_b,
            full_name="Manager Seller B",
            seller_slug="manager-seller-b",
            application_status="approved",
            is_active=True,
        )

        cls.payout_a = SellerPayoutAccount.objects.create(
            organisation=cls.org_a,
            seller=cls.seller_a,
            method="paypal",
            account_holder_name="Seller A",
            paypal_email="seller-a@example.test",
            is_default=True,
        )
        cls.payout_b = SellerPayoutAccount.objects.create(
            organisation=cls.org_b,
            seller=cls.seller_b,
            method="paypal",
            account_holder_name="Seller B",
            paypal_email="seller-b@example.test",
            is_default=True,
        )

        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.org_a,
            name="Entity A",
            slug="manager-entity-a",
            entity_type="partner",
            is_active=True,
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.org_b,
            name="Entity B",
            slug="manager-entity-b",
            entity_type="partner",
            is_active=True,
        )

    # ------------------------------------------------------------------
    # Manager shape
    # ------------------------------------------------------------------

    def test_ticketing_models_use_standard_django_managers(self):
        for model in (
            ExperienceProduct,
            ProductURLAlias,
            BlogCategory,
            BlogPost,
            Seller,
            SellerPayoutAccount,
            TicketingBusinessEntity,
        ):
            with self.subTest(model=model.__name__):
                self.assertIsInstance(model.objects, Manager)

    def test_no_manager_implicitly_filters_out_inactive_products(self):
        ids = set(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
            ).values_list("id", flat=True)
        )

        self.assertEqual(
            ids,
            {self.product_a1.pk, self.product_a2.pk},
        )

    def test_explicit_active_queryset_does_not_cross_tenants(self):
        ids = set(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
                is_active=True,
                status="active",
            ).values_list("id", flat=True)
        )

        self.assertEqual(ids, {self.product_a1.pk})
        self.assertNotIn(self.product_b.pk, ids)

    # ------------------------------------------------------------------
    # Organisation reverse managers
    # ------------------------------------------------------------------

    def test_organisation_product_related_manager_is_tenant_scoped_by_fk(self):
        ids_a = set(
            self.org_a.ticketing_products.values_list("id", flat=True)
        )
        ids_b = set(
            self.org_b.ticketing_products.values_list("id", flat=True)
        )

        self.assertEqual(
            ids_a,
            {self.product_a1.pk, self.product_a2.pk},
        )
        self.assertEqual(ids_b, {self.product_b.pk})
        self.assertTrue(ids_a.isdisjoint(ids_b))

    def test_organisation_alias_related_manager_is_tenant_scoped_by_fk(self):
        ids_a = set(
            self.org_a.ticketing_product_url_aliases.values_list(
                "id",
                flat=True,
            )
        )
        ids_b = set(
            self.org_b.ticketing_product_url_aliases.values_list(
                "id",
                flat=True,
            )
        )

        self.assertEqual(
            ids_a,
            {self.alias_a_primary.pk, self.alias_a_legacy.pk},
        )
        self.assertEqual(ids_b, {self.alias_b.pk})

    def test_organisation_blog_related_managers_are_tenant_scoped(self):
        category_ids_a = set(
            self.org_a.ticketing_blog_categories.values_list(
                "id",
                flat=True,
            )
        )
        post_ids_a = set(
            self.org_a.ticketing_blog_posts.values_list(
                "id",
                flat=True,
            )
        )

        self.assertEqual(
            category_ids_a,
            {self.blog_category_a.pk},
        )
        self.assertEqual(post_ids_a, {self.blog_a.pk})
        self.assertNotIn(self.blog_category_b.pk, category_ids_a)
        self.assertNotIn(self.blog_b.pk, post_ids_a)

    def test_organisation_seller_payout_related_manager_is_tenant_scoped(self):
        ids_a = set(
            self.org_a.ticketing_seller_payout_accounts.values_list(
                "id",
                flat=True,
            )
        )
        ids_b = set(
            self.org_b.ticketing_seller_payout_accounts.values_list(
                "id",
                flat=True,
            )
        )

        self.assertEqual(ids_a, {self.payout_a.pk})
        self.assertEqual(ids_b, {self.payout_b.pk})

    def test_organisation_business_entity_related_manager_is_tenant_scoped(self):
        ids_a = set(
            self.org_a.ticketing_business_entities.values_list(
                "id",
                flat=True,
            )
        )
        ids_b = set(
            self.org_b.ticketing_business_entities.values_list(
                "id",
                flat=True,
            )
        )

        self.assertEqual(ids_a, {self.entity_a.pk})
        self.assertEqual(ids_b, {self.entity_b.pk})

    # ------------------------------------------------------------------
    # Product/category/alias related managers and helpers
    # ------------------------------------------------------------------

    def test_category_product_related_manager_contains_only_linked_products(self):
        ids = set(
            self.category_a.products.values_list("id", flat=True)
        )

        self.assertEqual(
            ids,
            {self.product_a1.pk, self.product_a2.pk},
        )
        self.assertNotIn(self.product_b.pk, ids)

    def test_product_alias_related_manager_contains_only_its_aliases(self):
        paths = set(
            self.product_a1.url_aliases.values_list("path", flat=True)
        )

        self.assertEqual(
            paths,
            {
                "/product/manager-product-a1",
                "/legacy/manager-product-a1",
            },
        )
        self.assertNotIn(self.alias_b.path, paths)

    def test_get_primary_url_alias_returns_active_primary_only(self):
        self.assertEqual(
            self.product_a1.get_primary_url_alias(),
            self.alias_a_primary,
        )

        self.alias_a_primary.is_active = False
        self.alias_a_primary.save(update_fields=["is_active"])

        self.assertIsNone(self.product_a1.get_primary_url_alias())

    def test_ensure_primary_url_alias_is_idempotent(self):
        product = ExperienceProduct.objects.create(
            organisation=self.org_a,
            category=self.category_a,
            name="Alias Helper Product",
            slug="alias-helper-product",
            sku="ALIAS-HELPER",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("80.00"),
            base_price=Decimal("80.00"),
        )

        first = product.ensure_primary_url_alias()
        second = product.ensure_primary_url_alias()

        self.assertEqual(first.pk, second.pk)
        self.assertTrue(first.is_primary)
        self.assertEqual(first.organisation_id, self.org_a.pk)
        self.assertEqual(first.product_id, product.pk)
        self.assertEqual(
            product.url_aliases.filter(is_primary=True).count(),
            1,
        )

    def test_add_legacy_url_alias_is_idempotent_for_same_product_and_path(self):
        first = self.product_a1.add_legacy_url_alias(
            "/legacy/repeated-path",
        )
        second = self.product_a1.add_legacy_url_alias(
            "/legacy/repeated-path",
        )

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(first.organisation_id, self.org_a.pk)
        self.assertEqual(first.product_id, self.product_a1.pk)
        self.assertEqual(
            ProductURLAlias.objects.filter(
                organisation=self.org_a,
                product=self.product_a1,
                path="/legacy/repeated-path",
            ).count(),
            1,
        )

    # ------------------------------------------------------------------
    # Blog related managers
    # ------------------------------------------------------------------

    def test_blog_category_posts_related_manager_contains_only_its_posts(self):
        ids = set(
            self.blog_category_a.posts.values_list("id", flat=True)
        )

        self.assertEqual(ids, {self.blog_a.pk})
        self.assertNotIn(self.blog_b.pk, ids)

    def test_related_products_manager_returns_only_explicitly_linked_products(self):
        self.blog_a.related_products.add(self.product_a1)

        ids = set(
            self.blog_a.related_products.values_list("id", flat=True)
        )

        self.assertEqual(ids, {self.product_a1.pk})
        self.assertNotIn(self.product_b.pk, ids)

    # ------------------------------------------------------------------
    # Seller/payout related managers
    # ------------------------------------------------------------------

    def test_seller_payout_accounts_related_manager_contains_only_own_accounts(self):
        ids = set(
            self.seller_a.payout_accounts.values_list("id", flat=True)
        )

        self.assertEqual(ids, {self.payout_a.pk})
        self.assertNotIn(self.payout_b.pk, ids)

    def test_new_default_payout_only_demotes_accounts_for_same_seller(self):
        second_a = SellerPayoutAccount.objects.create(
            organisation=self.org_a,
            seller=self.seller_a,
            method="bank_transfer",
            account_holder_name="Seller A",
            bank_name="Manager Bank",
            account_number="1234567890",
            is_default=True,
        )

        self.payout_a.refresh_from_db()
        self.payout_b.refresh_from_db()

        self.assertFalse(self.payout_a.is_default)
        self.assertTrue(second_a.is_default)
        self.assertTrue(
            self.payout_b.is_default,
            "Making a default payout account in tenant A must not alter tenant B.",
        )

    # ------------------------------------------------------------------
    # Tenant-scoped slug helper behavior
    # ------------------------------------------------------------------

    def test_blog_slug_generation_checks_only_same_organisation_queryset(self):
        BlogCategory.objects.create(
            organisation=self.org_a,
            name="Shared Blog Name",
            slug="shared-blog-slug",
        )
        cross_tenant = BlogCategory.objects.create(
            organisation=self.org_b,
            name="Shared Blog Name B",
            slug="shared-blog-slug",
        )
        same_tenant = BlogCategory.objects.create(
            organisation=self.org_a,
            name="Shared Blog Name Again",
            slug="shared-blog-slug",
        )

        self.assertEqual(cross_tenant.slug, "shared-blog-slug")
        self.assertEqual(same_tenant.slug, "shared-blog-slug-2")

    def test_business_entity_slug_generation_checks_only_same_organisation(self):
        TicketingBusinessEntity.objects.create(
            organisation=self.org_a,
            name="Shared Entity",
            slug="shared-entity",
            entity_type="partner",
        )
        cross_tenant = TicketingBusinessEntity.objects.create(
            organisation=self.org_b,
            name="Shared Entity",
            slug="shared-entity",
            entity_type="partner",
        )
        same_tenant = TicketingBusinessEntity.objects.create(
            organisation=self.org_a,
            name="Shared Entity",
            slug="",
            entity_type="partner",
        )

        self.assertEqual(cross_tenant.slug, "shared-entity")
        self.assertEqual(same_tenant.slug, "shared-entity-2")

    # ------------------------------------------------------------------
    # Query composition safety
    # ------------------------------------------------------------------

    def test_or_style_product_filter_stays_inside_tenant_when_tenant_filter_is_outer(self):
        queryset = ExperienceProduct.objects.filter(
            organisation=self.org_a,
        ).filter(
            product_type="excursion",
        )

        ids = set(queryset.values_list("id", flat=True))

        self.assertEqual(ids, {self.product_a1.pk})
        self.assertNotIn(self.product_b.pk, ids)

    def test_ordering_does_not_change_tenant_scope(self):
        ids = list(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
            )
            .order_by("name")
            .values_list("id", flat=True)
        )

        self.assertEqual(
            set(ids),
            {self.product_a1.pk, self.product_a2.pk},
        )
        self.assertNotIn(self.product_b.pk, ids)

    def test_values_and_values_list_do_not_bypass_tenant_filter(self):
        rows = list(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
            ).values("id", "organisation_id")
        )
        ids = set(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
            ).values_list("id", flat=True)
        )

        self.assertTrue(rows)
        self.assertTrue(
            all(row["organisation_id"] == self.org_a.pk for row in rows)
        )
        self.assertNotIn(self.product_b.pk, ids)
