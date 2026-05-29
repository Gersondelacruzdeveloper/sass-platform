from rest_framework.routers import DefaultRouter

from .views import (
    CategoryViewSet,
    ProductViewSet,
    StockMovementViewSet,
    SaleViewSet,
    SaleItemViewSet,
    ExpenseViewSet,
)

router = DefaultRouter()

router.register(r"categories", CategoryViewSet)
router.register(r"products", ProductViewSet)
router.register(r"stock-movements", StockMovementViewSet)
router.register(r"sales", SaleViewSet)
router.register(
    r"sale-items",
    SaleItemViewSet,
    basename="sale-items"
)
router.register(r"expenses", ExpenseViewSet)

urlpatterns = router.urls