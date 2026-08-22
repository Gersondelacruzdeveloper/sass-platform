"""Nested public pickup schedule security coverage.

Distinct from the pickup schedule resolver API. This suite validates the
`pickup_schedules` embedded inside public product payloads and ensures only
active, same-tenant, public-safe schedule data is exposed.
"""

from __future__ import annotations

from datetime import date, time, timedelta
from decimal import Decimal

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


class PublicNestedPickupSchedulesSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Nested Pickup Organisation A",
            slug="nested-pickup-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Nested Pickup Organisation B",
            slug="nested-pickup-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Nested Pickup Site A",
            custom_domain="nested-pickup-a.example.test",
            canonical_url="https://nested-pickup-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Nested Pickup Site B",
            custom_domain="nested-pickup-b.example.test",
            canonical_url="https://nested-pickup-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Nested Pickup Product A",
            slug="nested-pickup-product-a",
            sku="NESTED-PICKUP-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=True,
            requires_pickup_location=True,
            base_price=Decimal("100.00"),
            adult_price=Decimal("100.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Nested Pickup Product A",
            slug="hidden-nested-pickup-product-a",
            sku="NESTED-PICKUP-HIDDEN-A",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            supports_pickup=True,
            base_price=Decimal("110.00"),
            adult_price=Decimal("110.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Nested Pickup Product A",
            slug="inactive-nested-pickup-product-a",
            sku="NESTED-PICKUP-INACTIVE-A",
            product_type="excursion",
            status="inactive",
            is_active=False,
            public_enabled=True,
            supports_pickup=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Nested Pickup Product B",
            slug="foreign-nested-pickup-product-b",
            sku="NESTED-PICKUP-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=True,
            base_price=Decimal("200.00"),
            adult_price=Decimal("200.00"),
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Zone A",
            description="Internal zone A",
            is_active=True,
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Zone B",
            description="Foreign zone B",
            is_active=True,
        )

        cls.location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a",
            location_type="hotel",
            address="Public hotel address A",
            default_pickup_point="Main lobby",
            default_instructions="Wait by reception.",
            is_active=True,
        )
        cls.location_a_inactive = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Inactive Hotel A",
            slug="inactive-hotel-a",
            location_type="hotel",
            address="INACTIVE PRIVATE ADDRESS",
            default_pickup_point="Inactive lobby",
            default_instructions="INACTIVE LOCATION PRIVATE INSTRUCTIONS",
            is_active=False,
        )
        cls.location_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Foreign Hotel B",
            slug="foreign-hotel-b",
            location_type="hotel",
            address="FOREIGN PRIVATE ADDRESS",
            default_pickup_point="Foreign lobby",
            default_instructions="FOREIGN LOCATION PRIVATE INSTRUCTIONS",
            is_active=True,
        )

        cls.specific_date = date.today() + timedelta(days=7)
        cls.weekday = cls.specific_date.weekday()

        cls.schedule_default = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=None,
            specific_date=None,
            pickup_time=time(8, 0),
            pickup_point="Default public point",
            instructions="Default public instructions",
            is_active=True,
        )
        cls.schedule_weekday = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=cls.weekday,
            specific_date=None,
            pickup_time=time(8, 30),
            pickup_point="Weekday public point",
            instructions="Weekday public instructions",
            is_active=True,
        )
        cls.schedule_specific = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=None,
            specific_date=cls.specific_date,
            pickup_time=time(9, 0),
            pickup_point="Specific public point",
            instructions="Specific public instructions",
            is_active=True,
        )
        cls.schedule_inactive = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a,
            day_of_week=cls.weekday,
            specific_date=None,
            pickup_time=time(7, 15),
            pickup_point="INACTIVE SCHEDULE PRIVATE POINT",
            instructions="INACTIVE SCHEDULE PRIVATE INSTRUCTIONS",
            is_active=False,
        )
        cls.schedule_inactive_location = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.location_a_inactive,
            day_of_week=cls.weekday,
            specific_date=None,
            pickup_time=time(7, 45),
            pickup_point="INACTIVE LOCATION SCHEDULE POINT",
            instructions="INACTIVE LOCATION SCHEDULE INSTRUCTIONS",
            is_active=True,
        )
        cls.foreign_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_b,
            pickup_location=cls.location_b,
            day_of_week=cls.weekday,
            specific_date=None,
            pickup_time=time(10, 0),
            pickup_point="FOREIGN PICKUP PRIVATE POINT",
            instructions="FOREIGN PICKUP PRIVATE INSTRUCTIONS",
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def list_url(self):
        return reverse("ticketing-public-products-list")

    def detail_url(self, product=None):
        product = product or self.product_a
        return reverse(
            "ticketing-public-products-detail",
            kwargs={"slug": product.slug},
        )

    def tenant_params(self, organisation=None, **extra):
        organisation = organisation or self.org_a
        return {"slug": organisation.slug, **extra}

    def get_product_detail(self):
        return self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

    def test_public_product_routes_reverse(self):
        self.assertEqual(
            self.list_url(),
            "/api/ticketing/public/products/",
        )
        self.assertEqual(
            self.detail_url(),
            f"/api/ticketing/public/products/{self.product_a.slug}/",
        )

    def test_product_list_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {row["name"] for row in self.rows(response)}
        self.assertIn(self.product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.product_b.name, names)

    def test_cross_tenant_product_slug_cannot_be_borrowed(self):
        response = self.client.get(
            self.detail_url(self.product_b),
            self.tenant_params(self.org_a),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn("FOREIGN PICKUP PRIVATE INSTRUCTIONS", payload)

    def test_hidden_and_inactive_products_are_not_public(self):
        hidden = self.client.get(
            self.detail_url(self.hidden_product_a),
            self.tenant_params(),
        )
        inactive = self.client.get(
            self.detail_url(self.inactive_product_a),
            self.tenant_params(),
        )

        self.assertEqual(hidden.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(inactive.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_nested_pickup_schedules(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )
        detail_response = self.get_product_detail()

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_product_exposes_only_active_schedules_with_active_locations(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        schedules = response.data["pickup_schedules"]

        self.assertEqual(
            [schedule["id"] for schedule in schedules],
            [
                self.schedule_default.pk,
                self.schedule_weekday.pk,
                self.schedule_specific.pk,
            ],
        )

        payload = str(response.data)
        self.assertNotIn("INACTIVE SCHEDULE PRIVATE POINT", payload)
        self.assertNotIn("INACTIVE LOCATION SCHEDULE POINT", payload)
        self.assertNotIn("INACTIVE LOCATION PRIVATE INSTRUCTIONS", payload)

    def test_public_pickup_schedule_order_is_stable(self):
        response = self.get_product_detail()

        schedules = response.data["pickup_schedules"]
        times = [str(schedule["pickup_time"]) for schedule in schedules]

        self.assertEqual(
            times,
            ["08:00:00", "08:30:00", "09:00:00"],
        )

    def test_public_pickup_schedule_keeps_customer_facing_fields(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        schedule = response.data["pickup_schedules"][0]

        self.assertEqual(schedule["pickup_time"], "08:00:00")
        self.assertEqual(
            schedule["pickup_point"],
            "Default public point",
        )
        self.assertEqual(
            schedule["resolved_pickup_point"],
            "Default public point",
        )
        self.assertEqual(
            schedule["instructions"],
            "Default public instructions",
        )
        self.assertEqual(
            schedule["pickup_location_name"],
            self.location_a.name,
        )

    def test_public_pickup_schedule_payload_avoids_admin_linkage(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        schedule = response.data["pickup_schedules"][0]

        for field_name in (
            "product",
            "product_name",
            "pickup_location",
            "is_active",
            "created_at",
            "updated_at",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, schedule)

    def test_foreign_pickup_schedule_never_appears_in_tenant_a_payload(self):
        response = self.get_product_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for foreign in (
            "FOREIGN PICKUP PRIVATE POINT",
            "FOREIGN PICKUP PRIVATE INSTRUCTIONS",
            self.location_b.name,
            self.product_b.name,
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_public_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Nested Pickup Product",
                "product_type": "excursion",
            },
            format="json",
        )
        delete_response = self.client.delete(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(
            create_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            delete_response.status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertFalse(
            ExperienceProduct.objects.filter(
                organisation=self.org_a,
                name="Anonymous Nested Pickup Product",
            ).exists()
        )
