from rest_framework import serializers

from .models import SubscriptionPlan, Subscription


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = (
            "id",
            "name",
            "slug",
            "price",
            "currency",
            "interval",
            "max_users",
            "max_employees",
            "max_modules",
            "is_active",
        )


class CreateCheckoutSessionSerializer(serializers.Serializer):
    company_name = serializers.CharField(max_length=255)
    owner_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, min_length=8)

    app = serializers.CharField(
        required=False,
        allow_blank=True,
        default="disco",
    )

    business_type = serializers.ChoiceField(
        choices=[
            ("disco", "Disco"),
            ("hotel", "Hotel"),
            ("restaurant", "Restaurant"),
            ("store", "Store"),
            ("excursions", "Excursions"),
        ],
        default="disco",
    )

    plan = serializers.SlugField()

class SubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source="plan.name", read_only=True)
    plan_slug = serializers.CharField(source="plan.slug", read_only=True)
    plan_price = serializers.DecimalField(
        source="plan.price",
        max_digits=10,
        decimal_places=2,
        read_only=True,
    )
    currency = serializers.CharField(source="plan.currency", read_only=True)
    interval = serializers.CharField(source="plan.interval", read_only=True)
    max_users = serializers.IntegerField(source="plan.max_users", read_only=True)
    max_employees = serializers.IntegerField(
        source="plan.max_employees",
        read_only=True,
    )
    max_modules = serializers.IntegerField(source="plan.max_modules", read_only=True)
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    organisation_slug = serializers.CharField(
        source="organisation.slug",
        read_only=True,
    )
    organisation_active = serializers.BooleanField(
        source="organisation.is_active",
        read_only=True,
    )

    class Meta:
        model = Subscription
        fields = (
            "id",
            "organisation_name",
            "organisation_slug",
            "organisation_active",
            "plan",
            "plan_name",
            "plan_slug",
            "plan_price",
            "currency",
            "interval",
            "status",
            "max_users",
            "max_employees",
            "max_modules",
            "stripe_customer_id",
            "stripe_subscription_id",
            "current_period_start",
            "current_period_end",
            "trial_ends_at",
            "cancel_at_period_end",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class MySubscriptionSerializer(serializers.ModelSerializer):
    organisation = serializers.SerializerMethodField()
    plan = serializers.SerializerMethodField()
    usage = serializers.SerializerMethodField()

    class Meta:
        model = Subscription
        fields = (
            "id",
            "organisation",
            "plan",
            "status",
            "current_period_start",
            "current_period_end",
            "trial_ends_at",
            "cancel_at_period_end",
            "usage",
        )

    def get_organisation(self, obj):
        return {
            "id": obj.organisation.id,
            "name": obj.organisation.name,
            "slug": obj.organisation.slug,
            "business_type": obj.organisation.business_type,
            "is_active": obj.organisation.is_active,
        }

    def get_plan(self, obj):
        return {
            "id": obj.plan.id,
            "name": obj.plan.name,
            "slug": obj.plan.slug,
            "price": obj.plan.price,
            "currency": obj.plan.currency,
            "interval": obj.plan.interval,
            "max_users": obj.plan.max_users,
            "max_employees": obj.plan.max_employees,
            "max_modules": obj.plan.max_modules,
        }

    def get_usage(self, obj):
        organisation = obj.organisation

        employee_count = 0
        user_login_count = 0

        if hasattr(organisation, "disco_employees"):
            employee_count = organisation.disco_employees.filter(
                is_active=True,
            ).count()

            user_login_count = organisation.disco_employees.filter(
                is_active=True,
                user__isnull=False,
            ).count()

        return {
            "employees": employee_count,
            "max_employees": obj.plan.max_employees,
            "user_logins": user_login_count,
            "max_users": obj.plan.max_users,
        }