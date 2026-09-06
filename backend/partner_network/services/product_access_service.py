from __future__ import annotations

from partner_network.models import ReferralPartner, ReferralProductAccess
from ticketing.models import ExperienceProduct


def allowed_product_queryset(*, organisation, partner=None, partner_location=None):
    base = ExperienceProduct.objects.filter(
        organisation=organisation,
        public_enabled=True,
        status="active",
    )
    rules = ReferralProductAccess.objects.filter(
        organisation=organisation,
        is_active=True,
        product__in=base,
    )

    if (
        partner_location is not None
        and partner_location.product_access_mode == ReferralPartner.PRODUCT_ACCESS_CUSTOM
    ):
        return base.filter(
            pk__in=rules.filter(partner_location=partner_location).values("product_id")
        )

    if (
        partner is not None
        and partner.product_access_mode == ReferralPartner.PRODUCT_ACCESS_CUSTOM
    ):
        return base.filter(
            pk__in=rules.filter(
                partner=partner,
                partner_location__isnull=True,
            ).values("product_id")
        )

    global_rules = rules.filter(partner__isnull=True, partner_location__isnull=True)
    if global_rules.exists():
        return base.filter(pk__in=global_rules.values("product_id"))

    return base


def is_product_allowed(*, organisation, product, partner=None, partner_location=None) -> bool:
    if not product or getattr(product, "organisation_id", None) != organisation.pk:
        return False
    return allowed_product_queryset(
        organisation=organisation,
        partner=partner,
        partner_location=partner_location,
    ).filter(pk=product.pk).exists()


def recommended_product_ids(*, organisation, partner=None, partner_location=None):
    rules = ReferralProductAccess.objects.filter(
        organisation=organisation,
        is_active=True,
        is_recommended=True,
    )
    if partner_location and rules.filter(partner_location=partner_location).exists():
        return list(rules.filter(partner_location=partner_location).values_list("product_id", flat=True))
    if partner and rules.filter(partner=partner, partner_location__isnull=True).exists():
        return list(rules.filter(partner=partner, partner_location__isnull=True).values_list("product_id", flat=True))
    return list(
        rules.filter(partner__isnull=True, partner_location__isnull=True).values_list(
            "product_id", flat=True
        )
    )
