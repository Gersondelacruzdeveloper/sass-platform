from __future__ import annotations

from ticketing.ai.customer.cart_components import (
    CustomerCartComponents,
    DjangoCustomerCartComponentFactory,
    DjangoCustomerCartValidator,
)
from ticketing.ai.customer.cart_tools import CustomerCartValidationError
from ticketing.models import ExperienceProduct

from partner_network.services.attribution_service import get_active_referral_session
from partner_network.services.product_access_service import is_product_allowed


class ReferralAwareCustomerCartValidator(DjangoCustomerCartValidator):
    def validate_for_checkout(self, *, organisation, conversation, request, checked_at):
        session = get_active_referral_session(conversation)
        if session is not None:
            expected_pickup_id = session.partner_location.linked_pickup_location_id
            products = {
                product.pk: product
                for product in ExperienceProduct.objects.filter(
                    organisation=organisation,
                    pk__in=[item.product_id for item in request.items],
                )
            }
            for item in request.items:
                product = products.get(item.product_id)
                if product is None or not is_product_allowed(
                    organisation=organisation,
                    product=product,
                    partner=session.partner,
                    partner_location=session.partner_location,
                ):
                    raise CustomerCartValidationError(
                        "One or more excursions are not enabled for this concierge property."
                    )
                if getattr(product, "requires_pickup_location", False):
                    if not expected_pickup_id:
                        raise CustomerCartValidationError(
                            "This concierge property does not have a configured pickup location."
                        )
                    if item.pickup_location_id != expected_pickup_id:
                        raise CustomerCartValidationError(
                            "The selected pickup location does not match this concierge property."
                        )
        return super().validate_for_checkout(
            organisation=organisation,
            conversation=conversation,
            request=request,
            checked_at=checked_at,
        )


class PartnerAwareCustomerCartComponentFactory(DjangoCustomerCartComponentFactory):
    def build_customer_cart_components(self, *, organisation, conversation):
        base = super().build_customer_cart_components(
            organisation=organisation,
            conversation=conversation,
        )
        if get_active_referral_session(conversation) is None:
            return base
        return CustomerCartComponents(
            validator=ReferralAwareCustomerCartValidator(),
            checkout_url_builder=base.checkout_url_builder,
            approval_policy=base.approval_policy,
        )
