import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from organisations.models import Membership, Organisation

from colmado.models import (
    Customer,
    CustomerOrder,
    Employee,
    Expense,
    InventoryItem,
    MasterProduct,
    PayrollPayment,
    Sale,
    SaleItem,
    Store,
    Storefront,
)


class DashboardApiTests(APITestCase):
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
            quantity=Decimal("2.000"),
            reorder_level=Decimal("3.000"),
        )
        self.second_inventory = InventoryItem.objects.create(
            organisation=self.organisation,
            store=self.second_store,
            master_product=self.second_product,
            cost_price=Decimal("10.00"),
            sale_price=Decimal("25.00"),
            quantity=Decimal("20.000"),
            reorder_level=Decimal("2.000"),
        )
        self.other_inventory = InventoryItem.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            master_product=self.product,
            cost_price=Decimal("20.00"),
            sale_price=Decimal("60.00"),
            quantity=Decimal("1.000"),
            reorder_level=Decimal("5.000"),
        )
        self.customer = Customer.objects.create(
            organisation=self.organisation,
            name="Ana",
            phone="8095550101",
            balance=Decimal("350.00"),
        )
        self.other_customer = Customer.objects.create(
            organisation=self.other_organisation,
            name="Cliente Ajeno",
            balance=Decimal("900.00"),
        )
        self.employee = Employee.objects.create(
            organisation=self.organisation,
            store=self.store,
            name="Pedro",
            pay_frequency=Employee.WEEKLY,
            pay_amount=Decimal("3000.00"),
        )
        self.storefront = Storefront.objects.create(
            organisation=self.organisation,
            store=self.store,
            slug="colmado-macao",
            display_name="Colmado Macao",
        )
        self.other_storefront = Storefront.objects.create(
            organisation=self.other_organisation,
            store=self.other_store,
            slug="colmado-ajeno",
            display_name="Colmado Ajeno",
        )
        self.today = timezone.localdate()
        self.dashboard_url = reverse("colmado-dashboard-list")
        self.headers = {
            "HTTP_X_ORGANISATION_SLUG": self.organisation.slug,
        }
        self.client.force_authenticate(self.owner)

    def create_sale(
        self,
        *,
        store=None,
        organisation=None,
        inventory_item=None,
        cashier=None,
        selected_date=None,
        total="100.00",
        quantity="2.000",
        unit_cost="30.00",
        payment_method=Sale.CASH,
        sale_status=Sale.COMPLETED,
        product_name="Coca-Cola 12 oz",
    ):
        store = store or self.store
        organisation = organisation or self.organisation
        cashier = cashier or self.owner
        inventory_item = inventory_item or self.inventory
        selected_date = selected_date or self.today
        sale = Sale.objects.create(
            organisation=organisation,
            store=store,
            cashier=cashier,
            payment_method=payment_method,
            subtotal=Decimal(total),
            total=Decimal(total),
            amount_received=(
                Decimal("0.00")
                if payment_method == Sale.CREDIT
                else Decimal(total)
            ),
            status=sale_status,
        )
        Sale.objects.filter(pk=sale.pk).update(
            created_at=timezone.make_aware(
                datetime.combine(selected_date, datetime.min.time())
            )
            + timedelta(hours=12)
        )
        sale.refresh_from_db()
        SaleItem.objects.create(
            sale=sale,
            inventory_item=inventory_item,
            product_name=product_name,
            barcode=inventory_item.master_product.barcode or "",
            unit=inventory_item.master_product.unit,
            quantity=Decimal(quantity),
            unit_price=Decimal(total) / Decimal(quantity),
            unit_cost=Decimal(unit_cost),
            line_total=Decimal(total),
        )
        return sale

    def create_order(self, *, order_status=CustomerOrder.NEW, other=False):
        organisation = self.other_organisation if other else self.organisation
        store = self.other_store if other else self.store
        storefront = self.other_storefront if other else self.storefront
        return CustomerOrder.objects.create(
            organisation=organisation,
            store=store,
            storefront=storefront,
            idempotency_key=str(uuid.uuid4()),
            customer_name="Cliente",
            customer_phone="8095550101",
            delivery_address="Macao",
            status=order_status,
            subtotal=Decimal("100.00"),
            total=Decimal("100.00"),
        )

    def test_dashboard_requires_authentication(self):
        self.client.force_authenticate(user=None)

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_dashboard_requires_organisation(self):
        response = self.client.get(self.dashboard_url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_empty_dashboard_returns_zero_values(self):
        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["date"], str(self.today))
        self.assertEqual(response.data["summary"]["sale_count"], 0)
        self.assertEqual(response.data["summary"]["revenue"], "0.00")
        self.assertEqual(response.data["summary"]["net_profit"], "0.00")

    def test_dashboard_summarizes_completed_sales(self):
        self.create_sale(total="100.00", quantity="2.000", unit_cost="30.00")
        self.create_sale(
            total="50.00",
            quantity="1.000",
            unit_cost="30.00",
            payment_method=Sale.CARD,
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        summary = response.data["summary"]
        self.assertEqual(summary["sale_count"], 2)
        self.assertEqual(summary["revenue"], "150.00")
        self.assertEqual(summary["cost_of_goods"], "90.00")
        self.assertEqual(summary["gross_profit"], "60.00")

    def test_voided_sales_are_excluded(self):
        self.create_sale(sale_status=Sale.VOIDED)

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["summary"]["sale_count"], 0)
        self.assertEqual(response.data["summary"]["revenue"], "0.00")

    def test_dashboard_filters_requested_date(self):
        yesterday = self.today - timedelta(days=1)
        self.create_sale(selected_date=yesterday, total="80.00")
        self.create_sale(selected_date=self.today, total="100.00")

        response = self.client.get(
            self.dashboard_url,
            {"date": str(yesterday)},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["date"], str(yesterday))
        self.assertEqual(response.data["summary"]["revenue"], "80.00")

    def test_invalid_date_is_rejected(self):
        response = self.client.get(
            self.dashboard_url,
            {"date": "25-09-2026"},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("date", response.data)

    def test_dashboard_filters_selected_store(self):
        self.create_sale(total="100.00")
        self.create_sale(
            store=self.second_store,
            inventory_item=self.second_inventory,
            total="50.00",
            quantity="2.000",
            unit_cost="10.00",
            product_name="Agua 16 oz",
        )

        response = self.client.get(
            self.dashboard_url,
            {"store": self.second_store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["store"]["id"], self.second_store.id)
        self.assertEqual(response.data["summary"]["revenue"], "50.00")
        self.assertEqual(response.data["stores"], [])

    def test_cannot_select_store_from_another_organisation(self):
        response = self.client.get(
            self.dashboard_url,
            {"store": self.other_store.id},
            **self.headers,
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("store", response.data)

    def test_profit_subtracts_daily_expenses_and_payroll(self):
        self.create_sale(total="100.00", quantity="2.000", unit_cost="30.00")
        Expense.objects.create(
            organisation=self.organisation,
            store=self.store,
            created_by=self.owner,
            category=Expense.OTHER,
            description="Hielo",
            amount=Decimal("10.00"),
            expense_date=self.today,
        )
        PayrollPayment.objects.create(
            organisation=self.organisation,
            store=self.store,
            employee=self.employee,
            created_by=self.owner,
            amount=Decimal("20.00"),
            period_start=self.today,
            period_end=self.today,
            paid_on=self.today,
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        summary = response.data["summary"]
        self.assertEqual(summary["gross_profit"], "40.00")
        self.assertEqual(summary["operating_expenses"], "10.00")
        self.assertEqual(summary["payroll"], "20.00")
        self.assertEqual(summary["net_profit"], "10.00")
        self.assertTrue(summary["is_profitable"])

    def test_dashboard_marks_negative_profit(self):
        Expense.objects.create(
            organisation=self.organisation,
            store=self.store,
            created_by=self.owner,
            category=Expense.OTHER,
            description="Reparación",
            amount=Decimal("100.00"),
            expense_date=self.today,
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["summary"]["net_profit"], "-100.00")
        self.assertFalse(response.data["summary"]["is_profitable"])

    def test_payment_breakdown_is_returned(self):
        self.create_sale(total="100.00", payment_method=Sale.CASH)
        self.create_sale(total="50.00", payment_method=Sale.CARD)
        self.create_sale(total="25.00", payment_method=Sale.CREDIT)

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["payments"][Sale.CASH]["amount"], "100.00")
        self.assertEqual(response.data["payments"][Sale.CARD]["amount"], "50.00")
        self.assertEqual(response.data["payments"][Sale.CREDIT]["amount"], "25.00")
        self.assertEqual(response.data["payments"][Sale.TRANSFER]["amount"], "0.00")

    def test_outstanding_credit_is_tenant_scoped(self):
        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(
            response.data["summary"]["outstanding_credit"],
            "350.00",
        )

    def test_low_stock_list_is_tenant_scoped(self):
        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["summary"]["low_stock_count"], 1)
        self.assertEqual(len(response.data["low_stock"]), 1)
        self.assertEqual(
            response.data["low_stock"][0]["inventory_item_id"],
            self.inventory.id,
        )

    def test_selected_store_scopes_low_stock(self):
        response = self.client.get(
            self.dashboard_url,
            {"store": self.second_store.id},
            **self.headers,
        )

        self.assertEqual(response.data["summary"]["low_stock_count"], 0)
        self.assertEqual(response.data["low_stock"], [])

    def test_dashboard_counts_new_and_active_orders(self):
        self.create_order(order_status=CustomerOrder.NEW)
        self.create_order(order_status=CustomerOrder.PREPARING)
        self.create_order(order_status=CustomerOrder.DELIVERED)
        self.create_order(order_status=CustomerOrder.NEW, other=True)

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["summary"]["new_orders"], 1)
        self.assertEqual(response.data["summary"]["active_orders"], 2)
        self.assertEqual(len(response.data["orders"]), 2)

    def test_dashboard_returns_top_products(self):
        self.create_sale(
            total="150.00",
            quantity="3.000",
            product_name="Coca-Cola 12 oz",
        )
        self.create_sale(
            store=self.second_store,
            inventory_item=self.second_inventory,
            total="50.00",
            quantity="2.000",
            unit_cost="10.00",
            product_name="Agua 16 oz",
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["top_products"][0]["product_name"], "Coca-Cola 12 oz")
        self.assertEqual(response.data["top_products"][0]["quantity_sold"], "3.000")

    def test_general_dashboard_compares_active_stores(self):
        self.create_sale(total="100.00")
        self.create_sale(
            store=self.second_store,
            inventory_item=self.second_inventory,
            total="50.00",
            quantity="2.000",
            unit_cost="10.00",
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(len(response.data["stores"]), 2)
        stores_by_name = {
            item["store_name"]: item for item in response.data["stores"]
        }
        self.assertEqual(stores_by_name["Macao"]["revenue"], "100.00")
        self.assertEqual(stores_by_name["Bávaro"]["revenue"], "50.00")

    def test_dashboard_compares_revenue_with_previous_day(self):
        self.create_sale(selected_date=self.today, total="150.00")
        self.create_sale(
            selected_date=self.today - timedelta(days=1),
            total="100.00",
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        comparison = response.data["comparison"]
        self.assertEqual(comparison["previous_revenue"], "100.00")
        self.assertEqual(comparison["change_amount"], "50.00")
        self.assertEqual(comparison["change_percent"], "50.00")

    def test_change_percent_is_null_when_previous_day_has_no_sales(self):
        self.create_sale(total="100.00")

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["comparison"]["previous_revenue"], "0.00")
        self.assertIsNone(response.data["comparison"]["change_percent"])

    def test_other_organisation_sales_are_not_included(self):
        self.create_sale(total="100.00")
        self.create_sale(
            organisation=self.other_organisation,
            store=self.other_store,
            inventory_item=self.other_inventory,
            cashier=self.other_owner,
            total="900.00",
            quantity="1.000",
            unit_cost="20.00",
        )

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.data["summary"]["revenue"], "100.00")

    def test_inactive_membership_is_rejected(self):
        self.membership.is_active = False
        self.membership.save(update_fields=("is_active",))

        response = self.client.get(self.dashboard_url, **self.headers)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
