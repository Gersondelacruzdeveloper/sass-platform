from __future__ import annotations

from partner_network.models import PartnerNetworkSettings


def get_partner_network_settings(organisation):
    if not organisation or not getattr(organisation, "is_active", False):
        return None
    return PartnerNetworkSettings.objects.filter(
        organisation=organisation,
        enabled=True,
    ).first()


def is_partner_network_enabled(organisation) -> bool:
    return get_partner_network_settings(organisation) is not None
