from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    Customer,
    CustomerOrder,
    InventoryItem,
    InventoryMovement,
    MasterProduct,
    Store,
    Storefront,
)


class CustomerOrdersApiTests(APITestCase):
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
            address="Calle Principal, Macao",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Colmado Ajeno",
        )
        self.product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            presentation="12 oz",
            category="Bebidas",
        )
        self.second_product = MasterProduct.objects.create(
            barcode="7460123456796",
            name="Agua",
            presentation="16 oz",
            category="Bebidas",
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
        self.out_of_stock_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.second_product,
            cost_price=Decimal("10.00"),
            sale_price=Decimal("25.00"),
            quantity=Decimal("0.000"),
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.product,
            cost_price=Decimal("31.00"),
            sale_price=Decimal("55.00"),
            quantity=Decimal("20.000"),
        )
        self.storefront = Storefront.objects.create(
            organisation=self.organisation,
            store=self.store,
            slug="colmado-macao",
            display_name="Colmado Macao",
            public_phone="8095550101",
            public_address="Calle Principal, Macao",
            delivery_fee=Decimal("75.00"),
            minimum_order=Decimal("50.00"),
        )
        self.other_storefront = Storefront.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            slug="colmado-ajeno",
            display_name="Colmado Ajeno",
        )
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }
        self.storefront_url = reverse("colmado-storefront-list")
        self.orders_url = reverse("colmado-customer-order-list")
        self.public_detail_url = reverse(
            "colmado-public-storefront-detail",
            args=(self.storefront.slug,),
        )
        self.public_catalog_url = reverse(
            "colmado-public-storefront-catalog",
            args=(self.storefront.slug,),
        )
        self.public_create_url = reverse(
            "colmado-public-order-create",
            args=(self.storefront.slug,),
        )
        self.client.force_authenticate(self.owner)

    def order_payload(self, **overrides):
        payload = {
            "idempotency_key": "mobile-attempt-001",
            "customer_name": "Ana Pérez",
            "customer_phone": "8095550202",
            "delivery_address": "Frente al play de Macao",
            "latitude": "18.761797",
            "longitude": "-68.535450",
            "delivery_notes": "Casa azul",
            "items": [
                {
                    "inventory_item_id": self.inventory.id,
                    "quantity": "2.000",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def create_public_order(self, **overrides):
        self.client.force_authenticate(user=None)
        return self.client.post(
            self.public_create_url,
            self.order_payload(**overrides),
            format="json",
        )

    def create_order_model(self, **overrides):
        response = self.create_public_order(**overrides)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        return CustomerOrder.objects.get(order_number=response.data["order_number"])

    def set_order_status(self, order, new_status):
        self.client.force_authenticate(self.owner)
        return self.client.post(
            reverse("colmado-customer-order-set-status", args=(order.id,)),
            {"status": new_status},
            format="json",
            **self.headers,
        )

    def test_public_storefront_is_available_without_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.public_detail_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["display_name"], "Colmado Macao")
        self.assertEqual(response.data["delivery_fee"], "75.00")

    def test_inactive_public_storefront_is_hidden(self):
        self.storefront.is_active = False
        self.storefront.save(update_fields=("is_active", "updated_at"))
        self.client.force_authenticate(user=None)

        response = self.client.get(self.public_detail_url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_public_catalog_only_lists_available_products_from_storefront_store(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.public_catalog_url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.inventory.id)
        self.assertNotIn("quantity", response.data[0])

    def test_public_catalog_can_search_by_barcode(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(
            self.public_catalog_url,
            {"search": self.product.barcode},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["barcode"], self.product.barcode)

    def test_creates_public_order_with_server_prices_and_delivery_fee(self):
        response = self.create_public_order()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["subtotal"], "100.00")
        self.assertEqual(response.data["delivery_fee"], "75.00")
        self.assertEqual(response.data["total"], "175.00")
        self.assertEqual(response.data["status"], CustomerOrder.NEW)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))
        self.assertTrue(
            Customer.objects.filter(
                organisation=self.organisation,
                phone="8095550202",
            ).exists()
        )

    def test_replaying_same_idempotency_key_does_not_duplicate_order(self):
        first_response = self.create_public_order()
        second_response = self.create_public_order()

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            first_response.data["order_number"],
            second_response.data["order_number"],
        )
        self.assertEqual(CustomerOrder.objects.count(), 1)

    def test_rejects_repeated_product_in_same_order(self):
        response = self.create_public_order(
            items=[
                {"inventory_item_id": self.inventory.id, "quantity": "1.000"},
                {"inventory_item_id": self.inventory.id, "quantity": "1.000"},
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_rejects_order_below_storefront_minimum(self):
        self.storefront.minimum_order = Decimal("150.00")
        self.storefront.save(update_fields=("minimum_order", "updated_at"))

        response = self.create_public_order()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_rejects_inventory_from_another_organisation(self):
        response = self.create_public_order(
            items=[
                {
                    "inventory_item_id": self.other_inventory.id,
                    "quantity": "1.000",
                }
            ]
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_storefront_can_pause_new_orders(self):
        self.storefront.is_accepting_orders = False
        self.storefront.save(update_fields=("is_accepting_orders", "updated_at"))

        response = self.create_public_order()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("detail", response.data)

    def test_internal_orders_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.orders_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_internal_order_list_is_tenant_scoped(self):
        order = self.create_order_model()
        CustomerOrder.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            storefront=self.other_storefront,
            idempotency_key="other-order",
            customer_name="Cliente Ajeno",
            customer_phone="8090000000",
            delivery_address="Otra dirección",
            subtotal=Decimal("55.00"),
            total=Decimal("55.00"),
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get(self.orders_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], order.id)

    def test_cannot_open_order_from_another_organisation(self):
        other_order = CustomerOrder.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            storefront=self.other_storefront,
            idempotency_key="other-order",
            customer_name="Cliente Ajeno",
            customer_phone="8090000000",
            delivery_address="Otra dirección",
            subtotal=Decimal("55.00"),
            total=Decimal("55.00"),
        )
        self.client.force_authenticate(self.owner)

        response = self.client.get(
            reverse("colmado-customer-order-detail", args=(other_order.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_accepting_order_deducts_stock_and_records_movement(self):
        order = self.create_order_model()

        response = self.set_order_status(order, CustomerOrder.PREPARING)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], CustomerOrder.PREPARING)
        self.assertTrue(response.data["inventory_committed"])
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("8.000"))
        movement = InventoryMovement.objects.get(
            movement_type=InventoryMovement.CUSTOMER_ORDER
        )
        self.assertEqual(movement.quantity_change, Decimal("-2.000"))
        self.assertEqual(movement.created_by, self.owner)

    def test_accepting_same_order_twice_does_not_deduct_stock_twice(self):
        order = self.create_order_model()
        first_response = self.set_order_status(order, CustomerOrder.PREPARING)
        second_response = self.set_order_status(order, CustomerOrder.PREPARING)

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("8.000"))
        self.assertEqual(
            InventoryMovement.objects.filter(
                movement_type=InventoryMovement.CUSTOMER_ORDER
            ).count(),
            1,
        )

    def test_accepting_rechecks_current_stock(self):
        order = self.create_order_model()
        self.inventory.quantity = Decimal("1.000")
        self.inventory.save(update_fields=("quantity", "updated_at"))

        response = self.set_order_status(order, CustomerOrder.PREPARING)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)
        order.refresh_from_db()
        self.assertEqual(order.status, CustomerOrder.NEW)

    def test_cannot_skip_required_order_status(self):
        order = self.create_order_model()

        response = self.set_order_status(order, CustomerOrder.READY)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("status", response.data)

    def test_order_can_advance_to_delivered_in_sequence(self):
        order = self.create_order_model()

        for next_status in (
            CustomerOrder.PREPARING,
            CustomerOrder.READY,
            CustomerOrder.ON_THE_WAY,
            CustomerOrder.DELIVERED,
        ):
            response = self.set_order_status(order, next_status)
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertEqual(response.data["status"], next_status)
            order.refresh_from_db()

        self.assertIsNotNone(order.accepted_at)
        self.assertIsNotNone(order.ready_at)
        self.assertIsNotNone(order.dispatched_at)
        self.assertIsNotNone(order.delivered_at)

    def test_cancelling_new_order_does_not_change_stock(self):
        order = self.create_order_model()

        response = self.set_order_status(order, CustomerOrder.CANCELLED)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))
        self.assertEqual(InventoryMovement.objects.count(), 0)

    def test_cancelling_accepted_order_restores_stock_once(self):
        order = self.create_order_model()
        self.set_order_status(order, CustomerOrder.PREPARING)

        response = self.set_order_status(order, CustomerOrder.CANCELLED)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data["inventory_committed"])
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("10.000"))
        self.assertEqual(
            InventoryMovement.objects.filter(
                movement_type=InventoryMovement.CUSTOMER_ORDER_CANCELLED
            ).count(),
            1,
        )

    def test_delivered_order_cannot_be_cancelled(self):
        order = self.create_order_model()
        for next_status in (
            CustomerOrder.PREPARING,
            CustomerOrder.READY,
            CustomerOrder.ON_THE_WAY,
            CustomerOrder.DELIVERED,
        ):
            self.set_order_status(order, next_status)
            order.refresh_from_db()

        response = self.set_order_status(order, CustomerOrder.CANCELLED)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("8.000"))

    def test_tracking_requires_customer_phone(self):
        order = self.create_order_model()
        self.client.force_authenticate(user=None)
        tracking_url = reverse(
            "colmado-public-order-track",
            args=(self.storefront.slug, order.order_number),
        )

        response = self.client.get(tracking_url)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_tracking_rejects_wrong_phone(self):
        order = self.create_order_model()
        self.client.force_authenticate(user=None)
        tracking_url = reverse(
            "colmado-public-order-track",
            args=(self.storefront.slug, order.order_number),
        )

        response = self.client.get(tracking_url, {"phone": "8090000000"})

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_tracking_returns_maps_link_for_exact_location(self):
        order = self.create_order_model()
        self.client.force_authenticate(user=None)
        tracking_url = reverse(
            "colmado-public-order-track",
            args=(self.storefront.slug, order.order_number),
        )

        response = self.client.get(
            tracking_url,
            {"phone": "8095550202"},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("18.761797", response.data["maps_url"])
        self.assertIn("-68.535450", response.data["maps_url"])
        self.assertNotIn("inventory_committed", response.data)

    def test_inactive_membership_cannot_manage_customer_orders(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))
        self.client.force_authenticate(self.owner)

        response = self.client.get(self.orders_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
