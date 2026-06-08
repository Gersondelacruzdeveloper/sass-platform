
from django.db import models
from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError


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
        if hasattr(self.request, "organisation") and self.request.organisation:
            return self.request.organisation

        user_organisation = getattr(self.request.user, "organisation", None)
        if user_organisation:
            return user_organisation

        membership = (
            self.request.user.memberships
            .filter(is_active=True, organisation__is_active=True)
            .select_related("organisation")
            .first()
        )

        if membership:
            return membership.organisation

        return None

    def get_queryset(self):
        organisation = self.get_organisation()

        if organisation is None:
            return self.queryset.none()

        return self.queryset.filter(organisation=organisation)

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if organisation is None:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        serializer.save(organisation=organisation)


class CategoryViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related("category").all()
    serializer_class = ProductSerializer

    def perform_create(self, serializer):
        product = serializer.save(
            organisation=self.get_organisation()
        )

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="product_created",
            description=f"Created product '{product.name}' with stock {product.stock}",
        )

    def perform_update(self, serializer):
        product = serializer.save()

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="product_updated",
            description=f"Updated product '{product.name}'",
        )

    def perform_destroy(self, instance):
        product_name = instance.name

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="product_deleted",
            description=f"Deleted product '{product_name}'",
        )

        instance.delete()

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
        movement = serializer.save(
            organisation=self.get_organisation(),
            created_by=self.request.user,
        )

        product = movement.product
        quantity = movement.quantity

        if movement.movement_type == "in":
            product.stock += quantity

        elif movement.movement_type in ["out", "loss"]:
            product.stock -= quantity

        elif movement.movement_type == "adjustment":
            product.stock = quantity

        if product.stock < 0:
            product.stock = 0

        product.save(update_fields=["stock", "updated_at"])

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="stock_movement",
            description=(
                f"{movement.movement_type.upper()} | "
                f"{product.name} | "
                f"Qty: {quantity} | "
                f"New stock: {product.stock}"
            ),
        )


class ExpenseViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = Expense.objects.select_related("created_by").all()
    serializer_class = ExpenseSerializer

    def perform_create(self, serializer):
        expense = serializer.save(
            organisation=self.get_organisation(),
            created_by=self.request.user,
        )

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="expense_created",
            description=f"Created expense '{expense.title}' for {expense.amount}",
        )

    def perform_update(self, serializer):
        expense = serializer.save()

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="expense_updated",
            description=f"Updated expense '{expense.title}'",
        )

    def perform_destroy(self, instance):
        title = instance.title

        DiscoActivityLog.objects.create(
            organisation=self.get_organisation(),
            user=self.request.user,
            action="expense_deleted",
            description=f"Deleted expense '{title}'",
        )

        instance.delete()


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
        organisation = self.get_organisation()

        print("TABLE CREATE USER:", self.request.user)
        print("TABLE CREATE ORG:", organisation)

        if organisation is None:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        serializer.save(organisation=organisation)


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