from django.db import models
from django.conf import settings


class Organisation(models.Model):
    PLAN_CHOICES = (
        ("basic", "Basic"),
        ("pro", "Pro"),
        ("premium", "Premium"),
    )

    BUSINESS_TYPE_CHOICES = (
        ("disco", "Disco"),
        ("hotel", "Hotel"),
        ("restaurant", "Restaurant"),
        ("store", "Store"),
        ("excursions", "Excursions"),
    )

    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)

    business_type = models.CharField(
        max_length=30,
        choices=BUSINESS_TYPE_CHOICES,
        default="disco",
    )

    logo = models.ImageField(
        upload_to="organisation_logos/",
        blank=True,
        null=True,
    )

    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)

    plan = models.CharField(
        max_length=20,
        choices=PLAN_CHOICES,
        default="basic",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class Membership(models.Model):
    ROLE_CHOICES = (
        ("owner", "Owner"),
        ("admin", "Admin"),
        ("manager", "Manager"),
        ("cashier", "Cashier"),
        ("bartender", "Bartender"),
        ("door_staff", "Door Staff"),
        ("inventory_manager", "Inventory Manager"),
        ("accountant", "Accountant"),
        ("staff", "Staff"),
        ("viewer", "Viewer"),
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="memberships",
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="memberships",
    )

    role = models.CharField(
        max_length=30,
        choices=ROLE_CHOICES,
        default="staff",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("user", "organisation")

    def __str__(self):
        return f"{self.user.email} - {self.organisation.name} - {self.role}"