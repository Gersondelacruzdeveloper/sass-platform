from rest_framework import serializers

from .models import SubscriptionPlan, Subscription


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = "__all__"


class SubscriptionSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    plan_name = serializers.CharField(
        source="plan.name",
        read_only=True,
    )

    class Meta:
        model = Subscription
        fields = "__all__"