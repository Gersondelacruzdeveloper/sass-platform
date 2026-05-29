from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated

from .models import (
    Category,
    Product,
    StockMovement,
    Sale,
    SaleItem,
    Expense,
)

from .serializers import (
    CategorySerializer,
    ProductSerializer,
    StockMovementSerializer,
    SaleSerializer,
    SaleItemSerializer,
    ExpenseSerializer,
)


class BaseOrganisationViewSet(viewsets.ModelViewSet):

    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return self.queryset.filter(
            organisation=self.request.user.organisation
        )

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.request.user.organisation
        )


class CategoryViewSet(BaseOrganisationViewSet):

    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(BaseOrganisationViewSet):

    queryset = Product.objects.all()
    serializer_class = ProductSerializer


class StockMovementViewSet(BaseOrganisationViewSet):

    queryset = StockMovement.objects.all()
    serializer_class = StockMovementSerializer


class SaleViewSet(BaseOrganisationViewSet):

    queryset = Sale.objects.all()
    serializer_class = SaleSerializer

    def perform_create(self, serializer):
        serializer.save()


class ExpenseViewSet(BaseOrganisationViewSet):

    queryset = Expense.objects.all()
    serializer_class = ExpenseSerializer


class SaleItemViewSet(viewsets.ReadOnlyModelViewSet):

    permission_classes = [IsAuthenticated]

    serializer_class = SaleItemSerializer

    def get_queryset(self):
        return SaleItem.objects.filter(
            sale__organisation=self.request.user.organisation
        )