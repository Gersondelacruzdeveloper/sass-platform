from django.contrib import admin

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


@admin.register(Store)
class StoreAdmin(admin.ModelAdmin):
    list_display = ("name", "organisation", "phone", "is_active", "updated_at")
    list_filter = ("is_active", "organisation")
    search_fields = ("name", "address", "phone", "organisation__name")


@admin.register(MasterProduct)
class MasterProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "brand",
        "presentation",
        "barcode",
        "category",
        "sale_mode",
        "is_active",
    )
    list_filter = ("is_active", "sale_mode", "unit", "category")
    search_fields = ("name", "brand", "presentation", "barcode", "category")
    readonly_fields = ("internal_reference", "created_at", "updated_at")


@admin.register(InventoryItem)
class InventoryItemAdmin(admin.ModelAdmin):
    list_display = (
        "master_product",
        "store",
        "organisation",
        "quantity",
        "sale_price",
        "reorder_level",
        "is_low_stock_display",
        "is_active",
    )
    list_filter = ("is_active", "is_quick_sale", "organisation", "store")
    search_fields = (
        "master_product__name",
        "master_product__brand",
        "master_product__barcode",
        "store__name",
        "organisation__name",
    )
    list_select_related = ("master_product", "store", "organisation")

    @admin.display(boolean=True, description="Inventario bajo")
    def is_low_stock_display(self, obj):
        return obj.is_low_stock


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "phone",
        "organisation",
        "balance",
        "credit_limit",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active", "organisation")
    search_fields = ("name", "phone", "address", "organisation__name")
    list_select_related = ("organisation",)
    readonly_fields = ("balance", "created_at", "updated_at")


class SaleItemInline(admin.TabularInline):
    model = SaleItem
    extra = 0
    can_delete = False
    fields = (
        "product_name",
        "barcode",
        "quantity",
        "unit",
        "unit_price",
        "unit_cost",
        "line_total",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Sale)
class SaleAdmin(admin.ModelAdmin):
    list_display = (
        "receipt_number",
        "store",
        "cashier",
        "customer",
        "payment_method",
        "total",
        "credit_due_date",
        "status",
        "created_at",
    )
    list_filter = (
        "status",
        "payment_method",
        "organisation",
        "store",
        "credit_due_date",
        "created_at",
    )
    search_fields = (
        "receipt_number",
        "store__name",
        "customer__name",
        "customer__phone",
        "cashier__email",
        "cashier__username",
    )
    list_select_related = ("organisation", "store", "cashier", "customer")
    date_hierarchy = "created_at"
    inlines = (SaleItemInline,)
    readonly_fields = (
        "organisation",
        "store",
        "cashier",
        "customer",
        "receipt_number",
        "payment_method",
        "subtotal",
        "discount",
        "total",
        "amount_received",
        "change_due",
        "credit_due_date",
        "status",
        "voided_at",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(CreditTransaction)
class CreditTransactionAdmin(admin.ModelAdmin):
    list_display = (
        "customer",
        "transaction_type",
        "amount",
        "balance_after",
        "store",
        "created_by",
        "created_at",
    )
    list_filter = (
        "transaction_type",
        "organisation",
        "store",
        "created_at",
    )
    search_fields = (
        "customer__name",
        "customer__phone",
        "note",
        "sale__receipt_number",
    )
    list_select_related = (
        "organisation",
        "customer",
        "store",
        "sale",
        "created_by",
    )
    date_hierarchy = "created_at"
    readonly_fields = (
        "organisation",
        "customer",
        "store",
        "sale",
        "created_by",
        "transaction_type",
        "amount",
        "balance_after",
        "note",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "position",
        "store",
        "organisation",
        "pay_frequency",
        "pay_amount",
        "is_active",
    )
    list_filter = ("is_active", "pay_frequency", "organisation", "store")
    search_fields = ("name", "phone", "position", "store__name")
    list_select_related = ("organisation", "store")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PayrollPayment)
class PayrollPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "employee",
        "store",
        "amount",
        "period_start",
        "period_end",
        "paid_on",
        "created_by",
    )
    list_filter = ("organisation", "store", "paid_on")
    search_fields = ("employee__name", "employee__phone", "note")
    list_select_related = ("organisation", "store", "employee", "created_by")
    date_hierarchy = "paid_on"
    readonly_fields = (
        "organisation",
        "store",
        "employee",
        "created_by",
        "amount",
        "period_start",
        "period_end",
        "paid_on",
        "note",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Expense)
class ExpenseAdmin(admin.ModelAdmin):
    list_display = (
        "description",
        "category",
        "amount",
        "store",
        "organisation",
        "expense_date",
        "created_by",
    )
    list_filter = ("category", "organisation", "store", "expense_date")
    search_fields = ("description", "store__name", "created_by__email")
    list_select_related = ("organisation", "store", "created_by")
    date_hierarchy = "expense_date"
    readonly_fields = ("created_by", "created_at", "updated_at")


@admin.register(Supplier)
class SupplierAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "contact_name",
        "phone",
        "whatsapp",
        "organisation",
        "is_active",
    )
    list_filter = ("is_active", "organisation")
    search_fields = ("name", "contact_name", "phone", "whatsapp", "email")
    list_select_related = ("organisation",)
    readonly_fields = ("created_at", "updated_at")


@admin.register(SupplierProduct)
class SupplierProductAdmin(admin.ModelAdmin):
    list_display = (
        "master_product",
        "supplier",
        "units_per_case",
        "case_cost",
        "is_preferred",
        "is_active",
    )
    list_filter = ("is_preferred", "is_active", "organisation", "supplier")
    search_fields = (
        "master_product__name",
        "master_product__barcode",
        "supplier__name",
        "supplier_sku",
    )
    list_select_related = ("organisation", "supplier", "master_product")
    readonly_fields = ("created_at", "updated_at")


class PurchaseOrderItemInline(admin.TabularInline):
    model = PurchaseOrderItem
    extra = 0
    can_delete = False
    fields = (
        "product_name",
        "cases",
        "units_per_case",
        "case_cost",
        "line_total",
        "received_quantity",
    )
    readonly_fields = fields

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(PurchaseOrder)
class PurchaseOrderAdmin(admin.ModelAdmin):
    list_display = (
        "order_number",
        "supplier",
        "store",
        "total_cost",
        "status",
        "ordered_at",
        "received_at",
    )
    list_filter = ("status", "organisation", "store", "supplier")
    search_fields = (
        "order_number",
        "supplier__name",
        "store__name",
        "note",
    )
    list_select_related = ("organisation", "store", "supplier", "created_by")
    date_hierarchy = "created_at"
    inlines = (PurchaseOrderItemInline,)
    readonly_fields = (
        "organisation",
        "store",
        "supplier",
        "created_by",
        "order_number",
        "status",
        "total_cost",
        "note",
        "ordered_at",
        "received_at",
        "created_at",
        "updated_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(InventoryMovement)
class InventoryMovementAdmin(admin.ModelAdmin):
    list_display = (
        "inventory_item",
        "movement_type",
        "quantity_change",
        "quantity_after",
        "unit_cost",
        "store",
        "created_at",
    )
    list_filter = ("movement_type", "organisation", "store", "created_at")
    search_fields = (
        "inventory_item__master_product__name",
        "inventory_item__master_product__barcode",
        "purchase_order__order_number",
        "note",
    )
    list_select_related = (
        "organisation",
        "store",
        "inventory_item__master_product",
        "purchase_order",
        "created_by",
    )
    date_hierarchy = "created_at"
    readonly_fields = (
        "organisation",
        "store",
        "inventory_item",
        "purchase_order",
        "created_by",
        "movement_type",
        "quantity_change",
        "quantity_after",
        "unit_cost",
        "note",
        "created_at",
    )

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
