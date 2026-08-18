"""Public pickup locations and pickup schedule resolver coverage.

Covers published-site boundaries, active-location filtering, zone/type/search
filters, exact-date/weekday/fallback schedule precedence, invalid dates,
missing parameters, public product eligibility, tenant isolation, and
cross-tenant pickup protection.
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


class PublicPickupAPITests(APITestCase):
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

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Bavaro",
            description="Bavaro hotels",
            is_active=True,
        )
        cls.zone_a2 = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Cap Cana",
            description="Cap Cana hotels",
            is_active=True,
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Foreign Zone",
            is_active=True,
        )

        cls.hotel_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel A",
            slug="hotel-a",
            location_type="hotel",
            address="Bavaro Main Road",
            default_pickup_point="Main lobby",
            default_instructions="Wait by reception.",
            is_active=True,
        )
        cls.hotel_a2 = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a2,
            name="Hotel Cap Cana",
            slug="hotel-cap-cana",
            location_type="hotel",
            address="Cap Cana",
            default_pickup_point="Security gate",
            is_active=True,
        )
        cls.meeting_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Bavaro Meeting Point",
            slug="bavaro-meeting-point",
            location_type="meeting_point",
            address="Downtown Bavaro",
            default_pickup_point="Coffee shop entrance",
            is_active=True,
        )
        cls.inactive_location_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Inactive Hotel",
            slug="inactive-hotel",
            location_type="hotel",
            is_active=False,
        )
        cls.foreign_hotel_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Foreign Hotel",
            slug="foreign-hotel",
            location_type="hotel",
            default_pickup_point="Foreign lobby",
            is_active=True,
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
            adult_price=Decimal("100.00"),
            base_price=Decimal("100.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Pickup Product",
            slug="hidden-pickup-product",
            sku="PICKUP-HIDDEN",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=False,
            supports_pickup=True,
            base_price=Decimal("80.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Pickup Product",
            slug="inactive-pickup-product",
            sku="PICKUP-INACTIVE",
            product_type="excursion",
            status="active",
            is_active=False,
            public_enabled=True,
            supports_pickup=True,
            base_price=Decimal("70.00"),
        )
        cls.foreign_product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Pickup Product",
            slug="foreign-pickup-product",
            sku="PICKUP-B",
            product_type="excursion",
            status="active",
            is_active=True,
            public_enabled=True,
            supports_pickup=True,
            base_price=Decimal("200.00"),
        )

        cls.service_date = date.today() + timedelta(days=14)
        cls.weekday = cls.service_date.weekday()

        cls.exact_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.hotel_a,
            specific_date=cls.service_date,
            pickup_time=time(7, 15),
            pickup_point="Exact-date lobby point",
            instructions="Exact-date instructions",
            is_active=True,
        )
        cls.weekday_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.hotel_a,
            day_of_week=cls.weekday,
            pickup_time=time(7, 30),
            pickup_point="Recurring lobby point",
            instructions="Recurring instructions",
            is_active=True,
        )
        cls.fallback_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.hotel_a,
            pickup_time=time(8, 0),
            pickup_point="Fallback lobby point",
            instructions="Fallback instructions",
            is_active=True,
        )
        cls.inactive_schedule = ProductPickupSchedule.objects.create(
            product=cls.product_a,
            pickup_location=cls.hotel_a,
            specific_date=cls.service_date,
            pickup_time=time(6, 0),
            pickup_point="Inactive schedule point",
            is_active=False,
        )
        cls.foreign_schedule = ProductPickupSchedule.objects.create(
            product=cls.foreign_product_b,
            pickup_location=cls.foreign_hotel_b,
            specific_date=cls.service_date,
            pickup_time=time(9, 0),
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    @classmethod
    def ids(cls, response):
        return {row["id"] for row in cls.rows(response)}

    def pickup_list_url(self):
        return reverse("ticketing-public-pickup-locations-list")

    def resolver_url(self, organisation=None):
        if organisation:
            return reverse(
                "ticketing-public-pickup-schedule-resolve-by-slug",
                kwargs={"organisation_slug": organisation.slug},
            )
        return reverse("ticketing-public-pickup-schedule-resolve")

    def resolver_params(self, **overrides):
        params = {
            "product": self.product_a.pk,
            "pickup_location": self.hotel_a.pk,
            "service_date": self.service_date.isoformat(),
        }
        params.update(overrides)
        return params

    def test_public_pickup_location_list_is_tenant_scoped(self):
        response = self.client.get(
            self.pickup_list_url(),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.hotel_a.pk, ids)
        self.assertIn(self.hotel_a2.pk, ids)
        self.assertIn(self.meeting_a.pk, ids)
        self.assertNotIn(self.foreign_hotel_b.pk, ids)

    def test_public_pickup_location_list_hides_inactive_locations(self):
        response = self.client.get(
            self.pickup_list_url(),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertNotIn(self.inactive_location_a.pk, self.ids(response))

    def test_public_pickup_location_list_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.pickup_list_url(),
            {"organisation_slug": self.org_a.slug},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_pickup_location_filter_by_location_type(self):
        response = self.client.get(
            self.pickup_list_url(),
            {
                "organisation_slug": self.org_a.slug,
                "location_type": "meeting_point",
            },
        )

        self.assertEqual(self.ids(response), {self.meeting_a.pk})

    def test_public_pickup_location_search_is_tenant_scoped(self):
        response = self.client.get(
            self.pickup_list_url(),
            {
                "organisation_slug": self.org_a.slug,
                "search": "Bavaro",
            },
        )

        ids = self.ids(response)
        self.assertIn(self.hotel_a.pk, ids)
        self.assertIn(self.meeting_a.pk, ids)
        self.assertNotIn(self.foreign_hotel_b.pk, ids)

    def test_public_pickup_location_zone_filter_accepts_numeric_id(self):
        response = self.client.get(
            self.pickup_list_url(),
            {
                "organisation_slug": self.org_a.slug,
                "zone": str(self.zone_a.pk),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self.ids(response)
        self.assertIn(self.hotel_a.pk, ids)
        self.assertIn(self.meeting_a.pk, ids)
        self.assertNotIn(self.hotel_a2.pk, ids)

    def test_public_pickup_location_zone_filter_accepts_name(self):
        response = self.client.get(
            self.pickup_list_url(),
            {
                "organisation_slug": self.org_a.slug,
                "zone": "Cap Cana",
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.ids(response), {self.hotel_a2.pk})

    def test_resolver_requires_product_location_and_date(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            {"product": self.product_a.pk},
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("required", str(response.data).lower())

    def test_resolver_rejects_invalid_date(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(service_date="not-a-date"),
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("YYYY-MM-DD", str(response.data))

    def test_resolver_hidden_when_site_unpublished(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolver_rejects_non_public_product(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(product=self.hidden_product_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolver_rejects_inactive_product(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(product=self.inactive_product_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolver_rejects_foreign_product(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(product=self.foreign_product_b.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolver_rejects_foreign_pickup_location(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(pickup_location=self.foreign_hotel_b.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_resolver_rejects_inactive_pickup_location(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(pickup_location=self.inactive_location_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_exact_date_schedule_has_precedence_over_weekday_and_fallback(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data["found"])
        schedule = response.data["schedule"]
        self.assertEqual(schedule["id"], self.exact_schedule.pk)
        self.assertEqual(schedule["pickup_time"], "07:15:00")
        self.assertEqual(
            schedule["resolved_pickup_point"],
            "Exact-date lobby point",
        )

    def test_weekday_schedule_used_when_no_exact_date_exists(self):
        another_date = self.service_date + timedelta(days=7)

        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(service_date=another_date.isoformat()),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["schedule"]["id"],
            self.weekday_schedule.pk,
        )

    def test_fallback_schedule_used_when_no_exact_or_weekday_match(self):
        offset = 1
        while (self.service_date + timedelta(days=offset)).weekday() == self.weekday:
            offset += 1
        other_weekday_date = self.service_date + timedelta(days=offset)

        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(
                service_date=other_weekday_date.isoformat()
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["schedule"]["id"],
            self.fallback_schedule.pk,
        )

    def test_resolved_pickup_point_falls_back_to_location_default(self):
        schedule = ProductPickupSchedule.objects.create(
            product=self.product_a,
            pickup_location=self.hotel_a2,
            specific_date=self.service_date,
            pickup_time=time(10, 0),
            pickup_point="",
            is_active=True,
        )

        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(
                pickup_location=self.hotel_a2.pk,
            ),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["schedule"]["id"], schedule.pk)
        self.assertEqual(
            response.data["schedule"]["resolved_pickup_point"],
            self.hotel_a2.default_pickup_point,
        )

    def test_resolver_returns_404_when_no_schedule_exists(self):
        location = PickupLocation.objects.create(
            organisation=self.org_a,
            zone=self.zone_a,
            name="No Schedule Hotel",
            slug="no-schedule-hotel",
            location_type="hotel",
            is_active=True,
        )

        response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(pickup_location=location.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(response.data["found"])

    def test_resolver_accepts_date_alias_and_id_aliases(self):
        response = self.client.get(
            self.resolver_url(self.org_a),
            {
                "product_id": self.product_a.pk,
                "pickup_location_id": self.hotel_a.pk,
                "date": self.service_date.isoformat(),
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["schedule"]["id"],
            self.exact_schedule.pk,
        )

    def test_resolver_by_query_param_slug_matches_slug_route(self):
        query_response = self.client.get(
            self.resolver_url(),
            {
                "organisation_slug": self.org_a.slug,
                **self.resolver_params(),
            },
        )
        slug_response = self.client.get(
            self.resolver_url(self.org_a),
            self.resolver_params(),
        )

        self.assertEqual(query_response.status_code, status.HTTP_200_OK)
        self.assertEqual(slug_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            query_response.data["schedule"]["id"],
            slug_response.data["schedule"]["id"],
        )

    def test_public_pickup_payload_never_exposes_foreign_location_details(self):
        response = self.client.get(
            self.pickup_list_url(),
            {"organisation_slug": self.org_a.slug},
        )

        payload = str(response.data)
        self.assertNotIn(self.foreign_hotel_b.name, payload)
        self.assertNotIn(self.foreign_hotel_b.default_pickup_point, payload)
