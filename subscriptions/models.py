from django.db import models
from django.conf import settings

from organisations.models import Organisation


class SubscriptionPlan(models.Model):
    INTERVAL_CHOICES = (
        ("monthly", "Monthly"),
        ("yearly", "Yearly"),
    )

    name = models.CharField(max_length=100)
    slug = models.SlugField(unique=True)

    price = models.DecimalField(max_digits=10, decimal_places=2)
    currency = models.CharField(max_length=10, default="USD")
    interval = models.CharField(max_length=20, choices=INTERVAL_CHOICES, default="monthly")

    max_users = models.PositiveIntegerField(default=5)
    max_modules = models.PositiveIntegerField(default=1)

    stripe_price_id = models.CharField(max_length=255, blank=True, null=True)

    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.name} - {self.price} {self.currency}/{self.interval}"


class Subscription(models.Model):
    STATUS_CHOICES = (
        ("trialing", "Trialing"),
        ("active", "Active"),
        ("past_due", "Past Due"),
        ("cancelled", "Cancelled"),
        ("expired", "Expired"),
    )

    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="subscription",
    )

    plan = models.ForeignKey(
        SubscriptionPlan,
        on_delete=models.PROTECT,
        related_name="subscriptions",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="trialing")

    stripe_customer_id = models.CharField(max_length=255, blank=True, null=True)
    stripe_subscription_id = models.CharField(max_length=255, blank=True, null=True)

    current_period_start = models.DateTimeField(blank=True, null=True)
    current_period_end = models.DateTimeField(blank=True, null=True)

    trial_ends_at = models.DateTimeField(blank=True, null=True)
    cancel_at_period_end = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def is_valid(self):
        return self.status in ["trialing", "active"]

    def __str__(self):
        return f"{self.organisation.name} - {self.plan.name} - {self.status}"