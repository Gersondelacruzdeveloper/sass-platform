from rest_framework import permissions

from organisations.models import Membership, Organisation

from .models import Seller


ADMIN_MEMBERSHIP_ROLES = {
    "owner",
    "admin",
    "manager",
}


SELLER_MANAGEMENT_ROLES = {
    "owner",
    "manager",
    "supervisor",
}


def get_organisation_from_view(request, view):
    """
    Resolve organisation safely from the current view/request.

    This matches the TicketingOrganisationMixin used in views.py.
    """

    if hasattr(view, "get_organisation"):
        try:
            organisation = view.get_organisation()

            if organisation:
                return organisation
        except Exception:
            pass

    organisation_slug = (
        getattr(view, "kwargs", {}).get("organisation_slug")
        or getattr(view, "kwargs", {}).get("slug")
        or request.query_params.get("organisation_slug")
        or request.query_params.get("slug")
    )

    if organisation_slug:
        return Organisation.objects.filter(slug=organisation_slug).first()

    if request.user and request.user.is_authenticated:
        return getattr(request.user, "organisation", None)

    return None


def get_user_membership(user, organisation):
    if not user or not user.is_authenticated or not organisation:
        return None

    return Membership.objects.filter(
        user=user,
        organisation=organisation,
        is_active=True,
    ).first()


def get_user_seller(user, organisation):
    if not user or not user.is_authenticated or not organisation:
        return None

    return Seller.objects.filter(
        user=user,
        organisation=organisation,
        is_active=True,
    ).first()


def is_platform_admin(user):
    return bool(
        user
        and user.is_authenticated
        and (user.is_staff or user.is_superuser)
    )


def is_same_organisation_user(user, organisation):
    if not user or not user.is_authenticated or not organisation:
        return False

    return getattr(user, "organisation_id", None) == organisation.id


def is_organisation_admin(user, organisation):
    """
    Allows:
    - Django staff/superuser
    - Membership owner/admin/manager
    - fallback: user.organisation == organisation

    The fallback keeps compatibility with your current SaaS pattern where
    CustomUser has a direct organisation field.
    """

    if is_platform_admin(user):
        return True

    if not user or not user.is_authenticated or not organisation:
        return False

    membership = get_user_membership(user, organisation)

    if membership and membership.role in ADMIN_MEMBERSHIP_ROLES:
        return True

    return is_same_organisation_user(user, organisation)


def seller_has_permission(user, organisation, permission_name):
    seller = get_user_seller(user, organisation)

    if not seller:
        return False

    return seller.has_permission(permission_name)


class IsTicketingAuthenticated(permissions.BasePermission):
    """
    Basic auth permission for private ticketing endpoints.
    """

    message = "Authentication is required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class HasTicketingOrganisationAccess(permissions.BasePermission):
    """
    Allows access if the user belongs to the organisation or has an active Seller profile.
    Useful for shared private endpoints.
    """

    message = "You do not have access to this organisation."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        seller = get_user_seller(request.user, organisation)

        return bool(seller and seller.is_active)


class IsTicketingAdminOrManager(permissions.BasePermission):
    """
    Owner/admin/manager-level access.
    Use this for settings, integrations, reports, sellers, and product management.
    """

    message = "You need owner, admin, or manager access for this action."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        return is_organisation_admin(request.user, organisation)


class HasTicketingSellerPermission(permissions.BasePermission):
    """
    Checks seller permission flags from the Seller model.

    In the view, set:

        ticketing_permission_required = "can_create_bookings"

    or:

        ticketing_permission_by_action = {
            "create": "can_create_bookings",
            "cancel": "can_cancel_bookings",
        }

    Admin/manager users are allowed automatically.
    """

    message = "You do not have permission to perform this ticketing action."

    def get_required_permission(self, view):
        action = getattr(view, "action", None)

        permission_by_action = getattr(
            view,
            "ticketing_permission_by_action",
            {},
        )

        if action and action in permission_by_action:
            return permission_by_action[action]

        return getattr(view, "ticketing_permission_required", None)

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        required_permission = self.get_required_permission(view)

        if not required_permission:
            return True

        return seller_has_permission(
            request.user,
            organisation,
            required_permission,
        )


class CanManageTicketingSettings(permissions.BasePermission):
    message = "You do not have permission to manage ticketing settings."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_manage_settings",
        )


class CanManageTicketingIntegrations(permissions.BasePermission):
    message = "You do not have permission to manage ticketing integrations."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_manage_integrations",
        )


class CanManageTicketingProducts(permissions.BasePermission):
    message = "You do not have permission to manage ticketing products."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_manage_products",
        )


class CanManageTicketingSellers(permissions.BasePermission):
    message = "You do not have permission to manage ticketing sellers."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_manage_sellers",
        )


class CanViewTicketingReports(permissions.BasePermission):
    message = "You do not have permission to view ticketing reports."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_view_reports",
        )


class CanCreateTicketingBookings(permissions.BasePermission):
    message = "You do not have permission to create bookings."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_create_bookings",
        )


class CanCancelTicketingBookings(permissions.BasePermission):
    message = "You do not have permission to cancel bookings."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_cancel_bookings",
        )


class CanOverridePickupTime(permissions.BasePermission):
    message = "You do not have permission to override pickup time."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_override_pickup_time",
        )


class CanAccessSellerDashboard(permissions.BasePermission):
    message = "You do not have access to the seller dashboard."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return seller_has_permission(
            request.user,
            organisation,
            "can_access_dashboard",
        )


class CanUseWelletIntegration(permissions.BasePermission):
    """
    Allows Wellet only if:
    - organisation has TicketingSettings.wellet_enabled=True
    - user is admin/manager or seller has can_sell_cocobongo / can_manage_integrations
    """

    message = "Wellet / Coco Bongo is not enabled or you do not have permission."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)

        if not organisation:
            return False

        ticketing_settings = getattr(
            organisation,
            "ticketing_settings",
            None,
        )

        if not ticketing_settings or not ticketing_settings.wellet_enabled:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        return (
            seller_has_permission(
                request.user,
                organisation,
                "can_sell_cocobongo",
            )
            or seller_has_permission(
                request.user,
                organisation,
                "can_manage_integrations",
            )
        )


class IsPublicTicketingEndpoint(permissions.BasePermission):
    """
    Public endpoints: public website, public products, public booking checkout,
    SEO, sitemap and robots.txt.
    """

    def has_permission(self, request, view):
        return True