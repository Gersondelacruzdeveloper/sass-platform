from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    CashRegisterSessionViewSet,
    CatalogImportViewSet,
    CreditTransactionViewSet,
    CustomerOrderViewSet,
    CustomerViewSet,
    DashboardViewSet,
    EmployeeViewSet,
    ExpenseViewSet,
    InventoryItemViewSet,
    InventoryCountViewSet,
    InventoryMovementViewSet,
    MasterProductViewSet,
    PayrollPaymentViewSet,
    PlatformMasterProductViewSet,
    ProfitabilityViewSet,
    PublicCustomerOrderCreateAPIView,
    PublicCustomerOrderTrackingAPIView,
    PublicStorefrontCatalogAPIView,
    PublicStorefrontDetailAPIView,
    PurchaseOrderViewSet,
    ReorderSuggestionViewSet,
    SaleViewSet,
    StorefrontViewSet,
    StoreViewSet,
    SupplierProductViewSet,
    SupplierViewSet,
)


router = DefaultRouter()
router.register("stores", StoreViewSet, basename="colmado-store")
router.register(
    "cash-registers",
    CashRegisterSessionViewSet,
    basename="colmado-cash-register",
)
router.register("dashboard", DashboardViewSet, basename="colmado-dashboard")
router.register("catalog", MasterProductViewSet, basename="colmado-catalog")
router.register(
    "platform-catalog",
    PlatformMasterProductViewSet,
    basename="colmado-platform-catalog",
)
router.register(
    "catalog-imports",
    CatalogImportViewSet,
    basename="colmado-catalog-import",
)
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
    "inventory-counts",
    InventoryCountViewSet,
    basename="colmado-inventory-count",
)
router.register(
    "reorder-suggestions",
    ReorderSuggestionViewSet,
    basename="colmado-reorder-suggestion",
)
router.register(
    "storefronts",
    StorefrontViewSet,
    basename="colmado-storefront",
)
router.register(
    "customer-orders",
    CustomerOrderViewSet,
    basename="colmado-customer-order",
)

urlpatterns = [
    path(
        "public/storefronts/<slug:slug>/",
        PublicStorefrontDetailAPIView.as_view(),
        name="colmado-public-storefront-detail",
    ),
    path(
        "public/storefronts/<slug:slug>/catalog/",
        PublicStorefrontCatalogAPIView.as_view(),
        name="colmado-public-storefront-catalog",
    ),
    path(
        "public/storefronts/<slug:slug>/orders/",
        PublicCustomerOrderCreateAPIView.as_view(),
        name="colmado-public-order-create",
    ),
    path(
        "public/storefronts/<slug:slug>/orders/<uuid:order_number>/",
        PublicCustomerOrderTrackingAPIView.as_view(),
        name="colmado-public-order-track",
    ),
    path("", include(router.urls)),
]
