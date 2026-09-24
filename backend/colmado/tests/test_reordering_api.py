from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    InventoryItem,
    InventoryMovement,
    MasterProduct,
    PurchaseOrder,
    Store,
    Supplier,
    SupplierProduct,
)


class ReorderingApiTests(APITestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(
            email="owner@example.com",
            username="owner",
            password="safe-test-password",
        )
        self.other_owner = user_model.objects.create_user(
            email="other@example.com",
            username="other-owner",
            password="safe-test-password",
        )
        self.organisation = Organisation.objects.create(
            name="Colmados Gerson",
            slug="colmados-gerson",
            business_type="colmado",
            is_active=True,
        )
        self.other_organisation = Organisation.objects.create(
            name="Colmado Ajeno",
            slug="colmado-ajeno",
            business_type="colmado",
            is_active=True,
        )
        Membership.objects.create(
            user=self.owner,
            organisation=self.organisation,
            role="owner",
            is_active=True,
        )
        Membership.objects.create(
            user=self.other_owner,
            organisation=self.other_organisation,
            role="owner",
            is_active=True,
        )
        self.store = Store.objects.create(
            organisation=self.organisation,
            name="Macao",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Colmado Ajeno",
        )
        self.product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            presentation="12 oz",
        )
        self.other_product = MasterProduct.objects.create(
            barcode="7460123456796",
            name="Agua",
            presentation="16 oz",
        )
        self.inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.product,
            cost_price=Decimal("30.00"),
            sale_price=Decimal("50.00"),
            quantity=Decimal("4.000"),
            reorder_level=Decimal("5.000"),
        )
        self.unlinked_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.other_product,
            cost_price=Decimal("10.00"),
            sale_price=Decimal("20.00"),
            quantity=Decimal("1.000"),
            reorder_level=Decimal("3.000"),
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.product,
            cost_price=Decimal("29.00"),
            sale_price=Decimal("55.00"),
            quantity=Decimal("2.000"),
            reorder_level=Decimal("4.000"),
        )
        self.supplier = Supplier.objects.create(
            organisation=self.organisation,
            name="Distribuidora Nacional",
            contact_name="José",
            phone="8095550101",
            whatsapp="8095550101",
        )
        self.other_supplier = Supplier.objects.create(
            organisation=self.other_organisation,
            name="Suplidor Ajeno",
        )
        self.supplier_product = SupplierProduct.objects.create(
            organisation=self.organisation,
            supplier=self.supplier,
            master_product=self.product,
            units_per_case=24,
            case_cost=Decimal("600.00"),
            is_preferred=True,
        )
        self.supplier_url = reverse("colmado-supplier-list")
        self.supplier_product_url = reverse("colmado-supplier-product-list")
        self.order_url = reverse("colmado-purchase-order-list")
        self.movement_url = reverse("colmado-inventory-movement-list")
        self.suggestion_url = reverse("colmado-reorder-suggestion-list")
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def order_payload(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "supplier_id": self.supplier.id,
            "note": "Reposición semanal",
            "items": [
                {
                    "inventory_item_id": self.inventory.id,
                    "cases": "2.00",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def create_order(self, **overrides):
        return self.client.post(
            self.order_url,
            self.order_payload(**overrides),
            format="json",
            **self.headers,
        )

    def test_suppliers_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.supplier_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_supplier_for_current_organisation(self):
        response = self.client.post(
            self.supplier_url,
            {
                "name": "  César Iglesias  ",
                "contact_name": "Ana",
                "phone": "8095550303",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        supplier = Supplier.objects.get(pk=response.data["id"])
        self.assertEqual(supplier.name, "César Iglesias")
        self.assertEqual(supplier.organisation, self.organisation)

    def test_rejects_duplicate_supplier_name_case_insensitively(self):
        response = self.client.post(
            self.supplier_url,
            {"name": "distribuidora nacional"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("name", response.data)

    def test_supplier_list_is_tenant_scoped(self):
        response = self.client.get(self.supplier_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.supplier.id)

    def test_cannot_retrieve_supplier_from_other_organisation(self):
        response = self.client.get(
            reverse("colmado-supplier-detail", args=(self.other_supplier.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_creates_supplier_product_with_calculated_unit_cost(self):
        response = self.client.post(
            self.supplier_product_url,
            {
                "supplier": self.supplier.id,
                "master_product": self.other_product.id,
                "units_per_case": 20,
                "case_cost": "400.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["unit_cost"], "20.00")
        linked = SupplierProduct.objects.get(pk=response.data["id"])
        self.assertEqual(linked.organisation, self.organisation)

    def test_rejects_supplier_product_for_other_organisation_supplier(self):
        response = self.client.post(
            self.supplier_product_url,
            {
                "supplier": self.other_supplier.id,
                "master_product": self.other_product.id,
                "units_per_case": 20,
                "case_cost": "400.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_duplicate_product_for_same_supplier(self):
        response = self.client.post(
            self.supplier_product_url,
            {
                "supplier": self.supplier.id,
                "master_product": self.product.id,
                "units_per_case": 24,
                "case_cost": "610.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("master_product", response.data)

    def test_reorder_suggestions_require_store(self):
        response = self.client.get(self.suggestion_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store", response.data)

    def test_reorder_suggestions_reject_other_organisation_store(self):
        response = self.client.get(
            self.suggestion_url,
            {"store": self.other_store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reorder_suggestion_calculates_full_cases(self):
        response = self.client.get(
            self.suggestion_url,
            {"store": self.store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        suggestions = {
            item["inventory_item_id"]: item for item in response.data["suggestions"]
        }
        coca = suggestions[self.inventory.id]
        self.assertEqual(coca["current_quantity"], "4.000")
        self.assertEqual(coca["recommended_units"], "6.000")
        self.assertEqual(coca["recommended_cases"], "1")
        self.assertEqual(coca["supplier"]["id"], self.supplier.id)

    def test_reorder_suggestion_marks_product_without_supplier(self):
        response = self.client.get(
            self.suggestion_url,
            {"store": self.store.id},
            **self.headers,
        )

        suggestions = {
            item["inventory_item_id"]: item for item in response.data["suggestions"]
        }
        water = suggestions[self.unlinked_inventory.id]
        self.assertIsNone(water["supplier"])
        self.assertIsNone(water["recommended_cases"])

    def test_creates_order_with_supplier_cost_snapshot(self):
        response = self.create_order()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], PurchaseOrder.ORDERED)
        self.assertEqual(response.data["total_cost"], "1200.00")
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["units_per_case"], 24)
        self.assertEqual(response.data["items"][0]["case_cost"], "600.00")
        self.assertEqual(response.data["items"][0]["ordered_quantity"], "48.000")

    def test_rejects_order_for_other_organisation_supplier(self):
        response = self.create_order(supplier_id=self.other_supplier.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_rejects_order_with_inventory_from_other_organisation(self):
        response = self.create_order(
            items=[
                {
                    "inventory_item_id": self.other_inventory.id,
                    "cases": "1.00",
                }
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_rejects_order_for_product_not_offered_by_supplier(self):
        response = self.create_order(
            items=[
                {
                    "inventory_item_id": self.unlinked_inventory.id,
                    "cases": "1.00",
                }
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(PurchaseOrder.objects.count(), 0)

    def test_rejects_duplicate_product_lines_in_order(self):
        response = self.create_order(
            items=[
                {"inventory_item_id": self.inventory.id, "cases": "1.00"},
                {"inventory_item_id": self.inventory.id, "cases": "2.00"},
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_receiving_order_updates_stock_weighted_cost_and_movement(self):
        created = self.create_order()

        response = self.client.post(
            reverse("colmado-purchase-order-receive", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], PurchaseOrder.RECEIVED)
        self.assertEqual(response.data["items"][0]["received_quantity"], "48.000")
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("52.000"))
        self.assertEqual(self.inventory.cost_price, Decimal("25.38"))
        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.quantity_change, Decimal("48.000"))
        self.assertEqual(movement.quantity_after, Decimal("52.000"))
        self.assertEqual(movement.unit_cost, Decimal("25.00"))

    def test_order_cannot_be_received_twice(self):
        created = self.create_order()
        url = reverse("colmado-purchase-order-receive", args=(created.data["id"],))
        first_response = self.client.post(url, format="json", **self.headers)

        second_response = self.client.post(url, format="json", **self.headers)

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("52.000"))
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_cancelled_order_cannot_be_received(self):
        created = self.create_order()
        cancel_response = self.client.post(
            reverse("colmado-purchase-order-cancel", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        receive_response = self.client.post(
            reverse("colmado-purchase-order-receive", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(cancel_response.status_code, status.HTTP_200_OK)
        self.assertEqual(cancel_response.data["status"], PurchaseOrder.CANCELLED)
        self.assertEqual(receive_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("4.000"))

    def test_received_order_cannot_be_cancelled(self):
        created = self.create_order()
        self.client.post(
            reverse("colmado-purchase-order-receive", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        response = self.client.post(
            reverse("colmado-purchase-order-cancel", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_purchase_order_list_is_tenant_scoped(self):
        own_order = self.create_order()
        other_order = PurchaseOrder.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            supplier=self.other_supplier,
            created_by=self.other_owner,
            status=PurchaseOrder.ORDERED,
        )

        response = self.client.get(self.order_url, **self.headers)

        self.assertEqual(own_order.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertNotEqual(response.data[0]["id"], other_order.id)

    def test_cannot_receive_order_from_other_organisation(self):
        other_order = PurchaseOrder.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            supplier=self.other_supplier,
            created_by=self.other_owner,
            status=PurchaseOrder.ORDERED,
        )

        response = self.client.post(
            reverse("colmado-purchase-order-receive", args=(other_order.id,)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_inventory_movement_list_is_tenant_scoped(self):
        created = self.create_order()
        self.client.post(
            reverse("colmado-purchase-order-receive", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )
        InventoryMovement.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            inventory_item=self.other_inventory,
            created_by=self.other_owner,
            movement_type=InventoryMovement.ADJUSTMENT,
            quantity_change=Decimal("1.000"),
            quantity_after=Decimal("3.000"),
        )

        response = self.client.get(self.movement_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["inventory_item"], self.inventory.id)
