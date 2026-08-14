"""Authenticated, tenant-scoped staff API for customer AI conversations.

No endpoint accepts an organisation ID. Organisation context comes from trusted
middleware or the authenticated user's single active membership. All querysets
are scoped before object lookup, preventing cross-tenant ID enumeration.
"""

from __future__ import annotations

import re
from typing import Any, Protocol

from django.conf import settings
from django.db.models import Count, F, Q
from django.utils.module_loading import import_string
from organisations.models import Membership
from rest_framework import exceptions, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response

from ticketing.ai.customer.handoff_service import (
    CustomerHandoffInputError,
    CustomerHandoffPermissionError,
    CustomerHandoffRepositoryError,
    CustomerHandoffService,
)
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
    CustomerAIMessage,
    CustomerItineraryCart,
)
from ticketing.customer_ai_serializers import (
    CustomerAIConversationDetailSerializer,
    CustomerAIConversationFilterSerializer,
    CustomerAIConversationListSerializer,
    CustomerAIHandoffAssignInputSerializer,
    CustomerAIHandoffCancelInputSerializer,
    CustomerAIHandoffResolveInputSerializer,
    CustomerAIHandoffSerializer,
    CustomerAIMessageFilterSerializer,
    CustomerAIMessageSerializer,
    CustomerAIStaffReplyInputSerializer,
    CustomerItineraryCartSerializer,
)


DEFAULT_VIEW_ROLES = frozenset({"owner", "admin", "manager", "staff"})
IDEMPOTENCY_PATTERN = re.compile(r"^[A-Za-z0-9._~:-]{8,200}$")


class CustomerAIAPIError(exceptions.APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The customer messaging service is temporarily unavailable."
    default_code = "customer_ai_unavailable"


class CustomerAIStaffReplyService(Protocol):
    """Application service that atomically stores and queues one human reply."""

    def queue_reply(
        self,
        *,
        organisation: Any,
        conversation: CustomerAIConversation,
        staff_user: Any,
        text: str,
        idempotency_key: str,
    ) -> CustomerAIMessage:
        """Return the saved outbound message; queued delivery must be idempotent."""


class CustomerAIPagePagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


def get_request_organisation(request) -> Any:
    """Resolve trusted tenant context without request-controlled IDs."""
    cached = getattr(request, "_customer_ai_organisation", None)
    if cached is not None:
        return cached

    user = request.user
    middleware_org = getattr(request, "organisation", None)
    memberships = Membership.objects.filter(user=user, is_active=True).select_related(
        "organisation"
    )
    if middleware_org is not None:
        membership = memberships.filter(organisation=middleware_org).first()
        if membership is None and not getattr(user, "is_superuser", False):
            raise exceptions.PermissionDenied(
                "You do not have access to this organisation."
            )
        organisation = middleware_org
    else:
        candidates = list(memberships[:2])
        if len(candidates) != 1:
            raise exceptions.ValidationError(
                {
                    "organisation": (
                        "A trusted organisation context is required when the user "
                        "belongs to zero or multiple organisations."
                    )
                }
            )
        membership = candidates[0]
        organisation = membership.organisation

    if not getattr(organisation, "is_active", False):
        raise exceptions.PermissionDenied("This organisation is inactive.")
    request._customer_ai_organisation = organisation
    request._customer_ai_membership = membership
    return organisation


def get_request_membership(request) -> Membership | None:
    get_request_organisation(request)
    return getattr(request, "_customer_ai_membership", None)


class HasCustomerAIStaffAccess(BasePermission):
    """Require an allowed active role in the resolved organisation."""

    message = "You do not have permission to access customer conversations."

    def has_permission(self, request, view) -> bool:
        if not request.user or not request.user.is_authenticated:
            return False
        get_request_organisation(request)
        if getattr(request.user, "is_superuser", False):
            return True
        membership = get_request_membership(request)
        configured = getattr(settings, "CUSTOMER_AI_STAFF_ROLES", DEFAULT_VIEW_ROLES)
        allowed_roles = {str(role).strip().lower() for role in configured}
        return bool(
            membership
            and membership.is_active
            and str(membership.role).lower() in allowed_roles
        )


class CustomerAIBaseViewSet(viewsets.GenericViewSet):
    permission_classes = (IsAuthenticated, HasCustomerAIStaffAccess)
    pagination_class = CustomerAIPagePagination
    http_method_names = ("get", "post", "head", "options")

    @property
    def organisation(self):
        return get_request_organisation(self.request)

    def _paginated_response(self, queryset, serializer_class):
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = serializer_class(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(serializer_class(queryset, many=True).data)


class CustomerAIConversationViewSet(CustomerAIBaseViewSet):
    """Staff inbox and conversation-specific read/actions."""

    def get_queryset(self):
        unread_filter = Q(messages__direction=CustomerAIMessage.DIRECTION_INBOUND) & (
            Q(last_outbound_at__isnull=True)
            | Q(messages__occurred_at__gt=F("last_outbound_at"))
        )
        return (
            CustomerAIConversation.objects.filter(organisation=self.organisation)
            .annotate(unread_count=Count("messages", filter=unread_filter))
            .order_by("-updated_at", "-pk")
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CustomerAIConversationDetailSerializer
        return CustomerAIConversationListSerializer

    def list(self, request, *args, **kwargs):
        filters = CustomerAIConversationFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        values = filters.validated_data
        queryset = self.get_queryset()
        if values.get("status"):
            queryset = queryset.filter(status=values["status"])
        if values.get("channel"):
            queryset = queryset.filter(channel=values["channel"])
        if values.get("handoff_only"):
            queryset = queryset.filter(
                status__in=(
                    CustomerAIConversation.STATUS_HANDOFF_REQUESTED,
                    CustomerAIConversation.STATUS_HUMAN_OWNED,
                )
            )
        search = values.get("search")
        if search:
            queryset = queryset.filter(
                Q(customer_name__icontains=search)
                | Q(hotel_name__icontains=search)
            )
        return self._paginated_response(
            queryset,
            CustomerAIConversationListSerializer,
        )

    def retrieve(self, request, *args, **kwargs):
        return Response(CustomerAIConversationDetailSerializer(self.get_object()).data)

    @action(detail=True, methods=("get",))
    def messages(self, request, pk=None):
        conversation = self.get_object()
        filters = CustomerAIMessageFilterSerializer(data=request.query_params)
        filters.is_valid(raise_exception=True)
        queryset = conversation.messages.all().order_by("-id")
        before_id = filters.validated_data.get("before_id")
        if before_id:
            queryset = queryset.filter(pk__lt=before_id)
        limit = filters.validated_data["limit"]
        messages = list(queryset[:limit])
        messages.reverse()
        return Response(
            {
                "results": CustomerAIMessageSerializer(messages, many=True).data,
                "next_before_id": messages[0].pk if len(messages) == limit else None,
            }
        )

    @action(detail=True, methods=("get",))
    def handoffs(self, request, pk=None):
        conversation = self.get_object()
        queryset = conversation.handoffs.select_related("assigned_to").all()
        return self._paginated_response(queryset, CustomerAIHandoffSerializer)

    @action(detail=True, methods=("get",))
    def carts(self, request, pk=None):
        conversation = self.get_object()
        queryset = conversation.itinerary_carts.prefetch_related("items").all()
        return self._paginated_response(queryset, CustomerItineraryCartSerializer)

    @action(detail=True, methods=("post",), url_path="staff-reply")
    def staff_reply(self, request, pk=None):
        conversation = self.get_object()
        if conversation.status != CustomerAIConversation.STATUS_HUMAN_OWNED:
            raise exceptions.ValidationError(
                {"conversation": "Assign the handoff before sending a staff reply."}
            )
        payload = CustomerAIStaffReplyInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        service = _load_service(
            setting_name="CUSTOMER_AI_STAFF_REPLY_SERVICE",
            required_method="queue_reply",
        )
        message = service.queue_reply(
            organisation=self.organisation,
            conversation=conversation,
            staff_user=request.user,
            text=payload.validated_data["text"],
            idempotency_key=_request_idempotency_key(request),
        )
        if (
            message.conversation_id != conversation.pk
            or message.direction != CustomerAIMessage.DIRECTION_OUTBOUND
        ):
            raise CustomerAIAPIError("The reply service returned an invalid message.")
        return Response(
            CustomerAIMessageSerializer(message).data,
            status=status.HTTP_201_CREATED,
        )


class CustomerAIHandoffViewSet(CustomerAIBaseViewSet):
    serializer_class = CustomerAIHandoffSerializer

    def get_queryset(self):
        return (
            CustomerAIHandoff.objects.filter(organisation=self.organisation)
            .select_related("conversation", "assigned_to")
            .order_by("-requested_at", "-pk")
        )

    def list(self, request, *args, **kwargs):
        queryset = self.get_queryset()
        status_value = request.query_params.get("status")
        if status_value:
            valid = {choice[0] for choice in CustomerAIHandoff.STATUS_CHOICES}
            if status_value not in valid:
                raise exceptions.ValidationError({"status": "Invalid handoff status."})
            queryset = queryset.filter(status=status_value)
        return self._paginated_response(queryset, CustomerAIHandoffSerializer)

    def retrieve(self, request, *args, **kwargs):
        return Response(CustomerAIHandoffSerializer(self.get_object()).data)

    @action(detail=True, methods=("post",))
    def assign(self, request, pk=None):
        payload = CustomerAIHandoffAssignInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        handoff = self.get_object()
        service = _handoff_service()
        updated, _conversation = _call_handoff(
            service.assign_to_staff,
            organisation=self.organisation,
            conversation=handoff.conversation,
            handoff=handoff,
            staff_user=request.user,
        )
        return Response(CustomerAIHandoffSerializer(updated).data)

    @action(detail=True, methods=("post",))
    def resolve(self, request, pk=None):
        payload = CustomerAIHandoffResolveInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        handoff = self.get_object()
        updated, _conversation = _call_handoff(
            _handoff_service().resolve,
            organisation=self.organisation,
            conversation=handoff.conversation,
            handoff=handoff,
            staff_user=request.user,
            resolution=payload.validated_data["resolution"],
            resume_ai=payload.validated_data["resume_ai"],
        )
        return Response(CustomerAIHandoffSerializer(updated).data)

    @action(detail=True, methods=("post",))
    def cancel(self, request, pk=None):
        payload = CustomerAIHandoffCancelInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        handoff = self.get_object()
        updated, _conversation = _call_handoff(
            _handoff_service().cancel_unassigned,
            organisation=self.organisation,
            conversation=handoff.conversation,
            handoff=handoff,
            staff_user=request.user,
        )
        return Response(CustomerAIHandoffSerializer(updated).data)


class CustomerItineraryCartViewSet(CustomerAIBaseViewSet):
    """Staff-only read access; public checkout uses its existing token endpoint."""

    serializer_class = CustomerItineraryCartSerializer

    def get_queryset(self):
        return (
            CustomerItineraryCart.objects.filter(organisation=self.organisation)
            .select_related("conversation")
            .prefetch_related("items")
            .order_by("-updated_at", "-pk")
        )

    def list(self, request, *args, **kwargs):
        return self._paginated_response(
            self.get_queryset(), CustomerItineraryCartSerializer
        )

    def retrieve(self, request, *args, **kwargs):
        return Response(CustomerItineraryCartSerializer(self.get_object()).data)


def _load_service(*, setting_name: str, required_method: str):
    path = str(getattr(settings, setting_name, "") or "").strip()
    if not path:
        raise CustomerAIAPIError(f"{setting_name} is not configured.")
    value = import_string(path)
    service = value() if isinstance(value, type) else value
    if not callable(getattr(service, required_method, None)):
        raise CustomerAIAPIError(f"{setting_name} is invalid.")
    return service


def _handoff_service() -> CustomerHandoffService:
    return _load_service(
        setting_name="CUSTOMER_AI_HANDOFF_SERVICE",
        required_method="assign_to_staff",
    )


def _request_idempotency_key(request) -> str:
    value = str(request.headers.get("Idempotency-Key") or "").strip()
    if not IDEMPOTENCY_PATTERN.fullmatch(value):
        raise exceptions.ValidationError(
            {
                "Idempotency-Key": (
                    "Provide an Idempotency-Key header containing 8 to 200 safe characters."
                )
            }
        )
    return value


def _call_handoff(callable_method, **kwargs):
    try:
        return callable_method(**kwargs)
    except CustomerHandoffPermissionError as exc:
        raise exceptions.PermissionDenied(str(exc)) from exc
    except CustomerHandoffInputError as exc:
        raise exceptions.ValidationError({"handoff": str(exc)}) from exc
    except CustomerHandoffRepositoryError as exc:
        raise CustomerAIAPIError() from exc


__all__ = [
    "CustomerAIConversationViewSet",
    "CustomerAIHandoffViewSet",
    "CustomerAIPagePagination",
    "CustomerItineraryCartViewSet",
    "HasCustomerAIStaffAccess",
    "get_request_organisation",
]
