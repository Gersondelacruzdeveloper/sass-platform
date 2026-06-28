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
        ("ticketing", "Tours, Tickets & Transfers"),
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

    # Keep this as a simple fallback/display field
    plan = models.CharField(
        max_length=20,
        choices=PLAN_CHOICES,
        default="basic",
    )

    # Real access control
    is_active = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def active_subscription(self):
        return getattr(self, "subscription", None)

    @property
    def plan_price(self):
        subscription = self.active_subscription

        if subscription and subscription.plan:
            return subscription.plan.price

        return {
            "basic": 99,
            "pro": 159,
            "premium": 199,
        }.get(self.plan, 99)

    @property
    def max_users(self):
        subscription = self.active_subscription

        if subscription and subscription.plan:
            return subscription.plan.max_users

        return {
            "basic": 3,
            "pro": 10,
            "premium": 25,
        }.get(self.plan, 3)

    @property
    def max_employees(self):
        subscription = self.active_subscription

        if subscription and subscription.plan:
            return subscription.plan.max_employees

        return {
            "basic": 25,
            "pro": 100,
            "premium": 300,
        }.get(self.plan, 25)

    @property
    def subscription_status(self):
        subscription = self.active_subscription

        if subscription:
            return subscription.status

        return "inactive"

    @property
    def stripe_customer_id(self):
        subscription = self.active_subscription

        if subscription:
            return subscription.stripe_customer_id

        return None

    @property
    def stripe_subscription_id(self):
        subscription = self.active_subscription

        if subscription:
            return subscription.stripe_subscription_id

        return None

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
        related_name="branding",
    )

    company_name = models.CharField(max_length=255)
    platform_name = models.CharField(max_length=255, blank=True)

    # Main branding
    logo = models.ImageField(
        upload_to="branding/logos/",
        blank=True,
        null=True,
    )

    # Browser tab icon
    # FileField is better than ImageField because favicon can be .ico
    favicon = models.FileField(
        upload_to="branding/favicons/",
        blank=True,
        null=True,
    )

    # PWA / installable app icons
    app_icon_192 = models.ImageField(
        upload_to="branding/app-icons/",
        blank=True,
        null=True,
        help_text="Recommended size: 192x192 PNG",
    )

    app_icon_512 = models.ImageField(
        upload_to="branding/app-icons/",
        blank=True,
        null=True,
        help_text="Recommended size: 512x512 PNG",
    )

    maskable_icon = models.ImageField(
        upload_to="branding/app-icons/",
        blank=True,
        null=True,
        help_text="Recommended size: 512x512 PNG with safe padding",
    )

    # PWA app information
    app_short_name = models.CharField(
        max_length=50,
        blank=True,
        help_text="Short name shown under installed app icon",
    )

    app_description = models.TextField(
        blank=True,
        help_text="Description used in the app manifest",
    )

    # UI colors
    primary_color = models.CharField(max_length=20, default="#111827")
    secondary_color = models.CharField(max_length=20, default="#6B7280")
    accent_color = models.CharField(max_length=20, default="#F59E0B")

    # PWA colors
    theme_color = models.CharField(max_length=20, default="#111827")
    background_color = models.CharField(max_length=20, default="#ffffff")

    # Login page branding
    login_title = models.CharField(max_length=255, blank=True)
    login_subtitle = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def display_name(self):
        return self.platform_name or self.company_name or self.organisation.name

    @property
    def short_name(self):
        return self.app_short_name or self.platform_name or self.company_name

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