from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from .models import (
    CreditTransaction,
    Customer,
    InventoryItem,
    InventoryMovement,
    PurchaseOrder,
    PurchaseOrderItem,
    Sale,
    SaleItem,
    Store,
    Supplier,
    SupplierProduct,
)


MONEY = Decimal("0.01")


def _money(value):
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


def _resolve_sale_lines(*, organisation, store, lines):
    """Resolve barcode/button inputs and combine repeated scans."""

    inventory_queryset = InventoryItem.objects.filter(
        organisation=organisation,
        store=store,
        is_active=True,
        master_product__is_active=True,
    )
    quantities_by_inventory_id = defaultdict(lambda: Decimal("0.000"))

    for position, line in enumerate(lines, start=1):
        if line.get("inventory_item_id"):
            inventory_item = inventory_queryset.filter(
                id=line["inventory_item_id"],
            ).first()
            identifier = f"producto #{line['inventory_item_id']}"
        else:
            inventory_item = inventory_queryset.filter(
                master_product__barcode=line["barcode"],
            ).first()
            identifier = f"código {line['barcode']}"

        if inventory_item is None:
            raise ValidationError(
                {
                    "items": (
                        f"El artículo {position} ({identifier}) no está disponible "
                        "en esta sucursal."
                    )
                }
            )

        quantities_by_inventory_id[inventory_item.id] += line["quantity"]

    return quantities_by_inventory_id


@transaction.atomic
def create_pos_sale(*, organisation, cashier, data):
    """Create one POS sale and deduct its stock in a single transaction."""

    store = Store.objects.filter(
        id=data["store_id"],
        organisation=organisation,
        is_active=True,
    ).first()
    if store is None:
        raise ValidationError(
            {"store_id": "La sucursal no pertenece a este negocio o está inactiva."}
        )

    payment_method = data["payment_method"]
    customer = None
    if payment_method == Sale.CREDIT:
        customer = (
            Customer.objects.select_for_update()
            .filter(
                id=data["customer_id"],
                organisation=organisation,
                is_active=True,
            )
            .first()
        )
        if customer is None:
            raise ValidationError(
                {"customer_id": "El cliente no pertenece a este negocio o está inactivo."}
            )

    quantities_by_inventory_id = _resolve_sale_lines(
        organisation=organisation,
        store=store,
        lines=data["items"],
    )
    inventory_items = {
        item.id: item
        for item in (
            InventoryItem.objects.select_for_update()
            .select_related("master_product")
            .filter(
                id__in=sorted(quantities_by_inventory_id),
                organisation=organisation,
                store=store,
                is_active=True,
                master_product__is_active=True,
            )
            .order_by("id")
        )
    }

    if len(inventory_items) != len(quantities_by_inventory_id):
        raise ValidationError(
            {"items": "Uno de los productos ya no está disponible. Escanee nuevamente."}
        )

    sale_item_values = []
    subtotal = Decimal("0.00")

    for inventory_item_id in sorted(quantities_by_inventory_id):
        inventory_item = inventory_items[inventory_item_id]
        quantity = quantities_by_inventory_id[inventory_item_id]

        if inventory_item.quantity < quantity:
            raise ValidationError(
                {
                    "items": (
                        f"No hay suficiente {inventory_item.master_product.name}. "
                        f"Disponible: {inventory_item.quantity}."
                    )
                }
            )

        line_total = _money(inventory_item.sale_price * quantity)
        subtotal += line_total
        sale_item_values.append(
            {
                "inventory_item": inventory_item,
                "product_name": str(inventory_item.master_product),
                "barcode": inventory_item.master_product.barcode or "",
                "unit": inventory_item.master_product.unit,
                "quantity": quantity,
                "unit_price": inventory_item.sale_price,
                "unit_cost": inventory_item.cost_price,
                "line_total": line_total,
            }
        )

    subtotal = _money(subtotal)
    discount = _money(data.get("discount", Decimal("0.00")))
    if discount > subtotal:
        raise ValidationError(
            {"discount": "El descuento no puede superar el subtotal."}
        )

    total = _money(subtotal - discount)
    if payment_method == Sale.CASH:
        amount_received = _money(data["amount_received"])
        if amount_received < total:
            raise ValidationError(
                {
                    "amount_received": (
                        f"Faltan RD${_money(total - amount_received)} para completar la venta."
                    )
                }
            )
        change_due = _money(amount_received - total)
    elif payment_method == Sale.CREDIT:
        if total <= 0:
            raise ValidationError(
                {"discount": "Una venta fiada debe tener un total mayor que cero."}
            )
        new_balance = _money(customer.balance + total)
        if customer.credit_limit > 0 and new_balance > customer.credit_limit:
            available = _money(max(customer.credit_limit - customer.balance, 0))
            raise ValidationError(
                {
                    "customer_id": (
                        f"El cliente solo tiene RD${available} de crédito disponible."
                    )
                }
            )
        amount_received = Decimal("0.00")
        change_due = Decimal("0.00")
    else:
        amount_received = total
        change_due = Decimal("0.00")

    sale = Sale.objects.create(
        organisation=organisation,
        store=store,
        cashier=cashier,
        customer=customer,
        payment_method=payment_method,
        subtotal=subtotal,
        discount=discount,
        total=total,
        amount_received=amount_received,
        change_due=change_due,
        credit_due_date=data.get("credit_due_date"),
    )

    SaleItem.objects.bulk_create(
        SaleItem(sale=sale, **values) for values in sale_item_values
    )

    for inventory_item_id, quantity in quantities_by_inventory_id.items():
        inventory_item = inventory_items[inventory_item_id]
        inventory_item.quantity -= quantity
        inventory_item.save(update_fields=("quantity", "updated_at"))

    if payment_method == Sale.CREDIT:
        customer.balance = new_balance
        customer.save(update_fields=("balance", "updated_at"))
        CreditTransaction.objects.create(
            organisation=organisation,
            customer=customer,
            store=store,
            sale=sale,
            created_by=cashier,
            transaction_type=CreditTransaction.CHARGE,
            amount=total,
            balance_after=new_balance,
            note=f"Venta fiada {sale.receipt_number}",
        )

    return (
        Sale.objects.select_related("store", "cashier", "customer")
        .prefetch_related("items")
        .get(pk=sale.pk)
    )


@transaction.atomic
def void_pos_sale(*, sale, voided_by):
    """Void a completed sale once and return every item to inventory."""

    locked_sale = Sale.objects.select_for_update().get(pk=sale.pk)
    if locked_sale.status == Sale.VOIDED:
        raise ValidationError({"detail": "Esta venta ya fue anulada."})

    sale_items = list(locked_sale.items.order_by("inventory_item_id"))
    inventory_items = {
        item.id: item
        for item in (
            InventoryItem.objects.select_for_update()
            .filter(id__in=[line.inventory_item_id for line in sale_items])
            .order_by("id")
        )
    }

    for line in sale_items:
        inventory_item = inventory_items[line.inventory_item_id]
        inventory_item.quantity += line.quantity
        inventory_item.save(update_fields=("quantity", "updated_at"))

    if locked_sale.payment_method == Sale.CREDIT:
        customer = Customer.objects.select_for_update().get(
            pk=locked_sale.customer_id,
            organisation=locked_sale.organisation,
        )
        customer.balance = _money(max(customer.balance - locked_sale.total, 0))
        customer.save(update_fields=("balance", "updated_at"))
        CreditTransaction.objects.create(
            organisation=locked_sale.organisation,
            customer=customer,
            store=locked_sale.store,
            created_by=voided_by,
            transaction_type=CreditTransaction.PAYMENT,
            amount=locked_sale.total,
            balance_after=customer.balance,
            note=f"Anulación de venta {locked_sale.receipt_number}",
        )

    locked_sale.status = Sale.VOIDED
    locked_sale.voided_at = timezone.now()
    locked_sale.save(update_fields=("status", "voided_at", "updated_at"))

    return (
        Sale.objects.select_related("store", "cashier", "customer")
        .prefetch_related("items")
        .get(pk=locked_sale.pk)
    )


@transaction.atomic
def record_credit_payment(*, organisation, customer, created_by, data):
    """Record a partial or full payment without allowing a negative balance."""

    store = Store.objects.filter(
        id=data["store_id"],
        organisation=organisation,
        is_active=True,
    ).first()
    if store is None:
        raise ValidationError(
            {"store_id": "La sucursal no pertenece a este negocio o está inactiva."}
        )

    locked_customer = (
        Customer.objects.select_for_update()
        .filter(
            id=customer.id,
            organisation=organisation,
            is_active=True,
        )
        .first()
    )
    if locked_customer is None:
        raise ValidationError({"detail": "El cliente no está disponible."})

    amount = _money(data["amount"])
    if amount > locked_customer.balance:
        raise ValidationError(
            {
                "amount": (
                    f"El cliente debe RD${locked_customer.balance}. "
                    "El abono no puede ser mayor que la deuda."
                )
            }
        )

    locked_customer.balance = _money(locked_customer.balance - amount)
    locked_customer.save(update_fields=("balance", "updated_at"))

    transaction_entry = CreditTransaction.objects.create(
        organisation=organisation,
        customer=locked_customer,
        store=store,
        created_by=created_by,
        transaction_type=CreditTransaction.PAYMENT,
        amount=amount,
        balance_after=locked_customer.balance,
        note=data.get("note", "").strip(),
    )

    return transaction_entry, locked_customer


@transaction.atomic
def create_purchase_order(*, organisation, created_by, data):
    """Create an ordered restocking request from supplier price records."""

    store = Store.objects.filter(
        id=data["store_id"],
        organisation=organisation,
        is_active=True,
    ).first()
    if store is None:
        raise ValidationError(
            {"store_id": "La sucursal no pertenece a este negocio o está inactiva."}
        )

    supplier = Supplier.objects.filter(
        id=data["supplier_id"],
        organisation=organisation,
        is_active=True,
    ).first()
    if supplier is None:
        raise ValidationError(
            {"supplier_id": "El suplidor no pertenece a este negocio o está inactivo."}
        )

    inventory_ids = [line["inventory_item_id"] for line in data["items"]]
    inventory_items = {
        item.id: item
        for item in InventoryItem.objects.select_related("master_product").filter(
            id__in=inventory_ids,
            organisation=organisation,
            store=store,
            is_active=True,
            master_product__is_active=True,
        )
    }
    if len(inventory_items) != len(inventory_ids):
        raise ValidationError(
            {"items": "Uno de los productos no pertenece a esta sucursal."}
        )

    supplier_products = {
        item.master_product_id: item
        for item in SupplierProduct.objects.select_related("master_product").filter(
            organisation=organisation,
            supplier=supplier,
            master_product_id__in=[
                item.master_product_id for item in inventory_items.values()
            ],
            is_active=True,
        )
    }

    order_lines = []
    total_cost = Decimal("0.00")
    for line in data["items"]:
        inventory_item = inventory_items[line["inventory_item_id"]]
        supplier_product = supplier_products.get(inventory_item.master_product_id)
        if supplier_product is None:
            raise ValidationError(
                {
                    "items": (
                        f"{inventory_item.master_product.name} no está registrado "
                        "con este suplidor."
                    )
                }
            )

        cases = line["cases"]
        line_total = _money(cases * supplier_product.case_cost)
        total_cost += line_total
        order_lines.append(
            {
                "inventory_item": inventory_item,
                "product_name": str(inventory_item.master_product),
                "cases": cases,
                "units_per_case": supplier_product.units_per_case,
                "case_cost": supplier_product.case_cost,
                "line_total": line_total,
            }
        )

    order = PurchaseOrder.objects.create(
        organisation=organisation,
        store=store,
        supplier=supplier,
        created_by=created_by,
        status=PurchaseOrder.ORDERED,
        total_cost=_money(total_cost),
        note=data.get("note", "").strip(),
        ordered_at=timezone.now(),
    )
    PurchaseOrderItem.objects.bulk_create(
        PurchaseOrderItem(purchase_order=order, **line) for line in order_lines
    )
    return (
        PurchaseOrder.objects.select_related("store", "supplier", "created_by")
        .prefetch_related("items__inventory_item__master_product")
        .get(pk=order.pk)
    )


@transaction.atomic
def receive_purchase_order(*, order, received_by):
    """Receive an order once, update stock and record immutable movements."""

    locked_order = (
        PurchaseOrder.objects.select_for_update()
        .select_related("store", "supplier", "created_by")
        .get(pk=order.pk)
    )
    if locked_order.status == PurchaseOrder.RECEIVED:
        raise ValidationError({"detail": "Esta orden ya fue recibida."})
    if locked_order.status == PurchaseOrder.CANCELLED:
        raise ValidationError({"detail": "Una orden cancelada no puede recibirse."})

    order_items = list(
        locked_order.items.select_related("inventory_item__master_product").order_by(
            "inventory_item_id"
        )
    )
    if not order_items:
        raise ValidationError({"detail": "La orden no contiene productos."})

    inventory_items = {
        item.id: item
        for item in InventoryItem.objects.select_for_update()
        .filter(id__in=[line.inventory_item_id for line in order_items])
        .order_by("id")
    }
    movements = []

    for line in order_items:
        inventory_item = inventory_items[line.inventory_item_id]
        quantity_received = line.ordered_quantity
        old_quantity = inventory_item.quantity
        new_quantity = old_quantity + quantity_received
        purchase_unit_cost = line.case_cost / line.units_per_case

        if new_quantity > 0:
            weighted_cost = (
                (old_quantity * inventory_item.cost_price)
                + (quantity_received * purchase_unit_cost)
            ) / new_quantity
            inventory_item.cost_price = _money(weighted_cost)

        inventory_item.quantity = new_quantity
        inventory_item.save(
            update_fields=("quantity", "cost_price", "updated_at")
        )
        line.received_quantity = quantity_received
        line.save(update_fields=("received_quantity",))
        movements.append(
            InventoryMovement(
                organisation=locked_order.organisation,
                store=locked_order.store,
                inventory_item=inventory_item,
                purchase_order=locked_order,
                created_by=received_by,
                movement_type=InventoryMovement.PURCHASE,
                quantity_change=quantity_received,
                quantity_after=new_quantity,
                unit_cost=_money(purchase_unit_cost),
                note=f"Orden recibida {locked_order.order_number}",
            )
        )

    InventoryMovement.objects.bulk_create(movements)
    locked_order.status = PurchaseOrder.RECEIVED
    locked_order.received_at = timezone.now()
    locked_order.save(update_fields=("status", "received_at", "updated_at"))

    return (
        PurchaseOrder.objects.select_related("store", "supplier", "created_by")
        .prefetch_related("items__inventory_item__master_product")
        .get(pk=locked_order.pk)
    )


@transaction.atomic
def cancel_purchase_order(*, order):
    locked_order = PurchaseOrder.objects.select_for_update().get(pk=order.pk)
    if locked_order.status == PurchaseOrder.RECEIVED:
        raise ValidationError({"detail": "Una orden recibida no puede cancelarse."})
    if locked_order.status == PurchaseOrder.CANCELLED:
        raise ValidationError({"detail": "Esta orden ya está cancelada."})
    locked_order.status = PurchaseOrder.CANCELLED
    locked_order.save(update_fields=("status", "updated_at"))
    return (
        PurchaseOrder.objects.select_related("store", "supplier", "created_by")
        .prefetch_related("items__inventory_item__master_product")
        .get(pk=locked_order.pk)
    )
