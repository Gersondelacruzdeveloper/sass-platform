from django.db import models
from django.conf import settings
from organisations.models import Organisation


class Category(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)
    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name


class Product(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True)

    name = models.CharField(max_length=150)
    barcode = models.CharField(max_length=100, blank=True, null=True)

    cost_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sale_price = models.DecimalField(max_digits=10, decimal_places=2)

    stock = models.PositiveIntegerField(default=0)
    minimum_stock = models.PositiveIntegerField(default=5)

    is_active = models.BooleanField(default=True)

    def profit_per_unit(self):
        return self.sale_price - self.cost_price

    def __str__(self):
        return self.name


class StockMovement(models.Model):
    MOVEMENT_CHOICES = (
        ("in", "Entrada"),
        ("out", "Salida"),
        ("adjustment", "Ajuste"),
        ("loss", "Pérdida"),
    )

    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)
    product = models.ForeignKey(Product, on_delete=models.CASCADE)

    movement_type = models.CharField(max_length=20, choices=MOVEMENT_CHOICES)
    quantity = models.PositiveIntegerField()
    note = models.TextField(blank=True, null=True)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class Sale(models.Model):
    PAYMENT_CHOICES = (
        ("cash", "Efectivo"),
        ("card", "Tarjeta"),
        ("transfer", "Transferencia"),
        ("credit", "Crédito"),
    )

    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)

    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default="cash")
    subtotal = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    tax = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)

    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    def profit(self):
        return (self.unit_price - self.unit_cost) * self.quantity


class Expense(models.Model):
    organisation = models.ForeignKey(Organisation, on_delete=models.CASCADE)

    title = models.CharField(max_length=150)
    category = models.CharField(max_length=100, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2)

    note = models.TextField(blank=True, null=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title