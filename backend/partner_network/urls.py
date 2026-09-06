from django.urls import include, path
from rest_framework.routers import DefaultRouter

from partner_network.views import (
    PartnerNetworkOverviewView,
    PartnerNetworkOptionsView,
    PartnerNetworkSettingsViewSet,
    PublicReferralRedirectView,
    ReferralBalanceAdjustmentViewSet,
    ReferralBookingAttributionViewSet,
    ReferralCommissionRuleViewSet,
    ReferralCommissionViewSet,
    ReferralFeedbackRequestViewSet,
    ReferralPartnerAccessViewSet,
    ReferralPartnerLocationViewSet,
    ReferralPartnerPortalBootstrapView,
    ReferralPartnerPortalDashboardView,
    ReferralPartnerPortalEarningsView,
    ReferralPartnerPortalQRPNGView,
    ReferralPartnerPortalQRView,
    ReferralPartnerPortalSettingsView,
    ReferralPartnerViewSet,
    ReferralPayoutViewSet,
    ReferralProductAccessViewSet,
    ReferralQRCodeViewSet,
)

router = DefaultRouter()
router.register("settings", PartnerNetworkSettingsViewSet, basename="partner-network-settings")
router.register("partners", ReferralPartnerViewSet, basename="partner-network-partners")
router.register("locations", ReferralPartnerLocationViewSet, basename="partner-network-locations")
router.register("product-access", ReferralProductAccessViewSet, basename="partner-network-product-access")
router.register("access", ReferralPartnerAccessViewSet, basename="partner-network-access")
router.register("qrs", ReferralQRCodeViewSet, basename="partner-network-qrs")
router.register("commission-rules", ReferralCommissionRuleViewSet, basename="partner-network-commission-rules")
router.register("commissions", ReferralCommissionViewSet, basename="partner-network-commissions")
router.register("adjustments", ReferralBalanceAdjustmentViewSet, basename="partner-network-adjustments")
router.register("feedback", ReferralFeedbackRequestViewSet, basename="partner-network-feedback")
router.register("attributions", ReferralBookingAttributionViewSet, basename="partner-network-attributions")
router.register("payouts", ReferralPayoutViewSet, basename="partner-network-payouts")

urlpatterns = [
    path("", include(router.urls)),
    path("overview/", PartnerNetworkOverviewView.as_view(), name="partner-network-overview"),
    path("options/", PartnerNetworkOptionsView.as_view(), name="partner-network-options"),
    path("concierge/r/<str:token>/", PublicReferralRedirectView.as_view(), name="partner-network-public-referral"),
    path("portal/bootstrap/", ReferralPartnerPortalBootstrapView.as_view(), name="partner-network-portal-bootstrap"),
    path("portal/dashboard/", ReferralPartnerPortalDashboardView.as_view(), name="partner-network-portal-dashboard"),
    path("portal/qr/", ReferralPartnerPortalQRView.as_view(), name="partner-network-portal-qr"),
    path("portal/qr/<int:qr_id>/png/", ReferralPartnerPortalQRPNGView.as_view(), name="partner-network-portal-qr-png"),
    path("portal/settings/", ReferralPartnerPortalSettingsView.as_view(), name="partner-network-portal-settings"),
    path("portal/earnings/", ReferralPartnerPortalEarningsView.as_view(), name="partner-network-portal-earnings"),
]
