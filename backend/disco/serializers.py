from rest_framework import serializers

from .models import (
    Category,
    Product,
    StockMovement,
    Sale,
    SaleItem,
    Expense,
)

from .services.sales_service import create_sale


class CategorySerializer(serializers.ModelSerializer):

    class Meta:
        model = Category
        fields = "__all__"


class ProductSerializer(serializers.ModelSerializer):

    is_low_stock = serializers.ReadOnlyField()
    profit_per_unit = serializers.ReadOnlyField()

    class Meta:
        model = Product
        fields = "__all__"

        read_only_fields = (
                "organisation",
        )


class StockMovementSerializer(serializers.ModelSerializer):

    class Meta:
        model = StockMovement
        fields = "__all__"


class ExpenseSerializer(serializers.ModelSerializer):

    class Meta:
        model = Expense
        fields = "__all__"


# INPUT SERIALIZER FOR SALES
class SaleItemCreateSerializer(serializers.Serializer):

    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


# OUTPUT SERIALIZER
class SaleItemSerializer(serializers.ModelSerializer):

    profit = serializers.ReadOnlyField()

    class Meta:
        model = SaleItem
        fields = "__all__"

    @property
    def profit(self):
        return self.instance.profit()


class SaleSerializer(serializers.ModelSerializer):

    # INPUT ITEMS
    items = SaleItemCreateSerializer(many=True, write_only=True)

    # OUTPUT ITEMS
    sale_items = SaleItemSerializer(
        source="items",
        many=True,
        read_only=True
    )

    class Meta:
        model = Sale
        fields = "__all__"

        read_only_fields = (
            "receipt_number",
            "subtotal",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )

    def create(self, validated_data):

        request = self.context["request"]

        items = validated_data.pop("items")

        sale = create_sale(
            organisation=request.user.organisation,
            created_by=request.user,
            items=items,
            **validated_data
        )

        return sale