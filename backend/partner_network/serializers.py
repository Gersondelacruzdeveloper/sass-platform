from __future__ import annotations

from rest_framework import serializers

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
    ReferralFeedbackRequest,
    ReferralPartner,
    ReferralPartnerAccess,
    ReferralPartnerLocation,
    ReferralPayout,
    ReferralPayoutAdjustmentLine,
    ReferralPayoutLine,
    ReferralProductAccess,
    ReferralQRCode,
)
from partner_network.services.readiness_service import get_location_readiness


class PartnerNetworkSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PartnerNetworkSettings
        fields = [
            "id", "organisation", "enabled", "default_commission_trigger",
            "default_payout_frequency", "google_review_url", "feedback_delay_hours",
            "feedback_channel", "feedback_whatsapp_template_name",
            "feedback_whatsapp_template_language", "referral_session_hours",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organisation", "created_at", "updated_at"]


class ReferralPartnerSerializer(serializers.ModelSerializer):
    locations_count = serializers.IntegerField(source="locations.count", read_only=True)

    class Meta:
        model = ReferralPartner
        fields = [
            "id", "organisation", "name", "slug", "partner_type", "product_access_mode", "contact_name",
            "contact_email", "contact_phone", "contact_whatsapp", "status",
            "payout_frequency", "preferred_payout_method", "internal_notes",
            "locations_count", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organisation", "slug", "locations_count", "created_at", "updated_at"]


class ReferralPartnerLocationSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    pickup_location_name = serializers.CharField(source="linked_pickup_location.name", read_only=True)
    readiness = serializers.SerializerMethodField()

    class Meta:
        model = ReferralPartnerLocation
        fields = [
            "id", "partner", "partner_name", "display_name", "property_type",
            "product_access_mode", "address",
            "google_maps_link", "linked_pickup_location", "pickup_location_name",
            "welcome_message", "property_information", "concierge_introduction",
            "is_active", "readiness", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "partner_name", "pickup_location_name", "readiness", "created_at", "updated_at"]

    def validate_partner(self, partner):
        organisation = self.context.get("organisation")
        if organisation and partner.organisation_id != organisation.pk:
            raise serializers.ValidationError("Partner belongs to another organisation.")
        return partner

    def validate_linked_pickup_location(self, pickup):
        organisation = self.context.get("organisation")
        if pickup and organisation and pickup.organisation_id != organisation.pk:
            raise serializers.ValidationError("Pickup location belongs to another organisation.")
        return pickup

    def get_readiness(self, obj):
        return get_location_readiness(obj)


class ReferralProductAccessSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ReferralProductAccess
        fields = [
            "id", "organisation", "partner", "partner_location", "product", "product_name",
            "is_active", "is_recommended", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "organisation", "product_name", "created_at", "updated_at"]


class ReferralPartnerAccessSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(required=False, write_only=True)
    resolved_user_email = serializers.EmailField(source="user.email", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True)

    class Meta:
        model = ReferralPartnerAccess
        fields = [
            "id", "organisation", "partner", "partner_name", "user", "user_email",
            "resolved_user_email",
            "can_access_dashboard", "can_view_earnings", "can_edit_concierge",
            "can_download_qr", "is_active", "last_access_at", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "organisation", "partner_name", "resolved_user_email", "last_access_at",
            "created_at", "updated_at",
        ]
        extra_kwargs = {"user": {"required": False}}

    def validate(self, attrs):
        organisation = self.context.get("organisation")
        user = attrs.get("user")
        email = attrs.pop("user_email", "")
        if user is None and email:
            from django.contrib.auth import get_user_model

            user = get_user_model().objects.filter(email__iexact=email.strip()).first()
            if user is None:
                raise serializers.ValidationError({
                    "user_email": "No existing account uses this email. Create the user account first."
                })
            attrs["user"] = user
        if self.instance is None and attrs.get("user") is None:
            raise serializers.ValidationError({"user": "User or user_email is required."})
        partner = attrs.get("partner") or getattr(self.instance, "partner", None)
        if organisation and partner and partner.organisation_id != organisation.pk:
            raise serializers.ValidationError({"partner": "Partner belongs to another organisation."})
        return attrs


class ReferralQRCodeSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner_location.partner.name", read_only=True)
    property_name = serializers.CharField(source="partner_location.display_name", read_only=True)
    scan_count = serializers.IntegerField(source="scans.count", read_only=True)
    public_url = serializers.SerializerMethodField()

    class Meta:
        model = ReferralQRCode
        fields = [
            "id", "partner_location", "partner_name", "property_name", "status",
            "scan_count", "public_url", "created_at", "revoked_at",
        ]
        read_only_fields = fields

    def get_public_url(self, obj):
        from partner_network.services.qr_service import public_referral_url
        return public_referral_url(request=self.context.get("request"), qr_code=obj)


class ReferralCommissionRuleSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    property_name = serializers.CharField(source="partner_location.display_name", read_only=True)
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ReferralCommissionRule
        fields = [
            "id", "organisation", "partner", "partner_name", "partner_location", "property_name",
            "product", "product_name", "commission_type", "commission_value", "trigger",
            "effective_from", "effective_until", "is_active", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "organisation", "partner_name", "property_name", "product_name", "created_at", "updated_at"
        ]


class ReferralBookingAttributionSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    property_name = serializers.CharField(source="partner_location.display_name", read_only=True)

    class Meta:
        model = ReferralBookingAttribution
        fields = [
            "id", "booking", "booking_code", "partner", "partner_name", "partner_location",
            "property_name", "source", "attributed_at",
        ]
        read_only_fields = fields


class ReferralCommissionSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    property_name = serializers.CharField(source="partner_location.display_name", read_only=True)

    class Meta:
        model = ReferralCommission
        fields = [
            "id", "partner", "partner_name", "partner_location", "property_name", "booking",
            "booking_code", "booking_item", "trigger", "currency", "amount", "status",
            "earned_at", "paid_at", "reversed_at", "reversal_reason", "created_at",
        ]
        read_only_fields = fields


class ReferralFeedbackRequestSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    property_name = serializers.CharField(source="partner_location.display_name", read_only=True)

    class Meta:
        model = ReferralFeedbackRequest
        fields = [
            "id", "booking", "booking_code", "partner", "partner_name",
            "partner_location", "property_name", "channel", "review_url_snapshot",
            "scheduled_for", "status", "sent_at", "attempt_count",
            "provider_response", "last_error", "created_at", "updated_at",
        ]
        read_only_fields = fields


class ReferralBalanceAdjustmentSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="commission.booking.booking_code", read_only=True)
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    applied_amount = serializers.SerializerMethodField()
    outstanding_amount = serializers.SerializerMethodField()

    class Meta:
        model = ReferralBalanceAdjustment
        fields = [
            "id", "partner", "partner_name", "commission", "booking_code", "currency",
            "amount", "applied_amount", "outstanding_amount", "reason", "created_at",
        ]
        read_only_fields = fields

    def get_applied_amount(self, obj):
        from django.db.models import Sum
        from partner_network.models import ReferralPayout

        value = (
            obj.payout_lines.exclude(payout__status=ReferralPayout.STATUS_CANCELLED)
            .aggregate(total=Sum("amount"))["total"]
        )
        return value or 0

    def get_outstanding_amount(self, obj):
        applied = self.get_applied_amount(obj)
        return max(obj.amount - applied, 0)


class ReferralPayoutAdjustmentLineSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="adjustment.commission.booking.booking_code", read_only=True)
    reason = serializers.CharField(source="adjustment.reason", read_only=True)

    class Meta:
        model = ReferralPayoutAdjustmentLine
        fields = ["id", "adjustment", "booking_code", "reason", "amount", "created_at"]
        read_only_fields = fields


class ReferralPayoutLineSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="commission.booking.booking_code", read_only=True)

    class Meta:
        model = ReferralPayoutLine
        fields = ["id", "commission", "booking_code", "amount", "created_at"]
        read_only_fields = fields


class ReferralPayoutSerializer(serializers.ModelSerializer):
    partner_name = serializers.CharField(source="partner.name", read_only=True)
    lines = ReferralPayoutLineSerializer(many=True, read_only=True)
    adjustment_lines = ReferralPayoutAdjustmentLineSerializer(many=True, read_only=True)

    class Meta:
        model = ReferralPayout
        fields = [
            "id", "partner", "partner_name", "period_start", "period_end", "currency",
            "total_amount", "status", "payment_reference", "internal_note", "paid_at",
            "created_at", "updated_at", "lines", "adjustment_lines",
        ]
        read_only_fields = [
            "id", "partner_name", "total_amount", "paid_at", "created_at", "updated_at",
            "lines", "adjustment_lines"
        ]
