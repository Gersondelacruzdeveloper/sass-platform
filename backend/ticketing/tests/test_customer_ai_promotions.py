from __future__ import annotations

from datetime import timedelta
from decimal import Decimal
from unittest.mock import Mock

from django.core.exceptions import ValidationError
from django.test import TestCase
from django.utils import timezone

from organisations.models import Organisation
from ticketing.ai.customer.cart_components import DjangoCustomerCartValidator
from ticketing.ai.customer.promotion_repository import (
    DjangoCustomerPromotionRepository,
)
from ticketing.ai.customer.promotion_tools import (
    CustomerPromotionRepositoryError,
    PromotionEvaluationRequest,
    PromotionItemRequest,
)
from ticketing.customer_ai_models import CustomerAIConversation
from ticketing.customer_cart_service import ValidatedCartLine
from ticketing.models import (
    CustomerPromotionRule,
    ExperienceProduct,
)


class CustomerAIPromotionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Promotion tenant",
            slug="promotion-tenant",
            is_active=True,
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other promotion tenant",
            slug="other-promotion-tenant",
            is_active=True,
        )
        cls.conversation = CustomerAIConversation.objects.create(
            organisation=cls.organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550101",
            status=CustomerAIConversation.STATUS_ACTIVE,
            language="en",
        )
        cls.other_conversation = CustomerAIConversation.objects.create(
            organisation=cls.other_organisation,
            channel=CustomerAIConversation.CHANNEL_WHATSAPP,
            external_customer_id="18095550102",
            status=CustomerAIConversation.STATUS_ACTIVE,
            language="en",
        )
        cls.saona = cls._product(
            organisation=cls.organisation,
            name="Saona Island",
            slug="saona-island",
            price="100.00",
        )
        cls.catalina = cls._product(
            organisation=cls.organisation,
            name="Catalina Island",
            slug="catalina-island",
            price="50.00",
        )
        cls.other_product = cls._product(
            organisation=cls.other_organisation,
            name="Other tenant tour",
            slug="other-tenant-tour",
            price="999.00",
        )

    def setUp(self):
        self.repository = DjangoCustomerPromotionRepository()
        self.repository.itinerary = Mock()
        self.repository.itinerary.validate_item.side_effect = self._validated_item
        self.service_date = timezone.localdate() + timedelta(days=14)

    @classmethod
    def _product(cls, *, organisation, name, slug, price):
        return ExperienceProduct.objects.create(
            organisation=organisation,
            name=name,
            slug=slug,
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            adult_price=Decimal(price),
            base_price=Decimal(price),
            child_price=Decimal("0.00"),
            infant_price=Decimal("0.00"),
        )

    def _validated_item(self, *, organisation, item, **_kwargs):
        product = ExperienceProduct.objects.get(
            pk=item.product_id,
            organisation=organisation,
        )
        subtotal = product.adult_price * item.adults
        return {
            "organisation_id": organisation.pk,
            "product_id": product.pk,
            "product_name": product.name,
            "service_date": item.service_date,
            "status": "valid",
            "issues": [],
            "warnings": [],
            "price_total": subtotal,
            "currency": "USD",
            "availability_status": "available",
            "pickup_required": False,
            "pickup_confirmed": True,
        }

    def _item(self, product, *, position=1, adults=1):
        return PromotionItemRequest(
            position=position,
            product_id=product.pk,
            service_date=self.service_date,
            adults=adults,
            children=0,
            infants=0,
            package_id=None,
            event_ticket_type_id=None,
            selected_external_option_id=None,
            pickup_location_id=None,
        )

    def _evaluate(self, *items, organisation=None, conversation=None):
        return self.repository.evaluate_itinerary_promotions(
            organisation=organisation or self.organisation,
            conversation=conversation or self.conversation,
            request=PromotionEvaluationRequest(items=tuple(items)),
        )

    def _rule(self, **overrides):
        values = {
            "organisation": self.organisation,
            "name": "Book more and save",
            "description": "Public multi-excursion saving.",
            "discount_type": CustomerPromotionRule.TYPE_PERCENTAGE,
            "discount_value": Decimal("10.00"),
            "minimum_items": 1,
            "minimum_subtotal": Decimal("0.00"),
            "max_discount_amount": Decimal("0.00"),
            "applies_to_all_products": True,
            "stackable": False,
            "priority": 100,
            "is_public": True,
            "is_active": True,
        }
        values.update(overrides)
        return CustomerPromotionRule.objects.create(**values)

    def test_percentage_rule_requires_minimum_items_and_reconciles(self):
        self._rule(minimum_items=2)

        no_discount = self._evaluate(self._item(self.saona))
        self.assertEqual(no_discount["discount_total"], Decimal("0.00"))

        result = self._evaluate(
            self._item(self.saona, position=1),
            self._item(self.catalina, position=2),
        )
        self.assertEqual(result["subtotal"], Decimal("150.00"))
        self.assertEqual(result["discount_total"], Decimal("15.00"))
        self.assertEqual(result["final_total"], Decimal("135.00"))
        self.assertEqual(result["promotions"][0]["eligible_item_positions"], [1, 2])

    def test_fixed_rule_is_product_scoped_and_capped(self):
        rule = self._rule(
            discount_type=CustomerPromotionRule.TYPE_FIXED_AMOUNT,
            discount_value=Decimal("40.00"),
            max_discount_amount=Decimal("25.00"),
            applies_to_all_products=False,
        )
        rule.products.add(self.saona)

        result = self._evaluate(
            self._item(self.saona, position=1),
            self._item(self.catalina, position=2),
        )
        self.assertEqual(result["discount_total"], Decimal("25.00"))
        self.assertEqual(result["promotions"][0]["eligible_item_positions"], [1])

    def test_minimum_subtotal_is_enforced(self):
        self._rule(minimum_subtotal=Decimal("200.00"))
        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("0.00"))

    def test_inactive_private_future_expired_and_exhausted_rules_are_ignored(self):
        now = timezone.now()
        self._rule(name="Inactive", is_active=False)
        self._rule(name="Private", is_public=False)
        self._rule(name="Future", valid_from=now + timedelta(days=1))
        self._rule(name="Expired", valid_until=now - timedelta(seconds=1))
        self._rule(name="Exhausted", max_uses=1, times_used=1)

        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("0.00"))
        self.assertEqual(result["promotions"], [])

    def test_stackable_rules_apply_in_priority_order(self):
        self._rule(name="First", discount_value=Decimal("10.00"), priority=1, stackable=True)
        self._rule(name="Second", discount_value=Decimal("5.00"), priority=2, stackable=False)

        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("15.00"))
        self.assertEqual([value["name"] for value in result["promotions"]], ["First", "Second"])
        self.assertTrue(result["stacking_applied"])

    def test_nonstackable_first_rule_stops_evaluation(self):
        self._rule(name="First", discount_value=Decimal("10.00"), priority=1, stackable=False)
        self._rule(name="Second", discount_value=Decimal("50.00"), priority=2, stackable=True)

        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("10.00"))
        self.assertEqual(len(result["promotions"]), 1)

    def test_other_tenant_rules_are_never_evaluated(self):
        self._rule(
            organisation=self.other_organisation,
            name="Other tenant discount",
            discount_value=Decimal("100.00"),
        )
        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("0.00"))

    def test_cross_tenant_conversation_is_rejected(self):
        with self.assertRaises(CustomerPromotionRepositoryError):
            self._evaluate(
                self._item(self.saona),
                conversation=self.other_conversation,
            )

    def test_seller_discount_fields_do_not_create_customer_discount(self):
        self.saona.seller_margin_is_active = True
        self.saona.seller_margin_percent = Decimal("50.00")
        self.saona.seller_allowed_discount_percent = Decimal("50.00")
        self.saona.save()

        result = self._evaluate(self._item(self.saona))
        self.assertEqual(result["discount_total"], Decimal("0.00"))
        self.assertEqual(result["promotions"], [])

    def test_cart_discount_allocation_uses_exact_cents(self):
        lines = [
            self._cart_line(self.saona, position=1, subtotal="100.00"),
            self._cart_line(self.catalina, position=2, subtotal="50.00"),
        ]
        evaluation = {
            "organisation_id": self.organisation.pk,
            "currency": "USD",
            "subtotal": Decimal("150.00"),
            "discount_total": Decimal("10.01"),
            "final_total": Decimal("139.99"),
            "promotions": [
                {
                    "promotion_id": 999,
                    "name": "Exact cents",
                    "description": "",
                    "discount_amount": Decimal("10.01"),
                    "eligible_item_positions": [1, 2],
                }
            ],
        }

        updated, discount, snapshot = DjangoCustomerCartValidator._apply_promotions(
            lines,
            evaluation=evaluation,
            expected_organisation_id=self.organisation.pk,
            expected_currency="USD",
            expected_subtotal=Decimal("150.00"),
        )
        self.assertEqual(discount, Decimal("10.01"))
        self.assertEqual(sum((line.discount for line in updated)), Decimal("10.01"))
        self.assertEqual(sum((line.total for line in updated)), Decimal("139.99"))
        self.assertEqual(snapshot[0]["discount_amount"], "10.01")

    def test_invalid_percentage_and_date_window_are_rejected(self):
        now = timezone.now()
        rule = CustomerPromotionRule(
            organisation=self.organisation,
            name="Invalid",
            discount_type=CustomerPromotionRule.TYPE_PERCENTAGE,
            discount_value=Decimal("101.00"),
            valid_from=now,
            valid_until=now - timedelta(minutes=1),
        )
        with self.assertRaises(ValidationError) as context:
            rule.full_clean()
        self.assertIn("discount_value", context.exception.message_dict)
        self.assertIn("valid_until", context.exception.message_dict)

    @staticmethod
    def _cart_line(product, *, position, subtotal):
        amount = Decimal(subtotal)
        return ValidatedCartLine(
            position=position,
            product=product,
            service_date=timezone.localdate() + timedelta(days=14),
            adults=1,
            children=0,
            infants=0,
            package_id=None,
            event_ticket_type_id=None,
            selected_external_option_id="",
            pickup_location_id=None,
            product_name=product.name,
            option_name="",
            pickup_name="",
            pickup_time=None,
            unit_price=amount,
            subtotal=amount,
            discount=Decimal("0.00"),
            total=amount,
            currency="USD",
            availability_snapshot={"status": "available"},
        )
