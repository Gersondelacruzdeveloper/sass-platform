from rest_framework.response import Response
from rest_framework.views import APIView


class HealthCheckView(APIView):
    def get(self, request):
        return Response({
            "status": "ok",
            "app": "SaaS Platform",
            "message": "API is running successfully",
        })


class DashboardStatsView(APIView):
    def get(self, request):
        return Response({
            "total_organisations": 0,
            "active_subscriptions": 0,
            "total_users": 0,
            "monthly_revenue": 0,
        })