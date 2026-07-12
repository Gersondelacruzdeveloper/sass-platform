from rest_framework import permissions

from organisations.models import Membership, Organisation

from .models import BusinessEntityUserAccess, Seller, TicketingBusinessEntity


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

        if seller and seller.is_active:
            return True

        return get_user_business_entity_accesses(
            request.user,
            organisation,
        ).exists()


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

# ============================================================================
# Operations, business entity, admissions, ledger, and settlement permissions
# ============================================================================


BUSINESS_ENTITY_PERMISSION_FIELDS = {
    "can_access_dashboard",
    "can_scan",
    "can_view_today_bookings",
    "can_view_admissions",
    "can_view_customer_contact",
    "can_view_financials",
    "can_view_settlements",
    "can_record_payments",
    "can_reverse_admissions",
    "can_manage_users",
}


OPERATIONS_PERMISSION_ALIASES = {
    # Generic operations aliases mapped to BusinessEntityUserAccess fields.
    "can_access_operations_dashboard": "can_access_dashboard",
    "can_scan_tickets": "can_scan",
    "can_admit_guests": "can_scan",
    "can_view_today_arrivals": "can_view_today_bookings",
    "can_view_partner_admissions": "can_view_admissions",
    "can_view_partner_financials": "can_view_financials",
    "can_view_partner_settlements": "can_view_settlements",
    "can_record_settlement_payments": "can_record_payments",
    "can_reverse_admissions": "can_reverse_admissions",
    "can_manage_business_users": "can_manage_users",
    "can_sync_offline_scans": "can_scan",
}


ADMIN_ONLY_OPERATIONS_PERMISSIONS = {
    "can_manage_business_entities",
    "can_manage_agreements",
    "can_generate_settlements",
    "can_approve_settlements",
    "can_view_ledger",
}


def get_business_entity_from_view(request, view, organisation=None):
    """
    Resolve a TicketingBusinessEntity from the view, URL kwargs, query string,
    request data, or an object already loaded by the view.

    Supported identifiers:
    - business_entity_id
    - entity_id
    - business_entity_slug
    - entity_slug
    - partner_id / partner_slug (backwards-friendly aliases)
    """

    existing = (
        getattr(view, "business_entity", None)
        or getattr(view, "entity", None)
        or getattr(view, "partner", None)
    )
    if isinstance(existing, TicketingBusinessEntity):
        if not organisation or existing.organisation_id == organisation.id:
            return existing

    if hasattr(view, "get_business_entity"):
        try:
            entity = view.get_business_entity()
            if entity and (
                not organisation
                or entity.organisation_id == organisation.id
            ):
                return entity
        except Exception:
            pass

    kwargs = getattr(view, "kwargs", {}) or {}
    request_data = getattr(request, "data", {}) or {}

    entity_id = (
        kwargs.get("business_entity_id")
        or kwargs.get("entity_id")
        or kwargs.get("partner_id")
        or request.query_params.get("business_entity_id")
        or request.query_params.get("entity_id")
        or request.query_params.get("partner_id")
        or request_data.get("business_entity_id")
        or request_data.get("entity_id")
        or request_data.get("partner_id")
    )

    entity_slug = (
        kwargs.get("business_entity_slug")
        or kwargs.get("entity_slug")
        or kwargs.get("partner_slug")
        or request.query_params.get("business_entity_slug")
        or request.query_params.get("entity_slug")
        or request.query_params.get("partner_slug")
        or request_data.get("business_entity_slug")
        or request_data.get("entity_slug")
        or request_data.get("partner_slug")
    )

    queryset = TicketingBusinessEntity.objects.filter(is_active=True)

    if organisation:
        queryset = queryset.filter(organisation=organisation)

    if entity_id:
        try:
            return queryset.filter(pk=entity_id).first()
        except (TypeError, ValueError):
            return None

    if entity_slug:
        return queryset.filter(slug=entity_slug).first()

    return None


def get_user_business_entity_accesses(user, organisation, business_entity=None):
    """
    Return active business-entity access rows for this user and organisation.
    """

    if not user or not user.is_authenticated or not organisation:
        return BusinessEntityUserAccess.objects.none()

    queryset = BusinessEntityUserAccess.objects.filter(
        user=user,
        organisation=organisation,
        business_entity__is_active=True,
        is_active=True,
    ).select_related("business_entity", "user", "organisation")

    if business_entity:
        queryset = queryset.filter(business_entity=business_entity)

    return queryset


def get_user_business_entity_access(user, organisation, business_entity):
    if not business_entity:
        return None

    return get_user_business_entity_accesses(
        user=user,
        organisation=organisation,
        business_entity=business_entity,
    ).first()


def business_entity_has_permission(
    user,
    organisation,
    permission_name,
    business_entity=None,
):
    """
    Check BusinessEntityUserAccess flags.

    When business_entity is omitted, this returns True if the user has the
    requested permission for at least one active entity in the organisation.
    """

    field_name = OPERATIONS_PERMISSION_ALIASES.get(
        permission_name,
        permission_name,
    )

    if field_name not in BUSINESS_ENTITY_PERMISSION_FIELDS:
        return False

    accesses = get_user_business_entity_accesses(
        user=user,
        organisation=organisation,
        business_entity=business_entity,
    )

    return accesses.filter(**{field_name: True}).exists()


def user_has_ticketing_permission(
    user,
    organisation,
    permission_name,
    business_entity=None,
    allow_admin=True,
):
    """
    Unified ticketing permission resolver.

    Resolution order:
    1. Platform / organisation administrator
    2. Seller permission flags
    3. BusinessEntityUserAccess permission flags

    This lets views use one permission system without needing to know whether
    the authenticated user is an owner, seller, venue employee, driver, guide,
    or operator.
    """

    if not user or not user.is_authenticated or not organisation:
        return False

    if allow_admin and is_organisation_admin(user, organisation):
        return True

    if permission_name in ADMIN_ONLY_OPERATIONS_PERMISSIONS:
        return False

    if seller_has_permission(user, organisation, permission_name):
        return True

    return business_entity_has_permission(
        user=user,
        organisation=organisation,
        permission_name=permission_name,
        business_entity=business_entity,
    )


def user_has_any_ticketing_permission(
    user,
    organisation,
    permission_names,
    business_entity=None,
    allow_admin=True,
):
    return any(
        user_has_ticketing_permission(
            user=user,
            organisation=organisation,
            permission_name=permission_name,
            business_entity=business_entity,
            allow_admin=allow_admin,
        )
        for permission_name in permission_names
    )


def user_has_all_ticketing_permissions(
    user,
    organisation,
    permission_names,
    business_entity=None,
    allow_admin=True,
):
    return all(
        user_has_ticketing_permission(
            user=user,
            organisation=organisation,
            permission_name=permission_name,
            business_entity=business_entity,
            allow_admin=allow_admin,
        )
        for permission_name in permission_names
    )


class HasTicketingPermission(permissions.BasePermission):
    """
    Generic permission class for admin, seller, and business-entity users.

    Configure on a view/viewset with:

        ticketing_permission_required = "can_scan_tickets"

    or:

        ticketing_permission_by_action = {
            "list": "can_view_admissions",
            "admit": "can_admit_guests",
            "reverse": "can_reverse_admissions",
        }

    Set ticketing_business_entity_required = True when the action must be tied
    to a specific business entity.
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

        required_permission = self.get_required_permission(view)
        if not required_permission:
            return is_organisation_admin(
                request.user,
                organisation,
            ) or bool(
                get_user_seller(request.user, organisation)
                or get_user_business_entity_accesses(
                    request.user,
                    organisation,
                ).exists()
            )

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        if (
            getattr(view, "ticketing_business_entity_required", False)
            and not business_entity
            and not is_organisation_admin(request.user, organisation)
        ):
            self.message = "A valid business entity is required for this action."
            return False

        return user_has_ticketing_permission(
            user=request.user,
            organisation=organisation,
            permission_name=required_permission,
            business_entity=business_entity,
        )


class HasBusinessEntityAccess(permissions.BasePermission):
    message = "You do not have access to this business entity."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )
        if not business_entity:
            return False

        return get_user_business_entity_access(
            request.user,
            organisation,
            business_entity,
        ) is not None


class CanAccessOperationsDashboard(permissions.BasePermission):
    message = "You do not have access to the operations dashboard."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_access_operations_dashboard",
            business_entity,
        )


class CanScanTickets(permissions.BasePermission):
    message = "You do not have permission to scan tickets."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_scan_tickets",
            business_entity,
        )


class CanAdmitGuests(permissions.BasePermission):
    message = "You do not have permission to admit guests."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_admit_guests",
            business_entity,
        )


class CanReverseAdmissions(permissions.BasePermission):
    message = "You do not have permission to reverse admissions."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_reverse_admissions",
            business_entity,
        )


class CanViewTodayArrivals(permissions.BasePermission):
    message = "You do not have permission to view today's arrivals."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_view_today_arrivals",
            business_entity,
        )


class CanViewAdmissions(permissions.BasePermission):
    message = "You do not have permission to view admissions."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_view_partner_admissions",
            business_entity,
        )


class CanViewPartnerFinancials(permissions.BasePermission):
    message = "You do not have permission to view partner financials."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_view_partner_financials",
            business_entity,
        )


class CanViewSettlements(permissions.BasePermission):
    message = "You do not have permission to view settlements."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_view_partner_settlements",
            business_entity,
        )


class CanRecordSettlementPayments(permissions.BasePermission):
    message = "You do not have permission to record settlement payments."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_record_settlement_payments",
            business_entity,
        )


class CanManageBusinessEntityUsers(permissions.BasePermission):
    message = "You do not have permission to manage business entity users."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        if is_organisation_admin(request.user, organisation):
            return True

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_manage_business_users",
            business_entity,
        )


class CanManageBusinessEntities(permissions.BasePermission):
    message = "You do not have permission to manage business entities."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        return bool(
            organisation
            and is_organisation_admin(request.user, organisation)
        )


class CanManageBusinessAgreements(permissions.BasePermission):
    message = "You do not have permission to manage business agreements."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        return bool(
            organisation
            and is_organisation_admin(request.user, organisation)
        )


class CanGenerateSettlements(permissions.BasePermission):
    message = "You do not have permission to generate settlements."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        return bool(
            organisation
            and is_organisation_admin(request.user, organisation)
        )


class CanApproveSettlements(permissions.BasePermission):
    message = "You do not have permission to approve settlements."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        return bool(
            organisation
            and is_organisation_admin(request.user, organisation)
        )


class CanViewTicketingLedger(permissions.BasePermission):
    message = "You do not have permission to view the ticketing ledger."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        return bool(
            organisation
            and is_organisation_admin(request.user, organisation)
        )


class CanSyncOfflineScans(permissions.BasePermission):
    message = "You do not have permission to synchronize offline scans."

    def has_permission(self, request, view):
        organisation = get_organisation_from_view(request, view)
        if not organisation:
            return False

        business_entity = get_business_entity_from_view(
            request,
            view,
            organisation=organisation,
        )

        if business_entity and not business_entity.allow_offline_scanning:
            return False

        return user_has_ticketing_permission(
            request.user,
            organisation,
            "can_sync_offline_scans",
            business_entity,
        )

