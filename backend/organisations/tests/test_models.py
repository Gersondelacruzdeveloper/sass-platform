"""Model tests for the organisations application."""

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from subscriptions.models import Subscription, SubscriptionPlan

from organisations.models import (
    Membership,
    Organisation,
    OrganisationAISettings,
    OrganisationBranding,
    OrganisationDomain,
)


User = get_user_model()


class OrganisationModelTests(TestCase):
    def create_organisation(self, **overrides):
        data = {
            "name": "Model Test Organisation",
            "slug": "model-test-organisation",
        }
        data.update(overrides)
        return Organisation.objects.create(**data)

    def test_defaults_and_string_representation(self):
        organisation = self.create_organisation()

        self.assertEqual(organisation.business_type, "disco")
        self.assertEqual(organisation.plan, "basic")
        self.assertFalse(organisation.is_active)
        self.assertEqual(str(organisation), "Model Test Organisation")
        self.assertIsNotNone(organisation.created_at)

    def test_slug_must_be_unique(self):
        self.create_organisation()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_organisation(name="Duplicate Organisation")

        self.assertEqual(Organisation.objects.count(), 1)

    def test_model_validation_rejects_unknown_business_type(self):
        organisation = Organisation(
            name="Invalid Business",
            slug="invalid-business",
            business_type="unknown",
        )

        with self.assertRaises(ValidationError) as context:
            organisation.full_clean()

        self.assertIn("business_type", context.exception.message_dict)

    def test_model_validation_rejects_unknown_plan(self):
        organisation = Organisation(
            name="Invalid Plan",
            slug="invalid-plan",
            plan="unlimited",
        )

        with self.assertRaises(ValidationError) as context:
            organisation.full_clean()

        self.assertIn("plan", context.exception.message_dict)

    def test_fallback_plan_values_without_subscription(self):
        expected_values = {
            "basic": (99, 3, 25),
            "pro": (159, 10, 100),
            "premium": (199, 25, 300),
        }

        for index, (plan, expected) in enumerate(expected_values.items()):
            with self.subTest(plan=plan):
                organisation = self.create_organisation(
                    name=f"Fallback {plan}",
                    slug=f"fallback-{index}-{plan}",
                    plan=plan,
                )

                self.assertIsNone(organisation.active_subscription)
                self.assertEqual(organisation.plan_price, expected[0])
                self.assertEqual(organisation.max_users, expected[1])
                self.assertEqual(organisation.max_employees, expected[2])
                self.assertEqual(organisation.subscription_status, "inactive")
                self.assertIsNone(organisation.stripe_customer_id)
                self.assertIsNone(organisation.stripe_subscription_id)

    def test_subscription_values_override_fallback_plan_values(self):
        organisation = self.create_organisation(plan="basic")
        subscription_plan = SubscriptionPlan.objects.create(
            name="Custom Enterprise",
            slug="custom-enterprise-model-test",
            price=Decimal("249.95"),
            max_users=47,
            max_employees=777,
            max_modules=8,
        )
        subscription = Subscription.objects.create(
            organisation=organisation,
            plan=subscription_plan,
            status="active",
            stripe_customer_id="cus_test_only",
            stripe_subscription_id="sub_test_only",
        )

        self.assertEqual(organisation.active_subscription, subscription)
        self.assertEqual(organisation.plan_price, Decimal("249.95"))
        self.assertEqual(organisation.max_users, 47)
        self.assertEqual(organisation.max_employees, 777)
        self.assertEqual(organisation.subscription_status, "active")
        self.assertEqual(organisation.stripe_customer_id, "cus_test_only")
        self.assertEqual(
            organisation.stripe_subscription_id,
            "sub_test_only",
        )


class MembershipModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Membership Organisation",
            slug="membership-organisation-model-test",
            is_active=True,
        )
        cls.user = User.objects.create_user(
            username="membership-model-user",
            email="membership-model-user@example.com",
            password="Strong-test-password-123",
        )

    def test_defaults_and_string_representation(self):
        membership = Membership.objects.create(
            user=self.user,
            organisation=self.organisation,
        )

        self.assertEqual(membership.role, "staff")
        self.assertTrue(membership.is_active)
        self.assertIsNotNone(membership.created_at)
        self.assertEqual(
            str(membership),
            (
                "membership-model-user@example.com - "
                "Membership Organisation - staff"
            ),
        )

    def test_user_and_organisation_pair_must_be_unique(self):
        Membership.objects.create(
            user=self.user,
            organisation=self.organisation,
            role="owner",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                Membership.objects.create(
                    user=self.user,
                    organisation=self.organisation,
                    role="viewer",
                )

        self.assertEqual(Membership.objects.count(), 1)

    def test_same_user_can_belong_to_different_organisations(self):
        other_organisation = Organisation.objects.create(
            name="Other Membership Organisation",
            slug="other-membership-organisation-model-test",
            is_active=True,
        )

        first = Membership.objects.create(
            user=self.user,
            organisation=self.organisation,
            role="owner",
        )
        second = Membership.objects.create(
            user=self.user,
            organisation=other_organisation,
            role="viewer",
        )

        self.assertNotEqual(first.organisation, second.organisation)
        self.assertEqual(self.user.memberships.count(), 2)

    def test_model_validation_rejects_unknown_role(self):
        membership = Membership(
            user=self.user,
            organisation=self.organisation,
            role="platform_god",
        )

        with self.assertRaises(ValidationError) as context:
            membership.full_clean()

        self.assertIn("role", context.exception.message_dict)

    def test_deleting_user_cascades_membership(self):
        membership = Membership.objects.create(
            user=self.user,
            organisation=self.organisation,
        )
        membership_id = membership.pk

        self.user.delete()

        self.assertFalse(
            Membership.objects.filter(pk=membership_id).exists()
        )

    def test_deleting_organisation_cascades_membership(self):
        membership = Membership.objects.create(
            user=self.user,
            organisation=self.organisation,
        )
        membership_id = membership.pk

        self.organisation.delete()

        self.assertFalse(
            Membership.objects.filter(pk=membership_id).exists()
        )
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())


class OrganisationBrandingModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Branding Organisation",
            slug="branding-organisation-model-test",
        )

    def create_branding(self, **overrides):
        data = {
            "organisation": self.organisation,
            "company_name": "Branding Company",
        }
        data.update(overrides)
        return OrganisationBranding.objects.create(**data)

    def test_defaults_and_string_representation(self):
        branding = self.create_branding()

        self.assertEqual(branding.primary_color, "#111827")
        self.assertEqual(branding.secondary_color, "#6B7280")
        self.assertEqual(branding.accent_color, "#F59E0B")
        self.assertEqual(branding.theme_color, "#111827")
        self.assertEqual(branding.background_color, "#ffffff")
        self.assertEqual(str(branding), "Branding Company - ")

    def test_display_name_fallback_order(self):
        branding = self.create_branding(
            company_name="Company Name",
            platform_name="Platform Name",
        )
        self.assertEqual(branding.display_name, "Platform Name")

        branding.platform_name = ""
        self.assertEqual(branding.display_name, "Company Name")

        branding.company_name = ""
        self.assertEqual(branding.display_name, self.organisation.name)

    def test_short_name_fallback_order(self):
        branding = self.create_branding(
            company_name="Company Name",
            platform_name="Platform Name",
            app_short_name="Short Name",
        )
        self.assertEqual(branding.short_name, "Short Name")

        branding.app_short_name = ""
        self.assertEqual(branding.short_name, "Platform Name")

        branding.platform_name = ""
        self.assertEqual(branding.short_name, "Company Name")

    def test_only_one_branding_record_is_allowed_per_organisation(self):
        self.create_branding()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_branding(company_name="Duplicate Branding")


class OrganisationDomainModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="Domain Organisation",
            slug="domain-organisation-model-test",
        )
        cls.other_organisation = Organisation.objects.create(
            name="Other Domain Organisation",
            slug="other-domain-organisation-model-test",
        )

    def test_defaults_and_string_representation(self):
        domain = OrganisationDomain.objects.create(
            organisation=self.organisation,
            domain="app.example.com",
        )

        self.assertFalse(domain.is_primary)
        self.assertEqual(str(domain), "app.example.com")

    def test_domain_must_be_globally_unique(self):
        OrganisationDomain.objects.create(
            organisation=self.organisation,
            domain="unique.example.com",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                OrganisationDomain.objects.create(
                    organisation=self.other_organisation,
                    domain="unique.example.com",
                )


class OrganisationAISettingsModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.organisation = Organisation.objects.create(
            name="AI Settings Organisation",
            slug="ai-settings-organisation-model-test",
            is_active=True,
        )

    def create_settings(self, **overrides):
        data = {"organisation": self.organisation}
        data.update(overrides)
        return OrganisationAISettings.objects.create(**data)

    def test_defaults_and_string_representation(self):
        ai_settings = self.create_settings()

        self.assertEqual(ai_settings.provider, "openai")
        self.assertFalse(ai_settings.is_enabled)
        self.assertTrue(ai_settings.translations_enabled)
        self.assertEqual(ai_settings.default_model, "gpt-5.5")
        self.assertFalse(ai_settings.has_api_key)
        self.assertEqual(ai_settings.provider_api_key, "")
        self.assertFalse(ai_settings.ai_ready)
        self.assertEqual(
            str(ai_settings),
            "AI Settings - AI Settings Organisation",
        )

    def test_set_provider_api_key_updates_presence_and_timestamp(self):
        ai_settings = self.create_settings()

        ai_settings.set_provider_api_key("  encrypted-test-value  ")

        self.assertEqual(
            ai_settings.provider_api_key,
            "encrypted-test-value",
        )
        self.assertTrue(ai_settings.has_api_key)
        self.assertIsNotNone(ai_settings.provider_api_key_last_updated)

    def test_set_empty_provider_api_key_clears_presence_and_timestamp(self):
        ai_settings = self.create_settings(
            provider_api_key="old-value",
            has_api_key=True,
        )

        ai_settings.set_provider_api_key("   ")

        self.assertEqual(ai_settings.provider_api_key, "")
        self.assertFalse(ai_settings.has_api_key)
        self.assertIsNone(ai_settings.provider_api_key_last_updated)

    def test_clear_provider_api_key_removes_secret_state(self):
        ai_settings = self.create_settings()
        ai_settings.set_provider_api_key("encrypted-test-value")

        ai_settings.clear_provider_api_key()

        self.assertEqual(ai_settings.provider_api_key, "")
        self.assertFalse(ai_settings.has_api_key)
        self.assertIsNone(ai_settings.provider_api_key_last_updated)

    def test_ai_ready_requires_enabled_key_flag_and_stored_value(self):
        cases = (
            (False, False, "", False),
            (True, False, "", False),
            (True, True, "", False),
            (True, False, "encrypted", False),
            (False, True, "encrypted", False),
            (True, True, "encrypted", True),
        )

        for index, (enabled, has_key, stored_key, expected) in enumerate(cases):
            with self.subTest(index=index):
                ai_settings = OrganisationAISettings(
                    organisation=self.organisation,
                    is_enabled=enabled,
                    has_api_key=has_key,
                    provider_api_key=stored_key,
                )

                self.assertEqual(ai_settings.ai_ready, expected)

    def test_only_one_ai_settings_record_is_allowed_per_organisation(self):
        self.create_settings()

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.create_settings()
