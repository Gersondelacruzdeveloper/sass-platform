from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    TicketingSettingsViewSet,
    TicketingPublicSiteSettingsViewSet,
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
    TicketingDashboardAPIView,
    TicketingReportsAPIView,
    SellerDashboardAPIView,
    PublicBrandingAPIView,
    PublicProductViewSet,
    PublicCategoryViewSet,
    PublicBookingViewSet,
    PublicProductAvailabilityAPIView,
    TicketingLiveAvailabilityAPIView,
    PublicSEOAPIView,
    PublicSitemapAPIView,
    PublicRobotsAPIView,
    WelletProductsAPIView,

)


router = DefaultRouter()

# Private owner/admin routes
router.register("settings", TicketingSettingsViewSet, basename="ticketing-settings")
router.register("public-site-settings", TicketingPublicSiteSettingsViewSet, basename="ticketing-public-site-settings")
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

# Public white-label routes.
# These support ?slug=organisation-slug or ?organisation_slug=organisation-slug.
router.register("public/products", PublicProductViewSet, basename="ticketing-public-products")
router.register("public/categories", PublicCategoryViewSet, basename="ticketing-public-categories")
router.register("public/bookings", PublicBookingViewSet, basename="ticketing-public-bookings")


urlpatterns = [
    # Private dashboard / reports
    path("dashboard/", TicketingDashboardAPIView.as_view(), name="ticketing-dashboard"),
    path("reports/", TicketingReportsAPIView.as_view(), name="ticketing-reports"),
    path("seller-dashboard/", SellerDashboardAPIView.as_view(), name="ticketing-seller-dashboard"),

    # Public branding / SEO using query param:
    # /api/ticketing/public/branding/?slug=organisation-slug
    path("public/branding/", PublicBrandingAPIView.as_view(), name="ticketing-public-branding"),
    path("public/seo/", PublicSEOAPIView.as_view(), name="ticketing-public-seo"),
    path("public/sitemap.xml", PublicSitemapAPIView.as_view(), name="ticketing-public-sitemap"),
    path("public/robots.txt", PublicRobotsAPIView.as_view(), name="ticketing-public-robots"),

    # Public branding / SEO using path slug:
    # /api/ticketing/public/hard-rock/branding/
    path("public/<slug:organisation_slug>/branding/", PublicBrandingAPIView.as_view(), name="ticketing-public-branding-by-slug"),
    path("public/<slug:organisation_slug>/seo/", PublicSEOAPIView.as_view(), name="ticketing-public-seo-by-slug"),
    path("public/<slug:organisation_slug>/sitemap.xml", PublicSitemapAPIView.as_view(), name="ticketing-public-sitemap-by-slug"),
    path("public/<slug:organisation_slug>/robots.txt", PublicRobotsAPIView.as_view(), name="ticketing-public-robots-by-slug"),

    # Public seller link booking flow:
    # /api/ticketing/public/hard-rock/s/juan-perez/bookings/
    path(
        "public/<slug:organisation_slug>/s/<slug:seller_slug>/bookings/",
        PublicBookingViewSet.as_view({"post": "create"}),
        name="ticketing-public-seller-bookings",
    ),

    # Public confirmation by booking code:
    # /api/ticketing/public/hard-rock/confirmation/PCD-12345678/
    path(
        "public/<slug:organisation_slug>/confirmation/<str:booking_code>/",
        PublicBookingViewSet.as_view({"get": "list"}),
        name="ticketing-public-booking-confirmation",
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
    # /api/ticketing/live-availability/?product=1&service_date=2026-07-01
    path(
        "live-availability/",
        TicketingLiveAvailabilityAPIView.as_view(),
        name="ticketing-live-availability",
    ),

    # Public product live availability:
    # /api/ticketing/public/hard-rock/products/coco-bongo/availability/?date=2026-07-01
    path(
        "public/<slug:organisation_slug>/products/<slug:product_slug>/availability/",
        PublicProductAvailabilityAPIView.as_view(),
        name="ticketing-public-product-availability",
    ),

    path("", include(router.urls)),
]
