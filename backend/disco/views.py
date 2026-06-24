
from django.db import models,transaction
from django.db.models import Sum, Count
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from decimal import Decimal, ROUND_HALF_UP
from datetime import timedelta


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
    DiscoSettings,
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
    DiscoSettingsSerializer
)

def money(value):
    return Decimal(str(value or 0)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def calculate_tax(amount, tax_percentage):
    amount = money(amount)
    tax_percentage = Decimal(str(tax_percentage or 0))

    if amount <= 0 or tax_percentage <= 0:
        return Decimal("0.00")

    return money(amount * tax_percentage / Decimal("100"))


def get_or_create_disco_settings(organisation):
    settings, _ = DiscoSettings.objects.get_or_create(
        organisation=organisation,
        defaults={
            "tax_percentage": Decimal("0.00"),
            "currency_symbol": "RD$",
        },
    )

    return settings

def calculate_payroll_for_period(organisation, start_date, end_date):
    employees = DiscoEmployee.objects.filter(
        organisation=organisation,
        daily_pay__gt=0,
    )

    total = Decimal("0.00")

    for employee in employees:
        employee_start = employee.start_date or start_date
        employee_end = employee.end_date or end_date

        period_start = max(start_date, employee_start)
        period_end = min(end_date, employee_end)

        if period_start > period_end:
            continue

        days_worked = (period_end - period_start).days + 1
        total += employee.daily_pay * Decimal(days_worked)

    return total

def get_sales_chart(self, organisation, days=14):
    today = timezone.localdate()
    start_date = today - timedelta(days=days - 1)

    queryset = (
        Sale.objects
        .filter(
            organisation=organisation,
            status="completed",
            created_at__date__gte=start_date,
        )
        .annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(
            total=Sum("total"),
            orders=Count("id"),
        )
        .order_by("day")
    )

    totals_by_day = {
        row["day"]: {
            "total": float(row["total"] or 0),
            "orders": row["orders"] or 0,
        }
        for row in queryset
    }

    chart = []

    for index in range(days):
        day = start_date + timedelta(days=index)
        values = totals_by_day.get(day, {"total": 0, "orders": 0})

        chart.append({
            "date": day.isoformat(),
            "label": day.strftime("%b %d"),
            "total": values["total"],
            "orders": values["orders"],
        })

    return chart

def get_current_disco_employee(user, organisation):
    if not user or not user.is_authenticated or not organisation:
        return None

    return (
        DiscoEmployee.objects
        .filter(
            organisation=organisation,
            user=user,
            is_active=True,
        )
        .first()
    )


def user_has_disco_permission(user, organisation, required_permissions):
    if not required_permissions:
        return True

    if isinstance(required_permissions, str):
        required_permissions = [required_permissions]

    if not user or not user.is_authenticated:
        return False

    if getattr(user, "is_superuser", False) or getattr(user, "is_staff", False):
        return True

    employee = get_current_disco_employee(user, organisation)

    if employee:
        if employee.role == "owner":
            return True

        for permission_name in required_permissions:
            if hasattr(employee, "has_permission"):
                if employee.has_permission(permission_name):
                    return True
            elif bool(getattr(employee, permission_name, False)):
                return True

        return False

    membership = (
        user.memberships
        .filter(is_active=True, organisation=organisation)
        .first()
        if hasattr(user, "memberships")
        else None
    )

    if membership:
        membership_role = str(getattr(membership, "role", "") or "").lower()

        owner_roles = {
            "owner",
            "admin",
            "administrator",
            "business_owner",
            "organisation_owner",
            "organization_owner",
            "superadmin",
            "super_admin",
        }

        if membership_role in owner_roles:
            return True

    # Safety fallback for the original business owner/admin account.
    # Employee login accounts should have a DiscoEmployee linked to the user.
    if getattr(user, "organisation_id", None) == getattr(organisation, "id", None):
        has_employee_profile = DiscoEmployee.objects.filter(
            organisation=organisation,
            user=user,
        ).exists()

        if not has_employee_profile:
            return True

    return False


class DiscoPermissionMixin:
    """
    Backend permission layer for the Disco module.

    This protects the API directly. The frontend can hide buttons and pages,
    but this mixin makes sure a user cannot bypass permissions by calling
    endpoints manually.
    """

    permission_required = None
    action_permissions = {}

    def get_required_disco_permission(self):
        action = getattr(self, "action", None)

        if action in self.action_permissions:
            return self.action_permissions[action]

        return self.permission_required

    def check_disco_permission(self, required_permissions):
        if not required_permissions:
            return

        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        if not user_has_disco_permission(
            self.request.user,
            organisation,
            required_permissions,
        ):
            raise PermissionDenied(
                "You do not have permission to perform this action."
            )

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)

        required_permissions = self.get_required_disco_permission()
        self.check_disco_permission(required_permissions)

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


class DiscoSettingsViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ViewSet):
    action_permissions = {
        "list": ["can_access_pos", "can_access_dashboard", "can_view_reports", "can_manage_settings"],
        "current": ["can_access_pos", "can_access_dashboard", "can_view_reports", "can_manage_settings"],
    }
    permission_classes = [permissions.IsAuthenticated]

    def list(self, request):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        settings = get_or_create_disco_settings(organisation)

        serializer = DiscoSettingsSerializer(
            settings,
            context={"request": request},
        )

        return Response(serializer.data)

    @action(detail=False, methods=["get", "patch"], url_path="current")
    def current(self, request):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        settings = get_or_create_disco_settings(organisation)

        if request.method.lower() == "patch":
            self.check_disco_permission("can_manage_settings")

            serializer = DiscoSettingsSerializer(
                settings,
                data=request.data,
                partial=True,
                context={"request": request},
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()

            DiscoActivityLog.objects.create(
                organisation=organisation,
                user=request.user,
                action="settings_updated",
                description=(
                    f"Updated disco settings. "
                    f"Tax: {settings.tax_percentage}%. "
                    f"Currency: {settings.currency_symbol}"
                ),
            )

            return Response(serializer.data)

        serializer = DiscoSettingsSerializer(
            settings,
            context={"request": request},
        )

        return Response(serializer.data)
    
class CategoryViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_access_pos", "can_manage_products", "can_manage_inventory"],
        "retrieve": ["can_access_pos", "can_manage_products", "can_manage_inventory"],
        "create": "can_manage_products",
        "update": "can_manage_products",
        "partial_update": "can_manage_products",
        "destroy": "can_manage_products",
    }
    queryset = Category.objects.all()
    serializer_class = CategorySerializer



class ProductViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_access_pos", "can_manage_products", "can_manage_inventory"],
        "retrieve": ["can_access_pos", "can_manage_products", "can_manage_inventory"],
        "low_stock": ["can_access_pos", "can_manage_products", "can_manage_inventory"],
        "create": "can_manage_products",
        "update": "can_manage_products",
        "partial_update": "can_manage_products",
        "destroy": "can_manage_products",
    }
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


class StockMovementViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    permission_required = "can_manage_inventory"
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


class ExpenseViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    permission_required = "can_manage_expenses"
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




class DiscoEmployeeViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "me": None,
        "list": "can_manage_employees",
        "retrieve": "can_manage_employees",
        "create": "can_manage_employees",
        "update": "can_manage_employees",
        "partial_update": "can_manage_employees",
        "destroy": "can_manage_employees",
    }
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


    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        organisation = self.get_organisation()

        if not organisation:
            raise ValidationError({
                "organisation": "No active organisation found for this user."
            })

        employee = get_current_disco_employee(request.user, organisation)

        if employee:
            serializer = self.get_serializer(
                employee,
                context={"request": request},
            )
            return Response(serializer.data)

        permission_fields = getattr(DiscoEmployee, "PERMISSION_FIELDS", [])
        permissions_payload = {
            field: True
            for field in permission_fields
        }

        return Response({
            "id": None,
            "user": request.user.id,
            "username": getattr(request.user, "username", ""),
            "email": getattr(request.user, "email", ""),
            "full_name": (
                getattr(request.user, "get_full_name", lambda: "")()
                or getattr(request.user, "username", "")
            ),
            "role": "owner",
            "is_active": True,
            "permissions": permissions_payload,
            **permissions_payload,
        })


class DiscoTableViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_access_pos", "can_manage_tables", "can_manage_reservations"],
        "retrieve": ["can_access_pos", "can_manage_tables", "can_manage_reservations"],
        "create": "can_manage_tables",
        "update": "can_manage_tables",
        "partial_update": "can_manage_tables",
        "destroy": "can_manage_tables",
    }
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

class CashShiftViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_open_cash_shift", "can_close_cash_shift", "can_view_reports"],
        "retrieve": ["can_open_cash_shift", "can_close_cash_shift", "can_view_reports"],
        "create": "can_open_cash_shift",
        "close": "can_close_cash_shift",
        "update": "can_close_cash_shift",
        "partial_update": "can_close_cash_shift",
        "destroy": "can_close_cash_shift",
    }
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


class SaleViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_access_pos", "can_view_reports"],
        "retrieve": ["can_access_pos", "can_view_reports"],
        "create": "can_access_pos",
        "open_bills": "can_access_pos",
        "open_table": "can_access_pos",
        "add_item": "can_access_pos",
        "update_item": "can_access_pos",
        "remove_item": "can_access_pos",
        "checkout": "can_access_pos",
        "cancel_bill": "can_cancel_sales",
        "update": "can_cancel_sales",
        "partial_update": "can_cancel_sales",
        "destroy": "can_cancel_sales",
    }
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
        discount = serializer.validated_data.get("discount", Decimal("0.00"))

        if money(discount) > Decimal("0.00"):
            self.check_disco_permission("can_apply_discounts")

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

    def _recalculate_sale(self, sale, discount=None):
        settings = get_or_create_disco_settings(sale.organisation)

        subtotal = (
            sale.items.aggregate(total=models.Sum("total"))["total"]
            or Decimal("0.00")
        )

        if discount is not None:
            sale.discount = money(discount)

        taxable_amount = money(subtotal - sale.discount)

        if taxable_amount < 0:
            taxable_amount = Decimal("0.00")

        sale.subtotal = money(subtotal)
        sale.tax = calculate_tax(
            taxable_amount,
            settings.tax_percentage,
        )
        sale.total = money(taxable_amount + sale.tax)

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

        if money(discount) > Decimal("0.00"):
            self.check_disco_permission("can_apply_discounts")

        self._recalculate_sale(sale, discount=discount)

        with transaction.atomic():
            self._recalculate_sale(sale, discount=discount)

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


class DiscoReservationViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ModelViewSet):
    action_permissions = {
        "list": ["can_manage_reservations", "can_manage_tables"],
        "retrieve": ["can_manage_reservations", "can_manage_tables"],
        "create": "can_manage_reservations",
        "update": "can_manage_reservations",
        "partial_update": "can_manage_reservations",
        "destroy": "can_manage_reservations",
    }
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


class DiscoActivityLogViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    permission_required = "can_view_activity_logs"
    queryset = DiscoActivityLog.objects.select_related("user").all()
    serializer_class = DiscoActivityLogSerializer



class DiscoDashboardViewSet(DiscoPermissionMixin, OrganisationQuerysetMixin, viewsets.ViewSet):
    permission_required = "can_access_dashboard"
    permission_classes = [permissions.IsAuthenticated]

    def get_sales_chart(self, organisation, days=14):
        today = timezone.localdate()
        start_date = today - timedelta(days=days - 1)

        queryset = (
            Sale.objects
            .filter(
                organisation=organisation,
                created_at__date__gte=start_date,
                status="completed",
            )
            .annotate(day=TruncDate("created_at"))
            .values("day")
            .annotate(
                total=Sum("total"),
                orders=Count("id"),
            )
            .order_by("day")
        )

        totals_by_day = {
            row["day"]: {
                "total": float(row["total"] or 0),
                "orders": row["orders"] or 0,
            }
            for row in queryset
        }

        chart = []

        for index in range(days):
            day = start_date + timedelta(days=index)
            values = totals_by_day.get(day, {"total": 0, "orders": 0})

            chart.append({
                "date": day.isoformat(),
                "label": day.strftime("%b %d"),
                "total": values["total"],
                "orders": values["orders"],
            })

        return chart

        
    def list(self, request):
        organisation = self.get_organisation()
        today = timezone.localdate()
        settings = get_or_create_disco_settings(organisation)
        month_start = today.replace(day=1)

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

        today_expenses = Expense.objects.filter(
            organisation=organisation,
            created_at__date=today,
        )

        month_expenses = Expense.objects.filter(
            organisation=organisation,
            created_at__year=today.year,
            created_at__month=today.month,
        )

        cost_expression = models.ExpressionWrapper(
            models.F("unit_cost") * models.F("quantity"),
            output_field=models.DecimalField(max_digits=12, decimal_places=2),
        )

        product_cost_today = (
            SaleItem.objects
            .filter(
                sale__organisation=organisation,
                sale__created_at__date=today,
                sale__status="completed",
            )
            .aggregate(total=Sum(cost_expression))["total"]
            or Decimal("0.00")
        )

        product_cost_this_month = (
            SaleItem.objects
            .filter(
                sale__organisation=organisation,
                sale__created_at__year=today.year,
                sale__created_at__month=today.month,
                sale__status="completed",
            )
            .aggregate(total=Sum(cost_expression))["total"]
            or Decimal("0.00")
        )

        sales_today = today_sales.aggregate(total=Sum("total"))["total"] or Decimal("0.00")
        sales_this_month = month_sales.aggregate(total=Sum("total"))["total"] or Decimal("0.00")

        subtotal_today = today_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")
        subtotal_this_month = month_sales.aggregate(total=Sum("subtotal"))["total"] or Decimal("0.00")

        discount_today = today_sales.aggregate(total=Sum("discount"))["total"] or Decimal("0.00")
        discount_this_month = month_sales.aggregate(total=Sum("discount"))["total"] or Decimal("0.00")

        tax_today = today_sales.aggregate(total=Sum("tax"))["total"] or Decimal("0.00")
        tax_this_month = month_sales.aggregate(total=Sum("tax"))["total"] or Decimal("0.00")

        expenses_today = today_expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        expenses_this_month = month_expenses.aggregate(total=Sum("amount"))["total"] or Decimal("0.00")
        payroll_today = calculate_payroll_for_period(
            organisation=organisation,
            start_date=today,
            end_date=today,
        )

        payroll_this_month = calculate_payroll_for_period(
            organisation=organisation,
            start_date=month_start,
            end_date=today,
        )

        revenue_today = subtotal_today - discount_today
        revenue_this_month = subtotal_this_month - discount_this_month

        gross_profit_today = revenue_today - product_cost_today
        gross_profit_this_month = revenue_this_month - product_cost_this_month

        net_profit_today = gross_profit_today - expenses_today - payroll_today
        net_profit_this_month = (
            gross_profit_this_month
            - expenses_this_month
            - payroll_this_month
        )

        data = {
            "sales_today": money(sales_today),
            "sales_this_month": money(sales_this_month),
            "sales_month": money(sales_this_month),

            "subtotal_today": money(subtotal_today),
            "subtotal_this_month": money(subtotal_this_month),

            "discount_today": money(discount_today),
            "discount_this_month": money(discount_this_month),

            "tax_today": money(tax_today),
            "tax_this_month": money(tax_this_month),

            "product_cost_today": money(product_cost_today),
            "product_cost_this_month": money(product_cost_this_month),

            "gross_profit_today": money(gross_profit_today),
            "gross_profit_this_month": money(gross_profit_this_month),

            "expenses_today": money(expenses_today),
            "expenses_this_month": money(expenses_this_month),

            "payroll_today": money(payroll_today),
            "payroll_this_month": money(payroll_this_month),

            "net_profit_today": money(net_profit_today),
            "net_profit_this_month": money(net_profit_this_month),
            "net_profit_month": money(net_profit_this_month),

            "orders_today": today_sales.count(),

            "products_count": Product.objects.filter(
                organisation=organisation
            ).count(),

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

            "tax_percentage": settings.tax_percentage,
            "currency_symbol": settings.currency_symbol,

            "sales_chart": self.get_sales_chart(organisation),
        }

        return Response(data)