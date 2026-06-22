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

    # Frontend sends the uploaded image as "photo".
    # Backend decides where to save it.
    photo = serializers.ImageField(write_only=True, required=False, allow_null=True)

    # Useful URLs for frontend
    profile_image_url = serializers.SerializerMethodField()
    user_avatar_url = serializers.SerializerMethodField()
    employee_photo_url = serializers.SerializerMethodField()

    create_login = serializers.BooleanField(write_only=True, required=False, default=False)
    login_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    login_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    login_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = DiscoEmployee
        fields = [
            "id",
            "organisation",
            "user",
            "username",
            "email",

            "photo",
            "profile_image_url",
            "user_avatar_url",
            "employee_photo_url",

            "full_name",
            "role",
            "phone",
            "is_active",

            "create_login",
            "login_username",
            "login_email",
            "login_password",

            "created_at",
            "updated_at",
        ]

        read_only_fields = (
            "id",
            "organisation",
            "user",
            "username",
            "email",
            "profile_image_url",
            "user_avatar_url",
            "employee_photo_url",
            "created_at",
            "updated_at",
        )

    def _build_url(self, image_field):
        if not image_field:
            return None

        request = self.context.get("request")
        url = image_field.url

        if request and url.startswith("/"):
            return request.build_absolute_uri(url)

        return url

    def get_user_avatar_url(self, obj):
        if obj.user and obj.user.avatar:
            return self._build_url(obj.user.avatar)

        return None

    def get_employee_photo_url(self, obj):
        if obj.photo:
            return self._build_url(obj.photo)

        return None

    def get_profile_image_url(self, obj):
        """
        Final display rule:

        1. If employee has login user, use CustomUser.avatar.
        2. If employee has no login user, use DiscoEmployee.photo.
        3. Optional fallback: if user exists but avatar is empty, use employee photo.
        """

        if obj.user:
            if obj.user.avatar:
                return self._build_url(obj.user.avatar)

            # fallback for old data
            if obj.photo:
                return self._build_url(obj.photo)

            return None

        if obj.photo:
            return self._build_url(obj.photo)

        return None

    def validate(self, attrs):
        create_login = attrs.get("create_login", False)
        login_email = attrs.get("login_email", "")
        login_password = attrs.get("login_password", "")
        login_username = attrs.get("login_username", "")

        existing_user = getattr(self.instance, "user", None)

        # Creating a new login account
        if create_login and not existing_user:
            if not login_email:
                raise serializers.ValidationError({
                    "login_email": "Email is required."
                })

            if not login_password:
                raise serializers.ValidationError({
                    "login_password": "Password is required."
                })

            username = login_username or login_email

            if User.objects.filter(username=username).exists():
                raise serializers.ValidationError({
                    "login_username": "Username already exists."
                })

            if User.objects.filter(email=login_email).exists():
                raise serializers.ValidationError({
                    "login_email": "Email already exists."
                })

        # Editing existing linked user
        if existing_user:
            if login_username:
                username_exists = (
                    User.objects
                    .filter(username=login_username)
                    .exclude(id=existing_user.id)
                    .exists()
                )

                if username_exists:
                    raise serializers.ValidationError({
                        "login_username": "Username already exists."
                    })

            if login_email:
                email_exists = (
                    User.objects
                    .filter(email=login_email)
                    .exclude(id=existing_user.id)
                    .exists()
                )

                if email_exists:
                    raise serializers.ValidationError({
                        "login_email": "Email already exists."
                    })

        return attrs

    def create(self, validated_data):
        uploaded_photo = validated_data.pop("photo", None)

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
                organisation=employee.organisation,
                phone=employee.phone or "",
            )

            # Employee has login, so image goes to CustomUser.avatar
            if uploaded_photo:
                user.avatar = uploaded_photo
                user.save(update_fields=["avatar"])

            employee.user = user
            employee.save(update_fields=["user"])

            Membership.objects.update_or_create(
                user=user,
                organisation=employee.organisation,
                defaults={
                    "role": employee.role,
                    "is_active": employee.is_active,
                },
            )

        else:
            # Employee has no login, so image goes to DiscoEmployee.photo
            if uploaded_photo:
                employee.photo = uploaded_photo
                employee.save(update_fields=["photo"])

        return employee

    def update(self, instance, validated_data):
        uploaded_photo = validated_data.pop("photo", None)

        create_login = validated_data.pop("create_login", False)
        login_username = validated_data.pop("login_username", "")
        login_email = validated_data.pop("login_email", "")
        login_password = validated_data.pop("login_password", "")

        instance.full_name = validated_data.get("full_name", instance.full_name)
        instance.role = validated_data.get("role", instance.role)
        instance.phone = validated_data.get("phone", instance.phone)
        instance.is_active = validated_data.get("is_active", instance.is_active)
        instance.save()

        # Case 1: Employee already has login
        if instance.user:
            user = instance.user

            if login_username:
                user.username = login_username

            if login_email:
                user.email = login_email

            if login_password:
                user.set_password(login_password)

            user.organisation = instance.organisation
            user.phone = instance.phone or ""

            # Has login, so uploaded image goes to CustomUser.avatar
            if uploaded_photo:
                user.avatar = uploaded_photo

            user.save()

            Membership.objects.update_or_create(
                user=user,
                organisation=instance.organisation,
                defaults={
                    "role": instance.role,
                    "is_active": instance.is_active,
                },
            )

        # Case 2: Employee does not have login, but now you are creating one
        elif create_login:
            username = login_username or login_email

            user = User.objects.create_user(
                username=username,
                email=login_email,
                password=login_password,
                organisation=instance.organisation,
                phone=instance.phone or "",
            )

            # If a new photo was uploaded, use it.
            # If not, but employee already had photo, move/copy it to user avatar.
            if uploaded_photo:
                user.avatar = uploaded_photo
                user.save(update_fields=["avatar"])
            elif instance.photo:
                user.avatar = instance.photo
                user.save(update_fields=["avatar"])

            instance.user = user
            instance.save(update_fields=["user"])

            Membership.objects.update_or_create(
                user=user,
                organisation=instance.organisation,
                defaults={
                    "role": instance.role,
                    "is_active": instance.is_active,
                },
            )

        # Case 3: Employee still has no login
        else:
            # No login, so uploaded image goes to DiscoEmployee.photo
            if uploaded_photo:
                instance.photo = uploaded_photo
                instance.save(update_fields=["photo"])

        return instance
    
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
    category_name = serializers.CharField(source="category.name", read_only=True)
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "organisation",
            "category",
            "category_name",
            "name",
            "barcode",
            "sku",
            "image",
            "image_url",
            "cost_price",
            "sale_price",
            "stock",
            "minimum_stock",
            "unit",
            "is_alcohol",
            "brand",
            "size_ml",
            "supplier_name",
            "is_active",
            "is_low_stock",
            "profit_per_unit",
            "created_at",
            "updated_at",
        ]

        read_only_fields = (
            "id",
            "organisation",
            "category_name",
            "image_url",
            "is_low_stock",
            "profit_per_unit",
            "created_at",
            "updated_at",
        )

    def get_image_url(self, obj):
        if not obj.image:
            return None

        request = self.context.get("request")
        url = obj.image.url

        if request and url.startswith("/"):
            return request.build_absolute_uri(url)

        return url

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