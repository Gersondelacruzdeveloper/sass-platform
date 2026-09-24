from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import Coalesce
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from organisations.models import Membership

from .models import (
    CreditTransaction,
    Customer,
    Employee,
    Expense,
    InventoryItem,
    InventoryMovement,
    MasterProduct,
    PayrollPayment,
    PurchaseOrder,
    Sale,
    SaleItem,
    Store,
    Supplier,
    SupplierProduct,
)
from .serializers import (
    CreditTransactionSerializer,
    CreateSaleSerializer,
    CustomerSerializer,
    EmployeeSerializer,
    ExpenseSerializer,
    CreatePurchaseOrderSerializer,
    InitialInventoryByBarcodeSerializer,
    InventoryItemSerializer,
    InventoryMovementSerializer,
    MasterProductSerializer,
    PayrollPaymentSerializer,
    ProfitabilityQuerySerializer,
    PurchaseOrderSerializer,
    QuantityFromAmountSerializer,
    ReceiveCasesSerializer,
    RecordCreditPaymentSerializer,
    SaleSerializer,
    StoreSerializer,
    SupplierProductSerializer,
    SupplierSerializer,
)
from .services import (
    cancel_purchase_order,
    create_pos_sale,
    create_purchase_order,
    receive_purchase_order,
    record_credit_payment,
    void_pos_sale,
)


class ColmadoTenantMixin:
    """Resolve an active organisation only through an active membership."""

    permission_classes = (permissions.IsAuthenticated,)

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)

        organisation_slug = (
            request.headers.get("X-Organisation-Slug")
            or request.query_params.get("organisation_slug")
        )
        if not organisation_slug:
            raise PermissionDenied("Debe seleccionar una organización.")

        membership = (
            Membership.objects.select_related("organisation")
            .filter(
                user=request.user,
                organisation__slug=organisation_slug,
                organisation__is_active=True,
                is_active=True,
            )
            .first()
        )
        if membership is None:
            raise PermissionDenied("No tiene acceso a este colmado.")

        request.colmado_organisation = membership.organisation
        request.colmado_membership = membership


class OrganisationQuerysetMixin(ColmadoTenantMixin):
    def get_queryset(self):
        return self.queryset.filter(
            organisation=self.request.colmado_organisation
        )

    def perform_create(self, serializer):
        serializer.save(organisation=self.request.colmado_organisation)


class StoreViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = StoreSerializer
    queryset = Store.objects.all()


class MasterProductViewSet(ColmadoTenantMixin, viewsets.ReadOnlyModelViewSet):
    """
    Read-only catalogue for colmado users.

    The platform administrator manages master products through Django Admin.
    A colmado can only search and activate products in its own inventory.
    """

    serializer_class = MasterProductSerializer
    queryset = MasterProduct.objects.filter(is_active=True)

    def get_queryset(self):
        queryset = self.queryset
        barcode = self.request.query_params.get("barcode", "").strip()
        search = self.request.query_params.get("search", "").strip()
        category = self.request.query_params.get("category", "").strip()

        if barcode:
            queryset = queryset.filter(barcode=barcode)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(brand__icontains=search)
                | Q(presentation__icontains=search)
            )
        if category:
            queryset = queryset.filter(category__iexact=category)

        return queryset.order_by("name", "presentation")[:100]

    @action(detail=False, methods=("get",), url_path="by-barcode")
    def by_barcode(self, request):
        barcode = request.query_params.get("barcode", "").strip()
        if not barcode:
            raise ValidationError({"barcode": "Debe escanear un código de barra."})

        product = self.queryset.filter(barcode=barcode).first()
        if product is None:
            return Response(
                {
                    "code": "product_not_found",
                    "detail": "Este producto todavía no está en el catálogo.",
                    "barcode": barcode,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(self.get_serializer(product).data)


class InventoryItemViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = InventoryItemSerializer
    queryset = InventoryItem.objects.select_related(
        "store",
        "master_product",
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        barcode = self.request.query_params.get("barcode", "").strip()
        search = self.request.query_params.get("search", "").strip()
        quick_sale = self.request.query_params.get("quick_sale")
        low_stock = self.request.query_params.get("low_stock")

        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if barcode:
            queryset = queryset.filter(master_product__barcode=barcode)
        if search:
            queryset = queryset.filter(
                Q(master_product__name__icontains=search)
                | Q(master_product__brand__icontains=search)
                | Q(master_product__presentation__icontains=search)
            )
        if quick_sale in ("1", "true", "True"):
            queryset = queryset.filter(is_quick_sale=True)
        if low_stock in ("1", "true", "True"):
            queryset = queryset.filter(quantity__lte=F("reorder_level"))

        return queryset.order_by("master_product__name")

    @action(detail=False, methods=("post",), url_path="initial-scan")
    def initial_scan(self, request):
        input_serializer = InitialInventoryByBarcodeSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        organisation = request.colmado_organisation
        store = Store.objects.filter(
            id=data["store_id"],
            organisation=organisation,
            is_active=True,
        ).first()
        if store is None:
            raise ValidationError(
                {"store_id": "La sucursal no pertenece a este negocio o está inactiva."}
            )

        product = MasterProduct.objects.filter(
            barcode=data["barcode"],
            is_active=True,
        ).first()
        if product is None:
            return Response(
                {
                    "code": "product_not_found",
                    "detail": "Este producto todavía no está en el catálogo maestro.",
                    "barcode": data["barcode"],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        inventory_item, created = InventoryItem.objects.get_or_create(
            organisation=organisation,
            store=store,
            master_product=product,
            defaults={
                "quantity": data["quantity"],
                "cost_price": data["cost_price"],
                "sale_price": data["sale_price"],
                "reorder_level": data["reorder_level"],
                "is_quick_sale": data["is_quick_sale"],
            },
        )

        output = InventoryItemSerializer(
            inventory_item,
            context=self.get_serializer_context(),
        ).data
        output["already_in_inventory"] = not created

        return Response(
            output,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=("post",), url_path="receive-cases")
    def receive_cases(self, request, pk=None):
        input_serializer = ReceiveCasesSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        cases = input_serializer.validated_data["cases"]

        with transaction.atomic():
            inventory_item = get_object_or_404(
                self.get_queryset().select_for_update(),
                pk=pk,
            )
            units_added = inventory_item.units_from_cases(cases)
            inventory_item.quantity = F("quantity") + units_added
            inventory_item.save(update_fields=("quantity", "updated_at"))
            inventory_item.refresh_from_db()

        output = self.get_serializer(inventory_item).data
        output["cases_received"] = str(cases)
        output["units_added"] = str(units_added)
        return Response(output)

    @action(detail=True, methods=("post",), url_path="quantity-from-amount")
    def quantity_from_amount(self, request, pk=None):
        input_serializer = QuantityFromAmountSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        amount = input_serializer.validated_data["amount"]

        inventory_item = self.get_object()
        quantity = inventory_item.quantity_from_amount(amount).quantize(
            Decimal("0.001"),
            rounding=ROUND_HALF_UP,
        )

        return Response(
            {
                "inventory_item_id": inventory_item.id,
                "amount": str(amount),
                "sale_price": str(inventory_item.sale_price),
                "quantity": str(quantity),
                "unit": inventory_item.master_product.unit,
            }
        )


class SaleViewSet(OrganisationQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    """Simple POS: create, view and void sales without processing payments."""

    serializer_class = SaleSerializer
    queryset = Sale.objects.select_related(
        "store",
        "cashier",
        "customer",
    ).prefetch_related("items")

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        sale_status = self.request.query_params.get("status", "").strip()
        date_from = self.request.query_params.get("date_from", "").strip()
        date_to = self.request.query_params.get("date_to", "").strip()

        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if sale_status:
            valid_statuses = {choice[0] for choice in Sale.STATUS_CHOICES}
            if sale_status not in valid_statuses:
                raise ValidationError(
                    {"status": "El estado de venta no es válido."}
                )
            queryset = queryset.filter(status=sale_status)
        if date_from:
            parsed_date_from = parse_date(date_from)
            if parsed_date_from is None:
                raise ValidationError(
                    {"date_from": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(created_at__date__gte=parsed_date_from)
        if date_to:
            parsed_date_to = parse_date(date_to)
            if parsed_date_to is None:
                raise ValidationError(
                    {"date_to": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(created_at__date__lte=parsed_date_to)

        return queryset.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        input_serializer = CreateSaleSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        sale = create_pos_sale(
            organisation=request.colmado_organisation,
            cashier=request.user,
            data=input_serializer.validated_data,
        )
        output_serializer = SaleSerializer(
            sale,
            context=self.get_serializer_context(),
        )
        return Response(output_serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=("post",), url_path="void")
    def void(self, request, pk=None):
        sale = self.get_object()
        voided_sale = void_pos_sale(sale=sale, voided_by=request.user)
        return Response(
            SaleSerializer(
                voided_sale,
                context=self.get_serializer_context(),
            ).data
        )


class CustomerViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = CustomerSerializer
    queryset = Customer.objects.all()
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        has_debt = self.request.query_params.get("has_debt")
        overdue = self.request.query_params.get("overdue")

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(phone__icontains=search)
            )
        if has_debt in ("1", "true", "True"):
            queryset = queryset.filter(balance__gt=0)
        if overdue in ("1", "true", "True"):
            queryset = queryset.filter(
                balance__gt=0,
                sales__payment_method=Sale.CREDIT,
                sales__status=Sale.COMPLETED,
                sales__credit_due_date__lt=timezone.localdate(),
            ).distinct()

        return queryset.order_by("name")

    @action(detail=True, methods=("get",), url_path="history")
    def history(self, request, pk=None):
        customer = self.get_object()
        transactions = (
            CreditTransaction.objects.select_related(
                "customer",
                "store",
                "sale",
                "created_by",
            )
            .filter(
                organisation=request.colmado_organisation,
                customer=customer,
            )
            .order_by("-created_at", "-id")
        )
        return Response(
            CreditTransactionSerializer(
                transactions,
                many=True,
                context=self.get_serializer_context(),
            ).data
        )

    @action(detail=True, methods=("post",), url_path="payments")
    def payments(self, request, pk=None):
        customer = self.get_object()
        input_serializer = RecordCreditPaymentSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)

        transaction_entry, updated_customer = record_credit_payment(
            organisation=request.colmado_organisation,
            customer=customer,
            created_by=request.user,
            data=input_serializer.validated_data,
        )

        return Response(
            {
                "customer": CustomerSerializer(
                    updated_customer,
                    context=self.get_serializer_context(),
                ).data,
                "transaction": CreditTransactionSerializer(
                    transaction_entry,
                    context=self.get_serializer_context(),
                ).data,
            },
            status=status.HTTP_201_CREATED,
        )


class CreditTransactionViewSet(
    OrganisationQuerysetMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = CreditTransactionSerializer
    queryset = CreditTransaction.objects.select_related(
        "customer",
        "store",
        "sale",
        "created_by",
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        customer_id = self.request.query_params.get("customer")
        store_id = self.request.query_params.get("store")
        transaction_type = self.request.query_params.get("type", "").strip()

        if customer_id:
            queryset = queryset.filter(customer_id=customer_id)
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if transaction_type:
            valid_types = {
                choice[0] for choice in CreditTransaction.TRANSACTION_TYPE_CHOICES
            }
            if transaction_type not in valid_types:
                raise ValidationError(
                    {"type": "El tipo de movimiento no es válido."}
                )
            queryset = queryset.filter(transaction_type=transaction_type)

        return queryset.order_by("-created_at", "-id")


class EmployeeViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = EmployeeSerializer
    queryset = Employee.objects.select_related("store")
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        search = self.request.query_params.get("search", "").strip()
        active = self.request.query_params.get("active")
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(phone__icontains=search)
                | Q(position__icontains=search)
            )
        if active in ("1", "true", "True"):
            queryset = queryset.filter(is_active=True)
        elif active in ("0", "false", "False"):
            queryset = queryset.filter(is_active=False)
        return queryset.order_by("name")


class PayrollPaymentViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = PayrollPaymentSerializer
    queryset = PayrollPayment.objects.select_related(
        "store", "employee", "created_by"
    )
    http_method_names = ("get", "post", "head", "options")

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        employee_id = self.request.query_params.get("employee")
        date_from = self.request.query_params.get("date_from", "").strip()
        date_to = self.request.query_params.get("date_to", "").strip()
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if employee_id:
            queryset = queryset.filter(employee_id=employee_id)
        if date_from:
            parsed_date_from = parse_date(date_from)
            if parsed_date_from is None:
                raise ValidationError(
                    {"date_from": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(paid_on__gte=parsed_date_from)
        if date_to:
            parsed_date_to = parse_date(date_to)
            if parsed_date_to is None:
                raise ValidationError(
                    {"date_to": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(paid_on__lte=parsed_date_to)
        return queryset.order_by("-paid_on", "-created_at")

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.request.colmado_organisation,
            created_by=self.request.user,
        )


class ExpenseViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    queryset = Expense.objects.select_related("store", "created_by")

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        category = self.request.query_params.get("category", "").strip()
        date_from = self.request.query_params.get("date_from", "").strip()
        date_to = self.request.query_params.get("date_to", "").strip()
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if category:
            valid_categories = {choice[0] for choice in Expense.CATEGORY_CHOICES}
            if category not in valid_categories:
                raise ValidationError(
                    {"category": "La categoría de gasto no es válida."}
                )
            queryset = queryset.filter(category=category)
        if date_from:
            parsed_date_from = parse_date(date_from)
            if parsed_date_from is None:
                raise ValidationError(
                    {"date_from": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(expense_date__gte=parsed_date_from)
        if date_to:
            parsed_date_to = parse_date(date_to)
            if parsed_date_to is None:
                raise ValidationError(
                    {"date_to": "Use el formato de fecha YYYY-MM-DD."}
                )
            queryset = queryset.filter(expense_date__lte=parsed_date_to)
        return queryset.order_by("-expense_date", "-created_at")

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.request.colmado_organisation,
            created_by=self.request.user,
        )


class ProfitabilityViewSet(ColmadoTenantMixin, viewsets.ViewSet):
    """One compact report answering whether the colmado made money."""

    def list(self, request):
        input_serializer = ProfitabilityQuerySerializer(data=request.query_params)
        input_serializer.is_valid(raise_exception=True)
        filters = input_serializer.validated_data
        organisation = request.colmado_organisation
        today = timezone.localdate()
        date_from = filters.get("date_from", today.replace(day=1))
        date_to = filters.get("date_to", today)
        store_id = filters.get("store")

        store = None
        if store_id:
            store = Store.objects.filter(
                id=store_id,
                organisation=organisation,
                is_active=True,
            ).first()
            if store is None:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a este negocio o está inactiva."}
                )

        money_field = DecimalField(max_digits=18, decimal_places=2)
        zero = Decimal("0.00")

        def money(value):
            return Decimal(value).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )

        sales = Sale.objects.filter(
            organisation=organisation,
            status=Sale.COMPLETED,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to,
        )
        sale_items = SaleItem.objects.filter(
            sale__organisation=organisation,
            sale__status=Sale.COMPLETED,
            sale__created_at__date__gte=date_from,
            sale__created_at__date__lte=date_to,
        )
        expenses = Expense.objects.filter(
            organisation=organisation,
            expense_date__gte=date_from,
            expense_date__lte=date_to,
        )
        payroll = PayrollPayment.objects.filter(
            organisation=organisation,
            paid_on__gte=date_from,
            paid_on__lte=date_to,
        )
        if store is not None:
            sales = sales.filter(store=store)
            sale_items = sale_items.filter(sale__store=store)
            expenses = expenses.filter(store=store)
            payroll = payroll.filter(store=store)

        sales_totals = sales.aggregate(
            sale_count=Count("id"),
            revenue=Coalesce(Sum("total"), zero, output_field=money_field),
            discounts=Coalesce(Sum("discount"), zero, output_field=money_field),
            credit_sales=Coalesce(
                Sum("total", filter=Q(payment_method=Sale.CREDIT)),
                zero,
                output_field=money_field,
            ),
        )
        cost_of_goods = money(sale_items.aggregate(
            value=Coalesce(
                Sum(F("quantity") * F("unit_cost")),
                zero,
                output_field=money_field,
            )
        )["value"])
        operating_expenses = money(expenses.aggregate(
            value=Coalesce(Sum("amount"), zero, output_field=money_field)
        )["value"])
        payroll_total = money(payroll.aggregate(
            value=Coalesce(Sum("amount"), zero, output_field=money_field)
        )["value"])
        revenue = money(sales_totals["revenue"])
        sales_totals["discounts"] = money(sales_totals["discounts"])
        sales_totals["credit_sales"] = money(sales_totals["credit_sales"])
        gross_profit = revenue - cost_of_goods
        net_profit = gross_profit - operating_expenses - payroll_total
        non_credit_collected = revenue - sales_totals["credit_sales"]
        outstanding_credit = money(Customer.objects.filter(
            organisation=organisation,
            is_active=True,
        ).aggregate(
            value=Coalesce(Sum("balance"), zero, output_field=money_field)
        )["value"])

        inventory = InventoryItem.objects.filter(
            organisation=organisation,
            is_active=True,
        )
        if store is not None:
            inventory = inventory.filter(store=store)
        low_stock_count = inventory.filter(
            quantity__lte=F("reorder_level")
        ).count()

        top_products = list(
            sale_items.values("product_name")
            .annotate(
                quantity_sold=Sum("quantity"),
                sales_total=Sum("line_total"),
            )
            .order_by("-quantity_sold", "product_name")[:5]
        )
        for product in top_products:
            product["quantity_sold"] = str(
                Decimal(product["quantity_sold"]).quantize(Decimal("0.001"))
            )
            product["sales_total"] = str(money(product["sales_total"]))

        return Response(
            {
                "period": {"date_from": str(date_from), "date_to": str(date_to)},
                "store": {"id": store.id, "name": store.name} if store else None,
                "summary": {
                    "sale_count": sales_totals["sale_count"],
                    "revenue": str(revenue),
                    "discounts": str(sales_totals["discounts"]),
                    "cost_of_goods": str(cost_of_goods),
                    "gross_profit": str(gross_profit),
                    "operating_expenses": str(operating_expenses),
                    "payroll": str(payroll_total),
                    "net_profit": str(net_profit),
                    "is_profitable": net_profit >= 0,
                    "non_credit_collected": str(non_credit_collected),
                    "credit_sales": str(sales_totals["credit_sales"]),
                    "outstanding_credit": str(outstanding_credit),
                    "low_stock_count": low_stock_count,
                },
                "top_products": top_products,
            }
        )


class SupplierViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    queryset = Supplier.objects.all()
    http_method_names = ("get", "post", "patch", "head", "options")

    def get_queryset(self):
        queryset = super().get_queryset()
        search = self.request.query_params.get("search", "").strip()
        active = self.request.query_params.get("active")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(contact_name__icontains=search)
                | Q(phone__icontains=search)
                | Q(whatsapp__icontains=search)
            )
        if active in ("1", "true", "True"):
            queryset = queryset.filter(is_active=True)
        elif active in ("0", "false", "False"):
            queryset = queryset.filter(is_active=False)
        return queryset.order_by("name")


class SupplierProductViewSet(OrganisationQuerysetMixin, viewsets.ModelViewSet):
    serializer_class = SupplierProductSerializer
    queryset = SupplierProduct.objects.select_related("supplier", "master_product")

    def get_queryset(self):
        queryset = super().get_queryset()
        supplier_id = self.request.query_params.get("supplier")
        search = self.request.query_params.get("search", "").strip()
        preferred = self.request.query_params.get("preferred")
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        if search:
            queryset = queryset.filter(
                Q(master_product__name__icontains=search)
                | Q(master_product__brand__icontains=search)
                | Q(master_product__barcode__icontains=search)
                | Q(supplier_sku__icontains=search)
            )
        if preferred in ("1", "true", "True"):
            queryset = queryset.filter(is_preferred=True)
        return queryset.order_by("master_product__name")


class PurchaseOrderViewSet(OrganisationQuerysetMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = PurchaseOrderSerializer
    queryset = PurchaseOrder.objects.select_related(
        "store",
        "supplier",
        "created_by",
    ).prefetch_related("items__inventory_item__master_product")

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        supplier_id = self.request.query_params.get("supplier")
        order_status = self.request.query_params.get("status", "").strip()
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if supplier_id:
            queryset = queryset.filter(supplier_id=supplier_id)
        if order_status:
            valid_statuses = {choice[0] for choice in PurchaseOrder.STATUS_CHOICES}
            if order_status not in valid_statuses:
                raise ValidationError({"status": "El estado de orden no es válido."})
            queryset = queryset.filter(status=order_status)
        return queryset.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        input_serializer = CreatePurchaseOrderSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        order = create_purchase_order(
            organisation=request.colmado_organisation,
            created_by=request.user,
            data=input_serializer.validated_data,
        )
        return Response(
            PurchaseOrderSerializer(
                order,
                context=self.get_serializer_context(),
            ).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=("post",), url_path="receive")
    def receive(self, request, pk=None):
        order = self.get_object()
        received_order = receive_purchase_order(
            order=order,
            received_by=request.user,
        )
        return Response(
            PurchaseOrderSerializer(
                received_order,
                context=self.get_serializer_context(),
            ).data
        )

    @action(detail=True, methods=("post",), url_path="cancel")
    def cancel(self, request, pk=None):
        order = self.get_object()
        cancelled_order = cancel_purchase_order(order=order)
        return Response(
            PurchaseOrderSerializer(
                cancelled_order,
                context=self.get_serializer_context(),
            ).data
        )


class InventoryMovementViewSet(
    OrganisationQuerysetMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = InventoryMovementSerializer
    queryset = InventoryMovement.objects.select_related(
        "store",
        "inventory_item__master_product",
        "purchase_order",
        "created_by",
    )

    def get_queryset(self):
        queryset = super().get_queryset()
        store_id = self.request.query_params.get("store")
        inventory_item_id = self.request.query_params.get("inventory_item")
        movement_type = self.request.query_params.get("type", "").strip()
        if store_id:
            queryset = queryset.filter(store_id=store_id)
        if inventory_item_id:
            queryset = queryset.filter(inventory_item_id=inventory_item_id)
        if movement_type:
            valid_types = {
                choice[0] for choice in InventoryMovement.MOVEMENT_TYPE_CHOICES
            }
            if movement_type not in valid_types:
                raise ValidationError(
                    {"type": "El tipo de movimiento no es válido."}
                )
            queryset = queryset.filter(movement_type=movement_type)
        return queryset.order_by("-created_at", "-id")


class ReorderSuggestionViewSet(ColmadoTenantMixin, viewsets.ViewSet):
    """Return only actionable low-stock products for one selected store."""

    def list(self, request):
        store_id = request.query_params.get("store")
        if not store_id:
            raise ValidationError({"store": "Seleccione una sucursal."})

        store = Store.objects.filter(
            id=store_id,
            organisation=request.colmado_organisation,
            is_active=True,
        ).first()
        if store is None:
            raise ValidationError(
                {"store": "La sucursal no pertenece a este negocio o está inactiva."}
            )

        low_stock_items = (
            InventoryItem.objects.select_related("master_product")
            .filter(
                organisation=request.colmado_organisation,
                store=store,
                is_active=True,
                reorder_level__gt=0,
                quantity__lte=F("reorder_level"),
            )
            .order_by("master_product__name")[:200]
        )
        suggestions = []
        for inventory_item in low_stock_items:
            supplier_product = (
                SupplierProduct.objects.select_related("supplier")
                .filter(
                    organisation=request.colmado_organisation,
                    master_product=inventory_item.master_product,
                    supplier__is_active=True,
                    is_active=True,
                )
                .order_by("-is_preferred", "case_cost", "supplier__name")
                .first()
            )
            target_quantity = inventory_item.reorder_level * 2
            recommended_units = target_quantity - inventory_item.quantity
            suggestion = {
                "inventory_item_id": inventory_item.id,
                "product_name": str(inventory_item.master_product),
                "barcode": inventory_item.master_product.barcode,
                "current_quantity": str(inventory_item.quantity),
                "reorder_level": str(inventory_item.reorder_level),
                "recommended_units": str(recommended_units),
                "supplier": None,
                "recommended_cases": None,
            }
            if supplier_product is not None:
                recommended_cases = (
                    recommended_units / supplier_product.units_per_case
                ).quantize(Decimal("1"), rounding=ROUND_CEILING)
                suggestion["supplier"] = {
                    "id": supplier_product.supplier_id,
                    "name": supplier_product.supplier.name,
                    "supplier_product_id": supplier_product.id,
                    "units_per_case": supplier_product.units_per_case,
                    "case_cost": str(supplier_product.case_cost),
                }
                suggestion["recommended_cases"] = str(recommended_cases)
            suggestions.append(suggestion)

        return Response(
            {
                "store": {"id": store.id, "name": store.name},
                "count": len(suggestions),
                "suggestions": suggestions,
            }
        )
