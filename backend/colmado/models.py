import uuid
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from organisations.models import Organisation


class Store(models.Model):
    """One physical colmado belonging to a tenant organisation."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_stores",
    )
    name = models.CharField(max_length=120)
    address = models.CharField(max_length=255, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("organisation", "name"),
                name="unique_colmado_store_name_per_organisation",
            )
        ]

    def __str__(self):
        return f"{self.name} - {self.organisation.name}"


class MasterProduct(models.Model):
    """
    Product identity shared by every colmado on the platform.

    Prices and stock do not belong here because each colmado can buy and sell
    the same product at different prices.
    """

    UNIT = "unit"
    POUND = "lb"
    KILOGRAM = "kg"
    LITER = "liter"
    PORTION = "portion"

    UNIT_CHOICES = (
        (UNIT, "Unidad"),
        (POUND, "Libra"),
        (KILOGRAM, "Kilogramo"),
        (LITER, "Litro"),
        (PORTION, "Porción"),
    )

    BY_UNIT = "unit"
    BY_WEIGHT = "weight"
    BY_AMOUNT = "amount"

    SALE_MODE_CHOICES = (
        (BY_UNIT, "Por unidad"),
        (BY_WEIGHT, "Por peso"),
        (BY_AMOUNT, "Por valor en pesos"),
    )

    internal_reference = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )
    barcode = models.CharField(
        max_length=64,
        unique=True,
        null=True,
        blank=True,
        db_index=True,
        help_text="GTIN/EAN/UPC del empaque. Vacío para productos sueltos.",
    )
    name = models.CharField(max_length=180, db_index=True)
    brand = models.CharField(max_length=100, blank=True)
    presentation = models.CharField(
        max_length=100,
        blank=True,
        help_text="Ejemplo: 12 oz, 2 litros, funda de 1 libra.",
    )
    category = models.CharField(max_length=100, blank=True, db_index=True)
    unit = models.CharField(
        max_length=20,
        choices=UNIT_CHOICES,
        default=UNIT,
    )
    sale_mode = models.CharField(
        max_length=20,
        choices=SALE_MODE_CHOICES,
        default=BY_UNIT,
    )
    units_per_case = models.PositiveIntegerField(
        default=1,
        help_text="Cantidad de unidades que entran en una caja o paquete de compra.",
    )
    image = models.ImageField(
        upload_to="colmado/products/",
        blank=True,
        null=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name", "presentation")
        indexes = [
            models.Index(fields=("name", "brand")),
        ]

    def clean(self):
        super().clean()

        if self.barcode:
            self.barcode = self.barcode.strip()
        else:
            self.barcode = None

        self.name = self.name.strip()
        self.brand = self.brand.strip()
        self.presentation = self.presentation.strip()
        self.category = self.category.strip()

        if not self.name:
            raise ValidationError({"name": "El nombre del producto es obligatorio."})

        if self.units_per_case < 1:
            raise ValidationError(
                {"units_per_case": "La caja debe contener al menos una unidad."}
            )

    def __str__(self):
        details = " ".join(
            value for value in (self.brand, self.name, self.presentation) if value
        )
        return details or self.name


class InventoryItem(models.Model):
    """A master product activated inside one physical colmado."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_inventory_items",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.CASCADE,
        related_name="inventory_items",
    )
    master_product = models.ForeignKey(
        MasterProduct,
        on_delete=models.PROTECT,
        related_name="inventory_items",
    )
    cost_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    sale_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=(MinValueValidator(Decimal("0.000")),),
    )
    reorder_level = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=(MinValueValidator(Decimal("0.000")),),
    )
    is_quick_sale = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Muestra el producto como botón grande en la pantalla de venta.",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("master_product__name",)
        constraints = [
            models.UniqueConstraint(
                fields=("store", "master_product"),
                name="unique_master_product_per_colmado_store",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gte=0),
                name="colmado_inventory_quantity_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(reorder_level__gte=0),
                name="colmado_reorder_level_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(cost_price__gte=0),
                name="colmado_cost_price_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(sale_price__gt=0),
                name="colmado_sale_price_positive",
            ),
        ]

    def clean(self):
        super().clean()

        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

    @property
    def is_low_stock(self):
        return self.quantity <= self.reorder_level

    @property
    def stock_value(self):
        return self.quantity * self.cost_price

    @property
    def profit_per_unit(self):
        return self.sale_price - self.cost_price

    def units_from_cases(self, cases):
        """Convert received cases into the stock unit used by the POS."""

        return Decimal(str(cases)) * self.master_product.units_per_case

    def quantity_from_amount(self, amount):
        """Convert RD$ requested by a customer into a fractional quantity."""

        amount = Decimal(str(amount))
        if amount <= 0:
            raise ValidationError("El monto debe ser mayor que cero.")
        return amount / self.sale_price

    def __str__(self):
        return f"{self.master_product} - {self.store.name}"


class Customer(models.Model):
    """A regular customer who can optionally buy on credit (fiado)."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_customers",
    )
    name = models.CharField(max_length=180, db_index=True)
    phone = models.CharField(max_length=30, blank=True, db_index=True)
    address = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    credit_limit = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
        help_text="Cero significa que no hay un límite configurado.",
    )
    balance = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("organisation", "phone"),
                condition=~models.Q(phone=""),
                name="unique_colmado_customer_phone_per_organisation",
            ),
            models.CheckConstraint(
                condition=models.Q(credit_limit__gte=0),
                name="colmado_customer_credit_limit_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(balance__gte=0),
                name="colmado_customer_balance_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        self.name = self.name.strip()
        self.phone = self.phone.strip()
        self.address = self.address.strip()

        if not self.name:
            raise ValidationError({"name": "El nombre del cliente es obligatorio."})

    @property
    def available_credit(self):
        if self.credit_limit == 0:
            return None
        return max(self.credit_limit - self.balance, Decimal("0.00"))

    def __str__(self):
        return self.name


class CashRegisterSession(models.Model):
    """A simple opening and closing record for one store cash register."""

    OPEN = "open"
    CLOSED = "closed"

    STATUS_CHOICES = (
        (OPEN, "Abierta"),
        (CLOSED, "Cerrada"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_cash_register_sessions",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="cash_register_sessions",
    )
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_cash_register_sessions_opened",
    )
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_cash_register_sessions_closed",
        null=True,
        blank=True,
    )
    session_number = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=OPEN,
        db_index=True,
    )
    opening_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    cash_sales = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
        help_text="Total de ventas en efectivo guardado al cerrar la caja.",
    )
    expected_cash = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
        help_text="Fondo inicial más ventas en efectivo al cerrar la caja.",
    )
    counted_cash = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    difference = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Efectivo contado menos efectivo esperado.",
    )
    note = models.CharField(max_length=255, blank=True)
    opened_at = models.DateTimeField(auto_now_add=True, db_index=True)
    closed_at = models.DateTimeField(null=True, blank=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-opened_at",)
        indexes = [
            models.Index(fields=("organisation", "store", "opened_at")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("store",),
                condition=models.Q(status="open"),
                name="unique_open_cash_register_per_store",
            ),
            models.CheckConstraint(
                condition=models.Q(opening_amount__gte=0),
                name="colmado_cash_opening_amount_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(cash_sales__gte=0),
                name="colmado_cash_sales_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(expected_cash__gte=0),
                name="colmado_cash_expected_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(counted_cash__isnull=True)
                    | models.Q(counted_cash__gte=0)
                ),
                name="colmado_cash_counted_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()

        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

        if self.status == self.OPEN:
            if self.closed_by_id or self.closed_at or self.counted_cash is not None:
                raise ValidationError(
                    {"status": "Una caja abierta no puede tener datos de cierre."}
                )
        elif self.status == self.CLOSED:
            if self.closed_by_id is None or self.closed_at is None:
                raise ValidationError(
                    {"status": "La caja cerrada necesita usuario y fecha de cierre."}
                )
            if self.counted_cash is None or self.difference is None:
                raise ValidationError(
                    {"status": "Debe guardar el efectivo contado y la diferencia."}
                )

    def __str__(self):
        return f"Caja {self.store.name} - {self.get_status_display()}"


class Sale(models.Model):
    """A completed POS sale in one physical colmado."""

    CASH = "cash"
    CARD = "card"
    TRANSFER = "transfer"
    CREDIT = "credit"

    PAYMENT_METHOD_CHOICES = (
        (CASH, "Efectivo"),
        (CARD, "Tarjeta"),
        (TRANSFER, "Transferencia"),
        (CREDIT, "Fiado"),
    )

    COMPLETED = "completed"
    VOIDED = "voided"

    STATUS_CHOICES = (
        (COMPLETED, "Completada"),
        (VOIDED, "Anulada"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_sales",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="sales",
    )
    cashier = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_sales",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="sales",
        null=True,
        blank=True,
    )
    cash_register_session = models.ForeignKey(
        CashRegisterSession,
        on_delete=models.PROTECT,
        related_name="sales",
        null=True,
        blank=True,
    )
    receipt_number = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        editable=False,
    )
    payment_method = models.CharField(
        max_length=20,
        choices=PAYMENT_METHOD_CHOICES,
        default=CASH,
    )
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    discount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    amount_received = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    change_due = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=COMPLETED,
        db_index=True,
    )
    credit_due_date = models.DateField(null=True, blank=True, db_index=True)
    voided_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("organisation", "store", "created_at")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(subtotal__gte=0),
                name="colmado_sale_subtotal_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(discount__gte=0),
                name="colmado_sale_discount_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(total__gte=0),
                name="colmado_sale_total_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(amount_received__gte=0),
                name="colmado_sale_amount_received_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(change_due__gte=0),
                name="colmado_sale_change_due_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()

        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

        if self.discount > self.subtotal:
            raise ValidationError(
                {"discount": "El descuento no puede superar el subtotal."}
            )

        if self.payment_method == self.CREDIT and self.customer_id is None:
            raise ValidationError(
                {"customer": "Seleccione el cliente que llevará la compra fiada."}
            )

        if self.customer_id and self.customer.organisation_id != self.organisation_id:
            raise ValidationError(
                {"customer": "El cliente no pertenece a esta organización."}
            )

        if self.cash_register_session_id:
            if self.cash_register_session.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"cash_register_session": "La caja pertenece a otro negocio."}
                )
            if self.cash_register_session.store_id != self.store_id:
                raise ValidationError(
                    {"cash_register_session": "La caja pertenece a otra sucursal."}
                )

    @property
    def profit(self):
        return sum((item.profit for item in self.items.all()), Decimal("0.00"))

    def __str__(self):
        return f"Venta {self.receipt_number} - {self.store.name}"


class SaleItem(models.Model):
    """A sold product with price and cost snapshots for reliable reports."""

    sale = models.ForeignKey(
        Sale,
        on_delete=models.CASCADE,
        related_name="items",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="sale_items",
    )
    product_name = models.CharField(max_length=255)
    barcode = models.CharField(max_length=64, blank=True)
    unit = models.CharField(max_length=20)
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=(MinValueValidator(Decimal("0.001")),),
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    unit_cost = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    line_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )

    class Meta:
        ordering = ("id",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="colmado_sale_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_price__gt=0),
                name="colmado_sale_item_price_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0),
                name="colmado_sale_item_cost_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(line_total__gt=0),
                name="colmado_sale_item_total_positive",
            ),
        ]

    def clean(self):
        super().clean()

        if self.sale_id and self.inventory_item_id:
            if self.inventory_item.organisation_id != self.sale.organisation_id:
                raise ValidationError(
                    {"inventory_item": "El producto no pertenece a este negocio."}
                )
            if self.inventory_item.store_id != self.sale.store_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otra sucursal."}
                )

    @property
    def profit(self):
        return self.line_total - (self.unit_cost * self.quantity)

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"


class CreditTransaction(models.Model):
    """Immutable customer ledger entry for fiado charges and payments."""

    CHARGE = "charge"
    PAYMENT = "payment"

    TRANSACTION_TYPE_CHOICES = (
        (CHARGE, "Compra fiada"),
        (PAYMENT, "Abono"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_credit_transactions",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="credit_transactions",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="credit_transactions",
    )
    sale = models.OneToOneField(
        Sale,
        on_delete=models.PROTECT,
        related_name="credit_transaction",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_credit_transactions",
    )
    transaction_type = models.CharField(
        max_length=20,
        choices=TRANSACTION_TYPE_CHOICES,
        db_index=True,
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    balance_after = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("organisation", "customer", "created_at")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="colmado_credit_transaction_amount_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(balance_after__gte=0),
                name="colmado_credit_balance_after_nonnegative",
            ),
            models.CheckConstraint(
                condition=(
                    models.Q(transaction_type="charge", sale__isnull=False)
                    | models.Q(transaction_type="payment", sale__isnull=True)
                ),
                name="colmado_credit_sale_matches_transaction_type",
            ),
        ]

    def clean(self):
        super().clean()

        if self.customer_id and self.organisation_id:
            if self.customer.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"customer": "El cliente no pertenece a esta organización."}
                )

        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

        if self.sale_id:
            if self.sale.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"sale": "La venta no pertenece a esta organización."}
                )
            if self.sale.customer_id != self.customer_id:
                raise ValidationError(
                    {"sale": "La venta pertenece a otro cliente."}
                )

    def __str__(self):
        return f"{self.get_transaction_type_display()} - {self.customer.name}"


class Employee(models.Model):
    """A simple employee record assigned to one physical colmado."""

    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"

    PAY_FREQUENCY_CHOICES = (
        (DAILY, "Diario"),
        (WEEKLY, "Semanal"),
        (BIWEEKLY, "Quincenal"),
        (MONTHLY, "Mensual"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_employees",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="employees",
    )
    name = models.CharField(max_length=180, db_index=True)
    phone = models.CharField(max_length=30, blank=True)
    position = models.CharField(max_length=120, blank=True)
    pay_frequency = models.CharField(
        max_length=20,
        choices=PAY_FREQUENCY_CHOICES,
        default=MONTHLY,
    )
    pay_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    start_date = models.DateField(default=timezone.localdate)
    end_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(pay_amount__gt=0),
                name="colmado_employee_pay_amount_positive",
            ),
        ]

    def clean(self):
        super().clean()
        self.name = self.name.strip()
        self.phone = self.phone.strip()
        self.position = self.position.strip()

        if not self.name:
            raise ValidationError({"name": "El nombre del empleado es obligatorio."})
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )
        if self.end_date and self.end_date < self.start_date:
            raise ValidationError(
                {"end_date": "La fecha final no puede ser anterior al inicio."}
            )

    def __str__(self):
        return f"{self.name} - {self.store.name}"


class PayrollPayment(models.Model):
    """An actual salary payment used by the profitability report."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_payroll_payments",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="payroll_payments",
    )
    employee = models.ForeignKey(
        Employee,
        on_delete=models.PROTECT,
        related_name="payroll_payments",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_payroll_payments_created",
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    period_start = models.DateField()
    period_end = models.DateField()
    paid_on = models.DateField(default=timezone.localdate, db_index=True)
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-paid_on", "-created_at")
        indexes = [
            models.Index(fields=("organisation", "store", "paid_on")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="colmado_payroll_payment_amount_positive",
            ),
        ]

    def clean(self):
        super().clean()
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )
        if self.employee_id:
            if self.employee.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"employee": "El empleado no pertenece a esta organización."}
                )
            if self.employee.store_id != self.store_id:
                raise ValidationError(
                    {"employee": "El empleado pertenece a otra sucursal."}
                )
        if self.period_end < self.period_start:
            raise ValidationError(
                {"period_end": "El período final no puede ser anterior al inicio."}
            )

    def __str__(self):
        return f"Pago {self.employee.name} - {self.paid_on}"


class Expense(models.Model):
    """A simple operating expense belonging to one physical colmado."""

    RENT = "rent"
    ELECTRICITY = "electricity"
    WATER = "water"
    INTERNET = "internet"
    TRANSPORT = "transport"
    MAINTENANCE = "maintenance"
    TAX = "tax"
    OTHER = "other"

    CATEGORY_CHOICES = (
        (RENT, "Alquiler"),
        (ELECTRICITY, "Luz"),
        (WATER, "Agua"),
        (INTERNET, "Internet y teléfono"),
        (TRANSPORT, "Transporte"),
        (MAINTENANCE, "Mantenimiento"),
        (TAX, "Impuestos"),
        (OTHER, "Otro"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_expenses",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="expenses",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_expenses_created",
    )
    category = models.CharField(
        max_length=30,
        choices=CATEGORY_CHOICES,
        default=OTHER,
        db_index=True,
    )
    description = models.CharField(max_length=255)
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    expense_date = models.DateField(default=timezone.localdate, db_index=True)
    receipt_image = models.ImageField(
        upload_to="colmado/expense-receipts/",
        blank=True,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-expense_date", "-created_at")
        indexes = [
            models.Index(fields=("organisation", "store", "expense_date")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name="colmado_expense_amount_positive",
            ),
        ]

    def clean(self):
        super().clean()
        self.description = self.description.strip()
        if not self.description:
            raise ValidationError(
                {"description": "La descripción del gasto es obligatoria."}
            )
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

    def __str__(self):
        return f"{self.get_category_display()} - RD${self.amount}"


class Supplier(models.Model):
    """A supplier belonging to one tenant organisation."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_suppliers",
    )
    name = models.CharField(max_length=180, db_index=True)
    contact_name = models.CharField(max_length=180, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    whatsapp = models.CharField(max_length=30, blank=True)
    email = models.EmailField(blank=True)
    address = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=("organisation", "name"),
                name="unique_colmado_supplier_name_per_organisation",
            ),
        ]

    def clean(self):
        super().clean()
        self.name = self.name.strip()
        self.contact_name = self.contact_name.strip()
        self.phone = self.phone.strip()
        self.whatsapp = self.whatsapp.strip()
        self.email = self.email.strip()
        self.address = self.address.strip()
        if not self.name:
            raise ValidationError({"name": "El nombre del suplidor es obligatorio."})

    def __str__(self):
        return self.name


class SupplierProduct(models.Model):
    """A master product offered by a supplier at its latest known cost."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_supplier_products",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name="products",
    )
    master_product = models.ForeignKey(
        MasterProduct,
        on_delete=models.PROTECT,
        related_name="supplier_products",
    )
    supplier_sku = models.CharField(max_length=100, blank=True)
    units_per_case = models.PositiveIntegerField(default=1)
    case_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    is_preferred = models.BooleanField(default=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("master_product__name",)
        constraints = [
            models.UniqueConstraint(
                fields=("supplier", "master_product"),
                name="unique_product_per_colmado_supplier",
            ),
            models.CheckConstraint(
                condition=models.Q(units_per_case__gt=0),
                name="colmado_supplier_product_units_per_case_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(case_cost__gt=0),
                name="colmado_supplier_product_case_cost_positive",
            ),
        ]

    def clean(self):
        super().clean()
        if self.supplier_id and self.organisation_id:
            if self.supplier.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"supplier": "El suplidor no pertenece a esta organización."}
                )

    @property
    def unit_cost(self):
        return self.case_cost / self.units_per_case

    def __str__(self):
        return f"{self.supplier.name} - {self.master_product}"


class PurchaseOrder(models.Model):
    """A simple restocking order that can only be received once."""

    DRAFT = "draft"
    ORDERED = "ordered"
    RECEIVED = "received"
    CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (DRAFT, "Borrador"),
        (ORDERED, "Pedida"),
        (RECEIVED, "Recibida"),
        (CANCELLED, "Cancelada"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_purchase_orders",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="purchase_orders",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_purchase_orders_created",
    )
    order_number = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=DRAFT,
        db_index=True,
    )
    total_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    note = models.CharField(max_length=255, blank=True)
    ordered_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("organisation", "store", "status")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_cost__gte=0),
                name="colmado_purchase_order_total_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )
        if self.supplier_id and self.organisation_id:
            if self.supplier.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"supplier": "El suplidor no pertenece a esta organización."}
                )

    def __str__(self):
        return f"Orden {self.order_number} - {self.supplier.name}"


class PurchaseOrderItem(models.Model):
    """A cost snapshot for one inventory item in a restocking order."""

    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="purchase_order_items",
    )
    product_name = models.CharField(max_length=255)
    cases = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    units_per_case = models.PositiveIntegerField()
    case_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    line_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    received_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        default=Decimal("0.000"),
        validators=(MinValueValidator(Decimal("0.000")),),
    )

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=("purchase_order", "inventory_item"),
                name="unique_inventory_item_per_purchase_order",
            ),
            models.CheckConstraint(
                condition=models.Q(cases__gt=0),
                name="colmado_purchase_order_item_cases_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(units_per_case__gt=0),
                name="colmado_purchase_order_item_units_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(case_cost__gt=0),
                name="colmado_purchase_order_item_case_cost_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(line_total__gt=0),
                name="colmado_purchase_order_item_total_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(received_quantity__gte=0),
                name="colmado_purchase_received_quantity_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        if self.purchase_order_id and self.inventory_item_id:
            if (
                self.inventory_item.organisation_id
                != self.purchase_order.organisation_id
            ):
                raise ValidationError(
                    {"inventory_item": "El producto no pertenece a esta organización."}
                )
            if self.inventory_item.store_id != self.purchase_order.store_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otra sucursal."}
                )

    @property
    def ordered_quantity(self):
        return Decimal(str(self.cases)) * self.units_per_case

    def __str__(self):
        return f"{self.product_name} - {self.cases} cajas"


class InventoryMovement(models.Model):
    """An immutable record explaining why inventory increased or decreased."""

    PURCHASE = "purchase"
    ADJUSTMENT = "adjustment"
    CUSTOMER_ORDER = "customer_order"
    CUSTOMER_ORDER_CANCELLED = "customer_order_cancelled"
    INVENTORY_COUNT = "inventory_count"
    DAMAGED = "damaged"
    EXPIRED = "expired"
    LOSS = "loss"
    PERSONAL_USE = "personal_use"
    CORRECTION = "correction"

    MOVEMENT_TYPE_CHOICES = (
        (PURCHASE, "Compra recibida"),
        (ADJUSTMENT, "Ajuste manual"),
        (CUSTOMER_ORDER, "Pedido de cliente"),
        (CUSTOMER_ORDER_CANCELLED, "Pedido de cliente cancelado"),
        (INVENTORY_COUNT, "Conteo físico"),
        (DAMAGED, "Producto dañado"),
        (EXPIRED, "Producto vencido"),
        (LOSS, "Pérdida o faltante"),
        (PERSONAL_USE, "Consumo interno"),
        (CORRECTION, "Corrección manual"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_inventory_movements",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="inventory_movements",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="movements",
    )
    purchase_order = models.ForeignKey(
        PurchaseOrder,
        on_delete=models.PROTECT,
        related_name="inventory_movements",
        null=True,
        blank=True,
    )
    inventory_count = models.ForeignKey(
        "InventoryCountSession",
        on_delete=models.PROTECT,
        related_name="inventory_movements",
        null=True,
        blank=True,
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_inventory_movements_created",
    )
    movement_type = models.CharField(
        max_length=30,
        choices=MOVEMENT_TYPE_CHOICES,
        db_index=True,
    )
    quantity_change = models.DecimalField(max_digits=14, decimal_places=3)
    quantity_after = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=(MinValueValidator(Decimal("0.000")),),
    )
    unit_cost = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    note = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("-created_at", "-id")
        indexes = [
            models.Index(fields=("organisation", "store", "created_at")),
        ]
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(quantity_change=0),
                name="colmado_inventory_movement_quantity_nonzero",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_after__gte=0),
                name="colmado_inventory_movement_after_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_cost__gte=0),
                name="colmado_inventory_movement_cost_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        if self.inventory_item_id and self.organisation_id:
            if self.inventory_item.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"inventory_item": "El producto no pertenece a esta organización."}
                )
            if self.inventory_item.store_id != self.store_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otra sucursal."}
                )
        if self.inventory_count_id and self.organisation_id:
            if self.inventory_count.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"inventory_count": "El conteo pertenece a otro negocio."}
                )
            if self.inventory_count.store_id != self.store_id:
                raise ValidationError(
                    {"inventory_count": "El conteo pertenece a otra sucursal."}
                )

    def __str__(self):
        return f"{self.inventory_item} ({self.quantity_change})"


class Storefront(models.Model):
    """Public ordering configuration for one physical colmado."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_storefronts",
    )
    store = models.OneToOneField(
        Store,
        on_delete=models.CASCADE,
        related_name="storefront",
    )
    slug = models.SlugField(max_length=160, unique=True)
    display_name = models.CharField(max_length=180)
    description = models.CharField(max_length=255, blank=True)
    public_phone = models.CharField(max_length=30, blank=True)
    public_address = models.CharField(max_length=255, blank=True)
    delivery_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    minimum_order = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    is_accepting_orders = models.BooleanField(default=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("display_name",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(delivery_fee__gte=0),
                name="colmado_storefront_delivery_fee_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(minimum_order__gte=0),
                name="colmado_storefront_minimum_order_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        self.display_name = self.display_name.strip()
        self.public_phone = self.public_phone.strip()
        self.public_address = self.public_address.strip()
        if not self.display_name:
            raise ValidationError(
                {"display_name": "El nombre público del colmado es obligatorio."}
            )
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

    def __str__(self):
        return self.display_name


class CustomerOrder(models.Model):
    """A delivery order created from the public customer storefront."""

    NEW = "new"
    PREPARING = "preparing"
    READY = "ready"
    ON_THE_WAY = "on_the_way"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (NEW, "Nuevo"),
        (PREPARING, "Preparando"),
        (READY, "Listo"),
        (ON_THE_WAY, "En camino"),
        (DELIVERED, "Entregado"),
        (CANCELLED, "Cancelado"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_customer_orders",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="customer_orders",
    )
    storefront = models.ForeignKey(
        Storefront,
        on_delete=models.PROTECT,
        related_name="orders",
    )
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name="delivery_orders",
        null=True,
        blank=True,
    )
    order_number = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    idempotency_key = models.CharField(max_length=100)
    customer_name = models.CharField(max_length=180)
    customer_phone = models.CharField(max_length=30)
    delivery_address = models.CharField(max_length=255)
    latitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=(
            MinValueValidator(Decimal("-90")),
            MaxValueValidator(Decimal("90")),
        ),
    )
    longitude = models.DecimalField(
        max_digits=9,
        decimal_places=6,
        null=True,
        blank=True,
        validators=(
            MinValueValidator(Decimal("-180")),
            MaxValueValidator(Decimal("180")),
        ),
    )
    delivery_notes = models.CharField(max_length=255, blank=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=NEW,
        db_index=True,
    )
    subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    delivery_fee = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )
    total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    inventory_committed = models.BooleanField(default=False, db_index=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    ready_at = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("organisation", "store", "status")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("storefront", "idempotency_key"),
                name="unique_customer_order_idempotency_per_storefront",
            ),
            models.CheckConstraint(
                condition=models.Q(subtotal__gt=0),
                name="colmado_customer_order_subtotal_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(delivery_fee__gte=0),
                name="colmado_customer_order_delivery_fee_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(total__gt=0),
                name="colmado_customer_order_total_positive",
            ),
        ]

    def clean(self):
        super().clean()
        self.customer_name = self.customer_name.strip()
        self.customer_phone = self.customer_phone.strip()
        self.delivery_address = self.delivery_address.strip()
        self.delivery_notes = self.delivery_notes.strip()
        if self.storefront_id:
            if self.storefront.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"storefront": "La tienda pública pertenece a otro negocio."}
                )
            if self.storefront.store_id != self.store_id:
                raise ValidationError(
                    {"storefront": "La tienda pública pertenece a otra sucursal."}
                )
        if (self.latitude is None) != (self.longitude is None):
            raise ValidationError(
                {"latitude": "Envíe la latitud y longitud juntas."}
            )

    def __str__(self):
        return f"Pedido {self.order_number} - {self.customer_name}"


class CustomerOrderItem(models.Model):
    """Product and price snapshot belonging to a public customer order."""

    order = models.ForeignKey(
        CustomerOrder,
        on_delete=models.CASCADE,
        related_name="items",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="customer_order_items",
    )
    product_name = models.CharField(max_length=255)
    barcode = models.CharField(max_length=64, blank=True)
    unit = models.CharField(max_length=20)
    quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=(MinValueValidator(Decimal("0.001")),),
    )
    unit_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )
    line_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
    )

    class Meta:
        ordering = ("id",)
        constraints = [
            models.UniqueConstraint(
                fields=("order", "inventory_item"),
                name="unique_inventory_item_per_customer_order",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity__gt=0),
                name="colmado_customer_order_item_quantity_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(unit_price__gt=0),
                name="colmado_customer_order_item_price_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(line_total__gt=0),
                name="colmado_customer_order_item_total_positive",
            ),
        ]

    def clean(self):
        super().clean()
        if self.order_id and self.inventory_item_id:
            if self.inventory_item.organisation_id != self.order.organisation_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otro negocio."}
                )
            if self.inventory_item.store_id != self.order.store_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otra sucursal."}
                )

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"


class InventoryCountSession(models.Model):
    """A simple physical count for one store, completed only once."""

    OPEN = "open"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

    STATUS_CHOICES = (
        (OPEN, "Abierto"),
        (COMPLETED, "Completado"),
        (CANCELLED, "Cancelado"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="colmado_inventory_counts",
    )
    store = models.ForeignKey(
        Store,
        on_delete=models.PROTECT,
        related_name="inventory_counts",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_inventory_counts_created",
    )
    count_number = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=OPEN,
        db_index=True,
    )
    note = models.CharField(max_length=255, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        indexes = [
            models.Index(fields=("organisation", "store", "status")),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=("store",),
                condition=models.Q(status="open"),
                name="unique_open_inventory_count_per_store",
            ),
        ]

    def clean(self):
        super().clean()
        self.note = self.note.strip()
        if self.store_id and self.organisation_id:
            if self.store.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"store": "La sucursal no pertenece a esta organización."}
                )

    def __str__(self):
        return f"Conteo {self.count_number} - {self.store.name}"


class InventoryCountItem(models.Model):
    """Expected and physically counted quantity for one inventory product."""

    REGULAR_COUNT = "regular_count"
    DAMAGED = "damaged"
    EXPIRED = "expired"
    LOSS = "loss"
    PERSONAL_USE = "personal_use"
    OTHER = "other"

    REASON_CHOICES = (
        (REGULAR_COUNT, "Conteo regular"),
        (DAMAGED, "Producto dañado"),
        (EXPIRED, "Producto vencido"),
        (LOSS, "Pérdida o faltante"),
        (PERSONAL_USE, "Consumo interno"),
        (OTHER, "Otro"),
    )

    inventory_count = models.ForeignKey(
        InventoryCountSession,
        on_delete=models.CASCADE,
        related_name="items",
    )
    inventory_item = models.ForeignKey(
        InventoryItem,
        on_delete=models.PROTECT,
        related_name="inventory_count_items",
    )
    counted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_inventory_items_counted",
    )
    expected_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=(MinValueValidator(Decimal("0.000")),),
    )
    counted_quantity = models.DecimalField(
        max_digits=14,
        decimal_places=3,
        validators=(MinValueValidator(Decimal("0.000")),),
    )
    reason = models.CharField(
        max_length=30,
        choices=REASON_CHOICES,
        default=REGULAR_COUNT,
    )
    note = models.CharField(max_length=255, blank=True)
    counted_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("inventory_item__master_product__name",)
        constraints = [
            models.UniqueConstraint(
                fields=("inventory_count", "inventory_item"),
                name="unique_item_per_inventory_count",
            ),
            models.CheckConstraint(
                condition=models.Q(expected_quantity__gte=0),
                name="colmado_inventory_count_expected_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(counted_quantity__gte=0),
                name="colmado_inventory_count_counted_nonnegative",
            ),
        ]

    def clean(self):
        super().clean()
        self.note = self.note.strip()
        if self.inventory_count_id and self.inventory_item_id:
            if (
                self.inventory_item.organisation_id
                != self.inventory_count.organisation_id
            ):
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otro negocio."}
                )
            if self.inventory_item.store_id != self.inventory_count.store_id:
                raise ValidationError(
                    {"inventory_item": "El producto pertenece a otra sucursal."}
                )

    @property
    def difference(self):
        return self.counted_quantity - self.expected_quantity

    def __str__(self):
        return f"{self.inventory_item} contado: {self.counted_quantity}"


class CatalogImport(models.Model):
    """Audit record for one platform-admin master catalog import."""

    CSV = "csv"
    XLSX = "xlsx"

    FILE_FORMAT_CHOICES = (
        (CSV, "CSV"),
        (XLSX, "Excel (.xlsx)"),
    )

    PENDING = "pending"
    COMPLETED = "completed"
    FAILED = "failed"

    STATUS_CHOICES = (
        (PENDING, "Pendiente"),
        (COMPLETED, "Completada"),
        (FAILED, "Fallida"),
    )

    import_number = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="colmado_catalog_imports",
    )
    source_file = models.FileField(upload_to="colmado/catalog-imports/%Y/%m/")
    original_filename = models.CharField(max_length=255)
    file_format = models.CharField(max_length=10, choices=FILE_FORMAT_CHOICES)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=PENDING,
        db_index=True,
    )
    total_rows = models.PositiveIntegerField(default=0)
    created_products = models.PositiveIntegerField(default=0)
    updated_products = models.PositiveIntegerField(default=0)
    unchanged_products = models.PositiveIntegerField(default=0)
    error_rows = models.PositiveIntegerField(default=0)
    errors = models.JSONField(default=list, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=models.Q(total_rows__gte=0),
                name="colmado_catalog_import_total_rows_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(created_products__gte=0),
                name="colmado_catalog_import_created_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(updated_products__gte=0),
                name="colmado_catalog_import_updated_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(unchanged_products__gte=0),
                name="colmado_catalog_import_unchanged_nonnegative",
            ),
            models.CheckConstraint(
                condition=models.Q(error_rows__gte=0),
                name="colmado_catalog_import_errors_nonnegative",
            ),
        ]

    @property
    def was_successful(self):
        return self.status == self.COMPLETED and self.error_rows == 0

    def __str__(self):
        return f"Importación {self.import_number} - {self.original_filename}"
