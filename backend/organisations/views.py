from rest_framework import status, viewsets
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.parsers import JSONParser, MultiPartParser, FormParser
from django.http import JsonResponse
from django.conf import settings


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
        .filter(is_active=True)
        .select_related("organisation")
        .first()
    )

    if membership:
        return membership.organisation

    return None


def get_active_user_organisation(user):
    if not user or not user.is_authenticated:
        return None

    membership = (
        user.memberships
        .filter(
            is_active=True,
            organisation__is_active=True,
        )
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
            )
        except Organisation.DoesNotExist:
            raise NotFound("Organisation branding not found.")

        branding, created = OrganisationBranding.objects.get_or_create(
            organisation=organisation,
            defaults={
                "company_name": organisation.name,
                "platform_name": f"{organisation.name} Platform",
                "app_short_name": organisation.name[:50],
                "app_description": f"{organisation.name} app",
                "primary_color": "#111827",
                "secondary_color": "#6B7280",
                "accent_color": "#2563EB",
                "theme_color": "#111827",
                "background_color": "#ffffff",
            },
        )

        serializer = OrganisationBrandingSerializer(
            branding,
            context={"request": request},
        )

        return Response(serializer.data)


class PublicOrganisationManifestView(APIView):
    permission_classes = [AllowAny]

    def get_file_url(self, request, file_field):
        if not file_field:
            return None

        url = file_field.url

        if url.startswith("http://") or url.startswith("https://"):
            return url

        return request.build_absolute_uri(url)

    def get(self, request, business_type, slug):
        try:
            organisation = Organisation.objects.get(
                business_type=business_type,
                slug=slug,
            )
        except Organisation.DoesNotExist:
            raise NotFound("Organisation manifest not found.")

        branding, created = OrganisationBranding.objects.get_or_create(
            organisation=organisation,
            defaults={
                "company_name": organisation.name,
                "platform_name": f"{organisation.name} Platform",
                "app_short_name": organisation.name[:50],
                "app_description": f"{organisation.name} app",
                "primary_color": "#111827",
                "secondary_color": "#6B7280",
                "accent_color": "#2563EB",
                "theme_color": "#111827",
                "background_color": "#ffffff",
            },
        )

        frontend_url = getattr(
            settings,
            "FRONTEND_URL",
            "http://127.0.0.1:5173",
        ).rstrip("/")

        app_name = (
            branding.platform_name
            or branding.company_name
            or organisation.name
            or "Disco Platform"
        )

        short_name = (
            branding.app_short_name
            or branding.platform_name
            or branding.company_name
            or organisation.name
            or "Disco"
        )[:50]

        description = branding.app_description or f"{app_name} app"

        icon_192 = self.get_file_url(
            request,
            branding.app_icon_192 or branding.logo,
        )

        icon_512 = self.get_file_url(
            request,
            branding.app_icon_512 or branding.logo,
        )

        maskable_icon = self.get_file_url(
            request,
            branding.maskable_icon or branding.app_icon_512 or branding.logo,
        )

        icons = []

        if icon_192:
            icons.append({
                "src": icon_192,
                "sizes": "192x192",
                "type": "image/png",
                "purpose": "any",
            })

        if icon_512:
            icons.append({
                "src": icon_512,
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "any",
            })

        if maskable_icon:
            icons.append({
                "src": maskable_icon,
                "sizes": "512x512",
                "type": "image/png",
                "purpose": "maskable",
            })

        # Build a tenant-specific launch URL.
        #
        # Ticketing users open directly in their own organisation dashboard.
        # Other modules keep their existing login launch route.
        if business_type == "ticketing":
            start_path = f"/ticketing/{organisation.slug}/dashboard"
        else:
            start_path = f"/{business_type}/{organisation.slug}/login"

        scope_path = f"/{business_type}/{organisation.slug}/"

        manifest = {
            "name": app_name,
            "short_name": short_name,
            "description": description,
            "start_url": f"{frontend_url}{start_path}",
            "scope": f"{frontend_url}{scope_path}",
            "display": "standalone",
            "orientation": "portrait-primary",
            "theme_color": branding.theme_color or branding.primary_color or "#020617",
            "background_color": branding.background_color or "#ffffff",
            "icons": icons,
        }

        response = JsonResponse(manifest)
        response["Content-Type"] = "application/manifest+json"
        response["Cache-Control"] = "no-cache, no-store, must-revalidate"

        return response
    
class OrganisationBrandingView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_organisation(self, request, business_type=None, slug=None):
        if request.user.is_superuser and business_type and slug:
            organisation = Organisation.objects.filter(
                business_type=business_type,
                slug=slug,
            ).first()

            if not organisation:
                raise NotFound("Organisation not found.")

            return organisation

        organisation = get_user_organisation(request.user)

        if not organisation:
            raise PermissionDenied("No active organisation found.")

        if business_type and slug:
            if organisation.business_type != business_type or organisation.slug != slug:
                raise PermissionDenied("You cannot edit this organisation.")

        return organisation

    def get_branding(self, organisation):
        branding, created = OrganisationBranding.objects.get_or_create(
            organisation=organisation,
            defaults={
                "company_name": organisation.name,
                "platform_name": f"{organisation.name} Platform",
                "app_short_name": organisation.name[:50],
                "app_description": f"{organisation.name} app",
                "primary_color": "#111827",
                "secondary_color": "#6B7280",
                "accent_color": "#2563EB",
                "theme_color": "#111827",
                "background_color": "#ffffff",
            },
        )

        return branding

    def get(self, request, business_type=None, slug=None):
        organisation = self.get_organisation(request, business_type, slug)
        branding = self.get_branding(organisation)

        serializer = OrganisationBrandingSerializer(
            branding,
            context={"request": request},
        )

        return Response(serializer.data)

    def patch(self, request, business_type=None, slug=None):
        organisation = self.get_organisation(request, business_type, slug)
        branding = self.get_branding(organisation)

        serializer = OrganisationBrandingSerializer(
            branding,
            data=request.data,
            partial=True,
            context={"request": request},
        )

        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)