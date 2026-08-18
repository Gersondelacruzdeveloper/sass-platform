"""Focused service and utility coverage for ticketing.

This complements the existing finance, cart, admission and integration suites.
All external provider boundaries remain mocked or are avoided entirely.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from organisations.models import Organisation

from ticketing import services
from ticketing.models import (
    Booking,
    BookingItem,
    NotificationLog,
    PickupLocation,
    PickupZone,
    ProductPickupSchedule,
    ProductReview,
    Receipt,
    Seller,
    TicketingEmailSettings,
    TicketingPublicSiteSettings,
    TicketingSettings,
    TicketingWhatsAppSettings,
    ExperienceProduct,
)
from ticketing.notifications.service import BookingNotificationService
from ticketing.notifications import utils as notification_utils


class TicketingServiceTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Service Organisation A",
            slug="service-org-a",
            business_type="ticketing",
            is_active=True,
            email="owner-a@example.test",
            phone="+18095550100",
        )
        cls.org_b = Organisation.objects.create(
            name="Service Organisation B",
            slug="service-org-b",
            business_type="ticketing",
            is_active=True,
            email="owner-b@example.test",
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Service Product A",
            slug="service-product-a",
            sku="SERVICE-A",
            product_type="excursion",
            status="active",
            is_active=True,
            short_description="A public service description.",
            adult_price=Decimal("100.00"),
            adult_cost_price=Decimal("60.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Service Product B",
            slug="service-product-b",
            sku="SERVICE-B",
            product_type="excursion",
            status="active",
            is_active=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Zone A",
        )
        cls.location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a-service",
            default_pickup_point="Main lobby",
            default_instructions="Be ready 10 minutes early.",
        )
        cls.location_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            name="Hotel B",
            slug="hotel-b-service",
        )

        User = get_user_model()
        cls.user_a = User.objects.create_user(
            username="service-user-a",
            email="service-user-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.user_a,
            full_name="Service Seller A",
            seller_slug="service-seller-a",
            application_status="approved",
            is_active=True,
        )

    def make_booking(self, **overrides):
        values = {
            "organisation": self.org_a,
            "primary_product": self.product_a,
            "seller": self.seller_a,
            "customer_name": "Service Customer",
            "customer_email": "customer@example.test",
            "customer_whatsapp": "+18095550199",
            "customer_hotel": "Hotel A",
            "service_date": date.today() + timedelta(days=7),
            "service_time": time(9, 0),
            "adults": 2,
            "children": 1,
            "infants": 0,
            "status": "confirmed",
            "payment_status": "deposit_paid",
            "payment_mode": "deposit",
            "payment_method": "cash",
            "subtotal_amount": Decimal("300.00"),
            "discount_amount": Decimal("10.00"),
            "tax_amount": Decimal("0.00"),
            "total_amount": Decimal("290.00"),
            "deposit_required": Decimal("50.00"),
            "deposit_paid": Decimal("50.00"),
            "balance_due": Decimal("240.00"),
            "seller_collected_amount": Decimal("50.00"),
            "seller_due_to_company": Decimal("40.00"),
            "seller_commission_amount": Decimal("10.00"),
            "created_by": self.user_a,
        }
        values.update(overrides)
        return Booking.objects.create(**values)

    # ------------------------------------------------------------------
    # Generic helpers / settings
    # ------------------------------------------------------------------

    def test_money_normalizes_none_blank_float_and_decimal(self):
        self.assertEqual(services.money(None), Decimal("0.00"))
        self.assertEqual(services.money(""), Decimal("0.00"))
        self.assertEqual(services.money(1.25), Decimal("1.25"))

        original = Decimal("9.99")
        self.assertIs(services.money(original), original)

    def test_get_ticketing_settings_is_idempotent_and_tenant_scoped(self):
        first = services.get_ticketing_settings(self.org_a)
        second = services.get_ticketing_settings(self.org_a)
        foreign = services.get_ticketing_settings(self.org_b)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(first.organisation_id, self.org_a.pk)
        self.assertEqual(foreign.organisation_id, self.org_b.pk)
        self.assertNotEqual(first.pk, foreign.pk)

    def test_get_public_site_settings_sets_public_defaults_and_is_idempotent(self):
        first = services.get_public_site_settings(self.org_a)
        second = services.get_public_site_settings(self.org_a)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(first.site_title, self.org_a.name)
        self.assertEqual(first.public_email, self.org_a.email)
        self.assertEqual(first.public_whatsapp, self.org_a.phone)

    # ------------------------------------------------------------------
    # Pickup resolution
    # ------------------------------------------------------------------

    def test_resolve_pickup_schedule_priority_exact_then_weekday_then_generic(self):
        service_date = date.today() + timedelta(days=10)
        generic = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=self.location_a,
            pickup_time=time(8, 0),
        )
        weekday = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=self.location_a,
            day_of_week=service_date.weekday(),
            pickup_time=time(7, 30),
        )
        exact = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=self.location_a,
            specific_date=service_date,
            pickup_time=time(7, 0),
        )

        self.assertEqual(
            services.resolve_pickup_schedule(
                self.product_a,
                self.location_a,
                service_date,
            ),
            exact,
        )

        exact.delete()
        self.assertEqual(
            services.resolve_pickup_schedule(
                self.product_a,
                self.location_a,
                service_date,
            ),
            weekday,
        )

        weekday.delete()
        self.assertEqual(
            services.resolve_pickup_schedule(
                self.product_a,
                self.location_a,
                service_date,
            ),
            generic,
        )

    def test_resolve_pickup_schedule_returns_none_for_missing_inputs(self):
        self.assertIsNone(
            services.resolve_pickup_schedule(None, self.location_a, date.today())
        )
        self.assertIsNone(
            services.resolve_pickup_schedule(self.product_a, None, date.today())
        )
        self.assertIsNone(
            services.resolve_pickup_schedule(self.product_a, self.location_a, None)
        )

    def test_create_pickup_info_rejects_foreign_location_id_by_returning_none(self):
        booking = self.make_booking()

        result = services.create_or_update_pickup_info(
            booking,
            pickup_location_id=self.location_b.pk,
        )

        self.assertIsNone(result)
        self.assertFalse(hasattr(booking, "pickup_info"))

    def test_create_pickup_info_applies_schedule_and_override(self):
        booking = self.make_booking()
        schedule = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=self.location_a,
            specific_date=booking.service_date,
            pickup_time=time(7, 15),
            pickup_point="Scheduled lobby",
            instructions="Scheduled instructions",
        )

        info = services.create_or_update_pickup_info(
            booking,
            pickup_location=self.location_a,
            override_time=time(7, 45),
            override_point="VIP entrance",
            override_instructions="Call on arrival",
            override_reason="Private pickup",
            overridden_by=self.user_a,
        )

        self.assertEqual(info.pickup_schedule_id, schedule.pk)
        self.assertTrue(info.was_overridden)
        self.assertEqual(info.pickup_time, time(7, 45))
        self.assertEqual(info.pickup_point, "VIP entrance")
        self.assertEqual(info.instructions, "Call on arrival")
        self.assertEqual(info.override_reason, "Private pickup")
        self.assertEqual(info.overridden_by_id, self.user_a.pk)

    # ------------------------------------------------------------------
    # Receipts / confirmation / notifications
    # ------------------------------------------------------------------

    def test_build_receipt_data_serializes_financials_items_and_pickup(self):
        booking = self.make_booking()
        BookingItem.objects.create(
            booking=booking,
            product=self.product_a,
            product_name=self.product_a.name,
            product_type="excursion",
            quantity=2,
            unit_price=Decimal("100.00"),
            unit_cost=Decimal("60.00"),
            total=Decimal("200.00"),
            service_date=booking.service_date,
            service_time=booking.service_time,
            instructions="Bring sunscreen",
        )
        services.create_or_update_pickup_info(
            booking,
            pickup_location=self.location_a,
        )

        data = services.build_receipt_data(booking)

        self.assertEqual(data["booking_code"], booking.booking_code)
        self.assertEqual(data["seller"]["id"], self.seller_a.pk)
        self.assertEqual(data["amounts"]["total"], "290.00")
        self.assertEqual(data["items"][0]["quantity"], 2)
        self.assertEqual(data["items"][0]["unit_price"], "100.00")
        self.assertEqual(data["pickup"]["hotel_or_location_name"], self.location_a.name)

    def test_create_or_update_receipt_is_idempotent_and_refreshes_payload(self):
        booking = self.make_booking()

        first = services.create_or_update_receipt(booking)
        first_number = first.receipt_number
        first_token = first.public_url_token

        booking.customer_name = "Updated Customer"
        booking.save(update_fields=["customer_name"])
        second = services.create_or_update_receipt(booking)

        self.assertEqual(first.pk, second.pk)
        self.assertEqual(second.receipt_number, first_number)
        self.assertEqual(second.public_url_token, first_token)
        self.assertEqual(
            second.receipt_data["customer"]["name"],
            "Updated Customer",
        )

    def test_customer_confirmation_message_contains_expected_public_booking_details(self):
        booking = self.make_booking()
        services.create_or_update_pickup_info(
            booking,
            pickup_location=self.location_a,
            override_time=time(8, 30),
        )

        message = services.build_customer_confirmation_message(booking)

        self.assertIn(booking.booking_code, message)
        self.assertIn(booking.customer_name, message)
        self.assertIn(self.product_a.name, message)
        self.assertIn("Pickup time: 08:30:00", message)
        self.assertIn("Total: 290.00", message)
        self.assertNotIn("provider_response", message)

    def test_log_notification_sets_sent_at_only_for_sent_status(self):
        booking = self.make_booking()

        pending = services.log_notification(
            self.org_a,
            "email",
            "customer@example.test",
            booking=booking,
            status_value="pending",
        )
        sent = services.log_notification(
            self.org_a,
            "email",
            "owner@example.test",
            booking=booking,
            status_value="sent",
        )

        self.assertIsNone(pending.sent_at)
        self.assertIsNotNone(sent.sent_at)

    def test_queue_booking_confirmation_notifications_respects_channel_settings(self):
        booking = self.make_booking()
        settings_obj = services.get_ticketing_settings(self.org_a)
        settings_obj.send_customer_email = True
        settings_obj.send_customer_whatsapp = True
        settings_obj.notify_owner_on_booking = True
        settings_obj.save(
            update_fields=[
                "send_customer_email",
                "send_customer_whatsapp",
                "notify_owner_on_booking",
            ]
        )

        logs = services.queue_booking_confirmation_notifications(booking)

        self.assertEqual(len(logs), 3)
        recipients = {log.recipient for log in logs}
        self.assertEqual(
            recipients,
            {
                booking.customer_email,
                booking.customer_whatsapp,
                self.org_a.email,
            },
        )
        self.assertTrue(all(log.organisation_id == self.org_a.pk for log in logs))
        self.assertTrue(all(log.status == "pending" for log in logs))

    # ------------------------------------------------------------------
    # SEO / provider normalization helpers
    # ------------------------------------------------------------------

    def test_product_json_ld_uses_override_without_losing_base_structure(self):
        self.product_a.json_ld_override = {
            "brand": {"@type": "Brand", "name": "PCD"},
        }
        self.product_a.save(update_fields=["json_ld_override"])

        payload = services.build_product_json_ld(self.product_a)

        self.assertEqual(payload["@type"], "Product")
        self.assertEqual(payload["name"], self.product_a.name)
        self.assertEqual(payload["offers"]["price"], "100.00")
        self.assertEqual(payload["brand"]["name"], "PCD")

    def test_product_json_ld_adds_aggregate_rating_when_reviews_exist(self):
        ProductReview.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            customer_name="One",
            rating=5,
            is_approved=True,
        )
        ProductReview.objects.create(
            organisation=self.org_a,
            product=self.product_a,
            customer_name="Two",
            rating=3,
            is_approved=True,
        )

        self.product_a.average_rating = Decimal("4.00")
        self.product_a.review_count = 2
        self.product_a.save(
            update_fields=["average_rating", "review_count"]
        )
        self.product_a.refresh_from_db()

        payload = services.build_product_json_ld(self.product_a)

        self.assertEqual(payload["aggregateRating"]["reviewCount"], 2)
        self.assertEqual(payload["aggregateRating"]["ratingValue"], "4.00")

    def test_extract_wellet_items_supports_current_and_generic_shapes(self):
        current = {
            "data": {
                "regular_products": [{"id": "r1"}],
                "mesas": [{"id": "m1"}],
                "extras": [{"id": "e1"}],
            }
        }
        generic = {"products": [{"id": "p1"}]}

        self.assertEqual(
            [item["id"] for item in services.extract_wellet_items(current)],
            ["r1", "m1", "e1"],
        )
        self.assertEqual(
            services.extract_wellet_items(generic),
            [{"id": "p1"}],
        )
        self.assertEqual(services.extract_wellet_items("invalid"), [])

    def test_wellet_scalar_normalizers_are_defensive(self):
        self.assertFalse(
            services.normalize_bool_available({"sold_out": True})
        )
        self.assertFalse(
            services.normalize_bool_available({"status": "unavailable"})
        )
        self.assertTrue(
            services.normalize_bool_available({"available": True})
        )

        self.assertEqual(
            services.normalize_available_quantity(
                {"availability": {"remaining": "7"}}
            ),
            7,
        )
        self.assertIsNone(
            services.normalize_available_quantity(
                {"availability": {"remaining": "invalid"}}
            )
        )

        self.assertEqual(
            services.normalize_price(
                {"pricing": {"final_price": "123.45"}}
            ),
            Decimal("123.45"),
        )
        self.assertEqual(
            services.normalize_price({"price": 50}),
            Decimal("50"),
        )

    # ------------------------------------------------------------------
    # Domain utilities
    # ------------------------------------------------------------------

    def test_domain_cleanup_validation_and_dns_helpers(self):
        cleaned = services.clean_custom_domain_value(
            "HTTPS://WWW.Example.COM:443/path"
        )
        self.assertEqual(cleaned, "www.example.com")
        self.assertEqual(
            services.validate_custom_domain_value("www.example.com"),
            "www.example.com",
        )
        self.assertEqual(
            services.guess_dns_zone("shop.www.example.com"),
            "example.com",
        )
        self.assertEqual(
            services.get_godaddy_host_value(
                "_abc.www.example.com.",
                "www.example.com",
            ),
            "_abc.www",
        )
        self.assertEqual(services.strip_dns_dot("value.example.com."), "value.example.com")

    def test_domain_validation_rejects_root_wildcard_and_missing_domain(self):
        for invalid in ("", "example.com", "*.example.com", "localhost"):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    services.validate_custom_domain_value(invalid)

    # ------------------------------------------------------------------
    # Notification context / orchestration helpers
    # ------------------------------------------------------------------

    def test_notification_utils_resolve_tenant_specific_brand_owner_and_url(self):
        booking = self.make_booking()
        site = TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            site_title="Public A",
            custom_domain="www.public-a.example.test",
            public_email="notifications-a@example.test",
        )

        self.assertEqual(
            notification_utils.get_owner_email(booking),
            "notifications-a@example.test",
        )
        self.assertEqual(
            notification_utils.get_brand_name(booking),
            site.display_title,
        )
        self.assertEqual(
            notification_utils.get_public_base_url(booking),
            "https://www.public-a.example.test",
        )

    @override_settings(FRONTEND_APP_URL="https://frontend.example.test/")
    def test_notification_utils_fall_back_to_frontend_url_without_custom_domain(self):
        booking = self.make_booking()
        TicketingPublicSiteSettings.objects.create(
            organisation=self.org_a,
            site_title="Public A",
            custom_domain="",
        )

        self.assertEqual(
            notification_utils.get_public_base_url(booking),
            "https://frontend.example.test",
        )

    def test_build_booking_context_contains_only_same_booking_relations(self):
        booking = self.make_booking()
        item = BookingItem.objects.create(
            booking=booking,
            product=self.product_a,
            product_name=self.product_a.name,
            quantity=1,
            unit_price=Decimal("100.00"),
            unit_cost=Decimal("60.00"),
            total=Decimal("100.00"),
        )

        other_booking = Booking.objects.create(
            organisation=self.org_b,
            primary_product=self.product_b,
            customer_name="Foreign",
            total_amount=Decimal("200.00"),
            balance_due=Decimal("200.00"),
        )
        BookingItem.objects.create(
            booking=other_booking,
            product=self.product_b,
            product_name=self.product_b.name,
            quantity=1,
            unit_price=Decimal("200.00"),
            unit_cost=Decimal("100.00"),
            total=Decimal("200.00"),
        )

        context = notification_utils.build_booking_context(booking)

        self.assertEqual(context["booking"].pk, booking.pk)
        self.assertEqual(list(context["items"]), [item])
        self.assertNotIn(self.product_b.name, str(context))

    def test_notification_service_get_settings_is_tenant_scoped_and_idempotent(self):
        first = BookingNotificationService.get_settings(self.make_booking())
        second = BookingNotificationService.get_settings(self.make_booking())

        for first_obj, second_obj in zip(first, second):
            self.assertEqual(first_obj.pk, second_obj.pk)
            self.assertEqual(first_obj.organisation_id, self.org_a.pk)

    def test_notification_service_channel_availability_helpers_require_credentials(self):
        email_settings = TicketingEmailSettings.objects.create(
            organisation=self.org_a,
            provider="custom",
            is_active=True,
            smtp_host="smtp.example.test",
            smtp_username="user@example.test",
            smtp_password="secret",
        )
        whatsapp_settings = TicketingWhatsAppSettings.objects.create(
            organisation=self.org_a,
            is_active=True,
            business_account_id="waba",
            phone_number_id="phone",
            access_token="secret",
            connection_status="connected",
        )

        self.assertTrue(
            BookingNotificationService.can_send_email(email_settings)
        )
        self.assertTrue(
            BookingNotificationService.can_send_whatsapp(whatsapp_settings)
        )

        email_settings.is_active = False
        whatsapp_settings.connection_status = "failed"
        self.assertFalse(
            BookingNotificationService.can_send_email(email_settings)
        )
        self.assertFalse(
            BookingNotificationService.can_send_whatsapp(whatsapp_settings)
        )

    def test_notification_service_already_sent_uses_booking_channel_audience_and_recipient(self):
        booking = self.make_booking()
        NotificationLog.objects.create(
            organisation=self.org_a,
            booking=booking,
            channel="email",
            recipient="customer@example.test",
            status="sent",
            provider_response={"audience": "customer", "event": "ticket"},
        )

        self.assertTrue(
            BookingNotificationService._already_sent(
                booking=booking,
                channel="email",
                audience="customer",
                recipient="customer@example.test",
            )
        )
        self.assertFalse(
            BookingNotificationService._already_sent(
                booking=booking,
                channel="email",
                audience="owner",
                recipient="customer@example.test",
            )
        )

    def test_notification_safe_dispatch_returns_default_on_exception_without_rethrowing(self):
        booking = self.make_booking()

        with self.assertLogs(
            "ticketing.notifications.service",
            level="ERROR",
        ):
            result = BookingNotificationService._safe_dispatch(
                booking=booking,
                label="Synthetic delivery",
                callback=lambda: (_ for _ in ()).throw(RuntimeError("boom")),
                default=[],
            )

        self.assertEqual(result, [])
