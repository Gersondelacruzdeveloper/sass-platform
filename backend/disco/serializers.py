from rest_framework import serializers

from .models import (
    Category,
    Product,
    StockMovement,
    Sale,
    SaleItem,
    Expense,
    DiscoEmployee,
    DiscoTable,
    CashShift,
    DiscoReservation,
    DiscoActivityLog,
)

from .services.sales_service import create_sale
from organisations.models import Membership 
from django.contrib.auth import get_user_model
User = get_user_model()


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"
        read_only_fields = ("organisation", "created_at", "updated_at")



class DiscoEmployeeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)

    create_login = serializers.BooleanField(write_only=True, required=False, default=False)
    login_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    login_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    login_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = DiscoEmployee
        fields = "__all__"
        read_only_fields = ("organisation", "created_at", "updated_at")

    def validate(self, attrs):
        create_login = attrs.get("create_login", False)
        login_email = attrs.get("login_email", "")
        login_password = attrs.get("login_password", "")
        login_username = attrs.get("login_username", "")

        if create_login:
            if not login_email:
                raise serializers.ValidationError({"login_email": "Email is required."})

            if not login_password:
                raise serializers.ValidationError({"login_password": "Password is required."})

            username = login_username or login_email

            if User.objects.filter(username=username).exists():
                raise serializers.ValidationError({"login_username": "Username already exists."})

            if User.objects.filter(email=login_email).exists():
                raise serializers.ValidationError({"login_email": "Email already exists."})

        return attrs

    def create(self, validated_data):
        create_login = validated_data.pop("create_login", False)
        login_username = validated_data.pop("login_username", "")
        login_email = validated_data.pop("login_email", "")
        login_password = validated_data.pop("login_password", "")

        employee = DiscoEmployee.objects.create(**validated_data)

        if create_login:
            username = login_username or login_email

            user = User.objects.create_user(
                username=username,
                email=login_email,
                password=login_password,
            )

            employee.user = user
            employee.save(update_fields=["user"])

            Membership.objects.update_or_create(
                user=user,
                organisation=employee.organisation,
                defaults={
                    "role": employee.role,
                    "is_active": True,
                },
            )

        return employee


class DiscoTableSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoTable
        fields = "__all__"
        read_only_fields = ("organisation", "created_at", "updated_at")


class CashShiftSerializer(serializers.ModelSerializer):
    opened_by_name = serializers.CharField(
        source="opened_by.username",
        read_only=True
    )
    closed_by_name = serializers.CharField(
        source="closed_by.username",
        read_only=True
    )

    class Meta:
        model = CashShift
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "opened_by",
            "closed_by",
            "opened_at",
            "closed_at",
        )


class ProductSerializer(serializers.ModelSerializer):
    is_low_stock = serializers.ReadOnlyField()
    profit_per_unit = serializers.ReadOnlyField()
    category_name = serializers.CharField(source="category.name", read_only=True)

    class Meta:
        model = Product
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "created_at",
            "updated_at",
            "is_low_stock",
            "profit_per_unit",
        )


class StockMovementSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    class Meta:
        model = StockMovement
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "created_by",
            "created_at",
            "updated_at",
        )


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    class Meta:
        model = Expense
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "created_by",
            "created_at",
            "updated_at",
        )


class SaleItemCreateSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class SaleItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    profit = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = "__all__"

    def get_profit(self, obj):
        return obj.profit()


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemCreateSerializer(many=True, write_only=True)

    sale_items = SaleItemSerializer(
        source="items",
        many=True,
        read_only=True
    )

    table_name = serializers.CharField(source="table.name", read_only=True)
    waiter_name = serializers.CharField(source="waiter.full_name", read_only=True)
    bartender_name = serializers.CharField(source="bartender.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Sale
        fields = "__all__"
        read_only_fields = (
            "organisation",
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

        membership = (
            request.user.memberships
            .filter(is_active=True, organisation__is_active=True)
            .select_related("organisation")
            .first()
        )

        if not membership:
            raise serializers.ValidationError({
                "organisation": "No active organisation found for this user."
            })

        sale = create_sale(
            organisation=membership.organisation,
            created_by=request.user,
            items=items,
            **validated_data
        )

        DiscoActivityLog.objects.create(
            organisation=membership.organisation,
            user=request.user,
            action="sale_created",
            description=f"Created sale #{sale.id} for {sale.total}",
        )

        return sale


class SaleReadSerializer(serializers.ModelSerializer):
    sale_items = SaleItemSerializer(
        source="items",
        many=True,
        read_only=True
    )

    table_name = serializers.CharField(source="table.name", read_only=True)
    waiter_name = serializers.CharField(source="waiter.full_name", read_only=True)
    bartender_name = serializers.CharField(source="bartender.full_name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.username", read_only=True)

    class Meta:
        model = Sale
        fields = "__all__"


class DiscoReservationSerializer(serializers.ModelSerializer):
    table_name = serializers.CharField(source="table.name", read_only=True)
    created_by_name = serializers.CharField(
        source="created_by.username",
        read_only=True
    )

    class Meta:
        model = DiscoReservation
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "created_by",
            "created_at",
            "updated_at",
        )


class DiscoActivityLogSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = DiscoActivityLog
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "user",
            "created_at",
        )