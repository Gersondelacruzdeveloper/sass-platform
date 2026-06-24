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
    DiscoSettings,
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

    # Permissions summary for frontend
    permissions = serializers.SerializerMethodField()

    create_login = serializers.BooleanField(write_only=True, required=False, default=False)
    login_username = serializers.CharField(write_only=True, required=False, allow_blank=True)
    login_email = serializers.EmailField(write_only=True, required=False, allow_blank=True)
    login_password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    PERMISSION_FIELDS = [
        "can_access_dashboard",
        "can_access_pos",
        "can_manage_products",
        "can_manage_inventory",
        "can_manage_employees",
        "can_manage_tables",
        "can_manage_reservations",
        "can_manage_expenses",
        "can_view_reports",
        "can_manage_settings",
        "can_view_activity_logs",
        "can_open_cash_shift",
        "can_close_cash_shift",
        "can_apply_discounts",
        "can_cancel_sales",
    ]

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
            "daily_pay",
            "start_date",
            "end_date",

            "permissions",

            "can_access_dashboard",
            "can_access_pos",
            "can_manage_products",
            "can_manage_inventory",
            "can_manage_employees",
            "can_manage_tables",
            "can_manage_reservations",
            "can_manage_expenses",
            "can_view_reports",
            "can_manage_settings",
            "can_view_activity_logs",
            "can_open_cash_shift",
            "can_close_cash_shift",
            "can_apply_discounts",
            "can_cancel_sales",

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
            "permissions",
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

    def get_permissions(self, obj):
        if hasattr(obj, "get_permissions_dict"):
            return obj.get_permissions_dict()

        return {
            field: getattr(obj, field, False)
            for field in self.PERMISSION_FIELDS
        }

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

    def _extract_permission_values(self, validated_data):
        permission_values = {}

        for field in self.PERMISSION_FIELDS:
            if field in validated_data:
                permission_values[field] = validated_data.pop(field)

        return permission_values

    def _apply_permissions(self, employee, permission_values=None, apply_role_defaults=False):
        permission_values = permission_values or {}

        if apply_role_defaults and hasattr(employee, "apply_role_default_permissions"):
            employee.apply_role_default_permissions()

        for field, value in permission_values.items():
            setattr(employee, field, value)

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

        permission_values = self._extract_permission_values(validated_data)

        employee = DiscoEmployee.objects.create(**validated_data)

        # First apply automatic permissions by role.
        # Then override with any permissions manually sent by the owner.
        self._apply_permissions(
            employee,
            permission_values=permission_values,
            apply_role_defaults=True,
        )
        employee.save()

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

        permission_values = self._extract_permission_values(validated_data)

        old_role = instance.role
        new_role = validated_data.get("role", instance.role)
        role_changed = old_role != new_role

        instance.full_name = validated_data.get("full_name", instance.full_name)
        instance.role = new_role
        instance.phone = validated_data.get("phone", instance.phone)
        instance.daily_pay = validated_data.get("daily_pay", instance.daily_pay)
        instance.start_date = validated_data.get("start_date", instance.start_date)
        instance.end_date = validated_data.get("end_date", instance.end_date)
        instance.is_active = validated_data.get("is_active", instance.is_active)

        # If the role changes, reset default permissions for the new role first.
        # Then override with any permissions manually sent by the owner.
        self._apply_permissions(
            instance,
            permission_values=permission_values,
            apply_role_defaults=role_changed,
        )

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


class DiscoSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscoSettings
        fields = [
            "id",
            "organisation",
            "tax_percentage",
            "currency_symbol",
            "created_at",
            "updated_at",
        ]
        read_only_fields = (
            "id",
            "organisation",
            "created_at",
            "updated_at",
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

    def validate(self, attrs):
        sku = attrs.get("sku")
        barcode = attrs.get("barcode")

        if isinstance(sku, str):
            cleaned_sku = sku.strip()
            attrs["sku"] = cleaned_sku or None

        if isinstance(barcode, str):
            cleaned_barcode = barcode.strip()
            attrs["barcode"] = cleaned_barcode or None

        organisation = None

        if self.instance:
            organisation = self.instance.organisation
        else:
            request = self.context.get("request")

            if request:
                organisation = getattr(request, "organisation", None)

                if not organisation and request.user:
                    organisation = getattr(request.user, "organisation", None)

        if organisation and attrs.get("sku"):
            duplicate_sku = Product.objects.filter(
                organisation=organisation,
                sku=attrs["sku"],
            )

            if self.instance:
                duplicate_sku = duplicate_sku.exclude(id=self.instance.id)

            if duplicate_sku.exists():
                raise serializers.ValidationError({
                    "sku": "Another product already uses this SKU."
                })

        if organisation and attrs.get("barcode"):
            duplicate_barcode = Product.objects.filter(
                organisation=organisation,
                barcode=attrs["barcode"],
            )

            if self.instance:
                duplicate_barcode = duplicate_barcode.exclude(id=self.instance.id)

            if duplicate_barcode.exists():
                raise serializers.ValidationError({
                    "barcode": "Another product already uses this barcode."
                })

        return attrs

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
    line_cost_total = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = "__all__"

    def get_profit(self, obj):
        return obj.profit()
    
    def get_line_cost_total(self, obj):
        return obj.unit_cost * obj.quantity


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemCreateSerializer(many=True, write_only=True, required=True)

    sale_items = SaleItemSerializer(
        source="items",
        many=True,
        read_only=True
    )

    table_name = serializers.CharField(source="table.name", read_only=True)
    waiter_name = serializers.CharField(source="waiter.full_name", read_only=True)
    bartender_name = serializers.CharField(source="bartender.full_name", read_only=True)

    created_by_name = serializers.CharField(source="created_by.username", read_only=True)
    cashier_name = serializers.CharField(source="created_by.username", read_only=True)

    product_cost_total = serializers.SerializerMethodField()
    gross_profit = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = "__all__"
        read_only_fields = (
            "organisation",
            "receipt_number",
            "subtotal",
            "tax",
            "total",
            "created_by",
            "created_at",
            "updated_at",
        )

    def get_product_cost_total(self, obj):
        return obj.product_cost_total

    def get_gross_profit(self, obj):
        return obj.gross_profit

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
    cashier_name = serializers.CharField(source="created_by.username", read_only=True)

    product_cost_total = serializers.SerializerMethodField()
    gross_profit = serializers.SerializerMethodField()

    class Meta:
        model = Sale
        fields = "__all__"

    def get_product_cost_total(self, obj):
        return obj.product_cost_total

    def get_gross_profit(self, obj):
        return obj.gross_profit




class OpenTableBillSerializer(serializers.Serializer):
    table_id = serializers.IntegerField()
    customer_name = serializers.CharField(
        required=False,
        allow_blank=True,
        allow_null=True
    )
    waiter_id = serializers.IntegerField(required=False, allow_null=True)
    bartender_id = serializers.IntegerField(required=False, allow_null=True)

    def validate(self, attrs):
        organisation = self.context.get("organisation")

        table = DiscoTable.objects.filter(
            id=attrs["table_id"],
            organisation=organisation,
        ).first()

        if not table:
            raise serializers.ValidationError({
                "table_id": "Table not found for this organisation."
            })

        if table.status == "inactive":
            raise serializers.ValidationError({
                "table_id": "This table is inactive."
            })

        existing_open_sale = Sale.objects.filter(
            organisation=organisation,
            table=table,
            sale_type="table",
            status="pending",
        ).first()

        if existing_open_sale:
            raise serializers.ValidationError({
                "table_id": "This table already has an open bill."
            })

        waiter = None
        bartender = None

        waiter_id = attrs.get("waiter_id")
        bartender_id = attrs.get("bartender_id")

        if waiter_id:
            waiter = DiscoEmployee.objects.filter(
                id=waiter_id,
                organisation=organisation,
                is_active=True,
            ).first()

            if not waiter:
                raise serializers.ValidationError({
                    "waiter_id": "Waiter not found or inactive."
                })

        if bartender_id:
            bartender = DiscoEmployee.objects.filter(
                id=bartender_id,
                organisation=organisation,
                is_active=True,
            ).first()

            if not bartender:
                raise serializers.ValidationError({
                    "bartender_id": "Bartender not found or inactive."
                })

        attrs["table_obj"] = table
        attrs["waiter_obj"] = waiter
        attrs["bartender_obj"] = bartender

        return attrs


class AddSaleItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        organisation = self.context.get("organisation")

        product = Product.objects.filter(
            id=attrs["product_id"],
            organisation=organisation,
            is_active=True,
        ).first()

        if not product:
            raise serializers.ValidationError({
                "product_id": "Product not found or inactive."
            })

        if product.stock < attrs["quantity"]:
            raise serializers.ValidationError({
                "quantity": f"Not enough stock. Available: {product.stock}."
            })

        attrs["product_obj"] = product
        return attrs


class UpdateSaleItemQuantitySerializer(serializers.Serializer):
    item_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)

    def validate(self, attrs):
        sale = self.context.get("sale")

        item = SaleItem.objects.filter(
            id=attrs["item_id"],
            sale=sale,
        ).select_related("product").first()

        if not item:
            raise serializers.ValidationError({
                "item_id": "Sale item not found for this bill."
            })

        difference = attrs["quantity"] - item.quantity

        if difference > 0 and item.product.stock < difference:
            raise serializers.ValidationError({
                "quantity": f"Not enough stock. Available: {item.product.stock}."
            })

        attrs["item_obj"] = item
        attrs["difference"] = difference

        return attrs


class RemoveSaleItemSerializer(serializers.Serializer):
    item_id = serializers.IntegerField()

    def validate(self, attrs):
        sale = self.context.get("sale")

        item = SaleItem.objects.filter(
            id=attrs["item_id"],
            sale=sale,
        ).select_related("product").first()

        if not item:
            raise serializers.ValidationError({
                "item_id": "Sale item not found for this bill."
            })

        attrs["item_obj"] = item
        return attrs


class CheckoutSaleSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(
        choices=Sale.PAYMENT_CHOICES,
        default="cash",
    )
    discount = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        default="0.00",
    )
    tax = serializers.DecimalField(
        max_digits=10,
        decimal_places=2,
        required=False,
        default="0.00",
    )

    def validate(self, attrs):
        sale = self.context.get("sale")

        if sale.status != "pending":
            raise serializers.ValidationError({
                "sale": "Only pending bills can be checked out."
            })

        if sale.sale_type != "table":
            raise serializers.ValidationError({
                "sale": "Only table bills can use table checkout."
            })

        if not sale.items.exists():
            raise serializers.ValidationError({
                "items": "Cannot checkout an empty bill."
            })

        return attrs


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