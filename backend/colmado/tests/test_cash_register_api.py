from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    CashRegisterSession,
    InventoryItem,
    MasterProduct,
    Sale,
    Store,
)


class CashRegisterApiTests(APITestCase):
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
        self.product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Coca-Cola",
            presentation="12 oz",
            category="Refrescos",
            unit=MasterProduct.UNIT,
            sale_mode=MasterProduct.BY_UNIT,
        )
        self.inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.product,
            cost_price=Decimal("30.00"),
            sale_price=Decimal("50.00"),
            quantity=Decimal("20.000"),
            reorder_level=Decimal("5.000"),
        )
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }
        self.list_url = reverse("colmado-cash-register-list")
        self.open_url = reverse("colmado-cash-register-open")
        self.current_url = reverse("colmado-cash-register-current")
        self.sales_url = reverse("colmado-sale-list")

    def open_register(self, store=None, **overrides):
        payload = {
            "store_id": (store or self.store).id,
            "opening_amount": "1000.00",
            "note": "Inicio del turno",
        }
        payload.update(overrides)
        return self.client.post(
            self.open_url,
            payload,
            format="json",
            **self.headers,
        )

    def create_sale(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "payment_method": Sale.CASH,
            "amount_received": "100.00",
            "discount": "0.00",
            "items": [
                {
                    "barcode": self.product.barcode,
                    "quantity": "1.000",
                }
            ],
        }
        payload.update(overrides)
        return self.client.post(
            self.sales_url,
            payload,
            format="json",
            **self.headers,
        )

    def close_register(self, register_id, **overrides):
        payload = {"counted_cash": "1050.00"}
        payload.update(overrides)
        return self.client.post(
            reverse("colmado-cash-register-close", args=(register_id,)),
            payload,
            format="json",
            **self.headers,
        )

    def test_cash_registers_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cash_registers_require_organisation(self):
        response = self.client.get(self.list_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_opens_cash_register_with_expected_cash_equal_to_opening_amount(self):
        response = self.open_register()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["status"], CashRegisterSession.OPEN)
        self.assertEqual(response.data["opening_amount"], "1000.00")
        self.assertEqual(response.data["cash_sales"], "0.00")
        self.assertEqual(response.data["expected_cash"], "1000.00")
        self.assertEqual(response.data["opened_by"], self.owner.id)
        self.assertIsNone(response.data["closed_by"])

    def test_allows_opening_with_zero_initial_cash(self):
        response = self.open_register(opening_amount="0.00")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["expected_cash"], "0.00")

    def test_rejects_negative_opening_amount(self):
        response = self.open_register(opening_amount="-0.01")

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("opening_amount", response.data)
        self.assertEqual(CashRegisterSession.objects.count(), 0)

    def test_rejects_store_from_another_organisation(self):
        response = self.open_register(store=self.other_store)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store_id", response.data)

    def test_rejects_inactive_store(self):
        self.store.is_active = False
        self.store.save(update_fields=("is_active",))

        response = self.open_register()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_second_open_register_for_same_store(self):
        first_response = self.open_register()
        second_response = self.open_register()

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store_id", second_response.data)

    def test_allows_one_open_register_in_each_store(self):
        first_response = self.open_register()
        second_response = self.open_register(store=self.second_store)

        self.assertEqual(first_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            CashRegisterSession.objects.filter(
                organisation=self.organisation,
                status=CashRegisterSession.OPEN,
            ).count(),
            2,
        )

    def test_returns_current_open_register_for_store(self):
        opened = self.open_register()

        response = self.client.get(
            self.current_url,
            {"store": self.store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], opened.data["id"])

    def test_current_requires_store(self):
        response = self.client.get(self.current_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store", response.data)

    def test_current_rejects_invalid_store_value(self):
        response = self.client.get(
            self.current_url,
            {"store": "abc"},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store", response.data)

    def test_current_returns_simple_not_open_response(self):
        response = self.client.get(
            self.current_url,
            {"store": self.store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertEqual(response.data["code"], "cash_register_not_open")

    def test_list_only_returns_current_organisation_registers(self):
        own = self.open_register()
        CashRegisterSession.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            opened_by=self.other_owner,
            opening_amount=Decimal("500.00"),
            expected_cash=Decimal("500.00"),
        )

        response = self.client.get(self.list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], own.data["id"])

    def test_cannot_retrieve_register_from_another_organisation(self):
        other_register = CashRegisterSession.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            opened_by=self.other_owner,
            opening_amount=Decimal("500.00"),
            expected_cash=Decimal("500.00"),
        )

        response = self.client.get(
            reverse("colmado-cash-register-detail", args=(other_register.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_filters_registers_by_store_and_status(self):
        first = self.open_register()
        self.close_register(first.data["id"], counted_cash="1000.00")
        second = self.open_register(store=self.second_store)

        response = self.client.get(
            self.list_url,
            {"store": self.second_store.id, "status": CashRegisterSession.OPEN},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], second.data["id"])

    def test_cash_sale_is_attached_and_updates_expected_cash(self):
        opened = self.open_register()

        sale_response = self.create_sale()

        self.assertEqual(sale_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            sale_response.data["cash_register_session"],
            opened.data["id"],
        )
        register = CashRegisterSession.objects.get(pk=opened.data["id"])
        self.assertEqual(register.cash_sales, Decimal("50.00"))
        self.assertEqual(register.expected_cash, Decimal("1050.00"))

    def test_card_sale_is_attached_but_does_not_increase_cash(self):
        opened = self.open_register()

        sale_response = self.create_sale(payment_method=Sale.CARD)

        self.assertEqual(sale_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(
            sale_response.data["cash_register_session"],
            opened.data["id"],
        )
        register = CashRegisterSession.objects.get(pk=opened.data["id"])
        self.assertEqual(register.cash_sales, Decimal("0.00"))
        self.assertEqual(register.expected_cash, Decimal("1000.00"))

    def test_sale_still_works_without_an_open_register(self):
        response = self.create_sale()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data["cash_register_session"])
        self.assertIsNone(response.data["cash_register_session_number"])

    def test_void_cash_sale_updates_open_register(self):
        opened = self.open_register()
        sale_response = self.create_sale()

        response = self.client.post(
            reverse("colmado-sale-void", args=(sale_response.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        register = CashRegisterSession.objects.get(pk=opened.data["id"])
        self.assertEqual(register.cash_sales, Decimal("0.00"))
        self.assertEqual(register.expected_cash, Decimal("1000.00"))

    def test_closes_register_with_exact_cash(self):
        opened = self.open_register()
        self.create_sale()

        response = self.close_register(opened.data["id"])

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["status"], CashRegisterSession.CLOSED)
        self.assertEqual(response.data["cash_sales"], "50.00")
        self.assertEqual(response.data["expected_cash"], "1050.00")
        self.assertEqual(response.data["counted_cash"], "1050.00")
        self.assertEqual(response.data["difference"], "0.00")
        self.assertEqual(response.data["closed_by"], self.owner.id)
        self.assertIsNotNone(response.data["closed_at"])

    def test_closes_register_with_shortage(self):
        opened = self.open_register()
        self.create_sale()

        response = self.close_register(
            opened.data["id"],
            counted_cash="1040.00",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["difference"], "-10.00")

    def test_closes_register_with_overage(self):
        opened = self.open_register()
        self.create_sale()

        response = self.close_register(
            opened.data["id"],
            counted_cash="1060.00",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["difference"], "10.00")

    def test_register_cannot_be_closed_twice(self):
        opened = self.open_register()
        first_response = self.close_register(
            opened.data["id"],
            counted_cash="1000.00",
        )

        second_response = self.close_register(
            opened.data["id"],
            counted_cash="1000.00",
        )

        self.assertEqual(first_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second_response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cash_sale_from_closed_register_cannot_be_voided(self):
        opened = self.open_register()
        sale_response = self.create_sale()
        self.close_register(opened.data["id"])

        response = self.client.post(
            reverse("colmado-sale-void", args=(sale_response.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        sale = Sale.objects.get(pk=sale_response.data["id"])
        self.assertEqual(sale.status, Sale.COMPLETED)
        self.inventory.refresh_from_db()
        self.assertEqual(self.inventory.quantity, Decimal("19.000"))

    def test_can_open_new_register_after_previous_one_is_closed(self):
        first = self.open_register()
        close_response = self.close_register(
            first.data["id"],
            counted_cash="1000.00",
        )

        second = self.open_register(opening_amount="500.00")

        self.assertEqual(close_response.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first.data["id"], second.data["id"])

    def test_cannot_close_register_from_another_organisation(self):
        other_register = CashRegisterSession.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            opened_by=self.other_owner,
            opening_amount=Decimal("500.00"),
            expected_cash=Decimal("500.00"),
        )

        response = self.close_register(
            other_register.id,
            counted_cash="500.00",
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
