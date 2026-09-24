from decimal import Decimal

from rest_framework import serializers

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
    PurchaseOrderItem,
    Sale,
    SaleItem,
    Store,
    Supplier,
    SupplierProduct,
)


class StoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Store
        fields = (
            "id",
            "name",
            "address",
            "phone",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("El nombre de la sucursal es obligatorio.")

        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        if organisation is not None:
            matches = Store.objects.filter(
                organisation=organisation,
                name__iexact=name,
            )
            if self.instance is not None:
                matches = matches.exclude(pk=self.instance.pk)
            if matches.exists():
                raise serializers.ValidationError(
                    "Ya existe una sucursal con este nombre."
                )
        return name


class MasterProductSerializer(serializers.ModelSerializer):
    image_url = serializers.SerializerMethodField()
    display_name = serializers.SerializerMethodField()

    class Meta:
        model = MasterProduct
        fields = (
            "id",
            "internal_reference",
            "barcode",
            "name",
            "brand",
            "presentation",
            "category",
            "unit",
            "sale_mode",
            "units_per_case",
            "image",
            "image_url",
            "display_name",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "internal_reference",
            "image_url",
            "display_name",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "image": {"write_only": True, "required": False},
        }

    def get_image_url(self, obj):
        if not obj.image:
            return None

        request = self.context.get("request")
        url = obj.image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def get_display_name(self, obj):
        return str(obj)

    def validate_barcode(self, value):
        if value in (None, ""):
            return None

        barcode = value.strip()
        if not barcode.isdigit():
            raise serializers.ValidationError(
                "El código de barra debe contener solamente números."
            )
        if len(barcode) not in (8, 12, 13, 14):
            raise serializers.ValidationError(
                "El código de barra debe tener 8, 12, 13 o 14 dígitos."
            )
        return barcode

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("El nombre del producto es obligatorio.")
        return name

    def validate_units_per_case(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "La caja debe contener al menos una unidad."
            )
        return value


class InventoryItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(
        source="master_product.name",
        read_only=True,
    )
    product_display_name = serializers.SerializerMethodField()
    barcode = serializers.CharField(
        source="master_product.barcode",
        read_only=True,
        allow_null=True,
    )
    brand = serializers.CharField(
        source="master_product.brand",
        read_only=True,
    )
    presentation = serializers.CharField(
        source="master_product.presentation",
        read_only=True,
    )
    category = serializers.CharField(
        source="master_product.category",
        read_only=True,
    )
    unit = serializers.CharField(
        source="master_product.unit",
        read_only=True,
    )
    sale_mode = serializers.CharField(
        source="master_product.sale_mode",
        read_only=True,
    )
    units_per_case = serializers.IntegerField(
        source="master_product.units_per_case",
        read_only=True,
    )
    image_url = serializers.SerializerMethodField()
    low_stock = serializers.BooleanField(source="is_low_stock", read_only=True)
    stock_value = serializers.DecimalField(
        max_digits=18,
        decimal_places=2,
        read_only=True,
    )
    profit_per_unit = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = InventoryItem
        fields = (
            "id",
            "store",
            "master_product",
            "product_name",
            "product_display_name",
            "barcode",
            "brand",
            "presentation",
            "category",
            "unit",
            "sale_mode",
            "units_per_case",
            "image_url",
            "cost_price",
            "sale_price",
            "quantity",
            "reorder_level",
            "low_stock",
            "stock_value",
            "profit_per_unit",
            "is_quick_sale",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "product_name",
            "product_display_name",
            "barcode",
            "brand",
            "presentation",
            "category",
            "unit",
            "sale_mode",
            "units_per_case",
            "image_url",
            "low_stock",
            "stock_value",
            "profit_per_unit",
            "created_at",
            "updated_at",
        )

    def get_product_display_name(self, obj):
        return str(obj.master_product)

    def get_image_url(self, obj):
        if not obj.master_product.image:
            return None

        request = self.context.get("request")
        url = obj.master_product.image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def validate(self, attrs):
        attrs = super().validate(attrs)

        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        store = attrs.get("store", getattr(self.instance, "store", None))
        master_product = attrs.get(
            "master_product",
            getattr(self.instance, "master_product", None),
        )

        if organisation is None:
            raise serializers.ValidationError(
                {"organisation": "No se pudo identificar el negocio."}
            )

        if store is None or store.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada no pertenece a este negocio."}
            )

        if not store.is_active:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada está inactiva."}
            )

        if master_product is None or not master_product.is_active:
            raise serializers.ValidationError(
                {"master_product": "El producto no está disponible."}
            )

        if self.instance is None and InventoryItem.objects.filter(
            store=store,
            master_product=master_product,
        ).exists():
            raise serializers.ValidationError(
                {"master_product": "Este producto ya está en el inventario."}
            )

        cost_price = attrs.get(
            "cost_price",
            getattr(self.instance, "cost_price", Decimal("0.00")),
        )
        sale_price = attrs.get(
            "sale_price",
            getattr(self.instance, "sale_price", None),
        )

        if sale_price is not None and sale_price <= 0:
            raise serializers.ValidationError(
                {"sale_price": "El precio de venta debe ser mayor que cero."}
            )

        if cost_price < 0:
            raise serializers.ValidationError(
                {"cost_price": "El costo no puede ser negativo."}
            )

        return attrs


class InitialInventoryByBarcodeSerializer(serializers.Serializer):
    store_id = serializers.IntegerField(min_value=1)
    barcode = serializers.CharField(max_length=64)
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.000"),
    )
    cost_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.00"),
    )
    sale_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    reorder_level = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.000"),
        default=Decimal("0.000"),
    )
    is_quick_sale = serializers.BooleanField(default=False)

    def validate_barcode(self, value):
        barcode = value.strip()
        if not barcode.isdigit():
            raise serializers.ValidationError(
                "El código de barra debe contener solamente números."
            )
        if len(barcode) not in (8, 12, 13, 14):
            raise serializers.ValidationError(
                "El código de barra debe tener 8, 12, 13 o 14 dígitos."
            )
        return barcode


class ReceiveCasesSerializer(serializers.Serializer):
    cases = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )


class QuantityFromAmountSerializer(serializers.Serializer):
    amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )


class SaleItemSerializer(serializers.ModelSerializer):
    inventory_item_id = serializers.IntegerField(
        source="inventory_item.id",
        read_only=True,
    )
    profit = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = SaleItem
        fields = (
            "id",
            "inventory_item_id",
            "product_name",
            "barcode",
            "unit",
            "quantity",
            "unit_price",
            "unit_cost",
            "line_total",
            "profit",
        )
        read_only_fields = fields


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True, read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    cashier_name = serializers.SerializerMethodField()
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    payment_method_display = serializers.CharField(
        source="get_payment_method_display",
        read_only=True,
    )
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )
    profit = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = Sale
        fields = (
            "id",
            "receipt_number",
            "store",
            "store_name",
            "cashier",
            "cashier_name",
            "customer",
            "customer_name",
            "payment_method",
            "payment_method_display",
            "subtotal",
            "discount",
            "total",
            "amount_received",
            "change_due",
            "profit",
            "status",
            "status_display",
            "credit_due_date",
            "voided_at",
            "created_at",
            "updated_at",
            "items",
        )
        read_only_fields = fields

    def get_cashier_name(self, obj):
        full_name = obj.cashier.get_full_name().strip()
        return full_name or obj.cashier.get_username()


class SaleLineInputSerializer(serializers.Serializer):
    inventory_item_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )
    barcode = serializers.CharField(
        max_length=64,
        required=False,
        allow_blank=False,
    )
    quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        min_value=Decimal("0.001"),
        default=Decimal("1.000"),
    )

    def validate_barcode(self, value):
        barcode = value.strip()
        if not barcode.isdigit():
            raise serializers.ValidationError(
                "El código de barra debe contener solamente números."
            )
        return barcode

    def validate(self, attrs):
        attrs = super().validate(attrs)
        inventory_item_id = attrs.get("inventory_item_id")
        barcode = attrs.get("barcode")

        if bool(inventory_item_id) == bool(barcode):
            raise serializers.ValidationError(
                "Indique solamente inventory_item_id o barcode."
            )

        return attrs


class CreateSaleSerializer(serializers.Serializer):
    store_id = serializers.IntegerField(min_value=1)
    payment_method = serializers.ChoiceField(
        choices=Sale.PAYMENT_METHOD_CHOICES,
        default=Sale.CASH,
    )
    customer_id = serializers.IntegerField(
        min_value=1,
        required=False,
    )
    credit_due_date = serializers.DateField(required=False)
    discount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        default=Decimal("0.00"),
    )
    amount_received = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.00"),
        required=False,
    )
    items = SaleLineInputSerializer(many=True, allow_empty=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        payment_method = attrs["payment_method"]

        if payment_method == Sale.CASH and "amount_received" not in attrs:
            raise serializers.ValidationError(
                {"amount_received": "Indique cuánto efectivo entregó el cliente."}
            )

        if payment_method == Sale.CREDIT and "customer_id" not in attrs:
            raise serializers.ValidationError(
                {"customer_id": "Seleccione el cliente que llevará la compra fiada."}
            )

        if payment_method != Sale.CREDIT:
            attrs.pop("customer_id", None)
            attrs.pop("credit_due_date", None)

        return attrs


class CustomerSerializer(serializers.ModelSerializer):
    available_credit = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
        allow_null=True,
    )

    class Meta:
        model = Customer
        fields = (
            "id",
            "name",
            "phone",
            "address",
            "notes",
            "credit_limit",
            "balance",
            "available_credit",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "balance",
            "available_credit",
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("El nombre del cliente es obligatorio.")
        return name

    def validate_phone(self, value):
        phone = value.strip()
        if not phone:
            return ""

        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        if organisation is not None:
            matches = Customer.objects.filter(
                organisation=organisation,
                phone=phone,
            )
            if self.instance is not None:
                matches = matches.exclude(pk=self.instance.pk)
            if matches.exists():
                raise serializers.ValidationError(
                    "Ya existe un cliente con este teléfono."
                )
        return phone


class CreditTransactionSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.name", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    transaction_type_display = serializers.CharField(
        source="get_transaction_type_display",
        read_only=True,
    )

    class Meta:
        model = CreditTransaction
        fields = (
            "id",
            "customer",
            "customer_name",
            "store",
            "store_name",
            "sale",
            "created_by",
            "created_by_name",
            "transaction_type",
            "transaction_type_display",
            "amount",
            "balance_after",
            "note",
            "created_at",
        )
        read_only_fields = fields

    def get_created_by_name(self, obj):
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.get_username()


class RecordCreditPaymentSerializer(serializers.Serializer):
    store_id = serializers.IntegerField(min_value=1)
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    note = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )


class EmployeeSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)
    pay_frequency_display = serializers.CharField(
        source="get_pay_frequency_display",
        read_only=True,
    )

    class Meta:
        model = Employee
        fields = (
            "id",
            "store",
            "store_name",
            "name",
            "phone",
            "position",
            "pay_frequency",
            "pay_frequency_display",
            "pay_amount",
            "start_date",
            "end_date",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "store_name",
            "pay_frequency_display",
            "created_at",
            "updated_at",
        )

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("El nombre del empleado es obligatorio.")
        return name

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        store = attrs.get("store", getattr(self.instance, "store", None))
        start_date = attrs.get(
            "start_date",
            getattr(self.instance, "start_date", None),
        )
        end_date = attrs.get(
            "end_date",
            getattr(self.instance, "end_date", None),
        )

        if organisation is None:
            raise serializers.ValidationError(
                {"organisation": "No se pudo identificar el negocio."}
            )
        if store is None or store.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada no pertenece a este negocio."}
            )
        if not store.is_active:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada está inactiva."}
            )
        if end_date and start_date and end_date < start_date:
            raise serializers.ValidationError(
                {"end_date": "La fecha final no puede ser anterior al inicio."}
            )
        return attrs


class PayrollPaymentSerializer(serializers.ModelSerializer):
    employee_name = serializers.CharField(source="employee.name", read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = PayrollPayment
        fields = (
            "id",
            "store",
            "store_name",
            "employee",
            "employee_name",
            "created_by",
            "created_by_name",
            "amount",
            "period_start",
            "period_end",
            "paid_on",
            "note",
            "created_at",
        )
        read_only_fields = (
            "id",
            "store_name",
            "employee_name",
            "created_by",
            "created_by_name",
            "created_at",
        )

    def get_created_by_name(self, obj):
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.get_username()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        store = attrs.get("store", getattr(self.instance, "store", None))
        employee = attrs.get("employee", getattr(self.instance, "employee", None))
        period_start = attrs.get(
            "period_start",
            getattr(self.instance, "period_start", None),
        )
        period_end = attrs.get(
            "period_end",
            getattr(self.instance, "period_end", None),
        )

        if organisation is None:
            raise serializers.ValidationError(
                {"organisation": "No se pudo identificar el negocio."}
            )
        if store is None or store.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada no pertenece a este negocio."}
            )
        if employee is None or employee.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"employee": "El empleado no pertenece a este negocio."}
            )
        if employee.store_id != store.id:
            raise serializers.ValidationError(
                {"employee": "El empleado pertenece a otra sucursal."}
            )
        if period_start and period_end and period_end < period_start:
            raise serializers.ValidationError(
                {"period_end": "El período final no puede ser anterior al inicio."}
            )
        return attrs


class ExpenseSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)
    category_display = serializers.CharField(
        source="get_category_display",
        read_only=True,
    )
    created_by_name = serializers.SerializerMethodField()
    receipt_image_url = serializers.SerializerMethodField()

    class Meta:
        model = Expense
        fields = (
            "id",
            "store",
            "store_name",
            "created_by",
            "created_by_name",
            "category",
            "category_display",
            "description",
            "amount",
            "expense_date",
            "receipt_image",
            "receipt_image_url",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "store_name",
            "created_by",
            "created_by_name",
            "category_display",
            "receipt_image_url",
            "created_at",
            "updated_at",
        )
        extra_kwargs = {
            "receipt_image": {"write_only": True, "required": False},
        }

    def get_created_by_name(self, obj):
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.get_username()

    def get_receipt_image_url(self, obj):
        if not obj.receipt_image:
            return None
        request = self.context.get("request")
        url = obj.receipt_image.url
        if request is not None:
            return request.build_absolute_uri(url)
        return url

    def validate_description(self, value):
        description = value.strip()
        if not description:
            raise serializers.ValidationError(
                "La descripción del gasto es obligatoria."
            )
        return description

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        store = attrs.get("store", getattr(self.instance, "store", None))

        if organisation is None:
            raise serializers.ValidationError(
                {"organisation": "No se pudo identificar el negocio."}
            )
        if store is None or store.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada no pertenece a este negocio."}
            )
        if not store.is_active:
            raise serializers.ValidationError(
                {"store": "La sucursal seleccionada está inactiva."}
            )
        return attrs


class ProfitabilityQuerySerializer(serializers.Serializer):
    store = serializers.IntegerField(min_value=1, required=False)
    date_from = serializers.DateField(required=False)
    date_to = serializers.DateField(required=False)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        date_from = attrs.get("date_from")
        date_to = attrs.get("date_to")
        if date_from and date_to and date_to < date_from:
            raise serializers.ValidationError(
                {"date_to": "La fecha final no puede ser anterior a la inicial."}
            )
        return attrs


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = (
            "id",
            "name",
            "contact_name",
            "phone",
            "whatsapp",
            "email",
            "address",
            "notes",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_name(self, value):
        name = value.strip()
        if not name:
            raise serializers.ValidationError("El nombre del suplidor es obligatorio.")
        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        if organisation is not None:
            matches = Supplier.objects.filter(
                organisation=organisation,
                name__iexact=name,
            )
            if self.instance is not None:
                matches = matches.exclude(pk=self.instance.pk)
            if matches.exists():
                raise serializers.ValidationError(
                    "Ya existe un suplidor con este nombre."
                )
        return name


class SupplierProductSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    product_name = serializers.CharField(
        source="master_product.name",
        read_only=True,
    )
    product_display_name = serializers.SerializerMethodField()
    barcode = serializers.CharField(
        source="master_product.barcode",
        read_only=True,
        allow_null=True,
    )
    unit_cost = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = SupplierProduct
        validators = []
        fields = (
            "id",
            "supplier",
            "supplier_name",
            "master_product",
            "product_name",
            "product_display_name",
            "barcode",
            "supplier_sku",
            "units_per_case",
            "case_cost",
            "unit_cost",
            "is_preferred",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "supplier_name",
            "product_name",
            "product_display_name",
            "barcode",
            "unit_cost",
            "created_at",
            "updated_at",
        )

    def get_product_display_name(self, obj):
        return str(obj.master_product)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get("request")
        organisation = getattr(request, "colmado_organisation", None)
        supplier = attrs.get("supplier", getattr(self.instance, "supplier", None))
        master_product = attrs.get(
            "master_product",
            getattr(self.instance, "master_product", None),
        )

        if organisation is None:
            raise serializers.ValidationError(
                {"organisation": "No se pudo identificar el negocio."}
            )
        if supplier is None or supplier.organisation_id != organisation.id:
            raise serializers.ValidationError(
                {"supplier": "El suplidor no pertenece a este negocio."}
            )
        if not supplier.is_active:
            raise serializers.ValidationError(
                {"supplier": "El suplidor está inactivo."}
            )
        if master_product is None or not master_product.is_active:
            raise serializers.ValidationError(
                {"master_product": "El producto no está disponible."}
            )
        matches = SupplierProduct.objects.filter(
            supplier=supplier,
            master_product=master_product,
        )
        if self.instance is not None:
            matches = matches.exclude(pk=self.instance.pk)
        if matches.exists():
            raise serializers.ValidationError(
                {"master_product": "Este suplidor ya tiene registrado el producto."}
            )
        return attrs


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    inventory_item_id = serializers.IntegerField(
        source="inventory_item.id",
        read_only=True,
    )
    barcode = serializers.CharField(
        source="inventory_item.master_product.barcode",
        read_only=True,
        allow_null=True,
    )
    ordered_quantity = serializers.DecimalField(
        max_digits=14,
        decimal_places=3,
        read_only=True,
    )

    class Meta:
        model = PurchaseOrderItem
        fields = (
            "id",
            "inventory_item_id",
            "product_name",
            "barcode",
            "cases",
            "units_per_case",
            "case_cost",
            "line_total",
            "ordered_quantity",
            "received_quantity",
        )
        read_only_fields = fields


class PurchaseOrderSerializer(serializers.ModelSerializer):
    items = PurchaseOrderItemSerializer(many=True, read_only=True)
    store_name = serializers.CharField(source="store.name", read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    created_by_name = serializers.SerializerMethodField()
    status_display = serializers.CharField(
        source="get_status_display",
        read_only=True,
    )

    class Meta:
        model = PurchaseOrder
        fields = (
            "id",
            "order_number",
            "store",
            "store_name",
            "supplier",
            "supplier_name",
            "created_by",
            "created_by_name",
            "status",
            "status_display",
            "total_cost",
            "note",
            "ordered_at",
            "received_at",
            "created_at",
            "updated_at",
            "items",
        )
        read_only_fields = fields

    def get_created_by_name(self, obj):
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.get_username()


class CreatePurchaseOrderLineSerializer(serializers.Serializer):
    inventory_item_id = serializers.IntegerField(min_value=1)
    cases = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )


class CreatePurchaseOrderSerializer(serializers.Serializer):
    store_id = serializers.IntegerField(min_value=1)
    supplier_id = serializers.IntegerField(min_value=1)
    note = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
    )
    items = CreatePurchaseOrderLineSerializer(many=True, allow_empty=False)

    def validate_items(self, value):
        inventory_ids = [item["inventory_item_id"] for item in value]
        if len(inventory_ids) != len(set(inventory_ids)):
            raise serializers.ValidationError(
                "No repita el mismo producto dentro de una orden."
            )
        return value


class InventoryMovementSerializer(serializers.ModelSerializer):
    store_name = serializers.CharField(source="store.name", read_only=True)
    product_name = serializers.CharField(
        source="inventory_item.master_product.name",
        read_only=True,
    )
    barcode = serializers.CharField(
        source="inventory_item.master_product.barcode",
        read_only=True,
        allow_null=True,
    )
    created_by_name = serializers.SerializerMethodField()
    movement_type_display = serializers.CharField(
        source="get_movement_type_display",
        read_only=True,
    )

    class Meta:
        model = InventoryMovement
        fields = (
            "id",
            "store",
            "store_name",
            "inventory_item",
            "product_name",
            "barcode",
            "purchase_order",
            "created_by",
            "created_by_name",
            "movement_type",
            "movement_type_display",
            "quantity_change",
            "quantity_after",
            "unit_cost",
            "note",
            "created_at",
        )
        read_only_fields = fields

    def get_created_by_name(self, obj):
        full_name = obj.created_by.get_full_name().strip()
        return full_name or obj.created_by.get_username()
