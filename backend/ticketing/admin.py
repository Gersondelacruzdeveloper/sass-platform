from django.contrib import admin
from django.utils.html import format_html
from .models import (
    TicketingEmailSettings,
    TicketingPaymentProviderSettings,
    TicketingSettings,
    TicketingPublicSiteSettings,
    ExperienceCategory,
    ExperienceProduct,
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
    TicketAdmission,
)


@admin.register(TicketingSettings)
class TicketingSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "module_name",
        "public_brand_name",
        "currency_symbol",
        "default_currency",
        "wellet_enabled",
        "is_active",
        "updated_at",
    )
    list_filter = ("is_active", "wellet_enabled", "default_currency")
    search_fields = ("organisation__name", "module_name", "public_brand_name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(TicketingPublicSiteSettings)
class TicketingPublicSiteSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "display_title",
        "subdomain",
        "custom_domain",
        "is_published",
        "robots_allow_indexing",
        "robots_allow_ai_crawlers",
        "updated_at",
    )
    list_filter = (
        "is_published",
        "robots_allow_indexing",
        "robots_allow_ai_crawlers",
        "allow_gptbot",
        "allow_oai_searchbot",
    )
    search_fields = (
        "organisation__name",
        "site_title",
        "subdomain",
        "custom_domain",
        "public_email",
        "public_whatsapp",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(ExperienceCategory)
class ExperienceCategoryAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "organisation",
        "slug",
        "is_active",
        "sort_order",
        "updated_at",
    )
    list_filter = ("is_active", "organisation")
    search_fields = ("name", "slug", "organisation__name")
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


class ExperiencePackageInline(admin.TabularInline):
    model = ExperiencePackage
    extra = 0
    fields = (
        "name",
        "price",
        "cost_price",
        "deposit_amount",
        "capacity",
        "is_default",
        "is_active",
        "sort_order",
    )


class ProductAvailabilityInline(admin.TabularInline):
    model = ProductAvailability
    extra = 0
    fields = (
        "date",
        "package",
        "available_capacity",
        "booked_quantity",
        "price_override",
        "deposit_override",
        "is_available",
    )


class ProductPickupScheduleInline(admin.TabularInline):
    model = ProductPickupSchedule
    extra = 0
    fields = (
        "pickup_location",
        "day_of_week",
        "specific_date",
        "pickup_time",
        "pickup_point",
        "is_active",
    )


class TransferRouteInline(admin.TabularInline):
    model = TransferRoute
    extra = 0
    fields = (
        "origin",
        "destination",
        "airport",
        "vehicle_type",
        "is_round_trip",
        "max_passengers",
        "price",
        "round_trip_price",
        "is_active",
    )


class TransferPriceBandInline(admin.TabularInline):
    model = TransferPriceBand
    extra = 0
    fields = (
        "name",
        "min_passengers",
        "max_passengers",
        "vehicle_type",
        "one_way_price",
        "round_trip_price",
        "is_active",
        "sort_order",
    )
    ordering = ("sort_order", "min_passengers")


class EventTicketTypeInline(admin.TabularInline):
    model = EventTicketType
    extra = 0
    fields = (
        "name",
        "price",
        "deposit_amount",
        "capacity",
        "sold_quantity",
        "is_active",
        "sort_order",
    )


@admin.register(ExperienceProduct)
class ExperienceProductAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "organisation",
        "product_type",
        "base_price",
        "deposit_amount",
        "status",
        "public_enabled",
        "seller_enabled",
        "supports_pickup",
        "is_featured",
        "booking_count",
        "average_rating",
        "updated_at",
    )
    list_filter = (
        "product_type",
        "status",
        "external_provider",
        "is_cocobongo_product",
        "public_enabled",
        "seller_enabled",
        "supports_pickup",
        "is_featured",
        "is_recommended",
        "organisation",
    )
    search_fields = (
        "name",
        "slug",
        "sku",
        "organisation__name",
        "category__name",
        "external_product_id",
    )
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = (
        "view_count",
        "booking_count",
        "average_rating",
        "review_count",
        "created_at",
        "updated_at",
    )

    def get_inlines(self, request, obj=None):
        if obj and (obj.is_cocobongo_product or obj.external_provider == "wellet"):
            return ()

        return (
            ExperiencePackageInline,
            ProductAvailabilityInline,
            ProductPickupScheduleInline,
            TransferRouteInline,
            EventTicketTypeInline,
        )

@admin.register(ExperiencePackage)
class ExperiencePackageAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "product",
        "price",
        "cost_price",
        "deposit_amount",
        "capacity",
        "is_default",
        "is_active",
        "sort_order",
    )
    list_filter = ("is_default", "is_active", "product__product_type")
    search_fields = ("name", "product__name", "product__organisation__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProductAvailability)
class ProductAvailabilityAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "package",
        "date",
        "available_capacity",
        "booked_quantity",
        "remaining_capacity",
        "is_available",
    )
    list_filter = ("is_available", "date", "product__product_type")
    search_fields = ("product__name", "package__name", "product__organisation__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PickupZone)
class PickupZoneAdmin(admin.ModelAdmin):
    list_display = ("name", "organisation", "is_active", "updated_at")
    list_filter = ("is_active", "organisation")
    search_fields = ("name", "organisation__name")
    readonly_fields = ("created_at", "updated_at")


@admin.register(PickupLocation)
class PickupLocationAdmin(admin.ModelAdmin):
    list_display = (
        "name",
        "organisation",
        "zone",
        "location_type",
        "default_pickup_point",
        "is_active",
    )
    list_filter = ("location_type", "is_active", "zone", "organisation")
    search_fields = (
        "name",
        "slug",
        "organisation__name",
        "zone__name",
        "address",
        "default_pickup_point",
    )
    prepopulated_fields = {"slug": ("name",)}
    readonly_fields = ("created_at", "updated_at")


@admin.register(ProductPickupSchedule)
class ProductPickupScheduleAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "pickup_location",
        "day_of_week",
        "specific_date",
        "pickup_time",
        "resolved_pickup_point",
        "is_active",
    )
    list_filter = ("is_active", "day_of_week", "specific_date", "product__product_type")
    search_fields = (
        "product__name",
        "pickup_location__name",
        "pickup_point",
        "instructions",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "organisation",
        "whatsapp",
        "email",
        "hotel_name",
        "total_bookings",
        "total_spent",
        "created_at",
    )
    list_filter = ("organisation", "created_at")
    search_fields = (
        "full_name",
        "whatsapp",
        "phone",
        "email",
        "hotel_name",
        "organisation__name",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(Seller)
class SellerAdmin(admin.ModelAdmin):
    list_display = (
        "full_name",
        "organisation",
        "role",
        "seller_slug",
        "commission_rate",
        "can_access_dashboard",
        "is_active",
        "total_sales_amount",
        "total_commission_amount",
        "total_collected_amount",
        "total_owed_to_company",
    )
    list_filter = (
        "role",
        "is_active",
        "can_access_dashboard",
        "can_sell_cocobongo",
        "can_sell_excursions",
        "can_sell_transfers",
        "can_sell_events",
        "organisation",
    )
    search_fields = (
        "full_name",
        "seller_slug",
        "email",
        "phone",
        "whatsapp",
        "organisation__name",
        "user__email",
    )
    prepopulated_fields = {"seller_slug": ("full_name",)}
    readonly_fields = (
        "total_sales_amount",
        "total_commission_amount",
        "total_collected_amount",
        "total_owed_to_company",
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "organisation",
                    "user",
                    "full_name",
                    "seller_slug",
                    "role",
                    "email",
                    "phone",
                    "whatsapp",
                    "photo",
                    "is_active",
                )
            },
        ),
        (
            "Commission",
            {
                "fields": (
                    "commission_rate",
                    "fixed_commission_amount",
                    "total_sales_amount",
                    "total_commission_amount",
                    "total_collected_amount",
                    "total_owed_to_company",
                )
            },
        ),
        (
            "Product Permissions",
            {
                "fields": (
                    "can_access_dashboard",
                    "can_sell_cocobongo",
                    "can_sell_excursions",
                    "can_sell_transfers",
                    "can_sell_events",
                    "can_sell_custom_tours",
                    "can_create_bookings",
                )
            },
        ),
        (
            "Payment Permissions",
            {
                "fields": (
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
                )
            },
        ),
        (
            "Action Permissions",
            {
                "fields": (
                    "can_view_own_sales",
                    "can_view_own_commissions",
                    "can_apply_discounts",
                    "can_cancel_bookings",
                    "can_send_whatsapp",
                    "can_send_email",
                    "can_override_pickup_time",
                )
            },
        ),
        (
            "Management Permissions",
            {
                "fields": (
                    "can_view_reports",
                    "can_manage_products",
                    "can_manage_sellers",
                    "can_manage_settings",
                    "can_manage_integrations",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )


class BookingItemInline(admin.TabularInline):
    model = BookingItem
    extra = 0
    fields = (
        "product",
        "package",
        "event_ticket_type",
        "product_name",
        "product_type",
        "service_date",
        "service_time",
        "quantity",
        "unit_price",
        "unit_cost",
        "total",
    )
    readonly_fields = ("total",)


class BookingPaymentInline(admin.TabularInline):
    model = BookingPayment
    extra = 0
    fields = (
        "amount",
        "payment_type",
        "payer_type",
        "method",
        "status",
        "seller",
        "collected_by",
        "reference",
        "paid_at",
    )


class SellerCommissionInline(admin.TabularInline):
    model = SellerCommission
    extra = 0
    fields = (
        "seller",
        "amount",
        "rate_used",
        "status",
        "paid_at",
        "paid_by",
    )


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = (
        "booking_code",
        "organisation",
        "customer_name",
        "seller",
        "primary_product",
        "service_date",
        "total_guests",
        "total_amount",
        "deposit_paid",
        "balance_due",
        "payment_status",
        "status",
        "source",
        "created_at",
    )
    list_filter = (
        "status",
        "payment_status",
        "payment_mode",
        "payment_method",
        "source",
        "requires_supervisor_approval",
        "service_date",
        "organisation",
    )
    search_fields = (
        "booking_code",
        "customer_name",
        "customer_whatsapp",
        "customer_email",
        "customer_hotel",
        "seller__full_name",
        "primary_product__name",
        "organisation__name",
        "external_reference",
    )
    readonly_fields = (
        "booking_code",
        "total_guests",
        "created_at",
        "updated_at",
        "confirmed_at",
        "cancelled_at",
        "completed_at",
    )
    inlines = (
        BookingItemInline,
        BookingPaymentInline,
        SellerCommissionInline,
    )

    fieldsets = (
        (
            "Booking Information",
            {
                "fields": (
                    "organisation",
                    "booking_code",
                    "customer",
                    "seller",
                    "primary_product",
                    "source",
                    "status",
                    "service_date",
                    "service_time",
                    "created_by",
                )
            },
        ),
        (
            "Customer",
            {
                "fields": (
                    "customer_name",
                    "customer_whatsapp",
                    "customer_email",
                    "customer_hotel",
                    "customer_notes",
                    "adults",
                    "children",
                    "infants",
                    "total_guests",
                )
            },
        ),
        (
            "Payment",
            {
                "fields": (
                    "payment_status",
                    "payment_mode",
                    "payment_method",
                    "subtotal_amount",
                    "discount_amount",
                    "tax_amount",
                    "total_amount",
                    "deposit_required",
                    "deposit_paid",
                    "balance_due",
                    "seller_collected_amount",
                    "seller_due_to_company",
                    "seller_commission_amount",
                    "commission_paid_amount",
                )
            },
        ),
        (
            "Supervisor Approval",
            {
                "fields": (
                    "requires_supervisor_approval",
                    "supervisor_approved_by",
                    "supervisor_approved_at",
                    "supervisor_notes",
                    "receipt_sent_before_full_payment",
                )
            },
        ),
        (
            "Transfer Information",
            {
                "fields": (
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
                )
            },
        ),
        (
            "External Provider",
            {
                "fields": (
                    "external_provider",
                    "external_reference",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "confirmed_at",
                    "cancelled_at",
                    "completed_at",
                    "cancellation_reason",
                )
            },
        ),
    )


@admin.register(BookingItem)
class BookingItemAdmin(admin.ModelAdmin):
    list_display = (
        "booking",
        "product_name",
        "product_type",
        "service_date",
        "quantity",
        "unit_price",
        "unit_cost",
        "total",
        "created_at",
    )
    list_filter = ("product_type", "service_date")
    search_fields = (
        "booking__booking_code",
        "product_name",
        "product__name",
        "booking__customer_name",
    )
    readonly_fields = ("created_at",)


@admin.register(BookingPickupInfo)
class BookingPickupInfoAdmin(admin.ModelAdmin):
    list_display = (
        "booking",
        "hotel_or_location_name",
        "pickup_zone_name",
        "pickup_time",
        "pickup_point",
        "was_overridden",
        "updated_at",
    )
    list_filter = ("was_overridden", "pickup_time")
    search_fields = (
        "booking__booking_code",
        "hotel_or_location_name",
        "pickup_zone_name",
        "pickup_point",
        "instructions",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(BookingPayment)
class BookingPaymentAdmin(admin.ModelAdmin):
    list_display = (
        "booking",
        "amount",
        "payment_type",
        "payer_type",
        "method",
        "status",
        "seller",
        "collected_by",
        "paid_at",
    )
    list_filter = ("payment_type", "payer_type", "method", "status", "paid_at")
    search_fields = (
        "booking__booking_code",
        "booking__customer_name",
        "seller__full_name",
        "reference",
    )
    readonly_fields = ("created_at",)


@admin.register(SellerCommission)
class SellerCommissionAdmin(admin.ModelAdmin):
    list_display = (
        "seller",
        "booking",
        "organisation",
        "amount",
        "rate_used",
        "status",
        "paid_at",
        "created_at",
    )
    list_filter = ("status", "organisation", "paid_at", "created_at")
    search_fields = (
        "seller__full_name",
        "booking__booking_code",
        "organisation__name",
    )
    readonly_fields = ("created_at",)


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    list_display = (
        "receipt_number",
        "booking",
        "sent_by_email",
        "sent_by_whatsapp",
        "email_sent_at",
        "whatsapp_sent_at",
        "created_at",
    )
    list_filter = ("sent_by_email", "sent_by_whatsapp", "created_at")
    search_fields = (
        "receipt_number",
        "booking__booking_code",
        "booking__customer_name",
    )
    readonly_fields = (
        "receipt_number",
        "public_url_token",
        "created_at",
    )


@admin.register(NotificationLog)
class NotificationLogAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "booking",
        "channel",
        "recipient",
        "status",
        "sent_at",
        "created_at",
    )
    list_filter = ("channel", "status", "organisation", "created_at")
    search_fields = (
        "recipient",
        "subject",
        "booking__booking_code",
        "organisation__name",
    )
    readonly_fields = ("created_at",)


@admin.register(ExternalProviderConfig)
class ExternalProviderConfigAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "provider",
        "is_enabled",
        "show_id",
        "category_id",
        "currency",
        "lang",
        "include_table",
        "updated_at",
    )
    list_filter = ("provider", "is_enabled", "currency", "lang", "include_table")
    search_fields = (
        "organisation__name",
        "provider",
        "show_id",
        "category_id",
    )
    readonly_fields = ("created_at", "updated_at")


@admin.register(ExternalProviderProductSnapshot)
class ExternalProviderProductSnapshotAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "provider",
        "external_name",
        "external_product_id",
        "price",
        "currency",
        "service_date",
        "created_at",
    )
    list_filter = ("provider", "currency", "service_date", "created_at")
    search_fields = (
        "organisation__name",
        "external_name",
        "external_product_id",
        "product__name",
    )
    readonly_fields = ("created_at",)


@admin.register(TransferRoute)
class TransferRouteAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "origin",
        "destination",
        "airport",
        "is_round_trip",
        "is_active",
        "created_at",
    )
    list_filter = ("is_round_trip", "is_active", "product__organisation")
    search_fields = (
        "product__name",
        "origin",
        "destination",
        "airport",
        "product__organisation__name",
    )
    readonly_fields = ("created_at", "updated_at")
    inlines = (TransferPriceBandInline,)


@admin.register(TransferPriceBand)
class TransferPriceBandAdmin(admin.ModelAdmin):
    list_display = (
        "route",
        "name",
        "min_passengers",
        "max_passengers",
        "vehicle_type",
        "one_way_price",
        "round_trip_price",
        "is_active",
        "sort_order",
    )
    list_filter = ("is_active", "vehicle_type", "route__product__organisation")
    search_fields = (
        "route__origin",
        "route__destination",
        "route__product__name",
        "name",
    )
    ordering = ("route", "sort_order", "min_passengers")
    readonly_fields = ("created_at", "updated_at")


@admin.register(EventTicketType)
class EventTicketTypeAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "name",
        "price",
        "deposit_amount",
        "capacity",
        "sold_quantity",
        "available_tickets",
        "is_active",
        "sort_order",
    )
    list_filter = ("is_active",)
    search_fields = (
        "product__name",
        "name",
        "product__organisation__name",
    )


@admin.register(ProductReview)
class ProductReviewAdmin(admin.ModelAdmin):
    list_display = (
        "product",
        "customer_name",
        "rating",
        "is_public",
        "is_approved",
        "created_at",
    )
    list_filter = ("rating", "is_public", "is_approved", "created_at")
    search_fields = (
        "product__name",
        "customer_name",
        "customer__full_name",
        "organisation__name",
        "title",
        "comment",
    )
    readonly_fields = ("created_at",)

@admin.register(TicketingPaymentProviderSettings)
class TicketingPaymentProviderSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "default_provider",
        "stripe_enabled",
        "stripe_connect_status",
        "paypal_enabled",
        "paypal_mode",
        "is_active",
        "updated_at",
    )

    list_filter = (
        "default_provider",
        "stripe_enabled",
        "paypal_enabled",
        "stripe_connect_status",
        "paypal_mode",
        "is_active",
    )

    search_fields = (
        "organisation__name",
        "stripe_connect_account_id",
    )

    readonly_fields = (
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "General",
            {
                "fields": (
                    "organisation",
                    "default_provider",
                    "is_active",
                )
            },
        ),
        (
            "Stripe",
            {
                "fields": (
                    "stripe_enabled",
                    "stripe_publishable_key",
                    "stripe_secret_key",
                    "stripe_webhook_secret",
                    "stripe_connect_account_id",
                    "stripe_connect_status",
                )
            },
        ),
        (
            "PayPal",
            {
                "fields": (
                    "paypal_enabled",
                    "paypal_mode",
                    "paypal_client_id",
                    "paypal_client_secret",
                    "paypal_merchant_id",
                    "paypal_webhook_id",
                )
            },
        ),
        (
            "Messages",
            {
                "fields": (
                    "payment_success_message",
                    "payment_pending_message",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )



@admin.register(TicketingEmailSettings)
class TicketingEmailSettingsAdmin(admin.ModelAdmin):
    list_display = (
        "organisation",
        "provider",
        "is_active",
        "smtp_username",
        "sender_email",
        "connection_status",
        "updated_at",
    )

    list_filter = (
        "provider",
        "connection_status",
        "is_active",
    )

    search_fields = (
        "organisation__name",
        "smtp_username",
        "sender_email",
    )

    readonly_fields = (
        "connection_status",
        "last_test_email",
        "last_test_at",
        "last_error_message",
        "created_at",
        "updated_at",
    )

    fieldsets = (
        (
            "General",
            {
                "fields": (
                    "organisation",
                    "provider",
                    "is_active",
                )
            },
        ),
        (
            "SMTP",
            {
                "fields": (
                    "smtp_host",
                    "smtp_port",
                    "smtp_encryption",
                    "smtp_username",
                    "smtp_password",
                )
            },
        ),
        (
            "Sender",
            {
                "fields": (
                    "sender_name",
                    "sender_email",
                    "reply_to_email",
                )
            },
        ),
        (
            "Booking Emails",
            {
                "fields": (
                    "send_customer_confirmation",
                    "send_owner_notification",
                    "send_receipt_email",
                    "send_cancellation_email",
                    "send_review_request_email",
                    "send_reminder_email",
                )
            },
        ),
        (
            "Connection Status",
            {
                "fields": (
                    "connection_status",
                    "last_test_email",
                    "last_test_at",
                    "last_error_message",
                )
            },
        ),
        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                )
            },
        ),
    )


@admin.register(TicketAdmission)
class TicketAdmissionAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "booking_code",
        "product_name",
        "business_entity",
        "quantity_admitted",
        "effective_quantity_display",
        "status",
        "admitted_at",
        "admitted_by",
        "location_name",
    )

    list_filter = (
        "status",
        "organisation",
        "business_entity",
        "admitted_at",
        "reversed_at",
    )

    search_fields = (
        "booking__booking_code",
        "booking__customer_name",
        "booking__customer_email",
        "booking_item__product_name",
        "admission_token__token",
        "scanner_device_id",
        "location_name",
        "notes",
        "reversal_reason",
    )

    autocomplete_fields = (
        "organisation",
        "business_entity",
        "booking",
        "booking_item",
        "admission_token",
        "scan_attempt",
        "admitted_by",
        "reversed_by",
    )

    readonly_fields = (
        "effective_quantity_display",
        "created_booking_code",
        "created_product_name",
        "admitted_at",
        "reversed_at",
    )

    date_hierarchy = "admitted_at"

    ordering = (
        "-admitted_at",
    )

    list_select_related = (
        "organisation",
        "business_entity",
        "booking",
        "booking_item",
        "admission_token",
        "scan_attempt",
        "admitted_by",
        "reversed_by",
    )

    list_per_page = 50

    fieldsets = (
        (
            "Admission",
            {
                "fields": (
                    "organisation",
                    "business_entity",
                    "booking",
                    "created_booking_code",
                    "booking_item",
                    "created_product_name",
                    "admission_token",
                    "scan_attempt",
                    "quantity_admitted",
                    "effective_quantity_display",
                    "status",
                    "admitted_at",
                    "admitted_by",
                ),
            },
        ),
        (
            "Scanner information",
            {
                "fields": (
                    "scanner_device_id",
                    "location_name",
                ),
            },
        ),
        (
            "Additional information",
            {
                "fields": (
                    "notes",
                    "metadata",
                ),
                "classes": ("collapse",),
            },
        ),
        (
            "Reversal",
            {
                "fields": (
                    "reversed_at",
                    "reversed_by",
                    "reversal_reason",
                ),
                "classes": ("collapse",),
            },
        ),
    )

    actions = (
        "mark_as_admitted",
        "mark_as_boarded",
        "mark_as_picked_up",
        "mark_as_completed",
        "reverse_selected_admissions",
        "mark_as_void",
    )

    @admin.display(
        description="Booking",
        ordering="booking__booking_code",
    )
    def booking_code(self, obj):
        return obj.booking.booking_code if obj.booking_id else "-"

    @admin.display(
        description="Product / Item",
        ordering="booking_item__product_name",
    )
    def product_name(self, obj):
        if not obj.booking_item_id:
            return "-"

        return (
            getattr(obj.booking_item, "product_name", None)
            or str(obj.booking_item)
        )

    @admin.display(description="Booking code")
    def created_booking_code(self, obj):
        return self.booking_code(obj)

    @admin.display(description="Product / Item")
    def created_product_name(self, obj):
        return self.product_name(obj)

    @admin.display(
        description="Effective quantity",
        ordering="quantity_admitted",
    )
    def effective_quantity_display(self, obj):
        if obj.status in {"reversed", "void"}:
            return format_html(
                '<span style="color: #ba2121; font-weight: 600;">0</span>'
            )

        return obj.effective_quantity

    @admin.action(description="Mark selected admissions as admitted")
    def mark_as_admitted(self, request, queryset):
        updated = queryset.exclude(
            status__in={"reversed", "void"}
        ).update(status="admitted")

        self.message_user(
            request,
            f"{updated} admission(s) marked as admitted.",
        )

    @admin.action(description="Mark selected admissions as boarded")
    def mark_as_boarded(self, request, queryset):
        updated = queryset.exclude(
            status__in={"reversed", "void"}
        ).update(status="boarded")

        self.message_user(
            request,
            f"{updated} admission(s) marked as boarded.",
        )

    @admin.action(description="Mark selected admissions as picked up")
    def mark_as_picked_up(self, request, queryset):
        updated = queryset.exclude(
            status__in={"reversed", "void"}
        ).update(status="picked_up")

        self.message_user(
            request,
            f"{updated} admission(s) marked as picked up.",
        )

    @admin.action(description="Mark selected admissions as completed")
    def mark_as_completed(self, request, queryset):
        updated = queryset.exclude(
            status__in={"reversed", "void"}
        ).update(status="completed")

        self.message_user(
            request,
            f"{updated} admission(s) marked as completed.",
        )

    @admin.action(description="Reverse selected admissions")
    def reverse_selected_admissions(self, request, queryset):
        updated = 0

        for admission in queryset.exclude(
            status__in={"reversed", "void"}
        ):
            admission.reverse(
                user=request.user,
                reason="Reversed from Django admin.",
            )
            updated += 1

        self.message_user(
            request,
            f"{updated} admission(s) reversed.",
        )

    @admin.action(description="Mark selected admissions as void")
    def mark_as_void(self, request, queryset):
        updated = queryset.exclude(status="void").update(
            status="void",
        )

        self.message_user(
            request,
            f"{updated} admission(s) marked as void.",
        )

    def get_queryset(self, request):
        return super().get_queryset(request).select_related(
            "organisation",
            "business_entity",
            "booking",
            "booking_item",
            "admission_token",
            "scan_attempt",
            "admitted_by",
            "reversed_by",
        )