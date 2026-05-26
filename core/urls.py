from django.urls import path

from .views import HealthCheckView, DashboardStatsView


urlpatterns = [
    path("health/", HealthCheckView.as_view(), name="health-check"),
    path("dashboard-stats/", DashboardStatsView.as_view(), name="dashboard-stats"),
]