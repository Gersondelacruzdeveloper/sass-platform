from __future__ import annotations

from partner_network.services.attribution_service import get_active_referral_session
from partner_network.services.product_access_service import (
    allowed_product_queryset,
    recommended_product_ids,
)


def get_referral_context(conversation):
    session = get_active_referral_session(conversation)
    if session is None:
        return None
    location = session.partner_location
    products = allowed_product_queryset(
        organisation=conversation.organisation,
        partner=session.partner,
        partner_location=location,
    ).order_by("name")
    return {
        "partner_id": session.partner_id,
        "partner_name": session.partner.name,
        "property_id": location.pk,
        "property_name": location.display_name,
        "pickup_location_id": location.linked_pickup_location_id,
        "pickup_location_name": (
            location.linked_pickup_location.name if location.linked_pickup_location_id else ""
        ),
        "welcome_message": location.welcome_message,
        "property_information": location.property_information,
        "concierge_introduction": location.concierge_introduction,
        "allowed_products": [
            {"id": product.pk, "name": product.name, "product_type": product.product_type}
            for product in products[:100]
        ],
        "recommended_product_ids": recommended_product_ids(
            organisation=conversation.organisation,
            partner=session.partner,
            partner_location=location,
        ),
        "session_id": session.pk,
        "expires_at": session.expires_at.isoformat(),
    }
