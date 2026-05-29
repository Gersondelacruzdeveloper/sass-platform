from django.db import models
from django.conf import settings
from organisations.models import Organisation
from django.utils import timezone


class Category(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="categories"
    )

    name = models.CharField(
        max_length=100
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = ("organisation", "name")


class Product(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="products"
    )

    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products"
    )

    name = models.CharField(
        max_length=150
    )

    barcode = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        unique=True
    )

    sku = models.CharField(
        max_length=100,
        blank=True,
        null=True,
        unique=True
    )

    image = models.ImageField(
        upload_to="products/",
        blank=True,
        null=True
    )

    cost_price = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    sale_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    stock = models.PositiveIntegerField(
        default=0
    )

    minimum_stock = models.PositiveIntegerField(
        default=5
    )

    is_active = models.BooleanField(
        default=True,
        db_index=True
    )

    created_at = models.DateTimeField(
        auto_now_add=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

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
        Product,
        on_delete=models.CASCADE,
        related_name="stock_movements"
    )

    movement_type = models.CharField(
        max_length=20,
        choices=MOVEMENT_CHOICES,
        db_index=True
    )

    quantity = models.PositiveIntegerField()

    note = models.TextField(
        blank=True,
        null=True
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="stock_movements_created"
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

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
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="sales"
    )

    receipt_number = models.CharField(
        max_length=50,
        unique=True,
        blank=True,
        null=True
    )

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
        max_length=20,
        choices=SALE_TYPE_CHOICES,
        default="pos"
    )

    customer_name = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )

    table_number = models.CharField(
        max_length=20,
        blank=True,
        null=True
    )

    subtotal = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    discount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    tax = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    total = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="sales_created"
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return f"Sale #{self.id}"

    class Meta:
        ordering = ["-created_at"]

class SaleItem(models.Model):
    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items"
    )

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name="sale_items"
    )

    quantity = models.PositiveIntegerField(default=1)

    unit_price = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    unit_cost = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    total = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    def profit(self):
        return (
            self.unit_price - self.unit_cost
        ) * self.quantity

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

    title = models.CharField(
        max_length=150
    )

    category = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )

    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2
    )

    note = models.TextField(
        blank=True,
        null=True
    )

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="expenses_created"
    )

    created_at = models.DateTimeField(
        auto_now_add=True,
        db_index=True
    )

    updated_at = models.DateTimeField(
        auto_now=True
    )

    def __str__(self):
        return self.title

    class Meta:
        ordering = ["-created_at"]