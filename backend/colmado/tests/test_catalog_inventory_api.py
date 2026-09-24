from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import InventoryItem, MasterProduct, Store


class CatalogInventoryApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="safe-test-password",
        )
        self.organisation = Organisation.objects.create(
            name="Colmados Gerson",
            slug="colmados-gerson",
            business_type="colmado",
            is_active=True,
        )
        self.other_organisation = Organisation.objects.create(
            name="Colmados Ajeno",
            slug="colmados-ajeno",
            business_type="colmado",
            is_active=True,
        )
        self.membership = Membership.objects.create(
            user=self.owner,
            organisation=self.organisation,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organisation=self.organisation,
            name="Macao",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Bávaro",
        )
        self.coca_cola = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            brand="Coca-Cola",
            presentation="12 oz",
            category="Refrescos",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
            units_per_case=24,
        )
        self.salami = MasterProduct.objects.create(
            barcode=None,
            name="Salami",
            category="Embutidos",
            unit=MasterProduct.POUND,
            sale_mode=MasterProduct.BY_AMOUNT,
            units_per_case=1,
        )
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def initial_scan_payload(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "barcode": self.coca_cola.barcode,
            "quantity": "48.000",
            "cost_price": "30.00",
            "sale_price": "50.00",
            "reorder_level": "12.000",
            "is_quick_sale": True,
        }
        payload.update(overrides)
        return payload

    def create_coca_cola_inventory(self):
        return InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.coca_cola,
            quantity=Decimal("48.000"),
            cost_price=Decimal("30.00"),
            sale_price=Decimal("50.00"),
            reorder_level=Decimal("12.000"),
            is_quick_sale=True,
        )

    def test_catalog_requires_authentication(self):
        self.client.force_authenticate(None)

        response = self.client.get(
            reverse("colmado-catalog-list"),
            **self.headers,
        )

        self.assertIn(response.status_code, (401, 403))

    def test_catalog_finds_product_by_barcode(self):
        response = self.client.get(
            reverse("colmado-catalog-by-barcode"),
            {"barcode": self.coca_cola.barcode},
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["id"], self.coca_cola.id)
        self.assertEqual(response.data["barcode"], self.coca_cola.barcode)
        self.assertEqual(response.data["display_name"], "Coca-Cola Coca-Cola 12 oz")

    def test_barcode_lookup_requires_barcode(self):
        response = self.client.get(
            reverse("colmado-catalog-by-barcode"),
            **self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("barcode", response.data)

    def test_unknown_barcode_returns_clear_not_found_response(self):
        response = self.client.get(
            reverse("colmado-catalog-by-barcode"),
            {"barcode": "1234567890123"},
            **self.headers,
        )

        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["code"], "product_not_found")
        self.assertNotIn("exception", response.data)

    def test_initial_scan_adds_master_product_to_store_inventory(self):
        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_scan_payload(),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 201)
        item = InventoryItem.objects.get(id=response.data["id"])
        self.assertEqual(item.organisation, self.organisation)
        self.assertEqual(item.store, self.store)
        self.assertEqual(item.master_product, self.coca_cola)
        self.assertEqual(item.quantity, Decimal("48.000"))
        self.assertEqual(item.sale_price, Decimal("50.00"))
        self.assertFalse(response.data["already_in_inventory"])

    def test_repeated_initial_scan_is_idempotent(self):
        url = reverse("colmado-inventory-initial-scan")
        first = self.client.post(
            url,
            self.initial_scan_payload(),
            format="json",
            **self.headers,
        )
        second = self.client.post(
            url,
            self.initial_scan_payload(quantity="99.000", sale_price="75.00"),
            format="json",
            **self.headers,
        )

        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data["already_in_inventory"])
        self.assertEqual(
            InventoryItem.objects.filter(
                store=self.store,
                master_product=self.coca_cola,
            ).count(),
            1,
        )
        item = InventoryItem.objects.get(
            store=self.store,
            master_product=self.coca_cola,
        )
        self.assertEqual(item.quantity, Decimal("48.000"))
        self.assertEqual(item.sale_price, Decimal("50.00"))

    def test_initial_scan_cannot_use_other_organisation_store(self):
        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_scan_payload(store_id=self.other_store.id),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("store_id", response.data)
        self.assertFalse(
            InventoryItem.objects.filter(store=self.other_store).exists()
        )

    def test_initial_scan_rejects_inactive_store(self):
        self.store.is_active = False
        self.store.save(update_fields=("is_active",))

        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_scan_payload(),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("store_id", response.data)

    def test_initial_scan_rejects_invalid_barcode_format(self):
        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_scan_payload(barcode="ABC-123"),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("barcode", response.data)

    def test_inventory_list_is_tenant_scoped(self):
        own_item = self.create_coca_cola_inventory()
        other_item = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.coca_cola,
            quantity=Decimal("10.000"),
            cost_price=Decimal("30.00"),
            sale_price=Decimal("55.00"),
        )

        response = self.client.get(
            reverse("colmado-inventory-list"),
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        returned_ids = [row["id"] for row in response.data]
        self.assertEqual(returned_ids, [own_item.id])
        self.assertNotIn(other_item.id, returned_ids)

    def test_receiving_cases_adds_units_to_inventory(self):
        item = self.create_coca_cola_inventory()

        response = self.client.post(
            reverse("colmado-inventory-receive-cases", args=(item.id,)),
            {"cases": "2.00"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.quantity, Decimal("96.000"))
        self.assertEqual(response.data["units_added"], "48.00")

    def test_cannot_receive_cases_for_other_organisation_inventory(self):
        other_item = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.coca_cola,
            quantity=Decimal("10.000"),
            cost_price=Decimal("30.00"),
            sale_price=Decimal("55.00"),
        )

        response = self.client.post(
            reverse("colmado-inventory-receive-cases", args=(other_item.id,)),
            {"cases": "1.00"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 404)
        other_item.refresh_from_db()
        self.assertEqual(other_item.quantity, Decimal("10.000"))

    def test_quantity_from_amount_calculates_fractional_product(self):
        item = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.salami,
            quantity=Decimal("20.000"),
            cost_price=Decimal("140.00"),
            sale_price=Decimal("200.00"),
            is_quick_sale=True,
        )

        response = self.client.post(
            reverse("colmado-inventory-quantity-from-amount", args=(item.id,)),
            {"amount": "100.00"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["quantity"], "0.500")
        self.assertEqual(response.data["unit"], MasterProduct.POUND)

    def test_low_stock_filter_only_returns_products_to_buy(self):
        low_item = self.create_coca_cola_inventory()
        low_item.quantity = Decimal("8.000")
        low_item.save(update_fields=("quantity",))
        InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.salami,
            quantity=Decimal("20.000"),
            cost_price=Decimal("140.00"),
            sale_price=Decimal("200.00"),
            reorder_level=Decimal("5.000"),
        )

        response = self.client.get(
            reverse("colmado-inventory-list"),
            {"low_stock": "true"},
            **self.headers,
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual([row["id"] for row in response.data], [low_item.id])

    def test_inactive_membership_cannot_read_catalog_or_inventory(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))

        catalog_response = self.client.get(
            reverse("colmado-catalog-list"),
            **self.headers,
        )
        inventory_response = self.client.get(
            reverse("colmado-inventory-list"),
            **self.headers,
        )

        self.assertEqual(catalog_response.status_code, 403)
        self.assertEqual(inventory_response.status_code, 403)
