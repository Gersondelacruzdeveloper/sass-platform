from __future__ import annotations

import secrets
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q
from django.utils import timezone
from django.utils.text import slugify


class PartnerNetworkSettings(models.Model):
    COMMISSION_TRIGGER_DEPOSIT = "deposit_paid"
    COMMISSION_TRIGGER_FULL = "fully_paid"
    COMMISSION_TRIGGER_COMPLETED = "service_completed"
    COMMISSION_TRIGGER_CHOICES = (
        (COMMISSION_TRIGGER_DEPOSIT, "Deposit paid"),
        (COMMISSION_TRIGGER_FULL, "Fully paid"),
        (COMMISSION_TRIGGER_COMPLETED, "Service completed"),
    )

    PAYOUT_MONTHLY = "monthly"
    PAYOUT_BIWEEKLY = "biweekly"
    PAYOUT_WEEKLY = "weekly"
    PAYOUT_MANUAL = "manual"
    PAYOUT_FREQUENCY_CHOICES = (
        (PAYOUT_MONTHLY, "Monthly"),
        (PAYOUT_BIWEEKLY, "Biweekly"),
        (PAYOUT_WEEKLY, "Weekly"),
        (PAYOUT_MANUAL, "Manual"),
    )

    FEEDBACK_DISABLED = "disabled"
    FEEDBACK_WHATSAPP = "whatsapp"
    FEEDBACK_EMAIL = "email"
    FEEDBACK_BOTH = "both"
    FEEDBACK_CHANNEL_CHOICES = (
        (FEEDBACK_DISABLED, "Disabled"),
        (FEEDBACK_WHATSAPP, "WhatsApp"),
        (FEEDBACK_EMAIL, "Email"),
        (FEEDBACK_BOTH, "WhatsApp and email"),
    )

    organisation = models.OneToOneField(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="partner_network_settings",
    )
    enabled = models.BooleanField(default=False, db_index=True)
    default_commission_trigger = models.CharField(
        max_length=30,
        choices=COMMISSION_TRIGGER_CHOICES,
        default=COMMISSION_TRIGGER_DEPOSIT,
    )
    default_payout_frequency = models.CharField(
        max_length=20,
        choices=PAYOUT_FREQUENCY_CHOICES,
        default=PAYOUT_MONTHLY,
    )
    google_review_url = models.URLField(blank=True)
    feedback_delay_hours = models.PositiveSmallIntegerField(default=24)
    feedback_channel = models.CharField(
        max_length=20,
        choices=FEEDBACK_CHANNEL_CHOICES,
        default=FEEDBACK_DISABLED,
    )
    feedback_whatsapp_template_name = models.CharField(max_length=160, blank=True)
    feedback_whatsapp_template_language = models.CharField(max_length=20, default="en_US")
    referral_session_hours = models.PositiveSmallIntegerField(default=72)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        state = "enabled" if self.enabled else "disabled"
        return f"Partner Network - {self.organisation.name} ({state})"


class ReferralPartner(models.Model):
    TYPE_CHOICES = (
        ("hotel", "Hotel"),
        ("villa", "Villa"),
        ("airbnb", "Airbnb"),
        ("guesthouse", "Guesthouse"),
        ("apartment", "Apartment"),
        ("resort", "Resort"),
        ("restaurant", "Restaurant"),
        ("other", "Other"),
    )
    STATUS_CHOICES = (
        ("pending", "Pending"),
        ("active", "Active"),
        ("suspended", "Suspended"),
        ("disabled", "Disabled"),
    )

    PRODUCT_ACCESS_INHERIT = "inherit"
    PRODUCT_ACCESS_CUSTOM = "custom"
    PRODUCT_ACCESS_MODE_CHOICES = (
        (PRODUCT_ACCESS_INHERIT, "Inherit"),
        (PRODUCT_ACCESS_CUSTOM, "Custom allowlist"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_partners",
    )
    name = models.CharField(max_length=180)
    slug = models.SlugField(max_length=200)
    partner_type = models.CharField(max_length=30, choices=TYPE_CHOICES, default="hotel")
    product_access_mode = models.CharField(
        max_length=20,
        choices=PRODUCT_ACCESS_MODE_CHOICES,
        default=PRODUCT_ACCESS_INHERIT,
    )
    contact_name = models.CharField(max_length=150, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=40, blank=True)
    contact_whatsapp = models.CharField(max_length=40, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending", db_index=True)
    payout_frequency = models.CharField(
        max_length=20,
        choices=PartnerNetworkSettings.PAYOUT_FREQUENCY_CHOICES,
        default=PartnerNetworkSettings.PAYOUT_MONTHLY,
    )
    preferred_payout_method = models.CharField(max_length=80, blank=True)
    internal_notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name) or "referral-partner"
            candidate = base
            index = 2
            while ReferralPartner.objects.filter(
                organisation=self.organisation,
                slug=candidate,
            ).exclude(pk=self.pk).exists():
                candidate = f"{base}-{index}"
                index += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["organisation", "slug"],
                name="referral_partner_org_slug_unique",
            )
        ]
        indexes = [
            models.Index(fields=["organisation", "status"]),
        ]


class ReferralPartnerLocation(models.Model):
    PROPERTY_TYPE_CHOICES = ReferralPartner.TYPE_CHOICES

    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.CASCADE,
        related_name="locations",
    )
    display_name = models.CharField(max_length=180)
    property_type = models.CharField(
        max_length=30,
        choices=PROPERTY_TYPE_CHOICES,
        default="hotel",
    )
    product_access_mode = models.CharField(
        max_length=20,
        choices=ReferralPartner.PRODUCT_ACCESS_MODE_CHOICES,
        default=ReferralPartner.PRODUCT_ACCESS_INHERIT,
    )
    address = models.TextField(blank=True)
    google_maps_link = models.URLField(blank=True)
    linked_pickup_location = models.ForeignKey(
        "ticketing.PickupLocation",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="referral_partner_locations",
    )
    welcome_message = models.TextField(blank=True)
    property_information = models.TextField(blank=True)
    concierge_introduction = models.TextField(blank=True)
    is_active = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def organisation_id(self):
        return self.partner.organisation_id

    @property
    def organisation(self):
        return self.partner.organisation

    def clean(self):
        super().clean()
        if (
            self.linked_pickup_location_id
            and self.partner_id
            and self.linked_pickup_location.organisation_id != self.partner.organisation_id
        ):
            raise ValidationError(
                {"linked_pickup_location": "Pickup location belongs to another organisation."}
            )

    def save(self, *args, **kwargs):
        self.full_clean(exclude=None)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.partner.name} - {self.display_name}"

    class Meta:
        ordering = ["partner__name", "display_name"]
        indexes = [
            models.Index(fields=["partner", "is_active"]),
            models.Index(fields=["linked_pickup_location"]),
        ]


class ReferralProductAccess(models.Model):
    """Optional allowlist/recommendation rule for network, partner, or location."""

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_product_access_rules",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="product_access_rules",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="product_access_rules",
    )
    product = models.ForeignKey(
        "ticketing.ExperienceProduct",
        on_delete=models.CASCADE,
        related_name="referral_access_rules",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    is_recommended = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.product_id and self.product.organisation_id != self.organisation_id:
            raise ValidationError({"product": "Product belongs to another organisation."})
        if self.partner_id and self.partner.organisation_id != self.organisation_id:
            raise ValidationError({"partner": "Partner belongs to another organisation."})
        if self.partner_location_id:
            if self.partner_location.partner.organisation_id != self.organisation_id:
                raise ValidationError({"partner_location": "Location belongs to another organisation."})
            if self.partner_id and self.partner_location.partner_id != self.partner_id:
                raise ValidationError({"partner_location": "Location does not belong to this partner."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        indexes = [
            models.Index(fields=["organisation", "product", "is_active"]),
            models.Index(fields=["partner", "partner_location", "is_active"]),
        ]


class ReferralPartnerAccess(models.Model):
    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_partner_user_access",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.CASCADE,
        related_name="user_access",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="referral_partner_access",
    )
    can_access_dashboard = models.BooleanField(default=True)
    can_view_earnings = models.BooleanField(default=True)
    can_edit_concierge = models.BooleanField(default=True)
    can_download_qr = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True, db_index=True)
    last_access_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.partner_id and self.partner.organisation_id != self.organisation_id:
            raise ValidationError({"partner": "Partner belongs to another organisation."})

    def save(self, *args, **kwargs):
        if self.partner_id:
            self.organisation_id = self.partner.organisation_id
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["partner", "user"],
                name="referral_partner_user_unique",
            )
        ]
        indexes = [
            models.Index(fields=["organisation", "user", "is_active"]),
        ]


class ReferralQRCode(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_REVOKED = "revoked"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_REVOKED, "Revoked"),
    )

    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.CASCADE,
        related_name="qr_codes",
    )
    token = models.CharField(max_length=100, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    @classmethod
    def new_token(cls):
        return secrets.token_urlsafe(32)

    def save(self, *args, **kwargs):
        if not self.token:
            self.token = self.new_token()
        super().save(*args, **kwargs)

    @property
    def partner(self):
        return self.partner_location.partner

    @property
    def organisation(self):
        return self.partner_location.partner.organisation

    def revoke(self):
        if self.status != self.STATUS_REVOKED:
            self.status = self.STATUS_REVOKED
            self.revoked_at = timezone.now()
            self.save(update_fields=["status", "revoked_at"])

    def __str__(self):
        return f"QR - {self.partner_location} ({self.status})"

    class Meta:
        indexes = [
            models.Index(fields=["partner_location", "status", "created_at"]),
        ]


class ReferralQRScan(models.Model):
    qr_code = models.ForeignKey(
        ReferralQRCode,
        on_delete=models.CASCADE,
        related_name="scans",
    )
    scanned_at = models.DateTimeField(auto_now_add=True, db_index=True)
    user_agent = models.CharField(max_length=300, blank=True)
    source = models.CharField(max_length=40, default="qr")

    class Meta:
        indexes = [
            models.Index(fields=["qr_code", "scanned_at"]),
        ]


class ReferralSession(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_EXPIRED = "expired"
    STATUS_CLOSED = "closed"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_CLOSED, "Closed"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_sessions",
    )
    conversation = models.ForeignKey(
        "ticketing.CustomerAIConversation",
        on_delete=models.CASCADE,
        related_name="referral_sessions",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="referral_sessions",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.PROTECT,
        related_name="referral_sessions",
    )
    qr_code = models.ForeignKey(
        ReferralQRCode,
        on_delete=models.PROTECT,
        related_name="referral_sessions",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ACTIVE, db_index=True)
    started_at = models.DateTimeField(default=timezone.now, db_index=True)
    last_activity_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField(db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_current(self):
        return self.status == self.STATUS_ACTIVE and self.expires_at > timezone.now()

    class Meta:
        ordering = ["-started_at", "-pk"]
        indexes = [
            models.Index(fields=["organisation", "conversation", "status", "expires_at"]),
            models.Index(fields=["partner", "partner_location", "started_at"]),
        ]


class ReferralBookingAttribution(models.Model):
    booking = models.OneToOneField(
        "ticketing.Booking",
        on_delete=models.CASCADE,
        related_name="referral_attribution",
    )
    referral_session = models.ForeignKey(
        ReferralSession,
        on_delete=models.PROTECT,
        related_name="booking_attributions",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="booking_attributions",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.PROTECT,
        related_name="booking_attributions",
    )
    referral_qr = models.ForeignKey(
        ReferralQRCode,
        on_delete=models.PROTECT,
        related_name="booking_attributions",
    )
    source = models.CharField(max_length=30, default="qr_whatsapp")
    metadata = models.JSONField(default=dict, blank=True)
    attributed_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["partner", "attributed_at"]),
            models.Index(fields=["partner_location", "attributed_at"]),
        ]


class ReferralCommissionRule(models.Model):
    TYPE_FIXED_BOOKING = "fixed_per_booking"
    TYPE_FIXED_GUEST = "fixed_per_guest"
    TYPE_PERCENT_SALE = "percentage_of_sale"
    TYPE_PERCENT_MARGIN = "percentage_of_platform_margin"
    TYPE_CHOICES = (
        (TYPE_FIXED_BOOKING, "Fixed per booking"),
        (TYPE_FIXED_GUEST, "Fixed per guest"),
        (TYPE_PERCENT_SALE, "Percentage of sale"),
        (TYPE_PERCENT_MARGIN, "Percentage of platform margin"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_commission_rules",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commission_rules",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="commission_rules",
    )
    product = models.ForeignKey(
        "ticketing.ExperienceProduct",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="referral_commission_rules",
    )
    commission_type = models.CharField(max_length=40, choices=TYPE_CHOICES)
    commission_value = models.DecimalField(max_digits=12, decimal_places=4, default=Decimal("0.0000"))
    trigger = models.CharField(
        max_length=30,
        choices=PartnerNetworkSettings.COMMISSION_TRIGGER_CHOICES,
        blank=True,
        help_text="Blank uses the organisation Partner Network default.",
    )
    effective_from = models.DateField(default=timezone.localdate, db_index=True)
    effective_until = models.DateField(null=True, blank=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.commission_value < 0:
            raise ValidationError({"commission_value": "Commission cannot be negative."})
        if self.partner_id and self.partner.organisation_id != self.organisation_id:
            raise ValidationError({"partner": "Partner belongs to another organisation."})
        if self.partner_location_id:
            if self.partner_location.partner.organisation_id != self.organisation_id:
                raise ValidationError({"partner_location": "Location belongs to another organisation."})
            if self.partner_id and self.partner_location.partner_id != self.partner_id:
                raise ValidationError({"partner_location": "Location does not belong to this partner."})
        if self.product_id and self.product.organisation_id != self.organisation_id:
            raise ValidationError({"product": "Product belongs to another organisation."})
        if self.effective_until and self.effective_until < self.effective_from:
            raise ValidationError({"effective_until": "End date must be on or after start date."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    class Meta:
        ordering = ["-effective_from", "-pk"]
        indexes = [
            models.Index(fields=["organisation", "is_active", "effective_from"]),
            models.Index(fields=["partner", "product", "is_active"]),
        ]


class ReferralCommission(models.Model):
    STATUS_PENDING = "pending"
    STATUS_EARNED = "earned"
    STATUS_PAYABLE = "payable"
    STATUS_PAID = "paid"
    STATUS_REVERSED = "reversed"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_EARNED, "Earned"),
        (STATUS_PAYABLE, "Payable"),
        (STATUS_PAID, "Paid"),
        (STATUS_REVERSED, "Reversed"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_commissions",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="commissions",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.PROTECT,
        related_name="commissions",
    )
    booking = models.ForeignKey(
        "ticketing.Booking",
        on_delete=models.CASCADE,
        related_name="referral_commissions",
    )
    booking_item = models.ForeignKey(
        "ticketing.BookingItem",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="referral_commissions",
    )
    commission_rule = models.ForeignKey(
        ReferralCommissionRule,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="generated_commissions",
    )
    commission_rule_snapshot = models.JSONField(default=dict)
    trigger = models.CharField(max_length=30, choices=PartnerNetworkSettings.COMMISSION_TRIGGER_CHOICES)
    currency = models.CharField(max_length=10, default="USD")
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING, db_index=True)
    idempotency_key = models.CharField(max_length=180, unique=True)
    earned_at = models.DateTimeField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    reversed_at = models.DateTimeField(null=True, blank=True)
    reversal_reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "status", "created_at"]),
            models.Index(fields=["partner", "status", "created_at"]),
            models.Index(fields=["booking", "status"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gte=Decimal("0.00")),
                name="referral_commission_amount_nonnegative",
            )
        ]


class ReferralFeedbackRequest(models.Model):
    STATUS_PENDING = "pending"
    STATUS_SENT = "sent"
    STATUS_SKIPPED = "skipped"
    STATUS_FAILED = "failed"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_SKIPPED, "Skipped"),
        (STATUS_FAILED, "Failed"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_feedback_requests",
    )
    booking = models.OneToOneField(
        "ticketing.Booking",
        on_delete=models.CASCADE,
        related_name="referral_feedback_request",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="feedback_requests",
    )
    partner_location = models.ForeignKey(
        ReferralPartnerLocation,
        on_delete=models.PROTECT,
        related_name="feedback_requests",
    )
    channel = models.CharField(
        max_length=20,
        choices=PartnerNetworkSettings.FEEDBACK_CHANNEL_CHOICES,
    )
    review_url_snapshot = models.URLField(blank=True)
    scheduled_for = models.DateTimeField(db_index=True)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
        db_index=True,
    )
    sent_at = models.DateTimeField(null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    provider_response = models.JSONField(default=dict, blank=True)
    last_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["organisation", "status", "scheduled_for"]),
            models.Index(fields=["partner", "status", "scheduled_for"]),
        ]



class ReferralBalanceAdjustment(models.Model):
    """Debit carried forward after a previously-paid commission is reversed.

    ``amount`` is stored as a positive monetary amount to deduct from future
    partner payouts. Application is tracked by ReferralPayoutAdjustmentLine so
    a large debit can be consumed over more than one payout without rewriting
    financial history.
    """

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_balance_adjustments",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="balance_adjustments",
    )
    commission = models.OneToOneField(
        ReferralCommission,
        on_delete=models.PROTECT,
        related_name="reversal_adjustment",
    )
    currency = models.CharField(max_length=10, default="USD")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    reason = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "pk"]
        indexes = [
            models.Index(fields=["organisation", "partner", "currency", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=Decimal("0.00")),
                name="referral_balance_adjustment_positive",
            )
        ]

    def __str__(self):
        return f"{self.partner} debit {self.currency} {self.amount}"


class ReferralPayout(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_APPROVED = "approved"
    STATUS_PAID = "paid"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_APPROVED, "Approved"),
        (STATUS_PAID, "Paid"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="referral_payouts",
    )
    partner = models.ForeignKey(
        ReferralPartner,
        on_delete=models.PROTECT,
        related_name="payouts",
    )
    period_start = models.DateField(db_index=True)
    period_end = models.DateField(db_index=True)
    currency = models.CharField(max_length=10, default="USD")
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=Decimal("0.00"))
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    payment_reference = models.CharField(max_length=180, blank=True)
    internal_note = models.TextField(blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referral_payouts_created",
    )
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="referral_payouts_paid",
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        super().clean()
        if self.period_end < self.period_start:
            raise ValidationError({"period_end": "Period end cannot precede period start."})
        if self.total_amount < 0:
            raise ValidationError({"total_amount": "Payout total cannot be negative."})
        if self.partner_id and self.partner.organisation_id != self.organisation_id:
            raise ValidationError({"partner": "Partner belongs to another organisation."})

    class Meta:
        ordering = ["-period_end", "-pk"]
        indexes = [
            models.Index(fields=["organisation", "status", "period_end"]),
            models.Index(fields=["partner", "status", "period_end"]),
        ]


class ReferralPayoutLine(models.Model):
    payout = models.ForeignKey(
        ReferralPayout,
        on_delete=models.CASCADE,
        related_name="lines",
    )
    commission = models.OneToOneField(
        ReferralCommission,
        on_delete=models.PROTECT,
        related_name="payout_line",
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["payout", "created_at"])]

class ReferralPayoutAdjustmentLine(models.Model):
    payout = models.ForeignKey(
        ReferralPayout,
        on_delete=models.CASCADE,
        related_name="adjustment_lines",
    )
    adjustment = models.ForeignKey(
        ReferralBalanceAdjustment,
        on_delete=models.PROTECT,
        related_name="payout_lines",
    )
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        help_text="Positive amount deducted from this payout.",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def clean(self):
        super().clean()
        if self.amount <= 0:
            raise ValidationError({"amount": "Adjustment application must be positive."})
        if self.payout_id and self.adjustment_id:
            if self.payout.partner_id != self.adjustment.partner_id:
                raise ValidationError({"adjustment": "Adjustment belongs to another partner."})
            if self.payout.organisation_id != self.adjustment.organisation_id:
                raise ValidationError({"adjustment": "Adjustment belongs to another organisation."})
            if self.payout.currency != self.adjustment.currency:
                raise ValidationError({"adjustment": "Adjustment uses another currency."})

    class Meta:
        indexes = [
            models.Index(fields=["payout", "created_at"]),
            models.Index(fields=["adjustment", "created_at"]),
        ]
        constraints = [
            models.CheckConstraint(
                condition=Q(amount__gt=Decimal("0.00")),
                name="referral_payout_adjustment_line_positive",
            ),
            models.UniqueConstraint(
                fields=["payout", "adjustment"],
                name="referral_payout_adjustment_unique",
            ),
        ]

