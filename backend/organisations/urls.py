from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    MembershipViewSet,
    OrganisationAIConnectionTestView,
    OrganisationAISettingsView,
    OrganisationBrandingView,
    OrganisationViewSet,
    PublicOrganisationBrandingView,
    PublicOrganisationManifestView,
)

router = DefaultRouter()

router.register(
    "organisations",
    OrganisationViewSet,
    basename="organisations",
)
router.register(
    "memberships",
    MembershipViewSet,
    basename="memberships",
)

urlpatterns = [
    path(
        "public-branding/<str:business_type>/<slug:slug>/",
        PublicOrganisationBrandingView.as_view(),
        name="public-organisation-branding",
    ),
    path(
        "branding/<str:business_type>/<slug:slug>/",
        OrganisationBrandingView.as_view(),
        name="organisation-branding-detail",
    ),
    path(
        "ai-settings/mine/",
        OrganisationAISettingsView.as_view(),
        name="organisation-ai-settings",
    ),
    path(
        "ai-settings/test/",
        OrganisationAIConnectionTestView.as_view(),
        name="organisation-ai-settings-test",
    ),
    path(
        "public-manifest/<str:business_type>/<slug:slug>/manifest.json",
        PublicOrganisationManifestView.as_view(),
        name="public-organisation-manifest",
    ),
]

urlpatterns += router.urls
