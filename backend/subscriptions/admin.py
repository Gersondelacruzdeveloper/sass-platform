from django.contrib import admin

from .models import SubscriptionPlan, Subscription


@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "name",
        "price",
        "currency",
        "interval",
        "max_users",
        "max_modules",
        "is_active",
    )

    search_fields = ("name", "slug", "stripe_price_id")


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "organisation",
        "plan",
        "status",
        "current_period_end",
        "cancel_at_period_end",
    )

    search_fields = (
        "organisation__name",
        "stripe_customer_id",
        "stripe_subscription_id",
    )