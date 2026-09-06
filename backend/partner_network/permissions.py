from __future__ import annotations

from organisations.models import Organisation
from rest_framework import permissions

from partner_network.models import ReferralPartnerAccess
from partner_network.services.settings_service import is_partner_network_enabled
from ticketing.permissions import is_organisation_admin


def resolve_partner_network_organisation(request, view=None):
    kwargs = getattr(view, "kwargs", {}) if view is not None else {}
    slug = (
        kwargs.get("organisation_slug")
        or request.query_params.get("organisation_slug")
        or request.query_params.get("slug")
    )
    if slug:
        return Organisation.objects.filter(slug=slug, is_active=True).first()
    user = getattr(request, "user", None)
    organisation = getattr(user, "organisation", None) if user and user.is_authenticated else None
    if organisation and organisation.is_active:
        return organisation
    return None


def get_referral_partner_access(user, organisation, partner_id=None):
    if not user or not user.is_authenticated or not organisation:
        return None
    queryset = ReferralPartnerAccess.objects.select_related("partner").filter(
        user=user,
        organisation=organisation,
        is_active=True,
        partner__status="active",
    )
    if partner_id:
        queryset = queryset.filter(partner_id=partner_id)
    return queryset.order_by("partner__name", "pk").first()


class IsPartnerNetworkConfigurator(permissions.BasePermission):
    """Allow organisation admins to create/enable the fail-closed settings row."""

    message = "You do not have permission to configure the Partner Network."

    def has_permission(self, request, view):
        organisation = resolve_partner_network_organisation(request, view)
        if not organisation:
            return False
        request.partner_network_organisation = organisation
        return is_organisation_admin(request.user, organisation)


class IsPartnerNetworkOwner(permissions.BasePermission):
    message = "You do not have access to the Partner Network owner portal."

    def has_permission(self, request, view):
        organisation = resolve_partner_network_organisation(request, view)
        if not organisation or not is_partner_network_enabled(organisation):
            return False
        request.partner_network_organisation = organisation
        return is_organisation_admin(request.user, organisation)


class HasReferralPartnerPortalAccess(permissions.BasePermission):
    message = "You do not have access to this referral partner portal."

    def has_permission(self, request, view):
        organisation = resolve_partner_network_organisation(request, view)
        if not organisation or not is_partner_network_enabled(organisation):
            return False
        partner_id = request.query_params.get("partner_id")
        if not partner_id and hasattr(request, "data"):
            partner_id = request.data.get("partner_id")
        access = get_referral_partner_access(request.user, organisation, partner_id=partner_id)
        if not access or not access.can_access_dashboard:
            return False
        request.partner_network_organisation = organisation
        request.referral_partner_access = access
        return True
