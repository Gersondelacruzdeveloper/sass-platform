from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import InventoryItem, MasterProduct, Sale, Store


class SalesApiTests(APITestCase):
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
        self.second_store = Store.objects.create(
            organisation=self.organisation,
            name="Bávaro",
        )
        self.other_store = Store.objects.create(
            organisation=self.other_organisation,
            name="Colmado Ajeno",
        )
        self.coca_cola = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            presentation="12 oz",
            category="Refrescos",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
        )
        self.salami = MasterProduct.objects.create(
            barcode=None,
            name="Salami",
            category="Embutidos",
            unit=MasterProduct.POUND,
            sale_mode=MasterProduct.BY_AMOUNT,
        )
        self.coca_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.coca_cola,
            cost_price=Decimal("30.00"),
            sale_price=Decimal("50.00"),
            quantity=Decimal("20.000"),
            reorder_level=Decimal("5.000"),
        )
        self.salami_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.salami,
            cost_price=Decimal("100.00"),
            sale_price=Decimal("150.00"),
            quantity=Decimal("10.000"),
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.coca_cola,
            cost_price=Decimal("31.00"),
            sale_price=Decimal("55.00"),
            quantity=Decimal("30.000"),
        )
        self.list_url = reverse("colmado-sale-list")
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def sale_payload(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "payment_method": Sale.CASH,
            "discount": "0.00",
            "amount_received": "100.00",
            "items": [
                {
                    "barcode": self.coca_cola.barcode,
                    "quantity": "1.000",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def create_sale(self, **overrides):
        return self.client.post(
            self.list_url,
            self.sale_payload(**overrides),
            format="json",
            **self.headers,
        )

    def test_sales_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_cash_sale_by_barcode_and_deducts_inventory(self):
        response = self.create_sale()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["subtotal"], "50.00")
        self.assertEqual(response.data["total"], "50.00")
        self.assertEqual(response.data["change_due"], "50.00")
        self.assertEqual(len(response.data["items"]), 1)
        self.coca_inventory.refresh_from_db()
        self.assertEqual(self.coca_inventory.quantity, Decimal("19.000"))

    def test_creates_fractional_sale_using_quick_product_id(self):
        response = self.create_sale(
            amount_received="100.00",
            items=[
                {
                    "inventory_item_id": self.salami_inventory.id,
                    "quantity": "0.500",
                }
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total"], "75.00")
        self.assertEqual(response.data["items"][0]["unit"], MasterProduct.POUND)
        self.salami_inventory.refresh_from_db()
        self.assertEqual(self.salami_inventory.quantity, Decimal("9.500"))

    def test_repeated_scans_are_combined_into_one_sale_line(self):
        response = self.create_sale(
            amount_received="200.00",
            items=[
                {"barcode": self.coca_cola.barcode, "quantity": "1.000"},
                {"barcode": self.coca_cola.barcode, "quantity": "2.000"},
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["total"], "150.00")
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["quantity"], "3.000")

    def test_calculates_discount_and_cash_change(self):
        response = self.create_sale(
            amount_received="100.00",
            discount="10.00",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["subtotal"], "50.00")
        self.assertEqual(response.data["total"], "40.00")
        self.assertEqual(response.data["change_due"], "60.00")

    def test_card_sale_records_total_without_external_payment(self):
        response = self.create_sale(
            payment_method=Sale.CARD,
            amount_received="999.00",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["amount_received"], "50.00")
        self.assertEqual(response.data["change_due"], "0.00")

    def test_rejects_cash_sale_without_amount_received(self):
        payload = self.sale_payload()
        payload.pop("amount_received")

        response = self.client.post(
            self.list_url,
            payload,
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount_received", response.data)

    def test_rejects_cash_sale_when_customer_paid_too_little(self):
        response = self.create_sale(amount_received="49.99")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("amount_received", response.data)
        self.assertEqual(Sale.objects.count(), 0)

    def test_insufficient_stock_rolls_back_entire_sale(self):
        response = self.create_sale(
            amount_received="2000.00",
            items=[
                {"barcode": self.coca_cola.barcode, "quantity": "21.000"},
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)
        self.coca_inventory.refresh_from_db()
        self.assertEqual(self.coca_inventory.quantity, Decimal("20.000"))

    def test_rejects_store_from_another_organisation(self):
        response = self.create_sale(store_id=self.other_store.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)

    def test_rejects_inventory_item_from_another_organisation(self):
        response = self.create_sale(
            items=[
                {
                    "inventory_item_id": self.other_inventory.id,
                    "quantity": "1.000",
                }
            ],
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)

    def test_list_only_returns_current_organisation_sales(self):
        own_response = self.create_sale()
        Sale.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            cashier=self.other_owner,
            payment_method=Sale.CASH,
            subtotal=Decimal("55.00"),
            total=Decimal("55.00"),
            amount_received=Decimal("60.00"),
            change_due=Decimal("5.00"),
        )

        response = self.client.get(self.list_url, **self.headers)

        self.assertEqual(own_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own_response.data["id"])

    def test_cannot_retrieve_sale_from_another_organisation(self):
        other_sale = Sale.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            cashier=self.other_owner,
            payment_method=Sale.CASH,
        )

        response = self.client.get(
            reverse("colmado-sale-detail", args=(other_sale.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_void_sale_returns_products_to_inventory(self):
        created = self.create_sale()

        response = self.client.post(
            reverse("colmado-sale-void", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], Sale.VOIDED)
        self.assertIsNotNone(response.data["voided_at"])
        self.coca_inventory.refresh_from_db()
        self.assertEqual(self.coca_inventory.quantity, Decimal("20.000"))

    def test_sale_cannot_be_voided_twice(self):
        created = self.create_sale()
        url = reverse("colmado-sale-void", args=(created.data["id"],))
        first_response = self.client.post(url, format="json", **self.headers)

        second_response = self.client.post(url, format="json", **self.headers)

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.coca_inventory.refresh_from_db()
        self.assertEqual(self.coca_inventory.quantity, Decimal("20.000"))

    def test_cannot_void_sale_from_another_organisation(self):
        other_sale = Sale.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            cashier=self.other_owner,
            payment_method=Sale.CASH,
        )

        response = self.client.post(
            reverse("colmado-sale-void", args=(other_sale.id,)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_rejects_empty_sale(self):
        response = self.create_sale(items=[])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_rejects_line_without_barcode_or_inventory_id(self):
        response = self.create_sale(items=[{"quantity": "1.000"}])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("items", response.data)

    def test_sale_keeps_historical_product_and_price_snapshot(self):
        created = self.create_sale()
        self.coca_cola.name = "Nombre cambiado"
        self.coca_cola.save(update_fields=("name",))
        self.coca_inventory.sale_price = Decimal("75.00")
        self.coca_inventory.save(update_fields=("sale_price",))

        response = self.client.get(
            reverse("colmado-sale-detail", args=(created.data["id"],)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("Coca-Cola", response.data["items"][0]["product_name"])
        self.assertEqual(response.data["items"][0]["unit_price"], "50.00")

    def test_invalid_date_filter_returns_clear_validation_error(self):
        response = self.client.get(
            self.list_url,
            {"date_from": "20-09-2026"},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_from", response.data)
