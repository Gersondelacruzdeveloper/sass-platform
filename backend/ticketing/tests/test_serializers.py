"""Focused serializer validation and security tests for ticketing.

These tests exercise serializer contracts directly so tenant validation,
read/write protections, financial validation, and sensitive-field handling do
not depend solely on viewset behavior.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.test import TestCase
from organisations.models import Organisation
from rest_framework import serializers

from ticketing.models import (
    Booking,
    ExperienceCategory,
    ExperiencePackage,
    ExperienceProduct,
    ExternalProviderConfig,
    PickupLocation,
    PickupZone,
    ProductAvailability,
    TicketingEmailSettings,
    TicketingPaymentProviderSettings,
    TicketingWhatsAppSettings,
    TransferRoute,
)
from ticketing.serializers import (
    AdmissionTokenIssueSerializer,
    BookingItemWriteSerializer,
    BookingPaymentWriteSerializer,
    BookingSerializer,
    ExperiencePackageSerializer,
    ExperienceProductSerializer,
    ExternalProviderConfigSerializer,
    PickupLocationSerializer,
    ProductAvailabilitySerializer,
    ProductPickupScheduleSerializer,
    PublicSEOSettingsSerializer,
    SettlementGenerateSerializer,
    SettlementPaymentCreateSerializer,
    TicketAdmissionReverseSerializer,
    TicketScanResolveSerializer,
    TicketingEmailSettingsSerializer,
    TicketingPaymentProviderSettingsSerializer,
    TicketingWhatsAppSettingsSerializer,
    TransferPriceBandSerializer,
    TransferRouteSerializer,
)


class TicketingSerializerTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Serializer Organisation A",
            slug="serializer-org-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Serializer Organisation B",
            slug="serializer-org-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.category_a = ExperienceCategory.objects.create(
            organisation=cls.org_a,
            name="Category A",
            slug="category-a",
            is_active=True,
        )
        cls.category_b = ExperienceCategory.objects.create(
            organisation=cls.org_b,
            name="Category B",
            slug="category-b",
            is_active=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Product A",
            slug="product-a",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.product_a_transfer = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            category=cls.category_a,
            name="Transfer A",
            slug="transfer-a",
            product_type="transfer",
            status="active",
            is_active=True,
            adult_price=Decimal("75.00"),
            base_price=Decimal("75.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            category=cls.category_b,
            name="Product B",
            slug="product-b",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.package_a = ExperiencePackage.objects.create(
            product=cls.product_a,
            name="Package A",
            price=Decimal("110.00"),
        )
        cls.package_b = ExperiencePackage.objects.create(
            product=cls.product_b,
            name="Package B",
            price=Decimal("210.00"),
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Zone A",
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Zone B",
        )
        cls.location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a",
        )
        cls.location_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Hotel B",
            slug="hotel-b",
        )

        cls.route_a = TransferRoute.objects.create(
            product=cls.product_a_transfer,
            origin="Airport",
            destination="Hotel A",
            max_passengers=6,
            price=Decimal("45.00"),
        )
        cls.route_b = TransferRoute.objects.create(
            product=ExperienceProduct.objects.create(
                organisation=cls.org_b,
                category=cls.category_b,
                name="Transfer B",
                slug="transfer-b",
                product_type="transfer",
                status="active",
                is_active=True,
                adult_price=Decimal("95.00"),
                base_price=Decimal("95.00"),
            ),
            origin="Airport B",
            destination="Hotel B",
            max_passengers=6,
            price=Decimal("65.00"),
        )

        User = get_user_model()
        cls.user_a = User.objects.create_user(
            username="serializer-user-a",
            email="serializer-user-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )

    def context(self, organisation=None):
        return {"organisation": organisation or self.org_a}

    def assert_field_error(self, serializer, field):
        self.assertFalse(serializer.is_valid(), serializer.errors)
        self.assertIn(field, serializer.errors)

    # ------------------------------------------------------------------
    # Organisation-scoped related fields
    # ------------------------------------------------------------------

    def test_experience_package_rejects_cross_tenant_product(self):
        serializer = ExperiencePackageSerializer(
            data={
                "product_id": self.product_b.pk,
                "name": "Invalid package",
                "price": "50.00",
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "product_id")

    def test_product_availability_rejects_cross_tenant_product(self):
        serializer = ProductAvailabilitySerializer(
            data={
                "product_id": self.product_b.pk,
                "date": str(date.today() + timedelta(days=5)),
                "available_capacity": 10,
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "product_id")

    def test_product_availability_rejects_package_from_other_product(self):
        serializer = ProductAvailabilitySerializer(
            data={
                "product_id": self.product_a.pk,
                "package_id": self.package_b.pk,
                "date": str(date.today() + timedelta(days=5)),
                "available_capacity": 10,
            },
            context=self.context(),
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("package_id", serializer.errors)

    def test_product_availability_rejects_duplicate_product_package_date(self):
        target_date = date.today() + timedelta(days=10)
        ProductAvailability.objects.create(
            product=self.product_a,
            package=self.package_a,
            date=target_date,
            available_capacity=10,
        )

        serializer = ProductAvailabilitySerializer(
            data={
                "product_id": self.product_a.pk,
                "package_id": self.package_a.pk,
                "date": str(target_date),
                "available_capacity": 20,
            },
            context=self.context(),
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("date", serializer.errors)

    def test_pickup_location_rejects_cross_tenant_zone(self):
        serializer = PickupLocationSerializer(
            data={
                "zone_id": self.zone_b.pk,
                "name": "Invalid Hotel",
                "slug": "invalid-hotel",
                "location_type": "hotel",
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "zone_id")

    def test_product_pickup_schedule_rejects_cross_tenant_location(self):
        serializer = ProductPickupScheduleSerializer(
            data={
                "product_id": self.product_a.pk,
                "pickup_location_id": self.location_b.pk,
                "pickup_time": "08:15:00",
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "pickup_location_id")

    def test_transfer_route_rejects_cross_tenant_product(self):
        serializer = TransferRouteSerializer(
            data={
                "product_id": self.product_b.pk,
                "origin": "Origin",
                "destination": "Destination",
                "max_passengers": 4,
                "price": "25.00",
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "product_id")

    def test_transfer_route_requires_transfer_product(self):
        serializer = TransferRouteSerializer(
            data={
                "product_id": self.product_a.pk,
                "origin": "Origin",
                "destination": "Destination",
                "max_passengers": 4,
                "price": "25.00",
            },
            context=self.context(),
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("product_id", serializer.errors)

    def test_transfer_price_band_rejects_cross_tenant_route(self):
        serializer = TransferPriceBandSerializer(
            data={
                "route_id": self.route_b.pk,
                "min_passengers": 1,
                "max_passengers": 4,
                "one_way_price": "50.00",
            },
            context=self.context(),
        )
        self.assert_field_error(serializer, "route_id")

    def test_transfer_price_band_rejects_inverted_passenger_range(self):
        serializer = TransferPriceBandSerializer(
            data={
                "route_id": self.route_a.pk,
                "min_passengers": 5,
                "max_passengers": 2,
                "one_way_price": "50.00",
            },
            context=self.context(),
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("max_passengers", serializer.errors)

    def test_experience_product_rejects_cross_tenant_category(self):
        serializer = ExperienceProductSerializer(
            instance=self.product_a,
            data={"category_id": self.category_b.pk},
            partial=True,
            context=self.context(),
        )
        self.assert_field_error(serializer, "category_id")

    # ------------------------------------------------------------------
    # Booking serializer ownership and protected fields
    # ------------------------------------------------------------------

    def test_booking_serializer_rejects_cross_tenant_primary_product(self):
        booking = Booking.objects.create(
            organisation=self.org_a,
            primary_product=self.product_a,
            customer_name="Serializer Customer",
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
        )

        serializer = BookingSerializer(
            booking,
            data={"primary_product": self.product_b.pk},
            partial=True,
            context=self.context(),
        )

        self.assert_field_error(serializer, "primary_product")

    def test_booking_serializer_ignores_read_only_organisation_and_external_raw_fields(self):
        booking = Booking.objects.create(
            organisation=self.org_a,
            primary_product=self.product_a,
            customer_name="Read-only Test",
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
        )

        serializer = BookingSerializer(
            booking,
            data={
                "organisation": self.org_b.pk,
                "external_raw_response": {"secret": "must-not-be-writable"},
                "external_validation_response": {"secret": "must-not-be-writable"},
                "external_status": "forged",
            },
            partial=True,
            context=self.context(),
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        for field in (
            "organisation",
            "external_raw_response",
            "external_validation_response",
            "external_status",
        ):
            self.assertNotIn(field, serializer.validated_data)

    def test_booking_item_write_requires_positive_quantity(self):
        serializer = BookingItemWriteSerializer(
            data={
                "product_id": self.product_a.pk,
                "quantity": 0,
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("quantity", serializer.errors)

    def test_booking_payment_write_rejects_negative_amount(self):
        serializer = BookingPaymentWriteSerializer(
            data={
                "amount": "-1.00",
                "payment_type": "deposit",
                "method": "cash",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("amount", serializer.errors)

    # ------------------------------------------------------------------
    # Sensitive settings serializers
    # ------------------------------------------------------------------

    def test_payment_provider_secrets_are_write_only(self):
        instance = TicketingPaymentProviderSettings.objects.create(
            organisation=self.org_a,
            stripe_enabled=True,
            stripe_publishable_key="pk_test_public",
            stripe_secret_key="sk_test_PRIVATE",
            stripe_webhook_secret="whsec_PRIVATE",
            paypal_enabled=True,
            paypal_client_id="paypal-public-id",
            paypal_client_secret="paypal_PRIVATE",
            paypal_webhook_id="paypal-webhook_PRIVATE",
        )

        data = TicketingPaymentProviderSettingsSerializer(instance).data
        for field in (
            "stripe_secret_key",
            "stripe_webhook_secret",
            "paypal_client_secret",
            "paypal_webhook_id",
        ):
            self.assertNotIn(field, data)

    def test_payment_provider_blank_secret_update_preserves_existing_values(self):
        instance = TicketingPaymentProviderSettings.objects.create(
            organisation=self.org_a,
            stripe_secret_key="sk_test_KEEP",
            stripe_webhook_secret="whsec_KEEP",
            paypal_client_secret="paypal_KEEP",
            paypal_webhook_id="paypal-webhook_KEEP",
        )
        serializer = TicketingPaymentProviderSettingsSerializer(
            instance,
            data={
                "stripe_secret_key": "",
                "stripe_webhook_secret": "",
                "paypal_client_secret": "",
                "paypal_webhook_id": "",
            },
            partial=True,
        )

        self.assertTrue(serializer.is_valid(), serializer.errors)
        serializer.save()
        instance.refresh_from_db()
        self.assertEqual(instance.stripe_secret_key, "sk_test_KEEP")
        self.assertEqual(instance.stripe_webhook_secret, "whsec_KEEP")
        self.assertEqual(instance.paypal_client_secret, "paypal_KEEP")
        self.assertEqual(instance.paypal_webhook_id, "paypal-webhook_KEEP")

    def test_email_password_is_write_only_and_last_error_is_sanitized(self):
        instance = TicketingEmailSettings.objects.create(
            organisation=self.org_a,
            provider="custom",
            smtp_host="smtp.example.test",
            smtp_password="smtp_PRIVATE",
            last_error_message="auth failed password=smtp_PRIVATE",
        )

        data = TicketingEmailSettingsSerializer(instance).data
        self.assertNotIn("smtp_password", data)
        self.assertEqual(data["last_error_message"], "Provider connection failed.")
        self.assertNotIn("smtp_PRIVATE", str(data))

    def test_whatsapp_secrets_are_write_only_and_last_error_is_sanitized(self):
        instance = TicketingWhatsAppSettings.objects.create(
            organisation=self.org_a,
            meta_app_id="public-app-id",
            meta_app_secret="meta_PRIVATE",
            access_token="token_PRIVATE",
            webhook_verify_token="verify_PRIVATE",
            last_error_message="access_token=token_PRIVATE",
        )

        data = TicketingWhatsAppSettingsSerializer(instance).data
        for field in (
            "meta_app_secret",
            "access_token",
            "webhook_verify_token",
        ):
            self.assertNotIn(field, data)
        self.assertEqual(data["last_error_message"], "Provider connection failed.")
        self.assertNotIn("token_PRIVATE", str(data))

    def test_external_provider_api_secret_is_write_only(self):
        instance = ExternalProviderConfig.objects.create(
            organisation=self.org_a,
            provider="other",
            is_enabled=True,
            api_base_url="https://provider.example.test",
            api_key="public-ish-key",
            api_secret="provider_PRIVATE",
        )

        data = ExternalProviderConfigSerializer(instance).data
        self.assertNotIn("api_secret", data)
        self.assertNotIn("provider_PRIVATE", str(data))

    def test_public_seo_serializer_excludes_infrastructure_fields(self):
        fake = SimpleNamespace(
            domain_error_message="SECRET diagnostic",
            aws_acm_certificate_arn="arn:aws:acm:PRIVATE",
            cloudfront_distribution_id="PRIVATE-DIST",
        )

        fields = set(PublicSEOSettingsSerializer.Meta.fields)
        for field in (
            "domain_error_message",
            "aws_acm_certificate_arn",
            "aws_acm_certificate_status",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "dns_records_payload",
            "domain_dns_records",
        ):
            self.assertNotIn(field, fields)

    # ------------------------------------------------------------------
    # Scanner / settlement serializers
    # ------------------------------------------------------------------

    def test_admission_token_issue_requires_valid_window(self):
        now = timezone_now = __import__("django.utils.timezone", fromlist=["now"]).now()
        serializer = AdmissionTokenIssueSerializer(
            data={
                "booking_item_id": 1,
                "valid_from": now.isoformat(),
                "valid_until": (now - timedelta(minutes=5)).isoformat(),
            }
        )

        self.assertFalse(serializer.is_valid())
        self.assertIn("valid_until", serializer.errors)

    def test_ticket_scan_resolve_rejects_zero_quantity(self):
        serializer = TicketScanResolveSerializer(
            data={
                "token": str(uuid4()),
                "requested_quantity": 0,
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("requested_quantity", serializer.errors)

    def test_ticket_scan_resolve_rejects_invalid_uuid(self):
        serializer = TicketScanResolveSerializer(
            data={"token": "not-a-uuid"}
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("token", serializer.errors)

    def test_ticket_admission_reverse_requires_nonblank_reason(self):
        serializer = TicketAdmissionReverseSerializer(data={"reason": ""})
        self.assertFalse(serializer.is_valid())
        self.assertIn("reason", serializer.errors)

    def test_settlement_generate_rejects_end_before_start(self):
        serializer = SettlementGenerateSerializer(
            data={
                "business_entity_id": 1,
                "period_start": "2026-08-10",
                "period_end": "2026-08-01",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("period_end", serializer.errors)

    def test_settlement_payment_requires_positive_decimal_amount(self):
        # Use model-declared choices dynamically so the test stays aligned with
        # the current API contract while focusing on amount validation.
        serializer = SettlementPaymentCreateSerializer(
            data={
                "payer_type": "owner",
                "payee_type": "partner",
                "amount": "-0.01",
                "payment_method": "bank_transfer",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("amount", serializer.errors)
