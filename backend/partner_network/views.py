from __future__ import annotations

from django.contrib.auth import authenticate, get_user_model, login
from django.db import transaction
from django.db.models import Q, Sum
from django.http import HttpResponse, HttpResponseRedirect
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from partner_network.models import (
    PartnerNetworkSettings,
    ReferralBalanceAdjustment,
    ReferralBookingAttribution,
    ReferralCommission,
    ReferralCommissionRule,
    ReferralFeedbackRequest,
    ReferralPartner,
    ReferralPartnerAccess,
    ReferralPartnerLocation,
    ReferralPayout,
    ReferralProductAccess,
    ReferralQRCode,
)
from partner_network.permissions import (
    HasReferralPartnerPortalAccess,
    IsPartnerNetworkConfigurator,
    IsPartnerNetworkOwner,
    get_referral_partner_access,
    resolve_partner_network_organisation,
)
from partner_network.serializers import (
    PartnerNetworkSettingsSerializer,
    ReferralBalanceAdjustmentSerializer,
    ReferralBookingAttributionSerializer,
    ReferralCommissionRuleSerializer,
    ReferralCommissionSerializer,
    ReferralFeedbackRequestSerializer,
    ReferralPartnerAccessSerializer,
    ReferralPartnerLocationSerializer,
    ReferralPartnerSerializer,
    ReferralPayoutSerializer,
    ReferralProductAccessSerializer,
    ReferralQRCodeSerializer,
)
from partner_network.services.analytics_service import (
    network_dashboard_metrics,
    partner_dashboard_metrics,
)
from partner_network.services.payout_service import (
    cancel_payout,
    generate_payout,
    mark_payout_paid,
)
from partner_network.services.qr_service import (
    generate_qr_for_location,
    get_active_qr,
    record_scan,
    render_qr_png,
    whatsapp_redirect_url,
)
from partner_network.services.readiness_service import get_location_readiness


class OwnerScopedViewSet(viewsets.ModelViewSet):
    permission_classes = [IsPartnerNetworkOwner]

    @property
    def organisation(self):
        cached = getattr(self.request, "partner_network_organisation", None)
        return cached or resolve_partner_network_organisation(self.request, self)

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["organisation"] = self.organisation
        return context


class PartnerNetworkSettingsViewSet(OwnerScopedViewSet):
    serializer_class = PartnerNetworkSettingsSerializer
    permission_classes = [IsPartnerNetworkConfigurator]
    http_method_names = ["get", "post", "patch", "put", "head", "options"]

    def get_queryset(self):
        return PartnerNetworkSettings.objects.filter(organisation=self.organisation)

    def perform_create(self, serializer):
        if PartnerNetworkSettings.objects.filter(organisation=self.organisation).exists():
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"detail": "Partner Network settings already exist."})
        serializer.save(organisation=self.organisation)


class PartnerNetworkOverviewView(APIView):
    permission_classes = [IsPartnerNetworkOwner]

    def get(self, request):
        organisation = request.partner_network_organisation
        settings_obj = PartnerNetworkSettings.objects.filter(organisation=organisation).first()
        return Response({
            "settings": PartnerNetworkSettingsSerializer(settings_obj).data if settings_obj else None,
            "metrics": network_dashboard_metrics(organisation),
        })


class PartnerNetworkOptionsView(APIView):
    """Small owner-only lookup payload used by Partner Network forms."""
    permission_classes = [IsPartnerNetworkOwner]

    def get(self, request):
        from ticketing.models import ExperienceProduct, PickupLocation

        organisation = request.partner_network_organisation
        products = ExperienceProduct.objects.filter(
            organisation=organisation,
            status="active",
            public_enabled=True,
        ).order_by("name").values(
            "id", "name", "product_type", "requires_pickup_location"
        )
        pickup_locations = PickupLocation.objects.filter(
            organisation=organisation,
            is_active=True,
        ).order_by("name").values(
            "id", "name", "location_type", "address", "default_pickup_point"
        )
        return Response({
            "products": list(products),
            "pickup_locations": list(pickup_locations),
        })


class ReferralPartnerViewSet(OwnerScopedViewSet):
    serializer_class = ReferralPartnerSerializer

    def get_queryset(self):
        return ReferralPartner.objects.filter(organisation=self.organisation).order_by("name")

    def perform_create(self, serializer):
        serializer.save(organisation=self.organisation)

    @action(detail=True, methods=["get"])
    def metrics(self, request, pk=None):
        return Response(partner_dashboard_metrics(self.get_object()))


class ReferralPartnerLocationViewSet(OwnerScopedViewSet):
    serializer_class = ReferralPartnerLocationSerializer

    def get_queryset(self):
        queryset = ReferralPartnerLocation.objects.select_related(
            "partner", "linked_pickup_location"
        ).filter(partner__organisation=self.organisation)
        partner_id = self.request.query_params.get("partner_id")
        if partner_id:
            queryset = queryset.filter(partner_id=partner_id)
        return queryset.order_by("partner__name", "display_name")

    @transaction.atomic
    def perform_create(self, serializer):
        location = serializer.save()
        if location.is_active:
            readiness = get_location_readiness(location)
            if readiness["problems"]:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    "is_active": "Configure pickup, products, schedules and QR before activating this property.",
                    "readiness": readiness,
                })

    @transaction.atomic
    def perform_update(self, serializer):
        location = serializer.save()
        if location.is_active:
            readiness = get_location_readiness(location)
            if readiness["problems"]:
                from rest_framework.exceptions import ValidationError
                raise ValidationError({
                    "is_active": "This property is not ready to become active.",
                    "readiness": readiness,
                })

    @action(detail=True, methods=["post"])
    def generate_qr(self, request, pk=None):
        location = self.get_object()
        readiness = get_location_readiness(location)
        blocking = [
            issue for issue in readiness["problems"]
            if issue not in {"invalid_qr"}
        ]
        if blocking:
            return Response(
                {"detail": "Property is not ready for QR activation.", "readiness": readiness},
                status=status.HTTP_400_BAD_REQUEST,
            )
        qr = generate_qr_for_location(location)
        return Response(
            ReferralQRCodeSerializer(qr, context=self.get_serializer_context()).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=["get"])
    def readiness(self, request, pk=None):
        return Response(get_location_readiness(self.get_object()))


class ReferralProductAccessViewSet(OwnerScopedViewSet):
    serializer_class = ReferralProductAccessSerializer

    def get_queryset(self):
        queryset = ReferralProductAccess.objects.select_related(
            "partner", "partner_location", "product"
        ).filter(organisation=self.organisation)
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        if self.request.query_params.get("partner_location_id"):
            queryset = queryset.filter(partner_location_id=self.request.query_params["partner_location_id"])
        return queryset.order_by("product__name")

    def perform_create(self, serializer):
        serializer.save(organisation=self.organisation)


class ReferralPartnerAccessViewSet(OwnerScopedViewSet):
    serializer_class = ReferralPartnerAccessSerializer

    def get_queryset(self):
        queryset = ReferralPartnerAccess.objects.select_related("partner", "user").filter(
            organisation=self.organisation
        )
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        return queryset.order_by("partner__name", "user__email")

    def perform_create(self, serializer):
        partner = serializer.validated_data["partner"]
        if partner.organisation_id != self.organisation.pk:
            from rest_framework.exceptions import ValidationError
            raise ValidationError({"partner": "Partner belongs to another organisation."})
        serializer.save(organisation=self.organisation)


class ReferralQRCodeViewSet(OwnerScopedViewSet):
    serializer_class = ReferralQRCodeSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        return ReferralQRCode.objects.select_related(
            "partner_location__partner"
        ).filter(partner_location__partner__organisation=self.organisation).order_by("-created_at")

    def create(self, request, *args, **kwargs):
        location = ReferralPartnerLocation.objects.filter(
            partner__organisation=self.organisation,
            pk=request.data.get("partner_location"),
        ).first()
        if location is None:
            return Response({"partner_location": "A valid property location is required."}, status=400)
        readiness = get_location_readiness(location)
        blocking = [problem for problem in readiness["problems"] if problem != "invalid_qr"]
        if blocking:
            return Response({"detail": "Property is not ready for QR generation.", "readiness": readiness}, status=400)
        try:
            qr = generate_qr_for_location(location)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(self.get_serializer(qr).data, status=201)

    @action(detail=True, methods=["post"])
    def revoke(self, request, pk=None):
        qr = self.get_object()
        qr.revoke()
        return Response(self.get_serializer(qr).data)

    @action(detail=True, methods=["get"])
    def png(self, request, pk=None):
        qr = self.get_object()
        data = render_qr_png(qr, request=request)
        response = HttpResponse(data, content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="{qr.partner_location.pk}-concierge-qr.png"'
        return response


class ReferralCommissionRuleViewSet(OwnerScopedViewSet):
    serializer_class = ReferralCommissionRuleSerializer

    def get_queryset(self):
        return ReferralCommissionRule.objects.select_related(
            "partner", "partner_location", "product"
        ).filter(organisation=self.organisation).order_by("-effective_from", "-pk")

    def perform_create(self, serializer):
        serializer.save(organisation=self.organisation)


class ReferralCommissionViewSet(OwnerScopedViewSet):
    serializer_class = ReferralCommissionSerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = ReferralCommission.objects.select_related(
            "partner", "partner_location", "booking"
        ).filter(organisation=self.organisation)
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset.order_by("-created_at")


class ReferralBookingAttributionViewSet(OwnerScopedViewSet):
    serializer_class = ReferralBookingAttributionSerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = ReferralBookingAttribution.objects.select_related(
            "booking", "partner", "partner_location"
        ).filter(booking__organisation=self.organisation)
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        return queryset.order_by("-attributed_at")


class ReferralPayoutViewSet(OwnerScopedViewSet):
    serializer_class = ReferralPayoutSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        queryset = ReferralPayout.objects.select_related("partner").prefetch_related(
            "lines__commission__booking"
        ).filter(organisation=self.organisation)
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        return queryset.order_by("-period_end", "-pk")

    def create(self, request, *args, **kwargs):
        partner = ReferralPartner.objects.filter(
            organisation=self.organisation,
            pk=request.data.get("partner"),
        ).first()
        if partner is None:
            return Response({"partner": "A valid partner is required."}, status=400)
        from django.utils.dateparse import parse_date
        period_start = parse_date(str(request.data.get("period_start") or ""))
        period_end = parse_date(str(request.data.get("period_end") or ""))
        if not period_start or not period_end:
            return Response({"detail": "Valid period_start and period_end dates are required."}, status=400)
        try:
            payout = generate_payout(
                partner=partner,
                period_start=period_start,
                period_end=period_end,
                currency=request.data.get("currency", "USD"),
                created_by=request.user,
            )
        except (TypeError, ValueError) as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(self.get_serializer(payout).data, status=201)

    @action(detail=True, methods=["post"])
    def mark_paid(self, request, pk=None):
        try:
            payout = mark_payout_paid(
                payout=self.get_object(),
                paid_by=request.user,
                payment_reference=request.data.get("payment_reference", ""),
                note=request.data.get("internal_note", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(self.get_serializer(payout).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        try:
            payout = cancel_payout(
                payout=self.get_object(),
                note=request.data.get("internal_note", ""),
            )
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=400)
        return Response(self.get_serializer(payout).data)


class ReferralBalanceAdjustmentViewSet(OwnerScopedViewSet):
    serializer_class = ReferralBalanceAdjustmentSerializer
    http_method_names = ["get", "head", "options"]

    def get_queryset(self):
        queryset = ReferralBalanceAdjustment.objects.select_related(
            "partner", "commission__booking"
        ).filter(organisation=self.organisation)
        partner_id = self.request.query_params.get("partner_id")
        if partner_id:
            queryset = queryset.filter(partner_id=partner_id)
        return queryset.order_by("-created_at")


class ReferralFeedbackRequestViewSet(OwnerScopedViewSet):
    serializer_class = ReferralFeedbackRequestSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_queryset(self):
        queryset = ReferralFeedbackRequest.objects.select_related(
            "booking", "partner", "partner_location"
        ).filter(organisation=self.organisation)
        if self.request.query_params.get("partner_id"):
            queryset = queryset.filter(partner_id=self.request.query_params["partner_id"])
        if self.request.query_params.get("status"):
            queryset = queryset.filter(status=self.request.query_params["status"])
        return queryset.order_by("-created_at")

    def create(self, request, *args, **kwargs):
        return Response(
            {"detail": "Feedback requests are created automatically when an eligible booking completes."},
            status=status.HTTP_405_METHOD_NOT_ALLOWED,
        )

    @action(detail=True, methods=["post"])
    def retry(self, request, pk=None):
        feedback = self.get_object()
        if feedback.status == ReferralFeedbackRequest.STATUS_SENT:
            return Response({"detail": "Feedback request was already sent."}, status=400)
        feedback.status = ReferralFeedbackRequest.STATUS_PENDING
        feedback.scheduled_for = timezone.now()
        feedback.last_error = ""
        feedback.save(update_fields=["status", "scheduled_for", "last_error", "updated_at"])
        from partner_network.tasks import send_referral_feedback_task
        send_referral_feedback_task.delay(feedback.pk)
        return Response(self.get_serializer(feedback).data)


class PublicReferralRedirectView(APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        qr = get_active_qr(token)
        if qr is None:
            return Response({"detail": "This concierge QR code is invalid or inactive."}, status=404)
        if not qr.partner_location.is_active or qr.partner.status != "active":
            return Response({"detail": "This concierge location is inactive."}, status=404)
        settings_obj = getattr(qr.organisation, "partner_network_settings", None)
        if not settings_obj or not settings_obj.enabled:
            return Response({"detail": "This concierge is unavailable."}, status=404)
        record_scan(qr, request=request)
        try:
            target = whatsapp_redirect_url(qr)
        except ValueError as exc:
            return Response({"detail": str(exc)}, status=503)
        return HttpResponseRedirect(target)


class ReferralPartnerPortalBootstrapView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def get(self, request):
        access = request.referral_partner_access
        access.last_access_at = timezone.now()
        access.save(update_fields=["last_access_at", "updated_at"])
        partner = access.partner
        locations = ReferralPartnerLocation.objects.filter(partner=partner, is_active=True)
        return Response({
            "portal_type": "referral_partner",
            "organisation": {
                "id": partner.organisation_id,
                "name": partner.organisation.name,
                "slug": partner.organisation.slug,
            },
            "partner": {
                "id": partner.id,
                "name": partner.name,
                "type": partner.partner_type,
            },
            "permissions": {
                "can_access_dashboard": access.can_access_dashboard,
                "can_view_earnings": access.can_view_earnings,
                "can_edit_concierge": access.can_edit_concierge,
                "can_download_qr": access.can_download_qr,
            },
            "locations": ReferralPartnerLocationSerializer(
                locations, many=True, context={"request": request, "organisation": partner.organisation}
            ).data,
        })


class ReferralPartnerPortalDashboardView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def get(self, request):
        return Response(partner_dashboard_metrics(request.referral_partner_access.partner))


class ReferralPartnerPortalQRView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def get(self, request):
        access = request.referral_partner_access
        if not access.can_download_qr:
            return Response({"detail": "QR access is disabled."}, status=403)
        qrs = ReferralQRCode.objects.select_related("partner_location").filter(
            partner_location__partner=access.partner,
            status=ReferralQRCode.STATUS_ACTIVE,
        ).order_by("partner_location__display_name")
        return Response(ReferralQRCodeSerializer(qrs, many=True, context={"request": request}).data)


class ReferralPartnerPortalQRPNGView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def get(self, request, qr_id):
        access = request.referral_partner_access
        if not access.can_download_qr:
            return Response({"detail": "QR access is disabled."}, status=403)
        qr = ReferralQRCode.objects.select_related("partner_location").filter(
            pk=qr_id,
            partner_location__partner=access.partner,
            status=ReferralQRCode.STATUS_ACTIVE,
        ).first()
        if qr is None:
            return Response({"detail": "QR code not found."}, status=404)
        data = render_qr_png(qr, request=request)
        response = HttpResponse(data, content_type="image/png")
        response["Content-Disposition"] = f'attachment; filename="{qr.partner_location.pk}-concierge-qr.png"'
        return response


class ReferralPartnerPortalSettingsView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def patch(self, request):
        access = request.referral_partner_access
        if not access.can_edit_concierge:
            return Response({"detail": "Concierge settings access is disabled."}, status=403)
        location = ReferralPartnerLocation.objects.filter(
            partner=access.partner,
            pk=request.data.get("location_id"),
        ).first()
        if location is None:
            return Response({"location_id": "A valid property location is required."}, status=400)
        allowed_fields = ("display_name", "welcome_message", "property_information", "concierge_introduction")
        for field in allowed_fields:
            if field in request.data:
                setattr(location, field, str(request.data.get(field) or ""))
        location.save()
        return Response(
            ReferralPartnerLocationSerializer(
                location, context={"request": request, "organisation": access.partner.organisation}
            ).data
        )


class ReferralPartnerPortalEarningsView(APIView):
    permission_classes = [HasReferralPartnerPortalAccess]

    def get(self, request):
        access = request.referral_partner_access
        if not access.can_view_earnings:
            return Response({"detail": "Earnings access is disabled."}, status=403)
        commissions = ReferralCommission.objects.filter(partner=access.partner).order_by("-created_at")[:100]
        payouts = ReferralPayout.objects.filter(partner=access.partner).order_by("-period_end", "-pk")[:50]
        return Response({
            "summary": partner_dashboard_metrics(access.partner),
            "commissions": ReferralCommissionSerializer(commissions, many=True).data,
            "payouts": ReferralPayoutSerializer(payouts, many=True).data,
        })
