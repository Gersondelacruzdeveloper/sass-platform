"""Authenticated, tenant-scoped staff API for customer AI conversations.

No endpoint accepts an organisation ID. Organisation context comes from trusted
middleware or the authenticated user's single active membership. All querysets
are scoped before object lookup, preventing cross-tenant ID enumeration.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Mapping
from typing import Any, Protocol

from django.conf import settings
from django.db.models import Count, F, Q
from django.utils.module_loading import import_string
from organisations.models import Membership, Organisation
from rest_framework import exceptions, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny, BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

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
from ticketing.customer_cart_conversion_service import (
    PAYMENT_CHOICES,
    CustomerCartCheckoutDetails,
    CustomerCartConversionChangedError,
    CustomerCartConversionNotFoundError,
    CustomerCartConversionRepositoryError,
    CustomerCartConversionValidationError,
    DjangoCustomerCartConversionService,
)
from ticketing.serializers import BookingSerializer


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


class PublicCustomerCartConversionInputSerializer(serializers.Serializer):
    """Only customer-entered checkout fields are accepted from the browser."""

    token = serializers.CharField(min_length=20, max_length=255, trim_whitespace=True)
    full_name = serializers.CharField(max_length=255, trim_whitespace=True)
    whatsapp = serializers.CharField(max_length=50, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    hotel_name = serializers.CharField(
        max_length=255,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )
    notes = serializers.CharField(
        max_length=4000,
        required=False,
        allow_blank=True,
        default="",
        trim_whitespace=True,
    )
    payment_choice = serializers.ChoiceField(
        choices=tuple(sorted(PAYMENT_CHOICES)),
        required=False,
        default="pending",
    )


class PublicCustomerCartSessionResolveView(APIView):
    """Resolve one temporary checkout cart using its tenant-bound bearer token."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    http_method_names = ("post", "head", "options")

    def post(self, request, organisation_slug: str, *args, **kwargs):
        token = request.data.get("token") if isinstance(request.data, Mapping) else None
        if not isinstance(token, str) or not 20 <= len(token.strip()) <= 255:
            return _public_cart_error(
                code="invalid_request",
                message="A valid cart-session token is required.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )

        organisation = Organisation.objects.filter(
            slug=organisation_slug,
            is_active=True,
        ).first()
        if organisation is None:
            return _public_cart_not_found()

        from ticketing.models import TicketingPublicSiteSettings

        site_settings = TicketingPublicSiteSettings.objects.filter(
            organisation=organisation,
            is_published=True,
        ).first()
        if site_settings is None:
            return _public_cart_not_found()

        token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()
        cart = (
            CustomerItineraryCart.objects.filter(
                organisation=organisation,
                token_hash=token_hash,
            )
            .select_related("organisation", "conversation", "converted_booking")
            .prefetch_related("items__product")
            .first()
        )
        if cart is None:
            return _public_cart_not_found()

        can_resume_payment = _can_resume_converted_cart(cart)
        if (
            (cart.is_expired or cart.status == CustomerItineraryCart.STATUS_EXPIRED)
            and not can_resume_payment
        ):
            return _public_cart_error(
                code="cart_expired",
                message="This cart session has expired. Please request a new link.",
                http_status=status.HTTP_410_GONE,
            )
        if (
            cart.status != CustomerItineraryCart.STATUS_ACTIVE
            and not can_resume_payment
        ):
            return _public_cart_error(
                code="cart_unavailable",
                message="This cart session is no longer available.",
                http_status=status.HTTP_409_CONFLICT,
            )
        if not cart.can_checkout and not can_resume_payment:
            return _public_cart_error(
                code="cart_not_ready",
                message="This cart session is not ready for checkout.",
                http_status=status.HTTP_409_CONFLICT,
            )

        response = Response(
            {"success": True, "cart": _serialize_public_cart(cart)},
            status=status.HTTP_200_OK,
        )
        return _disable_sensitive_response_caching(response)


class PublicCustomerCartSessionConvertView(APIView):
    """Atomically turn one tenant-bound cart session into a booking."""

    authentication_classes = ()
    permission_classes = (AllowAny,)
    http_method_names = ("post", "head", "options")

    def post(self, request, organisation_slug: str, *args, **kwargs):
        payload = PublicCustomerCartConversionInputSerializer(data=request.data)
        if not payload.is_valid():
            response = Response(
                {
                    "success": False,
                    "code": "invalid_request",
                    "message": "Please check the checkout information.",
                    "errors": payload.errors,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
            return _disable_sensitive_response_caching(response)

        organisation = Organisation.objects.filter(
            slug=organisation_slug,
            is_active=True,
        ).first()
        if organisation is None:
            return _public_cart_not_found()

        from ticketing.models import TicketingPublicSiteSettings

        site_settings = TicketingPublicSiteSettings.objects.filter(
            organisation=organisation,
            is_published=True,
        ).first()
        if site_settings is None:
            return _public_cart_not_found()

        values = payload.validated_data
        configured_payment_choice = _configured_customer_payment_choice(
            organisation
        )
        if values["payment_choice"] != configured_payment_choice:
            return _public_cart_error(
                code="invalid_payment_choice",
                message="The selected payment option is not available.",
                http_status=status.HTTP_400_BAD_REQUEST,
            )
        checkout = CustomerCartCheckoutDetails(
            customer_name=values["full_name"],
            customer_whatsapp=values["whatsapp"],
            customer_email=values["email"],
            customer_hotel=values["hotel_name"],
            customer_notes=values["notes"],
            payment_choice=values["payment_choice"],
        )

        try:
            result = DjangoCustomerCartConversionService().convert(
                organisation=organisation,
                raw_token=values["token"],
                checkout=checkout,
                request=request,
            )
        except CustomerCartConversionNotFoundError:
            return _public_cart_not_found()
        except CustomerCartConversionChangedError as exc:
            return _public_cart_error(
                code=exc.code,
                message=str(exc),
                http_status=status.HTTP_409_CONFLICT,
            )
        except CustomerCartConversionValidationError as exc:
            return _public_cart_error(
                code=exc.code,
                message=str(exc),
                http_status=status.HTTP_409_CONFLICT,
            )
        except CustomerCartConversionRepositoryError:
            return _public_cart_error(
                code="cart_conversion_unavailable",
                message="Checkout is temporarily unavailable. Please try again.",
                http_status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        response = Response(
            {
                "success": True,
                "created": result.created,
                "booking": _serialize_public_booking(result.booking, request),
            },
            status=(
                status.HTTP_201_CREATED
                if result.created
                else status.HTTP_200_OK
            ),
        )
        return _disable_sensitive_response_caching(response)


def _serialize_public_booking(booking, request) -> dict[str, Any]:
    """Whitelist checkout-safe fields from the internal booking serializer."""

    data = BookingSerializer(
        booking,
        context={"request": request, "organisation": booking.organisation},
    ).data
    allowed_fields = (
        "id",
        "booking_code",
        "status",
        "payment_status",
        "payment_mode",
        "payment_method",
        "service_date",
        "service_time",
        "customer_name",
        "customer_email",
        "customer_hotel",
        "adults",
        "children",
        "infants",
        "total_guests",
        "subtotal_amount",
        "discount_amount",
        "tax_amount",
        "total_amount",
        "deposit_required",
        "deposit_paid",
        "balance_due",
        "items",
        "pickup_info",
        "created_at",
    )
    return {field: data[field] for field in allowed_fields if field in data}


def _serialize_public_cart(cart: CustomerItineraryCart) -> dict[str, Any]:
    organisation = cart.organisation
    conversation = cart.conversation
    converted_booking = cart.converted_booking
    first_item = next(iter(cart.items.all()), None)
    trusted_hotel = str(
        getattr(first_item, "pickup_name_snapshot", "") or ""
    ).strip()
    customer = {
        "full_name": str(
            getattr(converted_booking, "customer_name", "")
            or getattr(conversation, "customer_name", "")
            or ""
        ).strip(),
        "whatsapp": str(
            getattr(converted_booking, "customer_whatsapp", "")
            or getattr(conversation, "external_customer_id", "")
            or ""
        ).strip(),
        "email": str(
            getattr(converted_booking, "customer_email", "") or ""
        ).strip(),
        "hotel_name": trusted_hotel or str(
            getattr(converted_booking, "customer_hotel", "")
            or getattr(conversation, "hotel_name", "")
            or ""
        ).strip(),
    }
    return {
        "cart_id": cart.pk,
        "status": cart.status,
        "language": cart.language,
        "currency": cart.currency,
        "subtotal": cart.subtotal,
        "discount_total": cart.discount_total,
        "total": cart.total,
        "expires_at": cart.expires_at,
        "is_expired": cart.is_expired and not _can_resume_converted_cart(cart),
        "can_checkout": cart.can_checkout or _can_resume_converted_cart(cart),
        "can_resume_payment": _can_resume_converted_cart(cart),
        "customer": customer,
        "converted_booking": (
            _serialize_public_booking(converted_booking, None)
            if converted_booking is not None
            else None
        ),
        "organisation": {
            "id": organisation.pk,
            "slug": organisation.slug,
            "name": organisation.name,
        },
        "promotions": _serialize_public_promotions(cart.promotion_snapshot),
        "validation_notices": [],
        "items": [_serialize_public_cart_item(item) for item in cart.items.all()],
    }


def _can_resume_converted_cart(cart: CustomerItineraryCart) -> bool:
    booking = getattr(cart, "converted_booking", None)
    if booking is None:
        return False
    return bool(
        cart.status == CustomerItineraryCart.STATUS_CONVERTED
        and str(getattr(booking, "status", "")) == "pending_payment"
        and str(getattr(booking, "payment_status", "")) in {"unpaid", "pending"}
    )


def _configured_customer_payment_choice(organisation: Organisation) -> str:
    from ticketing.models import TicketingPaymentProviderSettings

    provider_settings = TicketingPaymentProviderSettings.objects.filter(
        organisation=organisation,
        is_active=True,
    ).first()
    if provider_settings is None:
        return "pending"
    choice = str(
        provider_settings.default_customer_payment_choice or "pending"
    ).strip().lower()
    return choice if choice in PAYMENT_CHOICES else "pending"


def _serialize_public_cart_item(item) -> dict[str, Any]:
    product = item.product
    image_url = None
    image = getattr(product, "image", None)
    if image:
        try:
            image_url = image.url
        except (AttributeError, ValueError):
            image_url = None

    return {
        "id": item.pk,
        "position": item.position,
        "product_id": item.product_id,
        "product_slug": str(getattr(product, "slug", "") or ""),
        "product_url": str(getattr(product, "current_public_path", "") or ""),
        "product_image_url": image_url,
        "service_date": item.service_date,
        "adults": item.adults,
        "children": item.children,
        "infants": item.infants,
        "package_id": item.package_id,
        "event_ticket_type_id": item.event_ticket_type_id,
        "selected_external_option_id": item.selected_external_option_id,
        "pickup_location_id": item.pickup_location_id,
        "product_name_snapshot": item.product_name_snapshot,
        "option_name_snapshot": item.option_name_snapshot,
        "pickup_name_snapshot": item.pickup_name_snapshot,
        "pickup_time_snapshot": item.pickup_time_snapshot,
        "unit_price_snapshot": item.unit_price_snapshot,
        "line_subtotal": item.line_subtotal,
        "line_discount": item.line_discount,
        "line_total": item.line_total,
        "currency": item.currency,
    }


def _serialize_public_promotions(snapshot) -> list[dict[str, Any]]:
    if not isinstance(snapshot, list):
        return []

    allowed_fields = (
        "promotion_id",
        "name",
        "description",
        "discount_type",
        "discount_value",
        "discount_amount",
        "currency",
        "eligible_item_positions",
    )
    promotions = []
    for entry in snapshot:
        if isinstance(entry, Mapping):
            promotions.append(
                {key: entry[key] for key in allowed_fields if key in entry}
            )
    return promotions


def _public_cart_not_found() -> Response:
    return _public_cart_error(
        code="invalid_token",
        message="The cart session could not be found.",
        http_status=status.HTTP_404_NOT_FOUND,
    )


def _public_cart_error(*, code: str, message: str, http_status: int) -> Response:
    response = Response(
        {"success": False, "code": code, "message": message},
        status=http_status,
    )
    return _disable_sensitive_response_caching(response)


def _disable_sensitive_response_caching(response: Response) -> Response:
    response["Cache-Control"] = "no-store, private"
    response["Pragma"] = "no-cache"
    return response


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
    "PublicCustomerCartConversionInputSerializer",
    "PublicCustomerCartSessionConvertView",
    "PublicCustomerCartSessionResolveView",
    "get_request_organisation",
]
