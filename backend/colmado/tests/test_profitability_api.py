from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    Customer,
    Employee,
    Expense,
    InventoryItem,
    MasterProduct,
    PayrollPayment,
    Sale,
    SaleItem,
    Store,
)


class ProfitabilityApiTests(APITestCase):
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
        self.employee = Employee.objects.create(
            organisation=self.organisation,
            store=self.store,
            name="Pedro",
            position="Dependiente",
            pay_frequency=Employee.WEEKLY,
            pay_amount=Decimal("3000.00"),
        )
        self.other_employee = Employee.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            name="Empleado Ajeno",
            pay_frequency=Employee.MONTHLY,
            pay_amount=Decimal("10000.00"),
        )
        self.employee_url = reverse("colmado-employee-list")
        self.payroll_url = reverse("colmado-payroll-payment-list")
        self.expense_url = reverse("colmado-expense-list")
        self.profitability_url = reverse("colmado-profitability-list")
        self.client.force_authenticate(self.owner)
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }

    def create_completed_sale(
        self,
        *,
        store=None,
        organisation=None,
        cashier=None,
        total="100.00",
        quantity="2.000",
        unit_cost="30.00",
        status_value=Sale.COMPLETED,
        payment_method=Sale.CASH,
        customer=None,
    ):
        store = store or self.store
        organisation = organisation or self.organisation
        cashier = cashier or self.owner
        sale = Sale.objects.create(
            organisation=organisation,
            store=store,
            cashier=cashier,
            customer=customer,
            payment_method=payment_method,
            subtotal=Decimal(total),
            total=Decimal(total),
            amount_received=(
                Decimal("0.00")
                if payment_method == Sale.CREDIT
                else Decimal(total)
            ),
            status=status_value,
        )
        inventory_item = self.inventory
        if organisation != self.organisation or store != self.store:
            inventory_item, _ = InventoryItem.objects.get_or_create(
                organisation=organisation,
                store=store,
                master_product=self.product,
                defaults={
                    "cost_price": Decimal(unit_cost),
                    "sale_price": Decimal("50.00"),
                    "quantity": Decimal("10.000"),
                },
            )
        SaleItem.objects.create(
            sale=sale,
            inventory_item=inventory_item,
            product_name="Coca-Cola 12 oz",
            barcode=self.product.barcode,
            unit=MasterProduct.UNIT,
            quantity=Decimal(quantity),
            unit_price=Decimal("50.00"),
            unit_cost=Decimal(unit_cost),
            line_total=Decimal(total),
        )
        return sale

    def test_profitability_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_creates_employee_for_current_organisation(self):
        response = self.client.post(
            self.employee_url,
            {
                "store": self.store.id,
                "name": "María",
                "position": "Cajera",
                "pay_frequency": Employee.MONTHLY,
                "pay_amount": "15000.00",
                "start_date": str(timezone.localdate()),
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        employee = Employee.objects.get(pk=response.data["id"])
        self.assertEqual(employee.organisation, self.organisation)

    def test_rejects_employee_for_other_organisation_store(self):
        response = self.client.post(
            self.employee_url,
            {
                "store": self.other_store.id,
                "name": "Intruso",
                "pay_frequency": Employee.MONTHLY,
                "pay_amount": "10000.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_list_is_tenant_scoped(self):
        response = self.client.get(self.employee_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["id"], self.employee.id)

    def test_employee_can_be_deactivated_but_not_deleted(self):
        detail_url = reverse("colmado-employee-detail", args=(self.employee.id,))
        patch_response = self.client.patch(
            detail_url,
            {"is_active": False},
            format="json",
            **self.headers,
        )
        delete_response = self.client.delete(detail_url, **self.headers)

        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(delete_response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_creates_payroll_payment_and_records_creator(self):
        today = timezone.localdate()
        response = self.client.post(
            self.payroll_url,
            {
                "store": self.store.id,
                "employee": self.employee.id,
                "amount": "3000.00",
                "period_start": str(today - timedelta(days=6)),
                "period_end": str(today),
                "paid_on": str(today),
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = PayrollPayment.objects.get(pk=response.data["id"])
        self.assertEqual(payment.organisation, self.organisation)
        self.assertEqual(payment.created_by, self.owner)

    def test_rejects_payroll_for_employee_from_another_organisation(self):
        today = timezone.localdate()
        response = self.client.post(
            self.payroll_url,
            {
                "store": self.store.id,
                "employee": self.other_employee.id,
                "amount": "1000.00",
                "period_start": str(today),
                "period_end": str(today),
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_rejects_payroll_with_reversed_period(self):
        today = timezone.localdate()
        response = self.client.post(
            self.payroll_url,
            {
                "store": self.store.id,
                "employee": self.employee.id,
                "amount": "1000.00",
                "period_start": str(today),
                "period_end": str(today - timedelta(days=1)),
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("period_end", response.data)

    def test_payroll_list_is_tenant_scoped(self):
        today = timezone.localdate()
        PayrollPayment.objects.create(
            organisation=self.organisation,
            store=self.store,
            employee=self.employee,
            created_by=self.owner,
            amount=Decimal("1000.00"),
            period_start=today,
            period_end=today,
        )
        PayrollPayment.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            employee=self.other_employee,
            created_by=self.other_owner,
            amount=Decimal("2000.00"),
            period_start=today,
            period_end=today,
        )

        response = self.client.get(self.payroll_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["amount"], "1000.00")

    def test_creates_expense_and_records_creator(self):
        response = self.client.post(
            self.expense_url,
            {
                "store": self.store.id,
                "category": Expense.ELECTRICITY,
                "description": "Factura de luz",
                "amount": "2500.00",
                "expense_date": str(timezone.localdate()),
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        expense = Expense.objects.get(pk=response.data["id"])
        self.assertEqual(expense.organisation, self.organisation)
        self.assertEqual(expense.created_by, self.owner)

    def test_rejects_expense_for_other_organisation_store(self):
        response = self.client.post(
            self.expense_url,
            {
                "store": self.other_store.id,
                "category": Expense.OTHER,
                "description": "Gasto ajeno",
                "amount": "50.00",
            },
            format="json",
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expense_list_is_tenant_scoped(self):
        Expense.objects.create(
            organisation=self.organisation,
            store=self.store,
            created_by=self.owner,
            category=Expense.WATER,
            description="Agua",
            amount=Decimal("100.00"),
        )
        Expense.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            created_by=self.other_owner,
            category=Expense.WATER,
            description="Agua ajena",
            amount=Decimal("900.00"),
        )

        response = self.client.get(self.expense_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["amount"], "100.00")

    def test_profitability_calculates_exact_net_profit(self):
        today = timezone.localdate()
        self.create_completed_sale()
        Expense.objects.create(
            organisation=self.organisation,
            store=self.store,
            created_by=self.owner,
            description="Agua",
            amount=Decimal("10.00"),
            expense_date=today,
        )
        PayrollPayment.objects.create(
            organisation=self.organisation,
            store=self.store,
            employee=self.employee,
            created_by=self.owner,
            amount=Decimal("20.00"),
            period_start=today,
            period_end=today,
            paid_on=today,
        )

        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["summary"]
        self.assertEqual(summary["revenue"], "100.00")
        self.assertEqual(summary["cost_of_goods"], "60.00")
        self.assertEqual(summary["gross_profit"], "40.00")
        self.assertEqual(summary["operating_expenses"], "10.00")
        self.assertEqual(summary["payroll"], "20.00")
        self.assertEqual(summary["net_profit"], "10.00")
        self.assertTrue(summary["is_profitable"])

    def test_profitability_excludes_voided_sales(self):
        self.create_completed_sale(status_value=Sale.VOIDED)

        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.data["summary"]["sale_count"], 0)
        self.assertEqual(response.data["summary"]["revenue"], "0.00")

    def test_profitability_excludes_other_organisation_data(self):
        self.create_completed_sale(
            store=self.other_store,
            organisation=self.other_organisation,
            cashier=self.other_owner,
            total="900.00",
        )
        Expense.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            created_by=self.other_owner,
            description="Gasto ajeno",
            amount=Decimal("800.00"),
        )

        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.data["summary"]["revenue"], "0.00")
        self.assertEqual(response.data["summary"]["operating_expenses"], "0.00")

    def test_profitability_filters_one_store(self):
        self.create_completed_sale()
        self.create_completed_sale(store=self.second_store, total="200.00")

        response = self.client.get(
            self.profitability_url,
            {"store": self.store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["store"]["id"], self.store.id)
        self.assertEqual(response.data["summary"]["revenue"], "100.00")

    def test_profitability_rejects_store_from_other_organisation(self):
        response = self.client.get(
            self.profitability_url,
            {"store": self.other_store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_profitability_rejects_reversed_date_range(self):
        today = timezone.localdate()
        response = self.client.get(
            self.profitability_url,
            {
                "date_from": str(today),
                "date_to": str(today - timedelta(days=1)),
            },
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date_to", response.data)

    def test_profitability_reports_credit_and_outstanding_balance(self):
        customer = Customer.objects.create(
            organisation=self.organisation,
            name="Cliente fiado",
            balance=Decimal("100.00"),
        )
        self.create_completed_sale(
            payment_method=Sale.CREDIT,
            customer=customer,
        )

        response = self.client.get(self.profitability_url, **self.headers)

        summary = response.data["summary"]
        self.assertEqual(summary["credit_sales"], "100.00")
        self.assertEqual(summary["non_credit_collected"], "0.00")
        self.assertEqual(summary["outstanding_credit"], "100.00")

    def test_profitability_counts_low_stock(self):
        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["summary"]["low_stock_count"], 1)

    def test_profitability_returns_top_products(self):
        self.create_completed_sale()

        response = self.client.get(self.profitability_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data["top_products"]), 1)
        self.assertEqual(
            response.data["top_products"][0]["product_name"],
            "Coca-Cola 12 oz",
        )
        self.assertEqual(
            response.data["top_products"][0]["quantity_sold"],
            "2.000",
        )

    def test_profitability_defaults_to_current_month(self):
        response = self.client.get(self.profitability_url, **self.headers)
        today = timezone.localdate()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["period"]["date_from"],
            str(today.replace(day=1)),
        )
        self.assertEqual(response.data["period"]["date_to"], str(today))
