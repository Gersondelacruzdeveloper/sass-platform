
from django.db import models
from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response


from .models import (
    Category,
    Product,
    StockMovement,
    Sale,
    Expense,
    DiscoEmployee,
    DiscoTable,
    CashShift,
    DiscoReservation,
    DiscoActivityLog,
)

from .serializers import (
    CategorySerializer,
    ProductSerializer,
    StockMovementSerializer,
    SaleSerializer,
    SaleReadSerializer,
    ExpenseSerializer,
    DiscoEmployeeSerializer,
    DiscoTableSerializer,
    CashShiftSerializer,
    DiscoReservationSerializer,
    DiscoActivityLogSerializer,
)


class OrganisationQuerysetMixin:
    permission_classes = [permissions.IsAuthenticated]

    def get_organisation(self):
        if hasattr(self.request, "organisation"):
            return self.request.organisation

        if hasattr(self.request.user, "organisation"):
            return self.request.user.organisation

        membership = self.request.user.memberships.filter(is_active=True).first()
        if membership:
            return membership.organisation

        return None

    def get_queryset(self):
        organisation = self.get_organisation()
        return self.queryset.filter(organisation=organisation)

    def perform_create(self, serializer):
        serializer.save(organisation=self.get_organisation())


class CategoryViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        organisation = self.get_organisation()
        products = Product.objects.filter(
            organisation=organisation,
            stock__lte=models.F("minimum_stock"),
            is_active=True,
        )
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)


class StockMovementViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = StockMovement.objects.select_related(
        "product",
        "created_by",
    ).all()
    serializer_class = StockMovementSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            created_by=self.request.user,
        )


class ExpenseViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("created_by").all()
    serializer_class = ExpenseSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            created_by=self.request.user,
        )


class DiscoEmployeeViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = DiscoEmployee.objects.select_related("user", "organisation").all()
    serializer_class = DiscoEmployeeSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation()
        )


class DiscoTableViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = DiscoTable.objects.all()
    serializer_class = DiscoTableSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation()
        )


class CashShiftViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = CashShift.objects.select_related(
        "opened_by",
        "closed_by",
    ).all()
    serializer_class = CashShiftSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            opened_by=self.request.user,
        )

    @action(detail=True, methods=["post"])
    def close(self, request, pk=None):
        cash_shift = self.get_object()
        closing_cash = request.data.get("closing_cash", 0)

        cash_shift.closing_cash = closing_cash
        cash_shift.closed_by = request.user
        cash_shift.closed_at = timezone.now()
        cash_shift.is_open = False
        cash_shift.save()

        serializer = self.get_serializer(cash_shift)
        return Response(serializer.data)


class SaleViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Sale.objects.select_related(
        "table",
        "cash_shift",
        "waiter",
        "bartender",
        "created_by",
    ).prefetch_related("items__product").all()

    def get_serializer_class(self):
        if self.action in ["list", "retrieve"]:
            return SaleReadSerializer
        return SaleSerializer

    def perform_create(self, serializer):
        serializer.save()


class DiscoReservationViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = DiscoReservation.objects.select_related(
        "table",
        "created_by",
    ).all()
    serializer_class = DiscoReservationSerializer

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.get_organisation(),
            created_by=self.request.user,
        )


class DiscoActivityLogViewSet(OrganisationQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    queryset = DiscoActivityLog.objects.select_related("user").all()
    serializer_class = DiscoActivityLogSerializer


class DiscoDashboardViewSet(OrganisationQuerysetMixin, viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        organisation = self.get_organisation()
        today = timezone.now().date()

        today_sales = Sale.objects.filter(
            organisation=organisation,
            created_at__date=today,
            status="completed",
        )

        month_sales = Sale.objects.filter(
            organisation=organisation,
            created_at__year=today.year,
            created_at__month=today.month,
            status="completed",
        )

        expenses_month = Expense.objects.filter(
            organisation=organisation,
            created_at__year=today.year,
            created_at__month=today.month,
        )

        data = {
            "sales_today": today_sales.aggregate(total=Sum("total"))["total"] or 0,
            "sales_this_month": month_sales.aggregate(total=Sum("total"))["total"] or 0,
            "expenses_this_month": expenses_month.aggregate(total=Sum("amount"))["total"] or 0,
            "orders_today": today_sales.count(),
            "products_count": Product.objects.filter(organisation=organisation).count(),
            "low_stock_count": Product.objects.filter(
                organisation=organisation,
                stock__lte=models.F("minimum_stock"),
                is_active=True,
            ).count(),
            "open_tables": DiscoTable.objects.filter(
                organisation=organisation,
                status="occupied",
            ).count(),
            "reserved_tables": DiscoTable.objects.filter(
                organisation=organisation,
                status="reserved",
            ).count(),
            "active_employees": DiscoEmployee.objects.filter(
                organisation=organisation,
                is_active=True,
            ).count(),
            "pending_reservations": DiscoReservation.objects.filter(
                organisation=organisation,
                status="pending",
            ).count(),
            "open_cash_shifts": CashShift.objects.filter(
                organisation=organisation,
                is_open=True,
            ).count(),
        }

        data["net_profit_this_month"] = (
            data["sales_this_month"] - data["expenses_this_month"]
        )

        return Response(data)