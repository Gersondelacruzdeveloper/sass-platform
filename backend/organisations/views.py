from rest_framework import viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Organisation, Membership, OrganisationBranding
from .serializers import (
    OrganisationSerializer,
    MembershipSerializer,
    OrganisationBrandingSerializer,
)


def get_user_organisation(user):
    if not user or not user.is_authenticated:
        return None

    membership = (
        user.memberships
        .filter(is_active=True, organisation__is_active=True)
        .select_related("organisation")
        .first()
    )

    if membership:
        return membership.organisation

    return None


class OrganisationViewSet(viewsets.ModelViewSet):
    serializer_class = OrganisationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Organisation.objects.all()

        organisation = get_user_organisation(self.request.user)

        if not organisation:
            return Organisation.objects.none()

        return Organisation.objects.filter(id=organisation.id)


class MembershipViewSet(viewsets.ModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if self.request.user.is_superuser:
            return Membership.objects.select_related(
                "user",
                "organisation",
            ).all()

        organisation = get_user_organisation(self.request.user)

        if not organisation:
            return Membership.objects.none()

        return Membership.objects.select_related(
            "user",
            "organisation",
        ).filter(organisation=organisation)

    def perform_create(self, serializer):
        organisation = get_user_organisation(self.request.user)

        if not self.request.user.is_superuser and not organisation:
            raise PermissionDenied("No active organisation found.")

        if self.request.user.is_superuser:
            serializer.save()
        else:
            serializer.save(organisation=organisation)


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
        organisation = get_user_organisation(request.user)

        if not organisation:
            raise PermissionDenied("No active organisation found.")

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