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

router.register("categories", CategoryViewSet)
router.register("products", ProductViewSet)
router.register("stock-movements", StockMovementViewSet)
router.register("sales", SaleViewSet)
router.register("sale-items", SaleItemViewSet)
router.register("expenses", ExpenseViewSet)

urlpatterns = router.urls