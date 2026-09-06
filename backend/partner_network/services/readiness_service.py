from __future__ import annotations

from partner_network.services.product_access_service import allowed_product_queryset
from ticketing.models import ProductPickupSchedule


def get_location_readiness(location):
    problems: list[str] = []
    partner = location.partner
    organisation = partner.organisation

    if not getattr(organisation, "is_active", False):
        problems.append("organisation_inactive")
    settings_obj = getattr(organisation, "partner_network_settings", None)
    if not settings_obj or not settings_obj.enabled:
        problems.append("network_disabled")
    if partner.status != "active":
        problems.append("partner_not_active")
    if not location.linked_pickup_location_id:
        problems.append("missing_pickup_location")

    products = allowed_product_queryset(
        organisation=organisation,
        partner=partner,
        partner_location=location,
    )
    if not products.exists():
        problems.append("no_available_products")

    if location.linked_pickup_location_id:
        products_requiring_pickup = products.filter(requires_pickup_location=True)
        missing_schedule_ids = [
            product_id
            for product_id in products_requiring_pickup.values_list("id", flat=True)
            if not ProductPickupSchedule.objects.filter(
                product_id=product_id,
                pickup_location_id=location.linked_pickup_location_id,
                is_active=True,
            ).exists()
        ]
        if missing_schedule_ids:
            problems.append("missing_pickup_schedule")

    has_active_qr = location.qr_codes.filter(status="active").exists()
    if location.is_active and not has_active_qr:
        problems.append("invalid_qr")

    if problems:
        status = "problem" if location.is_active else "incomplete"
    else:
        status = "active" if location.is_active else "ready"

    return {
        "status": status,
        "problems": problems,
        "product_count": products.count(),
        "pickup_location_id": location.linked_pickup_location_id,
        "has_active_qr": has_active_qr,
    }
