from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    OrganisationViewSet,
    MembershipViewSet,
    OrganisationBrandingView,
)

router = DefaultRouter()

router.register("organisations", OrganisationViewSet, basename="organisations")
router.register("memberships", MembershipViewSet, basename="memberships")

urlpatterns = [
    path("branding/", OrganisationBrandingView.as_view(), name="organisation-branding"),
]

urlpatterns += router.urls