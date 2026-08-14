"""Dedicated owner-controlled promotions for public customer itineraries.

These models are deliberately separate from seller margin, seller commission,
and seller discount rules. A customer promotion belongs to one organisation
and may be evaluated by checkout and customer-AI services only through
authoritative backend logic.
"""

from __future__ import annotations

from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q


class CustomerPromotionRule(models.Model):
    TYPE_PERCENTAGE = "percentage"
    TYPE_FIXED_AMOUNT = "fixed_amount"
    DISCOUNT_TYPE_CHOICES = (
        (TYPE_PERCENTAGE, "Percentage"),
        (TYPE_FIXED_AMOUNT, "Fixed amount"),
    )

    organisation = models.ForeignKey(
        "organisations.Organisation",
        on_delete=models.CASCADE,
        related_name="customer_promotion_rules",
    )
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)

    discount_type = models.CharField(
        max_length=20,
        choices=DISCOUNT_TYPE_CHOICES,
    )
    discount_value = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=(MinValueValidator(Decimal("0.01")),),
        help_text=(
            "Percentage from 0.01 to 100.00, or a fixed amount in the "
            "organisation's checkout currency."
        ),
    )
    max_discount_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
        help_text="Zero means no additional discount cap.",
    )

    minimum_items = models.PositiveSmallIntegerField(
        default=1,
        validators=(MinValueValidator(1), MaxValueValidator(12)),
    )
    minimum_subtotal = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=Decimal("0.00"),
        validators=(MinValueValidator(Decimal("0.00")),),
    )

    applies_to_all_products = models.BooleanField(default=True)
    products = models.ManyToManyField(
        "ticketing.ExperienceProduct",
        blank=True,
        related_name="customer_promotion_rules",
        help_text=(
            "Used only when applies_to_all_products is disabled. Products "
            "must belong to the same organisation."
        ),
    )

    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)

    max_uses = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="Empty means unlimited. Usage is consumed only by checkout.",
    )
    times_used = models.PositiveIntegerField(
        default=0,
        help_text="Maintained atomically by the checkout/booking conversion flow.",
    )

    stackable = models.BooleanField(
        default=False,
        help_text="Allow another eligible rule to be evaluated after this rule.",
    )
    priority = models.PositiveSmallIntegerField(
        default=100,
        help_text="Lower numbers are evaluated first.",
    )
    is_public = models.BooleanField(
        default=True,
        help_text="Allow this rule to be shown to public customers.",
    )
    is_active = models.BooleanField(default=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_customer_promotion_rules",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("priority", "id")
        indexes = (
            models.Index(
                fields=(
                    "organisation",
                    "is_active",
                    "is_public",
                    "priority",
                ),
                name="cust_promo_active_idx",
            ),
            models.Index(
                fields=("organisation", "valid_from", "valid_until"),
                name="cust_promo_window_idx",
            ),
        )
        constraints = (
            models.CheckConstraint(
                condition=Q(discount_value__gt=0),
                name="cust_promo_discount_positive",
            ),
            models.CheckConstraint(
                condition=(
                    Q(discount_type="fixed_amount")
                    | Q(discount_value__lte=100)
                ),
                name="cust_promo_percent_lte_100",
            ),
            models.CheckConstraint(
                condition=Q(max_discount_amount__gte=0)
                & Q(minimum_subtotal__gte=0),
                name="cust_promo_money_nonnegative",
            ),
            models.CheckConstraint(
                condition=Q(minimum_items__gte=1)
                & Q(minimum_items__lte=12),
                name="cust_promo_item_count_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(valid_from__isnull=True)
                    | Q(valid_until__isnull=True)
                    | Q(valid_until__gt=F("valid_from"))
                ),
                name="cust_promo_window_valid",
            ),
            models.CheckConstraint(
                condition=(
                    Q(max_uses__isnull=True)
                    | Q(times_used__lte=F("max_uses"))
                ),
                name="cust_promo_usage_valid",
            ),
        )

    def clean(self) -> None:
        super().clean()
        errors: dict[str, str] = {}

        if (
            self.discount_type == self.TYPE_PERCENTAGE
            and self.discount_value is not None
            and self.discount_value > Decimal("100.00")
        ):
            errors["discount_value"] = (
                "Percentage discounts cannot exceed 100%."
            )
        if (
            self.valid_from
            and self.valid_until
            and self.valid_until <= self.valid_from
        ):
            errors["valid_until"] = "The end time must follow the start time."
        if self.max_uses is not None and self.times_used > self.max_uses:
            errors["times_used"] = "Usage cannot exceed the configured limit."
        if errors:
            raise ValidationError(errors)

    def validate_product_scope(self) -> None:
        """Validate M2M ownership after the rule has been saved."""
        if not self.pk or self.applies_to_all_products:
            return
        if self.products.exclude(organisation_id=self.organisation_id).exists():
            raise ValidationError(
                {"products": "All products must belong to this organisation."}
            )

    @property
    def usage_available(self) -> bool:
        return self.max_uses is None or self.times_used < self.max_uses

    def __str__(self) -> str:
        return f"{self.organisation_id} - {self.name}"


__all__ = ["CustomerPromotionRule"]
