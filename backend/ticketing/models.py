from decimal import Decimal
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from organisations.models import Organisation


class TicketingSettings(models.Model):
    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_settings",
    )

    module_name = models.CharField(
        max_length=150,
        default="Tours, Tickets & Transfers",
    )

    public_brand_name = models.CharField(
        max_length=150,
        default="PCD Experiences",
    )

    currency_symbol = models.CharField(
        max_length=10,
        default="US$",
        help_text="Display-only currency symbol. No currency conversion is applied.",
    )

    default_currency = models.CharField(max_length=10, default="USD")
    supported_currencies = models.JSONField(default=list, blank=True)

    tax_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    default_deposit_percentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    allow_public_bookings = models.BooleanField(default=True)
    allow_seller_bookings = models.BooleanField(default=True)
    allow_full_payment = models.BooleanField(default=True)
    allow_deposit_payment = models.BooleanField(default=True)
    allow_pending_payment = models.BooleanField(default=True)
    allow_cash_to_seller = models.BooleanField(default=True)
    allow_manual_bank_transfer = models.BooleanField(default=True)
    allow_mixed_payments = models.BooleanField(default=True)

    send_customer_email = models.BooleanField(default=False)
    send_customer_whatsapp = models.BooleanField(default=False)
    notify_owner_on_booking = models.BooleanField(default=True)

    require_supervisor_approval_for_unpaid_tickets = models.BooleanField(default=False)

    wellet_enabled = models.BooleanField(
        default=False,
        help_text="Enable Coco Bongo / Wellet only for authorised organisations.",
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Ticketing Settings - {self.organisation.name}"

    class Meta:
        verbose_name = "Ticketing Settings"
        verbose_name_plural = "Ticketing Settings"


class TicketingPublicSiteSettings(models.Model):
    HERO_MEDIA_TYPE_CHOICES = (
        ("image", "Image"),
        ("video", "Video"),
    )

    HOMEPAGE_LAYOUT_STYLE_CHOICES = (
        ("marketplace", "Marketplace"),
        ("luxury", "Luxury"),
        ("minimal", "Minimal"),
        ("adventure", "Adventure"),
    )

    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_public_site_settings",
    )

    site_title = models.CharField(max_length=255, blank=True)
    public_description = models.TextField(blank=True)

    hero_title = models.CharField(
        max_length=255,
        blank=True,
        help_text="Main headline shown on the public home page.",
    )
    hero_subtitle = models.TextField(
        blank=True,
        help_text="Short subtitle shown under the public home page headline.",
    )

    primary_cta_label = models.CharField(
        max_length=80,
        default="Explore Experiences",
        blank=True,
    )
    secondary_cta_label = models.CharField(
        max_length=80,
        default="Book Transfers",
        blank=True,
    )
    whatsapp_cta_label = models.CharField(
        max_length=80,
        default="Chat via WhatsApp",
        blank=True,
    )

    public_email = models.EmailField(blank=True, null=True)
    public_whatsapp = models.CharField(max_length=30, blank=True, null=True)

    DOMAIN_STATUS_CHOICES = (
        ("not_configured", "Not Configured"),
        ("pending_aws_setup", "Pending AWS Setup"),
        ("pending_dns", "Pending DNS"),
        ("pending_ssl", "Pending SSL"),
        ("pending_cloudfront", "Pending CloudFront"),
        ("active", "Active"),
        ("failed", "Failed"),
    )

    subdomain = models.SlugField(blank=True, null=True)

    custom_domain = models.CharField(
        max_length=255,
        blank=True,
        null=True,
        db_index=True,
        help_text="Custom public domain for this ticketing website. Example: www.puntacanaticket.com",
    )

    domain_status = models.CharField(
        max_length=30,
        choices=DOMAIN_STATUS_CHOICES,
        default="not_configured",
        db_index=True,
    )

    domain_verified_at = models.DateTimeField(blank=True, null=True)
    domain_last_checked_at = models.DateTimeField(blank=True, null=True)
    domain_error_message = models.TextField(blank=True)

    aws_acm_certificate_arn = models.CharField(
        max_length=512,
        blank=True,
        help_text="AWS ACM certificate ARN created for this custom domain.",
    )
    aws_acm_certificate_status = models.CharField(
        max_length=80,
        blank=True,
        help_text="Latest ACM certificate status. Example: PENDING_VALIDATION or ISSUED.",
    )
    aws_acm_requested_at = models.DateTimeField(blank=True, null=True)

    aws_acm_validation_record_name = models.CharField(
        max_length=512,
        blank=True,
        help_text="DNS CNAME name required by ACM validation.",
    )
    aws_acm_validation_record_type = models.CharField(
        max_length=20,
        default="CNAME",
        blank=True,
    )
    aws_acm_validation_record_value = models.CharField(
        max_length=512,
        blank=True,
        help_text="DNS CNAME value required by ACM validation.",
    )

    cloudfront_distribution_id = models.CharField(
        max_length=120,
        blank=True,
        help_text="CloudFront distribution ID used to serve this public site.",
    )
    cloudfront_domain_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="CloudFront target domain. Example: dxxxxx.cloudfront.net",
    )
    cloudfront_alias_added_at = models.DateTimeField(blank=True, null=True)

    dns_records_payload = models.JSONField(
        default=list,
        blank=True,
        help_text="DNS records shown to the customer so they can paste them in GoDaddy.",
    )

    logo = models.ImageField(
        upload_to="ticketing/public/logos/",
        blank=True,
        null=True,
    )

    favicon = models.FileField(
        upload_to="ticketing/public/favicons/",
        blank=True,
        null=True,
    )

    hero_media_type = models.CharField(
        max_length=20,
        choices=HERO_MEDIA_TYPE_CHOICES,
        default="image",
        help_text="Choose whether the public home hero uses an uploaded image or video.",
    )

    hero_image = models.ImageField(
        upload_to="ticketing/public/hero/",
        blank=True,
        null=True,
    )

    hero_video = models.FileField(
        upload_to="ticketing/public/hero-videos/",
        blank=True,
        null=True,
        help_text="Optional uploaded hero video for the public home page.",
    )

    hero_video_url = models.URLField(
        blank=True,
        help_text="Optional external hero video URL. Useful for CDN, S3, Spaces or Cloudinary.",
    )

    hero_video_poster = models.ImageField(
        upload_to="ticketing/public/hero-posters/",
        blank=True,
        null=True,
        help_text="Poster image shown before the video loads.",
    )

    hero_overlay_opacity = models.DecimalField(
        max_digits=4,
        decimal_places=2,
        default=Decimal("0.45"),
        help_text="Overlay opacity over the hero media. Example: 0.45.",
    )

    primary_color = models.CharField(max_length=20, default="#111827")
    secondary_color = models.CharField(max_length=20, default="#6B7280")
    accent_color = models.CharField(max_length=20, default="#F59E0B")
    background_color = models.CharField(max_length=20, default="#FFFFFF")
    button_color = models.CharField(max_length=20, default="#111827")
    text_color = models.CharField(max_length=20, default="#111827")
    muted_text_color = models.CharField(max_length=20, default="#6B7280")
    card_background_color = models.CharField(max_length=20, default="#FFFFFF")

    homepage_layout_style = models.CharField(
        max_length=30,
        choices=HOMEPAGE_LAYOUT_STYLE_CHOICES,
        default="marketplace",
    )

    trust_badges = models.JSONField(
        default=list,
        blank=True,
        help_text="Public home trust badges. Example: ['5,000+ Happy Travelers', 'Resort Pickup'].",
    )

    show_category_grid = models.BooleanField(default=True)
    show_trust_badges = models.BooleanField(default=True)
    show_excursions_section = models.BooleanField(default=True)
    show_transfers_section = models.BooleanField(default=True)
    show_tickets_section = models.BooleanField(default=True)
    show_events_section = models.BooleanField(default=True)
    show_nightlife_section = models.BooleanField(default=True)
    show_packages_section = models.BooleanField(default=True)
    show_ai_assistant_section = models.BooleanField(default=True)
    show_final_cta_section = models.BooleanField(default=True)

    excursions_section_title = models.CharField(max_length=150, default="Top Experiences in Punta Cana", blank=True)
    excursions_section_subtitle = models.CharField(max_length=255, default="Handpicked adventures you’ll never forget.", blank=True)

    transfers_section_title = models.CharField(max_length=150, default="Transfers", blank=True)
    transfers_section_subtitle = models.CharField(max_length=255, default="Private, reliable rides — airport, hotels and long distance.", blank=True)

    tickets_section_title = models.CharField(max_length=150, default="Tickets & Attractions", blank=True)
    tickets_section_subtitle = models.CharField(max_length=255, default="Book tickets and attractions with secure reservation options.", blank=True)

    events_section_title = models.CharField(max_length=150, default="Events", blank=True)
    events_section_subtitle = models.CharField(max_length=255, default="Discover local events, shows and limited-date experiences.", blank=True)

    nightlife_section_title = models.CharField(max_length=150, default="Nightlife", blank=True)
    nightlife_section_subtitle = models.CharField(max_length=255, default="Nightlife tickets, premium experiences and evening activities.", blank=True)

    packages_section_title = models.CharField(max_length=150, default="Packages & Deals", blank=True)
    packages_section_subtitle = models.CharField(max_length=255, default="Bundles with better prices — VIP, family and adventure packages.", blank=True)

    ai_assistant_title = models.CharField(max_length=150, default="Meet Your Travel Assistant 🌴", blank=True)
    ai_assistant_subtitle = models.CharField(
        max_length=255,
        default="Ask anything — best experiences, pickup from your hotel, or quick recommendations.",
        blank=True,
    )

    final_cta_title = models.CharField(max_length=150, default="Ready to Start Your Adventure?", blank=True)
    final_cta_subtitle = models.CharField(
        max_length=255,
        default="Punta Cana Discovery makes booking simple, fast, and secure.",
        blank=True,
    )

    seo_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)
    canonical_url = models.URLField(blank=True)
    og_title = models.CharField(max_length=255, blank=True)
    og_description = models.TextField(blank=True)
    og_image = models.ImageField(
        upload_to="ticketing/public/seo/",
        blank=True,
        null=True,
    )

    robots_allow_indexing = models.BooleanField(default=True)
    robots_allow_ai_crawlers = models.BooleanField(default=True)
    allow_gptbot = models.BooleanField(default=True)
    allow_oai_searchbot = models.BooleanField(default=True)

    json_ld_local_business = models.JSONField(default=dict, blank=True)

    show_public_rankings = models.BooleanField(default=True)
    show_seller_public_pages = models.BooleanField(default=True)
    show_reviews = models.BooleanField(default=True)

    is_published = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean_custom_domain(self):
        if not self.custom_domain:
            self.custom_domain = None
            self.domain_status = "not_configured"
            self.aws_acm_certificate_arn = ""
            self.aws_acm_certificate_status = ""
            self.aws_acm_requested_at = None
            self.aws_acm_validation_record_name = ""
            self.aws_acm_validation_record_type = "CNAME"
            self.aws_acm_validation_record_value = ""
            self.cloudfront_alias_added_at = None
            self.dns_records_payload = []
            return

        domain = self.custom_domain.strip().lower()
        domain = domain.replace("https://", "").replace("http://", "")
        domain = domain.split("/")[0]
        domain = domain.split(":")[0]

        self.custom_domain = domain or None

        if self.custom_domain and self.domain_status == "not_configured":
            self.domain_status = "pending_aws_setup"

    def build_dns_records_payload(self):
        records = []

        if (
            self.aws_acm_validation_record_name
            and self.aws_acm_validation_record_value
        ):
            records.append(
                {
                    "purpose": "ssl_validation",
                    "label": "SSL Certificate Validation",
                    "type": self.aws_acm_validation_record_type or "CNAME",
                    "host": self.aws_acm_validation_record_name,
                    "value": self.aws_acm_validation_record_value,
                    "status": self.aws_acm_certificate_status or "PENDING_VALIDATION",
                }
            )

        if self.custom_domain and self.cloudfront_domain_name:
            records.append(
                {
                    "purpose": "website",
                    "label": "Website Domain",
                    "type": "CNAME",
                    "host": self.custom_domain,
                    "value": self.cloudfront_domain_name,
                    "status": self.domain_status,
                }
            )

        return records

    def refresh_dns_records_payload(self, save=False):
        self.dns_records_payload = self.build_dns_records_payload()

        if save:
            self.save(update_fields=["dns_records_payload", "updated_at"])

        return self.dns_records_payload

    def mark_domain_failed(self, message, save=True):
        self.domain_status = "failed"
        self.domain_error_message = str(message or "")

        if save:
            self.save(update_fields=["domain_status", "domain_error_message", "updated_at"])

    def mark_domain_active(self, save=True):
        self.domain_status = "active"
        self.domain_error_message = ""
        self.domain_verified_at = timezone.now()

        if save:
            self.save(
                update_fields=[
                    "domain_status",
                    "domain_error_message",
                    "domain_verified_at",
                    "updated_at",
                ]
            )

    def save(self, *args, **kwargs):
        self.clean_custom_domain()
        super().save(*args, **kwargs)

    @property
    def display_title(self):
        return self.site_title or self.organisation.name

    def __str__(self):
        return f"Ticketing Public Site - {self.organisation.name}"

    class Meta:
        verbose_name = "Ticketing Public Site Settings"
        verbose_name_plural = "Ticketing Public Site Settings"


class ExperienceCategory(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_categories",
    )

    name = models.CharField(max_length=120)
    slug = models.SlugField()
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to="ticketing/categories/",
        blank=True,
        null=True,
    )

    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    seo_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["sort_order", "name"]
        unique_together = ("organisation", "slug")
        verbose_name = "Experience Category"
        verbose_name_plural = "Experience Categories"


class ExperienceProduct(models.Model):
    PRODUCT_TYPE_CHOICES = (
        ("excursion", "Excursion"),
        ("transfer", "Transfer"),
        ("ticket", "Ticket"),
        ("event", "Event"),
        ("nightlife", "Nightlife"),
        ("custom", "Custom Experience"),
    )

    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("active", "Active"),
        ("inactive", "Inactive"),
        ("sold_out", "Sold Out"),
        ("archived", "Archived"),
    )

    EXTERNAL_PROVIDER_CHOICES = (
        ("local", "Local"),
        ("wellet", "Wellet / Coco Bongo"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_products",
    )

    category = models.ForeignKey(
        ExperienceCategory,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="products",
    )

    name = models.CharField(max_length=255)
    slug = models.SlugField()
    product_type = models.CharField(
        max_length=30,
        choices=PRODUCT_TYPE_CHOICES,
        db_index=True,
    )

    sku = models.CharField(max_length=100, blank=True, null=True)

    external_provider = models.CharField(
        max_length=30,
        choices=EXTERNAL_PROVIDER_CHOICES,
        default="local",
        db_index=True,
    )

    external_product_id = models.CharField(max_length=150, blank=True, null=True)
    is_cocobongo_product = models.BooleanField(default=False)

    short_description = models.TextField(blank=True)
    long_description = models.TextField(blank=True)

    image = models.ImageField(
        upload_to="ticketing/products/",
        blank=True,
        null=True,
    )

    gallery = models.JSONField(
        default=list,
        blank=True,
        help_text="List of image URLs or media objects.",
    )

    base_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    deposit_percentage = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    capacity = models.PositiveIntegerField(default=0)
    duration_text = models.CharField(max_length=120, blank=True)

    start_time = models.TimeField(blank=True, null=True)
    end_time = models.TimeField(blank=True, null=True)

    location = models.CharField(max_length=255, blank=True)
    address = models.TextField(blank=True)
    google_maps_link = models.URLField(blank=True)

    itinerary = models.JSONField(default=list, blank=True)
    includes = models.JSONField(default=list, blank=True)
    excludes = models.JSONField(default=list, blank=True)
    faqs = models.JSONField(default=list, blank=True)

    cancellation_policy = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    pickup_instructions = models.TextField(blank=True)

    supports_pickup = models.BooleanField(default=False)
    requires_pickup_location = models.BooleanField(default=False)

    allow_full_payment = models.BooleanField(default=True)
    allow_deposit_payment = models.BooleanField(default=True)
    allow_pending_payment = models.BooleanField(default=True)
    allow_cash_payment = models.BooleanField(default=True)

    seller_enabled = models.BooleanField(default=True)
    public_enabled = models.BooleanField(default=True)

    is_featured = models.BooleanField(default=False)
    is_recommended = models.BooleanField(default=False)
    is_top_excursion = models.BooleanField(default=False)
    is_top_transfer = models.BooleanField(default=False)
    is_best_seller = models.BooleanField(default=False)

    event_date = models.DateField(blank=True, null=True)
    event_start_datetime = models.DateTimeField(blank=True, null=True)
    event_end_datetime = models.DateTimeField(blank=True, null=True)
    event_age_restriction = models.CharField(max_length=100, blank=True)
    event_dress_code = models.CharField(max_length=255, blank=True)
    event_organizer_contact = models.CharField(max_length=255, blank=True)

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="draft",
        db_index=True,
    )

    seo_title = models.CharField(max_length=255, blank=True)
    meta_description = models.TextField(blank=True)
    canonical_url = models.URLField(blank=True)
    og_title = models.CharField(max_length=255, blank=True)
    og_description = models.TextField(blank=True)
    twitter_title = models.CharField(max_length=255, blank=True)
    twitter_description = models.TextField(blank=True)
    image_alt_text = models.CharField(max_length=255, blank=True)
    keywords_tags = models.JSONField(default=list, blank=True)
    json_ld_override = models.JSONField(default=dict, blank=True)

    view_count = models.PositiveIntegerField(default=0)
    booking_count = models.PositiveIntegerField(default=0)
    average_rating = models.DecimalField(max_digits=3, decimal_places=2, default=Decimal("0.00"))
    review_count = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True, db_index=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_products_created",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def profit_per_unit(self):
        return self.base_price - self.cost_price

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = (
            ("organisation", "slug"),
            ("organisation", "sku"),
        )
        indexes = [
            models.Index(fields=["organisation", "product_type"]),
            models.Index(fields=["organisation", "status"]),
            models.Index(fields=["organisation", "public_enabled"]),
        ]



class ProductGalleryImage(models.Model):
    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="gallery_images",
    )

    image = models.ImageField(
        upload_to="ticketing/products/gallery/",
    )

    alt_text = models.CharField(max_length=255, blank=True)
    caption = models.CharField(max_length=255, blank=True)

    sort_order = models.PositiveIntegerField(default=0)
    is_cover = models.BooleanField(
        default=False,
        help_text="If true, this image can be used as the main public cover image.",
    )
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def organisation(self):
        return self.product.organisation

    def __str__(self):
        return f"{self.product.name} - Image {self.id}"

    class Meta:
        ordering = ["sort_order", "id"]
        indexes = [
            models.Index(fields=["product", "is_active"]),
            models.Index(fields=["product", "sort_order"]),
        ]


class ExperiencePackage(models.Model):
    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="packages",
    )

    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)

    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    capacity = models.PositiveIntegerField(default=0)

    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    sort_order = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def organisation(self):
        return self.product.organisation

    def __str__(self):
        return f"{self.product.name} - {self.name}"

    class Meta:
        ordering = ["sort_order", "price"]


class ProductAvailability(models.Model):
    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="availability",
    )

    package = models.ForeignKey(
        ExperiencePackage,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="availability",
    )

    date = models.DateField(db_index=True)

    available_capacity = models.PositiveIntegerField(default=0)
    booked_quantity = models.PositiveIntegerField(default=0)

    price_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    deposit_override = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
    )

    is_available = models.BooleanField(default=True, db_index=True)
    note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def remaining_capacity(self):
        remaining = self.available_capacity - self.booked_quantity
        return max(remaining, 0)

    def __str__(self):
        return f"{self.product.name} - {self.date}"

    class Meta:
        ordering = ["date"]
        unique_together = ("product", "package", "date")


class PickupZone(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_pickup_zones",
    )

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = ("organisation", "name")


class PickupLocation(models.Model):
    LOCATION_TYPE_CHOICES = (
        ("hotel", "Hotel"),
        ("airport", "Airport"),
        ("meeting_point", "Meeting Point"),
        ("private_address", "Private Address"),
        ("other", "Other"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_pickup_locations",
    )

    zone = models.ForeignKey(
        PickupZone,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="locations",
    )

    name = models.CharField(max_length=180)
    slug = models.SlugField()
    location_type = models.CharField(
        max_length=30,
        choices=LOCATION_TYPE_CHOICES,
        default="hotel",
    )

    address = models.TextField(blank=True)
    default_pickup_point = models.CharField(max_length=255, blank=True)
    default_instructions = models.TextField(blank=True)
    google_maps_link = models.URLField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        unique_together = ("organisation", "slug")


class ProductPickupSchedule(models.Model):
    DAY_CHOICES = (
        (0, "Monday"),
        (1, "Tuesday"),
        (2, "Wednesday"),
        (3, "Thursday"),
        (4, "Friday"),
        (5, "Saturday"),
        (6, "Sunday"),
    )

    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="pickup_schedules",
    )

    pickup_location = models.ForeignKey(
        PickupLocation,
        on_delete=models.CASCADE,
        related_name="product_schedules",
    )

    day_of_week = models.PositiveSmallIntegerField(
        choices=DAY_CHOICES,
        null=True,
        blank=True,
        help_text="Use this for recurring schedules. Monday is 0.",
    )

    specific_date = models.DateField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Use this for special date overrides.",
    )

    pickup_time = models.TimeField()
    pickup_point = models.CharField(max_length=255, blank=True)
    instructions = models.TextField(blank=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def applies_to_date(self, service_date):
        if self.specific_date:
            return self.specific_date == service_date

        if self.day_of_week is not None:
            return self.day_of_week == service_date.weekday()

        return True

    @property
    def resolved_pickup_point(self):
        return self.pickup_point or self.pickup_location.default_pickup_point

    def __str__(self):
        return f"{self.product.name} - {self.pickup_location.name} - {self.pickup_time}"

    class Meta:
        ordering = ["pickup_time"]
        indexes = [
            models.Index(fields=["specific_date"]),
            models.Index(fields=["day_of_week"]),
        ]


class Customer(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_customers",
    )

    full_name = models.CharField(max_length=150)
    whatsapp = models.CharField(max_length=30, blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)

    hotel_name = models.CharField(max_length=180, blank=True)
    notes = models.TextField(blank=True)

    total_bookings = models.PositiveIntegerField(default=0)
    total_spent = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name

    class Meta:
        ordering = ["full_name"]
        indexes = [
            models.Index(fields=["organisation", "whatsapp"]),
            models.Index(fields=["organisation", "email"]),
        ]


class Seller(models.Model):
    ROLE_CHOICES = (
        ("owner", "Owner"),
        ("manager", "Manager"),
        ("supervisor", "Supervisor"),
        ("seller", "Seller"),
        ("external_vendor", "External Vendor"),
        ("driver", "Driver"),
        ("viewer", "Viewer"),
    )

    PERMISSION_FIELDS = (
        "can_access_dashboard",
        "can_sell_cocobongo",
        "can_sell_excursions",
        "can_sell_transfers",
        "can_sell_events",
        "can_sell_custom_tours",
        "can_create_bookings",
        "can_take_deposits",
        "can_take_full_payments",
        "can_collect_cash_payment",
        "can_generate_ticket_without_customer_online_payment",
        "can_mark_customer_deposit_paid",
        "can_mark_customer_full_paid",
        "can_pay_full_amount_as_seller",
        "can_pay_deposit_as_seller",
        "can_pay_commission_only",
        "can_create_pending_payment_booking",
        "can_request_supervisor_approval",
        "can_send_receipt_before_full_payment",
        "can_view_own_sales",
        "can_view_own_commissions",
        "can_apply_discounts",
        "can_cancel_bookings",
        "can_send_whatsapp",
        "can_send_email",
        "can_override_pickup_time",
        "can_view_reports",
        "can_manage_products",
        "can_manage_sellers",
        "can_manage_settings",
        "can_manage_integrations",
    )

    ROLE_DEFAULT_PERMISSIONS = {
        "owner": {field: True for field in PERMISSION_FIELDS},
        "manager": {
            "can_access_dashboard": True,
            "can_sell_cocobongo": True,
            "can_sell_excursions": True,
            "can_sell_transfers": True,
            "can_sell_events": True,
            "can_sell_custom_tours": True,
            "can_create_bookings": True,
            "can_take_deposits": True,
            "can_take_full_payments": True,
            "can_collect_cash_payment": True,
            "can_generate_ticket_without_customer_online_payment": True,
            "can_mark_customer_deposit_paid": True,
            "can_mark_customer_full_paid": True,
            "can_pay_full_amount_as_seller": True,
            "can_pay_deposit_as_seller": True,
            "can_pay_commission_only": True,
            "can_create_pending_payment_booking": True,
            "can_request_supervisor_approval": True,
            "can_send_receipt_before_full_payment": True,
            "can_view_own_sales": True,
            "can_view_own_commissions": True,
            "can_apply_discounts": True,
            "can_cancel_bookings": True,
            "can_send_whatsapp": True,
            "can_send_email": True,
            "can_override_pickup_time": True,
            "can_view_reports": True,
            "can_manage_products": True,
            "can_manage_sellers": True,
            "can_manage_settings": False,
            "can_manage_integrations": False,
        },
        "supervisor": {
            "can_access_dashboard": True,
            "can_sell_cocobongo": True,
            "can_sell_excursions": True,
            "can_sell_transfers": True,
            "can_sell_events": True,
            "can_sell_custom_tours": True,
            "can_create_bookings": True,
            "can_take_deposits": True,
            "can_take_full_payments": True,
            "can_collect_cash_payment": True,
            "can_generate_ticket_without_customer_online_payment": True,
            "can_mark_customer_deposit_paid": True,
            "can_mark_customer_full_paid": True,
            "can_pay_full_amount_as_seller": True,
            "can_pay_deposit_as_seller": True,
            "can_pay_commission_only": True,
            "can_create_pending_payment_booking": True,
            "can_request_supervisor_approval": True,
            "can_send_receipt_before_full_payment": True,
            "can_view_own_sales": True,
            "can_view_own_commissions": True,
            "can_apply_discounts": True,
            "can_cancel_bookings": True,
            "can_send_whatsapp": True,
            "can_send_email": True,
            "can_override_pickup_time": True,
            "can_view_reports": True,
            "can_manage_products": False,
            "can_manage_sellers": False,
            "can_manage_settings": False,
            "can_manage_integrations": False,
        },
        "seller": {
            "can_access_dashboard": True,
            "can_sell_cocobongo": False,
            "can_sell_excursions": True,
            "can_sell_transfers": True,
            "can_sell_events": True,
            "can_sell_custom_tours": True,
            "can_create_bookings": True,
            "can_take_deposits": True,
            "can_take_full_payments": True,
            "can_collect_cash_payment": True,
            "can_generate_ticket_without_customer_online_payment": False,
            "can_mark_customer_deposit_paid": True,
            "can_mark_customer_full_paid": False,
            "can_pay_full_amount_as_seller": False,
            "can_pay_deposit_as_seller": True,
            "can_pay_commission_only": False,
            "can_create_pending_payment_booking": True,
            "can_request_supervisor_approval": True,
            "can_send_receipt_before_full_payment": False,
            "can_view_own_sales": True,
            "can_view_own_commissions": True,
            "can_apply_discounts": False,
            "can_cancel_bookings": False,
            "can_send_whatsapp": True,
            "can_send_email": True,
            "can_override_pickup_time": False,
            "can_view_reports": False,
            "can_manage_products": False,
            "can_manage_sellers": False,
            "can_manage_settings": False,
            "can_manage_integrations": False,
        },
        "external_vendor": {
            "can_access_dashboard": True,
            "can_sell_cocobongo": False,
            "can_sell_excursions": True,
            "can_sell_transfers": True,
            "can_sell_events": True,
            "can_sell_custom_tours": True,
            "can_create_bookings": True,
            "can_take_deposits": False,
            "can_take_full_payments": False,
            "can_collect_cash_payment": True,
            "can_generate_ticket_without_customer_online_payment": False,
            "can_mark_customer_deposit_paid": False,
            "can_mark_customer_full_paid": False,
            "can_pay_full_amount_as_seller": False,
            "can_pay_deposit_as_seller": False,
            "can_pay_commission_only": False,
            "can_create_pending_payment_booking": True,
            "can_request_supervisor_approval": True,
            "can_send_receipt_before_full_payment": False,
            "can_view_own_sales": True,
            "can_view_own_commissions": True,
            "can_apply_discounts": False,
            "can_cancel_bookings": False,
            "can_send_whatsapp": True,
            "can_send_email": False,
            "can_override_pickup_time": False,
            "can_view_reports": False,
            "can_manage_products": False,
            "can_manage_sellers": False,
            "can_manage_settings": False,
            "can_manage_integrations": False,
        },
        "driver": {
            "can_access_dashboard": True,
            "can_sell_cocobongo": False,
            "can_sell_excursions": False,
            "can_sell_transfers": False,
            "can_sell_events": False,
            "can_sell_custom_tours": False,
            "can_create_bookings": False,
            "can_take_deposits": False,
            "can_take_full_payments": False,
            "can_collect_cash_payment": False,
            "can_generate_ticket_without_customer_online_payment": False,
            "can_mark_customer_deposit_paid": False,
            "can_mark_customer_full_paid": False,
            "can_pay_full_amount_as_seller": False,
            "can_pay_deposit_as_seller": False,
            "can_pay_commission_only": False,
            "can_create_pending_payment_booking": False,
            "can_request_supervisor_approval": False,
            "can_send_receipt_before_full_payment": False,
            "can_view_own_sales": False,
            "can_view_own_commissions": False,
            "can_apply_discounts": False,
            "can_cancel_bookings": False,
            "can_send_whatsapp": False,
            "can_send_email": False,
            "can_override_pickup_time": False,
            "can_view_reports": False,
            "can_manage_products": False,
            "can_manage_sellers": False,
            "can_manage_settings": False,
            "can_manage_integrations": False,
        },
        "viewer": {field: False for field in PERMISSION_FIELDS},
    }

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_sellers",
    )

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_seller_profiles",
    )

    full_name = models.CharField(max_length=150)
    seller_slug = models.SlugField()

    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="seller")

    email = models.EmailField(blank=True, null=True)
    phone = models.CharField(max_length=30, blank=True, null=True)
    whatsapp = models.CharField(max_length=30, blank=True, null=True)

    photo = models.ImageField(
        upload_to="ticketing/sellers/",
        blank=True,
        null=True,
    )

    commission_rate = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("0.00"),
        help_text="Percentage commission. Example: 10.00 means 10%.",
    )

    fixed_commission_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=Decimal("0.00"),
    )

    can_access_dashboard = models.BooleanField(default=False)
    can_sell_cocobongo = models.BooleanField(default=False)
    can_sell_excursions = models.BooleanField(default=False)
    can_sell_transfers = models.BooleanField(default=False)
    can_sell_events = models.BooleanField(default=False)
    can_sell_custom_tours = models.BooleanField(default=False)
    can_create_bookings = models.BooleanField(default=False)
    can_take_deposits = models.BooleanField(default=False)
    can_take_full_payments = models.BooleanField(default=False)
    can_collect_cash_payment = models.BooleanField(default=False)
    can_generate_ticket_without_customer_online_payment = models.BooleanField(default=False)
    can_mark_customer_deposit_paid = models.BooleanField(default=False)
    can_mark_customer_full_paid = models.BooleanField(default=False)
    can_pay_full_amount_as_seller = models.BooleanField(default=False)
    can_pay_deposit_as_seller = models.BooleanField(default=False)
    can_pay_commission_only = models.BooleanField(default=False)
    can_create_pending_payment_booking = models.BooleanField(default=False)
    can_request_supervisor_approval = models.BooleanField(default=False)
    can_send_receipt_before_full_payment = models.BooleanField(default=False)
    can_view_own_sales = models.BooleanField(default=True)
    can_view_own_commissions = models.BooleanField(default=True)
    can_apply_discounts = models.BooleanField(default=False)
    can_cancel_bookings = models.BooleanField(default=False)
    can_send_whatsapp = models.BooleanField(default=False)
    can_send_email = models.BooleanField(default=False)
    can_override_pickup_time = models.BooleanField(default=False)
    can_view_reports = models.BooleanField(default=False)
    can_manage_products = models.BooleanField(default=False)
    can_manage_sellers = models.BooleanField(default=False)
    can_manage_settings = models.BooleanField(default=False)
    can_manage_integrations = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True, db_index=True)

    total_sales_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_collected_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_owed_to_company = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def apply_role_default_permissions(self):
        permissions = self.ROLE_DEFAULT_PERMISSIONS.get(self.role, {})

        for field in self.PERMISSION_FIELDS:
            setattr(self, field, permissions.get(field, False))

    def get_permissions_dict(self):
        return {
            field: getattr(self, field)
            for field in self.PERMISSION_FIELDS
        }

    def has_permission(self, permission_name):
        if self.role == "owner":
            return True

        if permission_name not in self.PERMISSION_FIELDS:
            return False

        return bool(getattr(self, permission_name, False))

    @property
    def public_path(self):
        return f"/s/{self.seller_slug}"

    def save(self, *args, **kwargs):
        if not self.seller_slug:
            base_slug = slugify(self.full_name) or "seller"
            self.seller_slug = f"{base_slug}-{uuid.uuid4().hex[:6]}"

        super().save(*args, **kwargs)

    def __str__(self):
        return self.full_name

    class Meta:
        ordering = ["full_name"]
        unique_together = ("organisation", "seller_slug")


class TransferRoute(models.Model):
    VEHICLE_TYPE_CHOICES = (
        ("standard_car", "Standard Car"),
        ("suv", "SUV"),
        ("van", "Van"),
        ("minibus", "Minibus"),
        ("bus", "Bus"),
        ("luxury", "Luxury"),
        ("other", "Other"),
    )

    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="transfer_routes",
    )

    origin = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)

    airport = models.CharField(max_length=120, blank=True)
    vehicle_type = models.CharField(
        max_length=50,
        choices=VEHICLE_TYPE_CHOICES,
        default="van",
    )

    is_round_trip = models.BooleanField(default=False)

    base_passengers = models.PositiveIntegerField(default=1)
    max_passengers = models.PositiveIntegerField(default=1)

    price = models.DecimalField(max_digits=12, decimal_places=2)
    round_trip_price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def organisation(self):
        return self.product.organisation

    def __str__(self):
        return f"{self.origin} → {self.destination}"

    class Meta:
        ordering = ["origin", "destination"]


class EventTicketType(models.Model):
    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="event_ticket_types",
    )

    name = models.CharField(max_length=120)
    description = models.TextField(blank=True)

    price = models.DecimalField(max_digits=12, decimal_places=2)
    deposit_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    capacity = models.PositiveIntegerField(default=0)
    sold_quantity = models.PositiveIntegerField(default=0)

    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)

    @property
    def available_tickets(self):
        remaining = self.capacity - self.sold_quantity
        return max(remaining, 0)

    @property
    def organisation(self):
        return self.product.organisation

    def __str__(self):
        return f"{self.product.name} - {self.name}"

    class Meta:
        ordering = ["sort_order", "price"]


class ExternalProviderConfig(models.Model):
    PROVIDER_CHOICES = (
        ("wellet", "Wellet / Coco Bongo"),
        ("other", "Other"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_external_provider_configs",
    )

    provider = models.CharField(max_length=50, choices=PROVIDER_CHOICES)

    is_enabled = models.BooleanField(default=False)

    api_base_url = models.URLField(blank=True)
    api_key = models.CharField(max_length=255, blank=True)
    api_secret = models.CharField(max_length=255, blank=True)

    show_id = models.CharField(max_length=100, blank=True)
    category_id = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=10, default="USD")
    lang = models.CharField(max_length=10, default="en")
    include_table = models.BooleanField(default=False)

    extra_settings = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.provider} - {self.organisation.name}"

    class Meta:
        unique_together = ("organisation", "provider")


class TicketingPaymentProviderSettings(models.Model):
    DEFAULT_PROVIDER_CHOICES = (
        ("stripe", "Stripe"),
        ("paypal", "PayPal"),
        ("none", "None"),
    )

    STRIPE_CONNECT_STATUS_CHOICES = (
        ("not_connected", "Not Connected"),
        ("pending", "Pending"),
        ("connected", "Connected"),
        ("restricted", "Restricted"),
    )

    PAYPAL_MODE_CHOICES = (
        ("sandbox", "Sandbox"),
        ("live", "Live"),
    )

    organisation = models.OneToOneField(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_payment_provider_settings",
    )

    default_provider = models.CharField(
        max_length=20,
        choices=DEFAULT_PROVIDER_CHOICES,
        default="none",
    )

    stripe_enabled = models.BooleanField(default=False)
    stripe_publishable_key = models.CharField(max_length=255, blank=True)
    stripe_secret_key = models.CharField(max_length=255, blank=True)
    stripe_webhook_secret = models.CharField(max_length=255, blank=True)

    stripe_connect_account_id = models.CharField(max_length=255, blank=True)
    stripe_connect_status = models.CharField(
        max_length=30,
        choices=STRIPE_CONNECT_STATUS_CHOICES,
        default="not_connected",
    )

    paypal_enabled = models.BooleanField(default=False)
    paypal_mode = models.CharField(
        max_length=20,
        choices=PAYPAL_MODE_CHOICES,
        default="sandbox",
    )
    paypal_client_id = models.CharField(max_length=255, blank=True)
    paypal_client_secret = models.CharField(max_length=255, blank=True)
    paypal_merchant_id = models.CharField(max_length=255, blank=True)
    paypal_webhook_id = models.CharField(max_length=255, blank=True)

    payment_success_message = models.CharField(
        max_length=255,
        default="Payment received. Your booking is confirmed.",
        blank=True,
    )
    payment_pending_message = models.CharField(
        max_length=255,
        default="Your booking was created. Payment is pending confirmation.",
        blank=True,
    )

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def has_stripe_credentials(self):
        return bool(self.stripe_enabled and self.stripe_secret_key)

    @property
    def has_paypal_credentials(self):
        return bool(
            self.paypal_enabled
            and self.paypal_client_id
            and self.paypal_client_secret
        )

    def __str__(self):
        return f"Payment Providers - {self.organisation.name}"

    class Meta:
        verbose_name = "Ticketing Payment Provider Settings"
        verbose_name_plural = "Ticketing Payment Provider Settings"


class ExternalProviderProductSnapshot(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_external_product_snapshots",
    )

    provider = models.CharField(max_length=50, default="wellet")

    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="external_snapshots",
    )

    external_product_id = models.CharField(max_length=150, blank=True)
    external_name = models.CharField(max_length=255, blank=True)

    price = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    currency = models.CharField(max_length=10, default="USD")

    service_date = models.DateField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f"{self.provider} snapshot - {self.external_name or self.external_product_id}"

    class Meta:
        ordering = ["-created_at"]


class Booking(models.Model):
    STATUS_CHOICES = (
        ("draft", "Draft"),
        ("pending_payment", "Pending Payment"),
        ("pending_approval", "Pending Approval"),
        ("confirmed", "Confirmed"),
        ("ticket_generated", "Ticket Generated"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
        ("refunded", "Refunded"),
        ("no_show", "No Show"),
    )

    PAYMENT_STATUS_CHOICES = (
        ("unpaid", "Unpaid"),
        ("pending", "Pending"),
        ("deposit_paid", "Deposit Paid"),
        ("partially_paid", "Partially Paid"),
        ("paid", "Paid"),
        ("refunded", "Refunded"),
    )

    PAYMENT_MODE_CHOICES = (
        ("customer_full_online", "Customer Full Online"),
        ("customer_deposit_online", "Customer Deposit Online"),
        ("customer_cash_to_seller", "Customer Cash To Seller"),
        ("seller_full_payment", "Seller Full Payment"),
        ("seller_deposit_payment", "Seller Deposit Payment"),
        ("seller_commission_only", "Seller Commission Only"),
        ("pending_payment", "Pending Payment"),
        ("requires_supervisor_approval", "Requires Supervisor Approval"),
        ("manual_bank_transfer", "Manual Bank Transfer"),
        ("mixed_payment", "Mixed Payment"),
    )

    SOURCE_CHOICES = (
        ("public_site", "Public Site"),
        ("seller_dashboard", "Seller Dashboard"),
        ("seller_public_link", "Seller Public Link"),
        ("owner_dashboard", "Owner Dashboard"),
        ("external_provider", "External Provider"),
    )

    PAYMENT_METHOD_CHOICES = (
        ("cash", "Cash"),
        ("card", "Card"),
        ("online", "Online"),
        ("stripe", "Stripe"),
        ("paypal", "PayPal"),
        ("bank_transfer", "Bank Transfer"),
        ("seller_collected", "Seller Collected"),
        ("mixed", "Mixed"),
        ("none", "None"),
    )

    TRANSFER_STATUS_CHOICES = (
        ("not_applicable", "Not Applicable"),
        ("pending_assignment", "Pending Assignment"),
        ("assigned_to_driver", "Assigned To Driver"),
        ("driver_on_way", "Driver On Way"),
        ("picked_up", "Picked Up"),
        ("dropped_off", "Dropped Off"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_bookings",
    )

    booking_code = models.CharField(max_length=50, unique=True, blank=True)

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )

    seller = models.ForeignKey(
        Seller,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )

    primary_product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="bookings",
    )

    source = models.CharField(
        max_length=30,
        choices=SOURCE_CHOICES,
        default="owner_dashboard",
        db_index=True,
    )

    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default="pending_payment",
        db_index=True,
    )

    payment_status = models.CharField(
        max_length=30,
        choices=PAYMENT_STATUS_CHOICES,
        default="unpaid",
        db_index=True,
    )

    payment_mode = models.CharField(
        max_length=50,
        choices=PAYMENT_MODE_CHOICES,
        default="pending_payment",
        db_index=True,
    )

    payment_method = models.CharField(
        max_length=30,
        choices=PAYMENT_METHOD_CHOICES,
        default="none",
        db_index=True,
    )

    service_date = models.DateField(null=True, blank=True, db_index=True)
    service_time = models.TimeField(null=True, blank=True)

    customer_name = models.CharField(max_length=150)
    customer_whatsapp = models.CharField(max_length=30, blank=True, null=True)
    customer_email = models.EmailField(blank=True, null=True)
    customer_hotel = models.CharField(max_length=180, blank=True)
    customer_notes = models.TextField(blank=True)

    adults = models.PositiveIntegerField(default=1)
    children = models.PositiveIntegerField(default=0)
    infants = models.PositiveIntegerField(default=0)
    total_guests = models.PositiveIntegerField(default=1)

    subtotal_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    deposit_required = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    deposit_paid = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    balance_due = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    seller_collected_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    seller_due_to_company = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    seller_commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    commission_paid_amount = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))

    requires_supervisor_approval = models.BooleanField(default=False)
    supervisor_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_bookings_approved",
    )
    supervisor_approved_at = models.DateTimeField(null=True, blank=True)
    supervisor_notes = models.TextField(blank=True)

    receipt_sent_before_full_payment = models.BooleanField(default=False)

    transfer_origin = models.CharField(max_length=255, blank=True)
    transfer_destination = models.CharField(max_length=255, blank=True)
    transfer_airport = models.CharField(max_length=120, blank=True)
    transfer_flight_number = models.CharField(max_length=80, blank=True)
    transfer_vehicle_type = models.CharField(max_length=80, blank=True)
    transfer_round_trip = models.BooleanField(default=False)
    transfer_return_date = models.DateField(null=True, blank=True)
    transfer_return_time = models.TimeField(null=True, blank=True)
    transfer_status = models.CharField(
        max_length=40,
        choices=TRANSFER_STATUS_CHOICES,
        default="not_applicable",
    )

    driver_name = models.CharField(max_length=150, blank=True)
    driver_phone = models.CharField(max_length=30, blank=True)

    external_provider = models.CharField(max_length=50, blank=True)
    external_reference = models.CharField(max_length=150, blank=True)

    external_order_id = models.CharField(max_length=150, blank=True)
    external_booking_id = models.CharField(max_length=150, blank=True)
    external_status = models.CharField(max_length=80, blank=True)
    external_currency = models.CharField(max_length=10, blank=True)

    external_validation_response = models.JSONField(default=dict, blank=True)
    external_raw_response = models.JSONField(default=dict, blank=True)
    external_order_created_at = models.DateTimeField(null=True, blank=True)

    cancellation_reason = models.TextField(blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_bookings_created",
    )

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    confirmed_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    @property
    def is_fully_paid(self):
        return self.payment_status == "paid" or self.balance_due <= Decimal("0.00")

    @property
    def commission_pending_amount(self):
        pending = self.seller_commission_amount - self.commission_paid_amount
        return max(pending, Decimal("0.00"))

    def generate_booking_code(self):
        return f"PCD-{uuid.uuid4().hex[:8].upper()}"

    def recalculate_balance_due(self):
        paid_amount = self.deposit_paid
        self.balance_due = max(self.total_amount - paid_amount, Decimal("0.00"))

    def save(self, *args, **kwargs):
        if not self.booking_code:
            self.booking_code = self.generate_booking_code()

        self.total_guests = self.adults + self.children + self.infants

        super().save(*args, **kwargs)

    def __str__(self):
        return self.booking_code

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "status"]),
            models.Index(fields=["organisation", "payment_status"]),
            models.Index(fields=["organisation", "service_date"]),
            models.Index(fields=["organisation", "booking_code"]),
        ]


class BookingItem(models.Model):
    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="items",
    )

    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_items",
    )

    package = models.ForeignKey(
        ExperiencePackage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_items",
    )

    event_ticket_type = models.ForeignKey(
        EventTicketType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_items",
    )

    external_snapshot = models.ForeignKey(
        ExternalProviderProductSnapshot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_items",
    )
    external_provider = models.CharField(max_length=50, blank=True)
    external_product_id = models.CharField(max_length=150, blank=True)
    external_variant_id = models.CharField(max_length=150, blank=True)
    external_availability_id = models.CharField(max_length=150, blank=True)
    external_option_name = models.CharField(max_length=255, blank=True)
    external_raw_data = models.JSONField(default=dict, blank=True)

    product_name = models.CharField(max_length=255)
    product_type = models.CharField(max_length=30, blank=True)

    service_date = models.DateField(null=True, blank=True)
    service_time = models.TimeField(null=True, blank=True)

    quantity = models.PositiveIntegerField(default=1)

    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal("0.00"))
    total = models.DecimalField(max_digits=12, decimal_places=2)

    instructions = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def profit(self):
        return (self.unit_price - self.unit_cost) * self.quantity

    def save(self, *args, **kwargs):
        self.total = self.unit_price * self.quantity

        if self.product and not self.product_type:
            self.product_type = self.product.product_type

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.product_name} x {self.quantity}"

    class Meta:
        ordering = ["-created_at"]


class BookingPickupInfo(models.Model):
    booking = models.OneToOneField(
        Booking,
        on_delete=models.CASCADE,
        related_name="pickup_info",
    )

    pickup_location = models.ForeignKey(
        PickupLocation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_pickups",
    )

    pickup_schedule = models.ForeignKey(
        ProductPickupSchedule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="booking_pickups",
    )

    pickup_zone_name = models.CharField(max_length=120, blank=True)
    hotel_or_location_name = models.CharField(max_length=180)
    pickup_time = models.TimeField(null=True, blank=True)
    pickup_point = models.CharField(max_length=255, blank=True)
    instructions = models.TextField(blank=True)

    was_overridden = models.BooleanField(default=False)
    override_reason = models.TextField(blank=True)

    overridden_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_pickup_overrides",
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def apply_schedule(self, schedule):
        self.pickup_schedule = schedule
        self.pickup_location = schedule.pickup_location
        self.hotel_or_location_name = schedule.pickup_location.name
        self.pickup_zone_name = schedule.pickup_location.zone.name if schedule.pickup_location.zone else ""
        self.pickup_time = schedule.pickup_time
        self.pickup_point = schedule.resolved_pickup_point
        self.instructions = schedule.instructions or schedule.pickup_location.default_instructions

    def __str__(self):
        return f"{self.booking.booking_code} - {self.hotel_or_location_name}"


class BookingPayment(models.Model):
    PAYMENT_TYPE_CHOICES = (
        ("full", "Full Payment"),
        ("deposit", "Deposit"),
        ("balance", "Balance"),
        ("commission_only", "Commission Only"),
        ("partial", "Partial"),
        ("refund", "Refund"),
    )

    PAYER_TYPE_CHOICES = (
        ("customer", "Customer"),
        ("seller", "Seller"),
        ("company", "Company"),
    )

    METHOD_CHOICES = (
        ("cash", "Cash"),
        ("card", "Card"),
        ("online", "Online"),
        ("stripe", "Stripe"),
        ("paypal", "PayPal"),
        ("bank_transfer", "Bank Transfer"),
        ("seller_balance", "Seller Balance"),
        ("other", "Other"),
    )

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("confirmed", "Confirmed"),
        ("failed", "Failed"),
        ("refunded", "Refunded"),
        ("cancelled", "Cancelled"),
    )

    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="payments",
    )

    seller = models.ForeignKey(
        Seller,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="payments_collected",
    )

    collected_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_payments_collected",
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    payment_type = models.CharField(max_length=30, choices=PAYMENT_TYPE_CHOICES)
    payer_type = models.CharField(max_length=30, choices=PAYER_TYPE_CHOICES, default="customer")
    method = models.CharField(max_length=30, choices=METHOD_CHOICES)
    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="confirmed")

    provider = models.CharField(max_length=30, blank=True, db_index=True)
    provider_payment_id = models.CharField(max_length=255, blank=True)
    provider_checkout_id = models.CharField(max_length=255, blank=True, db_index=True)
    provider_order_id = models.CharField(max_length=255, blank=True, db_index=True)
    provider_capture_id = models.CharField(max_length=255, blank=True)
    provider_status = models.CharField(max_length=80, blank=True)
    provider_response = models.JSONField(default=dict, blank=True)

    reference = models.CharField(max_length=150, blank=True)
    note = models.TextField(blank=True)

    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.booking.booking_code} - {self.amount}"

    class Meta:
        ordering = ["-paid_at"]


class SellerCommission(models.Model):
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("paid", "Paid"),
        ("cancelled", "Cancelled"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_seller_commissions",
    )

    seller = models.ForeignKey(
        Seller,
        on_delete=models.CASCADE,
        related_name="commissions",
    )

    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        related_name="commissions",
    )

    amount = models.DecimalField(max_digits=12, decimal_places=2)
    rate_used = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0.00"))

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending", db_index=True)

    paid_at = models.DateTimeField(null=True, blank=True)
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ticketing_commissions_paid",
    )

    note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f"{self.seller.full_name} - {self.booking.booking_code} - {self.amount}"

    class Meta:
        ordering = ["-created_at"]
        unique_together = ("seller", "booking")


class Receipt(models.Model):
    booking = models.OneToOneField(
        Booking,
        on_delete=models.CASCADE,
        related_name="receipt",
    )

    receipt_number = models.CharField(max_length=50, unique=True, blank=True)

    receipt_data = models.JSONField(default=dict, blank=True)

    pdf_file = models.FileField(
        upload_to="ticketing/receipts/",
        blank=True,
        null=True,
    )

    public_url_token = models.CharField(max_length=80, blank=True)

    sent_by_email = models.BooleanField(default=False)
    sent_by_whatsapp = models.BooleanField(default=False)

    email_sent_at = models.DateTimeField(null=True, blank=True)
    whatsapp_sent_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def generate_receipt_number(self):
        return f"R-{uuid.uuid4().hex[:8].upper()}"

    def save(self, *args, **kwargs):
        if not self.receipt_number:
            self.receipt_number = self.generate_receipt_number()

        if not self.public_url_token:
            self.public_url_token = uuid.uuid4().hex

        super().save(*args, **kwargs)

    def __str__(self):
        return self.receipt_number

    class Meta:
        ordering = ["-created_at"]


class NotificationLog(models.Model):
    CHANNEL_CHOICES = (
        ("email", "Email"),
        ("whatsapp", "WhatsApp"),
        ("sms", "SMS"),
        ("system", "System"),
    )

    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("sent", "Sent"),
        ("failed", "Failed"),
        ("skipped", "Skipped"),
    )

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_notification_logs",
    )

    booking = models.ForeignKey(
        Booking,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="notification_logs",
    )

    channel = models.CharField(max_length=30, choices=CHANNEL_CHOICES)
    recipient = models.CharField(max_length=255)
    subject = models.CharField(max_length=255, blank=True)
    message = models.TextField(blank=True)

    status = models.CharField(max_length=30, choices=STATUS_CHOICES, default="pending")
    provider_response = models.JSONField(default=dict, blank=True)

    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f"{self.channel} - {self.recipient} - {self.status}"

    class Meta:
        ordering = ["-created_at"]


class ProductReview(models.Model):
    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name="ticketing_product_reviews",
    )

    product = models.ForeignKey(
        ExperienceProduct,
        on_delete=models.CASCADE,
        related_name="reviews",
    )

    customer = models.ForeignKey(
        Customer,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="reviews",
    )

    customer_name = models.CharField(max_length=150, blank=True)
    rating = models.PositiveSmallIntegerField(default=5)
    title = models.CharField(max_length=255, blank=True)
    comment = models.TextField(blank=True)

    is_public = models.BooleanField(default=True)
    is_approved = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def __str__(self):
        return f"{self.product.name} - {self.rating}"

    class Meta:
        ordering = ["-created_at"]