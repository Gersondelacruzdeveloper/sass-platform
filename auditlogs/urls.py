from rest_framework.routers import DefaultRouter

from .views import AuditLogViewSet


router = DefaultRouter()

router.register(
    "auditlogs",
    AuditLogViewSet,
    basename="auditlogs",
)

urlpatterns = router.urls