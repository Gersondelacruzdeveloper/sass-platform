from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    InventoryCountItem,
    InventoryCountSession,
    InventoryItem,
    InventoryMovement,
    MasterProduct,
    Store,
)


class InventoryCountsApiTests(APITestCase):
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
        self.membership = Membership.objects.create(
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
        self.second_store = Store.objects.create(
            organisation=self.organisation,
            name="Bávaro",
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
        self.second_product = MasterProduct.objects.create(
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
            quantity=Decimal("10.000"),
            reorder_level=Decimal("2.000"),
        )
        self.second_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.second_product,
            cost_price=Decimal("10.00"),
            sale_price=Decimal("25.00"),
            quantity=Decimal("5.000"),
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.product,
            cost_price=Decimal("29.00"),
            sale_price=Decimal("55.00"),
            quantity=Decimal("20.000"),
        )
        self.counts_url = reverse("colmado-inventory-count-list")
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }
        self.client.force_authenticate(self.owner)

    def create_count(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "note": "Conteo del cierre",
        }
        payload.update(overrides)
        return self.client.post(
            self.counts_url,
            payload,
            format="json",
            **self.headers,
        )

    def create_count_model(self):
        response = self.create_count()
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return InventoryCountSession.objects.get(pk=response.data["id"])

    def count_item(self, inventory_count, **overrides):
        payload = {
            "barcode": self.product.barcode,
            "counted_quantity": "8.000",
            "reason": InventoryCountItem.REGULAR_COUNT,
            "note": "Verificado",
        }
        payload.update(overrides)
        if payload.get("barcode") is None:
            payload.pop("barcode")
        return self.client.post(
            reverse(
                "colmado-inventory-count-count-item",
                args=(inventory_count.id,),
            ),
            payload,
            format="json",
            **self.headers,
        )

    def complete_count(self, inventory_count):
        return self.client.post(
            reverse(
                "colmado-inventory-count-complete",
                args=(inventory_count.id,),
            ),
            {},
            format="json",
            **self.headers,
        )

    def cancel_count(self, inventory_count):
        return self.client.post(
            reverse(
                "colmado-inventory-count-cancel",
                args=(inventory_count.id,),
            ),
            {},
            format="json",
            **self.headers,
        )

    def adjust_inventory(self, inventory_item=None, **overrides):
        inventory_item = inventory_item or self.inventory
        payload = {
            "new_quantity": "7.000",
            "reason": InventoryMovement.DAMAGED,
            "note": "Tres botellas rotas",
        }
        payload.update(overrides)
        return self.client.post(
            reverse("colmado-inventory-adjust", args=(inventory_item.id,)),
            payload,
            format="json",
            **self.headers,
        )

    def test_inventory_counts_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.counts_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_open_count_for_current_store(self):
        response = self.create_count()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        inventory_count = InventoryCountSession.objects.get(pk=response.data["id"])
        self.assertEqual(inventory_count.organisation, self.organisation)
        self.assertEqual(inventory_count.store, self.store)
        self.assertEqual(inventory_count.created_by, self.owner)
        self.assertEqual(inventory_count.status, InventoryCountSession.OPEN)

    def test_rejects_store_from_another_organisation(self):
        response = self.create_count(store_id=self.other_store.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store_id", response.data)

    def test_rejects_second_open_count_for_same_store(self):
        self.create_count_model()

        response = self.create_count()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store_id", response.data)

    def test_allows_open_counts_for_different_stores(self):
        self.create_count_model()

        response = self.create_count(store_id=self.second_store.id)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(InventoryCountSession.objects.count(), 2)

    def test_count_list_is_tenant_scoped(self):
        own_count = self.create_count_model()
        InventoryCountSession.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            created_by=self.other_owner,
        )

        response = self.client.get(self.counts_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_count.id)

    def test_cannot_retrieve_count_from_other_organisation(self):
        other_count = InventoryCountSession.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            created_by=self.other_owner,
        )

        response = self.client.get(
            reverse("colmado-inventory-count-detail", args=(other_count.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_counts_product_by_barcode_without_changing_stock_yet(self):
        inventory_count = self.create_count_model()

        response = self.count_item(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["expected_quantity"], "10.000")
        self.assertEqual(response.data["counted_quantity"], "8.000")
        self.assertEqual(response.data["difference"], "-2.000")
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))

    def test_counts_product_without_barcode_using_inventory_id(self):
        inventory_count = self.create_count_model()

        response = self.count_item(
            inventory_count,
            barcode=None,
            inventory_item_id=self.second_inventory.id,
            counted_quantity="4.000",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["inventory_item_id"], self.second_inventory.id)

    def test_rejects_barcode_and_inventory_id_together(self):
        inventory_count = self.create_count_model()

        response = self.count_item(
            inventory_count,
            inventory_item_id=self.inventory.id,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("non_field_errors", response.data)

    def test_rejects_product_from_another_organisation(self):
        inventory_count = self.create_count_model()

        response = self.count_item(
            inventory_count,
            barcode=None,
            inventory_item_id=self.other_inventory.id,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("product", response.data)

    def test_recount_updates_existing_line_without_duplicate(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count, counted_quantity="8.000")

        response = self.count_item(inventory_count, counted_quantity="9.000")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["counted_quantity"], "9.000")
        self.assertEqual(response.data["expected_quantity"], "10.000")
        self.assertEqual(inventory_count.items.count(), 1)

    def test_completed_count_cannot_receive_more_scans(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count)
        self.complete_count(inventory_count)

        response = self.count_item(inventory_count, counted_quantity="7.000")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_rejects_completing_empty_count(self):
        inventory_count = self.create_count_model()

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_completing_count_applies_difference_and_creates_movement(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count, counted_quantity="8.000")

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], InventoryCountSession.COMPLETED)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("8.000"))
        movement = InventoryMovement.objects.get(
            movement_type=InventoryMovement.INVENTORY_COUNT
        )
        self.assertEqual(movement.quantity_change, Decimal("-2.000"))
        self.assertEqual(movement.inventory_count, inventory_count)
        self.assertEqual(movement.created_by, self.owner)

    def test_count_can_increase_inventory(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count, counted_quantity="12.000")

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("12.000"))
        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.quantity_change, Decimal("2.000"))

    def test_matching_count_does_not_create_zero_movement(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count, counted_quantity="10.000")

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_reason_controls_inventory_movement_type(self):
        inventory_count = self.create_count_model()
        self.count_item(
            inventory_count,
            counted_quantity="8.000",
            reason=InventoryCountItem.DAMAGED,
        )

        self.complete_count(inventory_count)

        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.movement_type, InventoryMovement.DAMAGED)

    def test_completed_count_cannot_be_completed_twice(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count)
        self.complete_count(inventory_count)

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_cancelling_count_does_not_change_inventory(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count, counted_quantity="2.000")

        response = self.cancel_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], InventoryCountSession.CANCELLED)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_cancelled_count_cannot_be_completed(self):
        inventory_count = self.create_count_model()
        self.count_item(inventory_count)
        self.cancel_count(inventory_count)

        response = self.complete_count(inventory_count)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_quick_adjustment_reduces_stock_and_records_reason(self):
        response = self.adjust_inventory()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["quantity"], "7.000")
        self.assertEqual(response.data["quantity_change"], "-3.000")
        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.movement_type, InventoryMovement.DAMAGED)
        self.assertEqual(movement.created_by, self.owner)

    def test_manual_correction_can_increase_stock(self):
        response = self.adjust_inventory(
            new_quantity="12.000",
            reason=InventoryMovement.CORRECTION,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("12.000"))

    def test_damage_reason_cannot_increase_stock(self):
        response = self.adjust_inventory(new_quantity="12.000")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_quantity", response.data)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))

    def test_quick_adjustment_rejects_unchanged_quantity(self):
        response = self.adjust_inventory(
            new_quantity="10.000",
            reason=InventoryMovement.CORRECTION,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("new_quantity", response.data)
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_cannot_adjust_inventory_from_another_organisation(self):
        response = self.adjust_inventory(inventory_item=self.other_inventory)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.other_inventory.refresh_from_db()
        self.assertEqual(self.other_inventory.quantity, Decimal("20.000"))

    def test_inactive_membership_cannot_manage_counts(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))

        response = self.client.get(self.counts_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
