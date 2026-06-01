from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    OrganisationViewSet,
    MembershipViewSet,
    OrganisationBrandingView,
    PublicOrganisationBrandingView,
)

router = DefaultRouter()

router.register("organisations", OrganisationViewSet, basename="organisations")
router.register("memberships", MembershipViewSet, basename="memberships")

urlpatterns = [
path(
    "public-branding/<str:business_type>/<slug:slug>/",
    PublicOrganisationBrandingView.as_view(),
    name="public-organisation-branding",
),
]

urlpatterns += router.urls