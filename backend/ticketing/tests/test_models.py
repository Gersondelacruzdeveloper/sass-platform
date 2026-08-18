"""Additional model, constraint and invariant coverage for ticketing.

Existing ticketing model suites already cover Booking, BookingItem, payments,
commissions, receipts, admissions, financial snapshots, business agreements,
customer AI, and settlement primitives. This module focuses on model families
that previously had little or no direct coverage.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone
from organisations.models import Organisation

from ticketing.models import (
    BlogCategory,
    BlogPost,
    EventTicketType,
    ExperienceCategory,
    ExperiencePackage,
    ExperienceProduct,
    ExternalProviderConfig,
    NotificationLog,
    PickupLocation,
    PickupZone,
    ProductAvailability,
    ProductPickupSchedule,
    ProductReview,
    ProductURLAlias,
    Seller,
    SellerPayoutAccount,
    SellerSignupInvite,
    TicketingEmailSettings,
    TicketingPaymentProviderSettings,
    TicketingPublicSiteSettings,
    TicketingWhatsAppSettings,
    TransferPriceBand,
    TransferRoute,
)


class AdditionalTicketingModelTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Model Coverage Organisation A",
            slug="model-coverage-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Model Coverage Organisation B",
            slug="model-coverage-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Excursions A",
            slug="excursions-a",
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Excursions B",
            slug="excursions-b",
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Saona Model A",
            slug="saona-model-a",
            sku="MODEL-A",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Saona Model B",
            slug="saona-model-b",
            sku="MODEL-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            adult_cost_price=Decimal("120.00"),
            base_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
        )
        cls.transfer_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Transfer Model A",
            slug="transfer-model-a",
            sku="TRANSFER-MODEL-A",
            product_type="transfer",
            status="active",
            is_active=True,
            adult_price=Decimal("50.00"),
            base_price=Decimal("50.00"),
        )

        User = get_user_model()
        cls.seller_user_a = User.objects.create_user(
            username="model-seller-a",
            email="model-seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a,
            full_name="Model Seller A",
            seller_slug="model-seller-a",
            role="seller",
            application_status="approved",
            is_active=True,
        )

    # ------------------------------------------------------------------
    # Public site settings / URL helpers
    # ------------------------------------------------------------------

    def test_public_site_normalizes_custom_domain_and_sets_pending_status(self):
        settings = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            custom_domain="HTTPS://WWW.Example.COM:443/path/to/page",
        )

        self.assertEqual(settings.custom_domain, "www.example.com")
        self.assertEqual(settings.domain_status, "pending_aws_setup")

    def test_public_site_clearing_domain_resets_domain_infrastructure_state(self):
        settings = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            custom_domain="www.example.com",
            domain_status="active",
            aws_acm_certificate_arn="arn:aws:acm:private",
            aws_acm_certificate_status="ISSUED",
            aws_acm_validation_record_name="_validation.example.com",
            aws_acm_validation_record_value="_value.acm-validations.aws",
            cloudfront_alias_added_at=timezone.now(),
            dns_records_payload=[{"secret": "value"}],
        )

        settings.custom_domain = ""
        settings.save()
        settings.refresh_from_db()

        self.assertIsNone(settings.custom_domain)
        self.assertEqual(settings.domain_status, "not_configured")
        self.assertEqual(settings.aws_acm_certificate_arn, "")
        self.assertEqual(settings.aws_acm_certificate_status, "")
        self.assertEqual(settings.aws_acm_validation_record_name, "")
        self.assertEqual(settings.aws_acm_validation_record_value, "")
        self.assertIsNone(settings.cloudfront_alias_added_at)
        self.assertEqual(settings.dns_records_payload, [])

    def test_public_site_product_url_pattern_falls_back_when_custom_pattern_invalid(self):
        settings = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            product_url_pattern="custom",
            custom_product_url_pattern="/things-to-do/no-placeholder",
        )

        self.assertEqual(settings.get_product_url_pattern(), "/product/{slug}")
        self.assertEqual(
            settings.build_product_path(self.product_a),
            "/product/saona-model-a",
        )

    def test_public_site_builds_dns_records_from_ssl_and_cloudfront_state(self):
        settings = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            custom_domain="www.example.com",
            aws_acm_validation_record_name="_abc.example.com",
            aws_acm_validation_record_value="_xyz.acm-validations.aws",
            aws_acm_certificate_status="PENDING_VALIDATION",
            cloudfront_domain_name="d123.cloudfront.net",
            domain_status="pending_dns",
        )

        records = settings.build_dns_records_payload()

        self.assertEqual(len(records), 2)
        self.assertEqual(records[0]["purpose"], "ssl_validation")
        self.assertEqual(records[1]["purpose"], "website")
        self.assertEqual(records[1]["host"], "www.example.com")
        self.assertEqual(records[1]["value"], "d123.cloudfront.net")

    # ------------------------------------------------------------------
    # Catalog / slugs / aliases / blog
    # ------------------------------------------------------------------

    def test_category_slug_is_generated_when_blank(self):
        category = ExperienceCategory.objects.create(
            organisation=self.org_a,
            name="Private Tours",
            slug="",
        )
        self.assertEqual(category.slug, "private-tours")

    def test_category_slug_is_unique_per_organisation_but_reusable_cross_tenant(self):
        ExperienceCategory.objects.create(
            organisation=self.org_a,
            name="Shared",
            slug="shared-slug",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ExperienceCategory.objects.create(
                    organisation=self.org_a,
                    name="Duplicate",
                    slug="shared-slug",
                )

        other = ExperienceCategory.objects.create(
            organisation=self.org_b,
            name="Shared B",
            slug="shared-slug",
        )
        self.assertEqual(other.slug, "shared-slug")

    def test_product_save_keeps_legacy_base_and_cost_prices_in_sync(self):
        product = ExperienceProduct.objects.create(
            organisation=self.org_a,
            name="Legacy Price Product",
            slug="legacy-price-product",
            sku="LEGACY-PRICE",
            product_type="excursion",
            adult_price=Decimal("0.00"),
            adult_cost_price=Decimal("0.00"),
            base_price=Decimal("88.00"),
            cost_price=Decimal("44.00"),
        )

        self.assertEqual(product.adult_price, Decimal("88.00"))
        self.assertEqual(product.adult_cost_price, Decimal("44.00"))
        self.assertEqual(product.base_price, Decimal("88.00"))
        self.assertEqual(product.cost_price, Decimal("44.00"))

    def test_product_profit_per_unit_uses_adult_prices(self):
        self.assertEqual(self.product_a.profit_per_unit, Decimal("40.00"))

    def test_product_url_alias_normalizes_full_url_query_fragment_and_trailing_slash(self):
        alias = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path="https://old.example.test/excursions/saona/?ref=abc#section",
        )

        self.assertEqual(alias.path, "/excursions/saona")

    def test_new_primary_alias_demotes_previous_primary(self):
        first = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path="/old-primary",
            is_primary=True,
        )
        second = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path="/new-primary",
            is_primary=True,
        )

        first.refresh_from_db()
        self.assertFalse(first.is_primary)
        self.assertTrue(second.is_primary)

    def test_product_url_alias_path_is_unique_within_tenant(self):
        ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path="/legacy/saona",
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductURLAlias.objects.create(
                    organisation=self.org_a,
                    product=self.product_a,
                    path="/legacy/saona/",
                )

    def test_product_url_alias_mark_hit_increments_and_timestamps(self):
        alias = ProductURLAlias.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            path="/hit-me",
        )

        alias.mark_hit()
        alias.refresh_from_db()

        self.assertEqual(alias.hit_count, 1)
        self.assertIsNotNone(alias.last_hit_at)

    def test_blog_category_auto_resolves_same_tenant_slug_collision(self):
        first = BlogCategory.objects.create(
            organisation=self.org_a,
            name="Travel Tips",
            slug="travel-tips",
        )
        second = BlogCategory.objects.create(
            organisation=self.org_a,
            name="Travel Tips",
            slug="travel-tips",
        )

        self.assertEqual(first.slug, "travel-tips")
        self.assertEqual(second.slug, "travel-tips-2")

    def test_blog_post_published_save_sets_published_at_and_unique_slug(self):
        first = BlogPost.objects.create(
            organisation=self.org_a,
            title="Best Beaches",
            slug="best-beaches",
            status="published",
        )
        second = BlogPost.objects.create(
            organisation=self.org_a,
            title="Best Beaches Again",
            slug="best-beaches",
            status="published",
        )

        self.assertIsNotNone(first.published_at)
        self.assertEqual(second.slug, "best-beaches-2")

    def test_blog_post_scheduled_requires_published_at(self):
        post = BlogPost(
            organisation=self.org_a,
            title="Scheduled Article",
            slug="scheduled-article",
            status="scheduled",
        )

        with self.assertRaises(ValidationError) as ctx:
            post.full_clean()

        self.assertIn("published_at", ctx.exception.message_dict)

    def test_blog_post_rejects_cross_tenant_category(self):
        post = BlogPost(
            organisation=self.org_a,
            category=BlogCategory.objects.create(
                organisation=self.org_b,
                name="Foreign Blog",
                slug="foreign-blog",
            ),
            title="Cross Tenant Blog",
            slug="cross-tenant-blog",
        )

        with self.assertRaises(ValidationError) as ctx:
            post.full_clean()

        self.assertIn("category", ctx.exception.message_dict)

    # ------------------------------------------------------------------
    # Availability / pickup / transfer inventory
    # ------------------------------------------------------------------

    def test_availability_remaining_capacity_never_negative(self):
        availability = ProductAvailability.objects.create(
            product=self.product_a,
            date=date.today() + timedelta(days=1),
            available_capacity=5,
            booked_quantity=9,
        )
        self.assertEqual(availability.remaining_capacity, 0)

    def test_product_availability_unique_for_product_package_and_date(self):
        package = ExperiencePackage.objects.create(
            product=self.product_a,
            name="VIP",
            price=Decimal("120.00"),
        )
        service_date = date.today() + timedelta(days=10)
        ProductAvailability.objects.create(
            product=self.product_a,
            package=package,
            date=service_date,
            available_capacity=10,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ProductAvailability.objects.create(
                    product=self.product_a,
                    package=package,
                    date=service_date,
                    available_capacity=20,
                )

    def test_pickup_location_auto_generates_slug(self):
        zone = PickupZone.objects.create(
            organisation=self.org_a,
            name="Bavaro",
        )
        location = PickupLocation.objects.create(
            organisation=self.org_a,
            zone=zone,
            name="Grand Hotel Punta Cana",
            slug="",
        )
        self.assertEqual(location.slug, "grand-hotel-punta-cana")

    def test_pickup_schedule_specific_date_overrides_day_matching(self):
        zone = PickupZone.objects.create(
            organisation=self.org_a,
            name="Punta Cana",
        )
        location = PickupLocation.objects.create(
            organisation=self.org_a,
            zone=zone,
            name="Hotel Date Override",
            slug="hotel-date-override",
            default_pickup_point="Lobby",
        )
        target = date(2026, 8, 20)
        schedule = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=location,
            day_of_week=0,
            specific_date=target,
            pickup_time=time(7, 30),
        )

        self.assertTrue(schedule.applies_to_date(target))
        self.assertFalse(schedule.applies_to_date(target + timedelta(days=1)))
        self.assertEqual(schedule.resolved_pickup_point, "Lobby")

    def test_transfer_and_ticket_capacity_helpers_never_return_negative(self):
        route = TransferRoute.objects.create(
            product=self.transfer_product_a,
            origin="Airport",
            destination="Hotel",
            max_passengers=6,
            price=Decimal("45.00"),
        )
        band = TransferPriceBand.objects.create(
            route=route,
            min_passengers=1,
            max_passengers=4,
            one_way_price=Decimal("50.00"),
        )
        ticket = EventTicketType.objects.create(
            product=self.product_a,
            name="General",
            price=Decimal("75.00"),
            capacity=5,
            sold_quantity=9,
        )

        self.assertEqual(route.organisation.pk, self.org_a.pk)
        self.assertEqual(band.organisation.pk, self.org_a.pk)
        self.assertEqual(ticket.available_tickets, 0)

    def test_transfer_price_band_range_is_unique_per_route(self):
        route = TransferRoute.objects.create(
            product=self.transfer_product_a,
            origin="Airport 2",
            destination="Hotel 2",
            max_passengers=6,
            price=Decimal("45.00"),
        )
        TransferPriceBand.objects.create(
            route=route,
            min_passengers=1,
            max_passengers=4,
            one_way_price=Decimal("50.00"),
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                TransferPriceBand.objects.create(
                    route=route,
                    min_passengers=1,
                    max_passengers=4,
                    one_way_price=Decimal("60.00"),
                )

    # ------------------------------------------------------------------
    # Seller / invite / payout account
    # ------------------------------------------------------------------

    def test_seller_role_default_permissions_and_clear_permissions(self):
        seller = Seller(
            organisation=self.org_a,
            full_name="Role Defaults",
            seller_slug="role-defaults",
            role="seller",
        )
        seller.apply_role_default_permissions()

        self.assertTrue(seller.can_access_dashboard)
        self.assertTrue(seller.can_sell_excursions)
        self.assertFalse(seller.can_manage_settings)

        seller.clear_permissions()
        self.assertTrue(all(not value for value in seller.get_permissions_dict().values()))

    def test_owner_has_permission_even_if_flag_is_false(self):
        seller = Seller(
            organisation=self.org_a,
            full_name="Owner Permission",
            seller_slug="owner-permission",
            role="owner",
            can_manage_settings=False,
        )

        self.assertTrue(seller.has_permission("can_manage_settings"))
        self.assertTrue(seller.has_permission("not_a_real_permission"))

    def test_seller_slug_is_generated_and_public_path_uses_it(self):
        seller = Seller.objects.create(
            organisation=self.org_a,
            full_name="Generated Slug Seller",
            seller_slug="",
        )

        self.assertTrue(seller.seller_slug.startswith("generated-slug-seller-"))
        self.assertEqual(seller.public_path, f"/s/{seller.seller_slug}")

    def test_signup_invite_availability_honours_active_expiry_and_use_limit(self):
        invite = SellerSignupInvite.objects.create(
            organisation=self.org_a,
            name="Invite",
            max_uses=2,
            use_count=0,
            expires_at=timezone.now() + timedelta(hours=1),
        )

        self.assertTrue(invite.is_available)
        invite.use_count = 2
        self.assertFalse(invite.is_available)
        invite.use_count = 0
        invite.expires_at = timezone.now() - timedelta(seconds=1)
        self.assertFalse(invite.is_available)
        invite.expires_at = None
        invite.is_active = False
        self.assertFalse(invite.is_available)

    def test_signup_invite_rejects_invalid_percentages_and_fixed_commission(self):
        invite = SellerSignupInvite(
            organisation=self.org_a,
            name="Invalid Invite",
            default_commission_type="fixed_amount",
            default_fixed_commission_amount=Decimal("0.00"),
            default_commission_rate=Decimal("101.00"),
        )

        with self.assertRaises(ValidationError) as ctx:
            invite.full_clean()

        self.assertIn("default_commission_rate", ctx.exception.message_dict)
        self.assertIn(
            "default_fixed_commission_amount",
            ctx.exception.message_dict,
        )

    def test_payout_account_rejects_cross_tenant_seller(self):
        foreign_user = get_user_model().objects.create_user(
            username="foreign-model-seller",
            email="foreign-model-seller@example.test",
            password="Strong-test-password-123",
            organisation=self.org_b,
        )
        foreign_seller = Seller.objects.create(
            organisation=self.org_b,
            user=foreign_user,
            full_name="Foreign Seller",
            seller_slug="foreign-model-seller",
        )
        account = SellerPayoutAccount(
            organisation=self.org_a,
            seller=foreign_seller,
            method="bank_transfer",
            account_holder_name="Foreign Seller",
            account_number="1234567890",
        )

        with self.assertRaises(ValidationError) as ctx:
            account.full_clean()

        self.assertIn("seller", ctx.exception.message_dict)

    def test_payout_account_default_is_unique_per_seller_and_destination_is_masked(self):
        first = SellerPayoutAccount.objects.create(
            organisation=self.org_a,
            seller=self.seller_a,
            method="bank_transfer",
            account_holder_name="Model Seller A",
            bank_name="Test Bank",
            account_number="1234567890",
            is_default=True,
        )
        second = SellerPayoutAccount.objects.create(
            organisation=self.org_a,
            seller=self.seller_a,
            method="paypal",
            account_holder_name="Model Seller A",
            paypal_email="seller@example.test",
            is_default=True,
        )

        first.refresh_from_db()
        self.assertFalse(first.is_default)
        self.assertTrue(second.is_default)
        self.assertEqual(first.masked_destination, "Test Bank ••••7890")
        self.assertEqual(second.masked_destination, "se***@example.test")

    # ------------------------------------------------------------------
    # Provider/configuration helpers and lightweight audit models
    # ------------------------------------------------------------------

    def test_payment_provider_credential_helpers_require_enabled_and_secret_values(self):
        settings = TicketingPaymentProviderSettings.objects.create(
            organisation=self.org_a,
            stripe_enabled=True,
            stripe_secret_key="sk_test_secret",
            paypal_enabled=True,
            paypal_client_id="paypal-client",
            paypal_client_secret="paypal-secret",
        )

        self.assertTrue(settings.has_stripe_credentials)
        self.assertTrue(settings.has_paypal_credentials)

        settings.stripe_enabled = False
        settings.paypal_client_secret = ""
        self.assertFalse(settings.has_stripe_credentials)
        self.assertFalse(settings.has_paypal_credentials)

    def test_email_settings_provider_defaults_and_from_email(self):
        settings = TicketingEmailSettings.objects.create(
            organisation=self.org_a,
            provider="sendgrid",
            is_active=True,
            smtp_username="mailer@example.test",
            smtp_password="secret",
            sender_name="Bookings",
        )

        self.assertEqual(settings.smtp_host, "smtp.sendgrid.net")
        self.assertEqual(settings.smtp_port, 587)
        self.assertEqual(settings.smtp_encryption, "tls")
        self.assertTrue(settings.has_credentials)
        self.assertEqual(
            settings.from_email,
            "Bookings <mailer@example.test>",
        )

    def test_whatsapp_settings_connection_helpers_and_masking(self):
        settings = TicketingWhatsAppSettings.objects.create(
            organisation=self.org_a,
            is_active=True,
            business_account_id="waba-id",
            phone_number_id="123456789012",
            access_token="secret-token",
            connection_status="not_configured",
        )

        self.assertTrue(settings.has_credentials)
        self.assertFalse(settings.is_connected)
        self.assertEqual(settings.masked_phone_number_id, "********9012")

        settings.mark_connected()
        settings.refresh_from_db()
        self.assertTrue(settings.is_connected)
        self.assertEqual(settings.last_error_message, "")

        settings.mark_failed("provider failure")
        settings.refresh_from_db()
        self.assertEqual(settings.connection_status, "failed")
        self.assertEqual(settings.last_error_message, "provider failure")

    def test_external_provider_config_and_notification_log_string_values(self):
        config = ExternalProviderConfig.objects.create(
            organisation=self.org_a,
            provider="other",
            is_enabled=True,
            api_base_url="https://provider.example.test",
        )
        log = NotificationLog.objects.create(
            organisation=self.org_a,
            channel="email",
            recipient="customer@example.test",
            status="failed",
        )

        self.assertIn(self.org_a.name, str(config))
        self.assertEqual(
            str(log),
            "email - customer@example.test - failed",
        )

    def test_product_review_string_and_tenant_relationship_are_explicit(self):
        review = ProductReview.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            customer_name="Customer",
            rating=4,
            comment="Good tour",
            is_approved=True,
        )

        self.assertEqual(review.organisation_id, self.org_a.pk)
        self.assertEqual(str(review), f"{self.product_a.name} - 4")
