from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Organisation, Membership, OrganisationBranding
from .serializers import (
    OrganisationSerializer,
    MembershipSerializer,
    OrganisationBrandingSerializer,
)


class OrganisationViewSet(viewsets.ModelViewSet):
    queryset = Organisation.objects.all()
    serializer_class = OrganisationSerializer
    permission_classes = [IsAuthenticated]


class MembershipViewSet(viewsets.ModelViewSet):
    queryset = Membership.objects.all()
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]


class PublicOrganisationBrandingView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, business_type, slug):
        try:
            organisation = Organisation.objects.get(
                business_type=business_type,
                slug=slug,
                is_active=True,
            )
        except Organisation.DoesNotExist:
            raise NotFound("Organisation branding not found.")

        branding, created = OrganisationBranding.objects.get_or_create(
            organisation=organisation,
            defaults={
                "company_name": organisation.name,
                "platform_name": f"{organisation.name} Platform",
                "primary_color": "#111827",
                "secondary_color": "#6B7280",
                "accent_color": "#2563EB",
            },
        )

        serializer = OrganisationBrandingSerializer(
            branding,
            context={"request": request},
        )

        return Response(serializer.data)


class OrganisationBrandingView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        organisation = request.user.organisation

        branding, created = OrganisationBranding.objects.get_or_create(
            organisation=organisation,
            defaults={
                "company_name": organisation.name,
                "platform_name": "SaaS Platform",
                "primary_color": "#111827",
                "secondary_color": "#6B7280",
                "accent_color": "#2563EB",
            },
        )

        serializer = OrganisationBrandingSerializer(
            branding,
            context={"request": request},
        )

        return Response(serializer.data)