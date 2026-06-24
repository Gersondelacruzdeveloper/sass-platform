// src/modules/disco/components/EmployeeCard.tsx

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Phone,
  Shield,
  User,
  XCircle,
} from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";

type EmployeeRole =
  | "owner"
  | "manager"
  | "cashier"
  | "bartender"
  | "waiter"
  | "security"
  | "host"
  | "promoter"
  | "inventory_manager";

type EmployeePermissionKey =
  | "can_access_dashboard"
  | "can_access_pos"
  | "can_manage_products"
  | "can_manage_inventory"
  | "can_manage_employees"
  | "can_manage_tables"
  | "can_manage_reservations"
  | "can_manage_expenses"
  | "can_view_reports"
  | "can_manage_settings"
  | "can_view_activity_logs"
  | "can_open_cash_shift"
  | "can_close_cash_shift"
  | "can_apply_discounts"
  | "can_cancel_sales";

type EmployeePermissions = Partial<Record<EmployeePermissionKey, boolean>>;

type Employee = {
  id: number;
  user?: number | null;

  full_name: string;
  role: EmployeeRole;

  phone?: string;

  permissions?: EmployeePermissions;

  can_access_dashboard?: boolean;
  can_access_pos?: boolean;
  can_manage_products?: boolean;
  can_manage_inventory?: boolean;
  can_manage_employees?: boolean;
  can_manage_tables?: boolean;
  can_manage_reservations?: boolean;
  can_manage_expenses?: boolean;
  can_view_reports?: boolean;
  can_manage_settings?: boolean;
  can_view_activity_logs?: boolean;
  can_open_cash_shift?: boolean;
  can_close_cash_shift?: boolean;
  can_apply_discounts?: boolean;
  can_cancel_sales?: boolean;

  // Clean backend display field
  profile_image_url?: string | null;

  // Employee profile photo, for employees WITHOUT login
  photo?: string | null;
  photo_url?: string | null;
  employee_photo_url?: string | null;

  // Linked user avatar, for employees WITH login
  avatar?: string | null;
  avatar_url?: string | null;
  user_avatar_url?: string | null;

  is_active: boolean;
};

type EmployeeCardProps = {
  employee: Employee;
  onClick?: (employee: Employee) => void;
  onEdit?: (employee: Employee) => void;
  onToggleStatus?: (employee: Employee) => void;
};

const permissionKeys: EmployeePermissionKey[] = [
  "can_access_dashboard",
  "can_access_pos",
  "can_manage_products",
  "can_manage_inventory",
  "can_manage_employees",
  "can_manage_tables",
  "can_manage_reservations",
  "can_manage_expenses",
  "can_view_reports",
  "can_manage_settings",
  "can_view_activity_logs",
  "can_open_cash_shift",
  "can_close_cash_shift",
  "can_apply_discounts",
  "can_cancel_sales",
];

const permissionPreview: {
  key: EmployeePermissionKey;
  label: string;
}[] = [
  { key: "can_access_pos", label: "POS" },
  { key: "can_manage_tables", label: "Mesas" },
  { key: "can_open_cash_shift", label: "Abrir caja" },
  { key: "can_close_cash_shift", label: "Cerrar caja" },
  { key: "can_apply_discounts", label: "Descuentos" },
  { key: "can_view_reports", label: "Reportes" },
  { key: "can_manage_employees", label: "Empleados" },
  { key: "can_manage_settings", label: "Config." },
];

function getEmployeeRoleLabel(
  role: EmployeeRole,
  t: (key: string, fallback?: string) => string
) {
  const fallback = role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return t(`employees.role.${role}`, fallback);
}

function getPermissionValue(employee: Employee, key: EmployeePermissionKey) {
  if (typeof employee.permissions?.[key] === "boolean") {
    return Boolean(employee.permissions[key]);
  }

  if (typeof employee[key] === "boolean") {
    return Boolean(employee[key]);
  }

  return false;
}

function getActivePermissionCount(employee: Employee) {
  return permissionKeys.filter((key) => getPermissionValue(employee, key))
    .length;
}

export default function EmployeeCard({
  employee,
  onClick,
  onEdit,
  onToggleStatus,
}: EmployeeCardProps) {
  const { t } = useDiscoTranslation();
  const [imageError, setImageError] = useState(false);

  const roleColors: Record<EmployeeRole, string> = {
    owner: "bg-purple-100 text-purple-700",
    manager: "bg-blue-100 text-blue-700",
    cashier: "bg-emerald-100 text-emerald-700",
    bartender: "bg-amber-100 text-amber-700",
    waiter: "bg-cyan-100 text-cyan-700",
    security: "bg-red-100 text-red-700",
    host: "bg-pink-100 text-pink-700",
    promoter: "bg-indigo-100 text-indigo-700",
    inventory_manager: "bg-orange-100 text-orange-700",
  };

  const apiOrigin =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ||
    "http://127.0.0.1:8000";

  const resolveImageUrl = (url?: string | null) => {
    if (!url) return "";

    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("blob:")
    ) {
      return url;
    }

    return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const rawImageUrl = useMemo(() => {
    const hasLogin = Boolean(employee.user);

    if (employee.profile_image_url) {
      return employee.profile_image_url;
    }

    if (hasLogin) {
      return (
        employee.user_avatar_url ||
        employee.avatar_url ||
        employee.avatar ||
        employee.employee_photo_url ||
        employee.photo_url ||
        employee.photo ||
        ""
      );
    }

    return (
      employee.employee_photo_url ||
      employee.photo_url ||
      employee.photo ||
      ""
    );
  }, [employee]);

  const imageUrl = resolveImageUrl(rawImageUrl);

  useEffect(() => {
    setImageError(false);
  }, [imageUrl]);

  const showImage = Boolean(imageUrl) && !imageError;
  const roleLabel = getEmployeeRoleLabel(employee.role, t);
  const activePermissionCount = getActivePermissionCount(employee);

  const enabledPreviewPermissions = permissionPreview.filter((permission) =>
    getPermissionValue(employee, permission.key)
  );

  return (
    <div
      onClick={() => onClick?.(employee)}
      className="group cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {showImage ? (
              <img
                src={imageUrl}
                alt={employee.full_name}
                className="h-full w-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <User size={24} className="text-slate-700" />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-900">
              {employee.full_name}
            </h3>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${
                  roleColors[employee.role]
                }`}
              >
                {roleLabel}
              </span>

              {employee.user ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                  <KeyRound size={12} />
                  Login
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-400">
                  Sin login
                </span>
              )}
            </div>
          </div>
        </div>

        <ChevronRight
          size={18}
          className="shrink-0 text-slate-300 transition group-hover:text-slate-600"
        />
      </div>

      {employee.phone && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Phone size={16} />
          <span>{employee.phone}</span>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Shield size={16} />
        <span>
          {activePermissionCount} permisos activos
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {enabledPreviewPermissions.length ? (
          enabledPreviewPermissions.slice(0, 5).map((permission) => (
            <span
              key={permission.key}
              className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black text-slate-700"
            >
              {permission.label}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-black text-red-700">
            Sin permisos operativos
          </span>
        )}

        {enabledPreviewPermissions.length > 5 && (
          <span className="rounded-full bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-500">
            +{enabledPreviewPermissions.length - 5} más
          </span>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleStatus?.(employee);
          }}
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
            employee.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {employee.is_active ? (
            <>
              <CheckCircle2 size={14} />
              {t("employeeCard.active")}
            </>
          ) : (
            <>
              <XCircle size={14} />
              {t("employeeCard.inactive")}
            </>
          )}
        </button>

        {onEdit && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(employee);
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            {t("employeeCard.edit")}
          </button>
        )}
      </div>
    </div>
  );
}
