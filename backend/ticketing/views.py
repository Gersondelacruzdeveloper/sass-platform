from decimal import Decimal
# Views version: partner-portal-step1-v2-2026-07-13
import csv
import io
import json
import re
import traceback
import logging

import requests
import stripe

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.shortcuts import (
    get_object_or_404,
    redirect,
)
from django.utils import timezone

from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from django.utils.dateparse import parse_date
from django.utils.text import slugify
from django.core.mail import EmailMessage
from .notifications.utils import get_email_connection
from .notifications.templates import test_email_subject, test_email_body
import secrets
from django.shortcuts import redirect
from .notifications.service import BookingNotificationService
from . import booking_finance_service as booking_finance
from rest_framework.exceptions import PermissionDenied

from .google_oauth import (
    build_google_authorization_url,
    exchange_google_code_for_credentials,
    store_google_credentials,
    disconnect_google,
    send_gmail_email,
)

logger = logging.getLogger(__name__)

from organisations.models import Organisation

from .models import (
    TicketingSettings,
    TicketingPublicSiteSettings,
    TicketingPaymentProviderSettings,
    ExperienceCategory,
    ExperienceProduct,
    ProductGalleryImage,
    ExperiencePackage,
    ProductAvailability,
    PickupZone,
    PickupLocation,
    ProductPickupSchedule,
    Customer,
    Seller,
    Booking,
    BookingItem,
    BookingPickupInfo,
    BookingPayment,
    SellerCommission,
    Receipt,
    NotificationLog,
    ExternalProviderConfig,
    ExternalProviderProductSnapshot,
    TransferRoute,
    TransferPriceBand,
    EventTicketType,
    ProductReview,
    TicketingEmailSettings,
    ProductURLAlias,
    TicketingBusinessEntity,
    BusinessEntityUserAccess,
    ProductBusinessAgreement,
    BookingFinancialSnapshot,
    AdmissionToken,
    TicketScanAttempt,
    TicketAdmission,
    TicketingLedgerEntry,
    PartnerSettlementPeriod,
    PartnerSettlementLine,
    PartnerSettlementPayment,
)

from .serializers import (
    TicketingSettingsSerializer,
    TicketingPublicSiteSettingsSerializer,
    TicketingPaymentProviderSettingsSerializer,
    ExperienceCategorySerializer,
    ExperienceProductSerializer,
    ProductGalleryImageSerializer,
    ExperiencePackageSerializer,
    ProductAvailabilitySerializer,
    PickupZoneSerializer,
    PickupLocationSerializer,
    ProductPickupScheduleSerializer,
    CustomerSerializer,
    SellerSerializer,
    BookingSerializer,
    BookingItemSerializer,
    BookingPickupInfoSerializer,
    BookingPaymentSerializer,
    SellerCommissionSerializer,
    ReceiptSerializer,
    NotificationLogSerializer,
    ExternalProviderConfigSerializer,
    ExternalProviderProductSnapshotSerializer,
    TransferRouteSerializer,
    TransferPriceBandSerializer,
    EventTicketTypeSerializer,
    ProductReviewSerializer,
    TicketingEmailSettingsSerializer,
    TicketingBusinessEntitySerializer,
    BusinessEntityUserAccessSerializer,
    ProductBusinessAgreementSerializer,
    BookingFinancialSnapshotSerializer,
    AdmissionTokenSerializer,
    TicketScanAttemptSerializer,
    TicketAdmissionSerializer,
    TicketingLedgerEntrySerializer,
    PartnerSettlementPeriodSerializer,
    PartnerSettlementLineSerializer,
    PartnerSettlementPaymentSerializer,
    AdmissionTokenIssueSerializer,
    TicketScanResolveSerializer,
    TicketAdmissionCreateSerializer,
    TicketAdmissionReverseSerializer,
    SettlementGenerateSerializer,
    SettlementApprovalSerializer,
    SettlementPaymentCreateSerializer,
)
from .services import (
    fetch_wellet_products,
    get_live_product_availability,
    sync_wellet_products_to_snapshots,
    connect_ticketing_custom_domain,
    check_ticketing_custom_domain,
)
from .seo import (
    resolve_public_product_url,
    build_redirect_response,
    build_product_url,
)

from .permissions import (
    HasTicketingOrganisationAccess,
    HasTicketingSellerPermission,
    CanManageTicketingSettings,
    CanManageTicketingIntegrations,
    CanManageTicketingProducts,
    CanManageTicketingSellers,
    CanViewTicketingReports,
    CanAccessSellerDashboard,
    is_organisation_admin,
    get_user_seller,
    get_business_entity_from_view,
    get_user_business_entity_accesses,
    HasBusinessEntityAccess,
    HasTicketingPermission,
    CanAccessPartnerPortal,
    CanAccessOperationsDashboard,
    CanScanTickets,
    CanAdmitGuests,
    CanReverseAdmissions,
    CanViewTodayArrivals,
    CanViewAdmissions,
    CanViewPartnerFinancials,
    CanViewSettlements,
    CanRecordSettlementPayments,
    CanManageBusinessEntityUsers,
    CanManageBusinessEntities,
    CanManageBusinessAgreements,
    CanGenerateSettlements,
    CanApproveSettlements,
    CanViewTicketingLedger,
    CanSyncOfflineScans,
)

from .operations.tokens import (
    AdmissionTokenValidationError,
    build_qr_payload,
    issue_admission_token,
    resolve_admission_token,
    revoke_admission_token,
    rotate_admission_token,
)
from .operations.admissions import (
    AdmissionConflictError,
    AdmissionValidationError,
    admit_guests,
    resolve_and_admit,
    reverse_admission,
)
from .operations.snapshots import (
    create_snapshot_for_item,
    create_snapshots_for_booking,
)
from .operations.ledger import (
    ledger_summary,
    post_manual_adjustment,
    reconcile_settlement_with_ledger,
    reverse_entry_group,
)
from .operations.settlements import (
    SettlementValidationError,
    calculate_next_period,
    ensure_snapshots_and_generate,
    settlement_preview,
)
from .finance.settlements import (
    approve_partner_settlement,
    cancel_partner_settlement,
    dispute_partner_settlement,
    record_partner_settlement_payment,
    submit_partner_settlement_for_review,
    update_partner_settlement_payment_status,
)


class TicketingOrganisationMixin:
    """
    Private API organisation resolver.

    Priority:
    1. URL kwarg: organisation_slug / slug
    2. Query param: organisation_slug / slug
    3. request.user.organisation
    """

    def get_organisation(self):
        organisation_slug = (
            self.kwargs.get("organisation_slug")
            or self.kwargs.get("slug")
            or self.request.query_params.get("organisation_slug")
            or self.request.query_params.get("slug")
        )

        if organisation_slug:
            return get_object_or_404(Organisation, slug=organisation_slug)

        user = self.request.user

        if user and user.is_authenticated and getattr(user, "organisation", None):
            return user.organisation

        return None

    def require_organisation(self):
        organisation = self.get_organisation()

        if not organisation:
            raise ValueError("Organisation could not be resolved.")

        return organisation

    def is_admin_user(self):
        organisation = self.get_organisation()

        if not organisation:
            return False

        return is_organisation_admin(self.request.user, organisation)

    def get_current_seller(self):
        organisation = self.get_organisation()

        if not organisation:
            return None

        return get_user_seller(self.request.user, organisation)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organisation"] = self.get_organisation()
        return context


PARTNER_PORTAL_PERMISSION_FIELDS = (
    "can_access_dashboard",
    "can_scan",
    "can_view_today_bookings",
    "can_view_admissions",
    "can_view_customer_contact",
    "can_view_financials",
    "can_view_settlements",
    "can_record_payments",
    "can_reverse_admissions",
    "can_manage_users",
)


def build_partner_access_payload(access):
    permissions_payload = {
        field: bool(getattr(access, field, False))
        for field in PARTNER_PORTAL_PERMISSION_FIELDS
    }

    entity = access.business_entity

    return {
        "id": access.id,
        "role": access.role,
        "is_active": access.is_active,
        "last_access_at": access.last_access_at,
        "business_entity": {
            "id": entity.id,
            "name": entity.name,
            "slug": entity.slug,
            "entity_type": entity.entity_type,
            "currency": entity.currency,
            "can_scan_tickets": entity.can_scan_tickets,
            "require_check_in_confirmation": (
                entity.require_check_in_confirmation
            ),
            "allow_partial_admission": entity.allow_partial_admission,
            "allow_offline_scanning": entity.allow_offline_scanning,
        },
        "permissions": permissions_payload,
    }


def build_partner_branding_payload(organisation):
    branding = getattr(organisation, "branding", None)

    def file_url(field_name):
        field = getattr(branding, field_name, None) if branding else None

        try:
            return field.url if field else ""
        except (ValueError, AttributeError):
            return ""

    return {
        "company_name": (
            getattr(branding, "company_name", "")
            or organisation.name
        ),
        "platform_name": getattr(branding, "platform_name", "") if branding else "",
        "logo_url": file_url("logo"),
        "favicon_url": file_url("favicon"),
        "app_icon_192_url": file_url("app_icon_192"),
        "app_icon_512_url": file_url("app_icon_512"),
        "primary_color": (
            getattr(branding, "primary_color", "#111827")
            if branding
            else "#111827"
        ),
        "secondary_color": (
            getattr(branding, "secondary_color", "#6B7280")
            if branding
            else "#6B7280"
        ),
        "accent_color": (
            getattr(branding, "accent_color", "#F59E0B")
            if branding
            else "#F59E0B"
        ),
    }


def build_partner_portal_payload(
    *,
    user,
    organisation,
    accesses,
    selected_access=None,
):
    accesses = list(accesses)

    if not accesses:
        return None

    selected_access = selected_access or accesses[0]

    if selected_access.id not in {access.id for access in accesses}:
        selected_access = accesses[0]

    full_name = ""
    if hasattr(user, "get_full_name"):
        full_name = user.get_full_name() or ""

    selected_permissions = {
        field: bool(getattr(selected_access, field, False))
        for field in PARTNER_PORTAL_PERMISSION_FIELDS
    }

    return {
        "portal_type": "partner",
        "user": {
            "id": user.id,
            "name": (
                full_name
                or getattr(user, "username", "")
                or getattr(user, "email", "")
            ),
            "email": getattr(user, "email", ""),
            "username": getattr(user, "username", ""),
        },
        "organisation": {
            "id": organisation.id,
            "name": organisation.name,
            "slug": organisation.slug,
        },
        "branding": build_partner_branding_payload(organisation),
        "default_access_id": selected_access.id,
        "default_business_entity_id": selected_access.business_entity_id,
        "default_business_entity": {
            "id": selected_access.business_entity_id,
            "name": selected_access.business_entity.name,
            "slug": selected_access.business_entity.slug,
            "entity_type": selected_access.business_entity.entity_type,
        },
        "role": selected_access.role,
        "permissions": selected_permissions,
        "accesses": [
            build_partner_access_payload(access)
            for access in accesses
        ],
        "routes": {
            "dashboard": (
                f"/ticketing/{organisation.slug}/partner/dashboard"
            ),
            "scanner": (
                f"/ticketing/{organisation.slug}/partner/scanner"
            ),
            "admissions": (
                f"/ticketing/{organisation.slug}/partner/admissions"
            ),
            "scan_history": (
                f"/ticketing/{organisation.slug}/partner/scan-history"
            ),
            "settlements": (
                f"/ticketing/{organisation.slug}/partner/settlements"
            ),
            "users": (
                f"/ticketing/{organisation.slug}/partner/users"
            ),
            "profile": (
                f"/ticketing/{organisation.slug}/partner/profile"
            ),
        },
    }


def get_active_partner_accesses(user, organisation):
    return (
        BusinessEntityUserAccess.objects
        .filter(
            organisation=organisation,
            user=user,
            is_active=True,
            business_entity__is_active=True,
        )
        .select_related(
            "organisation",
            "business_entity",
            "user",
        )
        .order_by("business_entity__name", "id")
    )


class PartnerPortalBootstrapAPIView(
    TicketingOrganisationMixin,
    APIView,
):
    permission_classes = [
        HasTicketingOrganisationAccess,
        CanAccessPartnerPortal,
    ]

    def get(self, request):
        organisation = self.require_organisation()
        accesses = list(
            get_active_partner_accesses(
                request.user,
                organisation,
            )
        )

        if not accesses:
            return Response(
                {
                    "detail": (
                        "This account does not have active Partner Portal access."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        requested_access_id = (
            request.query_params.get("access_id")
            or request.query_params.get("business_entity_access_id")
        )
        requested_entity_id = (
            request.query_params.get("business_entity_id")
            or request.query_params.get("entity_id")
        )

        selected_access = None

        for access in accesses:
            if (
                requested_access_id
                and str(access.id) == str(requested_access_id)
            ):
                selected_access = access
                break

            if (
                requested_entity_id
                and str(access.business_entity_id) == str(requested_entity_id)
            ):
                selected_access = access
                break

        now = timezone.now()
        BusinessEntityUserAccess.objects.filter(
            id__in=[access.id for access in accesses],
        ).update(last_access_at=now)

        payload = build_partner_portal_payload(
            user=request.user,
            organisation=organisation,
            accesses=accesses,
            selected_access=selected_access,
        )

        return Response(payload)


class PartnerPortalLoginAPIView(APIView):
    """
    Authenticate a Partner Portal user and start the normal Django session.

    Request body:
    {
        "organisation_slug": "punta-cana-discovery",
        "email": "doorstaff@example.com",
        "password": "temporary-password"
    }
    """

    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def _resolve_organisation(self, request):
        organisation_slug = (
            request.data.get("organisation_slug")
            or request.data.get("slug")
            or request.query_params.get("organisation_slug")
            or request.query_params.get("slug")
        )

        if not organisation_slug:
            return None

        return Organisation.objects.filter(
            slug=organisation_slug,
            is_active=True,
        ).first()

    def _authenticate_user(self, request, identifier, password):
        UserModel = get_user_model()
        username_field = getattr(UserModel, "USERNAME_FIELD", "username")

        credentials = {
            username_field: identifier,
            "password": password,
        }

        user = authenticate(
            request=request,
            **credentials,
        )

        if user:
            return user

        # Compatibility fallback when the login form sends an email but the
        # custom user model authenticates with username.
        matching_user = (
            UserModel._default_manager
            .filter(email__iexact=identifier)
            .first()
        )

        if not matching_user:
            return None

        fallback_identifier = getattr(
            matching_user,
            username_field,
            None,
        )

        if not fallback_identifier:
            return None

        return authenticate(
            request=request,
            **{
                username_field: fallback_identifier,
                "password": password,
            },
        )

    def post(self, request):
        organisation = self._resolve_organisation(request)

        if not organisation:
            return Response(
                {
                    "organisation_slug": (
                        "A valid active organisation is required."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        identifier = str(
            request.data.get("email")
            or request.data.get("username")
            or request.data.get("identifier")
            or ""
        ).strip()

        password = str(request.data.get("password") or "")

        if not identifier:
            return Response(
                {"email": "Email or username is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not password:
            return Response(
                {"password": "Password is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = self._authenticate_user(
            request,
            identifier,
            password,
        )

        if not user or not getattr(user, "is_active", True):
            return Response(
                {
                    "detail": (
                        "The email/username or password is incorrect."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        accesses = list(
            get_active_partner_accesses(
                user,
                organisation,
            )
        )

        if not accesses:
            return Response(
                {
                    "detail": (
                        "This account does not have active Partner Portal "
                        "access for this organisation."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not any(access.can_access_dashboard for access in accesses):
            return Response(
                {
                    "detail": (
                        "Partner Portal dashboard access is disabled for "
                        "this account."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        login(request, user)

        now = timezone.now()
        BusinessEntityUserAccess.objects.filter(
            id__in=[access.id for access in accesses],
        ).update(last_access_at=now)

        payload = build_partner_portal_payload(
            user=user,
            organisation=organisation,
            accesses=accesses,
        )
        payload["authenticated"] = True
        payload["redirect_to"] = payload["routes"]["scanner"]

        return Response(payload)


class PublicDomainResolveAPIView(APIView):
    permission_classes = [permissions.AllowAny]

    def clean_domain(self, domain):
        if not domain:
            return ""

        domain = domain.strip().lower()
        domain = domain.replace("https://", "").replace("http://", "")
        domain = domain.split("/")[0]
        domain = domain.split(":")[0]

        return domain

    def get_domain_candidates(self, domain):
        domain = self.clean_domain(domain)

        if not domain:
            return []

        candidates = [domain]

        if domain.startswith("www."):
            candidates.append(domain[4:])
        else:
            candidates.append(f"www.{domain}")

        return candidates

    def get(self, request):
        raw_domain = request.query_params.get("domain", "")
        domain = self.clean_domain(raw_domain)

        if not domain:
            return Response(
                {"detail": "domain is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        query = Q()

        for candidate in self.get_domain_candidates(domain):
            query |= Q(custom_domain__iexact=candidate)

        site_settings = (
            TicketingPublicSiteSettings.objects
            .select_related("organisation")
            .filter(
                query,
                organisation__is_active=True,
                is_published=True,
            )
            .first()
        )

        if not site_settings:
            return Response(
                {
                    "detail": "No published ticketing site found for this domain.",
                    "domain": domain,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        organisation = site_settings.organisation
        public_domain = site_settings.custom_domain or domain

        return Response(
            {
                "organisation_id": organisation.id,
                "organisation_slug": organisation.slug,
                "organisation_name": organisation.name,
                "business_type": getattr(organisation, "business_type", "ticketing"),
                "public_domain": public_domain,
                "public_base_url": f"https://{public_domain}",
                "is_published": site_settings.is_published,
                "domain_status": getattr(site_settings, "domain_status", "active"),
            }
        )
    
class TicketingPrivateViewSet(TicketingOrganisationMixin, viewsets.ModelViewSet):
    permission_classes = [HasTicketingOrganisationAccess]

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        serializer.save(organisation=organisation)


class TicketingReadOnlyPrivateViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    permission_classes = [HasTicketingOrganisationAccess]


class TicketingProductManagementPermissionMixin:
    """
    Sellers can read available products/schedules.
    Only admins/managers or sellers with can_manage_products can create/update/delete.
    """

    def get_permissions(self):
        read_actions = [
            "list",
            "retrieve",
            "excursions",
            "transfers",
            "events",
            "tickets",
            "resolve",
            "quote",
        ]

        if getattr(self, "action", None) in read_actions:
            return [HasTicketingOrganisationAccess()]

        return [CanManageTicketingProducts()]


class TicketingSettingsViewSet(TicketingPrivateViewSet):
    serializer_class = TicketingSettingsSerializer
    permission_classes = [CanManageTicketingSettings]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TicketingSettings.objects.none()

        return TicketingSettings.objects.filter(organisation=organisation)

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        serializer.save(organisation=organisation)

    @action(detail=False, methods=["get", "patch"], url_path="mine")
    def mine(self, request):
        organisation = self.require_organisation()

        settings_obj, created = TicketingSettings.objects.get_or_create(
            organisation=organisation,
            defaults={
                "module_name": "Tours, Tickets & Transfers",
                "public_brand_name": "PCD Experiences",
            },
        )

        if request.method == "PATCH":
            serializer = self.get_serializer(
                settings_obj,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(settings_obj)
        return Response(serializer.data)


class TicketingPublicSiteSettingsViewSet(TicketingPrivateViewSet):
    serializer_class = TicketingPublicSiteSettingsSerializer
    permission_classes = [CanManageTicketingSettings]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TicketingPublicSiteSettings.objects.none()

        return TicketingPublicSiteSettings.objects.filter(organisation=organisation)

    def get_or_create_site_settings(self):
        organisation = self.require_organisation()

        site_settings, created = TicketingPublicSiteSettings.objects.get_or_create(
            organisation=organisation,
            defaults={
                "site_title": organisation.name,
                "public_email": organisation.email,
                "public_whatsapp": organisation.phone,
            },
        )

        return site_settings

    @action(detail=False, methods=["get", "patch"], url_path="mine")
    def mine(self, request):
        site_settings = self.get_or_create_site_settings()

        if request.method == "PATCH":
            serializer = self.get_serializer(
                site_settings,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(site_settings)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="connect-domain")
    def connect_domain(self, request):
        """
        Starts AWS setup for a custom public domain.

        The customer still creates DNS records in GoDaddy manually, but the app:
        - creates/reuses the AWS ACM certificate
        - reads the ACM DNS validation CNAME
        - prepares the CloudFront CNAME target
        - saves the DNS records that the frontend must show to the customer
        """
        site_settings = self.get_or_create_site_settings()

        custom_domain = (
            request.data.get("custom_domain")
            or request.data.get("domain")
            or ""
        )

        custom_domain = str(custom_domain).strip()

        if not custom_domain:
            return Response(
                {"custom_domain": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            site_settings = connect_ticketing_custom_domain(
                site_settings=site_settings,
                custom_domain=custom_domain,
            )
        except Exception as exc:
            site_settings.custom_domain = custom_domain
            site_settings.mark_domain_failed(str(exc), save=True)

            serializer = self.get_serializer(site_settings)

            return Response(
                {
                    "detail": str(exc),
                    "site": serializer.data,
                    "dns_records": serializer.data.get("domain_dns_records", []),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(site_settings)

        return Response(
            {
                "site": serializer.data,
                "dns_records": serializer.data.get("domain_dns_records", []),
                "message": "Domain setup started. Add the DNS records in GoDaddy, then click Check Domain.",
            }
        )

    @action(detail=False, methods=["post"], url_path="check-domain")
    def check_domain(self, request):
        """
        Checks AWS ACM validation and CloudFront alias setup.

        When ACM is issued, the domain automation service will try to attach the
        custom domain and certificate to CloudFront, then mark the domain active.
        """
        site_settings = self.get_or_create_site_settings()

        if not site_settings.custom_domain:
            return Response(
                {"custom_domain": "No custom domain has been configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            site_settings = check_ticketing_custom_domain(site_settings=site_settings)
        except Exception as exc:
            site_settings.mark_domain_failed(str(exc), save=True)

            serializer = self.get_serializer(site_settings)

            return Response(
                {
                    "detail": str(exc),
                    "site": serializer.data,
                    "dns_records": serializer.data.get("domain_dns_records", []),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = self.get_serializer(site_settings)

        return Response(
            {
                "site": serializer.data,
                "dns_records": serializer.data.get("domain_dns_records", []),
                "message": "Domain status checked.",
            }
        )


class ExperienceCategoryViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ExperienceCategorySerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExperienceCategory.objects.none()

        queryset = ExperienceCategory.objects.filter(organisation=organisation)

        is_active = self.request.query_params.get("is_active")

        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        return queryset


class ExperienceProductViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ExperienceProductSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExperienceProduct.objects.none()

        queryset = (
            ExperienceProduct.objects
            .filter(organisation=organisation)
            .select_related("organisation", "category", "created_by")
            .prefetch_related(
                "gallery_images",
                "packages",
                "availability",
                "pickup_schedules",
                "pickup_schedules__pickup_location",
                "transfer_routes",
                "event_ticket_types",
            )
        )

        product_type = self.request.query_params.get("product_type")
        status_filter = self.request.query_params.get("status")
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        public_enabled = self.request.query_params.get("public_enabled")
        seller_enabled = self.request.query_params.get("seller_enabled")

        if product_type:
            queryset = queryset.filter(product_type=product_type)

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if category:
            queryset = queryset.filter(
                Q(category_id=category) | Q(category__slug=category)
            )

        if public_enabled in ["true", "false"]:
            queryset = queryset.filter(public_enabled=public_enabled == "true")

        if seller_enabled in ["true", "false"]:
            queryset = queryset.filter(seller_enabled=seller_enabled == "true")

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(short_description__icontains=search)
                | Q(long_description__icontains=search)
                | Q(location__icontains=search)
                | Q(keywords_tags__icontains=search)
            )

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return ExperienceProduct.objects.none()

            allowed_product_types = []

            if seller.can_sell_excursions:
                allowed_product_types.append("excursion")

            if seller.can_sell_transfers:
                allowed_product_types.append("transfer")

            if seller.can_sell_events:
                allowed_product_types.append("event")

            if seller.can_sell_custom_tours:
                allowed_product_types.append("custom")

            if seller.can_sell_cocobongo:
                allowed_product_types.extend(["ticket", "nightlife"])

            if not allowed_product_types:
                return ExperienceProduct.objects.none()

            queryset = queryset.filter(
                seller_enabled=True,
                product_type__in=allowed_product_types,
            )

            if not seller.can_sell_cocobongo:
                queryset = queryset.exclude(is_cocobongo_product=True)

        return queryset

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        serializer.save(
            organisation=organisation,
            created_by=self.request.user,
        )

    @action(detail=False, methods=["get"], url_path="excursions")
    def excursions(self, request):
        queryset = self.get_queryset().filter(product_type="excursion")
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="transfers")
    def transfers(self, request):
        queryset = self.get_queryset().filter(product_type="transfer")
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="events")
    def events(self, request):
        queryset = self.get_queryset().filter(product_type="event")
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["get"], url_path="tickets")
    def tickets(self, request):
        queryset = self.get_queryset().filter(product_type="ticket")
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)


class ProductGalleryImageViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ProductGalleryImageSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ProductGalleryImage.objects.none()

        queryset = (
            ProductGalleryImage.objects
            .filter(product__organisation=organisation)
            .select_related("product", "product__organisation")
        )

        product = self.request.query_params.get("product")
        is_active = self.request.query_params.get("is_active")
        is_cover = self.request.query_params.get("is_cover")

        if product:
            queryset = queryset.filter(product_id=product)

        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        if is_cover in ["true", "false"]:
            queryset = queryset.filter(is_cover=is_cover == "true")

        return queryset

    def perform_create(self, serializer):
        organisation = self.require_organisation()

        product = serializer.validated_data.get("product")

        if not product:
            product_id = (
                self.request.data.get("product")
                or self.request.data.get("product_id")
            )

            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=organisation,
            )

        gallery_image = serializer.save(product=product)

        if gallery_image.is_cover:
            ProductGalleryImage.objects.filter(
                product=product,
                is_cover=True,
            ).exclude(id=gallery_image.id).update(is_cover=False)

            if gallery_image.image and not product.image:
                product.image = gallery_image.image
                product.save(update_fields=["image", "updated_at"])

    def perform_update(self, serializer):
        gallery_image = serializer.save()

        if gallery_image.is_cover:
            ProductGalleryImage.objects.filter(
                product=gallery_image.product,
                is_cover=True,
            ).exclude(id=gallery_image.id).update(is_cover=False)

            if gallery_image.image:
                gallery_image.product.image = gallery_image.image
                gallery_image.product.save(update_fields=["image", "updated_at"])

    @action(detail=True, methods=["post"], url_path="make-cover")
    def make_cover(self, request, pk=None):
        gallery_image = self.get_object()

        ProductGalleryImage.objects.filter(
            product=gallery_image.product,
            is_cover=True,
        ).exclude(id=gallery_image.id).update(is_cover=False)

        gallery_image.is_cover = True
        gallery_image.save(update_fields=["is_cover", "updated_at"])

        if gallery_image.image:
            gallery_image.product.image = gallery_image.image
            gallery_image.product.save(update_fields=["image", "updated_at"])

        serializer = self.get_serializer(gallery_image)

        return Response(serializer.data)



class ExperiencePackageViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ExperiencePackageSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExperiencePackage.objects.none()

        queryset = ExperiencePackage.objects.filter(
            product__organisation=organisation,
        ).select_related("product")

        product_id = self.request.query_params.get("product")

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get("product")

        if not product:
            product_id = self.request.data.get("product") or self.request.data.get("product_id")
            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=self.require_organisation(),
            )

        serializer.save(product=product)


class ProductAvailabilityViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ProductAvailabilitySerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ProductAvailability.objects.none()

        queryset = ProductAvailability.objects.filter(
            product__organisation=organisation,
        ).select_related("product", "package")

        product_id = self.request.query_params.get("product")
        date = self.request.query_params.get("date")

        if product_id:
            queryset = queryset.filter(product_id=product_id)

        if date:
            queryset = queryset.filter(date=date)

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get("product")

        if not product:
            product_id = self.request.data.get("product") or self.request.data.get("product_id")
            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=self.require_organisation(),
            )

        serializer.save(product=product)


class PickupZoneViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = PickupZoneSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return PickupZone.objects.none()

        return PickupZone.objects.filter(organisation=organisation)


class PickupLocationViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = PickupLocationSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return PickupLocation.objects.none()

        queryset = PickupLocation.objects.filter(
            organisation=organisation,
        ).select_related("zone")

        zone = self.request.query_params.get("zone")
        location_type = self.request.query_params.get("location_type")
        search = self.request.query_params.get("search")

        if zone:
            queryset = queryset.filter(Q(zone_id=zone) | Q(zone__name__icontains=zone))

        if location_type:
            queryset = queryset.filter(location_type=location_type)

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(address__icontains=search)
                | Q(default_pickup_point__icontains=search)
            )

        return queryset


class ProductPickupScheduleViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = ProductPickupScheduleSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ProductPickupSchedule.objects.none()

        queryset = ProductPickupSchedule.objects.filter(
            product__organisation=organisation,
        ).select_related("product", "pickup_location", "pickup_location__zone")

        product = self.request.query_params.get("product")
        pickup_location = self.request.query_params.get("pickup_location")
        service_date = self.request.query_params.get("service_date")
        day_of_week = self.request.query_params.get("day_of_week")

        if product:
            queryset = queryset.filter(product_id=product)

        if pickup_location:
            queryset = queryset.filter(pickup_location_id=pickup_location)

        if day_of_week not in [None, ""]:
            queryset = queryset.filter(day_of_week=day_of_week)

        if service_date:
            parsed_date = service_date

            queryset = queryset.filter(
                Q(specific_date=parsed_date)
                | Q(specific_date__isnull=True)
            )

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get("product")

        if not product:
            product_id = self.request.data.get("product") or self.request.data.get("product_id")
            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=self.require_organisation(),
            )

        pickup_location = serializer.validated_data.get("pickup_location")

        if not pickup_location:
            pickup_location_id = (
                self.request.data.get("pickup_location")
                or self.request.data.get("pickup_location_id")
            )
            pickup_location = get_object_or_404(
                PickupLocation,
                id=pickup_location_id,
                organisation=self.require_organisation(),
            )

        serializer.save(product=product, pickup_location=pickup_location)

    def get_import_value(self, row, *keys):
        for key in keys:
            for row_key, value in row.items():
                normalized_key = str(row_key or "").strip().lower().replace(" ", "_")
                if normalized_key == key:
                    return str(value or "").strip()
        return ""

    def normalize_import_time(self, value, product=None):
        raw = str(value or "").strip()

        if not raw:
            return ""

        cleaned_for_flags = raw.lower().replace(" ", "")
        is_pm = "pm" in cleaned_for_flags or "p.m" in cleaned_for_flags
        is_am = "am" in cleaned_for_flags or "a.m" in cleaned_for_flags
        has_explicit_meridiem = is_pm or is_am

        cleaned = raw.lower().replace(".", ":").replace(" ", "")
        cleaned = re.sub(r"[^0-9:]", "", cleaned)

        if not cleaned:
            return ""

        if ":" in cleaned:
            hour_raw, minute_raw = cleaned.split(":", 1)
        elif len(cleaned) in [3, 4]:
            hour_raw, minute_raw = cleaned[:-2], cleaned[-2:]
        else:
            hour_raw, minute_raw = cleaned, "00"

        try:
            hour = int(hour_raw)
            minute = int((minute_raw or "00")[:2])
        except ValueError:
            return ""

        if hour < 0 or hour > 23 or minute < 0 or minute > 59:
            return ""

        if is_pm and hour < 12:
            hour += 12

        if is_am and hour == 12:
            hour = 0

        is_nightlife_product = False

        if product is not None:
            is_nightlife_product = (
                bool(getattr(product, "is_cocobongo_product", False))
                or str(getattr(product, "product_type", "")).lower() == "nightlife"
            )

        # For Coco Bongo / nightlife CSV imports, owners often upload times like
        # 6:30 or 7:20 without AM/PM. Those should be interpreted as evening
        # pickup times. Explicit AM/PM values are respected exactly.
        if is_nightlife_product and not has_explicit_meridiem and 1 <= hour < 12:
            hour += 12

        return f"{hour:02d}:{minute:02d}"

    def parse_import_csv_rows(self, uploaded_file, product=None):
        try:
            decoded = uploaded_file.read().decode("utf-8-sig")
        except UnicodeDecodeError:
            uploaded_file.seek(0)
            decoded = uploaded_file.read().decode("latin-1")

        stream = io.StringIO(decoded)
        sample = decoded[:2048]

        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel

        reader = csv.DictReader(stream, dialect=dialect)

        if not reader.fieldnames:
            raise ValueError("CSV file must include a header row.")

        rows = []

        for index, row in enumerate(reader, start=2):
            hotel_name = self.get_import_value(
                row,
                "hotel",
                "hotel_name",
                "pickup_location",
                "pickup_location_name",
                "location",
                "name",
            )
            pickup_time = self.normalize_import_time(
                self.get_import_value(row, "pickup_time", "time", "hour"),
                product=product,
            )
            zone_name = self.get_import_value(row, "zone", "area", "pickup_zone")
            pickup_point = self.get_import_value(row, "pickup_point", "point", "meeting_point")
            instructions = self.get_import_value(row, "instructions", "notes", "note")
            specific_date = self.get_import_value(row, "specific_date", "date", "service_date")
            day_of_week = self.get_import_value(row, "day_of_week", "day", "weekday")

            if not hotel_name and not pickup_time:
                continue

            rows.append(
                {
                    "row_number": index,
                    "hotel_name": hotel_name,
                    "pickup_time": pickup_time,
                    "zone_name": zone_name,
                    "pickup_point": pickup_point,
                    "instructions": instructions,
                    "specific_date": specific_date or None,
                    "day_of_week": day_of_week,
                    "errors": [],
                }
            )

        return rows

    def normalize_import_day_of_week(self, value):
        raw = str(value or "").strip().lower()

        if raw == "":
            return None

        if raw.isdigit():
            number = int(raw)
            return number if 0 <= number <= 6 else None

        day_map = {
            "monday": 0,
            "mon": 0,
            "lunes": 0,
            "tuesday": 1,
            "tue": 1,
            "martes": 1,
            "wednesday": 2,
            "wed": 2,
            "miercoles": 2,
            "miércoles": 2,
            "thursday": 3,
            "thu": 3,
            "jueves": 3,
            "friday": 4,
            "fri": 4,
            "viernes": 4,
            "saturday": 5,
            "sat": 5,
            "sabado": 5,
            "sábado": 5,
            "sunday": 6,
            "sun": 6,
            "domingo": 6,
        }

        return day_map.get(raw)

    @action(detail=False, methods=["post"], url_path="import-csv")
    def import_csv(self, request):
        organisation = self.require_organisation()

        product_id = request.data.get("product") or request.data.get("product_id")
        upload = request.FILES.get("file")
        mode = str(request.data.get("mode") or "preview").lower()
        commit_import = mode in ["import", "commit", "save"]
        update_existing = str(request.data.get("update_existing") or "false").lower() == "true"
        create_zones = str(request.data.get("create_zones") or "true").lower() != "false"

        if not product_id:
            return Response(
                {"product": "Select a product before importing."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not upload:
            return Response(
                {"file": "Upload a CSV file."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(
            ExperienceProduct,
            id=product_id,
            organisation=organisation,
        )

        try:
            parsed_rows = self.parse_import_csv_rows(upload, product=product)
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        preview_rows = []
        summary = {
            "rows_read": len(parsed_rows),
            "valid_rows": 0,
            "invalid_rows": 0,
            "existing_locations": 0,
            "new_locations": 0,
            "existing_schedules": 0,
            "new_schedules": 0,
            "updated_schedules": 0,
            "created_locations": 0,
            "created_schedules": 0,
            "skipped_duplicates": 0,
        }

        seen_keys = set()

        def process_rows():
            for row in parsed_rows:
                hotel_name = row["hotel_name"].strip()
                pickup_time = row["pickup_time"]
                zone_name = row["zone_name"].strip()
                pickup_point = row["pickup_point"].strip()
                instructions = row["instructions"].strip()
                specific_date = row["specific_date"]
                day_of_week = self.normalize_import_day_of_week(row["day_of_week"])
                row_errors = []

                if not hotel_name:
                    row_errors.append("Hotel name is required.")

                if not pickup_time:
                    row_errors.append("Pickup time is required or invalid.")

                if specific_date and not parse_date(str(specific_date)):
                    row_errors.append("specific_date must be YYYY-MM-DD.")

                if row["day_of_week"] and day_of_week is None:
                    row_errors.append("day_of_week must be 0-6 or a valid day name.")

                specific_date_value = parse_date(str(specific_date)) if specific_date else None
                slug_value = slugify(hotel_name)

                location = None
                schedule = None
                status_label = "invalid" if row_errors else "ready"
                action_label = "Skipped"
                location_created = False
                schedule_created = False
                schedule_updated = False

                duplicate_key = (
                    product.id,
                    slug_value,
                    specific_date_value.isoformat() if specific_date_value else "",
                    "" if day_of_week is None else str(day_of_week),
                )

                if not row_errors and duplicate_key in seen_keys:
                    row_errors.append("Duplicate row in this file.")
                    status_label = "duplicate"
                    action_label = "Skipped duplicate"

                if not row_errors:
                    seen_keys.add(duplicate_key)

                    location = PickupLocation.objects.filter(
                        organisation=organisation,
                        slug=slug_value,
                    ).first()

                    location_exists = bool(location)

                    if location_exists:
                        summary["existing_locations"] += 1
                    else:
                        summary["new_locations"] += 1

                    if commit_import and not location:
                        zone = None

                        if zone_name and create_zones:
                            zone, _ = PickupZone.objects.get_or_create(
                                organisation=organisation,
                                name=zone_name,
                                defaults={"description": "Imported from pickup schedule CSV."},
                            )

                        location = PickupLocation.objects.create(
                            organisation=organisation,
                            zone=zone,
                            name=hotel_name,
                            slug=slug_value,
                            location_type="hotel",
                            default_pickup_point=pickup_point,
                            default_instructions=instructions,
                            is_active=True,
                        )
                        location_created = True
                        summary["created_locations"] += 1

                    if location:
                        schedule_queryset = ProductPickupSchedule.objects.filter(
                            product=product,
                            pickup_location=location,
                            specific_date=specific_date_value,
                        )

                        if day_of_week is None:
                            schedule_queryset = schedule_queryset.filter(day_of_week__isnull=True)
                        else:
                            schedule_queryset = schedule_queryset.filter(day_of_week=day_of_week)

                        schedule = schedule_queryset.first()

                        if schedule:
                            summary["existing_schedules"] += 1

                            if commit_import and update_existing:
                                schedule.pickup_time = pickup_time
                                schedule.pickup_point = pickup_point
                                schedule.instructions = instructions
                                schedule.is_active = True
                                schedule.save(
                                    update_fields=[
                                        "pickup_time",
                                        "pickup_point",
                                        "instructions",
                                        "is_active",
                                        "updated_at",
                                    ]
                                )
                                schedule_updated = True
                                summary["updated_schedules"] += 1
                        else:
                            summary["new_schedules"] += 1

                            if commit_import:
                                ProductPickupSchedule.objects.create(
                                    product=product,
                                    pickup_location=location,
                                    day_of_week=day_of_week,
                                    specific_date=specific_date_value,
                                    pickup_time=pickup_time,
                                    pickup_point=pickup_point,
                                    instructions=instructions,
                                    is_active=True,
                                )
                                schedule_created = True
                                summary["created_schedules"] += 1

                    if row_errors:
                        summary["invalid_rows"] += 1
                    else:
                        summary["valid_rows"] += 1

                    if schedule_created:
                        status_label = "created"
                        action_label = "Created schedule"
                    elif schedule_updated:
                        status_label = "updated"
                        action_label = "Updated existing schedule"
                    elif schedule:
                        status_label = "duplicate"
                        action_label = "Existing schedule skipped"
                        summary["skipped_duplicates"] += 1
                    elif location_created:
                        status_label = "created"
                        action_label = "Created hotel and schedule"
                    else:
                        status_label = "new" if not location_exists else "matched"
                        action_label = "Will create schedule" if not commit_import else "Ready"
                else:
                    summary["invalid_rows"] += 1

                preview_rows.append(
                    {
                        "row_number": row["row_number"],
                        "hotel_name": hotel_name,
                        "pickup_time": pickup_time,
                        "zone_name": zone_name,
                        "pickup_point": pickup_point,
                        "instructions": instructions,
                        "specific_date": specific_date or "",
                        "day_of_week": day_of_week,
                        "status": status_label,
                        "action": action_label,
                        "errors": row_errors,
                    }
                )

        try:
            if commit_import:
                with transaction.atomic():
                    process_rows()
            else:
                process_rows()
        except Exception as exc:
            logger.exception("Pickup schedule CSV import failed.")
            print("=" * 80)
            print("PICKUP SCHEDULE CSV IMPORT FAILED")
            traceback.print_exc()
            print("=" * 80)

            return Response(
                {
                    "detail": "Pickup schedule import failed.",
                    "error": str(exc),
                    "error_type": exc.__class__.__name__,
                    "traceback": traceback.format_exc(),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "mode": "import" if commit_import else "preview",
                "product": {
                    "id": product.id,
                    "name": product.name,
                },
                "summary": summary,
                "rows": preview_rows[:500],
            }
        )

    @action(detail=False, methods=["get"], url_path="resolve")
    def resolve(self, request):
        organisation = self.require_organisation()

        product_id = request.query_params.get("product")
        pickup_location_id = request.query_params.get("pickup_location")
        service_date = request.query_params.get("service_date")

        if not product_id or not pickup_location_id or not service_date:
            return Response(
                {
                    "detail": "product, pickup_location and service_date are required."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(
            ExperienceProduct,
            id=product_id,
            organisation=organisation,
        )

        pickup_location = get_object_or_404(
            PickupLocation,
            id=pickup_location_id,
            organisation=organisation,
        )

        try:
            parsed_date = timezone.datetime.fromisoformat(service_date).date()
        except ValueError:
            return Response(
                {"detail": "service_date must be YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        schedules = ProductPickupSchedule.objects.filter(
            product=product,
            pickup_location=pickup_location,
            is_active=True,
        ).filter(
            Q(specific_date=parsed_date)
            | Q(day_of_week=parsed_date.weekday(), specific_date__isnull=True)
            | Q(day_of_week__isnull=True, specific_date__isnull=True)
        )

        schedule = schedules.filter(specific_date=parsed_date).first()

        if not schedule:
            schedule = schedules.filter(
                day_of_week=parsed_date.weekday(),
                specific_date__isnull=True,
            ).first()

        if not schedule:
            schedule = schedules.filter(
                day_of_week__isnull=True,
                specific_date__isnull=True,
            ).first()

        if not schedule:
            return Response(
                {
                    "found": False,
                    "product": product.name,
                    "pickup_location": pickup_location.name,
                    "service_date": service_date,
                    "message": "No pickup schedule found for this product, date and location.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(schedule)

        return Response(
            {
                "found": True,
                "schedule": serializer.data,
            }
        )


class CustomerViewSet(TicketingPrivateViewSet):
    serializer_class = CustomerSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return Customer.objects.none()

        queryset = Customer.objects.filter(organisation=organisation)

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return Customer.objects.none()

            queryset = queryset.filter(bookings__seller=seller).distinct()

        search = self.request.query_params.get("search")

        if search:
            queryset = queryset.filter(
                Q(full_name__icontains=search)
                | Q(whatsapp__icontains=search)
                | Q(phone__icontains=search)
                | Q(email__icontains=search)
                | Q(hotel_name__icontains=search)
            )

        return queryset


class SellerViewSet(TicketingPrivateViewSet):
    serializer_class = SellerSerializer

    def get_permissions(self):
        if getattr(self, "action", None) == "me":
            return [HasTicketingOrganisationAccess()]

        return [CanManageTicketingSellers()]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return Seller.objects.none()

        queryset = Seller.objects.filter(
            organisation=organisation,
        ).select_related("user", "organisation")

        role = self.request.query_params.get("role")
        is_active = self.request.query_params.get("is_active")
        search = self.request.query_params.get("search")

        if role:
            queryset = queryset.filter(role=role)

        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        if search:
            queryset = queryset.filter(
                Q(full_name__icontains=search)
                | Q(seller_slug__icontains=search)
                | Q(email__icontains=search)
                | Q(phone__icontains=search)
                | Q(whatsapp__icontains=search)
            )

        return queryset

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        serializer.save(organisation=organisation)

    @action(detail=False, methods=["get"], url_path="me")
    def me(self, request):
        organisation = self.require_organisation()

        seller = Seller.objects.filter(
            organisation=organisation,
            user=request.user,
            is_active=True,
        ).first()

        if not seller:
            return Response(
                {"detail": "No active seller profile found for this user."},
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = self.get_serializer(seller)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="apply-role-defaults")
    def apply_role_defaults(self, request, pk=None):
        seller = self.get_object()
        seller.apply_role_default_permissions()
        seller.save()

        serializer = self.get_serializer(seller)
        return Response(serializer.data)


class TransferRouteViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = TransferRouteSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TransferRoute.objects.none()

        queryset = TransferRoute.objects.filter(
            product__organisation=organisation,
        ).select_related("product")

        product = self.request.query_params.get("product")

        if product:
            queryset = queryset.filter(product_id=product)

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get("product")

        if not product:
            product_id = self.request.data.get("product") or self.request.data.get("product_id")
            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=self.require_organisation(),
            )

        serializer.save(product=product)




class TransferPriceBandViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = TransferPriceBandSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TransferPriceBand.objects.none()

        queryset = (
            TransferPriceBand.objects
            .filter(route__product__organisation=organisation)
            .select_related("route", "route__product")
        )

        route = self.request.query_params.get("route")
        product = self.request.query_params.get("product")
        is_active = self.request.query_params.get("is_active")
        passengers = self.request.query_params.get("passengers")

        if route:
            queryset = queryset.filter(route_id=route)

        if product:
            queryset = queryset.filter(route__product_id=product)

        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        if passengers not in [None, ""]:
            try:
                passenger_count = int(passengers)
            except (TypeError, ValueError):
                passenger_count = None

            if passenger_count is not None:
                queryset = queryset.filter(
                    min_passengers__lte=passenger_count,
                    max_passengers__gte=passenger_count,
                )

        return queryset

    def perform_create(self, serializer):
        route = serializer.validated_data.get("route")

        if not route:
            route_id = self.request.data.get("route") or self.request.data.get("route_id")
            route = get_object_or_404(
                TransferRoute,
                id=route_id,
                product__organisation=self.require_organisation(),
            )

        serializer.save(route=route)

    @action(detail=False, methods=["get"], url_path="quote")
    def quote(self, request):
        organisation = self.require_organisation()

        route_id = request.query_params.get("route") or request.query_params.get("route_id")
        passengers = request.query_params.get("passengers")
        round_trip_value = str(request.query_params.get("round_trip") or "false").lower()
        is_round_trip = round_trip_value in ["true", "1", "yes"]

        if not route_id:
            return Response(
                {"route": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if passengers in [None, ""]:
            return Response(
                {"passengers": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            passenger_count = int(passengers)
        except (TypeError, ValueError):
            return Response(
                {"passengers": "Passengers must be a valid number."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if passenger_count <= 0:
            return Response(
                {"passengers": "Passengers must be greater than zero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        route = get_object_or_404(
            TransferRoute,
            id=route_id,
            product__organisation=organisation,
            is_active=True,
        )

        price_band = (
            TransferPriceBand.objects
            .filter(
                route=route,
                is_active=True,
                min_passengers__lte=passenger_count,
                max_passengers__gte=passenger_count,
            )
            .order_by("sort_order", "min_passengers")
            .first()
        )

        if not price_band:
            return Response(
                {
                    "found": False,
                    "detail": "No active price band found for this passenger count.",
                    "route": {
                        "id": route.id,
                        "origin": route.origin,
                        "destination": route.destination,
                    },
                    "passengers": passenger_count,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        total_price = price_band.one_way_price

        if is_round_trip:
            total_price = price_band.round_trip_price or price_band.one_way_price * Decimal("2")

        return Response(
            {
                "found": True,
                "route": {
                    "id": route.id,
                    "origin": route.origin,
                    "destination": route.destination,
                    "airport": route.airport,
                },
                "passengers": passenger_count,
                "round_trip": is_round_trip,
                "price_band": TransferPriceBandSerializer(
                    price_band,
                    context=self.get_serializer_context(),
                ).data,
                "vehicle_type": price_band.vehicle_type or route.vehicle_type,
                "total_price": str(total_price),
            }
        )

class EventTicketTypeViewSet(
    TicketingProductManagementPermissionMixin,
    TicketingPrivateViewSet,
):
    serializer_class = EventTicketTypeSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return EventTicketType.objects.none()

        queryset = EventTicketType.objects.filter(
            product__organisation=organisation,
        ).select_related("product")

        product = self.request.query_params.get("product")

        if product:
            queryset = queryset.filter(product_id=product)

        return queryset

    def perform_create(self, serializer):
        product = serializer.validated_data.get("product")

        if not product:
            product_id = self.request.data.get("product") or self.request.data.get("product_id")
            product = get_object_or_404(
                ExperienceProduct,
                id=product_id,
                organisation=self.require_organisation(),
            )

        serializer.save(product=product)


class BookingViewSet(TicketingPrivateViewSet):
    serializer_class = BookingSerializer
    permission_classes = [HasTicketingOrganisationAccess, HasTicketingSellerPermission]

    ticketing_permission_by_action = {
        "create": "can_create_bookings",
        "confirm": "can_create_bookings",
        "approve": "can_create_bookings",
        "add_payment": "can_create_bookings",
        "settle": "can_create_bookings",
        "mark_ticket_generated": "can_generate_ticket_without_customer_online_payment",
        "cancel": "can_cancel_bookings",
        "override_pickup": "can_override_pickup_time",
    }

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return Booking.objects.none()

        queryset = (
            Booking.objects
            .filter(organisation=organisation)
            .select_related(
                "organisation",
                "customer",
                "seller",
                "primary_product",
                "created_by",
                "supervisor_approved_by",
            )
            .prefetch_related(
                "items",
                "payments",
                "commissions",
                "notification_logs",
            )
        )

        if not self.is_admin_user():
            current_seller = self.get_current_seller()

            if not current_seller or not current_seller.can_view_own_sales:
                return Booking.objects.none()

            queryset = queryset.filter(seller=current_seller)

        status_filter = self.request.query_params.get("status")
        payment_status = self.request.query_params.get("payment_status")
        settlement_status = self.request.query_params.get("settlement_status")
        payment_receiver = self.request.query_params.get("payment_receiver")
        source = self.request.query_params.get("source")
        seller = self.request.query_params.get("seller")
        product = self.request.query_params.get("product")
        service_date = self.request.query_params.get("service_date")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        search = self.request.query_params.get("search")
        owed_only = str(self.request.query_params.get("owed_only") or "").lower()
        unsettled_only = str(self.request.query_params.get("unsettled_only") or "").lower()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)

        if settlement_status:
            queryset = queryset.filter(settlement_status=settlement_status)

        if payment_receiver:
            queryset = queryset.filter(payment_receiver=payment_receiver)

        if owed_only in ["true", "1", "yes"]:
            queryset = queryset.filter(seller_due_to_company__gt=Decimal("0.00"))

        if unsettled_only in ["true", "1", "yes"]:
            queryset = queryset.exclude(settlement_status="settled")

        if source:
            queryset = queryset.filter(source=source)

        if seller:
            queryset = queryset.filter(seller_id=seller)

        if product:
            queryset = queryset.filter(
                Q(primary_product_id=product)
                | Q(items__product_id=product)
            ).distinct()

        if service_date:
            queryset = queryset.filter(service_date=service_date)

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        if search:
            queryset = queryset.filter(
                Q(booking_code__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_whatsapp__icontains=search)
                | Q(customer_email__icontains=search)
                | Q(customer_hotel__icontains=search)
                | Q(seller__full_name__icontains=search)
                | Q(primary_product__name__icontains=search)
            )

        return queryset.distinct()

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        seller = self.get_current_seller()

        if seller and not self.is_admin_user():
            booking = serializer.save(
                organisation=organisation,
                seller=seller,
                source="seller_dashboard",
            )
        else:
            booking = serializer.save(organisation=organisation)

        booking_finance.recalculate_booking_payment_totals(booking)

    def recalculate_booking_after_payment(self, booking):
        return booking_finance.recalculate_booking_payment_totals(booking)

    def validate_seller_payment_permission(
        self,
        seller,
        payment_type,
        method,
        payer_type,
    ):
        """
        Compatibility wrapper.

        Real seller payment rules now live in ticketing.finance.permissions.
        """

        if not seller:
            return None

        from ticketing.finance.permissions import validate_payment_permission

        return validate_payment_permission(
            seller=seller,
            payment_type=payment_type,
            method=method,
            payer_type=payer_type,
        )

    @action(detail=True, methods=["post"], url_path="confirm")
    def confirm(self, request, pk=None):
        booking = self.get_object()
        booking.status = "confirmed"
        booking.confirmed_at = booking.confirmed_at or timezone.now()
        booking.save(update_fields=["status", "confirmed_at", "updated_at"])

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        serializer = self.get_serializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="approve")
    def approve(self, request, pk=None):
        booking = self.get_object()

        booking.requires_supervisor_approval = False
        booking.supervisor_approved_by = request.user
        booking.supervisor_approved_at = timezone.now()

        if booking.status == "pending_approval":
            booking.status = "confirmed"
            booking.confirmed_at = booking.confirmed_at or timezone.now()

        booking.save(
            update_fields=[
                "requires_supervisor_approval",
                "supervisor_approved_by",
                "supervisor_approved_at",
                "status",
                "confirmed_at",
                "updated_at",
            ]
        )

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        serializer = self.get_serializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="mark-ticket-generated")
    def mark_ticket_generated(self, request, pk=None):
        booking = self.get_object()
        booking.status = "ticket_generated"
        booking.save(update_fields=["status", "updated_at"])

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        serializer = self.get_serializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="complete")
    def complete(self, request, pk=None):
        booking = self.get_object()
        booking.status = "completed"
        booking.completed_at = timezone.now()
        booking.save(update_fields=["status", "completed_at", "updated_at"])

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        serializer = self.get_serializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        booking = self.get_object()
        booking.status = "cancelled"
        booking.cancelled_at = timezone.now()
        booking.cancellation_reason = request.data.get("reason", "")
        booking.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancellation_reason",
                "updated_at",
            ]
        )

        booking_finance.recalculate_booking_payment_totals(booking)
        booking_finance.sync_seller_commission_for_booking(booking)

        serializer = self.get_serializer(booking)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="add-payment")
    def add_payment(self, request, pk=None):
        booking = self.get_object()
        organisation = self.require_organisation()

        amount = request.data.get("amount")
        payment_type = request.data.get("payment_type", "partial")
        payer_type = request.data.get("payer_type", "customer")
        method = request.data.get("method", "cash")
        payment_status_value = request.data.get("status", "confirmed")
        seller_id = request.data.get("seller") or request.data.get("seller_id")
        reference = request.data.get("reference", "")
        note = request.data.get("note", "")
        provider = request.data.get("provider", "")
        collected_by_party = (
            request.data.get("collected_by_party")
            or request.data.get("payment_receiver")
            or request.data.get("receiver")
            or None
        )

        if amount in [None, ""]:
            return Response(
                {"amount": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        seller = None

        if seller_id:
            seller = get_object_or_404(
                Seller,
                id=seller_id,
                organisation=organisation,
            )

        if not seller and not self.is_admin_user():
            seller = self.get_current_seller()

        if not self.is_admin_user():
            permission_error = self.validate_seller_payment_permission(
                seller=seller,
                payment_type=payment_type,
                method=method,
                payer_type=payer_type,
            )

            if permission_error:
                return Response(
                    {"detail": permission_error},
                    status=status.HTTP_403_FORBIDDEN,
                )

        try:
            payment, booking = booking_finance.record_payment(
                booking=booking,
                seller=seller,
                collected_by=request.user,
                amount=amount,
                payment_type=payment_type,
                payer_type=payer_type,
                method=method,
                status=payment_status_value,
                provider=provider,
                reference=reference,
                note=note,
                collected_by_party=collected_by_party,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status == "confirmed" and booking.payment_status in ["paid", "deposit_paid"]:
            try:
                BookingNotificationService.payment_confirmed(booking)
            except Exception:
                logger.exception(
                    "Failed sending payment confirmation notifications for booking %s",
                    booking.booking_code,
                )

        payment_serializer = BookingPaymentSerializer(
            payment,
            context=self.get_serializer_context(),
        )
        booking_serializer = self.get_serializer(booking)

        return Response(
            {
                "payment": payment_serializer.data,
                "booking": booking_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="settle")
    def settle(self, request, pk=None):
        booking = self.get_object()

        if not self.is_admin_user():
            return Response(
                {"detail": "Only organisation admins can record seller settlements."},
                status=status.HTTP_403_FORBIDDEN,
            )

        amount = request.data.get("amount")
        method = request.data.get("method", "bank_transfer")
        reference = request.data.get("reference", "")
        note = request.data.get("note", "Seller settled amount owed to company.")
        settle_full = str(request.data.get("settle_full") or "false").lower() in ["true", "1", "yes"]

        try:
            if settle_full or amount in [None, ""]:
                payment, booking = booking_finance.settle_seller_booking_balance(
                    booking=booking,
                    collected_by=request.user,
                    method=method,
                    reference=reference,
                )
            else:
                payment, booking = booking_finance.record_seller_company_settlement(
                    booking=booking,
                    amount=amount,
                    collected_by=request.user,
                    method=method,
                    reference=reference,
                    note=note,
                )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "payment": BookingPaymentSerializer(
                    payment,
                    context=self.get_serializer_context(),
                ).data if payment else None,
                "booking": self.get_serializer(booking).data,
            }
        )

    @action(detail=True, methods=["post"], url_path="override-pickup")
    def override_pickup(self, request, pk=None):
        booking = self.get_object()

        pickup_time = request.data.get("pickup_time")
        pickup_point = request.data.get("pickup_point", "")
        instructions = request.data.get("instructions", "")
        override_reason = request.data.get("override_reason", "")

        pickup_info, created = BookingPickupInfo.objects.get_or_create(
            booking=booking,
            defaults={
                "hotel_or_location_name": booking.customer_hotel or "Manual pickup",
            },
        )

        if pickup_time:
            pickup_info.pickup_time = pickup_time

        if pickup_point:
            pickup_info.pickup_point = pickup_point

        if instructions:
            pickup_info.instructions = instructions

        pickup_info.was_overridden = True
        pickup_info.override_reason = override_reason
        pickup_info.overridden_by = request.user
        pickup_info.save()

        serializer = BookingPickupInfoSerializer(
            pickup_info,
            context=self.get_serializer_context(),
        )

        return Response(serializer.data)


class BookingItemViewSet(TicketingPrivateViewSet):
    serializer_class = BookingItemSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return BookingItem.objects.none()

        queryset = BookingItem.objects.filter(
            booking__organisation=organisation,
        ).select_related("booking", "product", "package", "event_ticket_type")

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return BookingItem.objects.none()

            queryset = queryset.filter(booking__seller=seller)

        booking = self.request.query_params.get("booking")

        if booking:
            queryset = queryset.filter(booking_id=booking)

        return queryset


class BookingPickupInfoViewSet(TicketingPrivateViewSet):
    serializer_class = BookingPickupInfoSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return BookingPickupInfo.objects.none()

        queryset = BookingPickupInfo.objects.filter(
            booking__organisation=organisation,
        ).select_related(
            "booking",
            "pickup_location",
            "pickup_location__zone",
            "pickup_schedule",
            "overridden_by",
        )

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return BookingPickupInfo.objects.none()

            queryset = queryset.filter(booking__seller=seller)

        return queryset


class BookingPaymentViewSet(TicketingPrivateViewSet):
    serializer_class = BookingPaymentSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return BookingPayment.objects.none()

        queryset = BookingPayment.objects.filter(
            booking__organisation=organisation,
        ).select_related("booking", "seller", "collected_by")

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return BookingPayment.objects.none()

            queryset = queryset.filter(
                Q(seller=seller) | Q(booking__seller=seller)
            ).distinct()

        booking = self.request.query_params.get("booking")
        seller = self.request.query_params.get("seller")
        payment_status = self.request.query_params.get("status")

        if booking:
            queryset = queryset.filter(booking_id=booking)

        if seller:
            queryset = queryset.filter(seller_id=seller)

        if payment_status:
            queryset = queryset.filter(status=payment_status)

        return queryset


class SellerCommissionViewSet(TicketingPrivateViewSet):
    serializer_class = SellerCommissionSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return SellerCommission.objects.none()

        queryset = SellerCommission.objects.filter(
            organisation=organisation,
        ).select_related("seller", "booking", "paid_by")

        if not self.is_admin_user():
            seller_profile = self.get_current_seller()

            if not seller_profile or not seller_profile.can_view_own_commissions:
                return SellerCommission.objects.none()

            queryset = queryset.filter(seller=seller_profile)

        seller = self.request.query_params.get("seller")
        commission_status = self.request.query_params.get("status")

        if seller:
            queryset = queryset.filter(seller_id=seller)

        if commission_status:
            queryset = queryset.filter(status=commission_status)

        return queryset

    @action(detail=True, methods=["post"], url_path="mark-paid")
    def mark_paid(self, request, pk=None):
        commission = self.get_object()
        commission = booking_finance.mark_commission_paid(
            commission,
            paid_by=request.user,
        )

        serializer = self.get_serializer(commission)
        return Response(serializer.data)


class ReceiptViewSet(TicketingPrivateViewSet):
    serializer_class = ReceiptSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return Receipt.objects.none()

        queryset = Receipt.objects.filter(
            booking__organisation=organisation,
        ).select_related("booking")

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return Receipt.objects.none()

            queryset = queryset.filter(booking__seller=seller)

        return queryset

    @action(detail=True, methods=["post"], url_path="mark-email-sent")
    def mark_email_sent(self, request, pk=None):
        receipt = self.get_object()
        receipt.sent_by_email = True
        receipt.email_sent_at = timezone.now()
        receipt.save(update_fields=["sent_by_email", "email_sent_at"])

        serializer = self.get_serializer(receipt)
        return Response(serializer.data)

    @action(detail=True, methods=["post"], url_path="mark-whatsapp-sent")
    def mark_whatsapp_sent(self, request, pk=None):
        receipt = self.get_object()
        receipt.sent_by_whatsapp = True
        receipt.whatsapp_sent_at = timezone.now()
        receipt.save(update_fields=["sent_by_whatsapp", "whatsapp_sent_at"])

        serializer = self.get_serializer(receipt)
        return Response(serializer.data)


class NotificationLogViewSet(TicketingPrivateViewSet):
    serializer_class = NotificationLogSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return NotificationLog.objects.none()

        queryset = NotificationLog.objects.filter(
            organisation=organisation,
        ).select_related("booking")

        if not self.is_admin_user():
            seller = self.get_current_seller()

            if not seller:
                return NotificationLog.objects.none()

            queryset = queryset.filter(booking__seller=seller)

        booking = self.request.query_params.get("booking")
        channel = self.request.query_params.get("channel")
        log_status = self.request.query_params.get("status")

        if booking:
            queryset = queryset.filter(booking_id=booking)

        if channel:
            queryset = queryset.filter(channel=channel)

        if log_status:
            queryset = queryset.filter(status=log_status)

        return queryset


class ExternalProviderConfigViewSet(TicketingPrivateViewSet):
    serializer_class = ExternalProviderConfigSerializer
    permission_classes = [CanManageTicketingIntegrations]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExternalProviderConfig.objects.none()

        return ExternalProviderConfig.objects.filter(organisation=organisation)

    @action(detail=False, methods=["get", "patch"], url_path="wellet-settings")
    def wellet_settings(self, request):
        organisation = self.require_organisation()

        settings_obj, created = TicketingSettings.objects.get_or_create(
            organisation=organisation,
        )

        if not settings_obj.wellet_enabled:
            return Response(
                {
                    "detail": "Wellet / Coco Bongo is not enabled for this organisation."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        config, created = ExternalProviderConfig.objects.get_or_create(
            organisation=organisation,
            provider="wellet",
            defaults={
                "currency": settings_obj.default_currency or "USD",
                "lang": "en",
            },
        )

        if request.method == "PATCH":
            serializer = self.get_serializer(
                config,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(config)
        return Response(serializer.data)


class TicketingPaymentProviderSettingsViewSet(TicketingPrivateViewSet):
    serializer_class = TicketingPaymentProviderSettingsSerializer
    permission_classes = [CanManageTicketingIntegrations]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TicketingPaymentProviderSettings.objects.none()

        return TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
        )

    @action(detail=False, methods=["get", "patch"], url_path="mine")
    def mine(self, request):
        organisation = self.require_organisation()

        provider_settings, created = TicketingPaymentProviderSettings.objects.get_or_create(
            organisation=organisation,
        )

        if request.method == "PATCH":
            serializer = self.get_serializer(
                provider_settings,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(provider_settings)
        return Response(serializer.data)
    
class TicketingEmailSettingsViewSet(TicketingPrivateViewSet):
    serializer_class = TicketingEmailSettingsSerializer
    permission_classes = [CanManageTicketingIntegrations]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return TicketingEmailSettings.objects.none()

        return TicketingEmailSettings.objects.filter(organisation=organisation)

    def get_email_settings(self):
        organisation = self.require_organisation()

        email_settings, created = TicketingEmailSettings.objects.get_or_create(
            organisation=organisation,
            defaults={
                "provider": "google_oauth",
            },
        )

        return email_settings

    def build_email_settings_redirect_url(
        self,
        organisation_slug,
        status_value,
        error_message=None,
    ):
        frontend_url = getattr(
            settings,
            "FRONTEND_APP_URL",
            "https://app.puntacanadiscovery.com",
        ).rstrip("/")

        redirect_url = (
            f"{frontend_url}/ticketing/{organisation_slug}/settings"
            f"?google_email={status_value}"
        )

        if error_message:
            from urllib.parse import quote

            redirect_url += f"&error={quote(str(error_message))}"

        return redirect_url

    @action(detail=False, methods=["get", "patch"], url_path="mine")
    def mine(self, request):
        email_settings = self.get_email_settings()

        if request.method == "PATCH":
            serializer = self.get_serializer(
                email_settings,
                data=request.data,
                partial=True,
            )
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data)

        serializer = self.get_serializer(email_settings)
        return Response(serializer.data)

    @action(detail=False, methods=["post"], url_path="google/connect")
    def google_connect(self, request):
        organisation = self.require_organisation()

        email_settings = self.get_email_settings()
        email_settings.provider = "google_oauth"
        email_settings.save(update_fields=["provider", "updated_at"])

        state = f"{organisation.slug}:{secrets.token_urlsafe(32)}"

        authorization_url, returned_state = build_google_authorization_url(state)

        return Response(
            {
                "authorization_url": authorization_url,
                "state": returned_state,
            }
        )

    @action(
        detail=False,
        methods=["get"],
        url_path="google/callback",
        permission_classes=[permissions.AllowAny],
    )
    def google_callback(self, request):
        code = request.query_params.get("code")
        state = request.query_params.get("state", "")

        organisation_slug = ""

        try:
            organisation_slug = state.split(":", 1)[0] if state else ""

            if not organisation_slug:
                return redirect(
                    self.build_email_settings_redirect_url(
                        "punta-cana-discovery",
                        "failed",
                        "Missing OAuth state.",
                    )
                )

            if not code:
                return redirect(
                    self.build_email_settings_redirect_url(
                        organisation_slug,
                        "failed",
                        "Missing Google authorization code.",
                    )
                )

            organisation = get_object_or_404(Organisation, slug=organisation_slug)

            email_settings, created = TicketingEmailSettings.objects.get_or_create(
                organisation=organisation,
                defaults={
                    "provider": "google_oauth",
                },
            )

            credentials = exchange_google_code_for_credentials(code, state=state)
            store_google_credentials(email_settings, credentials)

            return redirect(
                self.build_email_settings_redirect_url(
                    organisation.slug,
                    "connected",
                )
            )

        except Exception as exc:
            logger.exception("Google email OAuth callback failed.")

            safe_slug = organisation_slug or "punta-cana-discovery"

            return redirect(
                self.build_email_settings_redirect_url(
                    safe_slug,
                    "failed",
                    str(exc),
                )
            )

    @action(detail=False, methods=["post"], url_path="google/disconnect")
    def google_disconnect(self, request):
        email_settings = self.get_email_settings()
        disconnect_google(email_settings)

        return Response(
            {
                "ok": True,
                "detail": "Google email disconnected.",
                "email_settings": self.get_serializer(email_settings).data,
            }
        )

    @action(detail=False, methods=["get"], url_path="google/status")
    def google_status(self, request):
        email_settings = self.get_email_settings()

        return Response(
            {
                "provider": email_settings.provider,
                "oauth_connected": email_settings.oauth_connected,
                "oauth_provider_account": email_settings.oauth_provider_account,
                "connection_status": email_settings.connection_status,
                "email_settings": self.get_serializer(email_settings).data,
            }
        )

    @action(detail=False, methods=["post"], url_path="test")
    def test(self, request):
        organisation = self.require_organisation()
        email_settings = self.get_email_settings()

        serializer = self.get_serializer(
            email_settings,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        email_settings = serializer.save()

        test_recipient = (
            request.data.get("test_recipient")
            or email_settings.sender_email
            or email_settings.oauth_provider_account
            or email_settings.smtp_username
        )

        if not test_recipient:
            return Response(
                {"detail": "Enter a test recipient email."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not email_settings.has_credentials:
            email_settings.connection_status = "failed"
            email_settings.last_test_email = test_recipient
            email_settings.last_test_at = timezone.now()
            email_settings.last_error_message = "Email settings are incomplete."
            email_settings.save(
                update_fields=[
                    "connection_status",
                    "last_test_email",
                    "last_test_at",
                    "last_error_message",
                    "updated_at",
                ]
            )

            return Response(
                {
                    "detail": "Email settings are incomplete.",
                    "email_settings": self.get_serializer(email_settings).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            if email_settings.provider == "google_oauth":
                subject = test_email_subject(organisation)
                body = test_email_body(organisation)

                send_response = send_gmail_email(
                    email_settings=email_settings,
                    to_email=test_recipient,
                    subject=subject,
                    body=body,
                )

                provider_response = {
                    "type": "test_email",
                    "provider": email_settings.provider,
                    "gmail_response": send_response,
                }

            else:
                connection = get_email_connection(email_settings)

                message = EmailMessage(
                    subject=test_email_subject(organisation),
                    body=test_email_body(organisation),
                    from_email=email_settings.from_email,
                    to=[test_recipient],
                    reply_to=[email_settings.reply_to_email]
                    if email_settings.reply_to_email
                    else None,
                    connection=connection,
                )
                message.send(fail_silently=False)

                provider_response = {
                    "type": "test_email",
                    "provider": email_settings.provider,
                }

                subject = message.subject
                body = message.body

            email_settings.connection_status = "connected"
            email_settings.last_test_email = test_recipient
            email_settings.last_test_at = timezone.now()
            email_settings.last_error_message = ""
            email_settings.save(
                update_fields=[
                    "connection_status",
                    "last_test_email",
                    "last_test_at",
                    "last_error_message",
                    "updated_at",
                ]
            )

            NotificationLog.objects.create(
                organisation=organisation,
                channel="email",
                recipient=test_recipient,
                subject=subject,
                message=body,
                status="sent",
                provider_response=provider_response,
                sent_at=timezone.now(),
            )

            return Response(
                {
                    "ok": True,
                    "detail": f"Test email sent to {test_recipient}.",
                    "email_settings": self.get_serializer(email_settings).data,
                }
            )

        except Exception as exc:
            email_settings.connection_status = "failed"
            email_settings.last_test_email = test_recipient
            email_settings.last_test_at = timezone.now()
            email_settings.last_error_message = str(exc)
            email_settings.save(
                update_fields=[
                    "connection_status",
                    "last_test_email",
                    "last_test_at",
                    "last_error_message",
                    "updated_at",
                ]
            )

            NotificationLog.objects.create(
                organisation=organisation,
                channel="email",
                recipient=test_recipient,
                subject=test_email_subject(organisation),
                message="Test email failed.",
                status="failed",
                provider_response={
                    "type": "test_email",
                    "provider": email_settings.provider,
                    "error": str(exc),
                },
            )

            return Response(
                {
                    "ok": False,
                    "detail": str(exc),
                    "email_settings": self.get_serializer(email_settings).data,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

class ExternalProviderProductSnapshotViewSet(TicketingPrivateViewSet):
    serializer_class = ExternalProviderProductSnapshotSerializer
    permission_classes = [CanManageTicketingIntegrations]

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExternalProviderProductSnapshot.objects.none()

        queryset = ExternalProviderProductSnapshot.objects.filter(
            organisation=organisation,
        ).select_related("product")

        provider = self.request.query_params.get("provider")
        service_date = self.request.query_params.get("service_date")

        if provider:
            queryset = queryset.filter(provider=provider)

        if service_date:
            queryset = queryset.filter(service_date=service_date)

        return queryset


class ProductReviewViewSet(TicketingPrivateViewSet):
    serializer_class = ProductReviewSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ProductReview.objects.none()

        queryset = ProductReview.objects.filter(
            organisation=organisation,
        ).select_related("product", "customer")

        product = self.request.query_params.get("product")
        is_approved = self.request.query_params.get("is_approved")

        if product:
            queryset = queryset.filter(product_id=product)

        if is_approved in ["true", "false"]:
            queryset = queryset.filter(is_approved=is_approved == "true")

        return queryset

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        serializer.save(organisation=organisation)



# ==========================================================
# Seller-only API
# ==========================================================
#
# These endpoints intentionally do NOT reuse owner/admin endpoints.
# They are designed for the seller portal only:
#
#   /api/ticketing/seller/products/
#   /api/ticketing/seller/bookings/
#   /api/ticketing/seller/payments/
#   /api/ticketing/seller/commissions/
#   /api/ticketing/seller/dashboard/
#
# API access permissions still live in ticketing.permissions.
# Finance/payment business rules live in ticketing.finance.permissions.
# ==========================================================


class SellerOnlyMixin(TicketingOrganisationMixin):
    permission_classes = [CanAccessSellerDashboard]

    def require_seller(self):
        organisation = self.require_organisation()
        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return None

        return seller

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def seller_not_found_response(self):
        return Response(
            {"detail": "No active seller profile found for this user."},
            status=status.HTTP_404_NOT_FOUND,
        )


class SellerProductsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only products endpoint.

    Sellers only see products:
    - in their organisation
    - active
    - seller_enabled
    - matching their seller permissions/product types
    """

    serializer_class = ExperienceProductSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExperienceProduct.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return ExperienceProduct.objects.none()

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        if not allowed_product_types:
            return ExperienceProduct.objects.none()

        queryset = (
            ExperienceProduct.objects
            .filter(
                organisation=organisation,
                seller_enabled=True,
                is_active=True,
                status="active",
                product_type__in=allowed_product_types,
            )
            .select_related("organisation", "category", "created_by")
            .prefetch_related(
                "gallery_images",
                "packages",
                "availability",
                "pickup_schedules",
                "pickup_schedules__pickup_location",
                "transfer_routes",
                "event_ticket_types",
            )
        )

        if not seller.can_sell_cocobongo:
            queryset = queryset.exclude(is_cocobongo_product=True)

        product_type = self.request.query_params.get("product_type")
        search = self.request.query_params.get("search")

        if product_type:
            queryset = queryset.filter(product_type=product_type)

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(short_description__icontains=search)
                | Q(location__icontains=search)
                | Q(keywords_tags__icontains=search)
            )

        return queryset.distinct()

class SellerBookingsViewSet(SellerOnlyMixin, viewsets.ModelViewSet):
    serializer_class = BookingSerializer

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return Booking.objects.none()

        seller = get_user_seller(self.request.user, organisation)
        if not seller or not seller.is_active:
            return Booking.objects.none()

        if self.action == "list" and not seller.can_view_own_sales:
            return Booking.objects.none()

        queryset = Booking.objects.filter(
            organisation=organisation,
            seller=seller,
        ).select_related(
            "organisation",
            "customer",
            "seller",
            "primary_product",
            "created_by",
            "supervisor_approved_by",
        ).prefetch_related(
            "items",
            "payments",
            "commissions",
            "notification_logs",
        )

        status_filter = self.request.query_params.get("status")
        payment_status = self.request.query_params.get("payment_status")
        settlement_status = self.request.query_params.get("settlement_status")
        product = self.request.query_params.get("product")
        service_date = self.request.query_params.get("service_date")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        search = self.request.query_params.get("search")
        owed_only = str(self.request.query_params.get("owed_only") or "").lower()
        unsettled_only = str(self.request.query_params.get("unsettled_only") or "").lower()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)

        if settlement_status:
            queryset = queryset.filter(settlement_status=settlement_status)

        if owed_only in ["true", "1", "yes"]:
            queryset = queryset.filter(seller_due_to_company__gt=Decimal("0.00"))

        if unsettled_only in ["true", "1", "yes"]:
            queryset = queryset.exclude(settlement_status="settled")

        if product:
            queryset = queryset.filter(
                Q(primary_product_id=product) | Q(items__product_id=product)
            ).distinct()

        if service_date:
            queryset = queryset.filter(service_date=service_date)

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        if search:
            queryset = queryset.filter(
                Q(booking_code__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_whatsapp__icontains=search)
                | Q(customer_email__icontains=search)
                | Q(customer_hotel__icontains=search)
                | Q(primary_product__name__icontains=search)
            )

        return queryset.distinct()

    def get_seller_booking_or_404(self, pk):
        organisation = self.require_organisation()
        seller = self.require_seller()

        if not seller:
            return None, None

        booking = get_object_or_404(
            Booking.objects.select_related(
                "organisation",
                "customer",
                "seller",
                "primary_product",
                "created_by",
                "supervisor_approved_by",
            ).prefetch_related(
                "items",
                "payments",
                "commissions",
                "notification_logs",
            ),
            pk=pk,
            organisation=organisation,
            seller=seller,
        )

        return seller, booking

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        seller = self.require_seller()

        if not seller:
            raise ValueError("No active seller profile found for this user.")

        if not seller.can_create_bookings:
            raise PermissionDenied("You do not have permission to create bookings.")

        booking = serializer.save(
            organisation=organisation,
            seller=seller,
            source="seller_dashboard",
            created_by=self.request.user,
        )

        booking.seller = seller
        booking.organisation = organisation
        booking.created_by = self.request.user
        booking.source = "seller_dashboard"
        booking.save(
            update_fields=[
                "seller",
                "organisation",
                "created_by",
                "source",
                "updated_at",
            ]
        )

        booking_finance.recalculate_booking_payment_totals(booking)
        booking_finance.sync_seller_commission_for_booking(booking)

    @action(detail=True, methods=["post"], url_path="add-payment")
    def add_payment(self, request, pk=None):
        seller, booking = self.get_seller_booking_or_404(pk)

        if not seller:
            return self.seller_not_found_response()

        amount = request.data.get("amount")
        payment_type = request.data.get("payment_type", "partial")
        payer_type = request.data.get("payer_type", "customer")
        method = request.data.get("method", "cash")
        payment_status_value = request.data.get("status", "confirmed")
        reference = request.data.get("reference", "")
        note = request.data.get("note", "")
        provider = request.data.get("provider", "")
        collected_by_party = (
            request.data.get("collected_by_party")
            or request.data.get("payment_receiver")
            or request.data.get("receiver")
            or None
        )

        if amount in [None, ""]:
            return Response(
                {"amount": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ticketing.finance.permissions import validate_payment_permission

        permission_error = validate_payment_permission(
            seller=seller,
            payment_type=payment_type,
            method=method,
            payer_type=payer_type,
        )

        if permission_error:
            return Response(
                {"detail": permission_error},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment, booking = booking_finance.record_payment(
                booking=booking,
                seller=seller,
                collected_by=request.user,
                amount=amount,
                payment_type=payment_type,
                payer_type=payer_type,
                method=method,
                status=payment_status_value,
                provider=provider,
                reference=reference,
                note=note,
                collected_by_party=collected_by_party,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status == "confirmed" and booking.payment_status in ["paid", "deposit_paid"]:
            try:
                BookingNotificationService.payment_confirmed(booking)
            except Exception:
                logger.exception(
                    "Failed sending payment confirmation notifications for booking %s",
                    booking.booking_code,
                )

        return Response(
            {
                "payment": BookingPaymentSerializer(
                    payment,
                    context=self.get_serializer_context(),
                ).data,
                "booking": self.get_serializer(booking).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-ticket-generated")
    def mark_ticket_generated(self, request, pk=None):
        seller, booking = self.get_seller_booking_or_404(pk)

        if not seller:
            return self.seller_not_found_response()

        if not seller.can_generate_ticket_without_customer_online_payment:
            return Response(
                {"detail": "You do not have permission to generate tickets without online payment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking.status = "ticket_generated"
        booking.save(update_fields=["status", "updated_at"])

        booking = booking_finance.recalculate_booking_payment_totals(booking)
        booking_finance.sync_seller_commission_for_booking(booking)

        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        seller, booking = self.get_seller_booking_or_404(pk)

        if not seller:
            return self.seller_not_found_response()

        if not seller.can_cancel_bookings:
            return Response(
                {"detail": "You do not have permission to cancel bookings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking.status = "cancelled"
        booking.cancelled_at = timezone.now()
        booking.cancellation_reason = request.data.get("reason", "")
        booking.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancellation_reason",
                "updated_at",
            ]
        )

        booking_finance.recalculate_booking_payment_totals(booking)
        booking_finance.sync_seller_commission_for_booking(booking)

        return Response(self.get_serializer(booking).data)
    
class SellerPaymentsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only payments endpoint.

    Sellers only see payments connected to their own bookings.
    """

    serializer_class = BookingPaymentSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return BookingPayment.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return BookingPayment.objects.none()

        queryset = (
            BookingPayment.objects
            .filter(
                booking__organisation=organisation,
                booking__seller=seller,
            )
            .select_related("booking", "seller", "collected_by")
        )

        booking = self.request.query_params.get("booking")
        payment_status = self.request.query_params.get("status")
        payment_type = self.request.query_params.get("payment_type")
        collected_by_party = self.request.query_params.get("collected_by_party")

        if booking:
            queryset = queryset.filter(booking_id=booking)

        if payment_status:
            queryset = queryset.filter(status=payment_status)

        if payment_type:
            queryset = queryset.filter(payment_type=payment_type)

        if collected_by_party:
            queryset = queryset.filter(collected_by_party=collected_by_party)

        return queryset.distinct()


class SellerCommissionsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only commissions endpoint.

    Sellers only see their own commission rows.
    """

    serializer_class = SellerCommissionSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return SellerCommission.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active or not seller.can_view_own_commissions:
            return SellerCommission.objects.none()

        queryset = (
            SellerCommission.objects
            .filter(
                organisation=organisation,
                seller=seller,
            )
            .select_related("seller", "booking", "paid_by")
        )

        commission_status = self.request.query_params.get("status")
        booking = self.request.query_params.get("booking")

        if commission_status:
            queryset = queryset.filter(status=commission_status)

        if booking:
            queryset = queryset.filter(booking_id=booking)

        return queryset.order_by("-created_at")


class SellerDashboardView(APIView, TicketingOrganisationMixin):
    """
    Seller-only dashboard endpoint.

    This endpoint returns one seller's data only.
    """

    permission_classes = [CanAccessSellerDashboard]

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def get(self, request):
        organisation = self.require_organisation()
        seller = get_user_seller(request.user, organisation)

        if not seller or not seller.is_active:
            return Response(
                {"detail": "No active seller profile found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()
        week_start = today - timezone.timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        bookings = (
            Booking.objects
            .filter(
                organisation=organisation,
                seller=seller,
            )
            .exclude(status__in=["cancelled", "refunded", "no_show"])
        )

        today_bookings = bookings.filter(created_at__date=today)
        week_bookings = bookings.filter(created_at__date__gte=week_start)
        month_bookings = bookings.filter(created_at__date__gte=month_start)

        finance_summary = booking_finance.seller_finance_summary(seller)

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        available_products = ExperienceProduct.objects.filter(
            organisation=organisation,
            seller_enabled=True,
            is_active=True,
            status="active",
            product_type__in=allowed_product_types,
        )

        if not seller.can_sell_cocobongo:
            available_products = available_products.exclude(is_cocobongo_product=True)

        recent_bookings = (
            bookings
            .select_related("customer", "primary_product", "seller")
            .order_by("-created_at")[:10]
        )

        commissions = SellerCommission.objects.filter(
            organisation=organisation,
            seller=seller,
        )

        return Response(
            {
                "seller": SellerSerializer(
                    seller,
                    context={"request": request, "organisation": organisation},
                ).data,
                "permissions": SellerSerializer(
                    seller,
                    context={"request": request, "organisation": organisation},
                ).data.get("permissions", {}),
                "summary": {
                    "today_bookings": today_bookings.count(),
                    "week_bookings": week_bookings.count(),
                    "month_bookings": month_bookings.count(),
                    "total_bookings": bookings.count(),

                    "today_sales": today_bookings.aggregate(
                        total=Sum("total_amount")
                    )["total"] or Decimal("0.00"),

                    "today_deposits": today_bookings.aggregate(
                        total=Sum("deposit_paid")
                    )["total"] or Decimal("0.00"),

                    "money_collected": finance_summary.get("seller_collected", Decimal("0.00")),
                    "money_owed_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
                    "outstanding_balance": finance_summary.get("balance_due", Decimal("0.00")),

                    "pending_payments": bookings.filter(
                        payment_status__in=["unpaid", "pending", "partially_paid", "partial"]
                    ).count(),

                    "confirmed_bookings": bookings.filter(status="confirmed").count(),
                    "tickets_generated": bookings.filter(status="ticket_generated").count(),

                    "commission_today": commissions.filter(
                        created_at__date=today
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_week": commissions.filter(
                        created_at__date__gte=week_start
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_month": commissions.filter(
                        created_at__date__gte=month_start
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_pending": finance_summary.get("commission_pending", Decimal("0.00")),
                    "commission_paid": finance_summary.get("commission_paid", Decimal("0.00")),
                    "commission_lifetime": finance_summary.get("commission_total", Decimal("0.00")),

                    # New finance summary fields.
                    "gross_sales": finance_summary.get("gross_sales", Decimal("0.00")),
                    "customer_revenue": finance_summary.get("customer_revenue", Decimal("0.00")),
                    "customer_discounts": finance_summary.get("customer_discounts", Decimal("0.00")),
                    "seller_commissions": finance_summary.get("seller_commissions", Decimal("0.00")),
                    "owner_net": finance_summary.get("owner_net", Decimal("0.00")),
                    "owner_received": finance_summary.get("owner_received", Decimal("0.00")),
                    "owner_pending": finance_summary.get("owner_pending", Decimal("0.00")),
                    "seller_collected": finance_summary.get("seller_collected", Decimal("0.00")),
                    "seller_due_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
                    "balance_due": finance_summary.get("balance_due", Decimal("0.00")),
                },
                "recent_bookings": BookingSerializer(
                    recent_bookings,
                    many=True,
                    context={"request": request, "organisation": organisation},
                ).data,
                "available_products": ExperienceProductSerializer(
                    available_products[:12],
                    many=True,
                    context={"request": request, "organisation": organisation},
                ).data,
            }
        )

class SellerDashboardAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [CanAccessSellerDashboard]

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def get(self, request):
        organisation = self.require_organisation()
        seller = self.get_current_seller()

        if not seller and not self.is_admin_user():
            return Response(
                {"detail": "No active seller profile found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()
        week_start = today - timezone.timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        bookings = Booking.objects.filter(
            organisation=organisation,
            seller=seller,
        ).exclude(status__in=["cancelled", "refunded", "no_show"])

        today_bookings = bookings.filter(created_at__date=today)
        week_bookings = bookings.filter(created_at__date__gte=week_start)
        month_bookings = bookings.filter(created_at__date__gte=month_start)

        finance_summary = booking_finance.seller_finance_summary(seller)

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        available_products = ExperienceProduct.objects.filter(
            organisation=organisation,
            seller_enabled=True,
            is_active=True,
            status="active",
            product_type__in=allowed_product_types,
        )

        if not seller.can_sell_cocobongo:
            available_products = available_products.exclude(is_cocobongo_product=True)

        recent_bookings = bookings.select_related(
            "customer",
            "primary_product",
        ).order_by("-created_at")[:10]

        summary = {
            **finance_summary,
            "today_bookings": today_bookings.count(),
            "week_bookings": week_bookings.count(),
            "month_bookings": month_bookings.count(),
            "total_bookings": bookings.count(),
            "today_sales": today_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),
            "today_deposits": today_bookings.aggregate(total=Sum("deposit_paid"))["total"] or Decimal("0.00"),
            "week_sales": week_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),
            "month_sales": month_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),

            # Backwards-compatible frontend keys.
            "money_collected": finance_summary.get("seller_collected", Decimal("0.00")),
            "money_owed_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
            "outstanding_balance": finance_summary.get("balance_due", Decimal("0.00")),
            "commission_pending": finance_summary.get("commission_pending", Decimal("0.00")),
            "commission_paid": finance_summary.get("commission_paid", Decimal("0.00")),
            "commission_lifetime": finance_summary.get("commission_total", Decimal("0.00")),
        }

        return Response(
            {
                "seller": SellerSerializer(
                    seller,
                    context=self.get_serializer_context(),
                ).data,
                "summary": summary,
                "recent_bookings": BookingSerializer(
                    recent_bookings,
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
                "available_products": ExperienceProductSerializer(
                    available_products[:20],
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
                "permissions": seller.get_permissions_dict(),
            }
        )


class TicketingDashboardAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [CanViewTicketingReports]

    def get(self, request):
        organisation = self.require_organisation()

        today = timezone.localdate()

        bookings = Booking.objects.filter(organisation=organisation)
        today_bookings = bookings.filter(created_at__date=today)
        upcoming_bookings = bookings.filter(
            service_date__gte=today,
        ).exclude(status__in=["cancelled", "refunded", "no_show"])

        finance_summary = booking_finance.owner_finance_summary(organisation)

        top_products = (
            BookingItem.objects
            .filter(booking__organisation=organisation)
            .values("product_name", "product_type")
            .annotate(
                quantity_sold=Sum("quantity"),
                revenue=Sum("total"),
            )
            .order_by("-quantity_sold")[:10]
        )

        top_sellers = booking_finance.seller_leaderboard(organisation, limit=10)

        summary = {
            **finance_summary,
            "total_bookings": bookings.count(),
            "today_bookings": today_bookings.count(),
            "upcoming_bookings": upcoming_bookings.count(),
            "pending_approvals": bookings.filter(requires_supervisor_approval=True).count(),
            "confirmed_bookings": bookings.filter(status="confirmed").count(),
            "cancelled_bookings": bookings.filter(status="cancelled").count(),

            # Backwards-compatible frontend keys.
            "total_sales": finance_summary.get("customer_revenue", Decimal("0.00")),
            "deposit_paid": finance_summary.get("deposit_paid", Decimal("0.00")),
            "balance_due": finance_summary.get("balance_due", Decimal("0.00")),
            "seller_due_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
            "commission_generated": finance_summary.get("seller_commissions", Decimal("0.00")),
            "commission_paid": finance_summary.get("commission_paid", Decimal("0.00")),
            "commission_pending": finance_summary.get("commission_pending", Decimal("0.00")),
        }

        return Response(
            {
                "summary": summary,
                "top_products": list(top_products),
                "top_sellers": top_sellers,
            }
        )


class TicketingReportsAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [CanViewTicketingReports]

    def get(self, request):
        organisation = self.require_organisation()

        date_from = request.query_params.get("date_from")
        date_to = request.query_params.get("date_to")

        bookings = Booking.objects.filter(organisation=organisation)

        if date_from:
            bookings = bookings.filter(created_at__date__gte=date_from)

        if date_to:
            bookings = bookings.filter(created_at__date__lte=date_to)

        sales_by_seller = (
            bookings
            .values("seller__id", "seller__full_name")
            .annotate(
                bookings_count=Count("id"),
                gross_sales=Sum("original_price"),
                customer_revenue=Sum("total_amount"),
                owner_net=Sum("owner_net_amount"),
                owner_received=Sum("owner_received_amount"),
                collected=Sum("seller_collected_amount"),
                due_to_company=Sum("seller_due_to_company"),
                commission=Sum("seller_commission_amount"),
                commission_paid=Sum("commission_paid_amount"),
            )
            .order_by("-customer_revenue")
        )

        sales_by_product = (
            BookingItem.objects
            .filter(booking__in=bookings)
            .values("product__id", "product_name", "product_type")
            .annotate(
                quantity_sold=Sum("quantity"),
                revenue=Sum("total"),
            )
            .order_by("-revenue")
        )

        payment_statuses = (
            bookings
            .values("payment_status")
            .annotate(count=Count("id"), total=Sum("total_amount"))
            .order_by("payment_status")
        )

        settlement_statuses = (
            bookings
            .values("settlement_status")
            .annotate(count=Count("id"), owner_net=Sum("owner_net_amount"), owner_received=Sum("owner_received_amount"), due_to_company=Sum("seller_due_to_company"))
            .order_by("settlement_status")
        )

        booking_statuses = (
            bookings
            .values("status")
            .annotate(count=Count("id"), total=Sum("total_amount"))
            .order_by("status")
        )

        return Response(
            {
                "finance_summary": booking_finance.owner_finance_summary(organisation),
                "sales_by_seller": list(sales_by_seller),
                "sales_by_product": list(sales_by_product),
                "payment_statuses": list(payment_statuses),
                "settlement_statuses": list(settlement_statuses),
                "booking_statuses": list(booking_statuses),
            }
        )



# ==========================================================
# Seller-only API
# ==========================================================
#
# These endpoints intentionally do NOT reuse owner/admin endpoints.
# They are designed for the seller portal only:
#
#   /api/ticketing/seller/products/
#   /api/ticketing/seller/bookings/
#   /api/ticketing/seller/payments/
#   /api/ticketing/seller/commissions/
#   /api/ticketing/seller/dashboard/
#
# API access permissions still live in ticketing.permissions.
# Finance/payment business rules live in ticketing.finance.permissions.
# ==========================================================


class SellerOnlyMixin(TicketingOrganisationMixin):
    permission_classes = [CanAccessSellerDashboard]

    def require_seller(self):
        organisation = self.require_organisation()
        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return None

        return seller

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def seller_not_found_response(self):
        return Response(
            {"detail": "No active seller profile found for this user."},
            status=status.HTTP_404_NOT_FOUND,
        )


class SellerProductsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only products endpoint.

    Sellers only see products:
    - in their organisation
    - active
    - seller_enabled
    - matching their seller permissions/product types
    """

    serializer_class = ExperienceProductSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return ExperienceProduct.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return ExperienceProduct.objects.none()

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        if not allowed_product_types:
            return ExperienceProduct.objects.none()

        queryset = (
            ExperienceProduct.objects
            .filter(
                organisation=organisation,
                seller_enabled=True,
                is_active=True,
                status="active",
                product_type__in=allowed_product_types,
            )
            .select_related("organisation", "category", "created_by")
            .prefetch_related(
                "gallery_images",
                "packages",
                "availability",
                "pickup_schedules",
                "pickup_schedules__pickup_location",
                "transfer_routes",
                "event_ticket_types",
            )
        )

        if not seller.can_sell_cocobongo:
            queryset = queryset.exclude(is_cocobongo_product=True)

        product_type = self.request.query_params.get("product_type")
        search = self.request.query_params.get("search")

        if product_type:
            queryset = queryset.filter(product_type=product_type)

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(short_description__icontains=search)
                | Q(location__icontains=search)
                | Q(keywords_tags__icontains=search)
            )

        return queryset.distinct()


class SellerBookingsViewSet(SellerOnlyMixin, viewsets.ModelViewSet):
    """
    Seller-only bookings endpoint.

    Sellers can only see/create/update their own bookings.
    """

    serializer_class = BookingSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return Booking.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active or not seller.can_view_own_sales:
            return Booking.objects.none()

        queryset = (
            Booking.objects
            .filter(
                organisation=organisation,
                seller=seller,
            )
            .select_related(
                "organisation",
                "customer",
                "seller",
                "primary_product",
                "created_by",
                "supervisor_approved_by",
            )
            .prefetch_related(
                "items",
                "payments",
                "commissions",
                "notification_logs",
            )
        )

        status_filter = self.request.query_params.get("status")
        payment_status = self.request.query_params.get("payment_status")
        settlement_status = self.request.query_params.get("settlement_status")
        product = self.request.query_params.get("product")
        service_date = self.request.query_params.get("service_date")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")
        search = self.request.query_params.get("search")
        owed_only = str(self.request.query_params.get("owed_only") or "").lower()
        unsettled_only = str(self.request.query_params.get("unsettled_only") or "").lower()

        if status_filter:
            queryset = queryset.filter(status=status_filter)

        if payment_status:
            queryset = queryset.filter(payment_status=payment_status)

        if settlement_status:
            queryset = queryset.filter(settlement_status=settlement_status)

        if owed_only in ["true", "1", "yes"]:
            queryset = queryset.filter(seller_due_to_company__gt=Decimal("0.00"))

        if unsettled_only in ["true", "1", "yes"]:
            queryset = queryset.exclude(settlement_status="settled")

        if product:
            queryset = queryset.filter(
                Q(primary_product_id=product)
                | Q(items__product_id=product)
            ).distinct()

        if service_date:
            queryset = queryset.filter(service_date=service_date)

        if date_from:
            queryset = queryset.filter(created_at__date__gte=date_from)

        if date_to:
            queryset = queryset.filter(created_at__date__lte=date_to)

        if search:
            queryset = queryset.filter(
                Q(booking_code__icontains=search)
                | Q(customer_name__icontains=search)
                | Q(customer_whatsapp__icontains=search)
                | Q(customer_email__icontains=search)
                | Q(customer_hotel__icontains=search)
                | Q(primary_product__name__icontains=search)
            )

        return queryset.distinct()

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        seller = self.require_seller()

        if not seller:
            raise ValueError("No active seller profile found for this user.")

        booking = serializer.save(
            organisation=organisation,
            seller=seller,
            source="seller_dashboard",
            created_by=self.request.user,
        )

        booking_finance.recalculate_booking_payment_totals(booking)

    @action(detail=True, methods=["post"], url_path="add-payment")
    def add_payment(self, request, pk=None):
        booking = self.get_object()
        seller = self.require_seller()

        if not seller:
            return self.seller_not_found_response()

        amount = request.data.get("amount")
        payment_type = request.data.get("payment_type", "partial")
        payer_type = request.data.get("payer_type", "customer")
        method = request.data.get("method", "cash")
        payment_status_value = request.data.get("status", "confirmed")
        reference = request.data.get("reference", "")
        note = request.data.get("note", "")
        provider = request.data.get("provider", "")
        collected_by_party = (
            request.data.get("collected_by_party")
            or request.data.get("payment_receiver")
            or request.data.get("receiver")
            or None
        )

        if amount in [None, ""]:
            return Response(
                {"amount": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from ticketing.finance.permissions import validate_payment_permission

        permission_error = validate_payment_permission(
            seller=seller,
            payment_type=payment_type,
            method=method,
            payer_type=payer_type,
        )

        if permission_error:
            return Response(
                {"detail": permission_error},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            payment, booking = booking_finance.record_payment(
                booking=booking,
                seller=seller,
                collected_by=request.user,
                amount=amount,
                payment_type=payment_type,
                payer_type=payer_type,
                method=method,
                status=payment_status_value,
                provider=provider,
                reference=reference,
                note=note,
                collected_by_party=collected_by_party,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if payment.status == "confirmed" and booking.payment_status in ["paid", "deposit_paid"]:
            try:
                BookingNotificationService.payment_confirmed(booking)
            except Exception:
                logger.exception(
                    "Failed sending payment confirmation notifications for booking %s",
                    booking.booking_code,
                )

        return Response(
            {
                "payment": BookingPaymentSerializer(
                    payment,
                    context=self.get_serializer_context(),
                ).data,
                "booking": self.get_serializer(booking).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["post"], url_path="mark-ticket-generated")
    def mark_ticket_generated(self, request, pk=None):
        seller = self.require_seller()

        if not seller:
            return self.seller_not_found_response()

        if not seller.can_generate_ticket_without_customer_online_payment:
            return Response(
                {"detail": "You do not have permission to generate tickets without online payment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking = self.get_object()
        booking.status = "ticket_generated"
        booking.save(update_fields=["status", "updated_at"])

        booking = booking_finance.recalculate_booking_payment_totals(booking)

        return Response(self.get_serializer(booking).data)

    @action(detail=True, methods=["post"], url_path="cancel")
    def cancel(self, request, pk=None):
        seller = self.require_seller()

        if not seller:
            return self.seller_not_found_response()

        if not seller.can_cancel_bookings:
            return Response(
                {"detail": "You do not have permission to cancel bookings."},
                status=status.HTTP_403_FORBIDDEN,
            )

        booking = self.get_object()
        booking.status = "cancelled"
        booking.cancelled_at = timezone.now()
        booking.cancellation_reason = request.data.get("reason", "")
        booking.save(
            update_fields=[
                "status",
                "cancelled_at",
                "cancellation_reason",
                "updated_at",
            ]
        )

        booking_finance.recalculate_booking_payment_totals(booking)
        booking_finance.sync_seller_commission_for_booking(booking)

        return Response(self.get_serializer(booking).data)


class SellerPaymentsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only payments endpoint.

    Sellers only see payments connected to their own bookings.
    """

    serializer_class = BookingPaymentSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return BookingPayment.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active:
            return BookingPayment.objects.none()

        queryset = (
            BookingPayment.objects
            .filter(
                booking__organisation=organisation,
                booking__seller=seller,
            )
            .select_related("booking", "seller", "collected_by")
        )

        booking = self.request.query_params.get("booking")
        payment_status = self.request.query_params.get("status")
        payment_type = self.request.query_params.get("payment_type")
        collected_by_party = self.request.query_params.get("collected_by_party")

        if booking:
            queryset = queryset.filter(booking_id=booking)

        if payment_status:
            queryset = queryset.filter(status=payment_status)

        if payment_type:
            queryset = queryset.filter(payment_type=payment_type)

        if collected_by_party:
            queryset = queryset.filter(collected_by_party=collected_by_party)

        return queryset.distinct()


class SellerCommissionsViewSet(SellerOnlyMixin, viewsets.ReadOnlyModelViewSet):
    """
    Seller-only commissions endpoint.

    Sellers only see their own commission rows.
    """

    serializer_class = SellerCommissionSerializer

    def get_queryset(self):
        organisation = self.get_organisation()

        if not organisation:
            return SellerCommission.objects.none()

        seller = get_user_seller(self.request.user, organisation)

        if not seller or not seller.is_active or not seller.can_view_own_commissions:
            return SellerCommission.objects.none()

        queryset = (
            SellerCommission.objects
            .filter(
                organisation=organisation,
                seller=seller,
            )
            .select_related("seller", "booking", "paid_by")
        )

        commission_status = self.request.query_params.get("status")
        booking = self.request.query_params.get("booking")

        if commission_status:
            queryset = queryset.filter(status=commission_status)

        if booking:
            queryset = queryset.filter(booking_id=booking)

        return queryset.order_by("-created_at")


class SellerDashboardView(APIView, TicketingOrganisationMixin):
    """
    Seller-only dashboard endpoint.

    This endpoint returns one seller's data only.
    """

    permission_classes = [CanAccessSellerDashboard]

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def get(self, request):
        organisation = self.require_organisation()
        seller = get_user_seller(request.user, organisation)

        if not seller or not seller.is_active:
            return Response(
                {"detail": "No active seller profile found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()
        week_start = today - timezone.timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        bookings = (
            Booking.objects
            .filter(
                organisation=organisation,
                seller=seller,
            )
            .exclude(status__in=["cancelled", "refunded", "no_show"])
        )

        today_bookings = bookings.filter(created_at__date=today)
        week_bookings = bookings.filter(created_at__date__gte=week_start)
        month_bookings = bookings.filter(created_at__date__gte=month_start)

        finance_summary = booking_finance.seller_finance_summary(seller)

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        available_products = ExperienceProduct.objects.filter(
            organisation=organisation,
            seller_enabled=True,
            is_active=True,
            status="active",
            product_type__in=allowed_product_types,
        )

        if not seller.can_sell_cocobongo:
            available_products = available_products.exclude(is_cocobongo_product=True)

        recent_bookings = (
            bookings
            .select_related("customer", "primary_product", "seller")
            .order_by("-created_at")[:10]
        )

        commissions = SellerCommission.objects.filter(
            organisation=organisation,
            seller=seller,
        )

        return Response(
            {
                "seller": SellerSerializer(
                    seller,
                    context={"request": request, "organisation": organisation},
                ).data,
                "permissions": SellerSerializer(
                    seller,
                    context={"request": request, "organisation": organisation},
                ).data.get("permissions", {}),
                "summary": {
                    "today_bookings": today_bookings.count(),
                    "week_bookings": week_bookings.count(),
                    "month_bookings": month_bookings.count(),
                    "total_bookings": bookings.count(),

                    "today_sales": today_bookings.aggregate(
                        total=Sum("total_amount")
                    )["total"] or Decimal("0.00"),

                    "today_deposits": today_bookings.aggregate(
                        total=Sum("deposit_paid")
                    )["total"] or Decimal("0.00"),

                    "money_collected": finance_summary.get("seller_collected", Decimal("0.00")),
                    "money_owed_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
                    "outstanding_balance": finance_summary.get("balance_due", Decimal("0.00")),

                    "pending_payments": bookings.filter(
                        payment_status__in=["unpaid", "pending", "partially_paid", "partial"]
                    ).count(),

                    "confirmed_bookings": bookings.filter(status="confirmed").count(),
                    "tickets_generated": bookings.filter(status="ticket_generated").count(),

                    "commission_today": commissions.filter(
                        created_at__date=today
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_week": commissions.filter(
                        created_at__date__gte=week_start
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_month": commissions.filter(
                        created_at__date__gte=month_start
                    ).aggregate(total=Sum("amount"))["total"] or Decimal("0.00"),

                    "commission_pending": finance_summary.get("commission_pending", Decimal("0.00")),
                    "commission_paid": finance_summary.get("commission_paid", Decimal("0.00")),
                    "commission_lifetime": finance_summary.get("commission_total", Decimal("0.00")),

                    # New finance summary fields.
                    "gross_sales": finance_summary.get("gross_sales", Decimal("0.00")),
                    "customer_revenue": finance_summary.get("customer_revenue", Decimal("0.00")),
                    "customer_discounts": finance_summary.get("customer_discounts", Decimal("0.00")),
                    "seller_commissions": finance_summary.get("seller_commissions", Decimal("0.00")),
                    "owner_net": finance_summary.get("owner_net", Decimal("0.00")),
                    "owner_received": finance_summary.get("owner_received", Decimal("0.00")),
                    "owner_pending": finance_summary.get("owner_pending", Decimal("0.00")),
                    "seller_collected": finance_summary.get("seller_collected", Decimal("0.00")),
                    "seller_due_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
                    "balance_due": finance_summary.get("balance_due", Decimal("0.00")),
                },
                "recent_bookings": BookingSerializer(
                    recent_bookings,
                    many=True,
                    context={"request": request, "organisation": organisation},
                ).data,
                "available_products": ExperienceProductSerializer(
                    available_products[:12],
                    many=True,
                    context={"request": request, "organisation": organisation},
                ).data,
            }
        )

class SellerDashboardAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [CanAccessSellerDashboard]

    def get_allowed_seller_product_types(self, seller):
        allowed = []

        if seller.can_sell_excursions:
            allowed.append("excursion")

        if seller.can_sell_transfers:
            allowed.append("transfer")

        if seller.can_sell_events:
            allowed.append("event")

        if seller.can_sell_custom_tours:
            allowed.append("custom")

        if seller.can_sell_cocobongo:
            allowed.extend(["ticket", "nightlife"])

        return allowed

    def get(self, request):
        organisation = self.require_organisation()
        seller = self.get_current_seller()

        if not seller and not self.is_admin_user():
            return Response(
                {"detail": "No active seller profile found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        today = timezone.localdate()
        week_start = today - timezone.timedelta(days=today.weekday())
        month_start = today.replace(day=1)

        bookings = Booking.objects.filter(
            organisation=organisation,
            seller=seller,
        ).exclude(status__in=["cancelled", "refunded", "no_show"])

        today_bookings = bookings.filter(created_at__date=today)
        week_bookings = bookings.filter(created_at__date__gte=week_start)
        month_bookings = bookings.filter(created_at__date__gte=month_start)

        finance_summary = booking_finance.seller_finance_summary(seller)

        allowed_product_types = self.get_allowed_seller_product_types(seller)

        available_products = ExperienceProduct.objects.filter(
            organisation=organisation,
            seller_enabled=True,
            is_active=True,
            status="active",
            product_type__in=allowed_product_types,
        )

        if not seller.can_sell_cocobongo:
            available_products = available_products.exclude(is_cocobongo_product=True)

        recent_bookings = bookings.select_related(
            "customer",
            "primary_product",
        ).order_by("-created_at")[:10]

        summary = {
            **finance_summary,
            "today_bookings": today_bookings.count(),
            "week_bookings": week_bookings.count(),
            "month_bookings": month_bookings.count(),
            "total_bookings": bookings.count(),
            "today_sales": today_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),
            "today_deposits": today_bookings.aggregate(total=Sum("deposit_paid"))["total"] or Decimal("0.00"),
            "week_sales": week_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),
            "month_sales": month_bookings.aggregate(total=Sum("total_amount"))["total"] or Decimal("0.00"),

            # Backwards-compatible frontend keys.
            "money_collected": finance_summary.get("seller_collected", Decimal("0.00")),
            "money_owed_to_company": finance_summary.get("seller_due_to_company", Decimal("0.00")),
            "outstanding_balance": finance_summary.get("balance_due", Decimal("0.00")),
            "commission_pending": finance_summary.get("commission_pending", Decimal("0.00")),
            "commission_paid": finance_summary.get("commission_paid", Decimal("0.00")),
            "commission_lifetime": finance_summary.get("commission_total", Decimal("0.00")),
        }

        return Response(
            {
                "seller": SellerSerializer(
                    seller,
                    context=self.get_serializer_context(),
                ).data,
                "summary": summary,
                "recent_bookings": BookingSerializer(
                    recent_bookings,
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
                "available_products": ExperienceProductSerializer(
                    available_products[:20],
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
                "permissions": seller.get_permissions_dict(),
            }
        )


class PublicOrganisationMixin:
    permission_classes = [permissions.AllowAny]

    def clean_domain(self, domain):
        if not domain:
            return ""

        domain = domain.strip().lower()
        domain = domain.replace("https://", "").replace("http://", "")
        domain = domain.split("/")[0]
        domain = domain.split(":")[0]

        return domain

    def get_public_domain(self):
        return self.clean_domain(
            self.request.query_params.get("domain")
            or self.request.headers.get("X-Public-Domain")
            or ""
        )

    def get_public_site_by_domain(self, domain):
        domain = self.clean_domain(domain)

        if not domain:
            return None

        candidates = [domain]

        if domain.startswith("www."):
            candidates.append(domain[4:])
        else:
            candidates.append(f"www.{domain}")

        query = Q()

        for candidate in candidates:
            query |= Q(custom_domain__iexact=candidate)

        return (
            TicketingPublicSiteSettings.objects
            .select_related("organisation")
            .filter(
                query,
                organisation__is_active=True,
                is_published=True,
            )
            .first()
        )

    def get_public_organisation(self):
        organisation_slug = (
            self.kwargs.get("organisation_slug")
            or self.kwargs.get("slug")
            or self.request.query_params.get("organisation_slug")
            or self.request.query_params.get("slug")
        )

        if organisation_slug:
            return get_object_or_404(
                Organisation,
                slug=organisation_slug,
                is_active=True,
            )

        domain = self.get_public_domain()

        if domain:
            site_settings = self.get_public_site_by_domain(domain)

            if site_settings:
                return site_settings.organisation

        return None

    def get_public_site_settings(self, organisation):
        domain = self.get_public_domain()

        if domain:
            site_settings = self.get_public_site_by_domain(domain)

            if site_settings and site_settings.organisation_id == organisation.id:
                return site_settings

        return TicketingPublicSiteSettings.objects.filter(
            organisation=organisation,
            is_published=True,
        ).first()

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organisation"] = self.get_public_organisation()
        return context
    
class PublicBrandingAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        ticketing_settings, created = TicketingSettings.objects.get_or_create(
            organisation=organisation,
        )

        return Response(
            {
                "organisation": {
                    "id": organisation.id,
                    "name": organisation.name,
                    "slug": organisation.slug,
                    "email": organisation.email,
                    "phone": organisation.phone,
                },
                "ticketing_settings": TicketingSettingsSerializer(
                    ticketing_settings,
                    context={"request": request},
                ).data,
                "public_site": TicketingPublicSiteSettingsSerializer(
                    site_settings,
                    context={"request": request},
                ).data,
            }
        )


class PublicProductViewSet(PublicOrganisationMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = ExperienceProductSerializer
    lookup_field = "slug"
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        organisation = self.get_public_organisation()

        if not organisation:
            return ExperienceProduct.objects.none()

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return ExperienceProduct.objects.none()

        queryset = (
            ExperienceProduct.objects
            .filter(
                organisation=organisation,
                public_enabled=True,
                is_active=True,
                status="active",
            )
            .select_related("organisation", "category")
            .prefetch_related(
                "gallery_images",
                "packages",
                "availability",
                "pickup_schedules",
                "pickup_schedules__pickup_location",
                "transfer_routes",
                "event_ticket_types",
                "url_aliases",
            )
        )

        product_type = self.request.query_params.get("product_type")
        category = self.request.query_params.get("category")
        search = self.request.query_params.get("search")
        featured = self.request.query_params.get("featured")
        recommended = self.request.query_params.get("recommended")

        if product_type:
            queryset = queryset.filter(product_type=product_type)

        if category:
            queryset = queryset.filter(
                Q(category_id=category) | Q(category__slug=category)
            )

        if featured in ["true", "false"]:
            queryset = queryset.filter(is_featured=featured == "true")

        if recommended in ["true", "false"]:
            queryset = queryset.filter(is_recommended=recommended == "true")

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(short_description__icontains=search)
                | Q(long_description__icontains=search)
                | Q(location__icontains=search)
                | Q(keywords_tags__icontains=search)
            )

        return queryset

    def retrieve(self, request, *args, **kwargs):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        slug = kwargs.get(self.lookup_field) or kwargs.get("slug") or ""
        path = f"/product/{slug}"

        result = resolve_public_product_url(
            organisation=organisation,
            path=path,
        )

        if not result.found:
            return Response(
                {"detail": "Product not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if result.should_redirect:
            return build_redirect_response(result)

        product = result.product
        serializer = self.get_serializer(product)
        response = Response(serializer.data)
        response["Link"] = f'<{build_product_url(product, site_settings)}>; rel="canonical"'
        return response


class PublicProductResolveAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def clean_requested_path(self, raw_path):
        raw_path = str(raw_path or "").strip()

        if not raw_path:
            return "/"

        if raw_path.startswith("http://") or raw_path.startswith("https://"):
            from urllib.parse import urlparse

            parsed = urlparse(raw_path)
            return parsed.path or "/"

        return raw_path

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        raw_path = (
            request.query_params.get("path")
            or request.query_params.get("url")
            or request.path
        )
        requested_path = self.clean_requested_path(raw_path)

        result = resolve_public_product_url(
            organisation=organisation,
            path=requested_path,
        )

        if not result.found or not result.product:
            return Response(
                {
                    "detail": "Product not found.",
                    "found": False,
                    "requested_path": requested_path,
                    "resolved_by": result.resolved_by,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        product = result.product
        canonical_url = build_product_url(product, site_settings)
        canonical_path = product.current_public_path

        serializer = ExperienceProductSerializer(
            product,
            context={
                "request": request,
                "organisation": organisation,
            },
        )

        response = Response(
            {
                "found": True,
                "product": serializer.data,
                "canonical_url": canonical_url,
                "canonical_path": canonical_path,
                "current_public_path": canonical_path,
                "requested_path": requested_path,
                "should_redirect": result.should_redirect,
                "redirect_path": result.redirect_path,
                "redirect_type": result.redirect_type or 301,
                "resolved_by": result.resolved_by,
            }
        )
        response["Link"] = f'<{canonical_url}>; rel="canonical"'
        return response

class PublicProductAvailabilityAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None, product_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        product = get_object_or_404(
            ExperienceProduct,
            organisation=organisation,
            slug=product_slug,
            public_enabled=True,
            is_active=True,
            status="active",
        )

        service_date_value = request.query_params.get("date") or request.query_params.get("service_date")
        service_date = None

        if service_date_value:
            service_date = parse_date(service_date_value)

            if not service_date:
                return Response(
                    {"detail": "date must be YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        result = get_live_product_availability(
            organisation=organisation,
            product=product,
            service_date=service_date,
            include_raw=False,
        )

        if not result.get("ok"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)


class PublicCategoryViewSet(PublicOrganisationMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = ExperienceCategorySerializer
    lookup_field = "slug"
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        organisation = self.get_public_organisation()

        if not organisation:
            return ExperienceCategory.objects.none()

        return ExperienceCategory.objects.filter(
            organisation=organisation,
            is_active=True,
        )


class PublicPickupLocationViewSet(PublicOrganisationMixin, viewsets.ReadOnlyModelViewSet):
    """
    Public read-only pickup locations for the public booking website.

    This endpoint is intentionally separate from the private/admin
    PickupLocationViewSet. It only exposes active pickup locations for a
    published public ticketing site.
    """
    serializer_class = PickupLocationSerializer
    permission_classes = [permissions.AllowAny]
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        organisation = self.get_public_organisation()

        if not organisation:
            return PickupLocation.objects.none()

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return PickupLocation.objects.none()

        queryset = (
            PickupLocation.objects
            .filter(
                organisation=organisation,
                is_active=True,
            )
            .select_related("zone")
        )

        zone = self.request.query_params.get("zone")
        location_type = self.request.query_params.get("location_type")
        search = self.request.query_params.get("search")

        if zone:
            queryset = queryset.filter(Q(zone_id=zone) | Q(zone__name__icontains=zone))

        if location_type:
            queryset = queryset.filter(location_type=location_type)

        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(address__icontains=search)
                | Q(default_pickup_point__icontains=search)
            )

        return queryset.order_by("name")


class PublicPickupScheduleResolveAPIView(PublicOrganisationMixin, APIView):
    """
    Public pickup schedule resolver for the public booking website.

    It allows the public product detail/checkout flow to resolve the pickup time
    only for public active products and active pickup locations belonging to the
    resolved organisation.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        product_id = (
            request.query_params.get("product")
            or request.query_params.get("product_id")
        )
        pickup_location_id = (
            request.query_params.get("pickup_location")
            or request.query_params.get("pickup_location_id")
        )
        service_date_value = (
            request.query_params.get("service_date")
            or request.query_params.get("date")
        )

        if not product_id or not pickup_location_id or not service_date_value:
            return Response(
                {
                    "detail": "product, pickup_location and service_date are required."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        service_date = parse_date(service_date_value)

        if not service_date:
            return Response(
                {"detail": "service_date must be YYYY-MM-DD."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(
            ExperienceProduct,
            id=product_id,
            organisation=organisation,
            public_enabled=True,
            is_active=True,
            status="active",
        )

        pickup_location = get_object_or_404(
            PickupLocation,
            id=pickup_location_id,
            organisation=organisation,
            is_active=True,
        )

        schedules = ProductPickupSchedule.objects.filter(
            product=product,
            pickup_location=pickup_location,
            is_active=True,
        ).filter(
            Q(specific_date=service_date)
            | Q(day_of_week=service_date.weekday(), specific_date__isnull=True)
            | Q(day_of_week__isnull=True, specific_date__isnull=True)
        )

        schedule = schedules.filter(specific_date=service_date).first()

        if not schedule:
            schedule = schedules.filter(
                day_of_week=service_date.weekday(),
                specific_date__isnull=True,
            ).first()

        if not schedule:
            schedule = schedules.filter(
                day_of_week__isnull=True,
                specific_date__isnull=True,
            ).first()

        if not schedule:
            return Response(
                {
                    "found": False,
                    "product": product.name,
                    "pickup_location": pickup_location.name,
                    "service_date": service_date_value,
                    "message": "No pickup schedule found for this product, date and location.",
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        serializer = ProductPickupScheduleSerializer(
            schedule,
            context={"request": request, "organisation": organisation},
        )

        return Response(
            {
                "found": True,
                "schedule": serializer.data,
            }
        )

class PublicBookingViewSet(PublicOrganisationMixin, viewsets.ModelViewSet):
    serializer_class = BookingSerializer
    permission_classes = [permissions.AllowAny]
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        organisation = self.get_public_organisation()

        if not organisation:
            return Booking.objects.none()

        booking_code = self.kwargs.get("booking_code")

        queryset = Booking.objects.filter(organisation=organisation)

        if booking_code:
            queryset = queryset.filter(booking_code=booking_code)

        return queryset

    def create(self, request, *args, **kwargs):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        settings_obj, created = TicketingSettings.objects.get_or_create(
            organisation=organisation,
        )

        if not settings_obj.allow_public_bookings:
            return Response(
                {"detail": "Public bookings are disabled for this organisation."},
                status=status.HTTP_403_FORBIDDEN,
            )

        mutable_data = request.data.copy()
        mutable_data["source"] = mutable_data.get("source") or "public_site"

        seller_slug = (
            mutable_data.get("seller_slug")
            or request.query_params.get("seller")
            or self.kwargs.get("seller_slug")
        )

        if seller_slug:
            seller = Seller.objects.filter(
                organisation=organisation,
                seller_slug=seller_slug,
                is_active=True,
            ).first()

            if seller:
                mutable_data["seller"] = seller.id
                mutable_data["source"] = "seller_public_link"

        serializer = self.get_serializer(
            data=mutable_data,
            context={
                "request": request,
                "organisation": organisation,
            },
        )
        serializer.is_valid(raise_exception=True)
        booking = serializer.save(organisation=organisation)
        booking_finance.recalculate_booking_payment_totals(booking)

        response_serializer = self.get_serializer(
            booking,
            context={
                "request": request,
                "organisation": organisation,
            },
        )

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)


def get_booking_payment_amount(booking, payment_type):
    if payment_type == "full":
        return booking.total_amount

    if payment_type == "deposit":
        if booking.deposit_required > Decimal("0.00"):
            return booking.deposit_required
        return booking.total_amount

    if payment_type == "balance":
        return booking.balance_due

    return booking.balance_due or booking.total_amount


def recompute_seller_totals(seller):
    if not seller:
        return None

    seller.total_sales_amount = (
        Booking.objects.filter(
            seller=seller,
        ).exclude(status__in=["cancelled", "refunded", "no_show"]).aggregate(
            total=Sum("total_amount")
        )["total"]
        or Decimal("0.00")
    )

    seller.total_commission_amount = (
        SellerCommission.objects.filter(
            seller=seller,
        ).exclude(status="cancelled").aggregate(
            total=Sum("amount")
        )["total"]
        or Decimal("0.00")
    )

    seller.total_collected_amount = (
        Booking.objects.filter(
            seller=seller,
        ).exclude(status__in=["cancelled", "refunded", "no_show"]).aggregate(
            total=Sum("seller_collected_amount")
        )["total"]
        or Decimal("0.00")
    )

    seller.total_owed_to_company = (
        Booking.objects.filter(
            seller=seller,
        ).exclude(status__in=["cancelled", "refunded", "no_show"]).aggregate(
            total=Sum("seller_due_to_company")
        )["total"]
        or Decimal("0.00")
    )

    seller.save(
        update_fields=[
            "total_sales_amount",
            "total_commission_amount",
            "total_collected_amount",
            "total_owed_to_company",
            "updated_at",
        ]
    )

    return seller


def sync_seller_commission_for_booking(booking):
    previous_seller_ids = set(
        SellerCommission.objects.filter(booking=booking).values_list("seller_id", flat=True)
    )

    if not booking.seller:
        SellerCommission.objects.filter(booking=booking).update(status="cancelled")
        for seller_id in previous_seller_ids:
            booking_finance.recompute_seller_totals(Seller.objects.filter(id=seller_id).first())
        return None

    previous_seller_ids.add(booking.seller_id)

    if booking.status in ["cancelled", "refunded", "no_show"]:
        SellerCommission.objects.filter(
            booking=booking,
            seller=booking.seller,
        ).update(status="cancelled")
        for seller_id in previous_seller_ids:
            booking_finance.recompute_seller_totals(Seller.objects.filter(id=seller_id).first())
        return None

    if booking.seller_commission_amount <= Decimal("0.00"):
        SellerCommission.objects.filter(
            booking=booking,
            seller=booking.seller,
        ).delete()
        for seller_id in previous_seller_ids:
            booking_finance.recompute_seller_totals(Seller.objects.filter(id=seller_id).first())
        return None

    commission, created = SellerCommission.objects.update_or_create(
        organisation=booking.organisation,
        seller=booking.seller,
        booking=booking,
        defaults={
            "amount": booking.seller_commission_amount,
            "rate_used": booking.seller.commission_rate,
            "status": "pending",
            "note": "Automatically generated from booking.",
        },
    )

    for seller_id in previous_seller_ids:
        booking_finance.recompute_seller_totals(Seller.objects.filter(id=seller_id).first())

    return commission


def recalculate_booking_payment_totals(booking):
    confirmed_payments = booking.payments.filter(status="confirmed")

    paid_amount = Decimal("0.00")
    seller_collected_amount = Decimal("0.00")

    for payment in confirmed_payments:
        if payment.payment_type == "refund":
            paid_amount -= payment.amount
        else:
            paid_amount += payment.amount

        if payment.seller:
            seller_collected_amount += payment.amount

    booking.deposit_paid = max(paid_amount, Decimal("0.00"))
    booking.seller_collected_amount = seller_collected_amount

    booking.balance_due = max(
        booking.total_amount - booking.deposit_paid,
        Decimal("0.00"),
    )

    booking.seller_commission_amount = Decimal("0.00")

    if booking.seller:
        if booking.seller.fixed_commission_amount > Decimal("0.00"):
            booking.seller_commission_amount = booking.seller.fixed_commission_amount
        elif booking.seller.commission_rate > Decimal("0.00"):
            booking.seller_commission_amount = (
                booking.subtotal_amount * booking.seller.commission_rate
            ) / Decimal("100.00")

    booking.seller_due_to_company = max(
        booking.seller_collected_amount - booking.seller_commission_amount,
        Decimal("0.00"),
    )

    if booking.deposit_paid >= booking.total_amount and booking.total_amount > Decimal("0.00"):
        booking.payment_status = "paid"
        booking.status = "confirmed"
    elif booking.deposit_paid >= booking.deposit_required and booking.deposit_required > Decimal("0.00"):
        booking.payment_status = "deposit_paid"
        if booking.status == "pending_payment":
            booking.status = "confirmed"
    elif booking.deposit_paid > Decimal("0.00"):
        booking.payment_status = "partially_paid"
        if booking.status == "pending_payment":
            booking.status = "confirmed"
    else:
        booking.payment_status = "unpaid"

    if booking.status == "confirmed" and not booking.confirmed_at:
        booking.confirmed_at = timezone.now()

    booking.save()

    booking_finance.sync_seller_commission_for_booking(booking)

    return booking


def make_json_safe(value):
    try:
        return json.loads(json.dumps(value, default=str))
    except Exception:
        return {"raw": str(value)}


def mark_booking_payment_confirmed(
    booking,
    amount,
    provider,
    payment_type,
    provider_payment_id="",
    provider_checkout_id="",
    provider_order_id="",
    provider_capture_id="",
    provider_status="",
    provider_response=None,
):
    lookup = {
        "booking": booking,
        "provider": provider,
    }

    if provider_checkout_id:
        lookup["provider_checkout_id"] = provider_checkout_id
    elif provider_order_id:
        lookup["provider_order_id"] = provider_order_id
    elif provider_payment_id:
        lookup["provider_payment_id"] = provider_payment_id
    elif provider_capture_id:
        lookup["provider_capture_id"] = provider_capture_id

    payment, created = BookingPayment.objects.get_or_create(
        **lookup,
        defaults={
            "amount": amount,
            "payment_type": payment_type,
            "payer_type": "customer",
            "method": provider,
            "status": "confirmed",
            "reference": provider_payment_id or provider_order_id or provider_capture_id or provider_checkout_id,
            "note": f"{provider.title()} payment confirmed.",
            "provider_payment_id": provider_payment_id,
            "provider_checkout_id": provider_checkout_id,
            "provider_order_id": provider_order_id,
            "provider_capture_id": provider_capture_id,
            "provider_status": provider_status,
            "provider_response": provider_response or {},
            "paid_at": timezone.now(),
        },
    )

    payment.amount = amount
    payment.payment_type = payment_type
    payment.payer_type = "customer"
    payment.method = provider
    payment.status = "confirmed"
    payment.reference = provider_payment_id or provider_order_id or provider_capture_id or provider_checkout_id
    payment.note = f"{provider.title()} payment confirmed."
    payment.provider_payment_id = provider_payment_id or payment.provider_payment_id
    payment.provider_checkout_id = provider_checkout_id or payment.provider_checkout_id
    payment.provider_order_id = provider_order_id or payment.provider_order_id
    payment.provider_capture_id = provider_capture_id or payment.provider_capture_id
    payment.provider_status = provider_status
    payment.provider_response = provider_response or {}
    payment.paid_at = timezone.now()
    payment.save()

    booking = booking_finance.recalculate_booking_payment_totals(booking)

    return payment, booking


def get_organisation_currency(organisation):
    settings_obj = TicketingSettings.objects.filter(organisation=organisation).first()
    if settings_obj and settings_obj.default_currency:
        return settings_obj.default_currency.upper()
    return "USD"


def get_public_success_url(request, organisation, booking, provider):
    provided_url = request.data.get("success_url")

    if provided_url:
        return provided_url

    return (
        f"{settings.FRONTEND_URL.rstrip('/')}/experiences/{organisation.slug}"
        f"/confirmation/{booking.booking_code}?payment_provider={provider}&payment_status=success"
    )


def get_public_cancel_url(request, organisation, booking=None):
    provided_url = request.data.get("cancel_url")

    if provided_url:
        return provided_url

    return f"{settings.FRONTEND_URL.rstrip('/')}/experiences/{organisation.slug}/checkout?payment_status=cancelled"


class PublicPaymentOptionsAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_settings = TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
            is_active=True,
        ).first()

        if not provider_settings:
            return Response(
                {
                    "default_provider": "none",
                    "stripe_enabled": False,
                    "paypal_enabled": False,
                    "stripe_publishable_key": "",
                    "paypal_mode": "sandbox",
                    "payment_success_message": "Payment received. Your booking is confirmed.",
                    "payment_pending_message": "Your booking was created. Payment is pending confirmation.",
                }
            )

        return Response(
            {
                "default_provider": provider_settings.default_provider,
                "stripe_enabled": bool(
                    provider_settings.stripe_enabled
                    and provider_settings.stripe_secret_key
                ),
                "paypal_enabled": bool(provider_settings.has_paypal_credentials),
                "stripe_publishable_key": provider_settings.stripe_publishable_key,
                "paypal_mode": provider_settings.paypal_mode,
                "payment_success_message": provider_settings.payment_success_message,
                "payment_pending_message": provider_settings.payment_pending_message,
            }
        )


class PublicStripeCheckoutSessionAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_settings = TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
            is_active=True,
            stripe_enabled=True,
        ).first()

        if not provider_settings or not provider_settings.stripe_secret_key:
            return Response(
                {"detail": "Stripe is not configured for this organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking_id = request.data.get("booking_id")
        booking_code = request.data.get("booking_code")
        payment_type = request.data.get("payment_type", "full")

        booking = Booking.objects.filter(organisation=organisation).filter(
            Q(id=booking_id) | Q(booking_code=booking_code)
        ).select_related("primary_product").first()

        if not booking:
            return Response(
                {"detail": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        amount = get_booking_payment_amount(booking, payment_type)

        if amount <= Decimal("0.00"):
            return Response(
                {"detail": "Payment amount must be greater than zero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        currency = get_organisation_currency(organisation)
        success_url = get_public_success_url(request, organisation, booking, "stripe")
        cancel_url = get_public_cancel_url(request, organisation, booking)
        line_item_name = (
            booking.primary_product.name
            if booking.primary_product
            else f"Booking {booking.booking_code}"
        )

        session_payload = {
            "mode": "payment",
            "success_url": f"{success_url}&session_id={{CHECKOUT_SESSION_ID}}" if "?" in success_url else f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}",
            "cancel_url": cancel_url,
            "client_reference_id": booking.booking_code,
            "metadata": {
                "booking_id": str(booking.id),
                "booking_code": booking.booking_code,
                "organisation_id": str(organisation.id),
                "payment_type": payment_type,
            },
            "line_items": [
                {
                    "price_data": {
                        "currency": currency.lower(),
                        "product_data": {
                            "name": line_item_name,
                        },
                        "unit_amount": int(amount * Decimal("100")),
                    },
                    "quantity": 1,
                }
            ],
        }

        if provider_settings.stripe_connect_account_id:
            session_payload["payment_intent_data"] = {
                "transfer_data": {
                    "destination": provider_settings.stripe_connect_account_id,
                }
            }

        stripe.api_key = provider_settings.stripe_secret_key

        try:
            checkout_session = stripe.checkout.Session.create(**session_payload)
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        BookingPayment.objects.update_or_create(
            booking=booking,
            provider="stripe",
            provider_checkout_id=checkout_session.id,
            defaults={
                "amount": amount,
                "payment_type": payment_type,
                "payer_type": "customer",
                "method": "stripe",
                "status": "pending",
                "reference": checkout_session.id,
                "note": "Stripe Checkout Session created. Payment pending.",
                "provider_status": getattr(checkout_session, "payment_status", "pending"),
                "provider_response": {
                    "id": checkout_session.id,
                    "url": checkout_session.url,
                    "payment_status": getattr(checkout_session, "payment_status", ""),
                },
            },
        )

        return Response(
            {
                "provider": "stripe",
                "booking_id": booking.id,
                "booking_code": booking.booking_code,
                "session_id": checkout_session.id,
                "checkout_url": checkout_session.url,
            }
        )

def stripe_obj_get(obj, key, default=None):
    try:
        return obj[key]
    except Exception:
        return getattr(obj, key, default)

def stripe_obj_to_plain_dict(obj):
    try:
        return obj.to_dict_recursive()
    except Exception:
        pass

    try:
        return obj.to_dict()
    except Exception:
        pass

    try:
        return dict(obj)
    except Exception:
        return obj


class StripeWebhookAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def webhook_log(self, message, **extra):
        payload = {"message": message, **extra}

        try:
            line = json.dumps(payload, default=str)
        except Exception:
            line = f"{message} | {extra}"

        print(f"[TICKETING_STRIPE_WEBHOOK] {line}", flush=True)
        logger.error("[TICKETING_STRIPE_WEBHOOK] %s", line)

    def post(self, request):
        self.webhook_log("START")

        payload = request.body
        sig_header = request.META.get("HTTP_STRIPE_SIGNATURE", "")

        self.webhook_log(
            "REQUEST_RECEIVED",
            content_length=len(payload),
            has_signature=bool(sig_header),
            remote_addr=request.META.get("REMOTE_ADDR"),
            user_agent=request.META.get("HTTP_USER_AGENT"),
        )

        try:
            unverified_event = json.loads(payload.decode("utf-8"))
        except Exception as exc:
            self.webhook_log(
                "INVALID_JSON_PAYLOAD",
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return Response(
                {
                    "received": False,
                    "stage": "invalid_json_payload",
                    "detail": "Invalid payload.",
                    "error": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        event_type = unverified_event.get("type", "")
        event_id = unverified_event.get("id", "")
        event_data = unverified_event.get("data", {}).get("object", {})
        metadata = event_data.get("metadata", {}) or {}

        self.webhook_log(
            "UNVERIFIED_EVENT_PARSED",
            event_id=event_id,
            event_type=event_type,
            object_id=event_data.get("id"),
            metadata=metadata,
        )

        if event_type == "checkout.session.completed" and not (
            metadata.get("booking_id") or metadata.get("booking_code")
        ):
            self.webhook_log(
                "IGNORED_NOT_TICKETING_PAYMENT",
                event_id=event_id,
                metadata=metadata,
            )
            return Response({"received": True, "ignored": "not_ticketing_payment"})

        organisation_id = metadata.get("organisation_id")
        booking_id_from_metadata = metadata.get("booking_id")
        booking_code_from_metadata = metadata.get("booking_code")

        if not organisation_id:
            self.webhook_log(
                "MISSING_ORGANISATION_ID",
                event_id=event_id,
                metadata=metadata,
            )
            return Response(
                {
                    "received": False,
                    "stage": "missing_organisation_id",
                    "detail": "organisation_id missing from Stripe metadata.",
                    "metadata": metadata,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            provider_settings = (
                TicketingPaymentProviderSettings.objects
                .select_related("organisation")
                .filter(
                    organisation_id=organisation_id,
                    stripe_enabled=True,
                    is_active=True,
                )
                .first()
            )
        except Exception as exc:
            self.webhook_log(
                "PROVIDER_SETTINGS_QUERY_CRASHED",
                organisation_id=organisation_id,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return Response(
                {
                    "received": False,
                    "stage": "provider_settings_query_crashed",
                    "detail": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not provider_settings:
            self.webhook_log(
                "PROVIDER_SETTINGS_NOT_FOUND",
                organisation_id=organisation_id,
                event_id=event_id,
                metadata=metadata,
            )
            return Response(
                {
                    "received": False,
                    "stage": "provider_settings_not_found",
                    "detail": "Stripe provider settings not found.",
                    "organisation_id": organisation_id,
                    "metadata": metadata,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        self.webhook_log(
            "PROVIDER_SETTINGS_FOUND",
            organisation_id=organisation_id,
            organisation_slug=getattr(provider_settings.organisation, "slug", None),
            has_webhook_secret=bool(provider_settings.stripe_webhook_secret),
            stripe_enabled=provider_settings.stripe_enabled,
            is_active=provider_settings.is_active,
        )

        if provider_settings.stripe_webhook_secret:
            try:
                event = stripe.Webhook.construct_event(
                    payload,
                    sig_header,
                    provider_settings.stripe_webhook_secret,
                )
                self.webhook_log(
                    "SIGNATURE_VERIFIED",
                    event_id=stripe_obj_get(event, "id"),
                    event_type=stripe_obj_get(event, "type"),
                )
            except Exception as exc:
                self.webhook_log(
                    "SIGNATURE_VERIFICATION_FAILED",
                    organisation_id=organisation_id,
                    event_id=event_id,
                    error=str(exc),
                    traceback=traceback.format_exc(),
                )
                return Response(
                    {
                        "received": False,
                        "stage": "signature_verification_failed",
                        "detail": str(exc),
                        "traceback": traceback.format_exc(),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            self.webhook_log(
                "WEBHOOK_SECRET_EMPTY_USING_UNVERIFIED_EVENT",
                organisation_id=organisation_id,
                event_id=event_id,
            )
            event = unverified_event

        verified_event_type = stripe_obj_get(event, "type")
        verified_event_id = stripe_obj_get(event, "id")

        if verified_event_type != "checkout.session.completed":
            self.webhook_log(
                "IGNORED_EVENT_TYPE",
                event_id=verified_event_id,
                event_type=verified_event_type,
            )
            return Response({"received": True, "ignored": verified_event_type})

        # Stripe returns StripeObject instances, not dicts.
        try:
            self.webhook_log("ABOUT_TO_EXTRACT_SESSION")

            event_plain = stripe_obj_to_plain_dict(event)
            self.webhook_log(
                "EVENT_CONVERTED_TO_DICT",
                event_keys=list(event_plain.keys()) if isinstance(event_plain, dict) else str(type(event_plain)),
            )

            event_data_verified = event_plain.get("data", {}) if isinstance(event_plain, dict) else {}
            session = event_data_verified.get("object", {}) if isinstance(event_data_verified, dict) else {}
            session = stripe_obj_to_plain_dict(session)

            if not isinstance(session, dict):
                raise TypeError(f"Stripe session is not a dict after conversion: {type(session)}")

            self.webhook_log(
                "SESSION_EXTRACTED",
                session_id=session.get("id"),
                payment_status=session.get("payment_status"),
                metadata=session.get("metadata"),
            )

        except Exception as exc:
            self.webhook_log(
                "SESSION_EXTRACTION_CRASHED",
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return Response(
                {
                    "received": False,
                    "stage": "session_extraction_crashed",
                    "detail": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        metadata = session.get("metadata", {}) or {}

        booking_id = metadata.get("booking_id") or booking_id_from_metadata
        booking_code = metadata.get("booking_code") or booking_code_from_metadata
        payment_type = metadata.get("payment_type", "full")

        self.webhook_log(
            "PROCESSING_CHECKOUT_SESSION",
            event_id=verified_event_id,
            session_id=session.get("id"),
            payment_status=session.get("payment_status"),
            amount_total=session.get("amount_total"),
            booking_id=booking_id,
            booking_code=booking_code,
            payment_type=payment_type,
            organisation_id=organisation_id,
        )

        try:
            booking_query = Booking.objects.filter(
                organisation=provider_settings.organisation,
            )

            if booking_id and booking_code:
                booking = booking_query.filter(
                    Q(id=booking_id) | Q(booking_code=booking_code)
                ).first()
            elif booking_id:
                booking = booking_query.filter(id=booking_id).first()
            elif booking_code:
                booking = booking_query.filter(booking_code=booking_code).first()
            else:
                booking = None

        except Exception as exc:
            self.webhook_log(
                "BOOKING_QUERY_CRASHED",
                booking_id=booking_id,
                booking_code=booking_code,
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return Response(
                {
                    "received": False,
                    "stage": "booking_query_crashed",
                    "detail": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        if not booking:
            self.webhook_log(
                "BOOKING_NOT_FOUND",
                organisation_id=organisation_id,
                booking_id=booking_id,
                booking_code=booking_code,
            )
            return Response(
                {
                    "received": False,
                    "stage": "booking_not_found",
                    "detail": "Booking not found.",
                    "organisation_id": organisation_id,
                    "booking_id": booking_id,
                    "booking_code": booking_code,
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        stripe_payment_status = str(session.get("payment_status") or "").lower()

        if stripe_payment_status != "paid":
            self.webhook_log(
                "SESSION_NOT_PAID",
                booking_code=booking.booking_code,
                session_id=session.get("id"),
                payment_status=stripe_payment_status,
            )
            return Response(
                {
                    "received": True,
                    "confirmed": False,
                    "stage": "session_not_paid",
                    "detail": f"Stripe session payment_status is {stripe_payment_status or 'unknown'}.",
                }
            )

        amount = Decimal(str(session.get("amount_total") or 0)) / Decimal("100")

        self.webhook_log(
            "ABOUT_TO_CONFIRM_PAYMENT",
            booking_id=booking.id,
            booking_code=booking.booking_code,
            amount=str(amount),
            provider_checkout_id=session.get("id"),
            provider_payment_id=session.get("payment_intent"),
        )

        try:
            payment, updated_booking = booking_finance.mark_booking_payment_confirmed(
                booking=booking,
                amount=amount,
                provider="stripe",
                payment_type=payment_type,
                provider_payment_id=str(session.get("payment_intent") or ""),
                provider_checkout_id=str(session.get("id") or ""),
                provider_status=str(session.get("payment_status") or "paid"),
                provider_response=make_json_safe(session),
            )
        except Exception as exc:
            self.webhook_log(
                "MARK_BOOKING_PAYMENT_CONFIRMED_CRASHED",
                booking_id=getattr(booking, "id", None),
                booking_code=getattr(booking, "booking_code", None),
                error=str(exc),
                traceback=traceback.format_exc(),
            )
            return Response(
                {
                    "received": False,
                    "stage": "mark_booking_payment_confirmed_crashed",
                    "detail": str(exc),
                    "traceback": traceback.format_exc(),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        self.webhook_log(
            "PAYMENT_CONFIRMED",
            booking_id=updated_booking.id,
            booking_code=updated_booking.booking_code,
            booking_status=updated_booking.status,
            booking_payment_status=updated_booking.payment_status,
            deposit_paid=str(updated_booking.deposit_paid),
            balance_due=str(updated_booking.balance_due),
            payment_id=payment.id,
            payment_status=payment.status,
        )

        # Send customer confirmation email after payment is confirmed
        try:
            self.webhook_log(
                "SENDING_CUSTOMER_CONFIRMATION",
                booking_code=updated_booking.booking_code,
                payment_status=updated_booking.payment_status,
            )

            notification_logs = BookingNotificationService.payment_confirmed(
                updated_booking
            )

            self.webhook_log(
                "CUSTOMER_CONFIRMATION_SENT",
                booking_code=updated_booking.booking_code,
                notification_count=len(notification_logs or []),
            )

        except Exception as exc:
            self.webhook_log(
                "CUSTOMER_CONFIRMATION_FAILED",
                booking_code=updated_booking.booking_code,
                error=str(exc),
                traceback=traceback.format_exc(),
            )

        self.webhook_log("END_OK")

        return Response(
            {
                "received": True,
                "confirmed": True,
                "booking_id": updated_booking.id,
                "booking_code": updated_booking.booking_code,
                "booking_status": updated_booking.status,
                "payment_status": updated_booking.payment_status,
            }
        )

class PublicStripeConfirmSessionAPIView(PublicOrganisationMixin, APIView):
    """
    Public fallback confirmation for Stripe Checkout.

    Why this exists:
    - Webhooks are still the best source of truth.
    - But in a SaaS model, each organisation may use its own Stripe account.
    - If the tenant webhook is not configured correctly, the customer can pay,
      return to the confirmation page, and the booking may remain unpaid.
    - This endpoint lets the confirmation page verify the returned session_id
      using that organisation's Stripe secret key and then mark the booking paid.

    The frontend should call this after Stripe redirects back with:
    ?payment_provider=stripe&payment_status=success&session_id=cs_...
    """

    permission_classes = [permissions.AllowAny]

    def stripe_to_dict(self, value):
        if hasattr(value, "to_dict_recursive"):
            return value.to_dict_recursive()

        if isinstance(value, dict):
            return value

        try:
            return json.loads(json.dumps(value))
        except Exception:
            return {"raw": str(value)}

    def post(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session_id = (
            request.data.get("session_id")
            or request.query_params.get("session_id")
            or ""
        )

        if not session_id:
            return Response(
                {"session_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_settings = TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
            is_active=True,
            stripe_enabled=True,
        ).first()

        if not provider_settings or not provider_settings.stripe_secret_key:
            return Response(
                {"detail": "Stripe is not configured for this organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        stripe.api_key = provider_settings.stripe_secret_key

        try:
            session = stripe.checkout.Session.retrieve(
                session_id,
                expand=["payment_intent"],
            )
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        session_data = self.stripe_to_dict(session)
        metadata = session_data.get("metadata", {}) or {}

        booking_id = metadata.get("booking_id")
        booking_code = metadata.get("booking_code")
        payment_type = metadata.get("payment_type", "full")
        metadata_organisation_id = str(metadata.get("organisation_id") or "")

        if metadata_organisation_id and metadata_organisation_id != str(organisation.id):
            return Response(
                {"detail": "Stripe session does not belong to this organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking = Booking.objects.filter(
            organisation=organisation,
        ).filter(
            Q(id=booking_id) | Q(booking_code=booking_code)
        ).first()

        if not booking:
            # Fallback: find the pending payment by Stripe session id.
            payment = BookingPayment.objects.filter(
                booking__organisation=organisation,
                provider="stripe",
                provider_checkout_id=session_id,
            ).select_related("booking").first()

            if payment:
                booking = payment.booking

        if not booking:
            return Response(
                {"detail": "Booking not found for this Stripe session."},
                status=status.HTTP_404_NOT_FOUND,
            )

        stripe_payment_status = str(session_data.get("payment_status") or "").lower()

        if stripe_payment_status != "paid":
            serializer = BookingSerializer(
                booking,
                context={"request": request, "organisation": organisation},
            )

            return Response(
                {
                    "provider": "stripe",
                    "confirmed": False,
                    "payment_status": stripe_payment_status or "unknown",
                    "booking": serializer.data,
                    "detail": "Stripe has not marked this Checkout Session as paid yet.",
                },
                status=status.HTTP_202_ACCEPTED,
            )

        amount = Decimal(str(session_data.get("amount_total") or 0)) / Decimal("100")

        payment_intent = session_data.get("payment_intent") or ""
        provider_payment_id = ""

        if isinstance(payment_intent, dict):
            provider_payment_id = str(payment_intent.get("id") or "")
        else:
            provider_payment_id = str(payment_intent or "")

        confirmed_payment, booking = booking_finance.mark_booking_payment_confirmed(
            booking=booking,
            amount=amount,
            provider="stripe",
            payment_type=payment_type,
            provider_payment_id=provider_payment_id,
            provider_checkout_id=str(session_data.get("id") or session_id),
            provider_status=str(session_data.get("payment_status") or "paid"),
            provider_response=session_data,
        )

        try:
            BookingNotificationService.payment_confirmed(booking)
        except Exception:
            logger.exception(
                "Failed sending payment confirmation notifications for booking %s",
                booking.booking_code,
            )

        serializer = BookingSerializer(
            booking,
            context={"request": request, "organisation": organisation},
        )

        return Response(
            {
                "provider": "stripe",
                "confirmed": True,
                "payment_id": confirmed_payment.id,
                "booking_id": booking.id,
                "booking_code": booking.booking_code,
                "booking": serializer.data,
            }
        )


def get_paypal_base_url(provider_settings):
    if provider_settings.paypal_mode == "live":
        return "https://api-m.paypal.com"

    return "https://api-m.sandbox.paypal.com"


def get_paypal_access_token(provider_settings):
    base_url = get_paypal_base_url(provider_settings)

    response = requests.post(
        f"{base_url}/v1/oauth2/token",
        auth=(provider_settings.paypal_client_id, provider_settings.paypal_client_secret),
        data={"grant_type": "client_credentials"},
        timeout=30,
    )
    response.raise_for_status()

    return response.json()["access_token"]


class PublicPayPalCreateOrderAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_settings = TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
            is_active=True,
            paypal_enabled=True,
        ).first()

        if not provider_settings or not provider_settings.has_paypal_credentials:
            return Response(
                {"detail": "PayPal is not configured for this organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        booking_id = request.data.get("booking_id")
        booking_code = request.data.get("booking_code")
        payment_type = request.data.get("payment_type", "full")

        booking = Booking.objects.filter(organisation=organisation).filter(
            Q(id=booking_id) | Q(booking_code=booking_code)
        ).select_related("primary_product").first()

        if not booking:
            return Response(
                {"detail": "Booking not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        amount = get_booking_payment_amount(booking, payment_type)

        if amount <= Decimal("0.00"):
            return Response(
                {"detail": "Payment amount must be greater than zero."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        currency = get_organisation_currency(organisation)
        base_url = get_paypal_base_url(provider_settings)
        return_url = get_public_success_url(request, organisation, booking, "paypal")
        cancel_url = get_public_cancel_url(request, organisation, booking)

        try:
            access_token = get_paypal_access_token(provider_settings)

            response = requests.post(
                f"{base_url}/v2/checkout/orders",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
                json={
                    "intent": "CAPTURE",
                    "purchase_units": [
                        {
                            "reference_id": booking.booking_code,
                            "description": booking.primary_product.name if booking.primary_product else f"Booking {booking.booking_code}",
                            "custom_id": str(booking.id),
                            "amount": {
                                "currency_code": currency.upper(),
                                "value": f"{amount:.2f}",
                            },
                        }
                    ],
                    "application_context": {
                        "brand_name": organisation.name,
                        "user_action": "PAY_NOW",
                        "return_url": return_url,
                        "cancel_url": cancel_url,
                    },
                },
                timeout=30,
            )
            response.raise_for_status()
            paypal_order = response.json()
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        approve_url = ""

        for link in paypal_order.get("links", []):
            if link.get("rel") == "approve":
                approve_url = link.get("href", "")
                break

        BookingPayment.objects.update_or_create(
            booking=booking,
            provider="paypal",
            provider_order_id=paypal_order.get("id", ""),
            defaults={
                "amount": amount,
                "payment_type": payment_type,
                "payer_type": "customer",
                "method": "paypal",
                "status": "pending",
                "reference": paypal_order.get("id", ""),
                "note": "PayPal order created. Payment pending.",
                "provider_status": paypal_order.get("status", ""),
                "provider_response": paypal_order,
            },
        )

        return Response(
            {
                "provider": "paypal",
                "booking_id": booking.id,
                "booking_code": booking.booking_code,
                "order_id": paypal_order.get("id", ""),
                "approve_url": approve_url,
            }
        )


class PublicPayPalCaptureOrderAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        provider_settings = TicketingPaymentProviderSettings.objects.filter(
            organisation=organisation,
            is_active=True,
            paypal_enabled=True,
        ).first()

        if not provider_settings or not provider_settings.has_paypal_credentials:
            return Response(
                {"detail": "PayPal is not configured for this organisation."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order_id = request.data.get("order_id") or request.data.get("token")

        if not order_id:
            return Response(
                {"order_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payment = BookingPayment.objects.filter(
            booking__organisation=organisation,
            provider="paypal",
            provider_order_id=order_id,
        ).select_related("booking").first()

        if not payment:
            return Response(
                {"detail": "PayPal payment record not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        base_url = get_paypal_base_url(provider_settings)

        try:
            access_token = get_paypal_access_token(provider_settings)

            response = requests.post(
                f"{base_url}/v2/checkout/orders/{order_id}/capture",
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {access_token}",
                },
                timeout=30,
            )
            response.raise_for_status()
            capture_response = response.json()
        except Exception as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        capture_id = ""

        try:
            capture_id = capture_response["purchase_units"][0]["payments"]["captures"][0]["id"]
        except Exception:
            capture_id = ""

        booking = payment.booking

        confirmed_payment, booking = booking_finance.mark_booking_payment_confirmed(
            booking=booking,
            amount=payment.amount,
            provider="paypal",
            payment_type=payment.payment_type,
            provider_order_id=order_id,
            provider_capture_id=capture_id,
            provider_status=capture_response.get("status", ""),
            provider_response=capture_response,
        )
        try:
          BookingNotificationService.payment_confirmed(booking)
        except Exception:
            logger.exception(
                "Failed sending payment confirmation notifications for booking %s",
                booking.booking_code,
            )

        serializer = BookingSerializer(
            booking,
            context={"request": request, "organisation": organisation},
        )

        return Response(
            {
                "provider": "paypal",
                "booking_id": booking.id,
                "booking_code": booking.booking_code,
                "status": capture_response.get("status", ""),
                "booking": serializer.data,
            }
        )


class PublicSEOAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return Response(
                {"detail": "Organisation slug is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return Response(
                {"detail": "Public site is not published."},
                status=status.HTTP_404_NOT_FOUND,
            )

        products = (
            ExperienceProduct.objects
            .filter(
                organisation=organisation,
                public_enabled=True,
                is_active=True,
                status="active",
            )
            .select_related("organisation", "category")
            .prefetch_related("url_aliases")
            .order_by("-updated_at")[:50]
        )

        return Response(
            {
                "site": TicketingPublicSiteSettingsSerializer(
                    site_settings,
                    context={"request": request},
                ).data,
                "json_ld": {
                    "local_business": site_settings.json_ld_local_business,
                    "products": [
                        {
                            "@type": "Product",
                            "name": product.name,
                            "description": product.short_description or product.meta_description,
                            "sku": product.sku,
                            "url": build_product_url(product, site_settings),
                            "offers": {
                                "@type": "Offer",
                                "price": str(product.base_price),
                                "priceCurrency": "USD",
                                "availability": "https://schema.org/InStock",
                            },
                        }
                        for product in products
                    ],
                },
            }
        )

class PublicSitemapAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return HttpResponse(
                "Organisation slug is required.",
                status=400,
                content_type="text/plain",
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings:
            return HttpResponse(
                "Public site is not published.",
                status=404,
                content_type="text/plain",
            )

        base_url = site_settings.canonical_url.rstrip("/") if site_settings.canonical_url else ""

        products = ExperienceProduct.objects.filter(
            organisation=organisation,
            public_enabled=True,
            is_active=True,
            status="active",
        )

        categories = ExperienceCategory.objects.filter(
            organisation=organisation,
            is_active=True,
        )

        urls = []

        if base_url:
            urls.append(base_url)
            urls.append(f"{base_url}/events")
            urls.append(f"{base_url}/transfers")

            for category in categories:
                urls.append(f"{base_url}/category/{category.slug}")

            for product in products:
                urls.append(f"{base_url}/product/{product.slug}")

        xml_urls = "\n".join(
            [
                f"""
  <url>
    <loc>{url}</loc>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>"""
                for url in urls
            ]
        )

        sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="https://www.sitemaps.org/schemas/sitemap/0.9">
{xml_urls}
</urlset>
"""

        return HttpResponse(sitemap, content_type="application/xml")


class PublicRobotsAPIView(PublicOrganisationMixin, APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, organisation_slug=None):
        organisation = self.get_public_organisation()

        if not organisation:
            return HttpResponse(
                "User-agent: *\nDisallow: /",
                status=400,
                content_type="text/plain",
            )

        site_settings = self.get_public_site_settings(organisation)

        if not site_settings or not site_settings.robots_allow_indexing:
            return HttpResponse(
                "User-agent: *\nDisallow: /",
                content_type="text/plain",
            )

        lines = [
            "User-agent: *",
            "Allow: /",
        ]

        if site_settings.robots_allow_ai_crawlers:
            if site_settings.allow_gptbot:
                lines.extend(["", "User-agent: GPTBot", "Allow: /"])

            if site_settings.allow_oai_searchbot:
                lines.extend(["", "User-agent: OAI-SearchBot", "Allow: /"])
        else:
            lines.extend(
                [
                    "",
                    "User-agent: GPTBot",
                    "Disallow: /",
                    "",
                    "User-agent: OAI-SearchBot",
                    "Disallow: /",
                ]
            )

        if site_settings.canonical_url:
            sitemap_url = site_settings.canonical_url.rstrip("/") + "/sitemap.xml"
            lines.extend(["", f"Sitemap: {sitemap_url}"])

        return HttpResponse("\n".join(lines), content_type="text/plain")


class WelletProductsAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [HasTicketingOrganisationAccess, HasTicketingSellerPermission]
    ticketing_permission_required = "can_sell_cocobongo"

    def get(self, request):
        organisation = self.require_organisation()

        settings_obj, created = TicketingSettings.objects.get_or_create(
            organisation=organisation,
        )

        if not settings_obj.wellet_enabled:
            return Response(
                {
                    "detail": "Wellet / Coco Bongo is not enabled for this organisation."
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        service_date_value = request.query_params.get("service_date") or request.query_params.get("date")
        sync = request.query_params.get("sync") == "true"

        service_date = None

        if service_date_value:
            service_date = parse_date(service_date_value)

            if not service_date:
                return Response(
                    {"detail": "service_date must be YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if sync:
            sync_result = sync_wellet_products_to_snapshots(
                organisation=organisation,
                service_date=service_date,
            )

            if not sync_result.get("ok"):
                return Response(sync_result, status=status.HTTP_400_BAD_REQUEST)

        live_result = fetch_wellet_products(
            organisation=organisation,
            service_date=service_date,
        )

        snapshots = ExternalProviderProductSnapshot.objects.filter(
            organisation=organisation,
            provider="wellet",
        )

        if service_date:
            snapshots = snapshots.filter(service_date=service_date)

        return Response(
            {
                "provider": "wellet",
                "enabled": True,
                "service_date": str(service_date) if service_date else "",
                "live": live_result,
                "snapshots": ExternalProviderProductSnapshotSerializer(
                    snapshots[:50],
                    many=True,
                    context={"request": request, "organisation": organisation},
                ).data,
            }
        )

class TicketingLiveAvailabilityAPIView(TicketingOrganisationMixin, APIView):
    permission_classes = [HasTicketingOrganisationAccess, HasTicketingSellerPermission]
    ticketing_permission_required = "can_create_bookings"

    def get(self, request):
        organisation = self.require_organisation()

        product_id = request.query_params.get("product")
        service_date_value = request.query_params.get("service_date") or request.query_params.get("date")
        include_raw = request.query_params.get("include_raw") == "true"

        if not product_id:
            return Response(
                {"detail": "product is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        product = get_object_or_404(
            ExperienceProduct,
            id=product_id,
            organisation=organisation,
            is_active=True,
        )

        service_date = None

        if service_date_value:
            service_date = parse_date(service_date_value)

            if not service_date:
                return Response(
                    {"detail": "service_date must be YYYY-MM-DD."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        result = get_live_product_availability(
            organisation=organisation,
            product=product,
            service_date=service_date,
            include_raw=include_raw,
        )

        if not result.get("ok"):
            return Response(result, status=status.HTTP_400_BAD_REQUEST)

        return Response(result)


# =============================================================================
# Operations: business entities, QR scanner, admissions, ledger and settlements
# =============================================================================


class BusinessEntityScopedMixin:
    """Resolve and enforce a business entity inside the current organisation."""

    def get_business_entity(self):
        organisation = self.get_organisation()
        if not organisation:
            return None

        entity = get_business_entity_from_view(
            self.request,
            self,
            organisation=organisation,
        )

        if entity:
            return entity

        pk = self.kwargs.get("pk")
        if pk and getattr(self, "business_entity_from_pk", False):
            return TicketingBusinessEntity.objects.filter(
                pk=pk,
                organisation=organisation,
                is_active=True,
            ).first()

        return None

    def require_business_entity(self):
        entity = self.get_business_entity()
        if not entity:
            raise PermissionDenied("A valid business entity is required.")
        return entity


class TicketingBusinessEntityViewSet(
    TicketingOrganisationMixin,
    BusinessEntityScopedMixin,
    viewsets.ModelViewSet,
):
    serializer_class = TicketingBusinessEntitySerializer
    permission_classes = [HasTicketingOrganisationAccess]
    business_entity_from_pk = True

    def get_permissions(self):
        if self.action in ["list", "retrieve", "dashboard", "mine"]:
            return [HasTicketingOrganisationAccess()]
        return [CanManageBusinessEntities()]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return TicketingBusinessEntity.objects.none()

        queryset = TicketingBusinessEntity.objects.filter(
            organisation=organisation,
        )

        if not self.is_admin_user():
            allowed_ids = get_user_business_entity_accesses(
                self.request.user,
                organisation,
            ).values_list("business_entity_id", flat=True)
            queryset = queryset.filter(id__in=allowed_ids)

        entity_type = self.request.query_params.get("entity_type")
        is_active = self.request.query_params.get("is_active")
        search = self.request.query_params.get("search")

        if entity_type:
            queryset = queryset.filter(entity_type=entity_type)
        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search)
                | Q(legal_name__icontains=search)
                | Q(contact_name__icontains=search)
                | Q(contact_email__icontains=search)
            )

        return queryset.order_by("name")

    def perform_create(self, serializer):
        serializer.save(organisation=self.require_organisation())

    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        organisation = self.require_organisation()

        if self.is_admin_user():
            entities = TicketingBusinessEntity.objects.filter(
                organisation=organisation,
                is_active=True,
            )
        else:
            entity_ids = get_user_business_entity_accesses(
                request.user,
                organisation,
            ).values_list("business_entity_id", flat=True)
            entities = TicketingBusinessEntity.objects.filter(
                organisation=organisation,
                id__in=entity_ids,
                is_active=True,
            )

        return Response(
            self.get_serializer(entities.order_by("name"), many=True).data
        )

    @action(detail=True, methods=["get"], url_path="dashboard")
    def dashboard(self, request, pk=None):
        entity = self.get_object()
        today = timezone.localdate()

        date_from = parse_date(
            request.query_params.get("date_from", "")
        ) or today
        date_to = parse_date(
            request.query_params.get("date_to", "")
        ) or today

        admissions = TicketAdmission.objects.filter(
            organisation=entity.organisation,
            business_entity=entity,
            status="admitted",
            admitted_at__date__range=(date_from, date_to),
        )

        expected_snapshots = BookingFinancialSnapshot.objects.filter(
            organisation=entity.organisation,
            business_entity=entity,
        ).filter(
            Q(booking_item__service_date__range=(date_from, date_to))
            | Q(
                booking_item__service_date__isnull=True,
                booking__service_date__range=(date_from, date_to),
            )
        )

        admission_totals = admissions.aggregate(
            guests=Sum("quantity_admitted"),
            admissions=Count("id"),
        )
        expected_totals = expected_snapshots.aggregate(
            bookings=Count("booking_id", distinct=True),
            guests=Sum("quantity"),
            gross=Sum("gross_amount"),
            partner_entitlement=Sum("partner_entitlement"),
            platform_entitlement=Sum("platform_entitlement"),
            collected_by_partner=Sum("collected_by_partner"),
            collected_by_platform=Sum("collected_by_platform"),
            customer_balance_due=Sum("customer_balance_due"),
        )

        latest_scans = TicketScanAttempt.objects.filter(
            organisation=entity.organisation,
            business_entity=entity,
        ).select_related(
            "booking",
            "booking_item",
            "scanned_by",
        ).order_by("-scanned_at")[:20]

        current_start, current_end = calculate_next_period(entity)
        current_settlement = PartnerSettlementPeriod.objects.filter(
            organisation=entity.organisation,
            business_entity=entity,
            period_start=current_start,
            period_end=current_end,
        ).first()

        expected_guests = int(expected_totals["guests"] or 0)
        admitted_guests = int(admission_totals["guests"] or 0)

        return Response(
            {
                "business_entity": self.get_serializer(entity).data,
                "date_from": str(date_from),
                "date_to": str(date_to),
                "totals": {
                    "bookings": int(expected_totals["bookings"] or 0),
                    "expected_guests": expected_guests,
                    "admitted_guests": admitted_guests,
                    "remaining_guests": max(expected_guests - admitted_guests, 0),
                    "admission_events": int(admission_totals["admissions"] or 0),
                    "gross_sales": str(expected_totals["gross"] or Decimal("0.00")),
                    "partner_entitlement": str(expected_totals["partner_entitlement"] or Decimal("0.00")),
                    "platform_entitlement": str(expected_totals["platform_entitlement"] or Decimal("0.00")),
                    "collected_by_partner": str(expected_totals["collected_by_partner"] or Decimal("0.00")),
                    "collected_by_platform": str(expected_totals["collected_by_platform"] or Decimal("0.00")),
                    "customer_balance_due": str(expected_totals["customer_balance_due"] or Decimal("0.00")),
                },
                "current_period": {
                    "period_start": str(current_start),
                    "period_end": str(current_end),
                    "settlement": (
                        PartnerSettlementPeriodSerializer(
                            current_settlement,
                            context=self.get_serializer_context(),
                        ).data
                        if current_settlement
                        else None
                    ),
                },
                "latest_scans": TicketScanAttemptSerializer(
                    latest_scans,
                    many=True,
                    context=self.get_serializer_context(),
                ).data,
            }
        )


class BusinessEntityUserAccessViewSet(
    TicketingOrganisationMixin,
    BusinessEntityScopedMixin,
    viewsets.ModelViewSet,
):
    """
    Owner-managed partner users plus partner-portal bootstrap endpoints.

    Management actions require ``CanManageBusinessEntityUsers``.
    Logged-in partner users may call ``mine`` and ``bootstrap`` to discover
    only their own active business-entity access.
    """

    serializer_class = BusinessEntityUserAccessSerializer
    permission_classes = [CanManageBusinessEntityUsers]

    PARTNER_PERMISSION_FIELDS = (
        "can_access_dashboard",
        "can_scan",
        "can_view_today_bookings",
        "can_view_admissions",
        "can_view_customer_contact",
        "can_view_financials",
        "can_view_settlements",
        "can_record_payments",
        "can_reverse_admissions",
        "can_manage_users",
    )

    def get_permissions(self):
        if getattr(self, "action", None) in {"mine", "bootstrap"}:
            return [
                HasTicketingOrganisationAccess(),
                HasBusinessEntityAccess(),
            ]

        return [CanManageBusinessEntityUsers()]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return BusinessEntityUserAccess.objects.none()

        queryset = BusinessEntityUserAccess.objects.filter(
            organisation=organisation,
        ).select_related("organisation", "business_entity", "user")

        # Non-admin partner users must never enumerate another partner's users.
        if not self.is_admin_user():
            queryset = queryset.filter(user=self.request.user)

        entity_id = (
            self.request.query_params.get("business_entity")
            or self.request.query_params.get("business_entity_id")
        )
        is_active = self.request.query_params.get("is_active")
        role = self.request.query_params.get("role")
        search = self.request.query_params.get("search")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)

        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        if role:
            queryset = queryset.filter(role=role)

        if search:
            queryset = queryset.filter(
                Q(user__email__icontains=search)
                | Q(user__username__icontains=search)
                | Q(user__first_name__icontains=search)
                | Q(user__last_name__icontains=search)
                | Q(business_entity__name__icontains=search)
            )

        return queryset.order_by(
            "business_entity__name",
            "user__email",
        )

    def perform_create(self, serializer):
        organisation = self.require_organisation()
        entity = serializer.validated_data.get("business_entity")

        if not entity:
            entity = get_object_or_404(
                TicketingBusinessEntity,
                id=(
                    self.request.data.get("business_entity")
                    or self.request.data.get("business_entity_id")
                ),
                organisation=organisation,
            )

        serializer.save(
            organisation=organisation,
            business_entity=entity,
        )

    def _build_access_payload(self, access):
        return build_partner_access_payload(access)

    @staticmethod
    def _generate_temporary_password(length=16):
        alphabet = (
            "ABCDEFGHJKLMNPQRSTUVWXYZ"
            "abcdefghijkmnopqrstuvwxyz"
            "23456789"
            "!@#$%&*"
        )

        while True:
            password = "".join(
                secrets.choice(alphabet)
                for _ in range(length)
            )

            if (
                any(character.islower() for character in password)
                and any(character.isupper() for character in password)
                and any(character.isdigit() for character in password)
                and any(character in "!@#$%&*" for character in password)
            ):
                return password

    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        """
        Return every active partner access assigned to the logged-in user.
        """

        organisation = self.require_organisation()

        accesses = (
            BusinessEntityUserAccess.objects
            .filter(
                organisation=organisation,
                user=request.user,
                is_active=True,
                business_entity__is_active=True,
            )
            .select_related(
                "organisation",
                "business_entity",
                "user",
            )
            .order_by("business_entity__name", "id")
        )

        if not accesses.exists():
            return Response(
                {
                    "detail": (
                        "No active Partner Portal access was found for this user."
                    ),
                    "portal_type": "partner",
                    "organisation_slug": organisation.slug,
                    "accesses": [],
                },
                status=status.HTTP_404_NOT_FOUND,
            )

        now = timezone.now()
        accesses.update(last_access_at=now)

        refreshed_accesses = list(
            accesses.select_related(
                "organisation",
                "business_entity",
                "user",
            )
        )

        return Response(
            {
                "portal_type": "partner",
                "organisation": {
                    "id": organisation.id,
                    "name": organisation.name,
                    "slug": organisation.slug,
                },
                "default_access_id": refreshed_accesses[0].id,
                "accesses": [
                    self._build_access_payload(access)
                    for access in refreshed_accesses
                ],
            }
        )

    @action(detail=False, methods=["get"], url_path="bootstrap")
    def bootstrap(self, request):
        organisation = self.require_organisation()
        accesses = list(
            get_active_partner_accesses(
                request.user,
                organisation,
            )
        )

        if not accesses:
            return Response(
                {
                    "detail": (
                        "This account does not have active Partner Portal access."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        now = timezone.now()
        BusinessEntityUserAccess.objects.filter(
            id__in=[access.id for access in accesses],
        ).update(last_access_at=now)

        return Response(
            build_partner_portal_payload(
                user=request.user,
                organisation=organisation,
                accesses=accesses,
            )
        )

    @action(detail=True, methods=["post"], url_path="reset-password")
    def reset_password(self, request, pk=None):
        """
        Set a new temporary password.

        The password is returned only in this response and is never stored in
        plain text.
        """

        access = self.get_object()
        user = access.user

        requested_password = str(
            request.data.get("temporary_password")
            or request.data.get("password")
            or ""
        )

        generate_password = str(
            request.data.get("generate_password", "true")
        ).lower() in {"true", "1", "yes"}

        if requested_password and len(requested_password) < 10:
            return Response(
                {
                    "temporary_password": (
                        "Temporary password must be at least 10 characters."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        temporary_password = requested_password

        if generate_password or not temporary_password:
            temporary_password = self._generate_temporary_password()

        user.set_password(temporary_password)
        user.save(update_fields=["password"])

        return Response(
            {
                "detail": "Partner login password reset successfully.",
                "access_id": access.id,
                "user_id": user.id,
                "user_name": (
                    user.get_full_name()
                    if hasattr(user, "get_full_name")
                    else getattr(user, "username", "")
                ),
                "user_email": getattr(user, "email", ""),
                "username": getattr(user, "username", ""),
                "business_entity": {
                    "id": access.business_entity_id,
                    "name": access.business_entity.name,
                },
                "partner_login_url": (
                    f"/ticketing/{access.organisation.slug}/partner/login"
                ),
                "temporary_password": temporary_password,
            }
        )

    @action(detail=True, methods=["post"], url_path="activate")
    def activate(self, request, pk=None):
        access = self.get_object()

        access.is_active = True
        access.save(update_fields=["is_active", "updated_at"])

        user = access.user
        if hasattr(user, "is_active") and not user.is_active:
            user.is_active = True
            user.save(update_fields=["is_active"])

        return Response(self.get_serializer(access).data)

    @action(detail=True, methods=["post"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        access = self.get_object()

        access.is_active = False
        access.save(update_fields=["is_active", "updated_at"])

        # Do not disable the underlying Django user automatically because that
        # account may still have seller, owner, or another entity assignment.
        return Response(self.get_serializer(access).data)

    @action(detail=True, methods=["post"], url_path="apply-role-defaults")
    def apply_role_defaults(self, request, pk=None):
        access = self.get_object()

        serializer = self.get_serializer(
            access,
            data={
                "role": request.data.get("role", access.role),
                "apply_role_defaults": True,
            },
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data)


class ProductBusinessAgreementViewSet(
    TicketingOrganisationMixin,
    viewsets.ModelViewSet,
):
    serializer_class = ProductBusinessAgreementSerializer
    permission_classes = [CanManageBusinessAgreements]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return ProductBusinessAgreement.objects.none()

        queryset = ProductBusinessAgreement.objects.filter(
            organisation=organisation,
        ).select_related("business_entity", "product", "created_by")

        entity_id = self.request.query_params.get("business_entity")
        product_id = self.request.query_params.get("product")
        is_active = self.request.query_params.get("is_active")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        if is_active in ["true", "false"]:
            queryset = queryset.filter(is_active=is_active == "true")

        return queryset.order_by(
            "business_entity__name",
            "product__name",
            "-effective_from",
            "-version",
        )

    def perform_create(self, serializer):
        serializer.save(
            organisation=self.require_organisation(),
            created_by=self.request.user,
        )


class BookingFinancialSnapshotViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = BookingFinancialSnapshotSerializer
    permission_classes = [CanViewTicketingLedger]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return BookingFinancialSnapshot.objects.none()

        queryset = BookingFinancialSnapshot.objects.filter(
            organisation=organisation,
        ).select_related(
            "booking",
            "booking_item",
            "business_entity",
            "agreement",
        )

        booking_id = self.request.query_params.get("booking")
        entity_id = self.request.query_params.get("business_entity")

        if booking_id:
            queryset = queryset.filter(booking_id=booking_id)
        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)

        return queryset.order_by("-captured_at")

    @action(detail=False, methods=["post"], url_path="capture-booking")
    def capture_booking(self, request):
        organisation = self.require_organisation()
        booking_id = request.data.get("booking") or request.data.get("booking_id")

        booking = get_object_or_404(
            Booking,
            id=booking_id,
            organisation=organisation,
        )

        snapshots = create_snapshots_for_booking(
            booking,
            force_refresh=str(
                request.data.get("force_refresh") or "false"
            ).lower() in ["true", "1", "yes"],
        )

        return Response(
            self.get_serializer(snapshots, many=True).data,
            status=status.HTTP_201_CREATED,
        )


class AdmissionTokenViewSet(
    TicketingOrganisationMixin,
    BusinessEntityScopedMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = AdmissionTokenSerializer
    permission_classes = [HasTicketingOrganisationAccess]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return AdmissionToken.objects.none()

        queryset = AdmissionToken.objects.filter(
            organisation=organisation,
        ).select_related(
            "booking",
            "booking_item",
            "business_entity",
            "revoked_by",
        )

        booking_id = self.request.query_params.get("booking")
        item_id = self.request.query_params.get("booking_item")
        entity_id = self.request.query_params.get("business_entity")
        token_status = self.request.query_params.get("status")

        if booking_id:
            queryset = queryset.filter(booking_id=booking_id)
        if item_id:
            queryset = queryset.filter(booking_item_id=item_id)
        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if token_status:
            queryset = queryset.filter(status=token_status)

        return queryset.order_by("-issued_at")

    @action(
        detail=False,
        methods=["post"],
        url_path="issue",
        permission_classes=[CanManageBusinessEntities],
    )
    def issue(self, request):
        organisation = self.require_organisation()
        input_serializer = AdmissionTokenIssueSerializer(data=request.data)
        input_serializer.is_valid(raise_exception=True)
        data = input_serializer.validated_data

        item = get_object_or_404(
            BookingItem,
            id=data["booking_item_id"],
            booking__organisation=organisation,
        )

        entity = None
        if data.get("business_entity_id"):
            entity = get_object_or_404(
                TicketingBusinessEntity,
                id=data["business_entity_id"],
                organisation=organisation,
            )

        try:
            token = issue_admission_token(
                item,
                business_entity=entity,
                total_admissions=data.get("total_admissions"),
                valid_from=data.get("valid_from"),
                valid_until=data.get("valid_until"),
                is_primary=data.get("is_primary", True),
                metadata=data.get("metadata", {}),
                replace_existing_primary=str(
                    request.data.get("replace_existing_primary") or "false"
                ).lower() in ["true", "1", "yes"],
            )
        except AdmissionTokenValidationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        base_url = request.data.get("base_url")
        response_data = self.get_serializer(token).data
        response_data["qr_payload"] = build_qr_payload(
            token,
            base_url=base_url,
        )

        return Response(response_data, status=status.HTTP_201_CREATED)

    @action(
        detail=True,
        methods=["post"],
        url_path="rotate",
        permission_classes=[CanManageBusinessEntities],
    )
    def rotate(self, request, pk=None):
        token = self.get_object()
        rotated = rotate_admission_token(
            token,
            revoked_by=request.user,
            reason=request.data.get("reason", "Admission token rotated."),
            metadata=request.data.get("metadata", {}),
        )
        return Response(self.get_serializer(rotated).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="revoke",
        permission_classes=[CanManageBusinessEntities],
    )
    def revoke(self, request, pk=None):
        token = self.get_object()
        revoked = revoke_admission_token(
            token,
            revoked_by=request.user,
            reason=request.data.get("reason", "Admission token revoked."),
        )
        return Response(self.get_serializer(revoked).data)


class TicketScannerViewSet(
    TicketingOrganisationMixin,
    BusinessEntityScopedMixin,
    viewsets.GenericViewSet,
):
    permission_classes = [CanScanTickets]

    def _entity_from_request(self):
        organisation = self.require_organisation()
        entity_id = (
            self.request.data.get("business_entity_id")
            or self.request.query_params.get("business_entity_id")
        )

        if entity_id:
            return get_object_or_404(
                TicketingBusinessEntity,
                id=entity_id,
                organisation=organisation,
                is_active=True,
            )

        accesses = get_user_business_entity_accesses(
            self.request.user,
            organisation,
        )
        if accesses.count() == 1:
            return accesses.first().business_entity

        if self.is_admin_user():
            return None

        raise PermissionDenied(
            "Select the business entity that is scanning this ticket."
        )

    @action(detail=False, methods=["post"], url_path="resolve")
    def resolve(self, request):
        organisation = self.require_organisation()
        serializer = TicketScanResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        entity = self._entity_from_request()

        resolution = resolve_admission_token(
            data["token"],
            organisation=organisation,
            business_entity=entity,
            scanned_by=request.user,
            requested_quantity=data.get("requested_quantity", 1),
            scanner_device_id=data.get("scanner_device_id", ""),
            scanner_name=data.get("scanner_name", ""),
            location_name=data.get("location_name", ""),
            offline_event_id=data.get("offline_event_id"),
            metadata=data.get("metadata", {}),
            request=request,
            record_attempt=True,
        )

        response_status = (
            status.HTTP_200_OK
            if resolution.ok
            else status.HTTP_400_BAD_REQUEST
        )
        return Response(resolution.as_dict(), status=response_status)

    @action(
        detail=False,
        methods=["post"],
        url_path="admit",
        permission_classes=[CanAdmitGuests],
    )
    def admit(self, request):
        organisation = self.require_organisation()
        serializer = TicketAdmissionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        entity = self._entity_from_request()

        try:
            result = resolve_and_admit(
                data["token"],
                organisation=organisation,
                business_entity=entity,
                admitted_by=request.user,
                requested_quantity=data.get("requested_quantity", 1),
                scanner_device_id=data.get("scanner_device_id", ""),
                scanner_name=data.get("scanner_name", ""),
                location_name=data.get("location_name", ""),
                notes=data.get("notes", ""),
                offline_event_id=data.get("offline_event_id"),
                metadata=data.get("metadata", {}),
                request=request,
            )
        except AdmissionConflictError as exc:
            return Response(
                {"detail": str(exc), "result": "already_used"},
                status=status.HTTP_409_CONFLICT,
            )
        except AdmissionValidationError as exc:
            return Response(
                {"detail": str(exc), "result": "invalid"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(result.as_dict(), status=status.HTTP_201_CREATED)

    @action(
        detail=False,
        methods=["post"],
        url_path="sync-offline",
        permission_classes=[CanSyncOfflineScans],
    )
    def sync_offline(self, request):
        organisation = self.require_organisation()
        entity = self._entity_from_request()
        events = request.data.get("events")

        if not isinstance(events, list):
            return Response(
                {"events": "A list of offline scan events is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = []
        for payload in events[:500]:
            serializer = TicketAdmissionCreateSerializer(data=payload)
            if not serializer.is_valid():
                results.append(
                    {
                        "ok": False,
                        "errors": serializer.errors,
                        "offline_event_id": payload.get("offline_event_id"),
                    }
                )
                continue

            data = serializer.validated_data
            try:
                result = admit_guests(
                    data["token"],
                    organisation=organisation,
                    business_entity=entity,
                    admitted_by=request.user,
                    requested_quantity=data.get("requested_quantity", 1),
                    scanner_device_id=data.get("scanner_device_id", ""),
                    scanner_name=data.get("scanner_name", ""),
                    location_name=data.get("location_name", ""),
                    notes=data.get("notes", ""),
                    offline_event_id=data.get("offline_event_id"),
                    metadata={
                        **data.get("metadata", {}),
                        "synced_offline": True,
                    },
                    request=request,
                )
                results.append(result.as_dict())
            except (AdmissionConflictError, AdmissionValidationError) as exc:
                results.append(
                    {
                        "ok": False,
                        "detail": str(exc),
                        "offline_event_id": str(
                            data.get("offline_event_id") or ""
                        ),
                    }
                )

        return Response(
            {
                "processed": len(results),
                "successful": sum(1 for item in results if item.get("ok")),
                "failed": sum(1 for item in results if not item.get("ok")),
                "results": results,
            }
        )


class TicketAdmissionViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = TicketAdmissionSerializer
    permission_classes = [CanViewAdmissions]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return TicketAdmission.objects.none()

        queryset = TicketAdmission.objects.filter(
            organisation=organisation,
        ).select_related(
            "business_entity",
            "booking",
            "booking_item",
            "admission_token",
            "scan_attempt",
            "admitted_by",
            "reversed_by",
        )

        if not self.is_admin_user():
            entity_ids = get_user_business_entity_accesses(
                self.request.user,
                organisation,
            ).values_list("business_entity_id", flat=True)
            queryset = queryset.filter(business_entity_id__in=entity_ids)

        entity_id = self.request.query_params.get("business_entity")
        service_date = self.request.query_params.get("service_date")
        admission_status = self.request.query_params.get("status")
        booking_id = self.request.query_params.get("booking")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if service_date:
            queryset = queryset.filter(admitted_at__date=service_date)
        if admission_status:
            queryset = queryset.filter(status=admission_status)
        if booking_id:
            queryset = queryset.filter(booking_id=booking_id)

        return queryset.order_by("-admitted_at")

    @action(
        detail=True,
        methods=["post"],
        url_path="reverse",
        permission_classes=[CanReverseAdmissions],
    )
    def reverse(self, request, pk=None):
        admission = self.get_object()
        serializer = TicketAdmissionReverseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            admission = reverse_admission(
                admission,
                reversed_by=request.user,
                reason=serializer.validated_data["reason"],
            )
        except AdmissionValidationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(self.get_serializer(admission).data)

    @action(
        detail=False,
        methods=["get"],
        url_path="dashboard",
        permission_classes=[CanAccessOperationsDashboard],
    )
    def dashboard(self, request):
        organisation = self.require_organisation()
        target_date = parse_date(
            request.query_params.get("date", "")
        ) or timezone.localdate()

        queryset = self.get_queryset().filter(
            admitted_at__date=target_date,
        )

        totals = queryset.aggregate(
            guests=Sum("quantity_admitted"),
            admissions=Count("id"),
        )

        by_entity = (
            queryset.values(
                "business_entity_id",
                "business_entity__name",
            )
            .annotate(
                guests=Sum("quantity_admitted"),
                admissions=Count("id"),
            )
            .order_by("-guests")
        )

        scan_results = (
            TicketScanAttempt.objects.filter(
                organisation=organisation,
                scanned_at__date=target_date,
            )
            .values("result")
            .annotate(total=Count("id"))
            .order_by("result")
        )

        return Response(
            {
                "date": str(target_date),
                "guests_admitted": int(totals["guests"] or 0),
                "admission_events": int(totals["admissions"] or 0),
                "by_business_entity": list(by_entity),
                "scan_results": list(scan_results),
                "latest_admissions": self.get_serializer(
                    queryset[:25],
                    many=True,
                ).data,
            }
        )


class TicketScanAttemptViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = TicketScanAttemptSerializer
    permission_classes = [CanViewAdmissions]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return TicketScanAttempt.objects.none()

        queryset = TicketScanAttempt.objects.filter(
            organisation=organisation,
        ).select_related(
            "business_entity",
            "scanned_by",
            "admission_token",
            "booking",
            "booking_item",
        )

        if not self.is_admin_user():
            entity_ids = get_user_business_entity_accesses(
                self.request.user,
                organisation,
            ).values_list("business_entity_id", flat=True)
            queryset = queryset.filter(business_entity_id__in=entity_ids)

        entity_id = self.request.query_params.get("business_entity")
        result = self.request.query_params.get("result")
        date_value = self.request.query_params.get("date")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if result:
            queryset = queryset.filter(result=result)
        if date_value:
            queryset = queryset.filter(scanned_at__date=date_value)

        return queryset.order_by("-scanned_at")


class PartnerSettlementPeriodViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = PartnerSettlementPeriodSerializer
    permission_classes = [CanViewSettlements]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return PartnerSettlementPeriod.objects.none()

        queryset = PartnerSettlementPeriod.objects.filter(
            organisation=organisation,
        ).select_related(
            "business_entity",
            "generated_by",
            "approved_by",
        ).prefetch_related("lines", "payments")

        if not self.is_admin_user():
            entity_ids = get_user_business_entity_accesses(
                self.request.user,
                organisation,
            ).filter(
                can_view_settlements=True,
            ).values_list("business_entity_id", flat=True)
            queryset = queryset.filter(business_entity_id__in=entity_ids)

        entity_id = self.request.query_params.get("business_entity")
        settlement_status = self.request.query_params.get("status")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if settlement_status:
            queryset = queryset.filter(status=settlement_status)
        if date_from:
            queryset = queryset.filter(period_end__gte=date_from)
        if date_to:
            queryset = queryset.filter(period_start__lte=date_to)

        return queryset.order_by("-period_start", "-id")

    @action(
        detail=False,
        methods=["post"],
        url_path="preview",
        permission_classes=[CanGenerateSettlements],
    )
    def preview(self, request):
        organisation = self.require_organisation()
        serializer = SettlementGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        entity = get_object_or_404(
            TicketingBusinessEntity,
            id=data["business_entity_id"],
            organisation=organisation,
        )

        return Response(
            settlement_preview(
                organisation=organisation,
                business_entity=entity,
                period_start=data["period_start"],
                period_end=data["period_end"],
            )
        )

    @action(
        detail=False,
        methods=["post"],
        url_path="generate",
        permission_classes=[CanGenerateSettlements],
    )
    def generate(self, request):
        organisation = self.require_organisation()
        serializer = SettlementGenerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        entity = get_object_or_404(
            TicketingBusinessEntity,
            id=data["business_entity_id"],
            organisation=organisation,
        )

        try:
            settlement = ensure_snapshots_and_generate(
                organisation=organisation,
                business_entity=entity,
                period_start=data["period_start"],
                period_end=data["period_end"],
                generated_by=request.user,
                notes=data.get("notes", ""),
                regenerate_draft=data.get("regenerate_draft", False),
            )
        except SettlementValidationError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            self.get_serializer(settlement).data,
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="submit-review",
        permission_classes=[CanGenerateSettlements],
    )
    def submit_review(self, request, pk=None):
        settlement = self.get_object()
        try:
            settlement = submit_partner_settlement_for_review(
                settlement,
                notes=request.data.get("notes", ""),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(settlement).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="approve",
        permission_classes=[CanApproveSettlements],
    )
    def approve(self, request, pk=None):
        settlement = self.get_object()
        serializer = SettlementApprovalSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            settlement = approve_partner_settlement(
                settlement,
                approved_by=request.user,
                notes=serializer.validated_data.get("notes", ""),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(settlement).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="dispute",
        permission_classes=[CanViewSettlements],
    )
    def dispute(self, request, pk=None):
        settlement = self.get_object()
        notes = str(request.data.get("notes") or "").strip()
        if not notes:
            return Response(
                {"notes": "A dispute reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            settlement = dispute_partner_settlement(
                settlement,
                notes=notes,
                disputed_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(settlement).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="cancel",
        permission_classes=[CanApproveSettlements],
    )
    def cancel(self, request, pk=None):
        settlement = self.get_object()
        try:
            settlement = cancel_partner_settlement(
                settlement,
                notes=request.data.get("notes", ""),
                cancelled_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(self.get_serializer(settlement).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="record-payment",
        permission_classes=[CanRecordSettlementPayments],
    )
    def record_payment(self, request, pk=None):
        settlement = self.get_object()
        serializer = SettlementPaymentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            payment, settlement = record_partner_settlement_payment(
                settlement,
                payer_type=data["payer_type"],
                payee_type=data["payee_type"],
                amount=data["amount"],
                payment_method=data.get("payment_method", "bank_transfer"),
                status=data.get("status", "confirmed"),
                reference=data.get("reference", ""),
                paid_at=data.get("paid_at"),
                notes=data.get("notes", ""),
                attachment=request.FILES.get("attachment"),
                recorded_by=request.user,
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "payment": PartnerSettlementPaymentSerializer(
                    payment,
                    context=self.get_serializer_context(),
                ).data,
                "settlement": self.get_serializer(settlement).data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(
        detail=True,
        methods=["get"],
        url_path="reconcile",
        permission_classes=[CanViewTicketingLedger],
    )
    def reconcile(self, request, pk=None):
        return Response(reconcile_settlement_with_ledger(self.get_object()))


class PartnerSettlementPaymentViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = PartnerSettlementPaymentSerializer
    permission_classes = [CanViewSettlements]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return PartnerSettlementPayment.objects.none()

        queryset = PartnerSettlementPayment.objects.filter(
            settlement__organisation=organisation,
        ).select_related(
            "settlement",
            "settlement__business_entity",
            "recorded_by",
        )

        settlement_id = self.request.query_params.get("settlement")
        payment_status = self.request.query_params.get("status")

        if settlement_id:
            queryset = queryset.filter(settlement_id=settlement_id)
        if payment_status:
            queryset = queryset.filter(status=payment_status)

        return queryset.order_by("-paid_at")

    @action(
        detail=True,
        methods=["post"],
        url_path="change-status",
        permission_classes=[CanRecordSettlementPayments],
    )
    def change_status(self, request, pk=None):
        payment = self.get_object()
        new_status = request.data.get("status")

        valid_statuses = {
            value for value, _label in PartnerSettlementPayment.STATUS_CHOICES
        }
        if new_status not in valid_statuses:
            return Response(
                {"status": "A valid payment status is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            payment, settlement = update_partner_settlement_payment_status(
                payment,
                status=new_status,
                updated_by=request.user,
                notes=request.data.get("notes", ""),
            )
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "payment": self.get_serializer(payment).data,
                "settlement": PartnerSettlementPeriodSerializer(
                    settlement,
                    context=self.get_serializer_context(),
                ).data,
            }
        )


class TicketingLedgerEntryViewSet(
    TicketingOrganisationMixin,
    viewsets.ReadOnlyModelViewSet,
):
    serializer_class = TicketingLedgerEntrySerializer
    permission_classes = [CanViewTicketingLedger]

    def get_queryset(self):
        organisation = self.get_organisation()
        if not organisation:
            return TicketingLedgerEntry.objects.none()

        queryset = TicketingLedgerEntry.objects.filter(
            organisation=organisation,
        ).select_related(
            "booking",
            "booking_item",
            "booking_payment",
            "seller",
            "business_entity",
            "created_by",
            "reverses_entry",
        )

        entity_id = self.request.query_params.get("business_entity")
        seller_id = self.request.query_params.get("seller")
        booking_id = self.request.query_params.get("booking")
        party_type = self.request.query_params.get("party_type")
        entry_type = self.request.query_params.get("entry_type")
        date_from = self.request.query_params.get("date_from")
        date_to = self.request.query_params.get("date_to")

        if entity_id:
            queryset = queryset.filter(business_entity_id=entity_id)
        if seller_id:
            queryset = queryset.filter(seller_id=seller_id)
        if booking_id:
            queryset = queryset.filter(booking_id=booking_id)
        if party_type:
            queryset = queryset.filter(party_type=party_type)
        if entry_type:
            queryset = queryset.filter(entry_type=entry_type)
        if date_from:
            queryset = queryset.filter(effective_at__date__gte=date_from)
        if date_to:
            queryset = queryset.filter(effective_at__date__lte=date_to)

        return queryset.order_by("-effective_at", "-id")

    @action(detail=False, methods=["get"], url_path="summary")
    def summary(self, request):
        organisation = self.require_organisation()

        entity = None
        entity_id = request.query_params.get("business_entity")
        if entity_id:
            entity = get_object_or_404(
                TicketingBusinessEntity,
                id=entity_id,
                organisation=organisation,
            )

        seller = None
        seller_id = request.query_params.get("seller")
        if seller_id:
            seller = get_object_or_404(
                Seller,
                id=seller_id,
                organisation=organisation,
            )

        data = ledger_summary(
            organisation=organisation,
            business_entity=entity,
            seller=seller,
            date_from=parse_date(request.query_params.get("date_from", "")),
            date_to=parse_date(request.query_params.get("date_to", "")),
        )

        return Response(
            {
                key: str(value)
                for key, value in data.items()
            }
        )

    @action(detail=False, methods=["post"], url_path="manual-adjustment")
    def manual_adjustment(self, request):
        organisation = self.require_organisation()

        required = [
            "debit_party",
            "credit_party",
            "amount",
            "description",
        ]
        missing = [
            field for field in required
            if request.data.get(field) in [None, ""]
        ]
        if missing:
            return Response(
                {field: "This field is required." for field in missing},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entity = None
        if request.data.get("business_entity_id"):
            entity = get_object_or_404(
                TicketingBusinessEntity,
                id=request.data["business_entity_id"],
                organisation=organisation,
            )

        booking = None
        if request.data.get("booking_id"):
            booking = get_object_or_404(
                Booking,
                id=request.data["booking_id"],
                organisation=organisation,
            )

        try:
            entries = post_manual_adjustment(
                organisation=organisation,
                debit_party=request.data["debit_party"],
                credit_party=request.data["credit_party"],
                amount=request.data["amount"],
                description=request.data["description"],
                currency=request.data.get("currency", "USD"),
                reference=request.data.get("reference", ""),
                booking=booking,
                business_entity=entity,
                created_by=request.user,
                metadata=request.data.get("metadata", {}),
            )
        except (ValueError, TypeError) as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            self.get_serializer(entries, many=True).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=False, methods=["post"], url_path="reverse-group")
    def reverse_group(self, request):
        entry_group = request.data.get("entry_group")
        if not entry_group:
            return Response(
                {"entry_group": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entries = self.get_queryset().filter(
            entry_group=entry_group,
            is_reversed=False,
        )
        if not entries.exists():
            return Response(
                {"detail": "Active ledger group was not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        reversals = reverse_entry_group(
            entry_group,
            created_by=request.user,
            reason=request.data.get("reason", "Ledger group reversed."),
        )

        return Response(
            self.get_serializer(reversals, many=True).data,
            status=status.HTTP_201_CREATED,
        )

