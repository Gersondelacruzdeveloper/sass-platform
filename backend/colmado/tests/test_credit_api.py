from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    CreditTransaction,
    Customer,
    InventoryItem,
    MasterProduct,
    Sale,
    Store,
)


class CreditApiTests(APITestCase):
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
            name="Arroz Selecto",
            presentation="1 libra",
            category="Comestibles",
        )
        self.inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.product,
            cost_price=Decimal("30.00"),
            sale_price=Decimal("50.00"),
            quantity=Decimal("20.000"),
        )
        self.customer = Customer.objects.create(
            organisation=self.organisation,
            name="Juan Pérez",
            phone="8095550101",
            address="Macao",
            credit_limit=Decimal("500.00"),
        )
        self.other_customer = Customer.objects.create(
            organisation=self.other_organisation,
            name="Cliente Ajeno",
            phone="8095550202",
        )
        self.customer_list_url = reverse("colmado-customer-list")
        self.sale_list_url = reverse("colmado-sale-list")
        self.credit_list_url = reverse("colmado-credit-transaction-list")
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def credit_sale_payload(self, **overrides):
        payload = {
            "store_id": self.store.id,
            "payment_method": Sale.CREDIT,
            "customer_id": self.customer.id,
            "credit_due_date": str(timezone.localdate() + timedelta(days=7)),
            "items": [
                {
                    "barcode": self.product.barcode,
                    "quantity": "2.000",
                }
            ],
        }
        payload.update(overrides)
        return payload

    def create_credit_sale(self, **overrides):
        return self.client.post(
            self.sale_list_url,
            self.credit_sale_payload(**overrides),
            format="json",
            **self.headers,
        )

    def test_customers_require_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.customer_list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_customer_with_zero_balance(self):
        response = self.client.post(
            self.customer_list_url,
            {
                "name": "  María López  ",
                "phone": "8095550303",
                "address": "Verón",
                "credit_limit": "1000.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["name"], "María López")
        self.assertEqual(response.data["balance"], "0.00")
        self.assertEqual(response.data["available_credit"], "1000.00")

    def test_balance_cannot_be_changed_through_customer_patch(self):
        response = self.client.patch(
            reverse("colmado-customer-detail", args=(self.customer.id,)),
            {"balance": "400.00", "name": "Juan Actualizado"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("0.00"))
        self.assertEqual(self.customer.name, "Juan Actualizado")

    def test_rejects_duplicate_phone_inside_same_organisation(self):
        response = self.client.post(
            self.customer_list_url,
            {"name": "Otro Juan", "phone": self.customer.phone},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("phone", response.data)

    def test_customer_list_is_tenant_scoped(self):
        response = self.client.get(self.customer_list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.customer.id)

    def test_cannot_retrieve_customer_from_another_organisation(self):
        response = self.client.get(
            reverse("colmado-customer-detail", args=(self.other_customer.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_customer_searches_by_name_or_phone(self):
        name_response = self.client.get(
            self.customer_list_url,
            {"search": "Juan"},
            **self.headers,
        )
        phone_response = self.client.get(
            self.customer_list_url,
            {"search": "0101"},
            **self.headers,
        )

        self.assertEqual(len(name_response.data), 1)
        self.assertEqual(len(phone_response.data), 1)

    def test_credit_sale_increases_balance_and_creates_ledger_charge(self):
        response = self.create_credit_sale()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["payment_method"], Sale.CREDIT)
        self.assertEqual(response.data["customer"], self.customer.id)
        self.assertEqual(response.data["total"], "100.00")
        self.assertEqual(response.data["amount_received"], "0.00")
        self.customer.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("100.00"))
        self.assertEqual(self.inventory.quantity, Decimal("18.000"))
        transaction_entry = CreditTransaction.objects.get(
            transaction_type=CreditTransaction.CHARGE
        )
        self.assertEqual(transaction_entry.amount, Decimal("100.00"))
        self.assertEqual(transaction_entry.balance_after, Decimal("100.00"))

    def test_credit_sale_requires_customer(self):
        payload = self.credit_sale_payload()
        payload.pop("customer_id")

        response = self.client.post(
            self.sale_list_url,
            payload,
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("customer_id", response.data)

    def test_credit_sale_rejects_customer_from_another_organisation(self):
        response = self.create_credit_sale(customer_id=self.other_customer.id)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)

    def test_credit_sale_rejects_inactive_customer(self):
        self.customer.is_active = False
        self.customer.save(update_fields=("is_active",))

        response = self.create_credit_sale()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)

    def test_credit_limit_prevents_sale_and_preserves_inventory(self):
        self.customer.credit_limit = Decimal("75.00")
        self.customer.save(update_fields=("credit_limit",))

        response = self.create_credit_sale()

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Sale.objects.count(), 0)
        self.customer.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("0.00"))
        self.assertEqual(self.inventory.quantity, Decimal("20.000"))

    def test_partial_payment_reduces_customer_balance(self):
        sale_response = self.create_credit_sale()

        response = self.client.post(
            reverse("colmado-customer-payments", args=(self.customer.id,)),
            {"store_id": self.store.id, "amount": "40.00", "note": "Abono"},
            format="json",
            **self.headers,
        )

        self.assertEqual(sale_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["customer"]["balance"], "60.00")
        self.assertEqual(response.data["transaction"]["amount"], "40.00")
        self.assertEqual(
            response.data["transaction"]["transaction_type"],
            CreditTransaction.PAYMENT,
        )

    def test_full_payment_leaves_zero_balance(self):
        self.create_credit_sale()

        response = self.client.post(
            reverse("colmado-customer-payments", args=(self.customer.id,)),
            {"store_id": self.store.id, "amount": "100.00"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["customer"]["balance"], "0.00")

    def test_payment_cannot_exceed_balance(self):
        self.create_credit_sale()

        response = self.client.post(
            reverse("colmado-customer-payments", args=(self.customer.id,)),
            {"store_id": self.store.id, "amount": "100.01"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("100.00"))
        self.assertEqual(
            CreditTransaction.objects.filter(
                transaction_type=CreditTransaction.PAYMENT
            ).count(),
            0,
        )

    def test_payment_rejects_store_from_another_organisation(self):
        self.create_credit_sale()

        response = self.client.post(
            reverse("colmado-customer-payments", args=(self.customer.id,)),
            {"store_id": self.other_store.id, "amount": "20.00"},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("100.00"))

    def test_customer_history_contains_charge_and_payment(self):
        self.create_credit_sale()
        self.client.post(
            reverse("colmado-customer-payments", args=(self.customer.id,)),
            {"store_id": self.store.id, "amount": "25.00"},
            format="json",
            **self.headers,
        )

        response = self.client.get(
            reverse("colmado-customer-history", args=(self.customer.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)
        self.assertEqual(response.data[0]["balance_after"], "75.00")

    def test_credit_transaction_list_is_tenant_scoped(self):
        self.create_credit_sale()
        CreditTransaction.objects.create(
            organisation=self.other_organisation,
            customer=self.other_customer,
            store=self.other_store,
            created_by=self.other_owner,
            transaction_type=CreditTransaction.PAYMENT,
            amount=Decimal("10.00"),
            balance_after=Decimal("0.00"),
        )

        response = self.client.get(self.credit_list_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["customer"], self.customer.id)

    def test_void_credit_sale_restores_stock_and_customer_balance(self):
        created = self.create_credit_sale()

        response = self.client.post(
            reverse("colmado-sale-void", args=(created.data["id"],)),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.customer.refresh_from_db()
        self.inventory.refresh_from_db()
        self.assertEqual(self.customer.balance, Decimal("0.00"))
        self.assertEqual(self.inventory.quantity, Decimal("20.000"))
        cancellation = CreditTransaction.objects.filter(
            transaction_type=CreditTransaction.PAYMENT,
            note__startswith="Anulación de venta",
        )
        self.assertEqual(cancellation.count(), 1)

    def test_has_debt_filter_only_returns_customers_who_owe(self):
        Customer.objects.create(
            organisation=self.organisation,
            name="Cliente sin deuda",
        )
        self.create_credit_sale()

        response = self.client.get(
            self.customer_list_url,
            {"has_debt": "true"},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.customer.id)

    def test_overdue_filter_returns_customer_with_past_due_credit_sale(self):
        self.create_credit_sale(
            credit_due_date=str(timezone.localdate() - timedelta(days=1))
        )

        response = self.client.get(
            self.customer_list_url,
            {"overdue": "true"},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.customer.id)
