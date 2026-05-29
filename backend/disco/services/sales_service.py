from django.db import transaction
from django.utils import timezone
from decimal import Decimal

from disco.models import (
    Sale,
    SaleItem,
    Product,
    StockMovement,
)


@transaction.atomic
def create_sale(
    *,
    organisation,
    created_by,
    payment_method,
    items,
    discount=0,
    tax=0,
    sale_type="pos",
    customer_name=None,
    table_number=None,
):

    subtotal = Decimal("0.00")

    # VALIDATE PRODUCTS + STOCK
    validated_items = []

    for item in items:

        product_id = item.get("product_id")
        quantity = int(item.get("quantity", 1))

        product = Product.objects.select_for_update().get(
            id=product_id,
            organisation=organisation
        )

        if product.stock < quantity:
            raise ValueError(
                f"Not enough stock for {product.name}"
            )

        unit_price = product.sale_price
        unit_cost = product.cost_price

        total_price = unit_price * quantity

        subtotal += total_price

        validated_items.append({
            "product": product,
            "quantity": quantity,
            "unit_price": unit_price,
            "unit_cost": unit_cost,
            "total_price": total_price,
        })

    # CALCULATE FINAL TOTAL
    final_total = subtotal - Decimal(str(discount)) + Decimal(str(tax))

    # GENERATE RECEIPT NUMBER
    timestamp = timezone.now().strftime("%Y%m%d%H%M%S")

    receipt_number = f"POS-{timestamp}"

    # CREATE SALE
    sale = Sale.objects.create(
        organisation=organisation,
        receipt_number=receipt_number,
        payment_method=payment_method,
        sale_type=sale_type,
        customer_name=customer_name,
        table_number=table_number,
        subtotal=subtotal,
        discount=discount,
        tax=tax,
        total=final_total,
        created_by=created_by,
        status="completed",
    )

    # CREATE SALE ITEMS + DEDUCT STOCK
    for item in validated_items:

        product = item["product"]
        quantity = item["quantity"]

        # CREATE SALE ITEM
        SaleItem.objects.create(
            sale=sale,
            product=product,
            quantity=quantity,
            unit_price=item["unit_price"],
            unit_cost=item["unit_cost"],
            total=item["total_price"],
        )

        # DEDUCT STOCK
        product.stock -= quantity
        product.save()

        # CREATE STOCK MOVEMENT
        StockMovement.objects.create(
            organisation=organisation,
            product=product,
            movement_type="out",
            quantity=quantity,
            created_by=created_by,
            note=f"Sale #{sale.id}",
        )

    return sale