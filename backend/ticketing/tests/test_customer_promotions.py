"""Customer promotion rule coverage for ticketing.

CustomerPromotionRule is currently a model-level, backend-authoritative
component rather than a public ViewSet. These tests protect its financial
constraints, tenant scope, ordering, usage limits, and deliberate separation
from seller/partner financial models.
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from organisations.models import Organisation

from ticketing.customer_promotion_models import CustomerPromotionRule
from ticketing.models import (
    ExperienceProduct,
    PartnerSettlementPeriod,
    Seller,
    SellerCommission,
)


class CustomerPromotionRuleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Promotion Organisation A",
            slug="promotion-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Promotion Organisation B",
            slug="promotion-org-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.product_a1 = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Promotion Product A1",
            slug="promotion-product-a1",
            sku="PROMO-A1",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_a2 = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Promotion Product A2",
            slug="promotion-product-a2",
            sku="PROMO-A2",
            product_type="ticket",
            status="active",
            is_active=True,
            adult_price=Decimal("50.00"),
            base_price=Decimal("50.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Promotion Product B",
            slug="promotion-product-b",
            sku="PROMO-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        User = get_user_model()
        cls.owner_a = User.objects.create_user(
            username="promotion-owner-a",
            email="promotion-owner-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )

        cls.seller_user = User.objects.create_user(
            username="promotion-seller-a",
            email="promotion-seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user,
            full_name="Promotion Seller",
            seller_slug="promotion-seller",
            application_status="approved",
            is_active=True,
        )

    def make_rule(self, **overrides):
        values = {
            "organisation": self.org_a,
            "name": "Summer Offer",
            "description": "Customer-facing promotion.",
            "discount_type": CustomerPromotionRule.TYPE_PERCENTAGE,
            "discount_value": Decimal("10.00"),
            "max_discount_amount": Decimal("0.00"),
            "minimum_items": 1,
            "minimum_subtotal": Decimal("0.00"),
            "applies_to_all_products": True,
            "max_uses": None,
            "times_used": 0,
            "stackable": False,
            "priority": 100,
            "is_public": True,
            "is_active": True,
            "created_by": self.owner_a,
        }
        values.update(overrides)
        return CustomerPromotionRule.objects.create(**values)

    # ------------------------------------------------------------------
    # Basic validity / constraints
    # ------------------------------------------------------------------

    def test_valid_percentage_rule_saves(self):
        rule = self.make_rule()

        self.assertEqual(rule.organisation_id, self.org_a.pk)
        self.assertEqual(rule.discount_value, Decimal("10.00"))
        self.assertTrue(rule.usage_available)

    def test_percentage_discount_cannot_exceed_100_percent(self):
        rule = CustomerPromotionRule(
            organisation=self.org_a,
            name="Invalid 101%",
            discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
            discount_value=Decimal("101.00"),
        )

        with self.assertRaises(ValidationError) as ctx:
            rule.full_clean()

        self.assertIn("discount_value", ctx.exception.message_dict)

    def test_percentage_discount_database_constraint_rejects_over_100(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CustomerPromotionRule.objects.create(
                    organisation=self.org_a,
                    name="Database Invalid Percentage",
                    discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
                    discount_value=Decimal("101.00"),
                )

    def test_fixed_amount_discount_may_exceed_100(self):
        rule = self.make_rule(
            name="Fixed 150",
            discount_type=CustomerPromotionRule.TYPE_FIXED_AMOUNT,
            discount_value=Decimal("150.00"),
        )

        rule.full_clean()
        self.assertEqual(rule.discount_value, Decimal("150.00"))

    def test_discount_must_be_positive(self):
        rule = CustomerPromotionRule(
            organisation=self.org_a,
            name="Zero Discount",
            discount_type=CustomerPromotionRule.TYPE_FIXED_AMOUNT,
            discount_value=Decimal("0.00"),
        )

        with self.assertRaises(ValidationError) as ctx:
            rule.full_clean()

        self.assertIn("discount_value", ctx.exception.message_dict)

    def test_negative_money_fields_are_rejected(self):
        for field in ("max_discount_amount", "minimum_subtotal"):
            with self.subTest(field=field):
                kwargs = {
                    "organisation": self.org_a,
                    "name": f"Negative {field}",
                    "discount_type": CustomerPromotionRule.TYPE_FIXED_AMOUNT,
                    "discount_value": Decimal("5.00"),
                    field: Decimal("-0.01"),
                }
                rule = CustomerPromotionRule(**kwargs)

                with self.assertRaises(ValidationError) as ctx:
                    rule.full_clean()

                self.assertIn(field, ctx.exception.message_dict)

    def test_minimum_items_must_be_between_1_and_12(self):
        for value in (0, 13):
            with self.subTest(value=value):
                rule = CustomerPromotionRule(
                    organisation=self.org_a,
                    name=f"Items {value}",
                    discount_type=CustomerPromotionRule.TYPE_FIXED_AMOUNT,
                    discount_value=Decimal("5.00"),
                    minimum_items=value,
                )

                with self.assertRaises(ValidationError) as ctx:
                    rule.full_clean()

                self.assertIn("minimum_items", ctx.exception.message_dict)

    # ------------------------------------------------------------------
    # Validity windows / usage
    # ------------------------------------------------------------------

    def test_valid_until_must_follow_valid_from(self):
        now = timezone.now()
        rule = CustomerPromotionRule(
            organisation=self.org_a,
            name="Invalid Window",
            discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
            discount_value=Decimal("10.00"),
            valid_from=now,
            valid_until=now,
        )

        with self.assertRaises(ValidationError) as ctx:
            rule.full_clean()

        self.assertIn("valid_until", ctx.exception.message_dict)

    def test_future_validity_window_is_allowed(self):
        now = timezone.now()
        rule = self.make_rule(
            name="Future Window",
            valid_from=now + timedelta(days=1),
            valid_until=now + timedelta(days=5),
        )

        rule.full_clean()
        self.assertGreater(rule.valid_until, rule.valid_from)

    def test_usage_available_is_true_when_unlimited(self):
        rule = self.make_rule(max_uses=None, times_used=999)
        self.assertTrue(rule.usage_available)

    def test_usage_available_turns_false_at_limit(self):
        rule = self.make_rule(max_uses=2, times_used=1)
        self.assertTrue(rule.usage_available)

        rule.times_used = 2
        self.assertFalse(rule.usage_available)

    def test_usage_cannot_exceed_max_uses(self):
        rule = CustomerPromotionRule(
            organisation=self.org_a,
            name="Overused Rule",
            discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
            discount_value=Decimal("10.00"),
            max_uses=2,
            times_used=3,
        )

        with self.assertRaises(ValidationError) as ctx:
            rule.full_clean()

        self.assertIn("times_used", ctx.exception.message_dict)

    def test_database_constraint_prevents_times_used_over_max_uses(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                CustomerPromotionRule.objects.create(
                    organisation=self.org_a,
                    name="Database Overuse",
                    discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
                    discount_value=Decimal("10.00"),
                    max_uses=1,
                    times_used=2,
                )

    # ------------------------------------------------------------------
    # Product scope / tenant isolation
    # ------------------------------------------------------------------

    def test_rule_can_target_products_in_same_organisation(self):
        rule = self.make_rule(
            name="Scoped A",
            applies_to_all_products=False,
        )
        rule.products.add(self.product_a1, self.product_a2)

        rule.validate_product_scope()

        self.assertEqual(
            set(rule.products.values_list("id", flat=True)),
            {self.product_a1.pk, self.product_a2.pk},
        )

    def test_rule_rejects_foreign_tenant_product_scope(self):
        rule = self.make_rule(
            name="Cross Tenant Scope",
            applies_to_all_products=False,
        )
        rule.products.add(self.product_a1, self.product_b)

        with self.assertRaises(ValidationError) as ctx:
            rule.validate_product_scope()

        self.assertIn("products", ctx.exception.message_dict)

    def test_all_products_rule_does_not_require_m2m_validation(self):
        rule = self.make_rule(applies_to_all_products=True)
        rule.products.add(self.product_b)

        # Current model contract intentionally skips M2M scope checks when the
        # rule applies to all products, because the M2M relation is ignored.
        rule.validate_product_scope()

        self.assertTrue(rule.applies_to_all_products)

    def test_foreign_product_relation_never_changes_rule_organisation(self):
        rule = self.make_rule(
            name="Tenant Immutable",
            applies_to_all_products=False,
        )
        rule.products.add(self.product_b)

        rule.refresh_from_db()
        self.assertEqual(rule.organisation_id, self.org_a.pk)

    # ------------------------------------------------------------------
    # Ordering / stacking / public flags
    # ------------------------------------------------------------------

    def test_rules_are_ordered_by_priority_then_id(self):
        first = self.make_rule(name="Priority 50", priority=50)
        second = self.make_rule(name="Priority 10", priority=10)
        third = self.make_rule(name="Priority 50 B", priority=50)

        ids = list(
            CustomerPromotionRule.objects.filter(
                pk__in=[first.pk, second.pk, third.pk]
            ).values_list("id", flat=True)
        )

        self.assertEqual(ids[0], second.pk)
        self.assertEqual(ids[1:], [first.pk, third.pk])

    def test_stackable_and_public_flags_are_persisted_independently(self):
        rule = self.make_rule(
            stackable=True,
            is_public=False,
            is_active=True,
        )
        rule.refresh_from_db()

        self.assertTrue(rule.stackable)
        self.assertFalse(rule.is_public)
        self.assertTrue(rule.is_active)

    def test_inactive_rule_remains_queryable_from_default_manager(self):
        rule = self.make_rule(is_active=False)

        self.assertTrue(
            CustomerPromotionRule.objects.filter(pk=rule.pk).exists()
        )

    # ------------------------------------------------------------------
    # Financial separation
    # ------------------------------------------------------------------

    def test_creating_promotion_does_not_create_seller_commission(self):
        before = SellerCommission.objects.count()

        self.make_rule(
            name="No Seller Commission Side Effect",
            discount_type=CustomerPromotionRule.TYPE_FIXED_AMOUNT,
            discount_value=Decimal("20.00"),
        )

        self.assertEqual(SellerCommission.objects.count(), before)

    def test_creating_promotion_does_not_create_partner_settlement(self):
        before = PartnerSettlementPeriod.objects.count()

        self.make_rule(
            name="No Settlement Side Effect",
            discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
            discount_value=Decimal("15.00"),
        )

        self.assertEqual(PartnerSettlementPeriod.objects.count(), before)

    def test_customer_promotion_has_no_seller_or_partner_financial_fields(self):
        field_names = {
            field.name for field in CustomerPromotionRule._meta.get_fields()
        }

        forbidden = {
            "seller",
            "seller_commission",
            "seller_commission_rate",
            "partner",
            "business_entity",
            "partner_settlement",
            "partner_entitlement",
            "platform_entitlement",
        }
        self.assertTrue(forbidden.isdisjoint(field_names))

    def test_customer_promotion_fields_do_not_reference_financial_models(self):
        related_models = {
            getattr(field.remote_field, "model", None)
            for field in CustomerPromotionRule._meta.get_fields()
            if getattr(field, "remote_field", None) is not None
        }

        self.assertNotIn(Seller, related_models)
        self.assertNotIn(SellerCommission, related_models)
        self.assertNotIn(PartnerSettlementPeriod, related_models)

    # ------------------------------------------------------------------
    # String / audit fields
    # ------------------------------------------------------------------

    def test_created_by_is_audit_only_and_nullable(self):
        rule = self.make_rule(created_by=None)
        self.assertIsNone(rule.created_by)

    def test_string_representation_contains_tenant_and_name(self):
        rule = self.make_rule(name="Visible Promotion Name")

        rendered = str(rule)

        self.assertIn(str(self.org_a.pk), rendered)
        self.assertIn("Visible Promotion Name", rendered)
