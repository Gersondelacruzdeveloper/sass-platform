"""Public booking / checkout API security and tenant-isolation tests.

This suite covers public booking creation, confirmation, seller-link behavior,
pickup data, and public checkout boundaries. External notification/provider
calls are mocked or avoided.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    Booking,
    ExperienceProduct,
    PickupLocation,
    PickupZone,
    ProductPickupSchedule,
    Seller,
    TicketingPublicSiteSettings,
    TicketingSettings,
)


class PublicBookingAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Public Booking Organisation A",
            slug="public-booking-a",
            business_type="ticketing",
            is_active=True,
            email="owner-a@example.test",
        )
        cls.org_b = Organisation.objects.create(
            name="Public Booking Organisation B",
            slug="public-booking-b",
            business_type="ticketing",
            is_active=True,
            email="owner-b@example.test",
        )
        cls.inactive_org = Organisation.objects.create(
            name="Public Booking Inactive",
            slug="public-booking-inactive",
            business_type="ticketing",
            is_active=False,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Public Booking Site A",
            custom_domain="booking-a.example.test",
            canonical_url="https://booking-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Public Booking Site B",
            custom_domain="booking-b.example.test",
            canonical_url="https://booking-b.example.test",
            is_published=True,
        )
        cls.inactive_site = TicketingPublicSiteSettings.objects.create(
            organisation=cls.inactive_org,
            site_title="Inactive Booking Site",
            custom_domain="inactive-booking.example.test",
            is_published=True,
        )

        cls.settings_a = TicketingSettings.objects.create(
            organisation=cls.org_a,
            allow_public_bookings=True,
        )
        cls.settings_b = TicketingSettings.objects.create(
            organisation=cls.org_b,
            allow_public_bookings=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Public Excursion A",
            slug="public-excursion-a",
            sku="PUBLIC-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("100.00"),
            child_price=Decimal("50.00"),
            infant_price=Decimal("0.00"),
            adult_cost_price=Decimal("60.00"),
            child_cost_price=Decimal("30.00"),
            infant_cost_price=Decimal("0.00"),
            base_price=Decimal("100.00"),
            cost_price=Decimal("60.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Public Excursion",
            slug="foreign-public-excursion",
            sku="PUBLIC-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            seller_enabled=True,
            adult_price=Decimal("200.00"),
            base_price=Decimal("200.00"),
            cost_price=Decimal("120.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Public Product",
            slug="hidden-public-product",
            sku="PUBLIC-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            seller_enabled=True,
            adult_price=Decimal("80.00"),
            base_price=Decimal("80.00"),
        )

        User = get_user_model()
        cls.seller_user_a = User.objects.create_user(
            username="public-booking-seller-a",
            email="seller-a@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_a,
        )
        cls.seller_user_b = User.objects.create_user(
            username="public-booking-seller-b",
            email="seller-b@example.test",
            password="Strong-test-password-123",
            organisation=cls.org_b,
        )
        cls.seller_a = Seller.objects.create(
            organisation=cls.org_a,
            user=cls.seller_user_a,
            full_name="Seller A",
            seller_slug="seller-a-public",
            application_status="approved",
            is_active=True,            can_sell_excursions=True,
        )
        cls.seller_b = Seller.objects.create(
            organisation=cls.org_b,
            user=cls.seller_user_b,
            full_name="Seller B",
            seller_slug="seller-b-public",
            application_status="approved",
            is_active=True,            can_sell_excursions=True,
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Bavaro",
            is_active=True,
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Foreign Zone",
            is_active=True,
        )
        cls.location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a-public",
            location_type="hotel",
            default_pickup_point="Lobby A",
            is_active=True,
        )
        cls.location_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Foreign Hotel",
            slug="foreign-hotel-public",
            location_type="hotel",
            is_active=True,
        )

        cls.service_date = date.today() + timedelta(days=7)
        cls.schedule_a = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            specific_date=cls.service_date,
            pickup_time=time(7, 30),
            pickup_point="Main lobby",
            is_active=True,
        )

        cls.existing_a = Booking.objects.create(
            organisation=cls.org_a,
            primary_product=cls.product_a,
            customer_name="Private Customer A",
            customer_email="private-a@example.test",
            customer_whatsapp="+18095550101",
            customer_hotel="Hotel A",
            service_date=cls.service_date,
            adults=1,
            total_amount=Decimal("100.00"),
            balance_due=Decimal("100.00"),
            status="confirmed",
        )
        cls.existing_b = Booking.objects.create(
            organisation=cls.org_b,
            primary_product=cls.product_b,
            customer_name="Foreign Private Customer",
            customer_email="foreign-private@example.test",
            customer_whatsapp="+18095550202",
            customer_hotel="Foreign Hotel",
            service_date=cls.service_date,
            adults=1,
            total_amount=Decimal("200.00"),
            balance_due=Decimal("200.00"),
            status="confirmed",
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def public_booking_url(self, organisation=None):
        if organisation is None:
            return reverse("ticketing-public-bookings-list")
        return (
            reverse("ticketing-public-bookings-list")
            + f"?organisation_slug={organisation.slug}"
        )

    def valid_payload(self, **overrides):
        payload = {
            "primary_product": self.product_a.pk,
            "service_date": self.service_date.isoformat(),
            "customer_name": "Checkout Customer",
            "customer_whatsapp": "+18095550999",
            "customer_email": "checkout@example.test",
            "customer_hotel": "Hotel A",
            "adults": 2,
            "children": 1,
            "infants": 0,
            "payment_mode": "pending_payment",
            "payment_method": "cash",
            "items_payload": [
                {
                    "product_id": self.product_a.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 1,
                }
            ],
        }
        payload.update(overrides)
        return payload

    def test_public_booking_url_names_reverse(self):
        self.assertEqual(
            reverse("ticketing-public-bookings-list"),
            "/api/ticketing/public/bookings/",
        )
        self.assertEqual(
            reverse(
                "ticketing-public-seller-bookings",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "seller_slug": self.seller_a.seller_slug,
                },
            ),
            (
                f"/api/ticketing/public/{self.org_a.slug}/s/"
                f"{self.seller_a.seller_slug}/bookings/"
            ),
        )
        self.assertEqual(
            reverse(
                "ticketing-public-booking-confirmation",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "booking_code": self.existing_a.booking_code,
                },
            ),
            (
                f"/api/ticketing/public/{self.org_a.slug}/confirmation/"
                f"{self.existing_a.booking_code}/"
            ),
        )

    def test_public_booking_create_requires_tenant_resolution(self):
        response = self.client.post(
            reverse("ticketing-public-bookings-list"),
            self.valid_payload(),
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_public_booking_create_rejects_inactive_organisation(self):
        response = self.client.post(
            reverse("ticketing-public-bookings-list"),
            self.valid_payload(),
            format="json",
            QUERY_STRING=f"organisation_slug={self.inactive_org.slug}",
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_booking_disabled_setting_blocks_checkout(self):
        self.settings_a.allow_public_bookings = False
        self.settings_a.save(update_fields=["allow_public_bookings"])

        response = self.client.post(
            self.public_booking_url(self.org_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Booking.objects.filter(
                organisation=self.org_a,
                customer_email="checkout@example.test",
            ).exists()
        )

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_booking_success_uses_backend_passenger_prices(
        self,
        notify,
    ):
        response = self.client.post(
            self.public_booking_url(self.org_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.organisation_id, self.org_a.pk)
        self.assertEqual(booking.source, "public_site")
        self.assertEqual(booking.subtotal_amount, Decimal("250.00"))
        self.assertEqual(booking.total_amount, Decimal("250.00"))
        self.assertEqual(booking.balance_due, Decimal("250.00"))
        self.assertEqual(booking.customer_discount_percent, Decimal("0.00"))
        self.assertEqual(booking.seller_margin_percent, Decimal("0.00"))

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_browser_cannot_force_financial_allowances(
        self,
        notify,
    ):
        payload = self.valid_payload(
            seller_margin_percent="99.00",
            customer_discount_percent="99.00",
            customer_discount_amount="999.00",
            discount_amount="999.00",
        )

        response = self.client.post(
            self.public_booking_url(self.org_a),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.seller_margin_percent, Decimal("0.00"))
        self.assertEqual(booking.customer_discount_percent, Decimal("0.00"))
        self.assertEqual(booking.customer_discount_amount, Decimal("0.00"))
        self.assertEqual(booking.discount_amount, Decimal("0.00"))

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_browser_cannot_lower_local_product_unit_price(
        self,
        notify,
    ):
        payload = self.valid_payload(
            items_payload=[
                {
                    "product_id": self.product_a.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 1,
                    "unit_price": "1.00",
                    "unit_cost": "0.01",
                }
            ]
        )

        response = self.client.post(
            self.public_booking_url(self.org_a),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        item = booking.items.get()
        self.assertEqual(item.unit_price, Decimal("100.00"))
        self.assertEqual(item.unit_cost, Decimal("60.00"))
        self.assertEqual(booking.total_amount, Decimal("250.00"))

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_booking_rejects_non_public_product(
        self,
        notify,
    ):
        payload = self.valid_payload(
            primary_product=self.hidden_product_a.pk,
            items_payload=[
                {
                    "product_id": self.hidden_product_a.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 1,
                }
            ],
        )

        response = self.client.post(
            self.public_booking_url(self.org_a),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Booking.objects.filter(
                organisation=self.org_a,
                primary_product=self.hidden_product_a,
            ).exists()
        )
        notify.assert_not_called()

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_booking_cannot_use_foreign_tenant_product(
        self,
        notify,
    ):
        payload = self.valid_payload(
            primary_product=self.product_b.pk,
            items_payload=[
                {
                    "product_id": self.product_b.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 1,
                }
            ],
        )

        response = self.client.post(
            self.public_booking_url(self.org_a),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            Booking.objects.filter(
                organisation=self.org_a,
                primary_product=self.product_b,
            ).exists()
        )
        notify.assert_not_called()

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_public_booking_rejects_zero_item_quantity(self, notify):
        payload = self.valid_payload(
            items_payload=[
                {
                    "product_id": self.product_a.pk,
                    "service_date": self.service_date.isoformat(),
                    "quantity": 0,
                }
            ]
        )

        response = self.client.post(
            self.public_booking_url(self.org_a),
            payload,
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        notify.assert_not_called()

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_foreign_seller_slug_cannot_assign_cross_tenant_seller(
        self,
        notify,
    ):
        url = reverse(
            "ticketing-public-seller-bookings",
            kwargs={
                "organisation_slug": self.org_a.slug,
                "seller_slug": self.seller_b.seller_slug,
            },
        )

        response = self.client.post(url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertIsNone(booking.seller_id)
        self.assertNotEqual(booking.seller_id, self.seller_b.pk)
        self.assertEqual(booking.organisation_id, self.org_a.pk)

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_valid_same_tenant_seller_link_assigns_seller(
        self,
        notify,
    ):
        url = reverse(
            "ticketing-public-seller-bookings",
            kwargs={
                "organisation_slug": self.org_a.slug,
                "seller_slug": self.seller_a.seller_slug,
            },
        )

        response = self.client.post(url, self.valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        booking = Booking.objects.get(pk=response.data["id"])
        self.assertEqual(booking.seller_id, self.seller_a.pk)
        self.assertEqual(booking.source, "seller_public_link")

    def test_public_confirmation_is_scoped_by_booking_code_and_tenant(self):
        response = self.client.get(
            reverse(
                "ticketing-public-booking-confirmation",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "booking_code": self.existing_a.booking_code,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertIn(self.existing_a.booking_code, payload)
        self.assertIn("Private Customer A", payload)
        self.assertNotIn("Foreign Private Customer", payload)

    def test_public_confirmation_cannot_read_foreign_tenant_booking_code(self):
        response = self.client.get(
            reverse(
                "ticketing-public-booking-confirmation",
                kwargs={
                    "organisation_slug": self.org_a.slug,
                    "booking_code": self.existing_b.booking_code,
                },
            )
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])
        self.assertNotIn("Foreign Private Customer", str(response.data))

    def test_public_booking_list_does_not_expose_all_customer_bookings(self):
        response = self.client.get(
            reverse("ticketing-public-bookings-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_404_NOT_FOUND,
        )
        payload = str(getattr(response, "data", ""))
        self.assertNotIn("Private Customer A", payload)
        self.assertNotIn("private-a@example.test", payload)

    def test_public_pickup_locations_are_published_site_and_tenant_scoped(self):
        response = self.client.get(
            reverse("ticketing-public-pickup-locations-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row["id"] for row in self.rows(response)}
        self.assertIn(self.location_a.pk, ids)
        self.assertNotIn(self.location_b.pk, ids)

    def test_public_pickup_locations_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            reverse("ticketing-public-pickup-locations-list"),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_pickup_schedule_resolves_exact_date(self):
        response = self.client.get(
            reverse(
                "ticketing-public-pickup-schedule-resolve-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {
                "product": self.product_a.pk,
                "pickup_location": self.location_a.pk,
                "service_date": self.service_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])
        self.assertEqual(
            response.data["schedule"]["id"],
            self.schedule_a.pk,
        )

    def test_public_pickup_schedule_rejects_foreign_product(self):
        response = self.client.get(
            reverse(
                "ticketing-public-pickup-schedule-resolve-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {
                "product": self.product_b.pk,
                "pickup_location": self.location_a.pk,
                "service_date": self.service_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_pickup_schedule_rejects_foreign_location(self):
        response = self.client.get(
            reverse(
                "ticketing-public-pickup-schedule-resolve-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {
                "product": self.product_a.pk,
                "pickup_location": self.location_b.pk,
                "service_date": self.service_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_pickup_schedule_requires_valid_date(self):
        response = self.client.get(
            reverse(
                "ticketing-public-pickup-schedule-resolve-by-slug",
                kwargs={"organisation_slug": self.org_a.slug},
            ),
            {
                "product": self.product_a.pk,
                "pickup_location": self.location_a.pk,
                "service_date": "not-a-date",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    @patch(
        "ticketing.serializers.BookingSerializer._send_booking_notification_after_commit"
    )
    def test_unpublished_public_site_cannot_accept_new_public_booking(
        self,
        notify,
    ):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.post(
            self.public_booking_url(self.org_a),
            self.valid_payload(),
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        notify.assert_not_called()
