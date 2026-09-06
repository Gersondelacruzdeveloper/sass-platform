from __future__ import annotations

from typing import Any, Mapping

from partner_network.services.attribution_service import get_active_referral_session
from partner_network.services.product_access_service import is_product_allowed
from ticketing.ai.customer.django_tool_adapters import DjangoCustomerAIDomainAdapterFactory
from ticketing.ai.customer.tool_dependencies import CustomerAIDomainAdapters


class _ReferralMixin:
    def __init__(self, delegate, conversation):
        self.delegate = delegate
        self.conversation = conversation

    @property
    def session(self):
        return get_active_referral_session(self.conversation)

    def _allowed_product(self, product) -> bool:
        session = self.session
        if session is None:
            return True
        model = getattr(product, "model", product)
        return is_product_allowed(
            organisation=self.conversation.organisation,
            product=model,
            partner=session.partner,
            partner_location=session.partner_location,
        )


class ReferralAwareProductRepository(_ReferralMixin):
    def search_public_products(self, *, organisation, criteria):
        products = self.delegate.search_public_products(
            organisation=organisation,
            criteria=criteria,
        )
        return [product for product in products if self._allowed_product(product)]

    def get_public_product(self, *, organisation, product_id, language=""):
        product = self.delegate.get_public_product(
            organisation=organisation,
            product_id=product_id,
            language=language,
        )
        return product if product is not None and self._allowed_product(product) else None


class ReferralAwareAvailabilityRepository(_ReferralMixin):
    def get_public_product(self, *, organisation, product_id):
        product = self.delegate.get_public_product(
            organisation=organisation,
            product_id=product_id,
        )
        return product if product is not None and self._allowed_product(product) else None

    def check_availability(self, *, organisation, product, request):
        if not self._allowed_product(product):
            return {
                "product_id": getattr(product, "pk", None),
                "service_date": request.service_date,
                "status": "unavailable",
                "remaining_capacity": None,
                "price_total": None,
                "currency": getattr(product, "currency", "USD"),
                "source": "referral_policy",
                "checked_at": None,
                "notes": "This product is not enabled for this concierge property.",
            }
        return self.delegate.check_availability(
            organisation=organisation,
            product=product,
            request=request,
        )

    def find_available_alternatives(self, *, organisation, request):
        results = self.delegate.find_available_alternatives(
            organisation=organisation,
            request=request,
        )
        filtered = []
        for item in results:
            product = item.get("product") if isinstance(item, Mapping) else None
            if product is not None and self._allowed_product(product):
                filtered.append(item)
        return filtered


class ReferralAwarePickupRepository(_ReferralMixin):
    def search_active_pickup_locations(self, *, organisation, product, search):
        if not self._allowed_product(product):
            return []
        locations = list(
            self.delegate.search_active_pickup_locations(
                organisation=organisation,
                product=product,
                search=search,
            )
        )
        session = self.session
        if session is None or not session.partner_location.linked_pickup_location_id:
            return locations
        pickup_id = session.partner_location.linked_pickup_location_id
        return [location for location in locations if location.pk == pickup_id]

    def get_public_product(self, *, organisation, product_id):
        product = self.delegate.get_public_product(
            organisation=organisation,
            product_id=product_id,
        )
        return product if product is not None and self._allowed_product(product) else None

    def get_active_pickup_location(self, *, organisation, pickup_location_id):
        session = self.session
        if (
            session is not None
            and session.partner_location.linked_pickup_location_id
            and pickup_location_id != session.partner_location.linked_pickup_location_id
        ):
            return None
        return self.delegate.get_active_pickup_location(
            organisation=organisation,
            pickup_location_id=pickup_location_id,
        )

    def resolve_pickup_schedule(self, *, organisation, product, pickup_location, request):
        session = self.session
        if not self._allowed_product(product):
            return None
        if session is not None:
            expected = session.partner_location.linked_pickup_location_id
            if expected and pickup_location.pk != expected:
                return None
        return self.delegate.resolve_pickup_schedule(
            organisation=organisation,
            product=product,
            pickup_location=pickup_location,
            request=request,
        )


class ReferralAwareItineraryRepository(_ReferralMixin):
    def validate_item(self, *, organisation, conversation, item, language):
        result = self.delegate.validate_item(
            organisation=organisation,
            conversation=conversation,
            item=item,
            language=language,
        )
        session = self.session
        if session is None:
            return result

        from ticketing.models import ExperienceProduct

        product = ExperienceProduct.objects.filter(
            organisation=organisation,
            pk=item.product_id,
        ).first()
        if product is None or not self._allowed_product(product):
            result = dict(result or {})
            result["status"] = "invalid"
            result["issues"] = ["This excursion is not enabled for this concierge property."]
            return result
        if getattr(product, "requires_pickup_location", False):
            expected = session.partner_location.linked_pickup_location_id
            if not expected:
                result = dict(result or {})
                result["status"] = "invalid"
                result["issues"] = ["This property does not yet have a configured pickup location."]
                return result
            if item.pickup_location_id != expected:
                result = dict(result or {})
                result["status"] = "invalid"
                result["issues"] = ["Use the pickup location configured for this concierge property."]
                return result
        return result


class PartnerAwareCustomerAIDomainAdapterFactory:
    """Wrap the existing customer-AI adapters only when a referral session exists."""

    def build_customer_ai_domain_adapters(self, *, organisation: Any, conversation: Any):
        base = DjangoCustomerAIDomainAdapterFactory().build_customer_ai_domain_adapters(
            organisation=organisation,
            conversation=conversation,
        )
        if get_active_referral_session(conversation) is None:
            return base
        return CustomerAIDomainAdapters(
            product_repository=ReferralAwareProductRepository(base.product_repository, conversation),
            availability_repository=ReferralAwareAvailabilityRepository(base.availability_repository, conversation),
            pickup_repository=ReferralAwarePickupRepository(base.pickup_repository, conversation),
            itinerary_repository=ReferralAwareItineraryRepository(base.itinerary_repository, conversation),
            promotion_repository=base.promotion_repository,
            cart_repository=base.cart_repository,
            handoff_repository=base.handoff_repository,
            handoff_notifier=base.handoff_notifier,
            staff_access_policy=base.staff_access_policy,
            enabled_predicates=base.enabled_predicates,
            allow_write_tools=base.allow_write_tools,
            clock=base.clock,
        )
