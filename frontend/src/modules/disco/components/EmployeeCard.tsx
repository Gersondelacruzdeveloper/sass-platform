// src/modules/disco/components/EmployeeCard.tsx

import {
  User,
  Phone,
  Shield,
  CheckCircle2,
  XCircle,
  ChevronRight,
} from "lucide-react";

type Employee = {
  id: number;
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
  is_active: boolean;
};

type EmployeeCardProps = {
  employee: Employee;
  onClick?: (employee: Employee) => void;
  onEdit?: (employee: Employee) => void;
};

export default function EmployeeCard({
  employee,
  onClick,
  onEdit,
}: EmployeeCardProps) {
  const roleColors = {
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

  const formatRole = (role: string) =>
    role
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return (
    <div
      onClick={() => onClick?.(employee)}
      className="group cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <User size={24} className="text-slate-700" />
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
              {formatRole(employee.role)}
            </span>
          </div>
        </div>

        <ChevronRight
          size={18}
          className="text-slate-300 transition group-hover:text-slate-600"
        />
      </div>

      {/* Phone */}
      {employee.phone && (
        <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600">
          <Phone size={16} />
          <span>{employee.phone}</span>
        </div>
      )}

      {/* Role */}
      <div className="mt-3 flex items-center gap-2 text-sm font-semibold text-slate-600">
        <Shield size={16} />
        <span>{formatRole(employee.role)}</span>
      </div>

      {/* Status */}
      <div className="mt-4 flex items-center justify-between">
        <div
          className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black ${
            employee.is_active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {employee.is_active ? (
            <>
              <CheckCircle2 size={14} />
              Active
            </>
          ) : (
            <>
              <XCircle size={14} />
              Inactive
            </>
          )}
        </div>

        {onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(employee);
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  );
}