"""Public transfer-route and price-band security coverage.

The public contract exposes transfer routes as nested data on public transfer
products. This suite covers tenant isolation, hidden/inactive products,
inactive routes/bands, passenger-band data, round-trip pricing, unpublished
sites, and non-exposure of administrative/internal metadata.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    ExperienceProduct,
    TicketingPublicSiteSettings,
    TransferPriceBand,
    TransferRoute,
)


class PublicTransferRoutesSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Transfer Organisation A",
            slug="transfer-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Transfer Organisation B",
            slug="transfer-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Transfer Site A",
            custom_domain="transfer-a.example.test",
            canonical_url="https://transfer-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Transfer Site B",
            custom_domain="transfer-b.example.test",
            canonical_url="https://transfer-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Airport Transfer A",
            slug="airport-transfer-a",
            sku="TRANSFER-A",
            product_type="transfer",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("35.00"),
            adult_price=Decimal("35.00"),
            cost_price=Decimal("20.00"),
            adult_cost_price=Decimal("20.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Transfer A",
            slug="hidden-transfer-a",
            sku="TRANSFER-HIDDEN-A",
            product_type="transfer",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("40.00"),
            adult_price=Decimal("40.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Transfer A",
            slug="inactive-transfer-a",
            sku="TRANSFER-INACTIVE-A",
            product_type="transfer",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("45.00"),
            adult_price=Decimal("45.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Transfer B",
            slug="foreign-transfer-b",
            sku="TRANSFER-B",
            product_type="transfer",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("80.00"),
            adult_price=Decimal("80.00"),
        )

        cls.route_a = TransferRoute.objects.create(
            product=cls.product_a,
            origin="Punta Cana Airport",
            destination="Hotel Alpha",
            airport="PUJ",
            vehicle_type="van",
            is_round_trip=True,
            base_passengers=1,
            max_passengers=6,
            price=Decimal("35.00"),
            round_trip_price=Decimal("65.00"),
            is_active=True,
        )
        cls.route_a_inactive = TransferRoute.objects.create(
            product=cls.product_a,
            origin="Internal Old Route",
            destination="Do Not Publish",
            airport="PUJ",
            vehicle_type="suv",
            is_round_trip=False,
            base_passengers=1,
            max_passengers=4,
            price=Decimal("99.00"),
            round_trip_price=Decimal("0.00"),
            is_active=False,
        )
        cls.route_b = TransferRoute.objects.create(
            product=cls.product_b,
            origin="Foreign Airport",
            destination="Foreign Hotel",
            airport="FOREIGN",
            vehicle_type="luxury",
            is_round_trip=True,
            base_passengers=1,
            max_passengers=4,
            price=Decimal("200.00"),
            round_trip_price=Decimal("380.00"),
            is_active=True,
        )

        cls.band_a_1 = TransferPriceBand.objects.create(
            route=cls.route_a,
            name="1-2 passengers",
            min_passengers=1,
            max_passengers=2,
            vehicle_type="standard_car",
            one_way_price=Decimal("35.00"),
            round_trip_price=Decimal("65.00"),
            is_active=True,
            sort_order=1,
        )
        cls.band_a_2 = TransferPriceBand.objects.create(
            route=cls.route_a,
            name="3-6 passengers",
            min_passengers=3,
            max_passengers=6,
            vehicle_type="van",
            one_way_price=Decimal("55.00"),
            round_trip_price=Decimal("100.00"),
            is_active=True,
            sort_order=2,
        )
        cls.band_a_inactive = TransferPriceBand.objects.create(
            route=cls.route_a,
            name="Internal inactive band",
            min_passengers=7,
            max_passengers=8,
            vehicle_type="minibus",
            one_way_price=Decimal("999.00"),
            round_trip_price=Decimal("1999.00"),
            is_active=False,
            sort_order=3,
        )
        cls.band_b = TransferPriceBand.objects.create(
            route=cls.route_b,
            name="Foreign price band",
            min_passengers=1,
            max_passengers=4,
            vehicle_type="luxury",
            one_way_price=Decimal("200.00"),
            round_trip_price=Decimal("380.00"),
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

    def get_public_transfer_detail(self):
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

    def test_transfer_product_list_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(product_type="transfer"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        rows = self.rows(response)
        names = {row["name"] for row in rows}

        self.assertIn(self.product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.product_b.name, names)

    def test_cross_tenant_transfer_slug_cannot_be_borrowed(self):
        response = self.client.get(
            self.detail_url(self.product_b),
            self.tenant_params(self.org_a),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertNotIn(self.product_b.name, str(response.data))
        self.assertNotIn("Foreign price band", str(response.data))

    def test_hidden_and_inactive_transfer_products_are_not_public(self):
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

    def test_unpublished_site_hides_transfer_products(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(
            self.list_url(),
            self.tenant_params(product_type="transfer"),
        )
        detail_response = self.get_public_transfer_detail()

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_transfer_detail_exposes_route_and_active_price_bands(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["transfer_routes"]), 1)

        route = response.data["transfer_routes"][0]
        self.assertEqual(route["origin"], "Punta Cana Airport")
        self.assertEqual(route["destination"], "Hotel Alpha")
        self.assertEqual(route["airport"], "PUJ")
        self.assertTrue(route["is_round_trip"])
        self.assertEqual(route["base_passengers"], 1)
        self.assertEqual(route["max_passengers"], 6)

        bands = route["price_bands"]
        self.assertEqual(len(bands), 2)
        self.assertEqual(
            [band["name"] for band in bands],
            ["1-2 passengers", "3-6 passengers"],
        )

    def test_public_transfer_detail_never_exposes_inactive_route(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn("Internal Old Route", payload)
        self.assertNotIn("Do Not Publish", payload)
        self.assertNotIn("99.00", payload)

    def test_public_transfer_detail_never_exposes_inactive_price_band(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        self.assertNotIn("Internal inactive band", payload)
        self.assertNotIn("999.00", payload)
        self.assertNotIn("1999.00", payload)

    def test_price_bands_expose_passenger_limits_and_customer_prices(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bands = response.data["transfer_routes"][0]["price_bands"]

        first = bands[0]
        self.assertEqual(first["min_passengers"], 1)
        self.assertEqual(first["max_passengers"], 2)
        self.assertEqual(first["vehicle_type"], "standard_car")
        self.assertEqual(Decimal(str(first["one_way_price"])), Decimal("35.00"))
        self.assertEqual(Decimal(str(first["round_trip_price"])), Decimal("65.00"))

        second = bands[1]
        self.assertEqual(second["min_passengers"], 3)
        self.assertEqual(second["max_passengers"], 6)
        self.assertEqual(second["vehicle_type"], "van")
        self.assertEqual(Decimal(str(second["one_way_price"])), Decimal("55.00"))
        self.assertEqual(Decimal(str(second["round_trip_price"])), Decimal("100.00"))

    def test_route_round_trip_pricing_is_public_customer_data(self):
        response = self.get_public_transfer_detail()

        route = response.data["transfer_routes"][0]
        self.assertEqual(Decimal(str(route["price"])), Decimal("35.00"))
        self.assertEqual(
            Decimal(str(route["round_trip_price"])),
            Decimal("65.00"),
        )

    def test_transfer_payload_never_contains_foreign_tenant_route_or_band(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)
        for foreign in (
            "Foreign Airport",
            "Foreign Hotel",
            "Foreign price band",
            "200.00",
            "380.00",
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_transfer_route_and_band_payload_avoid_admin_metadata(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        route = response.data["transfer_routes"][0]
        band = route["price_bands"][0]

        for field_name in ("created_at", "updated_at"):
            with self.subTest(scope="route", field_name=field_name):
                self.assertNotIn(field_name, route)
            with self.subTest(scope="band", field_name=field_name):
                self.assertNotIn(field_name, band)

    def test_transfer_nested_payload_does_not_expose_product_costs(self):
        response = self.get_public_transfer_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for forbidden in (
            "cost_price",
            "adult_cost_price",
            "profit_per_unit",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_public_transfer_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Transfer",
                "product_type": "transfer",
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
                name="Anonymous Transfer",
            ).exists()
        )
