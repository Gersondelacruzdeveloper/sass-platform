"""Django adapters for the independent customer WhatsApp agent.

Read adapters query only active, public records inside the supplied
organisation. State-changing access is limited to the existing temporary-cart
service and atomic human handoffs. This module never creates a Booking,
BookingItem, BookingPayment, inventory hold, or seller record.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, time, timedelta
from decimal import Decimal
from typing import Any, Mapping
from urllib.parse import urljoin, urlparse

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.module_loading import import_string

from organisations.models import Membership
from ticketing.ai.customer.availability_tools import (
    AlternativeRequest,
    AvailabilityRequest,
)
from ticketing.ai.customer.cart_tools import CustomerCartRepositoryError
from ticketing.ai.customer.handoff_service import HandoffRequest
from ticketing.ai.customer.itinerary_tools import ItineraryItemRequest
from ticketing.ai.customer.pickup_tools import (
    PickupLocationSearch,
    PickupScheduleRequest,
)
from ticketing.ai.customer.product_tools import ProductSearchCriteria
from ticketing.ai.customer.promotion_tools import PromotionEvaluationRequest
from ticketing.ai.customer.tool_dependencies import CustomerAIDomainAdapters
from ticketing.customer_ai_models import (
    CustomerAIConversation,
    CustomerAIHandoff,
)
from ticketing.customer_cart_service import DjangoCustomerCartService
from ticketing.models import (
    EventTicketType,
    ExperiencePackage,
    ExperienceProduct,
    PickupLocation,
    ProductPickupSchedule,
)
from ticketing.services import get_live_product_availability


MAX_ALTERNATIVE_DAYS = 31


class CustomerAIDjangoAdapterError(RuntimeError):
    """Raised when an application adapter cannot safely complete its work."""


@dataclass(frozen=True)
class PublicProduct:
    """Safe public projection while retaining access to the underlying model."""

    model: ExperienceProduct
    public_url: str | None
    currency: str

    def __getattr__(self, name: str) -> Any:
        aliases = {
            "is_public": "public_enabled",
            "published": "public_enabled",
            "public_price_from": "adult_price",
            "price_from": "adult_price",
            "price": "adult_price",
            "pickup_available": "supports_pickup",
            "pickup_required": "requires_pickup_location",
            "description": "long_description",
            "inclusions": "includes",
            "exclusions": "excludes",
            "pickup_notes": "pickup_instructions",
        }
        if name == "payment_options":
            values: list[str] = []
            if self.model.allow_full_payment:
                values.append("full_payment")
            if self.model.allow_deposit_payment:
                values.append("deposit")
            return values
        return getattr(self.model, aliases.get(name, name))


def _organisation_id(value: Any) -> Any:
    return getattr(value, "pk", getattr(value, "id", None))


def _assert_context(organisation: Any, conversation: Any) -> None:
    organisation_id = _organisation_id(organisation)
    if not organisation_id:
        raise CustomerAIDjangoAdapterError("An organisation is required.")
    if getattr(conversation, "organisation_id", None) != organisation_id:
        raise CustomerAIDjangoAdapterError(
            "The customer conversation belongs to another organisation."
        )


def _currency(organisation: Any) -> str:
    try:
        value = organisation.ticketing_settings.default_currency
    except Exception:
        value = "USD"
    result = str(value or "USD").strip().upper()
    return result if len(result) == 3 and result.isalpha() else "USD"


def _public_url(organisation: Any, product: ExperienceProduct) -> str | None:
    """Build a URL only from the current tenant's configured domain."""
    raw_domain = ""
    try:
        public_settings = organisation.ticketing_public_site_settings
        raw_domain = str(
            getattr(public_settings, "custom_domain", "") or ""
        ).strip()
    except Exception:
        pass

    if not raw_domain:
        try:
            domain_record = organisation.domains.filter(is_primary=True).first()
            if domain_record is None:
                domain_record = organisation.domains.order_by("pk").first()
        except Exception:
            domain_record = None
        raw_domain = str(getattr(domain_record, "domain", "") or "").strip()

    if not raw_domain:
        return None

    # Public-site settings and OrganisationDomain normally store only the
    # hostname, but safely accept an existing http(s) scheme for compatible
    # tenant data.
    base = raw_domain if "://" in raw_domain else f"https://{raw_domain}"
    parsed = urlparse(base)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
    ):
        return None

    path = str(getattr(product, "current_public_path", "") or "").strip()
    return urljoin(base.rstrip("/") + "/", path.lstrip("/")) if path else None


def _public_queryset(organisation: Any):
    return ExperienceProduct.objects.filter(
        organisation=organisation,
        is_active=True,
        public_enabled=True,
        status="active",
    )


def _wrap(organisation: Any, product: ExperienceProduct) -> PublicProduct:
    return PublicProduct(
        model=product,
        public_url=_public_url(organisation, product),
        currency=_currency(organisation),
    )


class DjangoCustomerProductRepository:
    def search_public_products(
        self, *, organisation: Any, criteria: ProductSearchCriteria
    ) -> list[PublicProduct]:
        queryset = _public_queryset(organisation).select_related("category")
        if criteria.product_type:
            queryset = queryset.filter(product_type=criteria.product_type)
        terms = [criteria.query, *criteria.interests]
        search = Q()
        for term in (str(value or "").strip() for value in terms):
            if term:
                search |= (
                    Q(name__icontains=term)
                    | Q(short_description__icontains=term)
                    | Q(long_description__icontains=term)
                    | Q(location__icontains=term)
                    | Q(category__name__icontains=term)
                )
        if search:
            queryset = queryset.filter(search)
        queryset = queryset.order_by(
            "-is_recommended", "-is_best_seller", "-is_featured", "name"
        ).distinct()[: criteria.limit]
        return [_wrap(organisation, product) for product in queryset]

    def get_public_product(
        self, *, organisation: Any, product_id: int, language: str = ""
    ) -> PublicProduct | None:
        product = _public_queryset(organisation).filter(pk=product_id).first()
        return _wrap(organisation, product) if product else None


class DjangoCustomerAvailabilityRepository:
    product_repository = DjangoCustomerProductRepository()

    def get_public_product(
        self, *, organisation: Any, product_id: int
    ) -> PublicProduct | None:
        return self.product_repository.get_public_product(
            organisation=organisation,
            product_id=product_id,
        )

    def check_availability(
        self,
        *,
        organisation: Any,
        product: PublicProduct,
        request: AvailabilityRequest,
    ) -> Mapping[str, Any]:
        result = get_live_product_availability(
            organisation,
            product.model,
            service_date=request.service_date,
            include_raw=False,
        )
        if not isinstance(result, Mapping) or result.get("ok") is not True:
            return self._unknown(product, request, result)
        options = list(result.get("options") or [])
        selected = self._select_options(
            options,
            external_option_id=request.selected_external_option_id,
        )
        available = [item for item in selected if item.get("available") is True]
        remaining_values = [
            int(item["available_quantity"])
            for item in available
            if item.get("available_quantity") not in (None, "")
        ]
        remaining = max(remaining_values) if remaining_values else None
        enough = remaining is None or remaining >= request.total_passengers
        if available and enough:
            status = (
                "limited"
                if remaining is not None and remaining <= request.total_passengers + 3
                else "available"
            )
        else:
            status = "unavailable"
        price_total = self._price_total(available or selected, request)
        return {
            "product_id": product.pk,
            "service_date": request.service_date,
            "status": status,
            "remaining_capacity": remaining,
            "price_total": price_total,
            "currency": product.currency,
            "source": str(result.get("provider") or "local"),
            "checked_at": timezone.now(),
            "notes": str(result.get("error") or ""),
        }

    def find_available_alternatives(
        self, *, organisation: Any, request: AlternativeRequest
    ) -> list[Mapping[str, Any]]:
        start = request.travel_start_date or request.requested_date or timezone.localdate()
        end = request.travel_end_date or (start + timedelta(days=7))
        end = min(end, start + timedelta(days=MAX_ALTERNATIVE_DAYS))
        if request.requested_product_id:
            products = _public_queryset(organisation).filter(
                pk=request.requested_product_id
            )
        else:
            products = _public_queryset(organisation).filter(
                Q(name__icontains=request.query)
                | Q(short_description__icontains=request.query)
                | Q(category__name__icontains=request.query)
            ).distinct()[:6]

        results: list[Mapping[str, Any]] = []
        current = start
        while current <= end and len(results) < request.limit:
            for model in products:
                wrapped = _wrap(organisation, model)
                availability_request = AvailabilityRequest(
                    product_id=model.pk,
                    service_date=current,
                    adults=request.adults,
                    children=request.children,
                    infants=request.infants,
                    selected_external_option_id=None,
                )
                checked = self.check_availability(
                    organisation=organisation,
                    product=wrapped,
                    request=availability_request,
                )
                if checked["status"] in {"available", "limited"}:
                    results.append({"product": wrapped, **checked})
                    if len(results) >= request.limit:
                        break
            current += timedelta(days=1)
        return results

    @staticmethod
    def _select_options(options: list[Any], *, external_option_id: str | None):
        valid = [item for item in options if isinstance(item, Mapping)]
        if not external_option_id:
            return valid
        target = str(external_option_id)
        return [
            item
            for item in valid
            if target
            in {
                str(item.get("external_option_id") or ""),
                str(item.get("option_id") or ""),
                str(item.get("id") or ""),
            }
        ]

    @staticmethod
    def _price_total(options: list[Any], request: AvailabilityRequest) -> Decimal | None:
        if not options:
            return None
        try:
            unit = Decimal(str(options[0].get("price")))
        except Exception:
            return None
        return unit * request.total_passengers

    @staticmethod
    def _unknown(product, request, result):
        return {
            "product_id": product.pk,
            "service_date": request.service_date,
            "status": "unknown",
            "remaining_capacity": None,
            "price_total": None,
            "currency": product.currency,
            "source": "external" if product.external_provider != "local" else "local",
            "checked_at": timezone.now(),
            "notes": str(result.get("error") or "") if isinstance(result, Mapping) else "",
        }


class DjangoCustomerPickupRepository:
    product_repository = DjangoCustomerProductRepository()

    def search_active_pickup_locations(
        self, *, organisation: Any, search: PickupLocationSearch
    ):
        return PickupLocation.objects.filter(
            organisation=organisation,
            is_active=True,
        ).filter(
            Q(name__icontains=search.query)
            | Q(address__icontains=search.query)
            | Q(zone__name__icontains=search.query)
        ).select_related("zone").distinct().order_by("name")[: search.limit]

    def get_public_product(self, *, organisation: Any, product_id: int):
        return self.product_repository.get_public_product(
            organisation=organisation, product_id=product_id
        )

    def get_active_pickup_location(
        self, *, organisation: Any, pickup_location_id: int
    ):
        return PickupLocation.objects.filter(
            organisation=organisation,
            pk=pickup_location_id,
            is_active=True,
        ).first()

    def resolve_pickup_schedule(
        self,
        *,
        organisation: Any,
        product: PublicProduct,
        pickup_location: PickupLocation,
        request: PickupScheduleRequest,
    ) -> Mapping[str, Any] | None:
        queryset = ProductPickupSchedule.objects.filter(
            product=product.model,
            pickup_location=pickup_location,
            product__organisation=organisation,
            pickup_location__organisation=organisation,
            is_active=True,
        )
        schedule = queryset.filter(specific_date=request.service_date).first()
        if schedule is None:
            schedule = queryset.filter(
                specific_date__isnull=True,
                day_of_week=request.service_date.weekday(),
            ).first()
        if schedule is None:
            return None
        return {
            "organisation_id": organisation.pk,
            "product_id": product.pk,
            "pickup_location_id": pickup_location.pk,
            "service_date": request.service_date,
            "status": "confirmed",
            "pickup_time": schedule.pickup_time,
            "timezone": str(getattr(settings, "TIME_ZONE", "UTC")),
            "meeting_point": schedule.pickup_point
            or pickup_location.default_pickup_point,
            "instructions": schedule.instructions
            or pickup_location.default_instructions,
            "source": "configured",
            "schedule_id": schedule.pk,
        }


class DjangoCustomerItineraryRepository:
    availability = DjangoCustomerAvailabilityRepository()
    pickup = DjangoCustomerPickupRepository()

    def validate_item(
        self,
        *,
        organisation: Any,
        conversation: Any,
        item: ItineraryItemRequest,
        language: str,
    ) -> Mapping[str, Any]:
        _assert_context(organisation, conversation)
        product = self.availability.get_public_product(
            organisation=organisation, product_id=item.product_id
        )
        if product is None:
            return self._invalid(organisation, item, "Product is not public or active.")
        option_name = ""
        unit_price = product.adult_price
        if item.package_id:
            package = ExperiencePackage.objects.filter(
                pk=item.package_id,
                product=product.model,
                product__organisation=organisation,
                is_active=True,
            ).first()
            if package is None:
                return self._invalid(organisation, item, "Package is invalid.")
            option_name, unit_price = package.name, package.price
        if item.event_ticket_type_id:
            ticket_type = EventTicketType.objects.filter(
                pk=item.event_ticket_type_id,
                product=product.model,
                product__organisation=organisation,
                is_active=True,
            ).first()
            if ticket_type is None:
                return self._invalid(organisation, item, "Ticket type is invalid.")
            option_name, unit_price = ticket_type.name, ticket_type.price

        checked = self.availability.check_availability(
            organisation=organisation,
            product=product,
            request=AvailabilityRequest(
                product_id=item.product_id,
                service_date=item.service_date,
                adults=item.adults,
                children=item.children,
                infants=item.infants,
                selected_external_option_id=item.selected_external_option_id,
            ),
        )
        pickup_required = bool(product.requires_pickup_location)
        pickup_location_confirmed = not pickup_required
        pickup_time_confirmed = not pickup_required
        pickup_name = ""
        pickup_time: time | None = None
        if item.pickup_location_id:
            location = self.pickup.get_active_pickup_location(
                organisation=organisation,
                pickup_location_id=item.pickup_location_id,
            )
            if location:
                pickup_location_confirmed = True
                pickup_name = location.name
                schedule = self.pickup.resolve_pickup_schedule(
                    organisation=organisation,
                    product=product,
                    pickup_location=location,
                    request=PickupScheduleRequest(
                        product_id=item.product_id,
                        pickup_location_id=item.pickup_location_id,
                        service_date=item.service_date,
                    ),
                )
                pickup_time = schedule.get("pickup_time") if schedule else None
                pickup_time_confirmed = pickup_time is not None

        status = "valid"
        issues: list[str] = []
        if checked["status"] not in {"available", "limited"}:
            status = checked["status"]
            issues.append("Availability could not be confirmed." if status == "unknown" else "The requested date is unavailable.")
        warnings: list[str] = []
        if pickup_required and not pickup_location_confirmed:
            status = "invalid"
            issues.append("A configured pickup location is required.")
        elif pickup_required and not pickup_time_confirmed:
            warnings.append(
                "The exact pickup time is pending manual confirmation."
            )
        total = checked.get("price_total")
        if total is None and not item.selected_external_option_id:
            total = (
                Decimal(item.adults) * Decimal(product.adult_price)
                + Decimal(item.children) * Decimal(product.child_price)
                + Decimal(item.infants) * Decimal(product.infant_price)
            ) if not option_name else Decimal(unit_price) * item.total_passengers
        start_at = self._combine(item.service_date, product.start_time)
        end_at = self._combine(item.service_date, product.end_time)
        return {
            "organisation_id": organisation.pk,
            "product_id": product.pk,
            "product_name": product.name,
            "service_date": item.service_date,
            "status": status,
            "issues": issues,
            "warnings": warnings,
            "price_total": total,
            "currency": product.currency if total is not None else None,
            "availability_status": checked["status"],
            "pickup_required": pickup_required,
            # Backward-compatible meaning: the required pickup location is
            # valid for this tenant. Exact time confirmation is reported
            # separately and may remain pending at cart creation.
            "pickup_confirmed": pickup_location_confirmed,
            "pickup_time_confirmed": pickup_time_confirmed,
            "pickup_location_name": pickup_name,
            "pickup_time": pickup_time,
            "start_at": start_at,
            "end_at": end_at,
            "public_url": product.public_url,
        }

    @staticmethod
    def _combine(service_date, value):
        return timezone.make_aware(datetime.combine(service_date, value)) if value else None

    @staticmethod
    def _invalid(organisation, item, message):
        return {
            "organisation_id": organisation.pk,
            "product_id": item.product_id,
            "product_name": "Unavailable product",
            "service_date": item.service_date,
            "status": "invalid",
            "issues": [message],
            "warnings": [],
            "price_total": None,
            "currency": None,
            "availability_status": "unknown",
            "pickup_required": False,
            "pickup_confirmed": False,
        }


class DisabledPromotionRepository:
    """Fail closed until an owner-controlled promotion engine is configured."""

    def evaluate_itinerary_promotions(
        self, *, organisation: Any, conversation: Any, request: PromotionEvaluationRequest
    ) -> Mapping[str, Any]:
        raise CustomerAIDjangoAdapterError(
            "Customer promotion evaluation is not configured."
        )


class DisabledCartRepository:
    """Fail closed until checkout validation components are configured."""

    def save_validated_cart(self, **_kwargs):
        raise CustomerCartRepositoryError(
            "Customer cart checkout validation is not configured."
        )


class DjangoCustomerHandoffRepository:
    @transaction.atomic
    def request_handoff(self, *, organisation, conversation, request: HandoffRequest):
        locked = CustomerAIConversation.objects.select_for_update().get(
            pk=conversation.pk, organisation=organisation
        )
        handoff, created = CustomerAIHandoff.objects.get_or_create(
            organisation=organisation,
            idempotency_key=request.idempotency_key,
            defaults={
                "conversation": locked,
                "category": request.category,
                "priority": request.priority,
                "reason": request.reason,
                "customer_message": request.customer_message,
                "requested_at": request.requested_at,
            },
        )
        if handoff.conversation_id != locked.pk:
            raise CustomerAIDjangoAdapterError(
                "The handoff idempotency key belongs to another conversation."
            )
        if locked.status == CustomerAIConversation.STATUS_ACTIVE:
            locked.status = CustomerAIConversation.STATUS_HANDOFF_REQUESTED
            locked.handoff_category = request.category
            locked.handoff_reason = request.reason
            locked.handoff_requested_at = request.requested_at
            locked.save(update_fields=[
                "status", "handoff_category", "handoff_reason",
                "handoff_requested_at", "updated_at",
            ])
        return handoff, locked, created

    @transaction.atomic
    def assign_handoff(self, *, organisation, conversation, handoff, staff_user, assigned_at):
        locked, locked_conversation = self._locks(organisation, conversation, handoff)
        locked.status = CustomerAIHandoff.STATUS_ASSIGNED
        locked.assigned_to = staff_user
        locked.assigned_at = assigned_at
        locked.save()
        locked_conversation.status = CustomerAIConversation.STATUS_HUMAN_OWNED
        locked_conversation.human_owned_at = assigned_at
        locked_conversation.save()
        return locked, locked_conversation

    @transaction.atomic
    def resolve_handoff(self, *, organisation, conversation, handoff, staff_user, resolution, resume_ai, resolved_at):
        locked, locked_conversation = self._locks(organisation, conversation, handoff)
        locked.status = CustomerAIHandoff.STATUS_RESOLVED
        locked.resolution = resolution
        locked.resolved_at = resolved_at
        locked.save()
        locked_conversation.status = (
            CustomerAIConversation.STATUS_ACTIVE
            if resume_ai else CustomerAIConversation.STATUS_CLOSED
        )
        locked_conversation.closed_at = None if resume_ai else resolved_at
        locked_conversation.save()
        return locked, locked_conversation

    @transaction.atomic
    def cancel_handoff(self, *, organisation, conversation, handoff, cancelled_at):
        locked, locked_conversation = self._locks(organisation, conversation, handoff)
        locked.status = CustomerAIHandoff.STATUS_CANCELLED
        locked.cancelled_at = cancelled_at
        locked.save()
        locked_conversation.status = CustomerAIConversation.STATUS_ACTIVE
        locked_conversation.save()
        return locked, locked_conversation

    @staticmethod
    def _locks(organisation, conversation, handoff):
        locked_conversation = CustomerAIConversation.objects.select_for_update().get(
            pk=conversation.pk, organisation=organisation
        )
        locked = CustomerAIHandoff.objects.select_for_update().get(
            pk=handoff.pk,
            organisation=organisation,
            conversation=locked_conversation,
        )
        return locked, locked_conversation


class DjangoCustomerHandoffNotifier:
    def queue_staff_notification(self, **_kwargs) -> bool:
        # The handoff remains visible in the staff queue. A dedicated notifier
        # may replace this adapter later without risking AI ownership resuming.
        return False


class DjangoCustomerStaffAccessPolicy:
    def can_manage_handoff(self, *, organisation: Any, staff_user: Any) -> bool:
        if not getattr(staff_user, "is_authenticated", False):
            return False
        return Membership.objects.filter(
            organisation=organisation,
            user=staff_user,
            is_active=True,
            role__in=("owner", "admin", "manager", "staff"),
        ).exists()


def _load_optional_component(setting_name: str, method_name: str) -> Any | None:
    path = str(getattr(settings, setting_name, "") or "").strip()
    if not path:
        return None
    imported = import_string(path)
    component = imported() if isinstance(imported, type) else imported
    if not callable(getattr(component, method_name, None)):
        raise CustomerAIDjangoAdapterError(
            f"{setting_name} must provide {method_name}()."
        )
    return component


class DjangoCustomerAIDomainAdapterFactory:
    def build_customer_ai_domain_adapters(
        self, *, organisation: Any, conversation: Any
    ) -> CustomerAIDomainAdapters:
        _assert_context(organisation, conversation)
        promotion = _load_optional_component(
            "CUSTOMER_AI_PROMOTION_REPOSITORY",
            "evaluate_itinerary_promotions",
        )
        cart_components = _load_optional_component(
            "CUSTOMER_AI_CART_COMPONENT_FACTORY",
            "build_customer_cart_components",
        )
        if cart_components is not None:
            components = cart_components.build_customer_cart_components(
                organisation=organisation,
                conversation=conversation,
            )
            cart = DjangoCustomerCartService(
                validator=components["validator"],
                checkout_url_builder=components["checkout_url_builder"],
                approval_policy=components["approval_policy"],
            )
        else:
            cart = DisabledCartRepository()

        return CustomerAIDomainAdapters(
            product_repository=DjangoCustomerProductRepository(),
            availability_repository=DjangoCustomerAvailabilityRepository(),
            pickup_repository=DjangoCustomerPickupRepository(),
            itinerary_repository=DjangoCustomerItineraryRepository(),
            promotion_repository=promotion or DisabledPromotionRepository(),
            cart_repository=cart,
            handoff_repository=DjangoCustomerHandoffRepository(),
            handoff_notifier=DjangoCustomerHandoffNotifier(),
            staff_access_policy=DjangoCustomerStaffAccessPolicy(),
            enabled_predicates={
                "evaluate_itinerary_promotions": (
                    lambda **_kwargs: promotion is not None
                ),
                "save_itinerary_cart": (
                    lambda **_kwargs: cart_components is not None
                ),
            },
            allow_write_tools=True,
            clock=timezone.now,
        )


__all__ = [
    "CustomerAIDjangoAdapterError",
    "DjangoCustomerAIDomainAdapterFactory",
    "DjangoCustomerAvailabilityRepository",
    "DjangoCustomerHandoffRepository",
    "DjangoCustomerItineraryRepository",
    "DjangoCustomerPickupRepository",
    "DjangoCustomerProductRepository",
]
