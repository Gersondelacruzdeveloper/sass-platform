import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Plus,
  RefreshCcw,
  Search,
  UserCheck,
  Users,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import EmployeeCard from "../components/EmployeeCard";

import {
  createEmployee,
  getEmployees,
  updateEmployee,
} from "../api/employeesApi";

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

type DiscoEmployee = {
  id: number;
  user?: number | null;
  full_name: string;
  role: EmployeeRole;
  phone?: string;
  is_active: boolean;
};

const roleOptions: { value: EmployeeRole; label: string }[] = [
  { value: "owner", label: "Owner" },
  { value: "manager", label: "Manager" },
  { value: "cashier", label: "Cashier" },
  { value: "bartender", label: "Bartender" },
  { value: "waiter", label: "Waiter" },
  { value: "security", label: "Security" },
  { value: "host", label: "Host" },
  { value: "promoter", label: "Promoter" },
  { value: "inventory_manager", label: "Inventory Manager" },
];

const initialForm = {
  full_name: "",
  role: "waiter" as EmployeeRole,
  phone: "",
  is_active: true,
};

export default function DiscoEmployeesPage() {
  const [employees, setEmployees] = useState<DiscoEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<DiscoEmployee | null>(
    null
  );
  const [form, setForm] = useState(initialForm);

  async function loadEmployees(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data = await getEmployees();
      setEmployees(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error(err);
      setError("Could not load employees.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadEmployees();
  }, []);

  const filteredEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter((employee) =>
      [
        employee.full_name,
        employee.role,
        employee.phone,
        employee.is_active ? "active" : "inactive",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [employees, search]);

  const stats = useMemo(() => {
    const active = employees.filter((employee) => employee.is_active).length;
    const inactive = employees.length - active;
    const managers = employees.filter((employee) =>
      ["owner", "manager"].includes(employee.role)
    ).length;

    return { active, inactive, managers };
  }, [employees]);

  function openCreateModal() {
    setEditingEmployee(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(employee: DiscoEmployee) {
    setEditingEmployee(employee);
    setForm({
      full_name: employee.full_name || "",
      role: employee.role || "waiter",
      phone: employee.phone || "",
      is_active: employee.is_active,
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, form);
      } else {
        await createEmployee(form);
      }

      setModalOpen(false);
      setEditingEmployee(null);
      setForm(initialForm);
      await loadEmployees(true);
    } catch (err) {
      console.error(err);
      setError("Could not save employee.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEmployeeStatus(employee: DiscoEmployee) {
    try {
      setError("");

      await updateEmployee(employee.id, {
        is_active: !employee.is_active,
      });

      await loadEmployees(true);
    } catch (err) {
      console.error(err);
      setError("Could not update employee status.");
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Employees"
        subtitle="Manage disco staff, roles, permissions, and active team members."
        icon={Users}
        actionLabel="New Employee"
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Total Employees"
          value={employees.length}
          icon={Users}
          helper="Registered team members"
        />

        <DiscoStatCard
          title="Active"
          value={stats.active}
          icon={UserCheck}
          helper="Currently active"
        />

        <DiscoStatCard
          title="Inactive"
          value={stats.inactive}
          icon={Users}
          helper="Disabled profiles"
        />

        <DiscoStatCard
          title="Managers"
          value={stats.managers}
          icon={UserCheck}
          helper="Owner and manager roles"
        />
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={() => loadEmployees(true)}
              disabled={refreshing}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCcw
                className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
              />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredEmployees.length === 0 ? (
        <DiscoEmptyState
          icon={Users}
          title="No employees found"
          description="Create staff profiles for cashiers, bartenders, waiters, managers, security, hosts, and inventory staff."
        />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredEmployees.map((employee) => (
            <EmployeeCard
              key={employee.id}
              employee={employee}
              onEdit={() => openEditModal(employee)}
              onToggleStatus={() => toggleEmployeeStatus(employee)}
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingEmployee ? "Edit Employee" : "New Employee"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Add or update employee details for this organisation.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Full Name
                </span>
                <input
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      full_name: e.target.value,
                    }))
                  }
                  required
                  placeholder="Example: Maria Rodriguez"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Role</span>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      role: e.target.value as EmployeeRole,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                >
                  {roleOptions.map((role) => (
                    <option key={role.value} value={role.value}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Phone</span>
                <input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      phone: e.target.value,
                    }))
                  }
                  placeholder="Example: +1 809 000 0000"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    Active Employee
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Inactive employees cannot be used for active operations.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_active: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingEmployee
                  ? "Save Changes"
                  : "Create Employee"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}