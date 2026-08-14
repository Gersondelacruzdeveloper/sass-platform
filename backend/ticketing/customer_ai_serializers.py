"""Safe DRF serializers for customer AI staff operations.

All model serializers are read-only. Tenant filtering and staff permissions
belong in ``customer_ai_views.py``; serializers intentionally do not accept an
organisation, staff user, model status, price, discount, token hash, provider
identifier, or idempotency key from request data.
"""

from __future__ import annotations

import re
from typing import Any, Mapping

from rest_framework import serializers

from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
    CustomerItineraryCartItem,
)


MAX_STAFF_REPLY_LENGTH = 2_000
MAX_RESOLUTION_LENGTH = 2_000
MAX_SEARCH_LENGTH = 200


def _clean_text(value: Any, *, maximum: int) -> str:
    if isinstance(value, (Mapping, list, tuple, set)):
        raise serializers.ValidationError("Expected text.")
    text = re.sub(
        r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]",
        "",
        str(value or ""),
    )
    return re.sub(r"[ \t]+", " ", text).strip()[:maximum]


class ReadOnlyModelSerializer(serializers.ModelSerializer):
    """Prevent accidental writes if a read serializer is reused in a view."""

    def create(self, validated_data):  # pragma: no cover - defensive boundary
        raise serializers.ValidationError("This serializer is read-only.")

    def update(self, instance, validated_data):  # pragma: no cover
        raise serializers.ValidationError("This serializer is read-only.")


class CustomerAIMessageSerializer(ReadOnlyModelSerializer):
    """Staff-visible message without raw provider/tool processing metadata."""

    delivery_status = serializers.SerializerMethodField()
    shadow_mode = serializers.SerializerMethodField()
    processing_status = serializers.SerializerMethodField()

    class Meta:
        model = CustomerAIMessage
        fields = (
            "id",
            "conversation_id",
            "direction",
            "role",
            "message_type",
            "text",
            "occurred_at",
            "delivery_status",
            "shadow_mode",
            "processing_status",
        )
        read_only_fields = fields

    @staticmethod
    def get_delivery_status(obj: CustomerAIMessage) -> str:
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        return str(metadata.get("delivery_status") or "")[:30]

    @staticmethod
    def get_shadow_mode(obj: CustomerAIMessage) -> bool:
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        return bool(metadata.get("shadow_mode", False))

    @staticmethod
    def get_processing_status(obj: CustomerAIMessage) -> str:
        if obj.direction != CustomerAIMessage.DIRECTION_INBOUND:
            return ""
        metadata = obj.metadata if isinstance(obj.metadata, dict) else {}
        state = metadata.get("customer_ai_state")
        if not isinstance(state, dict):
            return "pending"
        status = str(state.get("status") or "pending").lower()
        return status if status in {
            "pending",
            "processing",
            "generated",
            "sent",
            "shadow",
            "skipped",
            "failed",
        } else "unknown"


class CustomerAIHandoffSerializer(ReadOnlyModelSerializer):
    assigned_to = serializers.SerializerMethodField()
    notification_queued = serializers.SerializerMethodField()

    class Meta:
        model = CustomerAIHandoff
        fields = (
            "id",
            "conversation_id",
            "status",
            "category",
            "priority",
            "reason",
            "customer_message",
            "assigned_to",
            "requested_at",
            "assigned_at",
            "resolved_at",
            "cancelled_at",
            "resolution",
            "notification_queued",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    @staticmethod
    def get_assigned_to(obj: CustomerAIHandoff) -> Mapping[str, Any] | None:
        user = obj.assigned_to
        if user is None:
            return None
        display = ""
        get_full_name = getattr(user, "get_full_name", None)
        if callable(get_full_name):
            display = str(get_full_name() or "").strip()
        display = display or str(getattr(user, "email", "") or "Staff")
        return {"id": user.pk, "display_name": display[:255]}

    @staticmethod
    def get_notification_queued(obj: CustomerAIHandoff) -> bool:
        return obj.notification_queued_at is not None


class CustomerItineraryCartItemSerializer(ReadOnlyModelSerializer):
    class Meta:
        model = CustomerItineraryCartItem
        fields = (
            "id",
            "position",
            "product_id",
            "service_date",
            "adults",
            "children",
            "infants",
            "package_id",
            "event_ticket_type_id",
            "selected_external_option_id",
            "pickup_location_id",
            "product_name_snapshot",
            "option_name_snapshot",
            "pickup_name_snapshot",
            "pickup_time_snapshot",
            "unit_price_snapshot",
            "line_subtotal",
            "line_discount",
            "line_total",
            "currency",
        )
        read_only_fields = fields


class CustomerItineraryCartSerializer(ReadOnlyModelSerializer):
    """Staff cart summary; bearer token/hash and internal snapshots are hidden."""

    items = CustomerItineraryCartItemSerializer(many=True, read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    can_checkout = serializers.BooleanField(read_only=True)

    class Meta:
        model = CustomerItineraryCart
        fields = (
            "id",
            "conversation_id",
            "status",
            "language",
            "currency",
            "subtotal",
            "discount_total",
            "total",
            "customer_approved",
            "customer_approved_at",
            "itinerary_revalidated_at",
            "age_restrictions_validated_at",
            "expires_at",
            "converted_at",
            "created_at",
            "updated_at",
            "is_expired",
            "can_checkout",
            "items",
        )
        read_only_fields = fields


class CustomerAIConversationListSerializer(ReadOnlyModelSerializer):
    customer_reference = serializers.SerializerMethodField()
    ai_may_reply = serializers.BooleanField(read_only=True)
    unread_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = CustomerAIConversation
        fields = (
            "id",
            "channel",
            "customer_reference",
            "customer_name",
            "status",
            "language",
            "hotel_name",
            "travel_start_date",
            "travel_end_date",
            "adults",
            "children",
            "infants",
            "handoff_category",
            "handoff_requested_at",
            "last_inbound_at",
            "last_outbound_at",
            "updated_at",
            "ai_may_reply",
            "unread_count",
        )
        read_only_fields = fields

    @staticmethod
    def get_customer_reference(obj: CustomerAIConversation) -> str:
        value = str(obj.external_customer_id or "")
        if obj.channel == CustomerAIConversation.CHANNEL_WHATSAPP:
            return f"••••{value[-4:]}" if len(value) >= 4 else "••••"
        return f"customer-{obj.pk}"


class CustomerAIConversationDetailSerializer(CustomerAIConversationListSerializer):
    """Conversation preferences; messages/handoffs/carts use paginated endpoints."""

    class Meta(CustomerAIConversationListSerializer.Meta):
        fields = CustomerAIConversationListSerializer.Meta.fields + (
            "interests",
            "handoff_reason",
            "human_owned_at",
            "closed_at",
            "created_at",
        )
        read_only_fields = fields


class CustomerAIHandoffResolveInputSerializer(serializers.Serializer):
    resolution = serializers.CharField(
        min_length=3,
        max_length=MAX_RESOLUTION_LENGTH,
        trim_whitespace=True,
    )
    resume_ai = serializers.BooleanField(default=False)

    def validate_resolution(self, value: str) -> str:
        cleaned = _clean_text(value, maximum=MAX_RESOLUTION_LENGTH)
        if len(cleaned) < 3:
            raise serializers.ValidationError("Enter a meaningful resolution.")
        return cleaned


class CustomerAIStaffReplyInputSerializer(serializers.Serializer):
    """Input only; organisation, conversation, sender, and channel come from URL/auth."""

    text = serializers.CharField(
        min_length=1,
        max_length=MAX_STAFF_REPLY_LENGTH,
        trim_whitespace=True,
    )

    def validate_text(self, value: str) -> str:
        cleaned = _clean_text(value, maximum=MAX_STAFF_REPLY_LENGTH)
        if not cleaned:
            raise serializers.ValidationError("A reply message is required.")
        return cleaned


class CustomerAIConversationFilterSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=CustomerAIConversation.STATUS_CHOICES,
        required=False,
    )
    channel = serializers.ChoiceField(
        choices=CustomerAIConversation.CHANNEL_CHOICES,
        required=False,
    )
    handoff_only = serializers.BooleanField(required=False, default=False)
    search = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=MAX_SEARCH_LENGTH,
        trim_whitespace=True,
    )

    def validate_search(self, value: str) -> str:
        return _clean_text(value, maximum=MAX_SEARCH_LENGTH)


class CustomerAIMessageFilterSerializer(serializers.Serializer):
    before_id = serializers.IntegerField(required=False, min_value=1)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=100, default=50)


class CustomerAIHandoffAssignInputSerializer(serializers.Serializer):
    """Empty body by design: the authenticated request user becomes the assignee."""

    def to_internal_value(self, data):
        if data not in ({}, None):
            if not isinstance(data, Mapping) or data:
                raise serializers.ValidationError(
                    {
                        "non_field_errors": [
                            "This action does not accept an assignee or other fields."
                        ]
                    }
                )
        return {}


class CustomerAIHandoffCancelInputSerializer(CustomerAIHandoffAssignInputSerializer):
    """Empty body; authorization and current status are checked by the service."""


__all__ = [
    "CustomerAIConversationDetailSerializer",
    "CustomerAIConversationFilterSerializer",
    "CustomerAIConversationListSerializer",
    "CustomerAIHandoffAssignInputSerializer",
    "CustomerAIHandoffCancelInputSerializer",
    "CustomerAIHandoffResolveInputSerializer",
    "CustomerAIHandoffSerializer",
    "CustomerAIMessageFilterSerializer",
    "CustomerAIMessageSerializer",
    "CustomerAIStaffReplyInputSerializer",
    "CustomerItineraryCartItemSerializer",
    "CustomerItineraryCartSerializer",
]
