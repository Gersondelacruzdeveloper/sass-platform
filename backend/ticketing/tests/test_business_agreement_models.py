"""Model integrity tests for ticketing business entities and agreements."""

from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase

from organisations.models import Organisation
from ticketing.models import (
    ExperienceProduct,
    ProductBusinessAgreement,
    TicketingBusinessEntity,
)


class BusinessAgreementModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation_a = Organisation.objects.create(
            name="Agreement Organisation A",
            slug="agreement-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.organisation_b = Organisation.objects.create(
            name="Agreement Organisation B",
            slug="agreement-org-b",
            business_type="ticketing",
            is_active=True,
        )
        cls.entity_a = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_a,
            name="Agreement Partner A",
            slug="agreement-partner-a",
            entity_type="partner",
        )
        cls.entity_b = TicketingBusinessEntity.objects.create(
            organisation=cls.organisation_b,
            name="Agreement Partner B",
            slug="agreement-partner-b",
            entity_type="partner",
        )
        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.organisation_a,
            name="Agreement Product A",
            slug="agreement-product-a",
            product_type="excursion",
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            status="active",
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.organisation_b,
            name="Agreement Product B",
            slug="agreement-product-b",
            product_type="excursion",
            adult_price=Decimal("120.00"),
            adult_cost_price=Decimal("70.00"),
            status="active",
        )

    def make_entity(self, **overrides):
        values = {
            "organisation": self.organisation_a,
            "name": "Generated Partner",
            "slug": "generated-partner",
            "entity_type": "partner",
        }
        values.update(overrides)
        return TicketingBusinessEntity.objects.create(**values)

    def make_agreement(self, **overrides):
        values = {
            "organisation": self.organisation_a,
            "business_entity": self.entity_a,
            "product": self.product_a,
            "name": "Standard Partner Agreement",
            "version": 1,
            "agreement_type": "fixed_partner_net",
            "settlement_basis": "checked_in",
            "collection_mode": "mixed",
            "partner_fixed_amount": Decimal("60.00"),
            "partner_percentage": Decimal("0.0000"),
            "platform_fixed_amount": Decimal("40.00"),
            "platform_percentage": Decimal("0.0000"),
            "effective_from": date(2026, 1, 1),
            "effective_until": date(2026, 12, 31),
        }
        values.update(overrides)
        return ProductBusinessAgreement.objects.create(**values)

    def test_entity_defaults_and_string_representation(self):
        entity = TicketingBusinessEntity.objects.create(
            organisation=self.organisation_a,
            name="Default Partner",
            slug="default-partner",
        )

        self.assertEqual(entity.entity_type, "partner")
        self.assertEqual(entity.currency, "USD")
        self.assertEqual(entity.settlement_cycle_days, 10)
        self.assertFalse(entity.can_collect_customer_balance)
        self.assertTrue(entity.can_scan_tickets)
        self.assertTrue(entity.require_check_in_confirmation)
        self.assertTrue(entity.allow_partial_admission)
        self.assertFalse(entity.allow_offline_scanning)
        self.assertTrue(entity.whatsapp_notifications_enabled)
        self.assertTrue(entity.is_active)
        self.assertEqual(str(entity), "Default Partner")

    def test_entity_save_generates_slug_from_name(self):
        entity = self.make_entity(name="Blue Lagoon Tours", slug="")

        self.assertEqual(entity.slug, "blue-lagoon-tours")

    def test_entity_slug_generation_avoids_same_tenant_collisions(self):
        first = self.make_entity(name="Shared Partner", slug="")
        second = self.make_entity(name="Shared Partner", slug="")
        third = self.make_entity(name="Shared Partner", slug="")

        self.assertEqual(first.slug, "shared-partner")
        self.assertEqual(second.slug, "shared-partner-2")
        self.assertEqual(third.slug, "shared-partner-3")

    def test_entity_slug_generation_is_independent_between_tenants(self):
        first = self.make_entity(name="Tenant Partner", slug="")
        second = self.make_entity(
            organisation=self.organisation_b,
            name="Tenant Partner",
            slug="",
        )

        self.assertEqual(first.slug, "tenant-partner")
        self.assertEqual(second.slug, "tenant-partner")

    def test_entity_save_preserves_explicit_slug(self):
        entity = self.make_entity(name="Named Partner", slug="custom-provider-slug")

        self.assertEqual(entity.slug, "custom-provider-slug")

    def test_entity_extra_settings_defaults_are_independent(self):
        first = self.make_entity(name="First Entity", slug="first-entity")
        second = self.make_entity(name="Second Entity", slug="second-entity")

        first.extra_settings["provider"] = "external"

        self.assertEqual(second.extra_settings, {})

    def test_entity_full_clean_rejects_invalid_type_email_and_negative_cycle(self):
        entity = TicketingBusinessEntity(
            organisation=self.organisation_a,
            name="Invalid Entity",
            slug="invalid-entity",
            entity_type="invented-type",
            contact_email="not-an-email",
            settlement_cycle_days=-1,
        )

        with self.assertRaises(ValidationError) as context:
            entity.full_clean()

        self.assertIn("entity_type", context.exception.message_dict)
        self.assertIn("contact_email", context.exception.message_dict)
        self.assertIn("settlement_cycle_days", context.exception.message_dict)

    def test_entity_slug_is_unique_within_organisation(self):
        self.make_entity(name="First Unique", slug="tenant-unique-slug")

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_entity(name="Second Unique", slug="tenant-unique-slug")

    def test_same_entity_slug_is_allowed_for_different_organisations(self):
        self.make_entity(name="Tenant A", slug="shared-cross-tenant-slug")
        entity_b = self.make_entity(
            organisation=self.organisation_b,
            name="Tenant B",
            slug="shared-cross-tenant-slug",
        )

        self.assertIsNotNone(entity_b.pk)

    def test_deleting_organisation_cascades_entities(self):
        organisation = Organisation.objects.create(
            name="Temporary Agreement Organisation",
            slug="temporary-agreement-org",
            business_type="ticketing",
            is_active=True,
        )
        entity = self.make_entity(
            organisation=organisation,
            name="Temporary Entity",
            slug="temporary-entity",
        )

        organisation.delete()

        self.assertFalse(
            TicketingBusinessEntity.objects.filter(pk=entity.pk).exists()
        )

    def test_agreement_defaults(self):
        agreement = ProductBusinessAgreement.objects.create(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
        )

        self.assertEqual(agreement.version, 1)
        self.assertEqual(agreement.agreement_type, "fixed_partner_net")
        self.assertEqual(agreement.settlement_basis, "checked_in")
        self.assertEqual(agreement.collection_mode, "mixed")
        self.assertEqual(agreement.currency, "USD")
        self.assertEqual(agreement.settlement_cycle_days, 10)
        self.assertEqual(agreement.payment_due_days, 0)
        self.assertTrue(agreement.seller_commission_included)
        self.assertTrue(agreement.is_active)
        self.assertTrue(agreement.send_supplier_booking_notification)

    def test_agreement_save_uses_product_organisation(self):
        agreement = self.make_agreement(organisation=self.organisation_b)

        self.assertEqual(agreement.organisation, self.organisation_a)

    def test_agreement_string_prefers_explicit_name(self):
        agreement = self.make_agreement(name="2026 Commercial Terms")

        self.assertEqual(str(agreement), "2026 Commercial Terms")

    def test_agreement_string_falls_back_to_product_entity_and_version(self):
        agreement = self.make_agreement(name="", version=3)

        self.assertIn(str(self.product_a), str(agreement))
        self.assertIn(str(self.entity_a), str(agreement))
        self.assertIn("v3", str(agreement))

    def test_agreement_applies_on_effective_date_boundaries(self):
        agreement = self.make_agreement(
            effective_from=date(2026, 2, 1),
            effective_until=date(2026, 2, 28),
        )

        self.assertFalse(agreement.applies_to(date(2026, 1, 31)))
        self.assertTrue(agreement.applies_to(date(2026, 2, 1)))
        self.assertTrue(agreement.applies_to(date(2026, 2, 28)))
        self.assertFalse(agreement.applies_to(date(2026, 3, 1)))

    def test_open_ended_agreement_applies_after_start(self):
        agreement = self.make_agreement(
            effective_from=date(2026, 2, 1),
            effective_until=None,
        )

        self.assertTrue(agreement.applies_to(date(2030, 1, 1)))

    def test_inactive_agreement_never_applies(self):
        agreement = self.make_agreement(is_active=False)

        self.assertFalse(agreement.applies_to(date(2026, 6, 1)))

    def test_agreement_extra_rules_defaults_are_independent(self):
        first = self.make_agreement(version=1)
        second = self.make_agreement(version=2)

        first.extra_rules["minimum_guests"] = 2

        self.assertEqual(second.extra_rules, {})

    def test_agreement_full_clean_rejects_invalid_choices(self):
        agreement = ProductBusinessAgreement(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            agreement_type="invented-agreement",
            settlement_basis="invented-basis",
            collection_mode="invented-mode",
        )

        with self.assertRaises(ValidationError) as context:
            agreement.full_clean()

        self.assertIn("agreement_type", context.exception.message_dict)
        self.assertIn("settlement_basis", context.exception.message_dict)
        self.assertIn("collection_mode", context.exception.message_dict)

    def test_agreement_full_clean_rejects_cross_tenant_business_entity(self):
        agreement = ProductBusinessAgreement(
            organisation=self.organisation_a,
            business_entity=self.entity_b,
            product=self.product_a,
        )

        with self.assertRaises(ValidationError):
            agreement.full_clean()

    def test_agreement_full_clean_rejects_negative_fixed_amounts(self):
        for field in ("partner_fixed_amount", "platform_fixed_amount"):
            with self.subTest(field=field):
                agreement = ProductBusinessAgreement(
                    organisation=self.organisation_a,
                    business_entity=self.entity_a,
                    product=self.product_a,
                    **{field: Decimal("-0.01")},
                )
                with self.assertRaises(ValidationError) as context:
                    agreement.full_clean()
                self.assertIn(field, context.exception.message_dict)

    def test_agreement_full_clean_rejects_percentages_outside_zero_to_one_hundred(self):
        for field in ("partner_percentage", "platform_percentage"):
            for value in (Decimal("-0.0001"), Decimal("100.0001")):
                with self.subTest(field=field, value=value):
                    agreement = ProductBusinessAgreement(
                        organisation=self.organisation_a,
                        business_entity=self.entity_a,
                        product=self.product_a,
                        **{field: value},
                    )
                    with self.assertRaises(ValidationError) as context:
                        agreement.full_clean()
                    self.assertIn(field, context.exception.message_dict)

    def test_agreement_full_clean_rejects_end_before_start(self):
        agreement = ProductBusinessAgreement(
            organisation=self.organisation_a,
            business_entity=self.entity_a,
            product=self.product_a,
            effective_from=date(2026, 2, 2),
            effective_until=date(2026, 2, 1),
        )

        with self.assertRaises(ValidationError) as context:
            agreement.full_clean()

        self.assertIn("effective_until", context.exception.message_dict)

    def test_agreement_version_is_unique_per_entity_and_product(self):
        self.make_agreement(version=1)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.make_agreement(version=1)

    def test_new_agreement_version_is_allowed_for_same_entity_and_product(self):
        first = self.make_agreement(version=1)
        second = self.make_agreement(
            version=2,
            effective_from=first.effective_from + timedelta(days=30),
        )

        self.assertIsNotNone(second.pk)

    def test_deleting_product_cascades_its_agreements(self):
        product = ExperienceProduct.objects.create(
            organisation=self.organisation_a,
            name="Temporary Agreement Product",
            slug="temporary-agreement-product",
            product_type="excursion",
            adult_price=Decimal("50.00"),
            status="active",
        )
        agreement = self.make_agreement(product=product)

        product.delete()

        self.assertFalse(
            ProductBusinessAgreement.objects.filter(pk=agreement.pk).exists()
        )

