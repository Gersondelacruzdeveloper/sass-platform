"""Public pickup schedule security coverage.

Covers tenant isolation, hidden/inactive products, inactive/foreign pickup
locations, required parameters/date validation, specific-date precedence,
recurring/default schedules, unpublished-site boundary, and absence of
customer/seller/provider/internal contact data.
"""

from __future__ import annotations

from datetime import date, time, timedelta

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceProduct,
    PickupLocation,
    PickupZone,
    ProductPickupSchedule,
    TicketingPublicSiteSettings,
)


class PublicPickupSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Pickup Organisation A",
            slug="pickup-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Pickup Organisation B",
            slug="pickup-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Pickup Site A",
            custom_domain="pickup-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Pickup Site B",
            custom_domain="pickup-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Pickup Product A",
            slug="pickup-product-a",
            sku="PICKUP-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=True,
            requires_pickup_location=True,
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Pickup Product A",
            slug="hidden-pickup-product-a",
            sku="PICKUP-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            supports_pickup=True,
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Pickup Product A",
            slug="inactive-pickup-product-a",
            sku="PICKUP-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            supports_pickup=True,
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Pickup Product B",
            slug="foreign-pickup-product-b",
            sku="PICKUP-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=True,
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Zone A",
            description="Internal zone description A",
            is_active=True,
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Zone B",
            description="Foreign internal zone description",
            is_active=True,
        )

        cls.location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a",
            location_type="hotel",
            address="Public Hotel Address A",
            default_pickup_point="Main lobby",
            default_instructions="Wait in the lobby.",
            google_maps_link="https://maps.example.test/hotel-a",
            is_active=True,
        )
        cls.location_a_inactive = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Inactive Hotel A",
            slug="inactive-hotel-a",
            location_type="hotel",
            address="Inactive address",
            default_pickup_point="Inactive lobby",
            default_instructions="INACTIVE INTERNAL INSTRUCTIONS",
            is_active=False,
        )
        cls.location_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Foreign Hotel B",
            slug="foreign-hotel-b",
            location_type="hotel",
            address="Foreign private address",
            default_pickup_point="Foreign lobby",
            default_instructions="FOREIGN INTERNAL INSTRUCTIONS",
            is_active=True,
        )

        cls.service_date = date.today() + timedelta(days=7)
        cls.weekday = cls.service_date.weekday()

        cls.default_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=None,
            specific_date=None,
            pickup_time=time(8, 0),
            pickup_point="Default pickup point",
            instructions="Default public pickup instructions",
            is_active=True,
        )
        cls.recurring_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=cls.weekday,
            specific_date=None,
            pickup_time=time(8, 30),
            pickup_point="Recurring pickup point",
            instructions="Recurring public pickup instructions",
            is_active=True,
        )
        cls.specific_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=None,
            specific_date=cls.service_date,
            pickup_time=time(9, 0),
            pickup_point="Specific pickup point",
            instructions="Specific public pickup instructions",
            is_active=True,
        )
        cls.inactive_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=cls.weekday,
            pickup_time=time(7, 15),
            pickup_point="Inactive schedule point",
            instructions="INACTIVE SCHEDULE INTERNAL",
            is_active=False,
        )

        ProductPickupSchedule.objects.create(
            product=cls.product_b,
            pickup_location=cls.location_b,
            day_of_week=cls.weekday,
            pickup_time=time(10, 0),
            pickup_point="Foreign pickup point",
            instructions="FOREIGN PICKUP INTERNAL",
            is_active=True,
        )

    def url(self, organisation=None):
        organisation = organisation or self.org_a
        return reverse(
            "ticketing-public-pickup-schedule-resolve-by-slug",
            kwargs={"organisation_slug": organisation.slug},
        )

    def query_url(self):
        return reverse("ticketing-public-pickup-schedule-resolve")

    def params(self, **overrides):
        data = {
            "product": self.product_a.pk,
            "pickup_location": self.location_a.pk,
            "service_date": self.service_date.isoformat(),
        }
        data.update(overrides)
        return data

    def test_public_pickup_routes_reverse(self):
        self.assertEqual(
            self.url(),
            f"/api/ticketing/public/{self.org_a.slug}/pickup-schedules/resolve/",
        )
        self.assertEqual(
            self.query_url(),
            "/api/ticketing/public/pickup-schedules/resolve/",
        )

    def test_query_route_can_resolve_tenant_by_slug_parameter(self):
        response = self.client.get(
            self.query_url(),
            {
                "slug": self.org_a.slug,
                **self.params(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])

    def test_specific_date_schedule_wins_over_recurring_and_default(self):
        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])
        schedule = response.data["schedule"]
        self.assertEqual(schedule["id"], self.specific_schedule.pk)
        self.assertEqual(str(schedule["pickup_time"]), "09:00:00")

    def test_recurring_schedule_wins_when_specific_date_absent(self):
        self.specific_schedule.delete()

        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["schedule"]["id"],
            self.recurring_schedule.pk,
        )

    def test_default_schedule_is_fallback(self):
        self.specific_schedule.delete()
        self.recurring_schedule.delete()

        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["schedule"]["id"],
            self.default_schedule.pk,
        )

    def test_missing_required_parameters_are_rejected(self):
        required_keys = (
            "product",
            "pickup_location",
            "service_date",
        )

        for key in required_keys:
            with self.subTest(key=key):
                params = self.params()
                params.pop(key)

                response = self.client.get(self.url(), params)

                self.assertEqual(
                    response.status_code,
                    status.HTTP_400_BAD_REQUEST,
                )

    def test_invalid_service_date_is_rejected(self):
        response = self.client.get(
            self.url(),
            self.params(service_date="not-a-date"),
        )

        self.assertEqual(
            response.status_code,
            status.HTTP_400_BAD_REQUEST,
        )

    def test_foreign_product_id_cannot_be_resolved(self):
        response = self.client.get(
            self.url(self.org_a),
            self.params(product=self.product_b.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn("FOREIGN PICKUP INTERNAL", payload)

    def test_hidden_product_id_cannot_be_resolved(self):
        response = self.client.get(
            self.url(),
            self.params(product=self.hidden_product_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inactive_product_id_cannot_be_resolved(self):
        response = self.client.get(
            self.url(),
            self.params(product=self.inactive_product_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_foreign_pickup_location_id_cannot_be_resolved(self):
        response = self.client.get(
            self.url(self.org_a),
            self.params(pickup_location=self.location_b.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.location_b.name, payload)
        self.assertNotIn("FOREIGN INTERNAL INSTRUCTIONS", payload)

    def test_inactive_pickup_location_id_cannot_be_resolved(self):
        response = self.client.get(
            self.url(),
            self.params(pickup_location=self.location_a_inactive.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_blocks_pickup_resolution(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_schedule_returns_404_without_internal_data(self):
        no_schedule_date = self.service_date + timedelta(days=2)

        # Remove fallback so the date truly has no applicable schedule.
        self.default_schedule.delete()

        response = self.client.get(
            self.url(),
            self.params(service_date=no_schedule_date.isoformat()),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(response.data["found"])
        payload = str(response.data)
        self.assertNotIn("INACTIVE SCHEDULE INTERNAL", payload)
        self.assertNotIn("FOREIGN PICKUP INTERNAL", payload)

    def test_public_schedule_response_is_minimal_and_same_tenant(self):
        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        schedule = response.data["schedule"]

        self.assertEqual(schedule["product"], self.product_a.pk)
        self.assertEqual(
            schedule["pickup_location"],
            self.location_a.pk,
        )
        self.assertEqual(
            schedule["product_name"],
            self.product_a.name,
        )
        self.assertEqual(
            schedule["pickup_location_name"],
            self.location_a.name,
        )

        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn(self.location_b.name, payload)

    def test_public_schedule_never_exposes_customer_seller_or_provider_contacts(self):
        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for forbidden in (
            "customer_whatsapp",
            "customer_email",
            "seller_whatsapp",
            "supplier_whatsapp",
            "access_token",
            "webhook_verify_token",
            "provider_secret",
            "external_provider",
            "business_account_id",
            "phone_number_id",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_inactive_schedule_is_never_selected(self):
        response = self.client.get(
            self.url(),
            self.params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotEqual(
            response.data["schedule"]["id"],
            self.inactive_schedule.pk,
        )
        self.assertNotIn(
            "INACTIVE SCHEDULE INTERNAL",
            str(response.data),
        )
