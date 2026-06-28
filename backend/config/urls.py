
from django.contrib import admin
from django.urls import path, include


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/accounts/", include("accounts.urls")),
    path("api/organisations/", include("organisations.urls")),
    path("api/subscriptions/", include("subscriptions.urls")),
    path("api/auditlogs/", include("auditlogs.urls")),
    path("api/core/", include("core.urls")),
    path("api/disco/", include("disco.urls")),
    path("api/training/", include("training.urls")),
    path("api/ticketing/", include("ticketing.urls")),
]