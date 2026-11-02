from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    Employee,
    Expense,
    InventoryItem,
    MasterProduct,
    Store,
)


User = get_user_model()


class EmployeeRolePermissionsApiTests(APITestCase):
    """Role and assigned-store security contract for Mi Colmado."""

    def setUp(self):
        self.organisation = Organisation.objects.create(
            name="Colmados Gerson",
            slug="colmados-gerson",
            business_type="colmado",
            is_active=True,
        )
        self.store = Store.objects.create(
            organisation=self.organisation,
            name="Macao",
        )
        self.other_store = Store.objects.create(
            organisation=self.organisation,
            name="Verón",
        )
        self.product = MasterProduct.objects.create(
            barcode="7460111102186",
            name="Leche Rica",
            presentation="1 litro",
        )
        self.other_product = MasterProduct.objects.create(
            barcode="7460123456789",
            name="Café Santo Domingo",
            presentation="1 libra",
        )
        self.new_product = MasterProduct.objects.create(
            barcode="7460123456796",
            name="Agua mineral",
            presentation="16 oz",
        )
        self.inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.store,
            master_product=self.product,
            cost_price="50.00",
            sale_price="65.00",
            quantity="12.000",
            reorder_level="3.000",
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.other_store,
            master_product=self.other_product,
            cost_price="200.00",
            sale_price="250.00",
            quantity="8.000",
            reorder_level="2.000",
        )

        self.manager = self.create_employee_account(
            role="manager",
            label="manager",
            position="Encargado",
        )
        self.cashier = self.create_employee_account(
            role="cashier",
            label="cashier",
            position="Cajero",
        )
        self.inventory_manager = self.create_employee_account(
            role="inventory_manager",
            label="inventory",
            position="Inventario",
        )
        self.accountant = self.create_employee_account(
            role="accountant",
            label="accountant",
            position="Contabilidad",
        )
        self.staff = self.create_employee_account(
            role="staff",
            label="staff",
            position="Ayudante",
        )

        self.admin = User.objects.create_user(
            email="admin@example.com",
            username="admin",
            password="safe-admin-password",
        )
        Membership.objects.create(
            user=self.admin,
            organisation=self.organisation,
            role="admin",
            is_active=True,
        )

        self.unlinked_cashier = User.objects.create_user(
            email="unlinked@example.com",
            username="unlinked",
            password="safe-unlinked-password",
        )
        Membership.objects.create(
            user=self.unlinked_cashier,
            organisation=self.organisation,
            role="cashier",
            is_active=True,
        )

        self.inactive_employee_user = self.create_employee_account(
            role="cashier",
            label="inactive",
            position="Cajero",
            is_active=False,
        )

        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def create_employee_account(
        self,
        *,
        role,
        label,
        position,
        store=None,
        is_active=True,
    ):
        user = User.objects.create_user(
            email=f"{label}@example.com",
            username=label,
            password=f"safe-{label}-password",
        )
        Membership.objects.create(
            user=user,
            organisation=self.organisation,
            role=role,
            is_active=True,
        )
        Employee.objects.create(
            organisation=self.organisation,
            store=store or self.store,
            user=user,
            name=label.title(),
            position=position,
            pay_frequency=Employee.MONTHLY,
            pay_amount="25000.00",
            is_active=is_active,
        )
        return user

    def authenticate(self, user):
        self.client.force_authenticate(user)

    def get(self, route_name, **query):
        return self.client.get(
            reverse(route_name),
            query or None,
            **self.headers,
        )

    def initial_inventory_payload(self, store):
        return {
            "store_id": store.id,
            "barcode": self.new_product.barcode,
            "quantity": "10.000",
            "cost_price": "15.00",
            "sale_price": "25.00",
            "reorder_level": "3.000",
            "is_quick_sale": True,
        }

    def test_admin_keeps_access_to_every_store_without_employee_record(self):
        self.authenticate(self.admin)

        response = self.get("colmado-store-list")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            {row["id"] for row in response.data},
            {self.store.id, self.other_store.id},
        )

    def test_operational_member_requires_a_linked_employee(self):
        self.authenticate(self.unlinked_cashier)

        response = self.get("colmado-store-list")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_inactive_employee_is_rejected(self):
        self.authenticate(self.inactive_employee_user)

        response = self.get("colmado-store-list")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unsupported_colmado_role_is_rejected(self):
        self.authenticate(self.staff)

        response = self.get("colmado-store-list")

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_only_sees_the_assigned_store(self):
        self.authenticate(self.cashier)

        response = self.get("colmado-store-list")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["id"] for row in response.data],
            [self.store.id],
        )

    def test_cashier_cannot_retrieve_another_store(self):
        self.authenticate(self.cashier)

        response = self.client.get(
            reverse("colmado-store-detail", args=(self.other_store.id,)),
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cashier_only_sees_inventory_from_the_assigned_store(self):
        self.authenticate(self.cashier)

        response = self.get("colmado-inventory-list")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [row["id"] for row in response.data],
            [self.inventory.id],
        )

    def test_employee_cannot_spoof_another_store_in_the_query(self):
        self.authenticate(self.cashier)

        response = self.get(
            "colmado-inventory-list",
            store=self.other_store.id,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cashier_can_read_daily_operational_resources(self):
        self.authenticate(self.cashier)

        allowed_routes = (
            "colmado-store-list",
            "colmado-dashboard-list",
            "colmado-catalog-list",
            "colmado-inventory-list",
            "colmado-sale-list",
            "colmado-cash-register-list",
            "colmado-customer-list",
            "colmado-credit-transaction-list",
            "colmado-customer-order-list",
        )

        for route_name in allowed_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_cashier_cannot_open_finance_inventory_or_employee_management(self):
        self.authenticate(self.cashier)

        forbidden_routes = (
            "colmado-expense-list",
            "colmado-payroll-payment-list",
            "colmado-employee-list",
            "colmado-profitability-list",
            "colmado-supplier-list",
            "colmado-purchase-order-list",
            "colmado-inventory-count-list",
        )

        for route_name in forbidden_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_cashier_cannot_change_inventory_or_void_sales(self):
        self.authenticate(self.cashier)

        inventory_response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_inventory_payload(self.store),
            format="json",
            **self.headers,
        )
        void_response = self.client.post(
            reverse("colmado-sale-void", args=(999999,)),
            {},
            format="json",
            **self.headers,
        )

        self.assertEqual(
            inventory_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            void_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_inventory_manager_can_use_inventory_and_purchasing_resources(self):
        self.authenticate(self.inventory_manager)

        allowed_routes = (
            "colmado-store-list",
            "colmado-dashboard-list",
            "colmado-catalog-list",
            "colmado-inventory-list",
            "colmado-supplier-list",
            "colmado-supplier-product-list",
            "colmado-purchase-order-list",
            "colmado-inventory-movement-list",
            "colmado-inventory-count-list",
            "colmado-reorder-suggestion-list",
        )

        for route_name in allowed_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_inventory_manager_cannot_open_sales_customer_or_finance_resources(self):
        self.authenticate(self.inventory_manager)

        forbidden_routes = (
            "colmado-sale-list",
            "colmado-cash-register-list",
            "colmado-customer-list",
            "colmado-credit-transaction-list",
            "colmado-customer-order-list",
            "colmado-expense-list",
            "colmado-payroll-payment-list",
            "colmado-employee-list",
            "colmado-profitability-list",
        )

        for route_name in forbidden_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(
                    response.status_code,
                    status.HTTP_403_FORBIDDEN,
                )

    def test_inventory_manager_can_add_inventory_to_assigned_store(self):
        self.authenticate(self.inventory_manager)

        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_inventory_payload(self.store),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            InventoryItem.objects.filter(
                organisation=self.organisation,
                store=self.store,
                master_product=self.new_product,
            ).exists()
        )

    def test_inventory_manager_cannot_add_inventory_to_another_store(self):
        self.authenticate(self.inventory_manager)

        response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_inventory_payload(self.other_store),
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            InventoryItem.objects.filter(
                organisation=self.organisation,
                store=self.other_store,
                master_product=self.new_product,
            ).exists()
        )

    def test_accountant_can_read_finance_and_audit_resources(self):
        self.authenticate(self.accountant)

        allowed_routes = (
            "colmado-store-list",
            "colmado-dashboard-list",
            "colmado-inventory-list",
            "colmado-sale-list",
            "colmado-customer-list",
            "colmado-credit-transaction-list",
            "colmado-employee-list",
            "colmado-payroll-payment-list",
            "colmado-expense-list",
            "colmado-profitability-list",
        )

        for route_name in allowed_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_accountant_can_create_expense_for_assigned_store(self):
        self.authenticate(self.accountant)

        response = self.client.post(
            reverse("colmado-expense-list"),
            {
                "store": self.store.id,
                "category": "electricity",
                "description": "Factura eléctrica",
                "amount": "3500.00",
                "expense_date": "2026-11-02",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expense = Expense.objects.get(id=response.data["id"])
        self.assertEqual(expense.store, self.store)
        self.assertEqual(expense.created_by, self.accountant)

    def test_accountant_cannot_create_expense_for_another_store(self):
        self.authenticate(self.accountant)

        response = self.client.post(
            reverse("colmado-expense-list"),
            {
                "store": self.other_store.id,
                "category": "electricity",
                "description": "Factura ajena",
                "amount": "3500.00",
                "expense_date": "2026-11-02",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(
            Expense.objects.filter(description="Factura ajena").exists()
        )

    def test_accountant_cannot_change_inventory_or_manage_suppliers(self):
        self.authenticate(self.accountant)

        inventory_response = self.client.post(
            reverse("colmado-inventory-initial-scan"),
            self.initial_inventory_payload(self.store),
            format="json",
            **self.headers,
        )
        supplier_response = self.get("colmado-supplier-list")

        self.assertEqual(
            inventory_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )
        self.assertEqual(
            supplier_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_manager_can_access_branch_operations_but_not_create_store(self):
        self.authenticate(self.manager)

        allowed_routes = (
            "colmado-dashboard-list",
            "colmado-inventory-list",
            "colmado-sale-list",
            "colmado-cash-register-list",
            "colmado-customer-list",
            "colmado-credit-transaction-list",
            "colmado-employee-list",
            "colmado-payroll-payment-list",
            "colmado-expense-list",
            "colmado-profitability-list",
            "colmado-supplier-list",
            "colmado-purchase-order-list",
            "colmado-inventory-count-list",
            "colmado-storefront-list",
            "colmado-customer-order-list",
        )

        for route_name in allowed_routes:
            with self.subTest(route_name=route_name):
                response = self.get(route_name)
                self.assertEqual(response.status_code, status.HTTP_200_OK)

        create_store_response = self.client.post(
            reverse("colmado-store-list"),
            {"name": "Sucursal no autorizada"},
            format="json",
            **self.headers,
        )
        self.assertEqual(
            create_store_response.status_code,
            status.HTTP_403_FORBIDDEN,
        )

    def test_manager_is_allowed_to_reach_sale_void_action(self):
        self.authenticate(self.manager)

        response = self.client.post(
            reverse("colmado-sale-void", args=(999999,)),
            {},
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
