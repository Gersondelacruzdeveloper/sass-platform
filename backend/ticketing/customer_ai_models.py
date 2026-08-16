"""Persistence models for the customer WhatsApp/web-chat AI subsystem.

These models are additive and deliberately separate from seller-agent memory,
``Booking``, and ``BookingPayment``. A customer itinerary cart is temporary
checkout preparation only; it never represents a confirmed reservation.

After adding this file, import its model classes at the bottom of
``ticketing/models.py`` so Django registers them, then create a migration.
"""

from __future__ import annotations

import hashlib
import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q
from django.utils import timezone


class CustomerAIConversation(models.Model):
    CHANNEL_WHATSAPP = "whatsapp"
    CHANNEL_WEBCHAT = "webchat"
    CHANNEL_CHOICES = (
        (CHANNEL_WHATSAPP, "WhatsApp"),
        (CHANNEL_WEBCHAT, "Web chat"),
    )

    STATUS_ACTIVE = "active"
    STATUS_HANDOFF_REQUESTED = "handoff_requested"
    STATUS_HUMAN_OWNED = "human_owned"
    STATUS_CLOSED = "closed"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_HANDOFF_REQUESTED, "Handoff requested"),
        (STATUS_HUMAN_OWNED, "Human owned"),
        (STATUS_CLOSED, "Closed"),
    )
    OPEN_STATUSES = (
        STATUS_ACTIVE,
        STATUS_HANDOFF_REQUESTED,
        STATUS_HUMAN_OWNED,
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="customer_ai_conversations",
    )
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    external_customer_id = models.CharField(
        max_length=255,
        help_text="Normalized channel customer identifier; treat as personal data.",
    )
    status = models.CharField(
        max_length=30,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    language = models.CharField(max_length=10, blank=True)

    customer_name = models.CharField(max_length=255, blank=True)
    travel_start_date = models.DateField(null=True, blank=True)
    travel_end_date = models.DateField(null=True, blank=True)
    hotel_name = models.CharField(max_length=255, blank=True)
    adults = models.PositiveSmallIntegerField(default=0)
    children = models.PositiveSmallIntegerField(default=0)
    infants = models.PositiveSmallIntegerField(default=0)
    interests = models.JSONField(default=list, blank=True)

    last_response_id = models.CharField(max_length=255, blank=True)
    provider_conversation_id = models.CharField(max_length=255, blank=True)

    handoff_category = models.CharField(max_length=80, blank=True)
    handoff_reason = models.TextField(blank=True)
    handoff_requested_at = models.DateTimeField(null=True, blank=True)
    human_owned_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    last_inbound_at = models.DateTimeField(null=True, blank=True)
    last_outbound_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at", "-id")
        indexes = (
            models.Index(
                fields=("organisation", "channel", "external_customer_id"),
                name="cust_ai_conv_identity_idx",
            ),
            models.Index(
                fields=("organisation", "status", "-updated_at"),
                name="cust_ai_conv_queue_idx",
            ),
        )
        constraints = (
            models.UniqueConstraint(
                fields=("organisation", "channel", "external_customer_id"),
                condition=Q(
                    status__in=(
                        "active",
                        "handoff_requested",
                        "human_owned",
                    )
                ),
                name="uniq_open_customer_ai_conv",
            ),
            models.CheckConstraint(
                condition=Q(travel_end_date__isnull=True)
                | Q(travel_start_date__isnull=True)
                | Q(travel_end_date__gte=models.F("travel_start_date")),
                name="cust_ai_conv_travel_dates_ok",
            ),
            models.CheckConstraint(
                condition=Q(adults__lte=100)
                & Q(children__lte=100)
                & Q(infants__lte=100),
                name="cust_ai_conv_party_counts_ok",
            ),
        )

    @property
    def ai_may_reply(self) -> bool:
        return self.status == self.STATUS_ACTIVE

    def clean(self) -> None:
        super().clean()
        if (
            self.travel_start_date
            and self.travel_end_date
            and self.travel_end_date < self.travel_start_date
        ):
            raise ValidationError(
                {"travel_end_date": "Travel end date cannot precede start date."}
            )
        if not isinstance(self.interests, list):
            raise ValidationError({"interests": "Interests must be a list."})

    def __str__(self) -> str:
        return f"{self.organisation_id}:{self.channel}:{self.external_customer_id}"


class CustomerAIMessage(models.Model):
    DIRECTION_INBOUND = "inbound"
    DIRECTION_OUTBOUND = "outbound"
    DIRECTION_CHOICES = (
        (DIRECTION_INBOUND, "Inbound"),
        (DIRECTION_OUTBOUND, "Outbound"),
    )
    ROLE_CUSTOMER = "customer"
    ROLE_ASSISTANT = "assistant"
    ROLE_TOOL = "tool"
    ROLE_SYSTEM = "system"
    ROLE_CHOICES = (
        (ROLE_CUSTOMER, "Customer"),
        (ROLE_ASSISTANT, "Assistant"),
        (ROLE_TOOL, "Tool"),
        (ROLE_SYSTEM, "System"),
    )

    conversation = models.ForeignKey(
        CustomerAIConversation,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    external_message_id = models.CharField(max_length=512, blank=True)
    message_type = models.CharField(max_length=50, default="text")
    text = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    occurred_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("occurred_at", "id")
        indexes = (
            models.Index(
                fields=("conversation", "occurred_at"),
                name="cust_ai_msg_timeline_idx",
            ),
            models.Index(
                fields=("external_message_id",),
                name="cust_ai_msg_external_idx",
            ),
        )
        constraints = (
            models.UniqueConstraint(
                fields=("conversation", "external_message_id"),
                condition=Q(direction="inbound") & ~Q(external_message_id=""),
                name="uniq_customer_ai_inbound_msg",
            ),
        )

    def clean(self) -> None:
        super().clean()
        if not isinstance(self.metadata, dict):
            raise ValidationError({"metadata": "Message metadata must be an object."})

    def __str__(self) -> str:
        return f"{self.conversation_id}:{self.direction}:{self.role}:{self.id}"


class CustomerAIHandoff(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ASSIGNED = "assigned"
    STATUS_RESOLVED = "resolved"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_PENDING, "Pending"),
        (STATUS_ASSIGNED, "Assigned"),
        (STATUS_RESOLVED, "Resolved"),
        (STATUS_CANCELLED, "Cancelled"),
    )
    PRIORITY_NORMAL = "normal"
    PRIORITY_HIGH = "high"
    PRIORITY_URGENT = "urgent"
    PRIORITY_CHOICES = (
        (PRIORITY_NORMAL, "Normal"),
        (PRIORITY_HIGH, "High"),
        (PRIORITY_URGENT, "Urgent"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="customer_ai_handoffs",
    )
    conversation = models.ForeignKey(
        CustomerAIConversation,
        on_delete=models.CASCADE,
        related_name="handoffs",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_PENDING,
    )
    category = models.CharField(max_length=80)
    priority = models.CharField(
        max_length=10,
        choices=PRIORITY_CHOICES,
        default=PRIORITY_NORMAL,
    )
    reason = models.TextField()
    customer_message = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=512)

    assigned_to = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="assigned_customer_ai_handoffs",
    )
    requested_at = models.DateTimeField(default=timezone.now)
    assigned_at = models.DateTimeField(null=True, blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    resolution = models.TextField(blank=True)
    notification_queued_at = models.DateTimeField(null=True, blank=True)
    notification_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-requested_at", "-id")
        indexes = (
            models.Index(
                fields=("organisation", "status", "priority", "requested_at"),
                name="cust_ai_handoff_queue_idx",
            ),
        )
        constraints = (
            models.UniqueConstraint(
                fields=("organisation", "idempotency_key"),
                name="uniq_customer_ai_handoff_key",
            ),
        )

    def clean(self) -> None:
        super().clean()
        if self.conversation_id and self.organisation_id:
            conversation_org_id = getattr(self.conversation, "organisation_id", None)
            if conversation_org_id != self.organisation_id:
                raise ValidationError(
                    {"conversation": "Conversation belongs to another organisation."}
                )

    def __str__(self) -> str:
        return f"Handoff {self.id} - {self.status}"


class CustomerItineraryCart(models.Model):
    STATUS_ACTIVE = "active"
    STATUS_CONVERTED = "converted"
    STATUS_EXPIRED = "expired"
    STATUS_ABANDONED = "abandoned"
    STATUS_CHOICES = (
        (STATUS_ACTIVE, "Active"),
        (STATUS_CONVERTED, "Converted"),
        (STATUS_EXPIRED, "Expired"),
        (STATUS_ABANDONED, "Abandoned"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="customer_itinerary_carts",
    )
    conversation = models.ForeignKey(
        CustomerAIConversation,
        on_delete=models.CASCADE,
        related_name="itinerary_carts",
    )
    converted_booking = models.OneToOneField(
        "ticketing.Booking",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="customer_ai_source_cart",
        help_text=(
            "Booking created from this cart. This relationship prevents "
            "duplicate cart conversion and preserves the audit trail."
        ),
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ACTIVE,
    )
    token_hash = models.CharField(
        max_length=64,
        unique=True,
        editable=False,
        help_text="SHA-256 digest only; never store the public cart token.",
    )
    idempotency_key = models.CharField(max_length=512)
    language = models.CharField(max_length=10, blank=True)

    currency = models.CharField(max_length=3)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    discount_total = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    total = models.DecimalField(max_digits=14, decimal_places=2)
    promotion_snapshot = models.JSONField(default=list, blank=True)

    customer_approved = models.BooleanField(default=False)
    customer_approval_message = models.ForeignKey(
        CustomerAIMessage,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="approved_itinerary_carts",
    )
    customer_approved_at = models.DateTimeField(null=True, blank=True)
    itinerary_revalidated_at = models.DateTimeField(null=True, blank=True)
    age_restrictions_validated_at = models.DateTimeField(null=True, blank=True)

    expires_at = models.DateTimeField()
    converted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at", "-id")
        indexes = (
            models.Index(
                fields=("organisation", "status", "expires_at"),
                name="cust_ai_cart_expiry_idx",
            ),
            models.Index(
                fields=("conversation", "-updated_at"),
                name="cust_ai_cart_conv_idx",
            ),
        )
        constraints = (
            models.UniqueConstraint(
                fields=("organisation", "idempotency_key"),
                name="uniq_customer_ai_cart_key",
            ),
            models.CheckConstraint(
                condition=Q(subtotal__gte=0)
                & Q(discount_total__gte=0)
                & Q(total__gte=0)
                & Q(discount_total__lte=models.F("subtotal")),
                name="cust_ai_cart_money_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(total=models.F("subtotal") - models.F("discount_total")),
                name="cust_ai_cart_total_reconciles",
            ),
        )

    @staticmethod
    def hash_token(raw_token: str) -> str:
        token = str(raw_token or "").strip()
        if not token:
            raise ValueError("A cart token is required.")
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @classmethod
    def generate_token(cls) -> tuple[str, str]:
        """Return ``(public_token, stored_hash)``; expose the token only once."""
        public_token = secrets.token_urlsafe(32)
        return public_token, cls.hash_token(public_token)

    @property
    def is_expired(self) -> bool:
        return self.expires_at <= timezone.now()

    @property
    def can_checkout(self) -> bool:
        return bool(
            self.status == self.STATUS_ACTIVE
            and not self.is_expired
            and self.customer_approved
            and self.customer_approval_message_id
            and self.itinerary_revalidated_at
            and self.age_restrictions_validated_at
        )

    def clean(self) -> None:
        super().clean()
        if self.conversation_id and self.organisation_id:
            if self.conversation.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"conversation": "Conversation belongs to another organisation."}
                )
        if self.customer_approval_message_id:
            if self.customer_approval_message.conversation_id != self.conversation_id:
                raise ValidationError(
                    {
                        "customer_approval_message": (
                            "Approval message belongs to another conversation."
                        )
                    }
                )
            if self.customer_approval_message.direction != "inbound":
                raise ValidationError(
                    {"customer_approval_message": "Approval must be inbound."}
                )
        if self.customer_approved and not self.customer_approval_message_id:
            raise ValidationError(
                {"customer_approval_message": "Approved carts require evidence."}
            )
        if self.converted_booking_id:
            if self.converted_booking.organisation_id != self.organisation_id:
                raise ValidationError(
                    {"converted_booking": "Booking belongs to another organisation."}
                )
            if self.status != self.STATUS_CONVERTED or not self.converted_at:
                raise ValidationError(
                    {
                        "converted_booking": (
                            "A converted booking requires converted status and time."
                        )
                    }
                )
        if self.expires_at and self.created_at and self.expires_at <= self.created_at:
            raise ValidationError({"expires_at": "Cart expiry must follow creation."})

    def __str__(self) -> str:
        return f"Customer cart {self.id} - {self.status}"


class CustomerItineraryCartItem(models.Model):
    cart = models.ForeignKey(
        CustomerItineraryCart,
        on_delete=models.CASCADE,
        related_name="items",
    )
    position = models.PositiveSmallIntegerField(
        validators=(MinValueValidator(1), MaxValueValidator(12)),
    )
    product = models.ForeignKey(
        "ticketing.ExperienceProduct",
        on_delete=models.PROTECT,
        related_name="customer_ai_cart_items",
    )
    service_date = models.DateField()
    adults = models.PositiveSmallIntegerField(default=0)
    children = models.PositiveSmallIntegerField(default=0)
    infants = models.PositiveSmallIntegerField(default=0)

    # Stored IDs avoid hard-coupling this additive file to optional subtype
    # models while repositories still validate ownership and existence.
    package_id = models.PositiveBigIntegerField(null=True, blank=True)
    event_ticket_type_id = models.PositiveBigIntegerField(null=True, blank=True)
    selected_external_option_id = models.CharField(max_length=255, blank=True)
    pickup_location_id = models.PositiveBigIntegerField(null=True, blank=True)

    product_name_snapshot = models.CharField(max_length=300)
    option_name_snapshot = models.CharField(max_length=300, blank=True)
    pickup_name_snapshot = models.CharField(max_length=300, blank=True)
    pickup_time_snapshot = models.TimeField(null=True, blank=True)
    unit_price_snapshot = models.DecimalField(max_digits=14, decimal_places=2)
    line_subtotal = models.DecimalField(max_digits=14, decimal_places=2)
    line_discount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=0,
    )
    line_total = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3)
    availability_snapshot = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("position", "id")
        constraints = (
            models.UniqueConstraint(
                fields=("cart", "position"),
                name="uniq_customer_ai_cart_position",
            ),
            models.CheckConstraint(
                condition=Q(adults__lte=100)
                & Q(children__lte=100)
                & Q(infants__lte=100)
                & (Q(adults__gt=0) | Q(children__gt=0) | Q(infants__gt=0)),
                name="cust_ai_cart_item_party_ok",
            ),
            models.CheckConstraint(
                condition=Q(unit_price_snapshot__gte=0)
                & Q(line_subtotal__gte=0)
                & Q(line_discount__gte=0)
                & Q(line_total__gte=0)
                & Q(line_discount__lte=models.F("line_subtotal")),
                name="cust_ai_cart_item_money_ok",
            ),
            models.CheckConstraint(
                condition=Q(
                    line_total=models.F("line_subtotal")
                    - models.F("line_discount")
                ),
                name="cust_ai_cart_item_reconciles",
            ),
        )

    def clean(self) -> None:
        super().clean()
        if self.product_id and self.cart_id:
            if self.product.organisation_id != self.cart.organisation_id:
                raise ValidationError(
                    {"product": "Product belongs to another organisation."}
                )
        if self.currency and self.cart_id:
            if self.currency.upper() != self.cart.currency.upper():
                raise ValidationError(
                    {"currency": "Item currency must match the cart currency."}
                )

    def __str__(self) -> str:
        return f"Cart {self.cart_id}, item {self.position}: {self.product_name_snapshot}"


__all__ = [
    "CustomerAIConversation",
    "CustomerAIHandoff",
    "CustomerAIMessage",
    "CustomerItineraryCart",
    "CustomerItineraryCartItem",
]
