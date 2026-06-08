from django.db import models
from django.conf import settings


class Organisation(models.Model):
    PLAN_CHOICES = (
        ("basic", "Basic - $99/month"),
        ("pro", "Pro - $159/month"),
        ("premium", "Premium - $199/month"),
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

    @property
    def plan_price(self):
        return {
            "basic": 99,
            "pro": 159,
            "premium": 199,
        }.get(self.plan, 99)

    @property
    def max_users(self):
        return {
            "basic": 3,
            "pro": 10,
            "premium": 25,
        }.get(self.plan, 3)

    @property
    def max_employees(self):
        return {
            "basic": 25,
            "pro": 100,
            "premium": 300,
        }.get(self.plan, 25)

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
    

# organisations/models.py
class OrganisationBranding(models.Model):
    organisation = models.OneToOneField(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="branding"
    )

    company_name = models.CharField(max_length=255)
    platform_name = models.CharField(max_length=255, blank=True)

    logo = models.ImageField(upload_to="branding/logos/", blank=True, null=True)
    favicon = models.ImageField(upload_to="branding/favicons/", blank=True, null=True)

    primary_color = models.CharField(max_length=20, default="#111827")
    secondary_color = models.CharField(max_length=20, default="#6B7280")
    accent_color = models.CharField(max_length=20, default="#F59E0B")

    login_title = models.CharField(max_length=255, blank=True)
    login_subtitle = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.company_name} - {self.platform_name}"
    



class OrganisationDomain(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="domains"
    )
    domain = models.CharField(max_length=255, unique=True)
    is_primary = models.BooleanField(default=False)