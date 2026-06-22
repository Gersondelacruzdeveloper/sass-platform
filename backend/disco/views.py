
from django.db import models,transaction
from django.db.models import Sum, Count
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from decimal import Decimal



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
    SaleItem,
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

    OpenTableBillSerializer,
    AddSaleItemSerializer,
    UpdateSaleItemQuantitySerializer,
    RemoveSaleItemSerializer,
    CheckoutSaleSerializer,
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
    queryset = Product.objects.select_related("category", "organisation").all()
    serializer_class = ProductSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError("No active organisation found for this user.")

        product = serializer.save(organisation=organisation)

        DiscoActivityLog.objects.create(
            organisation=organisation,
            user=self.request.user,
            action="product_created",
            description=f"Created product '{product.name}' with stock {product.stock}",
        )

    def perform_update(self, serializer):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError("No active organisation found for this user.")

        product = serializer.save()

        DiscoActivityLog.objects.create(
            organisation=organisation,
            user=self.request.user,
            action="product_updated",
            description=f"Updated product '{product.name}'",
        )

    def perform_destroy(self, instance):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError("No active organisation found for this user.")

        product_name = instance.name

        DiscoActivityLog.objects.create(
            organisation=organisation,
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
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def _is_true(self, value):
        return value in [True, "true", "True", "1", 1, "yes", "Yes", "on"]

    def perform_create(self, serializer):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError("No active organisation found for this user.")

        active_employees = DiscoEmployee.objects.filter(
            organisation=organisation,
            is_active=True,
        ).count()

        if active_employees >= organisation.max_employees:
            raise ValidationError(
                f"Your {organisation.get_plan_display()} plan allows up to "
                f"{organisation.max_employees} employees."
            )

        create_login = self._is_true(self.request.data.get("create_login"))

        if create_login:
            active_user_logins = DiscoEmployee.objects.filter(
                organisation=organisation,
                user__isnull=False,
                is_active=True,
            ).count()

            if active_user_logins >= organisation.max_users:
                raise ValidationError(
                    f"Your {organisation.get_plan_display()} plan allows up to "
                    f"{organisation.max_users} user logins."
                )

        serializer.save(organisation=organisation)

    def perform_update(self, serializer):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError("No active organisation found for this user.")

        instance = self.get_object()

        will_be_active = self._is_true(
            self.request.data.get("is_active", instance.is_active)
        )

        create_login = self._is_true(self.request.data.get("create_login"))

        if will_be_active and not instance.is_active:
            active_employees = DiscoEmployee.objects.filter(
                organisation=organisation,
                is_active=True,
            ).exclude(id=instance.id).count()

            if active_employees >= organisation.max_employees:
                raise ValidationError(
                    f"Your {organisation.get_plan_display()} plan allows up to "
                    f"{organisation.max_employees} employees."
                )

        if create_login and not instance.user:
            active_user_logins = DiscoEmployee.objects.filter(
                organisation=organisation,
                user__isnull=False,
                is_active=True,
            ).exclude(id=instance.id).count()

            if active_user_logins >= organisation.max_users:
                raise ValidationError(
                    f"Your {organisation.get_plan_display()} plan allows up to "
                    f"{organisation.max_users} user logins."
                )

        serializer.save()


class DiscoTableViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    queryset = DiscoTable.objects.all()
    serializer_class = DiscoTableSerializer

    def get_queryset(self):
        queryset = super().get_queryset()

        status_value = self.request.query_params.get("status")

        if status_value:
            queryset = queryset.filter(status=status_value)

        return queryset

    def perform_create(self, serializer):
        organisation = self.get_organisation()

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
        if self.action in ["list", "retrieve", "open_bills"]:
            return SaleReadSerializer

        return SaleSerializer

    def perform_create(self, serializer):
        serializer.save()

    def _get_open_cash_shift(self, organisation):
        return CashShift.objects.filter(
            organisation=organisation,
            is_open=True,
        ).first()

    def _generate_receipt_number(self, sale):
        if sale.receipt_number:
            return sale.receipt_number

        return f"DSC-{sale.organisation_id}-{sale.id:06d}"

    def _recalculate_sale(self, sale, discount=None, tax=None):
        subtotal = (
            sale.items.aggregate(total=models.Sum("total"))["total"]
            or Decimal("0.00")
        )

        if discount is not None:
            sale.discount = Decimal(str(discount))

        if tax is not None:
            sale.tax = Decimal(str(tax))

        sale.subtotal = subtotal
        sale.total = subtotal - sale.discount + sale.tax

        if sale.total < 0:
            sale.total = Decimal("0.00")

        sale.save(update_fields=[
            "subtotal",
            "discount",
            "tax",
            "total",
            "updated_at",
        ])

        return sale

    def _get_pending_table_bill(self):
        sale = self.get_object()

        if sale.sale_type != "table":
            raise ValidationError({
                "sale": "This sale is not a table bill."
            })

        if sale.status != "pending":
            raise ValidationError({
                "sale": "This table bill is not open."
            })

        return sale

    @action(detail=False, methods=["get"])
    def open_bills(self, request):
        organisation = self.get_organisation()

        bills = self.get_queryset().filter(
            organisation=organisation,
            sale_type="table",
            status="pending",
        )

        serializer = SaleReadSerializer(
            bills,
            many=True,
            context={"request": request},
        )

        return Response(serializer.data)

    @action(detail=False, methods=["post"])
    def open_table(self, request):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        serializer = OpenTableBillSerializer(
            data=request.data,
            context={"organisation": organisation},
        )
        serializer.is_valid(raise_exception=True)

        table = serializer.validated_data["table_obj"]
        waiter = serializer.validated_data.get("waiter_obj")
        bartender = serializer.validated_data.get("bartender_obj")
        customer_name = serializer.validated_data.get("customer_name") or table.name

        with transaction.atomic():
            table.status = "occupied"
            table.save(update_fields=["status", "updated_at"])

            sale = Sale.objects.create(
                organisation=organisation,
                receipt_number=None,
                payment_method="cash",
                status="pending",
                sale_type="table",
                customer_name=customer_name,
                table=table,
                table_number=table.name,
                cash_shift=self._get_open_cash_shift(organisation),
                waiter=waiter,
                bartender=bartender,
                subtotal=Decimal("0.00"),
                discount=Decimal("0.00"),
                tax=Decimal("0.00"),
                total=Decimal("0.00"),
                created_by=request.user,
            )

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_bill_opened",
                description=f"Opened bill #{sale.id} for table {table.name}",
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data, status=201)

    @action(detail=True, methods=["post"])
    def add_item(self, request, pk=None):
        organisation = self.get_organisation()
        sale = self._get_pending_table_bill()

        serializer = AddSaleItemSerializer(
            data=request.data,
            context={"organisation": organisation},
        )
        serializer.is_valid(raise_exception=True)

        product_id = serializer.validated_data["product_id"]
        quantity = serializer.validated_data["quantity"]

        with transaction.atomic():
            product = Product.objects.select_for_update().get(
                id=product_id,
                organisation=organisation,
                is_active=True,
            )

            if product.stock < quantity:
                raise ValidationError({
                    "quantity": f"Not enough stock. Available: {product.stock}."
                })

            existing_item = SaleItem.objects.filter(
                sale=sale,
                product=product,
            ).first()

            if existing_item:
                existing_item.quantity += quantity
                existing_item.total = existing_item.unit_price * existing_item.quantity
                existing_item.save(update_fields=["quantity", "total"])
            else:
                SaleItem.objects.create(
                    sale=sale,
                    product=product,
                    quantity=quantity,
                    unit_price=product.sale_price,
                    unit_cost=product.cost_price,
                    total=product.sale_price * quantity,
                )

            product.stock -= quantity
            product.save(update_fields=["stock", "updated_at"])

            self._recalculate_sale(sale)

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_item_added",
                description=(
                    f"Added {quantity} x {product.name} "
                    f"to table bill #{sale.id}"
                ),
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data)

    @action(detail=True, methods=["post"])
    def update_item(self, request, pk=None):
        organisation = self.get_organisation()
        sale = self._get_pending_table_bill()

        serializer = UpdateSaleItemQuantitySerializer(
            data=request.data,
            context={"sale": sale},
        )
        serializer.is_valid(raise_exception=True)

        item = serializer.validated_data["item_obj"]
        new_quantity = serializer.validated_data["quantity"]
        difference = serializer.validated_data["difference"]

        with transaction.atomic():
            product = Product.objects.select_for_update().get(
                id=item.product_id,
                organisation=organisation,
            )

            if difference > 0 and product.stock < difference:
                raise ValidationError({
                    "quantity": f"Not enough stock. Available: {product.stock}."
                })

            product.stock -= difference

            if product.stock < 0:
                product.stock = 0

            product.save(update_fields=["stock", "updated_at"])

            item.quantity = new_quantity
            item.total = item.unit_price * new_quantity
            item.save(update_fields=["quantity", "total"])

            self._recalculate_sale(sale)

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_item_updated",
                description=(
                    f"Updated item #{item.id} to quantity {new_quantity} "
                    f"on table bill #{sale.id}"
                ),
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data)

    @action(detail=True, methods=["post"])
    def remove_item(self, request, pk=None):
        organisation = self.get_organisation()
        sale = self._get_pending_table_bill()

        serializer = RemoveSaleItemSerializer(
            data=request.data,
            context={"sale": sale},
        )
        serializer.is_valid(raise_exception=True)

        item = serializer.validated_data["item_obj"]

        with transaction.atomic():
            product = Product.objects.select_for_update().get(
                id=item.product_id,
                organisation=organisation,
            )

            product.stock += item.quantity
            product.save(update_fields=["stock", "updated_at"])

            description = (
                f"Removed {item.quantity} x {product.name} "
                f"from bill #{sale.id}"
            )

            item.delete()

            self._recalculate_sale(sale)

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_item_removed",
                description=description,
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data)

    @action(detail=True, methods=["post"])
    def checkout(self, request, pk=None):
        organisation = self.get_organisation()
        sale = self._get_pending_table_bill()

        serializer = CheckoutSaleSerializer(
            data=request.data,
            context={"sale": sale},
        )
        serializer.is_valid(raise_exception=True)

        payment_method = serializer.validated_data.get("payment_method", "cash")
        discount = serializer.validated_data.get("discount", Decimal("0.00"))
        tax = serializer.validated_data.get("tax", Decimal("0.00"))

        with transaction.atomic():
            self._recalculate_sale(sale, discount=discount, tax=tax)

            sale.payment_method = payment_method
            sale.status = "completed"
            sale.receipt_number = self._generate_receipt_number(sale)
            sale.save(update_fields=[
                "payment_method",
                "status",
                "receipt_number",
                "updated_at",
            ])

            if sale.table:
                sale.table.status = "available"
                sale.table.save(update_fields=["status", "updated_at"])

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_bill_checked_out",
                description=(
                    f"Checked out table bill #{sale.id} "
                    f"for total {sale.total}"
                ),
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data)

    @action(detail=True, methods=["post"])
    def cancel_bill(self, request, pk=None):
        organisation = self.get_organisation()
        sale = self._get_pending_table_bill()

        with transaction.atomic():
            for item in sale.items.select_related("product").all():
                product = Product.objects.select_for_update().get(
                    id=item.product_id,
                    organisation=organisation,
                )

                product.stock += item.quantity
                product.save(update_fields=["stock", "updated_at"])

            sale.status = "cancelled"
            sale.save(update_fields=["status", "updated_at"])

            if sale.table:
                sale.table.status = "available"
                sale.table.save(update_fields=["status", "updated_at"])

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="table_bill_cancelled",
                description=f"Cancelled table bill #{sale.id}",
            )

        response_serializer = SaleReadSerializer(
            sale,
            context={"request": request},
        )

        return Response(response_serializer.data)


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