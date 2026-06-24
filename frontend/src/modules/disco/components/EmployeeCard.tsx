// src/modules/disco/components/EmployeeCard.tsx

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  User,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";

type Employee = {
  id: number;
  user?: number | null;

  full_name: string;
  role:
    | "owner"
    | "manager"
    | "cashier"
    | "bartender"
    | "waiter"
    | "security"
    | "host"
    | "promoter"
    | "inventory_manager";

  phone?: string;

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

function getEmployeeRoleLabel(
  role: Employee["role"],
  t: (key: string, fallback?: string) => string
) {
  const fallback = role
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return t(`employees.role.${role}`, fallback);
}

export default function EmployeeCard({
  employee,
  onClick,
  onEdit,
  onToggleStatus,
}: EmployeeCardProps) {
  const { t } = useDiscoTranslation();
  const [imageError, setImageError] = useState(false);

  const roleColors: Record<Employee["role"], string> = {
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

            <span
              className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-black ${
                roleColors[employee.role]
              }`}
            >
              {roleLabel}
            </span>
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
        <span>{roleLabel}</span>
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

function Info({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
        {icon}
        {label}
      </div>

      <p className="mt-1 truncate text-sm font-black text-slate-900">
        {value}
      </p>
    </div>
  );
}