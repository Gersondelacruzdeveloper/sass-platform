from decimal import Decimal
from django.db import models
from django.conf import settings
from organisations.models import Organisation
from django.utils import timezone


class DiscoEmployee(models.Model):
    ROLE_CHOICES = (
        ("owner", "Owner"),
        ("manager", "Manager"),
        ("cashier", "Cashier"),
        ("bartender", "Bartender"),
        ("waiter", "Waiter"),
        ("security", "Security"),
        ("host", "Host"),
        ("promoter", "Promoter"),
        ("inventory_manager", "Inventory Manager"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="disco_employees"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disco_employee_profiles"
    )
    photo = models.ImageField(
        upload_to="disco/employees/",
        blank=True,
        null=True
    )

    full_name = models.CharField(max_length=150)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES)
    phone = models.CharField(max_length=30, blank=True, null=True)
    daily_pay = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0,
        help_text="Daily employee payment used for payroll reports."
    )
    start_date = models.DateField(
    default=timezone.localdate,
    db_index=True,
    help_text="Date when the employee started working."
    )
    end_date = models.DateField(
    null=True,
    blank=True,
    db_index=True,
    help_text="Date when the employee stopped working. Empty means currently active."
)
    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name

    class Meta:
        ordering = ["full_name"]


class DiscoTable(models.Model):
    STATUS_CHOICES = (
        ("available", "Available"),
        ("occupied", "Occupied"),
        ("reserved", "Reserved"),
        ("cleaning", "Cleaning"),
        ("inactive", "Inactive"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="disco_tables"
    )

    name = models.CharField(max_length=50)
    floor = models.CharField(max_length=100, blank=True, null=True)
    capacity = models.PositiveIntegerField(default=4)
    minimum_spend = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="available",
        db_index=True
    )
    is_vip = models.BooleanField(default=False, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = ("organisation", "name")


class CashShift(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="cash_shifts"
    )

    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="cash_shifts_opened"
    )

    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cash_shifts_closed"
    )

    opening_cash = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    closing_cash = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    opened_at = models.DateTimeField(auto_now_add=True, db_index=True)
    closed_at = models.DateTimeField(blank=True, null=True)

    is_open = models.BooleanField(default=True, db_index=True)

    def __str__(self):
        return f"Cash Shift #{self.id}"

    class Meta:
        ordering = ["-opened_at"]


class DiscoSettings(models.Model):
    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="disco_settings"
    )

    tax_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        help_text="Tax percentage applied to sales. Example: 18.00"
    )

    currency_symbol = models.CharField(
        max_length=10,
        default="RD$",
        help_text="Display-only currency symbol. No currency conversion is applied."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Disco Settings - {self.organisation}"

    class Meta:
        verbose_name = "Disco Settings"
        verbose_name_plural = "Disco Settings"










class Category(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="categories"
    )

    name = models.CharField(max_length=100)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = ("organisation", "name")


class Product(models.Model):
    UNIT_CHOICES = (
        ("unit", "Unit"),
        ("bottle", "Bottle"),
        ("can", "Can"),
        ("box", "Box"),
        ("case", "Case"),
        ("liter", "Liter"),
        ("ml", "ML"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="products"
    )

    category = models.ForeignKey(
        "Category",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products"
    )

    name = models.CharField(max_length=150)

    barcode = models.CharField(max_length=100, blank=True, null=True)
    sku = models.CharField(max_length=100, blank=True, null=True)

    image = models.ImageField(upload_to="products/", blank=True, null=True)

    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2)

    stock = models.PositiveIntegerField(default=0)
    minimum_stock = models.PositiveIntegerField(default=5)

    unit = models.CharField(max_length=50, choices=UNIT_CHOICES, default="unit")
    is_alcohol = models.BooleanField(default=False)

    brand = models.CharField(max_length=100, blank=True, null=True)
    size_ml = models.PositiveIntegerField(blank=True, null=True)
    supplier_name = models.CharField(max_length=150, blank=True, null=True)

    is_active = models.BooleanField(default=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_low_stock(self):
        return self.stock <= self.minimum_stock

    @property
    def profit_per_unit(self):
        return self.sale_price - self.cost_price

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = (
            ("organisation", "barcode"),
            ("organisation", "sku"),
        )


class StockMovement(models.Model):
    MOVEMENT_CHOICES = (
        ("in", "Entrada"),
        ("out", "Salida"),
        ("adjustment", "Ajuste"),
        ("loss", "Pérdida"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="stock_movements"
    )

    product = models.ForeignKey(
        "Product",
        on_delete=models.CASCADE,
        related_name="stock_movements"
    )

    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_CHOICES,
        db_index=True
    )

    quantity = models.PositiveIntegerField()
    note = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stock_movements_created"
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.product.name} - {self.movement_type}"

    class Meta:
        ordering = ["-created_at"]


class Sale(models.Model):
    PAYMENT_CHOICES = (
        ("cash", "Efectivo"),
        ("card", "Tarjeta"),
        ("transfer", "Transferencia"),
        ("credit", "Crédito"),
    )

    STATUS_CHOICES = (
        ("completed", "Completed"),
        ("pending", "Pending"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
    )

    SALE_TYPE_CHOICES = (
        ("pos", "POS"),
        ("table", "Table"),
        ("delivery", "Delivery"),
        ("entry_fee", "Entry Fee"),
        ("vip", "VIP"),
        ("bottle_service", "Bottle Service"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="sales"
    )

    receipt_number = models.CharField(max_length=50, blank=True, null=True)

    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_CHOICES,
        default="cash",
        db_index=True
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="completed",
        db_index=True
    )

    sale_type = models.CharField(
        max_length=30,
        choices=SALE_TYPE_CHOICES,
        default="pos",
        db_index=True
    )

    customer_name = models.CharField(max_length=255, blank=True, null=True)

    table = models.ForeignKey(
        "DiscoTable",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales"
    )

    table_number = models.CharField(max_length=20, blank=True, null=True)

    cash_shift = models.ForeignKey(
        "CashShift",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales"
    )

    waiter = models.ForeignKey(
        "DiscoEmployee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_as_waiter"
    )

    bartender = models.ForeignKey(
        "DiscoEmployee",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_as_bartender"
    )

    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="sales_created"
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def product_cost_total(self):
        total = Decimal("0.00")

        for item in self.items.all():
            total += item.unit_cost * item.quantity

        return total

    @property
    def revenue_before_tax(self):
        revenue = self.subtotal - self.discount

        if revenue < 0:
            return Decimal("0.00")

        return revenue

    @property
    def gross_profit(self):
        return self.revenue_before_tax - self.product_cost_total




    def __str__(self):
        return f"Sale #{self.id}"

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("organisation", "receipt_number")


class SaleItem(models.Model):
    sale = models.ForeignKey(
        "Sale",
        on_delete=models.CASCADE,
        related_name="items"
    )

    product = models.ForeignKey(
        "Product",
        on_delete=models.PROTECT,
        related_name="sale_items"
    )

    quantity = models.PositiveIntegerField(default=1)

    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def profit(self):
        return (self.unit_price - self.unit_cost) * self.quantity

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    class Meta:
        ordering = ["-created_at"]


class Expense(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="expenses"
    )

    title = models.CharField(max_length=150)
    category = models.CharField(max_length=100, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.TextField(blank=True, null=True)

    expense_date = models.DateField(
        default=timezone.localdate,
        db_index=True,
        help_text="Accounting date used for daily reports, monthly reports, and closing."
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="expenses_created"
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ["-expense_date", "-created_at"]


class DiscoReservation(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("arrived", "Arrived"),
        ("cancelled", "Cancelled"),
        ("no_show", "No Show"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="disco_reservations"
    )

    table = models.ForeignKey(
        "DiscoTable",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reservations"
    )

    customer_name = models.CharField(max_length=150)
    customer_phone = models.CharField(max_length=30, blank=True, null=True)
    people_count = models.PositiveIntegerField(default=1)

    reservation_datetime = models.DateTimeField(db_index=True)
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="pending",
        db_index=True
    )

    note = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disco_reservations_created"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.customer_name} - {self.reservation_datetime}"

    class Meta:
        ordering = ["-reservation_datetime"]


class DiscoActivityLog(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="disco_activity_logs"
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disco_activity_logs"
    )

    action = models.CharField(max_length=150)
    description = models.TextField(blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return self.action

    class Meta:
        ordering = ["-created_at"]