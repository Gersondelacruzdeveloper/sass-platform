from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import serializers
from .notifications import BookingNotificationService

from .models import (
    TicketingEmailSettings,
    TicketingSettings,
    TicketingPublicSiteSettings,
    TicketingPaymentProviderSettings,
    ExperienceCategory,
    ExperienceProduct,
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
        return self.build_file_url(obj.favicon)

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


class ExperienceProductSerializer(
    MediaURLMixin,
    OrganisationScopedSerializerMixin,
    serializers.ModelSerializer,
):
    organisation_name = serializers.CharField(
        source="organisation.name",
        read_only=True,
    )

    category_detail = ExperienceCategorySerializer(source="category", read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category",
        queryset=ExperienceCategory.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    image_url = serializers.SerializerMethodField()
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
            "seller_margin_percent",
            "seller_allowed_discount_percent",
            "profit_per_unit",
            "deposit_amount",
            "deposit_percentage",
            "capacity",
            "duration_text",
            "start_time",
            "end_time",
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

    def validate(self, attrs):
        category = attrs.get("category")

        if category:
            self.validate_same_organisation(category, "category_id")

        return attrs


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
                        unit_price = product.base_price

                if unit_cost is None:
                    if package:
                        unit_cost = package.cost_price
                    else:
                        unit_cost = product.cost_price

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
                total=unit_price * quantity,
                instructions=item_data.get("instructions", ""),
            )

            subtotal += booking_item.total
            total_cost += unit_cost * quantity

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
