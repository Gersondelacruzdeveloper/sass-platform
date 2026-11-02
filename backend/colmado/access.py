from collections.abc import Mapping

from django.core.exceptions import FieldDoesNotExist

from rest_framework.exceptions import PermissionDenied

from .models import Employee, Store


ADMINISTRATIVE_ROLES = frozenset({"owner", "admin"})
OPERATIONAL_ROLES = frozenset(
    {
        "manager",
        "cashier",
        "inventory_manager",
        "accountant",
    }
)

MANAGER_ROLES = frozenset({"manager"})
CASHIER_ROLES = frozenset({"manager", "cashier"})
INVENTORY_ROLES = frozenset({"manager", "inventory_manager"})
FINANCE_ROLES = frozenset({"manager", "accountant"})
SALES_AUDIT_ROLES = frozenset({"manager", "cashier", "accountant"})


def _actions(roles, *names):
    return {name: roles for name in names}


COLMADO_ROLE_POLICY = {
    "StoreViewSet": {
        **_actions(OPERATIONAL_ROLES, "list", "retrieve"),
    },
    "CashRegisterSessionViewSet": {
        **_actions(CASHIER_ROLES, "list", "retrieve", "open", "current", "close"),
    },
    "MasterProductViewSet": {
        **_actions(OPERATIONAL_ROLES, "list", "retrieve", "by_barcode"),
    },
    "InventoryItemViewSet": {
        **_actions(OPERATIONAL_ROLES, "list", "retrieve"),
        **_actions(
            INVENTORY_ROLES,
            "create",
            "update",
            "partial_update",
            "destroy",
            "initial_scan",
            "receive_cases",
            "quantity_from_amount",
            "adjust",
        ),
    },
    "SaleViewSet": {
        **_actions(SALES_AUDIT_ROLES, "list", "retrieve"),
        **_actions(CASHIER_ROLES, "create"),
        **_actions(MANAGER_ROLES, "void"),
    },
    "CustomerViewSet": {
        **_actions(SALES_AUDIT_ROLES, "list", "retrieve", "history"),
        **_actions(
            CASHIER_ROLES,
            "create",
            "update",
            "partial_update",
            "destroy",
            "payments",
        ),
    },
    "CreditTransactionViewSet": {
        **_actions(SALES_AUDIT_ROLES, "list", "retrieve"),
    },
    "EmployeeViewSet": {
        **_actions(FINANCE_ROLES, "list", "retrieve"),
        **_actions(
            MANAGER_ROLES,
            "create",
            "update",
            "partial_update",
        ),
    },
    "PayrollPaymentViewSet": {
        **_actions(FINANCE_ROLES, "list", "retrieve", "create"),
    },
    "ExpenseViewSet": {
        **_actions(
            FINANCE_ROLES,
            "list",
            "retrieve",
            "create",
            "update",
            "partial_update",
            "destroy",
        ),
    },
    "ProfitabilityViewSet": {
        **_actions(FINANCE_ROLES, "list"),
    },
    "SupplierViewSet": {
        **_actions(
            INVENTORY_ROLES,
            "list",
            "retrieve",
            "create",
            "update",
            "partial_update",
            "destroy",
        ),
    },
    "SupplierProductViewSet": {
        **_actions(
            INVENTORY_ROLES,
            "list",
            "retrieve",
            "create",
            "update",
            "partial_update",
            "destroy",
        ),
    },
    "PurchaseOrderViewSet": {
        **_actions(
            INVENTORY_ROLES,
            "list",
            "retrieve",
            "create",
            "receive",
            "cancel",
        ),
    },
    "InventoryMovementViewSet": {
        **_actions(INVENTORY_ROLES, "list", "retrieve"),
    },
    "ReorderSuggestionViewSet": {
        **_actions(INVENTORY_ROLES, "list"),
    },
    "InventoryCountViewSet": {
        **_actions(
            INVENTORY_ROLES,
            "list",
            "retrieve",
            "create",
            "count_item",
            "complete",
            "cancel",
        ),
    },
    "StorefrontViewSet": {
        **_actions(
            MANAGER_ROLES,
            "list",
            "retrieve",
            "create",
            "update",
            "partial_update",
            "destroy",
        ),
    },
    "CustomerOrderViewSet": {
        **_actions(CASHIER_ROLES, "list", "retrieve", "set_status"),
    },
    "DashboardViewSet": {
        **_actions(OPERATIONAL_ROLES, "list"),
    },
}


def resolve_colmado_employee(request, membership):
    """Attach the active employee and assigned store to an operational request."""

    request.colmado_employee = None
    request.colmado_store = None

    if membership.role in ADMINISTRATIVE_ROLES:
        return

    if membership.role not in OPERATIONAL_ROLES:
        raise PermissionDenied(
            "Su rol no tiene acceso a la aplicación Mi Colmado."
        )

    employee = (
        Employee.objects.select_related("store")
        .filter(
            organisation=membership.organisation,
            user=request.user,
            is_active=True,
            store__is_active=True,
        )
        .first()
    )
    if employee is None:
        raise PermissionDenied(
            "Su cuenta no está vinculada a un empleado activo y una sucursal activa."
        )

    request.colmado_employee = employee
    request.colmado_store = employee.store


def enforce_colmado_role(request, view):
    """Use an explicit allow-list; unknown actions remain administrative only."""

    role = request.colmado_membership.role
    if role in ADMINISTRATIVE_ROLES:
        return

    view_policy = COLMADO_ROLE_POLICY.get(view.__class__.__name__, {})
    action = getattr(view, "action", None)
    allowed_roles = view_policy.get(action, frozenset())
    if role not in allowed_roles:
        raise PermissionDenied(
            "Su rol no tiene permiso para realizar esta acción."
        )


def _validate_store_value(value, assigned_store_id):
    if value in (None, ""):
        return

    try:
        requested_store_id = int(value)
    except (TypeError, ValueError):
        return

    if requested_store_id != assigned_store_id:
        raise PermissionDenied(
            "Solo puede trabajar con la sucursal que tiene asignada."
        )


def enforce_assigned_store_input(request):
    """Reject attempts to select a different store in query or request data."""

    assigned_store = getattr(request, "colmado_store", None)
    if assigned_store is None:
        return

    for field_name in ("store", "store_id"):
        _validate_store_value(
            request.query_params.get(field_name),
            assigned_store.id,
        )

    if request.method not in {"POST", "PUT", "PATCH"}:
        return

    data = request.data
    if not isinstance(data, Mapping):
        return

    for field_name in ("store", "store_id"):
        _validate_store_value(data.get(field_name), assigned_store.id)


def scope_queryset_to_assigned_store(queryset, request):
    """Restrict models with a store field to the employee's assigned store."""

    assigned_store = getattr(request, "colmado_store", None)
    if assigned_store is None:
        return queryset

    model = queryset.model
    if model is Store:
        return queryset.filter(pk=assigned_store.pk)

    try:
        model._meta.get_field("store")
    except FieldDoesNotExist:
        return queryset

    return queryset.filter(store_id=assigned_store.pk)


def effective_request_store(request, selected_store=None):
    """Force custom reports and dashboards to the employee's assigned store."""

    assigned_store = getattr(request, "colmado_store", None)
    if assigned_store is not None:
        return assigned_store
    return selected_store
