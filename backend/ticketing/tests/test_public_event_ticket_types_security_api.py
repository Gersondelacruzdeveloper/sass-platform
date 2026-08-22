"""Public event ticket type security coverage.

The public contract exposes event ticket types nested on public event products.
This suite covers tenant isolation, hidden/inactive products, inactive ticket
types, capacity/sold/available counts, customer pricing/deposit, unpublished
sites, read-only behavior, and non-exposure of internal/admin metadata.
"""

from __future__ import annotations

from decimal import Decimal

from django.urls import reverse
from organisations.models import Organisation
from rest_framework import status
from rest_framework.test import APITestCase

from ticketing.models import (
    EventTicketType,
    ExperienceProduct,
    TicketingPublicSiteSettings,
)


class PublicEventTicketTypesSecurityAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.org_a = Organisation.objects.create(
            name="Event Organisation A",
            slug="event-a",
            business_type="ticketing",
            is_active=True,
        )
        cls.org_b = Organisation.objects.create(
            name="Event Organisation B",
            slug="event-b",
            business_type="ticketing",
            is_active=True,
        )

        cls.site_a = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_a,
            site_title="Event Site A",
            custom_domain="event-a.example.test",
            canonical_url="https://event-a.example.test",
            is_published=True,
        )
        cls.site_b = TicketingPublicSiteSettings.objects.create(
            organisation=cls.org_b,
            site_title="Event Site B",
            custom_domain="event-b.example.test",
            canonical_url="https://event-b.example.test",
            is_published=True,
        )

        cls.product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Public Event A",
            slug="public-event-a",
            sku="EVENT-A",
            product_type="event",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("75.00"),
            adult_price=Decimal("75.00"),
            cost_price=Decimal("30.00"),
            adult_cost_price=Decimal("30.00"),
        )
        cls.hidden_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Hidden Event A",
            slug="hidden-event-a",
            sku="EVENT-HIDDEN-A",
            product_type="event",
            status="active",
            is_active=True,
            public_enabled=False,
            base_price=Decimal("90.00"),
            adult_price=Decimal("90.00"),
        )
        cls.inactive_product_a = ExperienceProduct.objects.create(
            organisation=cls.org_a,
            name="Inactive Event A",
            slug="inactive-event-a",
            sku="EVENT-INACTIVE-A",
            product_type="event",
            status="inactive",
            is_active=False,
            public_enabled=True,
            base_price=Decimal("95.00"),
            adult_price=Decimal("95.00"),
        )
        cls.product_b = ExperienceProduct.objects.create(
            organisation=cls.org_b,
            name="Foreign Event B",
            slug="foreign-event-b",
            sku="EVENT-B",
            product_type="event",
            status="active",
            is_active=True,
            public_enabled=True,
            base_price=Decimal("120.00"),
            adult_price=Decimal("120.00"),
        )

        cls.general_ticket = EventTicketType.objects.create(
            product=cls.product_a,
            name="General Admission",
            description="General public admission",
            price=Decimal("75.00"),
            deposit_amount=Decimal("20.00"),
            capacity=100,
            sold_quantity=25,
            is_active=True,
            sort_order=1,
        )
        cls.vip_ticket = EventTicketType.objects.create(
            product=cls.product_a,
            name="VIP Admission",
            description="VIP public admission",
            price=Decimal("125.00"),
            deposit_amount=Decimal("50.00"),
            capacity=20,
            sold_quantity=20,
            is_active=True,
            sort_order=2,
        )
        cls.inactive_ticket = EventTicketType.objects.create(
            product=cls.product_a,
            name="Internal Inactive Ticket",
            description="INTERNAL TICKET DESCRIPTION",
            price=Decimal("999.00"),
            deposit_amount=Decimal("500.00"),
            capacity=10,
            sold_quantity=0,
            is_active=False,
            sort_order=3,
        )
        cls.foreign_ticket = EventTicketType.objects.create(
            product=cls.product_b,
            name="Foreign Event Ticket",
            description="FOREIGN TENANT TICKET CONTENT",
            price=Decimal("300.00"),
            deposit_amount=Decimal("100.00"),
            capacity=30,
            sold_quantity=1,
            is_active=True,
            sort_order=1,
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

    def get_event_detail(self):
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

    def test_event_product_list_is_tenant_scoped(self):
        response = self.client.get(
            self.list_url(),
            self.tenant_params(product_type="event"),
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = {row["name"] for row in self.rows(response)}

        self.assertIn(self.product_a.name, names)
        self.assertNotIn(self.hidden_product_a.name, names)
        self.assertNotIn(self.inactive_product_a.name, names)
        self.assertNotIn(self.product_b.name, names)

    def test_cross_tenant_event_slug_cannot_be_borrowed(self):
        response = self.client.get(
            self.detail_url(self.product_b),
            self.tenant_params(self.org_a),
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        payload = str(response.data)
        self.assertNotIn(self.product_b.name, payload)
        self.assertNotIn(self.foreign_ticket.name, payload)

    def test_hidden_and_inactive_event_products_are_not_public(self):
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

    def test_unpublished_site_hides_event_products(self):
        self.site_a.is_published = False
        self.site_a.save(update_fields=["is_published"])

        list_response = self.client.get(
            self.list_url(),
            self.tenant_params(product_type="event"),
        )
        detail_response = self.get_event_detail()

        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.rows(list_response), [])
        self.assertEqual(detail_response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_event_detail_exposes_active_ticket_types_only(self):
        response = self.get_event_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tickets = response.data["event_ticket_types"]

        self.assertEqual(
            [ticket["name"] for ticket in tickets],
            ["General Admission", "VIP Admission"],
        )
        self.assertNotIn("Internal Inactive Ticket", str(response.data))

    def test_ticket_capacity_and_available_count_are_consistent(self):
        response = self.get_event_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tickets = {
            ticket["name"]: ticket
            for ticket in response.data["event_ticket_types"]
        }

        general = tickets["General Admission"]
        self.assertEqual(general["capacity"], 100)
        self.assertEqual(general["sold_quantity"], 25)
        self.assertEqual(general["available_tickets"], 75)

        vip = tickets["VIP Admission"]
        self.assertEqual(vip["capacity"], 20)
        self.assertEqual(vip["sold_quantity"], 20)
        self.assertEqual(vip["available_tickets"], 0)

    def test_ticket_price_and_deposit_are_public_customer_data(self):
        response = self.get_event_detail()

        tickets = {
            ticket["name"]: ticket
            for ticket in response.data["event_ticket_types"]
        }

        general = tickets["General Admission"]
        self.assertEqual(
            Decimal(str(general["price"])),
            Decimal("75.00"),
        )
        self.assertEqual(
            Decimal(str(general["deposit_amount"])),
            Decimal("20.00"),
        )

        vip = tickets["VIP Admission"]
        self.assertEqual(
            Decimal(str(vip["price"])),
            Decimal("125.00"),
        )
        self.assertEqual(
            Decimal(str(vip["deposit_amount"])),
            Decimal("50.00"),
        )

    def test_sold_out_ticket_remains_public_but_reports_zero_available(self):
        response = self.get_event_detail()

        vip = next(
            ticket
            for ticket in response.data["event_ticket_types"]
            if ticket["name"] == "VIP Admission"
        )

        self.assertEqual(vip["sold_quantity"], vip["capacity"])
        self.assertEqual(vip["available_tickets"], 0)

    def test_event_payload_never_contains_foreign_ticket_type(self):
        response = self.get_event_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for foreign in (
            self.product_b.name,
            self.foreign_ticket.name,
            "FOREIGN TENANT TICKET CONTENT",
            "300.00",
            "100.00",
        ):
            with self.subTest(foreign=foreign):
                self.assertNotIn(foreign, payload)

    def test_event_ticket_type_payload_avoids_admin_linkage(self):
        response = self.get_event_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ticket = response.data["event_ticket_types"][0]

        for field_name in (
            "product",
            "product_name",
            "is_active",
        ):
            with self.subTest(field_name=field_name):
                self.assertNotIn(field_name, ticket)

    def test_event_product_public_payload_does_not_expose_costs_or_margins(self):
        response = self.get_event_detail()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        payload = str(response.data)

        for forbidden in (
            "cost_price",
            "adult_cost_price",
            "child_cost_price",
            "infant_cost_price",
            "profit_per_unit",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
        ):
            with self.subTest(forbidden=forbidden):
                self.assertNotIn(forbidden, payload)

    def test_public_event_products_are_read_only(self):
        create_response = self.client.post(
            self.list_url(),
            {
                "slug": self.org_a.slug,
                "name": "Anonymous Event",
                "product_type": "event",
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
                name="Anonymous Event",
            ).exists()
        )
