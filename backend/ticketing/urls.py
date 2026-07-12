from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    TicketingSettingsViewSet,
    TicketingPublicSiteSettingsViewSet,
    TicketingPaymentProviderSettingsViewSet,
    TicketingEmailSettingsViewSet,
    ExperienceCategoryViewSet,
    ExperienceProductViewSet,
    ProductGalleryImageViewSet,
    ExperiencePackageViewSet,
    ProductAvailabilityViewSet,
    PickupZoneViewSet,
    PickupLocationViewSet,
    ProductPickupScheduleViewSet,
    CustomerViewSet,
    SellerViewSet,
    TransferRouteViewSet,
    TransferPriceBandViewSet,
    EventTicketTypeViewSet,
    BookingViewSet,
    BookingItemViewSet,
    BookingPickupInfoViewSet,
    BookingPaymentViewSet,
    SellerCommissionViewSet,
    ReceiptViewSet,
    NotificationLogViewSet,
    ExternalProviderConfigViewSet,
    ExternalProviderProductSnapshotViewSet,
    ProductReviewViewSet,

    # Seller-only API
    SellerProductsViewSet,
    SellerBookingsViewSet,
    SellerPaymentsViewSet,
    SellerCommissionsViewSet,
    SellerDashboardView,

    TicketingDashboardAPIView,
    TicketingReportsAPIView,
    SellerDashboardAPIView,
    PublicBrandingAPIView,
    PublicDomainResolveAPIView,
    PublicProductResolveAPIView,
    PublicProductViewSet,
    PublicCategoryViewSet,
    PublicBookingViewSet,
    PublicProductAvailabilityAPIView,
    PublicPickupLocationViewSet,
    PublicPickupScheduleResolveAPIView,
    PublicPaymentOptionsAPIView,
    PublicStripeCheckoutSessionAPIView,
    PublicStripeConfirmSessionAPIView,
    StripeWebhookAPIView,
    PublicPayPalCreateOrderAPIView,
    PublicPayPalCaptureOrderAPIView,
    TicketingLiveAvailabilityAPIView,
    PublicSEOAPIView,
    PublicSitemapAPIView,
    PublicRobotsAPIView,
    WelletProductsAPIView,
    TicketingBusinessEntityViewSet,
    BusinessEntityUserAccessViewSet,
    ProductBusinessAgreementViewSet,
    BookingFinancialSnapshotViewSet,
    AdmissionTokenViewSet,
    TicketScannerViewSet,
    TicketAdmissionViewSet,
    TicketScanAttemptViewSet,
    PartnerSettlementPeriodViewSet,
    PartnerSettlementPaymentViewSet,
    TicketingLedgerEntryViewSet,
)


router = DefaultRouter()

# Private owner/admin routes
router.register("settings", TicketingSettingsViewSet, basename="ticketing-settings")
router.register("public-site-settings", TicketingPublicSiteSettingsViewSet, basename="ticketing-public-site-settings")
router.register("payment-provider-settings", TicketingPaymentProviderSettingsViewSet, basename="ticketing-payment-provider-settings")
router.register("email-settings", TicketingEmailSettingsViewSet, basename="ticketing-email-settings")
router.register("categories", ExperienceCategoryViewSet, basename="ticketing-categories")
router.register("products", ExperienceProductViewSet, basename="ticketing-products")
router.register("product-gallery-images", ProductGalleryImageViewSet, basename="ticketing-product-gallery-images")
router.register("packages", ExperiencePackageViewSet, basename="ticketing-packages")
router.register("availability", ProductAvailabilityViewSet, basename="ticketing-availability")
router.register("pickup-zones", PickupZoneViewSet, basename="ticketing-pickup-zones")
router.register("pickup-locations", PickupLocationViewSet, basename="ticketing-pickup-locations")
router.register("pickup-schedules", ProductPickupScheduleViewSet, basename="ticketing-pickup-schedules")
router.register("customers", CustomerViewSet, basename="ticketing-customers")
router.register("sellers", SellerViewSet, basename="ticketing-sellers")
router.register("transfer-routes", TransferRouteViewSet, basename="ticketing-transfer-routes")
router.register("transfer-price-bands", TransferPriceBandViewSet, basename="ticketing-transfer-price-bands")
router.register("event-ticket-types", EventTicketTypeViewSet, basename="ticketing-event-ticket-types")
router.register("bookings", BookingViewSet, basename="ticketing-bookings")
router.register("booking-items", BookingItemViewSet, basename="ticketing-booking-items")
router.register("booking-pickup-info", BookingPickupInfoViewSet, basename="ticketing-booking-pickup-info")
router.register("payments", BookingPaymentViewSet, basename="ticketing-payments")
router.register("commissions", SellerCommissionViewSet, basename="ticketing-commissions")
router.register("receipts", ReceiptViewSet, basename="ticketing-receipts")
router.register("notifications", NotificationLogViewSet, basename="ticketing-notifications")
router.register("integrations", ExternalProviderConfigViewSet, basename="ticketing-integrations")
router.register("external-snapshots", ExternalProviderProductSnapshotViewSet, basename="ticketing-external-snapshots")
router.register("reviews", ProductReviewViewSet, basename="ticketing-reviews")

router.register("business-entities", TicketingBusinessEntityViewSet, basename="ticketing-business-entities")
router.register("business-entity-access", BusinessEntityUserAccessViewSet, basename="ticketing-business-entity-access")
router.register("business-agreements", ProductBusinessAgreementViewSet, basename="ticketing-business-agreements")
router.register("financial-snapshots", BookingFinancialSnapshotViewSet, basename="ticketing-financial-snapshots")
router.register("admission-tokens", AdmissionTokenViewSet, basename="ticketing-admission-tokens")
router.register("scanner", TicketScannerViewSet, basename="ticketing-scanner")
router.register("admissions", TicketAdmissionViewSet, basename="ticketing-admissions")
router.register("scan-attempts", TicketScanAttemptViewSet, basename="ticketing-scan-attempts")
router.register("partner-settlements", PartnerSettlementPeriodViewSet, basename="ticketing-partner-settlements")
router.register("partner-settlement-payments", PartnerSettlementPaymentViewSet, basename="ticketing-partner-settlement-payments")
router.register("ledger", TicketingLedgerEntryViewSet, basename="ticketing-ledger")

# Seller-only routes
router.register("seller/products", SellerProductsViewSet, basename="ticketing-seller-products")
router.register("seller/bookings", SellerBookingsViewSet, basename="ticketing-seller-bookings")
router.register("seller/payments", SellerPaymentsViewSet, basename="ticketing-seller-payments")
router.register("seller/commissions", SellerCommissionsViewSet, basename="ticketing-seller-commissions")

# Public white-label routes.
# These support ?slug=organisation-slug or ?organisation_slug=organisation-slug.
router.register("public/products", PublicProductViewSet, basename="ticketing-public-products")
router.register("public/categories", PublicCategoryViewSet, basename="ticketing-public-categories")
router.register("public/bookings", PublicBookingViewSet, basename="ticketing-public-bookings")
router.register("public/pickup-locations", PublicPickupLocationViewSet, basename="ticketing-public-pickup-locations")


urlpatterns = [
    # Private dashboard / reports
    path("dashboard/", TicketingDashboardAPIView.as_view(), name="ticketing-dashboard"),
    path("reports/", TicketingReportsAPIView.as_view(), name="ticketing-reports"),

    # Legacy seller dashboard route kept for backwards compatibility
    path("seller-dashboard/", SellerDashboardAPIView.as_view(), name="ticketing-seller-dashboard-legacy"),

    # New seller-only dashboard route
    path("seller/dashboard/", SellerDashboardView.as_view(), name="ticketing-seller-dashboard"),

    # Public domain resolver:
    # /api/ticketing/public/resolve-domain/?domain=www.example.com
    path(
        "public/resolve-domain/",
        PublicDomainResolveAPIView.as_view(),
        name="ticketing-public-resolve-domain",
    ),

    # Public product URL resolver:
    # /api/ticketing/public/product-resolve/?slug=organisation-slug&path=/product/saona-island
    path(
        "public/product-resolve/",
        PublicProductResolveAPIView.as_view(),
        name="ticketing-public-product-resolve",
    ),
    path(
        "public/<slug:organisation_slug>/product-resolve/",
        PublicProductResolveAPIView.as_view(),
        name="ticketing-public-product-resolve-by-slug",
    ),

    # Public branding / SEO using query param:
    # /api/ticketing/public/branding/?slug=organisation-slug
    path("public/branding/", PublicBrandingAPIView.as_view(), name="ticketing-public-branding"),
    path("public/seo/", PublicSEOAPIView.as_view(), name="ticketing-public-seo"),
    path("public/sitemap.xml", PublicSitemapAPIView.as_view(), name="ticketing-public-sitemap"),
    path("public/robots.txt", PublicRobotsAPIView.as_view(), name="ticketing-public-robots"),

    # Public branding / SEO using path slug:
    path("public/<slug:organisation_slug>/branding/", PublicBrandingAPIView.as_view(), name="ticketing-public-branding-by-slug"),
    path("public/<slug:organisation_slug>/seo/", PublicSEOAPIView.as_view(), name="ticketing-public-seo-by-slug"),
    path("public/<slug:organisation_slug>/sitemap.xml", PublicSitemapAPIView.as_view(), name="ticketing-public-sitemap-by-slug"),
    path("public/<slug:organisation_slug>/robots.txt", PublicRobotsAPIView.as_view(), name="ticketing-public-robots-by-slug"),

    # Public pickup schedule resolver.
    path(
        "public/pickup-schedules/resolve/",
        PublicPickupScheduleResolveAPIView.as_view(),
        name="ticketing-public-pickup-schedule-resolve",
    ),
    path(
        "public/<slug:organisation_slug>/pickup-schedules/resolve/",
        PublicPickupScheduleResolveAPIView.as_view(),
        name="ticketing-public-pickup-schedule-resolve-by-slug",
    ),

    # Public seller link booking flow:
    path(
        "public/<slug:organisation_slug>/s/<slug:seller_slug>/bookings/",
        PublicBookingViewSet.as_view({"post": "create"}),
        name="ticketing-public-seller-bookings",
    ),

    # Public confirmation by booking code:
    path(
        "public/<slug:organisation_slug>/confirmation/<str:booking_code>/",
        PublicBookingViewSet.as_view({"get": "list"}),
        name="ticketing-public-booking-confirmation",
    ),

    # Public online payment routes.
    path(
        "public/<slug:organisation_slug>/payments/options/",
        PublicPaymentOptionsAPIView.as_view(),
        name="ticketing-public-payment-options",
    ),
    path(
        "public/<slug:organisation_slug>/payments/stripe/create-checkout-session/",
        PublicStripeCheckoutSessionAPIView.as_view(),
        name="ticketing-public-stripe-create-checkout-session",
    ),
    path(
        "public/<slug:organisation_slug>/payments/stripe/confirm-session/",
        PublicStripeConfirmSessionAPIView.as_view(),
        name="ticketing-public-stripe-confirm-session",
    ),
    path(
        "public/<slug:organisation_slug>/payments/paypal/create-order/",
        PublicPayPalCreateOrderAPIView.as_view(),
        name="ticketing-public-paypal-create-order",
    ),
    path(
        "public/<slug:organisation_slug>/payments/paypal/capture-order/",
        PublicPayPalCaptureOrderAPIView.as_view(),
        name="ticketing-public-paypal-capture-order",
    ),
    path(
        "payments/stripe/webhook/",
        StripeWebhookAPIView.as_view(),
        name="ticketing-stripe-webhook",
    ),

    # Backend-only Wellet / Coco Bongo routes
    path(
        "integrations/wellet/products/",
        WelletProductsAPIView.as_view(),
        name="ticketing-wellet-products",
    ),
    path(
        "integrations/wellet/settings/",
        ExternalProviderConfigViewSet.as_view(
            {
                "get": "wellet_settings",
                "patch": "wellet_settings",
            }
        ),
        name="ticketing-wellet-settings",
    ),

    # Private/seller live availability:
    path(
        "live-availability/",
        TicketingLiveAvailabilityAPIView.as_view(),
        name="ticketing-live-availability",
    ),

    # Public product live availability:
    path(
        "public/<slug:organisation_slug>/products/<slug:product_slug>/availability/",
        PublicProductAvailabilityAPIView.as_view(),
        name="ticketing-public-product-availability",
    ),

    path("", include(router.urls)),
]
