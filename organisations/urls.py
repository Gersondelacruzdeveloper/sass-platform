from rest_framework.routers import DefaultRouter

from .views import (
    OrganisationViewSet,
    MembershipViewSet,
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

urlpatterns = router.urls