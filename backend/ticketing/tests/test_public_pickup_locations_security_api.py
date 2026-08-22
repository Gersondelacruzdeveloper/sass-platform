"""Public pickup-location listing security coverage.

Covers tenant isolation, inactive locations, zone/search/type filters,
unpublished-site behavior, read-only methods, and minimization of the public
payload so administrative organisation metadata and timestamps do not leak.
"""

from __future__ import annotations

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    PickupLocation,
    PickupZone,
    TicketingPublicSiteSettings,
)


class PublicPickupLocationsSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Pickup Locations Organisation A",
            slug="pickup-locations-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Pickup Locations Organisation B",
            slug="pickup-locations-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Pickup Locations Site A",
            custom_domain="pickup-locations-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Pickup Locations Site B",
            custom_domain="pickup-locations-b.example.test",
            is_published=True,
        )

        cls.zone_a = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Bavaro",
            description="Internal Zone A Description",
            is_active=True,
        )
        cls.zone_a2 = PickupZone.objects.create(
            organisation=cls.org_a,
            name="Cap Cana",
            description="Internal Zone A2 Description",
            is_active=True,
        )
        cls.zone_b = PickupZone.objects.create(
            organisation=cls.org_b,
            name="Foreign Zone",
            description="FOREIGN ZONE PRIVATE CONTENT",
            is_active=True,
        )

        cls.hotel_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Hotel Alpha",
            slug="hotel-alpha",
            location_type="hotel",
            address="Alpha Public Address",
            default_pickup_point="Main lobby",
            default_instructions="Wait by reception.",
            google_maps_link="https://maps.example.test/hotel-alpha",
            is_active=True,
        )
        cls.airport_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a2,
            name="Punta Cana Airport",
            slug="punta-cana-airport",
            location_type="airport",
            address="Airport Public Address",
            default_pickup_point="Terminal exit",
            default_instructions="Meet the representative outside.",
            google_maps_link="https://maps.example.test/airport",
            is_active=True,
        )
        cls.inactive_a = PickupLocation.objects.create(
            organisation=cls.org_a,
            zone=cls.zone_a,
            name="Inactive Hotel",
            slug="inactive-hotel",
            location_type="hotel",
            address="INACTIVE LOCATION PRIVATE ADDRESS",
            default_pickup_point="Inactive lobby",
            default_instructions="INACTIVE LOCATION PRIVATE INSTRUCTIONS",
            is_active=False,
        )
        cls.foreign_b = PickupLocation.objects.create(
            organisation=cls.org_b,
            zone=cls.zone_b,
            name="Foreign Hotel",
            slug="foreign-hotel",
            location_type="hotel",
            address="FOREIGN LOCATION PRIVATE ADDRESS",
            default_pickup_point="Foreign lobby",
            default_instructions="FOREIGN LOCATION PRIVATE INSTRUCTIONS",
            google_maps_link="https://maps.example.test/foreign",
            is_active=True,
        )

    @staticmethod
    def rows(response):
        if isinstance(response.data, dict) and "results" in response.data:
            return response.data["results"]
        return response.data

    def list_url(self):
        return reverse("ticketing-public-pickup-locations-list")

    def detail_url(self, location=None):
        location = location or self.hotel_a
        return reverse(
            "ticketing-public-pickup-locations-detail",
            kwargs={"pk": location.pk},
        )

    def tenant_params(self, organisation=None, **extra):
        organisation = organisation or self.org_a
        return {
            "slug": organisation.slug,
            **extra,
        }

    def test_public_pickup_location_routes_reverse(self):
        self.assertEqual(
            self.list_url(),
            "/api/ticketing/public/pickup-locations/",
        )
        self.assertEqual(
            self.detail_url(),
            f"/api/ticketing/public/pickup-locations/{self.hotel_a.pk}/",
        )

    def test_list_is_tenant_scoped_and_active_only(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        names = {row["name"] for row in rows}

        self.assertIn(self.hotel_a.name, names)
        self.assertIn(self.airport_a.name, names)
        self.assertNotIn(self.inactive_a.name, names)
        self.assertNotIn(self.foreign_b.name, names)

        payload = str(response.data)
        self.assertNotIn("FOREIGN LOCATION PRIVATE ADDRESS", payload)
        self.assertNotIn("INACTIVE LOCATION PRIVATE ADDRESS", payload)

    def test_detail_cannot_borrow_foreign_location_id(self):
        response = self.client.get(
            self.detail_url(location=self.foreign_b),
            self.tenant_params(self.org_a),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.foreign_b.name, payload)
        self.assertNotIn("FOREIGN LOCATION PRIVATE INSTRUCTIONS", payload)

    def test_inactive_location_detail_is_not_public(self):
        response = self.client.get(
            self.detail_url(location=self.inactive_a),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unpublished_site_hides_list_and_detail(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(
            self.list_url(),
            self.tenant_params(),
        )
        detail_response = self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_zone_filter_by_id_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(zone=self.zone_a.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertEqual([row["id"] for row in rows], [self.hotel_a.pk])

    def test_zone_filter_by_name_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(zone="Cap Cana"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertEqual([row["id"] for row in rows], [self.airport_a.pk])

    def test_foreign_zone_id_does_not_expose_foreign_locations(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(zone=self.zone_b.pk),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertEqual(rows, [])
        self.assertNotIn(self.foreign_b.name, str(response.data))

    def test_location_type_filter_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(location_type="airport"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.airport_a.pk)

    def test_search_matches_public_fields_only_within_tenant(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(search="Terminal exit"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], self.airport_a.pk)
        self.assertNotIn(self.foreign_b.name, str(response.data))

    def test_search_cannot_find_foreign_tenant_content(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(search="FOREIGN LOCATION PRIVATE"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(response), [])

    def test_public_pickup_location_response_does_not_expose_zone_description(self):
        response = self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn("Internal Zone A Description", payload)
        self.assertNotIn("description", response.data)

    def test_public_pickup_location_payload_avoids_admin_metadata(self):
        response = self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        for field_name in (
            "organisation",
            "organisation_name",
            "created_at",
            "updated_at",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, response.data)

    def test_public_pickup_location_keeps_customer_facing_fields(self):
        response = self.client.get(
            self.detail_url(),
            self.tenant_params(),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], self.hotel_a.name)
        self.assertEqual(response.data["slug"], self.hotel_a.slug)
        self.assertEqual(response.data["location_type"], "hotel")
        self.assertEqual(response.data["address"], "Alpha Public Address")
        self.assertEqual(response.data["default_pickup_point"], "Main lobby")
        self.assertEqual(
            response.data["default_instructions"],
            "Wait by reception.",
        )
        self.assertEqual(
            response.data["google_maps_link"],
            "https://maps.example.test/hotel-alpha",
        )
        self.assertEqual(response.data["zone_name"], self.zone_a.name)

    def test_public_pickup_locations_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Pickup",
                "location_slug": "anonymous-pickup",
                "location_type": "hotel",
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
            PickupLocation.objects.filter(
                organisation=self.org_a,
                slug="anonymous-pickup",
            ).exists()
        )
