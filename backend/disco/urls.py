from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ProductViewSet,
    StockMovementViewSet,
    SaleViewSet,
    ExpenseViewSet,
    DiscoEmployeeViewSet,
    DiscoTableViewSet,
    CashShiftViewSet,
    DiscoReservationViewSet,
    DiscoActivityLogViewSet,
    DiscoDashboardViewSet,
    DiscoSettingsViewSet,
)
from .dev_seed import seed_disco_demo

router = DefaultRouter()

router.register(r"dashboard", DiscoDashboardViewSet, basename="disco-dashboard")
router.register(r"categories", CategoryViewSet, basename="disco-categories")
router.register(r"products", ProductViewSet, basename="disco-products")
router.register(r"stock-movements", StockMovementViewSet, basename="disco-stock-movements")
router.register(r"sales", SaleViewSet, basename="disco-sales")
router.register(r"expenses", ExpenseViewSet, basename="disco-expenses")
router.register(r"employees", DiscoEmployeeViewSet, basename="disco-employees")
router.register(r"tables", DiscoTableViewSet, basename="disco-tables")
router.register(r"cash-shifts", CashShiftViewSet, basename="disco-cash-shifts")
router.register(r"reservations", DiscoReservationViewSet, basename="disco-reservations")
router.register(r"activity-logs", DiscoActivityLogViewSet, basename="disco-activity-logs")
router.register(r"settings", DiscoSettingsViewSet, basename="disco-settings")

urlpatterns = [
    path("dev/seed-demo/", seed_disco_demo, name="seed-disco-demo"),
    path("", include(router.urls)),
]