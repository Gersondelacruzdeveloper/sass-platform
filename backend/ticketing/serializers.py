from decimal import Decimal
import secrets
import string

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q
from rest_framework import serializers
from .notifications import BookingNotificationService

from .models import (
    TicketingEmailSettings,
    TicketingWhatsAppSettings,
    TicketingSettings,
    TicketingPublicSiteSettings,
    TicketingPaymentProviderSettings,
    ExperienceCategory,
    ExperienceProduct,
    ProductURLAlias,
    ProductGalleryImage,
    ExperiencePackage,
    ProductAvailability,
    PickupZone,
    PickupLocation,
    ProductPickupSchedule,
    Customer,
    Seller,
    Booking,
    BookingItem,
    BookingPickupInfo,
    BookingPayment,
    SellerCommission,
    Receipt,
    NotificationLog,
    ExternalProviderConfig,
    ExternalProviderProductSnapshot,
    TransferRoute,
    TransferPriceBand,
    EventTicketType,
    ProductReview,
    TicketingBusinessEntity,
    BusinessEntityUserAccess,
    ProductBusinessAgreement,
    BookingFinancialSnapshot,
    AdmissionToken,
    TicketScanAttempt,
    TicketAdmission,
    TicketingLedgerEntry,
    PartnerSettlementPeriod,
    PartnerSettlementLine,
    PartnerSettlementPayment,
)

from .services import (
    validate_external_product_before_booking,
    create_wellet_snapshot_from_option,
    create_external_booking_order_if_possible,
)

from . import booking_finance_service as booking_finance

User = get_user_model()


class MediaURLMixin:
    def build_file_url(self, file_field):
        if not file_field:
            return None

        try:
            url = file_field.url
        except ValueError:
            return None

        request = self.context.get("request")

        if request and url.startswith("/"):
            return request.build_absolute_uri(url)

        return url


class OrganisationScopedSerializerMixin:
    def get_current_organisation(self):
        organisation = self.context.get("organisation")

        if organisation:
            return organisation

        request = self.context.get("request")

        if request and request.user and request.user.is_authenticated:
            return getattr(request.user, "organisation", None)

        return None

    def validate_same_organisation(self, obj, field_name):
        organisation = self.get_current_organisation()

        if not obj or not organisation:
            return obj

        obj_organisation = getattr(obj, "organisation", None)

        if callable(obj_organisation):
            obj_organisation = obj_organisation()

        if obj_organisation and obj_organisation != organisation:
            raise serializers.ValidationError(
                {
                    field_name: "This item does not belong to the current organisation."
                }
            )

        return obj


class TicketingSettingsSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = TicketingSettings
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "module_name",
            "public_brand_name",
            "currency_symbol",
            "default_currency",
            "supported_currencies",
            "tax_percentage",
            "default_deposit_percentage",
            "allow_public_bookings",
            "allow_seller_bookings",
            "allow_full_payment",
            "allow_deposit_payment",
            "allow_pending_payment",
            "allow_cash_to_seller",
            "allow_manual_bank_transfer",
            "allow_mixed_payments",
            "send_customer_email",
            "send_customer_whatsapp",
            "notify_owner_on_booking",
            "require_supervisor_approval_for_unpaid_tickets",
            "wellet_enabled",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "created_at",
            "updated_at",
        ]


class TicketingPublicSiteSettingsSerializer(MediaURLMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    display_title = serializers.CharField(read_only=True)

    logo_url = serializers.SerializerMethodField()
    favicon_url = serializers.SerializerMethodField()
    hero_image_url = serializers.SerializerMethodField()
    hero_video_file_url = serializers.SerializerMethodField()
    hero_video_poster_url = serializers.SerializerMethodField()
    og_image_url = serializers.SerializerMethodField()
    domain_dns_records = serializers.SerializerMethodField()

    class Meta:
        model = TicketingPublicSiteSettings
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "site_title",
            "display_title",
            "public_description",
            "hero_title",
            "hero_subtitle",
            "primary_cta_label",
            "secondary_cta_label",
            "whatsapp_cta_label",
            "public_email",
            "public_whatsapp",
            "subdomain",
            "custom_domain",
            "domain_status",
            "domain_verified_at",
            "domain_last_checked_at",
            "domain_error_message",
            "aws_acm_certificate_arn",
            "aws_acm_certificate_status",
            "aws_acm_requested_at",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_type",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "cloudfront_alias_added_at",
            "dns_records_payload",
            "domain_dns_records",
            "logo",

            "logo_url",
            "favicon",
            "favicon_url",
            "hero_media_type",
            "hero_image",
            "hero_image_url",
            "hero_video",
            "hero_video_file_url",
            "hero_video_url",
            "hero_video_poster",
            "hero_video_poster_url",
            "hero_overlay_opacity",
            "primary_color",
            "secondary_color",
            "accent_color",
            "background_color",
            "button_color",
            "text_color",
            "muted_text_color",
            "card_background_color",
            "homepage_layout_style",
            "trust_badges",
            "show_category_grid",
            "show_trust_badges",
            "show_excursions_section",
            "show_transfers_section",
            "show_tickets_section",
            "show_events_section",
            "show_nightlife_section",
            "show_packages_section",
            "show_ai_assistant_section",
            "show_final_cta_section",
            "excursions_section_title",
            "excursions_section_subtitle",
            "transfers_section_title",
            "transfers_section_subtitle",
            "tickets_section_title",
            "tickets_section_subtitle",
            "events_section_title",
            "events_section_subtitle",
            "nightlife_section_title",
            "nightlife_section_subtitle",
            "packages_section_title",
            "packages_section_subtitle",
            "ai_assistant_title",
            "ai_assistant_subtitle",
            "final_cta_title",
            "final_cta_subtitle",
            "seo_title",
            "meta_description",
            "canonical_url",
            "product_url_pattern",
            "custom_product_url_pattern",
            "preserve_imported_product_urls",
            "auto_create_product_redirects",
            "og_title",
            "og_description",
            "og_image",
            "og_image_url",
            "robots_allow_indexing",
            "robots_allow_ai_crawlers",
            "allow_gptbot",
            "allow_oai_searchbot",
            "json_ld_local_business",
            "show_public_rankings",
            "show_seller_public_pages",
            "show_reviews",
            "is_published",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "display_title",
            "domain_status",
            "domain_verified_at",
            "domain_last_checked_at",
            "domain_error_message",
            "aws_acm_certificate_arn",
            "aws_acm_certificate_status",
            "aws_acm_requested_at",
            "aws_acm_validation_record_name",
            "aws_acm_validation_record_type",
            "aws_acm_validation_record_value",
            "cloudfront_distribution_id",
            "cloudfront_domain_name",
            "cloudfront_alias_added_at",
            "dns_records_payload",
            "domain_dns_records",
            "logo_url",
            "favicon_url",
            "hero_image_url",
            "hero_video_file_url",
            "hero_video_poster_url",
            "og_image_url",
            "created_at",
            "updated_at",
            
        ]

    def get_domain_dns_records(self, obj):
        if getattr(obj, "dns_records_payload", None):
            return obj.dns_records_payload

        if hasattr(obj, "build_dns_records_payload"):
            return obj.build_dns_records_payload()

        return []

    def get_logo_url(self, obj):
        return self.build_file_url(obj.logo)

    def get_favicon_url(self, obj):
        if obj.favicon:
            return self.build_file_url(obj.favicon)

        branding = getattr(obj.organisation, "branding", None)
        if not branding:
            return None

        if branding.favicon:
            return self.build_file_url(branding.favicon)

        if branding.app_icon_192:
            return self.build_file_url(branding.app_icon_192)

        return None

    def get_hero_image_url(self, obj):
        return self.build_file_url(obj.hero_image)

    def get_hero_video_file_url(self, obj):
        return self.build_file_url(obj.hero_video)

    def get_hero_video_poster_url(self, obj):
        return self.build_file_url(obj.hero_video_poster)

    def get_og_image_url(self, obj):
        return self.build_file_url(obj.og_image)


class ExperienceCategorySerializer(MediaURLMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ExperienceCategory
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "name",
            "slug",
            "description",
            "image",
            "image_url",
            "is_active",
            "sort_order",
            "seo_title",
            "meta_description",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "image_url",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        return self.build_file_url(obj.image)


class ExperiencePackageSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = ExperiencePackage
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "name",
            "description",
            "price",
            "cost_price",
            "deposit_amount",
            "capacity",
            "is_default",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        product = attrs.get("product")

        if product:
            self.validate_same_organisation(product, "product_id")

        return attrs


class ProductAvailabilitySerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    package_name = serializers.CharField(source="package.name", read_only=True)
    remaining_capacity = serializers.IntegerField(read_only=True)

    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )
    package_id = serializers.PrimaryKeyRelatedField(
        source="package",
        queryset=ExperiencePackage.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = ProductAvailability
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "package",
            "package_id",
            "package_name",
            "date",
            "available_capacity",
            "booked_quantity",
            "remaining_capacity",
            "price_override",
            "deposit_override",
            "is_available",
            "note",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "package",
            "package_name",
            "remaining_capacity",
            "created_at",
            "updated_at",
        ]

        # IMPORTANT:
        # DRF cannot auto-create UniqueTogetherValidator here because this serializer
        # exposes both `package` and `package_id`, and both point to the same model field.
        # We disable auto validators and validate product/package/date manually below.
        validators = []

    def validate(self, attrs):
        product = attrs.get("product") or getattr(self.instance, "product", None)
        package = attrs.get("package") if "package" in attrs else getattr(self.instance, "package", None)
        date = attrs.get("date") or getattr(self.instance, "date", None)

        if product:
            self.validate_same_organisation(product, "product_id")

        if package:
            self.validate_same_organisation(package, "package_id")

            if product and package.product_id != product.id:
                raise serializers.ValidationError(
                    {
                        "package_id": "This package does not belong to the selected product."
                    }
                )

        if product and date:
            duplicate_queryset = ProductAvailability.objects.filter(
                product=product,
                package=package,
                date=date,
            )

            if self.instance:
                duplicate_queryset = duplicate_queryset.exclude(pk=self.instance.pk)

            if duplicate_queryset.exists():
                raise serializers.ValidationError(
                    {
                        "date": "Availability already exists for this product/package/date."
                    }
                )

        return attrs



class PickupZoneSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = PickupZone
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "name",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "created_at",
            "updated_at",
        ]


class PickupLocationSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    zone_name = serializers.CharField(source="zone.name", read_only=True)
    zone_id = serializers.PrimaryKeyRelatedField(
        source="zone",
        queryset=PickupZone.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = PickupLocation
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "zone",
            "zone_id",
            "zone_name",
            "name",
            "slug",
            "location_type",
            "address",
            "default_pickup_point",
            "default_instructions",
            "google_maps_link",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "zone",
            "zone_name",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        zone = attrs.get("zone")

        if zone:
            self.validate_same_organisation(zone, "zone_id")

        return attrs


class ProductPickupScheduleSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    pickup_location_name = serializers.CharField(
        source="pickup_location.name",
        read_only=True,
    )
    resolved_pickup_point = serializers.CharField(read_only=True)

    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )
    pickup_location_id = serializers.PrimaryKeyRelatedField(
        source="pickup_location",
        queryset=PickupLocation.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = ProductPickupSchedule
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "pickup_location",
            "pickup_location_id",
            "pickup_location_name",
            "day_of_week",
            "specific_date",
            "pickup_time",
            "pickup_point",
            "resolved_pickup_point",
            "instructions",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "pickup_location",
            "pickup_location_name",
            "resolved_pickup_point",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        product = attrs.get("product")
        pickup_location = attrs.get("pickup_location")

        if product:
            self.validate_same_organisation(product, "product_id")

        if pickup_location:
            self.validate_same_organisation(pickup_location, "pickup_location_id")

        return attrs





class TransferPriceBandSerializer(
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    route_name = serializers.SerializerMethodField()

    route_id = serializers.PrimaryKeyRelatedField(
        source="route",
        queryset=TransferRoute.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = TransferPriceBand
        fields = [
            "id",
            "route",
            "route_id",
            "route_name",
            "name",
            "min_passengers",
            "max_passengers",
            "vehicle_type",
            "one_way_price",
            "round_trip_price",
            "is_active",
            "sort_order",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "route",
            "route_name",
            "created_at",
            "updated_at",
        ]

    def get_route_name(self, obj):
        if not obj.route:
            return ""

        return f"{obj.route.origin} → {obj.route.destination}"

    def validate(self, attrs):
        route = attrs.get("route")

        if route:
            self.validate_same_organisation(route, "route_id")

            if route.product.product_type != "transfer":
                raise serializers.ValidationError(
                    {
                        "route_id": "Price bands can only be attached to transfer routes."
                    }
                )

        min_passengers = attrs.get(
            "min_passengers",
            getattr(self.instance, "min_passengers", None),
        )
        max_passengers = attrs.get(
            "max_passengers",
            getattr(self.instance, "max_passengers", None),
        )

        if min_passengers and max_passengers and min_passengers > max_passengers:
            raise serializers.ValidationError(
                {
                    "max_passengers": "Max passengers must be greater than or equal to min passengers."
                }
            )

        return attrs


class TransferRouteSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    price_bands = TransferPriceBandSerializer(many=True, read_only=True)

    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = TransferRoute
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "origin",
            "destination",
            "airport",

            # Legacy fields kept for backwards compatibility while the frontend
            # moves to TransferPriceBand.
            "vehicle_type",
            "is_round_trip",
            "base_passengers",
            "max_passengers",
            "price",
            "round_trip_price",

            # New transfer pricing model.
            "price_bands",

            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "price_bands",
            "created_at",
            "updated_at",
        ]

    def validate(self, attrs):
        product = attrs.get("product")

        if product:
            self.validate_same_organisation(product, "product_id")

            if product.product_type != "transfer":
                raise serializers.ValidationError(
                    {
                        "product_id": "Transfer routes can only be attached to transfer products."
                    }
                )

        return attrs


class EventTicketTypeSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    product_name = serializers.CharField(source="product.name", read_only=True)
    available_tickets = serializers.IntegerField(read_only=True)

    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = EventTicketType
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "name",
            "description",
            "price",
            "deposit_amount",
            "capacity",
            "sold_quantity",
            "available_tickets",
            "is_active",
            "sort_order",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "available_tickets",
        ]

    def validate(self, attrs):
        product = attrs.get("product")

        if product:
            self.validate_same_organisation(product, "product_id")

        return attrs

class TicketingPaymentProviderSettingsSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    stripe_configured = serializers.SerializerMethodField()
    paypal_configured = serializers.SerializerMethodField()

    class Meta:
        model = TicketingPaymentProviderSettings
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "default_provider",
            "stripe_enabled",
            "stripe_publishable_key",
            "stripe_secret_key",
            "stripe_webhook_secret",
            "stripe_connect_account_id",
            "stripe_connect_status",
            "stripe_configured",
            "paypal_enabled",
            "paypal_mode",
            "paypal_client_id",
            "paypal_client_secret",
            "paypal_merchant_id",
            "paypal_webhook_id",
            "paypal_configured",
            "payment_success_message",
            "payment_pending_message",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "stripe_connect_status",
            "stripe_configured",
            "paypal_configured",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "stripe_secret_key": {"write_only": True, "required": False},
            "stripe_webhook_secret": {"write_only": True, "required": False},
            "paypal_client_secret": {"write_only": True, "required": False},
            "paypal_webhook_id": {"write_only": True, "required": False},
        }

    def get_stripe_configured(self, obj):
        return obj.has_stripe_credentials

    def get_paypal_configured(self, obj):
        return obj.has_paypal_credentials

    def update(self, instance, validated_data):
        # Do not erase saved secrets when the frontend sends an empty string.
        for secret_field in [
            "stripe_secret_key",
            "stripe_webhook_secret",
            "paypal_client_secret",
            "paypal_webhook_id",
        ]:
            if secret_field in validated_data and not validated_data[secret_field]:
                validated_data.pop(secret_field)

        return super().update(instance, validated_data)

class TicketingEmailSettingsSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    configured = serializers.SerializerMethodField()

    class Meta:
        model = TicketingEmailSettings
        fields = [
            "id",
            "organisation",
            "organisation_name",

            "provider",
            "is_active",

            # SMTP
            "smtp_host",
            "smtp_port",
            "smtp_encryption",
            "smtp_username",
            "smtp_password",

            # OAuth (display only)
            "oauth_connected",
            "oauth_provider_account",
            "oauth_token_expiry",
            "oauth_last_refresh",
            "oauth_scopes",

            # Sender
            "sender_name",
            "sender_email",
            "reply_to_email",

            # Notifications
            "send_customer_confirmation",
            "send_owner_notification",
            "send_receipt_email",
            "send_cancellation_email",
            "send_review_request_email",
            "send_reminder_email",

            # Status
            "connection_status",
            "last_test_email",
            "last_test_at",
            "last_error_message",

            "configured",

            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",

            # OAuth
            "oauth_connected",
            "oauth_provider_account",
            "oauth_token_expiry",
            "oauth_last_refresh",
            "oauth_scopes",

            # Status
            "connection_status",
            "last_test_email",
            "last_test_at",
            "last_error_message",

            "configured",

            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            "smtp_password": {
                "write_only": True,
                "required": False,
            }
        }

    def get_configured(self, obj):
        return obj.has_credentials

    def update(self, instance, validated_data):
        # Don't overwrite the saved SMTP password if the frontend sends ""
        if (
            "smtp_password" in validated_data
            and not validated_data["smtp_password"]
        ):
            validated_data.pop("smtp_password")

        return super().update(instance, validated_data)


class TicketingWhatsAppSettingsSerializer(serializers.ModelSerializer):
    """
    Per-organisation Meta WhatsApp Cloud API settings.

    Secret credentials are write-only and are preserved when the frontend
    submits an empty string. This allows the settings form to save ordinary
    fields without erasing previously stored credentials.
    """

    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    configured = serializers.SerializerMethodField()
    connected = serializers.SerializerMethodField()
    has_credentials = serializers.SerializerMethodField()
    is_connected = serializers.SerializerMethodField()
    masked_phone_number_id = serializers.CharField(read_only=True)

    class Meta:
        model = TicketingWhatsAppSettings
        fields = [
            "id",
            "organisation",
            "organisation_name",

            "provider",
            "is_active",

            # Meta application and WhatsApp Business identifiers
            "meta_app_id",
            "meta_app_secret",
            "business_account_id",
            "phone_number_id",
            "access_token",
            "token_expires_at",

            # Sender details returned by Meta
            "display_phone_number",
            "verified_business_name",

            # Webhook configuration
            "webhook_verify_token",
            "webhook_subscribed",
            "webhook_subscribed_at",

            # Approved templates
            "customer_confirmation_template",
            "customer_confirmation_language",
            "supplier_booking_template",
            "supplier_booking_language",
            "customer_reminder_template",
            "customer_reminder_language",

            # Notification rules
            "send_customer_confirmation",
            "send_supplier_booking_notification",
            "send_customer_reminder",
            "attach_customer_ticket",
            "attach_supplier_voucher",

            # Connection and test status
            "connection_status",
            "connected_at",
            "last_test_recipient",
            "last_test_at",
            "last_error_message",

            # Computed frontend helpers
            "configured",
            "connected",
            "has_credentials",
            "is_connected",
            "masked_phone_number_id",

            "created_at",
            "updated_at",
        ]

        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",

            # Populated by Meta/test/webhook actions
            "display_phone_number",
            "verified_business_name",
            "webhook_subscribed",
            "webhook_subscribed_at",
            "connection_status",
            "connected_at",
            "last_test_recipient",
            "last_test_at",
            "last_error_message",

            # Computed properties
            "configured",
            "connected",
            "has_credentials",
            "is_connected",
            "masked_phone_number_id",

            "created_at",
            "updated_at",
        ]

        extra_kwargs = {
            "meta_app_secret": {
                "write_only": True,
                "required": False,
                "allow_blank": True,
            },
            "access_token": {
                "write_only": True,
                "required": False,
                "allow_blank": True,
            },
            "webhook_verify_token": {
                "write_only": True,
                "required": False,
                "allow_blank": True,
            },
        }

    def get_configured(self, obj):
        return obj.has_credentials

    def get_connected(self, obj):
        return obj.is_connected

    def get_has_credentials(self, obj):
        return obj.has_credentials

    def get_is_connected(self, obj):
        return obj.is_connected

    def update(self, instance, validated_data):
        # Do not erase stored secrets when password fields are left blank.
        for secret_field in [
            "meta_app_secret",
            "access_token",
            "webhook_verify_token",
        ]:
            if secret_field in validated_data and not validated_data[secret_field]:
                validated_data.pop(secret_field)

        # Changing credentials means the integration should be tested again.
        credential_fields = {
            "meta_app_id",
            "meta_app_secret",
            "business_account_id",
            "phone_number_id",
            "access_token",
        }

        credentials_changed = any(
            field in validated_data
            and validated_data[field] != getattr(instance, field)
            for field in credential_fields
        )

        if credentials_changed:
            validated_data["connection_status"] = "pending"
            validated_data["last_error_message"] = ""

        return super().update(instance, validated_data)


class ExternalProviderConfigSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = ExternalProviderConfig
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "provider",
            "is_enabled",
            "api_base_url",
            "api_key",
            "api_secret",
            "show_id",
            "category_id",
            "currency",
            "lang",
            "include_table",
            "extra_settings",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "created_at",
            "updated_at",
        ]
        extra_kwargs = {
            "api_secret": {"write_only": True, "required": False},
        }


class ExternalProviderProductSnapshotSerializer(MediaURLMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    product_name = serializers.CharField(source="product.name", read_only=True)

    class Meta:
        model = ExternalProviderProductSnapshot
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "provider",
            "product",
            "product_name",
            "external_product_id",
            "external_name",
            "price",
            "currency",
            "service_date",
            "raw_data",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "product_name",
            "created_at",
        ]



class ProductGalleryImageSerializer(
    MediaURLMixin,
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    product_name = serializers.CharField(source="product.name", read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = ProductGalleryImage
        fields = [
            "id",
            "product",
            "product_id",
            "product_name",
            "image",
            "image_url",
            "alt_text",
            "caption",
            "sort_order",
            "is_cover",
            "is_active",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "product",
            "product_name",
            "image_url",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        return self.build_file_url(obj.image)

    def validate(self, attrs):
        product = attrs.get("product")

        if product:
            self.validate_same_organisation(product, "product_id")

        return attrs


class ProductURLAliasSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductURLAlias
        fields = [
            "id",
            "path",
            "is_primary",
            "is_active",
            "redirect_to_primary",
            "redirect_type",
            "source",
            "original_full_url",
            "notes",
            "hit_count",
            "last_hit_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "hit_count",
            "last_hit_at",
            "created_at",
            "updated_at",
        ]

class ExperienceProductSerializer(
    MediaURLMixin,
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    default_language = serializers.CharField(required=False)
    translations = serializers.JSONField(required=False)

    category_detail = ExperienceCategorySerializer(source="category", read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=ExperienceCategory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    image_url = serializers.SerializerMethodField()
    current_public_path = serializers.ReadOnlyField()
    primary_url = serializers.SerializerMethodField()
    url_aliases = ProductURLAliasSerializer(many=True, read_only=True)

    profit_per_unit = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    packages = ExperiencePackageSerializer(many=True, read_only=True)
    availability = ProductAvailabilitySerializer(many=True, read_only=True)
    pickup_schedules = ProductPickupScheduleSerializer(many=True, read_only=True)
    transfer_routes = TransferRouteSerializer(many=True, read_only=True)
    event_ticket_types = EventTicketTypeSerializer(many=True, read_only=True)
    gallery_images = ProductGalleryImageSerializer(many=True, read_only=True)

    class Meta:
        model = ExperienceProduct
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "category",
            "category_id",
            "category_detail",
            "name",
            "slug",
            "default_language",
            "translations", 
            "current_public_path",
            "primary_url",
            "url_aliases",
            "imported_from_url",
            "imported_from_domain",
            "preserve_legacy_url",
            "product_type",
            "sku",
            "external_provider",
            "external_product_id",
            "is_cocobongo_product",
            "short_description",
            "long_description",
            "image",
            "image_url",
            "gallery",
            "gallery_images",
            "base_price",
            "cost_price",
            "adult_price",
            "adult_cost_price",
            "child_price",
            "child_cost_price",
            "infant_price",
            "infant_cost_price",
            "seller_margin_percent",
            "seller_allowed_discount_percent",
            "profit_per_unit",
            "deposit_amount",
            "deposit_percentage",
            "capacity",
            "duration_text",
            "start_time",
            "end_time",
            "ticket_information",
            "location",
            "address",
            "google_maps_link",
            "itinerary",
            "includes",
            "excludes",
            "faqs",
            "cancellation_policy",
            "instructions",
            "pickup_instructions",
            "supports_pickup",
            "requires_pickup_location",
            "allow_full_payment",
            "allow_deposit_payment",
            "allow_pending_payment",
            "allow_cash_payment",
            "seller_enabled",
            "public_enabled",
            "is_featured",
            "is_recommended",
            "is_top_excursion",
            "is_top_transfer",
            "is_best_seller",
            "event_date",
            "event_start_datetime",
            "event_end_datetime",
            "event_age_restriction",
            "event_dress_code",
            "event_organizer_contact",
            "status",
            "seo_title",
            "meta_description",
            "canonical_url",
            "og_title",
            "og_description",
            "twitter_title",
            "twitter_description",
            "image_alt_text",
            "keywords_tags",
            "json_ld_override",
            "view_count",
            "booking_count",
            "average_rating",
            "review_count",
            "is_active",
            "created_by",
            "packages",
            "availability",
            "pickup_schedules",
            "transfer_routes",
            "event_ticket_types",
            "gallery_images",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "category",
            "category_detail",
            "image_url",
            "current_public_path",
            "primary_url",
            "url_aliases",
            "profit_per_unit",
            "view_count",
            "booking_count",
            "average_rating",
            "review_count",
            "created_by",
            "packages",
            "availability",
            "pickup_schedules",
            "transfer_routes",
            "event_ticket_types",
            "gallery_images",
            "created_at",
            "updated_at",
        ]

    def get_image_url(self, obj):
        return self.build_file_url(obj.image)

    def get_primary_url(self, obj):
        alias = obj.get_primary_url_alias()

        if alias:
            return alias.path

        return obj.current_public_path

    def validate(self, attrs):
        category = attrs.get("category")

        if category:
            self.validate_same_organisation(category, "category_id")

        imported_from_url = attrs.get("imported_from_url")
        preserve_legacy_url = attrs.get("preserve_legacy_url", True)

        if imported_from_url and preserve_legacy_url:
            # The URL alias is created after save in create/update so that product exists.
            pass

        return attrs

    def _create_imported_url_alias_if_needed(self, product):
        if not getattr(product, "imported_from_url", ""):
            return None

        if not getattr(product, "preserve_legacy_url", True):
            return None

        return product.add_legacy_url_alias(
            path=product.imported_from_url,
            source="import",
            original_full_url=product.imported_from_url,
            notes="Created automatically from imported_from_url.",
        )

    def create(self, validated_data):
        product = super().create(validated_data)
        self._create_imported_url_alias_if_needed(product)

        try:
            product.ensure_primary_url_alias()
        except Exception:
            pass

        return product

    def update(self, instance, validated_data):
        old_public_path = instance.current_public_path
        product = super().update(instance, validated_data)
        self._create_imported_url_alias_if_needed(product)

        try:
            new_public_path = product.current_public_path

            if old_public_path and old_public_path != new_public_path:
                site_settings = getattr(product.organisation, "ticketing_public_site_settings", None)

                if not site_settings or getattr(site_settings, "auto_create_product_redirects", True):
                    product.add_legacy_url_alias(
                        path=old_public_path,
                        source="slug_change",
                        notes="Created automatically after product URL changed.",
                    )

            product.ensure_primary_url_alias()
        except Exception:
            pass

        return product


class CustomerSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    class Meta:
        model = Customer
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "full_name",
            "whatsapp",
            "phone",
            "email",
            "hotel_name",
            "notes",
            "total_bookings",
            "total_spent",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "total_bookings",
            "total_spent",
            "created_at",
            "updated_at",
        ]


class SellerSerializer(MediaURLMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    username = serializers.CharField(source="user.username", read_only=True)
    user_email = serializers.EmailField(source="user.email", read_only=True)
    photo_url = serializers.SerializerMethodField()
    public_path = serializers.CharField(read_only=True)
    permissions = serializers.SerializerMethodField()

    create_login = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    login_username = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    login_email = serializers.EmailField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    login_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        style={"input_type": "password"},
    )
    apply_role_defaults = serializers.BooleanField(
        write_only=True,
        required=False,
        default=True,
    )

    class Meta:
        model = Seller
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "user",
            "username",
            "user_email",
            "full_name",
            "seller_slug",
            "public_path",
            "role",
            "email",
            "phone",
            "whatsapp",
            "photo",
            "photo_url",
            "commission_rate",
            "fixed_commission_amount",
            "default_margin_percent",
            "max_customer_discount_percent",
            "can_access_dashboard",
            "can_sell_cocobongo",
            "can_sell_excursions",
            "can_sell_transfers",
            "can_sell_events",
            "can_sell_custom_tours",
            "can_create_bookings",
            "can_send_payment_links",
            "can_apply_customer_discount",
            "can_mark_cash_collected",
            "can_keep_commission_first",
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
            "permissions",
            "is_active",
            "total_sales_amount",
            "total_commission_amount",
            "total_collected_amount",
            "total_owed_to_company",
            "create_login",
            "login_username",
            "login_email",
            "login_password",
            "apply_role_defaults",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "user",
            "username",
            "user_email",
            "photo_url",
            "public_path",
            "permissions",
            "total_sales_amount",
            "total_commission_amount",
            "total_collected_amount",
            "total_owed_to_company",
            "created_at",
            "updated_at",
        ]

    def get_photo_url(self, obj):
        if obj.user and getattr(obj.user, "avatar", None):
            user_avatar_url = self.build_file_url(obj.user.avatar)

            if user_avatar_url:
                return user_avatar_url

        return self.build_file_url(obj.photo)

    def get_permissions(self, obj):
        return obj.get_permissions_dict()

    def validate(self, attrs):
        create_login = attrs.get("create_login", False)
        login_email = attrs.get("login_email")
        login_password = attrs.get("login_password")

        if create_login:
            if not login_email:
                raise serializers.ValidationError(
                    {"login_email": "Login email is required when create_login is true."}
                )

            if not login_password:
                raise serializers.ValidationError(
                    {"login_password": "Login password is required when create_login is true."}
                )

            if User.objects.filter(email=login_email).exists():
                raise serializers.ValidationError(
                    {"login_email": "A user with this email already exists."}
                )

        return attrs

    def create(self, validated_data):
        create_login = validated_data.pop("create_login", False)
        login_username = validated_data.pop("login_username", "")
        login_email = validated_data.pop("login_email", "")
        login_password = validated_data.pop("login_password", "")
        apply_role_defaults = validated_data.pop("apply_role_defaults", True)

        organisation = validated_data.get("organisation") or self.context.get("organisation")

        if create_login:
            username = login_username or login_email.split("@")[0]

            user = User.objects.create_user(
                username=username,
                email=login_email,
                password=login_password,
                organisation=organisation,
            )

            if validated_data.get("phone"):
                user.phone = validated_data.get("phone")

            if validated_data.get("photo"):
                user.avatar = validated_data.get("photo")

            user.save()

            validated_data["user"] = user

        seller = Seller(**validated_data)

        if apply_role_defaults:
            seller.apply_role_default_permissions()

        seller.save()

        return seller

    def update(self, instance, validated_data):
        validated_data.pop("create_login", None)
        validated_data.pop("login_username", None)
        validated_data.pop("login_email", None)
        validated_data.pop("login_password", None)

        apply_role_defaults = validated_data.pop("apply_role_defaults", False)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        if apply_role_defaults:
            instance.apply_role_default_permissions()

        instance.save()

        return instance


class BookingPickupInfoSerializer(serializers.ModelSerializer):
    pickup_location_name = serializers.CharField(
        source="pickup_location.name",
        read_only=True,
    )
    pickup_schedule_label = serializers.SerializerMethodField()

    class Meta:
        model = BookingPickupInfo
        fields = [
            "id",
            "booking",
            "pickup_location",
            "pickup_location_name",
            "pickup_schedule",
            "pickup_schedule_label",
            "pickup_zone_name",
            "hotel_or_location_name",
            "pickup_time",
            "pickup_point",
            "instructions",
            "was_overridden",
            "override_reason",
            "overridden_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "booking",
            "pickup_location_name",
            "pickup_schedule_label",
            "created_at",
            "updated_at",
        ]

    def get_pickup_schedule_label(self, obj):
        if not obj.pickup_schedule:
            return ""

        return str(obj.pickup_schedule)


class BookingItemSerializer(serializers.ModelSerializer):
    product_name_display = serializers.CharField(source="product.name", read_only=True)
    package_name = serializers.CharField(source="package.name", read_only=True)
    event_ticket_type_name = serializers.CharField(
        source="event_ticket_type.name",
        read_only=True,
    )
    profit = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = BookingItem
        fields = [
            "id",
            "booking",
            "product",
            "product_name_display",
            "package",
            "package_name",
            "event_ticket_type",
            "event_ticket_type_name",
            "external_snapshot",
            "external_provider",
            "external_product_id",
            "external_variant_id",
            "external_availability_id",
            "external_option_name",
            "external_raw_data",
            "product_name",
            "product_type",
            "service_date",
            "service_time",
            "quantity",
            "unit_price",
            "unit_cost",
            "total",
            "profit",
            "instructions",
            "created_at",
            
        ]
        read_only_fields = [
            "id",
            "booking",
            "product_name_display",
            "package_name",
            "event_ticket_type_name",
            "total",
            "profit",
            "created_at",
        ]


class BookingItemWriteSerializer(serializers.Serializer):
    product_id = serializers.IntegerField(required=True)
    package_id = serializers.IntegerField(required=False, allow_null=True)
    event_ticket_type_id = serializers.IntegerField(required=False, allow_null=True)
    external_snapshot_id = serializers.IntegerField(required=False, allow_null=True)
    selected_external_product_id = serializers.CharField(required=False, allow_blank=True)
    external_product_id = serializers.CharField(required=False, allow_blank=True)
    external_variant_id = serializers.CharField(required=False, allow_blank=True)
    external_availability_id = serializers.CharField(required=False, allow_blank=True)

    product_name = serializers.CharField(required=False, allow_blank=True)
    service_date = serializers.DateField(required=False, allow_null=True)
    service_time = serializers.TimeField(required=False, allow_null=True)

    quantity = serializers.IntegerField(required=False, min_value=1, default=1)

    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
    unit_cost = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )

    instructions = serializers.CharField(required=False, allow_blank=True)


class BookingPaymentSerializer(serializers.ModelSerializer):
    seller_name = serializers.CharField(source="seller.full_name", read_only=True)
    collected_by_email = serializers.EmailField(
        source="collected_by.email",
        read_only=True,
    )

    class Meta:
        model = BookingPayment
        fields = [
            "id",
            "booking",
            "seller",
            "seller_name",
            "collected_by",
            "collected_by_email",
            "amount",
            "payment_type",
            "payer_type",
            "method",
            "status",
            "collected_by_party",
            "affects_owner_received",
            "affects_seller_collected",
            "settlement_status",
            "provider",
            "provider_payment_id",
            "provider_checkout_id",
            "provider_order_id",
            "provider_capture_id",
            "provider_status",
            "provider_response",
            "reference",
            "note",
            "paid_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "booking",
            "seller_name",
            "collected_by_email",
            "created_at",
        ]


class BookingPaymentWriteSerializer(serializers.Serializer):
    seller_id = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_type = serializers.ChoiceField(choices=BookingPayment.PAYMENT_TYPE_CHOICES)
    payer_type = serializers.ChoiceField(
        choices=BookingPayment.PAYER_TYPE_CHOICES,
        required=False,
        default="customer",
    )
    method = serializers.ChoiceField(choices=BookingPayment.METHOD_CHOICES)
    status = serializers.ChoiceField(
        choices=BookingPayment.STATUS_CHOICES,
        required=False,
        default="confirmed",
    )
    collected_by_party = serializers.CharField(required=False, allow_blank=True)
    affects_owner_received = serializers.BooleanField(required=False)
    affects_seller_collected = serializers.BooleanField(required=False)
    settlement_status = serializers.CharField(required=False, allow_blank=True)
    reference = serializers.CharField(required=False, allow_blank=True)
    note = serializers.CharField(required=False, allow_blank=True)
    provider = serializers.CharField(required=False, allow_blank=True)
    provider_payment_id = serializers.CharField(required=False, allow_blank=True)
    provider_checkout_id = serializers.CharField(required=False, allow_blank=True)
    provider_order_id = serializers.CharField(required=False, allow_blank=True)
    provider_capture_id = serializers.CharField(required=False, allow_blank=True)
    provider_status = serializers.CharField(required=False, allow_blank=True)
    provider_response = serializers.JSONField(required=False)


class SellerCommissionSerializer(serializers.ModelSerializer):
    seller_name = serializers.CharField(source="seller.full_name", read_only=True)
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)
    paid_by_email = serializers.EmailField(source="paid_by.email", read_only=True)

    class Meta:
        model = SellerCommission
        fields = [
            "id",
            "organisation",
            "seller",
            "seller_name",
            "booking",
            "booking_code",
            "amount",
            "rate_used",
            "status",
            "paid_at",
            "paid_by",
            "paid_by_email",
            "note",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "seller_name",
            "booking_code",
            "paid_by_email",
            "created_at",
        ]


class ReceiptSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)
    customer_name = serializers.CharField(source="booking.customer_name", read_only=True)

    class Meta:
        model = Receipt
        fields = [
            "id",
            "booking",
            "booking_code",
            "customer_name",
            "receipt_number",
            "receipt_data",
            "pdf_file",
            "public_url_token",
            "sent_by_email",
            "sent_by_whatsapp",
            "email_sent_at",
            "whatsapp_sent_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "booking_code",
            "customer_name",
            "receipt_number",
            "public_url_token",
            "created_at",
        ]


class NotificationLogSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(source="booking.booking_code", read_only=True)

    class Meta:
        model = NotificationLog
        fields = [
            "id",
            "organisation",
            "booking",
            "booking_code",
            "channel",
            "recipient",
            "subject",
            "message",
            "status",
            "provider_response",
            "sent_at",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "booking_code",
            "created_at",
        ]


class ProductReviewSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    product_name = serializers.CharField(source="product.name", read_only=True)
    customer_full_name = serializers.CharField(
        source="customer.full_name",
        read_only=True,
    )

    class Meta:
        model = ProductReview
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "product",
            "product_name",
            "customer",
            "customer_full_name",
            "customer_name",
            "rating",
            "title",
            "comment",
            "is_public",
            "is_approved",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "product_name",
            "customer_full_name",
            "created_at",
        ]
class BookingSerializer(OrganisationScopedSerializerMixin, serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    customer_detail = CustomerSerializer(source="customer", read_only=True)
    seller_detail = SellerSerializer(source="seller", read_only=True)
    primary_product_detail = ExperienceProductSerializer(
        source="primary_product",
        read_only=True,
    )

    items = BookingItemSerializer(many=True, read_only=True)
    payments = BookingPaymentSerializer(many=True, read_only=True)
    commissions = SellerCommissionSerializer(many=True, read_only=True)
    pickup_info = BookingPickupInfoSerializer(read_only=True)
    receipt = ReceiptSerializer(read_only=True)

    is_fully_paid = serializers.BooleanField(read_only=True)
    commission_pending_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        read_only=True,
    )

    items_payload = BookingItemWriteSerializer(
        many=True,
        write_only=True,
        required=False,
    )
    payments_payload = BookingPaymentWriteSerializer(
        many=True,
        write_only=True,
        required=False,
    )
    pickup_location_id = serializers.IntegerField(
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Booking
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "booking_code",
            "customer",
            "customer_detail",
            "seller",
            "seller_detail",
            "primary_product",
            "primary_product_detail",
            "source",
            "status",
            "payment_status",
            "payment_mode",
            "payment_method",
            "service_date",
            "service_time",
            "customer_name",
            "customer_whatsapp",
            "customer_email",
            "customer_hotel",
            "customer_notes",
            "adults",
            "children",
            "infants",
            "total_guests",
            "original_price",
            "subtotal_amount",
            "customer_discount_percent",
            "customer_discount_amount",
            "discount_amount",
            "tax_amount",
            "total_amount",
            "seller_margin_percent",
            "owner_net_amount",
            "owner_received_amount",
            "settlement_status",
            "payment_receiver",
            "deposit_required",
            "deposit_paid",
            "balance_due",
            "seller_collected_amount",
            "seller_due_to_company",
            "seller_commission_amount",
            "commission_paid_amount",
            "commission_pending_amount",
            "is_fully_paid",
            "requires_supervisor_approval",
            "supervisor_approved_by",
            "supervisor_approved_at",
            "supervisor_notes",
            "receipt_sent_before_full_payment",
            "transfer_origin",
            "transfer_destination",
            "transfer_airport",
            "transfer_flight_number",
            "transfer_vehicle_type",
            "transfer_round_trip",
            "transfer_return_date",
            "transfer_return_time",
            "transfer_status",
            "driver_name",
            "driver_phone",
            "external_provider",
            "external_reference",
            "external_order_id",
            "external_booking_id",
            "external_status",
            "external_currency",
            "external_validation_response",
            "external_raw_response",
            "external_order_created_at",
            "cancellation_reason",
            "created_by",
            "created_at",
            "updated_at",
            "confirmed_at",
            "cancelled_at",
            "completed_at",
            "items",
            "payments",
            "commissions",
            "pickup_info",
            "receipt",
            "items_payload",
            "payments_payload",
            "pickup_location_id",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "booking_code",
            "customer_detail",
            "seller_detail",
            "primary_product_detail",
            "total_guests",
            "original_price",
            "customer_discount_amount",
            "owner_net_amount",
            "owner_received_amount",
            "seller_collected_amount",
            "seller_due_to_company",
            "seller_commission_amount",
            "settlement_status",
            "commission_pending_amount",
            "is_fully_paid",
            "created_by",
            "created_at",
            "updated_at",
            "confirmed_at",
            "cancelled_at",
            "completed_at",
            "items",
            "payments",
            "commissions",
            "pickup_info",
            "receipt",
            "external_order_id",
            "external_booking_id",
            "external_status",
            "external_currency",
            "external_validation_response",
            "external_raw_response",
            "external_order_created_at",
        ]

    def validate(self, attrs):
        customer = attrs.get("customer")
        seller = attrs.get("seller")
        primary_product = attrs.get("primary_product")

        if customer:
            self.validate_same_organisation(customer, "customer")

        if seller:
            self.validate_same_organisation(seller, "seller")

        if primary_product:
            self.validate_same_organisation(primary_product, "primary_product")

        return attrs

    def find_pickup_schedule(self, product, pickup_location, service_date):
        if not product or not pickup_location or not service_date:
            return None

        schedules = ProductPickupSchedule.objects.filter(
            product=product,
            pickup_location=pickup_location,
            is_active=True,
        ).filter(
            Q(specific_date=service_date)
            | Q(day_of_week=service_date.weekday(), specific_date__isnull=True)
            | Q(day_of_week__isnull=True, specific_date__isnull=True)
        )

        exact_date_schedule = schedules.filter(specific_date=service_date).first()

        if exact_date_schedule:
            return exact_date_schedule

        day_schedule = schedules.filter(
            day_of_week=service_date.weekday(),
            specific_date__isnull=True,
        ).first()

        if day_schedule:
            return day_schedule

        return schedules.filter(
            day_of_week__isnull=True,
            specific_date__isnull=True,
        ).first()

    def get_or_create_customer(self, organisation, booking):
        if booking.customer:
            return booking.customer

        customer = Customer.objects.create(
            organisation=organisation,
            full_name=booking.customer_name,
            whatsapp=booking.customer_whatsapp,
            email=booking.customer_email,
            hotel_name=booking.customer_hotel,
            notes=booking.customer_notes,
        )

        booking.customer = customer
        booking.save(update_fields=["customer"])

        return customer

    def resolve_booking_item_objects(self, organisation, item_data):
        product = ExperienceProduct.objects.get(
            id=item_data["product_id"],
            organisation=organisation,
        )

        package = None
        event_ticket_type = None
        external_snapshot = None

        package_id = item_data.get("package_id")
        event_ticket_type_id = item_data.get("event_ticket_type_id")
        external_snapshot_id = item_data.get("external_snapshot_id")

        if package_id:
            package = ExperiencePackage.objects.get(
                id=package_id,
                product__organisation=organisation,
            )

        if event_ticket_type_id:
            event_ticket_type = EventTicketType.objects.get(
                id=event_ticket_type_id,
                product__organisation=organisation,
            )

        if external_snapshot_id:
            external_snapshot = ExternalProviderProductSnapshot.objects.get(
                id=external_snapshot_id,
                organisation=organisation,
            )

        return product, package, event_ticket_type, external_snapshot

    def create_booking_items(self, booking, organisation, items_payload):
        subtotal = Decimal("0.00")
        total_cost = Decimal("0.00")

        for item_data in items_payload:
            product, package, event_ticket_type, external_snapshot = (
                self.resolve_booking_item_objects(organisation, item_data)
            )

            quantity = item_data.get("quantity", 1)

            # For live Wellet/Coco Bongo bookings, do NOT fall back to
            # product.external_product_id. The SaaS product represents the show,
            # while the real bookable ticket is the customer-selected live option
            # from the availability response.
            selected_external_product_id = (
                item_data.get("selected_external_product_id")
                or item_data.get("external_availability_id")
                or item_data.get("external_variant_id")
                or item_data.get("external_product_id")
                or ""
            )

            external_provider = ""
            external_product_id = ""
            external_variant_id = ""
            external_availability_id = ""
            external_option_name = ""
            external_raw_data = {}

            unit_price = item_data.get("unit_price")
            unit_cost = item_data.get("unit_cost")

            product_name = item_data.get("product_name") or product.name

            is_external_wellet = (
                product.external_provider == "wellet"
                or product.is_cocobongo_product
            )

            if is_external_wellet:
                if not selected_external_product_id:
                    raise serializers.ValidationError(
                        {
                            "items_payload": "Please select a Coco Bongo ticket option before checkout."
                        }
                    )

                validation = validate_external_product_before_booking(
                    organisation=organisation,
                    product=product,
                    service_date=item_data.get("service_date") or booking.service_date,
                    selected_external_product_id=selected_external_product_id,
                    quantity=quantity,
                )

                booking.external_provider = "wellet"
                booking.external_validation_response = validation.get("availability") or {}

                if not validation.get("ok"):
                    booking.external_status = "validation_failed"
                    booking.save(
                        update_fields=[
                            "external_provider",
                            "external_status",
                            "external_validation_response",
                            "updated_at",
                        ]
                    )

                    raise serializers.ValidationError(
                        {
                            "items_payload": validation.get("error")
                            or "External product validation failed."
                        }
                    )

                selected_option = validation.get("selected_option") or {}

                external_snapshot = create_wellet_snapshot_from_option(
                    organisation=organisation,
                    product=product,
                    service_date=item_data.get("service_date") or booking.service_date,
                    option=selected_option,
                )

                external_provider = "wellet"
                external_product_id = selected_option.get("external_product_id") or ""
                external_variant_id = selected_option.get("external_variant_id") or ""
                external_availability_id = selected_option.get("external_availability_id") or ""
                external_option_name = selected_option.get("option_name") or ""
                external_raw_data = selected_option.get("raw") or selected_option

                product_name = external_option_name or selected_option.get("name") or product.name

                if unit_price is None:
                    unit_price = Decimal(str(selected_option.get("price") or "0.00"))

                if unit_cost is None:
                    unit_cost = product.cost_price

                booking.external_currency = selected_option.get("currency") or ""
                booking.external_status = "validated"
                booking.save(
                    update_fields=[
                        "external_provider",
                        "external_status",
                        "external_currency",
                        "external_validation_response",
                        "updated_at",
                    ]
                )

            else:
                if unit_price is None:
                    if package:
                        unit_price = package.price
                    elif event_ticket_type:
                        unit_price = event_ticket_type.price
                    elif external_snapshot:
                        unit_price = external_snapshot.price
                    else:
                        # Local excursion/product pricing now supports passenger categories.
                        # For normal products, calculate the booking item total from:
                        # (adults × adult_price) + (children × child_price) + (infants × infant_price).
                        # Keep unit_price as the adult price for display/backwards compatibility.
                        unit_price = getattr(product, "adult_price", None) or product.base_price

                if unit_cost is None:
                    if package:
                        unit_cost = package.cost_price
                    else:
                        unit_cost = getattr(product, "adult_cost_price", None) or product.cost_price

            item_total = unit_price * quantity
            item_cost_total = unit_cost * quantity

            if (
                not is_external_wellet
                and not package
                and not event_ticket_type
                and not external_snapshot
                and not item_data.get("unit_price")
            ):
                adults = Decimal(str(getattr(booking, "adults", 0) or 0))
                children = Decimal(str(getattr(booking, "children", 0) or 0))
                infants = Decimal(str(getattr(booking, "infants", 0) or 0))

                adult_price = getattr(product, "adult_price", None) or product.base_price
                child_price = getattr(product, "child_price", None) or Decimal("0.00")
                infant_price = getattr(product, "infant_price", None) or Decimal("0.00")

                adult_cost = getattr(product, "adult_cost_price", None) or product.cost_price
                child_cost = getattr(product, "child_cost_price", None) or Decimal("0.00")
                infant_cost = getattr(product, "infant_cost_price", None) or Decimal("0.00")

                item_total = (adults * adult_price) + (children * child_price) + (infants * infant_price)
                item_cost_total = (adults * adult_cost) + (children * child_cost) + (infants * infant_cost)

            booking_item = BookingItem.objects.create(
                booking=booking,
                product=product,
                package=package,
                event_ticket_type=event_ticket_type,
                external_snapshot=external_snapshot,
                external_provider=external_provider,
                external_product_id=external_product_id,
                external_variant_id=external_variant_id,
                external_availability_id=external_availability_id,
                external_option_name=external_option_name,
                external_raw_data=external_raw_data,
                product_name=product_name,
                product_type=product.product_type,
                service_date=item_data.get("service_date") or booking.service_date,
                service_time=item_data.get("service_time") or booking.service_time,
                quantity=quantity,
                unit_price=unit_price,
                unit_cost=unit_cost,
                total=item_total,
                instructions=item_data.get("instructions", ""),
            )

            subtotal += booking_item.total
            total_cost += item_cost_total

            if not booking.primary_product:
                booking.primary_product = product
                booking.save(update_fields=["primary_product", "updated_at"])

        return subtotal, total_cost

    def create_booking_payments(self, booking, organisation, payments_payload):
        """
        Create payments using the finance engine.

        The serializer no longer calculates:
        - seller_collected_amount
        - owner_received_amount
        - seller_due_to_company
        - payment_status

        Those values are recalculated by booking_finance_service.
        """

        created_payments = []

        request = self.context.get("request")
        collected_by = (
            request.user
            if request
            and request.user
            and request.user.is_authenticated
            else None
        )

        for payment_data in payments_payload:
            seller = None
            seller_id = payment_data.get("seller_id")

            if seller_id:
                seller = Seller.objects.get(
                    id=seller_id,
                    organisation=organisation,
                )

            payment, booking = booking_finance.record_payment(
                booking=booking,
                seller=seller,
                collected_by=collected_by,
                amount=payment_data["amount"],
                payment_type=payment_data["payment_type"],
                payer_type=payment_data.get("payer_type", "customer"),
                method=payment_data["method"],
                status=payment_data.get("status", "confirmed"),
                provider=payment_data.get("provider", ""),
                provider_payment_id=payment_data.get("provider_payment_id", ""),
                provider_checkout_id=payment_data.get("provider_checkout_id", ""),
                provider_order_id=payment_data.get("provider_order_id", ""),
                provider_capture_id=payment_data.get("provider_capture_id", ""),
                provider_status=payment_data.get("provider_status", ""),
                provider_response=payment_data.get("provider_response", {}),
                reference=payment_data.get("reference", ""),
                note=payment_data.get("note", ""),
                collected_by_party=payment_data.get("collected_by_party", ""),
            )

            if hasattr(payment, "affects_owner_received") and "affects_owner_received" in payment_data:
                payment.affects_owner_received = payment_data["affects_owner_received"]

            if hasattr(payment, "affects_seller_collected") and "affects_seller_collected" in payment_data:
                payment.affects_seller_collected = payment_data["affects_seller_collected"]

            if hasattr(payment, "settlement_status") and payment_data.get("settlement_status"):
                payment.settlement_status = payment_data["settlement_status"]

            payment.save()
            created_payments.append(payment)

        return created_payments

    def create_pickup_info(self, booking, organisation, pickup_location_id):
        if not pickup_location_id:
            return None

        pickup_location = PickupLocation.objects.get(
            id=pickup_location_id,
            organisation=organisation,
        )

        product = booking.primary_product
        service_date = booking.service_date

        schedule = self.find_pickup_schedule(
            product=product,
            pickup_location=pickup_location,
            service_date=service_date,
        )

        pickup_info = BookingPickupInfo(
            booking=booking,
            pickup_location=pickup_location,
            hotel_or_location_name=pickup_location.name,
            pickup_zone_name=pickup_location.zone.name if pickup_location.zone else "",
            pickup_point=pickup_location.default_pickup_point,
            instructions=pickup_location.default_instructions,
        )

        if schedule:
            pickup_info.apply_schedule(schedule)

        pickup_info.save()

        return pickup_info

    def create_receipt_snapshot(self, booking):
        receipt_data = {
            "booking_code": booking.booking_code,
            "customer_name": booking.customer_name,
            "customer_whatsapp": booking.customer_whatsapp,
            "customer_email": booking.customer_email,
            "customer_hotel": booking.customer_hotel,
            "service_date": str(booking.service_date) if booking.service_date else None,
            "service_time": str(booking.service_time) if booking.service_time else None,
            "total_guests": booking.total_guests,
            "subtotal_amount": str(booking.subtotal_amount),
            "discount_amount": str(booking.discount_amount),
            "tax_amount": str(booking.tax_amount),
            "total_amount": str(booking.total_amount),
            "deposit_required": str(booking.deposit_required),
            "deposit_paid": str(booking.deposit_paid),
            "balance_due": str(booking.balance_due),
            "payment_status": booking.payment_status,
            "payment_method": booking.payment_method,
            "payment_mode": booking.payment_mode,
            "seller": booking.seller.full_name if booking.seller else "",
            "status": booking.status,
            "items": [
                {
                    "product_name": item.product_name,
                    "product_type": item.product_type,
                    "quantity": item.quantity,
                    "unit_price": str(item.unit_price),
                    "total": str(item.total),
                    "service_date": str(item.service_date) if item.service_date else None,
                    "service_time": str(item.service_time) if item.service_time else None,
                    "instructions": item.instructions,
                }
                for item in booking.items.all()
            ],
        }

        if hasattr(booking, "pickup_info"):
            receipt_data["pickup"] = {
                "hotel_or_location_name": booking.pickup_info.hotel_or_location_name,
                "pickup_zone_name": booking.pickup_info.pickup_zone_name,
                "pickup_time": str(booking.pickup_info.pickup_time)
                if booking.pickup_info.pickup_time
                else None,
                "pickup_point": booking.pickup_info.pickup_point,
                "instructions": booking.pickup_info.instructions,
            }

        Receipt.objects.get_or_create(
            booking=booking,
            defaults={"receipt_data": receipt_data},
        )

    def create(self, validated_data):
        items_payload = validated_data.pop("items_payload", [])
        payments_payload = validated_data.pop("payments_payload", [])
        pickup_location_id = validated_data.pop("pickup_location_id", None)

        organisation = validated_data.get("organisation") or self.context.get("organisation")

        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data["created_by"] = request.user

        booking = Booking.objects.create(**validated_data)

        self.get_or_create_customer(organisation, booking)

        if items_payload:
            self.create_booking_items(
                booking=booking,
                organisation=organisation,
                items_payload=items_payload,
            )

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        if payments_payload:
            self.create_booking_payments(
                booking=booking,
                organisation=organisation,
                payments_payload=payments_payload,
            )

            booking.refresh_from_db()
            booking = booking_finance.recalculate_booking_payment_totals(booking)

        if pickup_location_id:
            self.create_pickup_info(
                booking=booking,
                organisation=organisation,
                pickup_location_id=pickup_location_id,
            )

        if booking.external_provider == "wellet":
            create_external_booking_order_if_possible(booking)

        self.create_receipt_snapshot(booking)

        try:
            BookingNotificationService.send(booking)
        except Exception:
            pass

        return booking

    def update(self, instance, validated_data):
        validated_data.pop("items_payload", None)
        validated_data.pop("payments_payload", None)
        validated_data.pop("pickup_location_id", None)

        for field, value in validated_data.items():
            setattr(instance, field, value)

        instance.save()
        instance = booking_finance.recalculate_booking_payment_totals(instance)

        return instance

# ============================================================================
# Ticketing operations, admissions, partner access, ledger, and settlements
# ============================================================================


class TicketingBusinessEntitySerializer(
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    active_agreements_count = serializers.SerializerMethodField()
    active_users_count = serializers.SerializerMethodField()

    class Meta:
        model = TicketingBusinessEntity
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "name",
            "slug",
            "entity_type",
            "legal_name",
            "tax_identifier",
            "contact_name",
            "contact_email",
            "contact_phone",
            "contact_whatsapp",
            "address",
            "notes",
            "currency",
            "settlement_cycle_days",
            "settlement_anchor_date",
            "can_collect_customer_balance",
            "can_scan_tickets",
            "require_check_in_confirmation",
            "allow_partial_admission",
            "allow_offline_scanning",
            "external_provider",
            "external_entity_id",
            "extra_settings",
            "is_active",
            "active_agreements_count",
            "active_users_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "active_agreements_count",
            "active_users_count",
            "created_at",
            "updated_at",
        ]

    def get_active_agreements_count(self, obj):
        return obj.product_agreements.filter(is_active=True).count()

    def get_active_users_count(self, obj):
        return obj.user_access.filter(is_active=True).count()

    def validate_settlement_cycle_days(self, value):
        if value < 1:
            raise serializers.ValidationError(
                "Settlement cycle must be at least one day."
            )
        return value


class BusinessEntityUserAccessSerializer(
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    """
    Partner portal user access.

    Supports either:
    1. linking an existing organisation user with ``user_id``; or
    2. creating a new login using ``create_login=True``.

    Generated passwords are returned only in the immediate create response and
    are never stored in plain text.
    """

    PERMISSION_FIELDS = (
        "can_access_dashboard",
        "can_scan",
        "can_view_today_bookings",
        "can_view_admissions",
        "can_view_customer_contact",
        "can_view_financials",
        "can_view_settlements",
        "can_record_payments",
        "can_reverse_admissions",
        "can_manage_users",
    )

    ROLE_DEFAULT_PERMISSIONS = {
        "administrator": {
            field: True for field in PERMISSION_FIELDS
        },
        "finance": {
            "can_access_dashboard": True,
            "can_scan": False,
            "can_view_today_bookings": True,
            "can_view_admissions": True,
            "can_view_customer_contact": False,
            "can_view_financials": True,
            "can_view_settlements": True,
            "can_record_payments": True,
            "can_reverse_admissions": False,
            "can_manage_users": False,
        },
        "supervisor": {
            "can_access_dashboard": True,
            "can_scan": True,
            "can_view_today_bookings": True,
            "can_view_admissions": True,
            "can_view_customer_contact": True,
            "can_view_financials": False,
            "can_view_settlements": False,
            "can_record_payments": False,
            "can_reverse_admissions": True,
            "can_manage_users": False,
        },
        "scanner": {
            "can_access_dashboard": True,
            "can_scan": True,
            "can_view_today_bookings": True,
            "can_view_admissions": True,
            "can_view_customer_contact": False,
            "can_view_financials": False,
            "can_view_settlements": False,
            "can_record_payments": False,
            "can_reverse_admissions": False,
            "can_manage_users": False,
        },
        "driver": {
            "can_access_dashboard": True,
            "can_scan": True,
            "can_view_today_bookings": True,
            "can_view_admissions": False,
            "can_view_customer_contact": True,
            "can_view_financials": False,
            "can_view_settlements": False,
            "can_record_payments": False,
            "can_reverse_admissions": False,
            "can_manage_users": False,
        },
        "guide": {
            "can_access_dashboard": True,
            "can_scan": True,
            "can_view_today_bookings": True,
            "can_view_admissions": True,
            "can_view_customer_contact": True,
            "can_view_financials": False,
            "can_view_settlements": False,
            "can_record_payments": False,
            "can_reverse_admissions": False,
            "can_manage_users": False,
        },
        "viewer": {
            "can_access_dashboard": True,
            "can_scan": False,
            "can_view_today_bookings": True,
            "can_view_admissions": True,
            "can_view_customer_contact": False,
            "can_view_financials": False,
            "can_view_settlements": False,
            "can_record_payments": False,
            "can_reverse_admissions": False,
            "can_manage_users": False,
        },
    }

    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    organisation_slug = serializers.CharField(
        source="organisation.slug",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    business_entity_slug = serializers.CharField(
        source="business_entity.slug",
        read_only=True,
    )
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_name = serializers.SerializerMethodField()
    username = serializers.CharField(source="user.username", read_only=True)
    permissions = serializers.SerializerMethodField()
    partner_login_url = serializers.SerializerMethodField()
    generated_password = serializers.SerializerMethodField()

    business_entity_id = serializers.PrimaryKeyRelatedField(
        source="business_entity",
        queryset=TicketingBusinessEntity.objects.all(),
        write_only=True,
        required=False,
    )
    user_id = serializers.PrimaryKeyRelatedField(
        source="user",
        queryset=User.objects.all(),
        write_only=True,
        required=False,
    )

    create_login = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
    )
    login_name = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=150,
    )
    login_email = serializers.EmailField(
        write_only=True,
        required=False,
        allow_blank=True,
    )
    login_username = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        max_length=150,
    )
    temporary_password = serializers.CharField(
        write_only=True,
        required=False,
        allow_blank=True,
        min_length=10,
        style={"input_type": "password"},
    )
    generate_password = serializers.BooleanField(
        write_only=True,
        required=False,
        default=True,
    )
    apply_role_defaults = serializers.BooleanField(
        write_only=True,
        required=False,
        default=True,
    )

    class Meta:
        model = BusinessEntityUserAccess
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "organisation_slug",
            "business_entity",
            "business_entity_id",
            "business_entity_name",
            "business_entity_slug",
            "user",
            "user_id",
            "user_name",
            "user_email",
            "username",
            "role",
            "can_access_dashboard",
            "can_scan",
            "can_view_today_bookings",
            "can_view_admissions",
            "can_view_customer_contact",
            "can_view_financials",
            "can_view_settlements",
            "can_record_payments",
            "can_reverse_admissions",
            "can_manage_users",
            "permissions",
            "is_active",
            "last_access_at",
            "partner_login_url",
            "generated_password",
            "create_login",
            "login_name",
            "login_email",
            "login_username",
            "temporary_password",
            "generate_password",
            "apply_role_defaults",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "organisation_slug",
            "business_entity",
            "business_entity_name",
            "business_entity_slug",
            "user",
            "user_name",
            "user_email",
            "username",
            "permissions",
            "last_access_at",
            "partner_login_url",
            "generated_password",
            "created_at",
            "updated_at",
        ]
        validators = []

    def get_user_name(self, obj):
        user = obj.user
        full_name = user.get_full_name() if hasattr(user, "get_full_name") else ""
        return full_name or getattr(user, "username", "") or getattr(user, "email", "")

    def get_permissions(self, obj):
        return {
            field: bool(getattr(obj, field, False))
            for field in self.PERMISSION_FIELDS
        }

    def get_partner_login_url(self, obj):
        slug = getattr(obj.organisation, "slug", "")
        return f"/ticketing/{slug}/partner/login" if slug else ""

    def get_generated_password(self, obj):
        # This transient attribute exists only on the newly created instance.
        return getattr(obj, "_generated_password", "")

    @staticmethod
    def _generate_secure_password(length=16):
        alphabet = string.ascii_letters + string.digits + "!@#$%&*"

        while True:
            password = "".join(secrets.choice(alphabet) for _ in range(length))
            if (
                any(char.islower() for char in password)
                and any(char.isupper() for char in password)
                and any(char.isdigit() for char in password)
                and any(char in "!@#$%&*" for char in password)
            ):
                return password

    @staticmethod
    def _split_name(full_name):
        parts = str(full_name or "").strip().split()
        if not parts:
            return "", ""
        if len(parts) == 1:
            return parts[0], ""
        return parts[0], " ".join(parts[1:])

    @staticmethod
    def _unique_username(raw_username, email):
        base = str(raw_username or "").strip()
        if not base:
            base = str(email or "partner").split("@", 1)[0]

        base = "".join(
            char for char in base.lower().replace(" ", ".")
            if char.isalnum() or char in "._-"
        ).strip("._-") or "partner"

        candidate = base[:140]
        counter = 2
        while User.objects.filter(username__iexact=candidate).exists():
            suffix = f"-{counter}"
            candidate = f"{base[:140 - len(suffix)]}{suffix}"
            counter += 1
        return candidate

    def validate(self, attrs):
        entity = attrs.get("business_entity") or getattr(
            self.instance,
            "business_entity",
            None,
        )
        user = attrs.get("user") or getattr(self.instance, "user", None)
        create_login = attrs.get("create_login", False)
        login_email = str(attrs.get("login_email") or "").strip().lower()
        generate_password = attrs.get("generate_password", True)
        temporary_password = attrs.get("temporary_password") or ""

        if entity:
            self.validate_same_organisation(entity, "business_entity_id")

        organisation = self.get_current_organisation()
        user_organisation = getattr(user, "organisation", None) if user else None
        if organisation and user_organisation and user_organisation != organisation:
            raise serializers.ValidationError(
                {"user_id": "This user does not belong to the current organisation."}
            )

        if create_login and user:
            raise serializers.ValidationError(
                {"user_id": "Choose an existing user or create a new login, not both."}
            )

        if not self.instance and not create_login and not user:
            raise serializers.ValidationError(
                {"user_id": "Choose an existing user or enable create_login."}
            )

        if create_login:
            if not login_email:
                raise serializers.ValidationError(
                    {"login_email": "Email is required to create a partner login."}
                )

            if User.objects.filter(email__iexact=login_email).exists():
                raise serializers.ValidationError(
                    {"login_email": "A user with this email already exists."}
                )

            if not generate_password and not temporary_password:
                raise serializers.ValidationError(
                    {
                        "temporary_password": (
                            "Enter a temporary password or enable automatic password generation."
                        )
                    }
                )

        if entity and user:
            duplicate = BusinessEntityUserAccess.objects.filter(
                business_entity=entity,
                user=user,
            )
            if self.instance:
                duplicate = duplicate.exclude(pk=self.instance.pk)
            if duplicate.exists():
                raise serializers.ValidationError(
                    {"user_id": "This user already has access to this business entity."}
                )

        return attrs

    def _apply_role_defaults(self, validated_data):
        role = validated_data.get("role", "scanner")
        defaults = self.ROLE_DEFAULT_PERMISSIONS.get(
            role,
            self.ROLE_DEFAULT_PERMISSIONS["scanner"],
        )

        # Explicit permission values sent by the client override role defaults.
        explicit_permissions = {
            field: validated_data[field]
            for field in self.PERMISSION_FIELDS
            if field in validated_data
        }

        for field, value in defaults.items():
            validated_data[field] = value

        validated_data.update(explicit_permissions)
        return validated_data

    @transaction.atomic
    def create(self, validated_data):
        create_login = validated_data.pop("create_login", False)
        login_name = validated_data.pop("login_name", "")
        login_email = str(validated_data.pop("login_email", "") or "").strip().lower()
        login_username = validated_data.pop("login_username", "")
        temporary_password = validated_data.pop("temporary_password", "")
        generate_password = validated_data.pop("generate_password", True)
        apply_role_defaults = validated_data.pop("apply_role_defaults", True)

        organisation = (
            validated_data.get("organisation")
            or self.get_current_organisation()
        )
        entity = validated_data.get("business_entity")

        if entity:
            organisation = entity.organisation
            validated_data["organisation"] = organisation

        generated_password = ""

        if create_login:
            password = temporary_password
            if generate_password or not password:
                password = self._generate_secure_password()
                generated_password = password

            username = self._unique_username(login_username, login_email)
            first_name, last_name = self._split_name(login_name)

            user_kwargs = {
                "username": username,
                "email": login_email,
                "password": password,
            }

            user_field_names = {
                field.name for field in User._meta.get_fields()
            }
            if "organisation" in user_field_names:
                user_kwargs["organisation"] = organisation
            if "first_name" in user_field_names:
                user_kwargs["first_name"] = first_name
            if "last_name" in user_field_names:
                user_kwargs["last_name"] = last_name

            user = User.objects.create_user(**user_kwargs)
            validated_data["user"] = user

        if apply_role_defaults:
            validated_data = self._apply_role_defaults(validated_data)

        access = BusinessEntityUserAccess.objects.create(**validated_data)

        # Make the auto-generated password available only to this response.
        if generated_password:
            access._generated_password = generated_password

        return access

    @transaction.atomic
    def update(self, instance, validated_data):
        # Login creation fields are intentionally create-only.
        for field in (
            "create_login",
            "login_name",
            "login_email",
            "login_username",
            "temporary_password",
            "generate_password",
        ):
            validated_data.pop(field, None)

        apply_role_defaults = validated_data.pop("apply_role_defaults", False)

        if apply_role_defaults:
            validated_data = self._apply_role_defaults(validated_data)

        return super().update(instance, validated_data)


class ProductBusinessAgreementSerializer(
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    product_name = serializers.CharField(source="product.name", read_only=True)
    created_by_email = serializers.EmailField(
        source="created_by.email",
        read_only=True,
    )

    business_entity_id = serializers.PrimaryKeyRelatedField(
        source="business_entity",
        queryset=TicketingBusinessEntity.objects.all(),
        write_only=True,
        required=False,
    )
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=ExperienceProduct.objects.all(),
        write_only=True,
        required=False,
    )

    class Meta:
        model = ProductBusinessAgreement
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "business_entity",
            "business_entity_id",
            "business_entity_name",
            "product",
            "product_id",
            "product_name",
            "name",
            "version",
            "agreement_type",
            "settlement_basis",
            "collection_mode",
            "partner_fixed_amount",
            "partner_percentage",
            "platform_fixed_amount",
            "platform_percentage",
            "seller_commission_included",
            "settlement_cycle_days",
            "payment_due_days",
            "currency",
            "effective_from",
            "effective_until",
            "terms",
            "extra_rules",
            "is_active",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "organisation",
            "organisation_name",
            "business_entity",
            "business_entity_name",
            "product",
            "product_name",
            "created_by",
            "created_by_email",
            "created_at",
            "updated_at",
        ]
        validators = []

    def validate(self, attrs):
        entity = attrs.get("business_entity") or getattr(
            self.instance,
            "business_entity",
            None,
        )
        product = attrs.get("product") or getattr(self.instance, "product", None)
        effective_from = attrs.get(
            "effective_from",
            getattr(self.instance, "effective_from", None),
        )
        effective_until = attrs.get(
            "effective_until",
            getattr(self.instance, "effective_until", None),
        )
        partner_percentage = attrs.get(
            "partner_percentage",
            getattr(self.instance, "partner_percentage", Decimal("0.00")),
        )
        platform_percentage = attrs.get(
            "platform_percentage",
            getattr(self.instance, "platform_percentage", Decimal("0.00")),
        )

        if entity:
            self.validate_same_organisation(entity, "business_entity_id")
        if product:
            self.validate_same_organisation(product, "product_id")

        if (
            entity
            and product
            and entity.organisation_id != product.organisation_id
        ):
            raise serializers.ValidationError(
                "The business entity and product must belong to the same organisation."
            )

        if effective_from and effective_until and effective_until < effective_from:
            raise serializers.ValidationError(
                {"effective_until": "The end date cannot be before the start date."}
            )

        for field_name, value in (
            ("partner_percentage", partner_percentage),
            ("platform_percentage", platform_percentage),
        ):
            if value is not None and (value < 0 or value > 100):
                raise serializers.ValidationError(
                    {field_name: "Percentage must be between 0 and 100."}
                )

        return attrs

    def create(self, validated_data):
        request = self.context.get("request")
        if request and request.user and request.user.is_authenticated:
            validated_data.setdefault("created_by", request.user)
        return super().create(validated_data)


class BookingFinancialSnapshotSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    agreement_name = serializers.CharField(
        source="agreement.name",
        read_only=True,
    )

    class Meta:
        model = BookingFinancialSnapshot
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "business_entity",
            "business_entity_name",
            "agreement",
            "agreement_name",
            "agreement_version",
            "settlement_basis",
            "currency",
            "quantity",
            "gross_amount",
            "discount_amount",
            "tax_amount",
            "net_customer_amount",
            "partner_entitlement",
            "platform_entitlement",
            "seller_entitlement",
            "collected_by_platform",
            "collected_by_partner",
            "collected_by_seller",
            "customer_balance_due",
            "primary_collection_party",
            "calculation_data",
            "captured_at",
            "updated_at",
        ]
        read_only_fields = fields


class AdmissionTokenSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    remaining_admissions = serializers.IntegerField(read_only=True)
    is_currently_valid = serializers.BooleanField(read_only=True)
    token_url_value = serializers.SerializerMethodField()

    class Meta:
        model = AdmissionToken
        fields = [
            "id",
            "organisation",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "business_entity",
            "business_entity_name",
            "token",
            "token_url_value",
            "status",
            "valid_from",
            "valid_until",
            "total_admissions",
            "admitted_quantity",
            "remaining_admissions",
            "is_currently_valid",
            "is_primary",
            "issued_at",
            "revoked_at",
            "revoked_by",
            "revocation_reason",
            "metadata",
        ]
        read_only_fields = fields

    def get_token_url_value(self, obj):
        return str(obj.token)


class TicketScanAttemptSerializer(serializers.ModelSerializer):
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )
    scanned_by_email = serializers.EmailField(
        source="scanned_by.email",
        read_only=True,
    )

    class Meta:
        model = TicketScanAttempt
        fields = [
            "id",
            "organisation",
            "business_entity",
            "business_entity_name",
            "scanned_by",
            "scanned_by_email",
            "admission_token",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "scanned_value",
            "result",
            "requested_quantity",
            "admitted_quantity",
            "failure_reason",
            "scanner_device_id",
            "scanner_name",
            "location_name",
            "ip_address",
            "user_agent",
            "offline_event_id",
            "metadata",
            "scanned_at",
        ]
        read_only_fields = fields


class TicketAdmissionSerializer(serializers.ModelSerializer):
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )
    admitted_by_email = serializers.EmailField(
        source="admitted_by.email",
        read_only=True,
    )
    reversed_by_email = serializers.EmailField(
        source="reversed_by.email",
        read_only=True,
    )
    effective_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = TicketAdmission
        fields = [
            "id",
            "organisation",
            "business_entity",
            "business_entity_name",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "admission_token",
            "scan_attempt",
            "quantity_admitted",
            "effective_quantity",
            "status",
            "admitted_at",
            "admitted_by",
            "admitted_by_email",
            "scanner_device_id",
            "location_name",
            "notes",
            "metadata",
            "reversed_at",
            "reversed_by",
            "reversed_by_email",
            "reversal_reason",
        ]
        read_only_fields = fields


class TicketingLedgerEntrySerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )
    seller_name = serializers.CharField(
        source="seller.full_name",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    created_by_email = serializers.EmailField(
        source="created_by.email",
        read_only=True,
    )
    signed_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )

    class Meta:
        model = TicketingLedgerEntry
        fields = [
            "id",
            "organisation",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "booking_payment",
            "seller",
            "seller_name",
            "business_entity",
            "business_entity_name",
            "entry_group",
            "entry_type",
            "direction",
            "party_type",
            "amount",
            "signed_amount",
            "currency",
            "description",
            "reference",
            "effective_at",
            "is_reversed",
            "reverses_entry",
            "metadata",
            "created_by",
            "created_by_email",
            "created_at",
        ]
        read_only_fields = fields


class PartnerSettlementLineSerializer(serializers.ModelSerializer):
    booking_code = serializers.CharField(
        source="booking.booking_code",
        read_only=True,
    )
    product_name = serializers.CharField(
        source="booking_item.product_name",
        read_only=True,
    )

    class Meta:
        model = PartnerSettlementLine
        fields = [
            "id",
            "settlement",
            "booking",
            "booking_code",
            "booking_item",
            "product_name",
            "financial_snapshot",
            "service_date",
            "booked_quantity",
            "admitted_quantity",
            "settlement_quantity",
            "gross_amount",
            "discount_amount",
            "refund_amount",
            "partner_entitlement",
            "platform_entitlement",
            "seller_entitlement",
            "collected_by_partner",
            "collected_by_platform",
            "collected_by_seller",
            "customer_balance_due",
            "partner_due_to_platform",
            "platform_due_to_partner",
            "net_amount",
            "calculation_data",
            "created_at",
        ]
        read_only_fields = fields


class PartnerSettlementPaymentSerializer(MediaURLMixin, serializers.ModelSerializer):
    settlement_number = serializers.CharField(
        source="settlement.settlement_number",
        read_only=True,
    )
    recorded_by_email = serializers.EmailField(
        source="recorded_by.email",
        read_only=True,
    )
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = PartnerSettlementPayment
        fields = [
            "id",
            "settlement",
            "settlement_number",
            "payer_type",
            "payee_type",
            "amount",
            "currency",
            "payment_method",
            "status",
            "reference",
            "paid_at",
            "notes",
            "attachment",
            "attachment_url",
            "recorded_by",
            "recorded_by_email",
            "ledger_entry_group",
            "created_at",
        ]
        read_only_fields = [
            "id",
            "settlement_number",
            "attachment_url",
            "recorded_by",
            "recorded_by_email",
            "ledger_entry_group",
            "created_at",
        ]

    def get_attachment_url(self, obj):
        return self.build_file_url(obj.attachment)

    def validate(self, attrs):
        payer_type = attrs.get(
            "payer_type",
            getattr(self.instance, "payer_type", None),
        )
        payee_type = attrs.get(
            "payee_type",
            getattr(self.instance, "payee_type", None),
        )
        amount = attrs.get("amount", getattr(self.instance, "amount", None))

        if payer_type and payee_type and payer_type == payee_type:
            raise serializers.ValidationError(
                {"payee_type": "Payer and payee must be different parties."}
            )
        if amount is not None and amount <= 0:
            raise serializers.ValidationError(
                {"amount": "Settlement payment amount must be greater than zero."}
            )
        return attrs


class PartnerSettlementPeriodSerializer(serializers.ModelSerializer):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )
    business_entity_name = serializers.CharField(
        source="business_entity.name",
        read_only=True,
    )
    generated_by_email = serializers.EmailField(
        source="generated_by.email",
        read_only=True,
    )
    approved_by_email = serializers.EmailField(
        source="approved_by.email",
        read_only=True,
    )
    outstanding_amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        read_only=True,
    )
    lines = PartnerSettlementLineSerializer(many=True, read_only=True)
    payments = PartnerSettlementPaymentSerializer(many=True, read_only=True)

    class Meta:
        model = PartnerSettlementPeriod
        fields = [
            "id",
            "organisation",
            "organisation_name",
            "business_entity",
            "business_entity_name",
            "settlement_number",
            "period_start",
            "period_end",
            "currency",
            "status",
            "total_bookings",
            "total_guests_booked",
            "total_guests_admitted",
            "total_no_shows",
            "gross_sales",
            "discounts",
            "refunds",
            "partner_entitlement",
            "platform_entitlement",
            "seller_entitlement",
            "collected_by_partner",
            "collected_by_platform",
            "collected_by_sellers",
            "customer_balance_due",
            "partner_owes_platform",
            "platform_owes_partner",
            "net_settlement_amount",
            "paid_amount",
            "outstanding_amount",
            "generated_at",
            "generated_by",
            "generated_by_email",
            "approved_at",
            "approved_by",
            "approved_by_email",
            "settled_at",
            "notes",
            "calculation_data",
            "lines",
            "payments",
            "created_at",
            "updated_at",
        ]
        read_only_fields = fields


# Action/input serializers intentionally do not create database records directly.
# Views and service classes must perform locking, authorization, ledger posting,
# token updates, and settlement recalculation atomically.


class AdmissionTokenIssueSerializer(serializers.Serializer):
    booking_item_id = serializers.IntegerField(min_value=1)
    business_entity_id = serializers.IntegerField(
        min_value=1,
        required=False,
        allow_null=True,
    )
    total_admissions = serializers.IntegerField(min_value=1, required=False)
    valid_from = serializers.DateTimeField(required=False, allow_null=True)
    valid_until = serializers.DateTimeField(required=False, allow_null=True)
    is_primary = serializers.BooleanField(required=False, default=True)
    metadata = serializers.JSONField(required=False)

    def validate(self, attrs):
        valid_from = attrs.get("valid_from")
        valid_until = attrs.get("valid_until")
        if valid_from and valid_until and valid_until <= valid_from:
            raise serializers.ValidationError(
                {"valid_until": "Valid-until must be later than valid-from."}
            )
        return attrs


class TicketScanResolveSerializer(serializers.Serializer):
    token = serializers.UUIDField()
    requested_quantity = serializers.IntegerField(
        min_value=1,
        required=False,
        default=1,
    )
    scanner_device_id = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
    )
    scanner_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=150,
    )
    location_name = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=255,
    )
    offline_event_id = serializers.UUIDField(required=False, allow_null=True)
    metadata = serializers.JSONField(required=False)


class TicketAdmissionCreateSerializer(TicketScanResolveSerializer):
    notes = serializers.CharField(required=False, allow_blank=True)
    confirm = serializers.BooleanField(required=False, default=True)


class TicketAdmissionReverseSerializer(serializers.Serializer):
    reason = serializers.CharField(
        required=True,
        allow_blank=False,
        max_length=1000,
    )


class SettlementGenerateSerializer(serializers.Serializer):
    business_entity_id = serializers.IntegerField(min_value=1)
    period_start = serializers.DateField()
    period_end = serializers.DateField()
    regenerate_draft = serializers.BooleanField(required=False, default=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["period_end"] < attrs["period_start"]:
            raise serializers.ValidationError(
                {"period_end": "Period end cannot be before period start."}
            )
        return attrs


class SettlementApprovalSerializer(serializers.Serializer):
    notes = serializers.CharField(required=False, allow_blank=True)


class SettlementPaymentCreateSerializer(serializers.Serializer):
    payer_type = serializers.ChoiceField(
        choices=PartnerSettlementPayment.PARTY_TYPE_CHOICES,
    )
    payee_type = serializers.ChoiceField(
        choices=PartnerSettlementPayment.PARTY_TYPE_CHOICES,
    )
    amount = serializers.DecimalField(
        max_digits=14,
        decimal_places=2,
        min_value=Decimal("0.01"),
    )
    currency = serializers.CharField(required=False, max_length=10)
    payment_method = serializers.ChoiceField(
        choices=PartnerSettlementPayment.METHOD_CHOICES,
        required=False,
        default="bank_transfer",
    )
    status = serializers.ChoiceField(
        choices=PartnerSettlementPayment.STATUS_CHOICES,
        required=False,
        default="confirmed",
    )
    reference = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=180,
    )
    paid_at = serializers.DateTimeField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, attrs):
        if attrs["payer_type"] == attrs["payee_type"]:
            raise serializers.ValidationError(
                {"payee_type": "Payer and payee must be different parties."}
            )
        return attrs

