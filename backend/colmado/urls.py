from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CreditTransactionViewSet,
    CustomerViewSet,
    EmployeeViewSet,
    ExpenseViewSet,
    InventoryItemViewSet,
    InventoryMovementViewSet,
    MasterProductViewSet,
    PayrollPaymentViewSet,
    ProfitabilityViewSet,
    PurchaseOrderViewSet,
    ReorderSuggestionViewSet,
    SaleViewSet,
    StoreViewSet,
    SupplierProductViewSet,
    SupplierViewSet,
)


router = DefaultRouter()
router.register("stores", StoreViewSet, basename="colmado-store")
router.register("catalog", MasterProductViewSet, basename="colmado-catalog")
router.register("inventory", InventoryItemViewSet, basename="colmado-inventory")
router.register("sales", SaleViewSet, basename="colmado-sale")
router.register("customers", CustomerViewSet, basename="colmado-customer")
router.register(
    "credit-transactions",
    CreditTransactionViewSet,
    basename="colmado-credit-transaction",
)
router.register("employees", EmployeeViewSet, basename="colmado-employee")
router.register(
    "payroll-payments",
    PayrollPaymentViewSet,
    basename="colmado-payroll-payment",
)
router.register("expenses", ExpenseViewSet, basename="colmado-expense")
router.register(
    "profitability",
    ProfitabilityViewSet,
    basename="colmado-profitability",
)
router.register("suppliers", SupplierViewSet, basename="colmado-supplier")
router.register(
    "supplier-products",
    SupplierProductViewSet,
    basename="colmado-supplier-product",
)
router.register(
    "purchase-orders",
    PurchaseOrderViewSet,
    basename="colmado-purchase-order",
)
router.register(
    "inventory-movements",
    InventoryMovementViewSet,
    basename="colmado-inventory-movement",
)
router.register(
    "reorder-suggestions",
    ReorderSuggestionViewSet,
    basename="colmado-reorder-suggestion",
)

urlpatterns = [
    path("", include(router.urls)),
]
