import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Plus,
  RefreshCcw,
  Search,
  UserCheck,
  UserCog,
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
  username?: string;
  email?: string;
  full_name: string;
  role: EmployeeRole;
  phone?: string;
  is_active: boolean;
};

type EmployeeForm = {
  full_name: string;
  username: string;
  email: string;
  password: string;
  create_login: boolean;
  role: EmployeeRole;
  phone: string;
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

const initialForm: EmployeeForm = {
  full_name: "",
  username: "",
  email: "",
  password: "",
  create_login: false,
  role: "waiter",
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
  const [form, setForm] = useState<EmployeeForm>(initialForm);

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
        employee.username,
        employee.email,
        employee.role,
        employee.phone,
        employee.user ? "login account" : "no login",
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
    const userLogins = employees.filter((employee) => employee.user).length;

    return { active, inactive, managers, userLogins };
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
      username: employee.username || "",
      email: employee.email || "",
      password: "",
      create_login: Boolean(employee.user),
      role: employee.role || "waiter",
      phone: employee.phone || "",
      is_active: employee.is_active,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingEmployee(null);
    setForm(initialForm);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

    const payload = {
    full_name: form.full_name,
    role: form.role,
    phone: form.phone,
    is_active: form.is_active,
    create_login: form.create_login,
    login_username: form.create_login ? form.username : "",
    login_email: form.create_login ? form.email : "",
    login_password: form.create_login ? form.password : "",
    };

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
      } else {
        await createEmployee(payload);
      }

      closeModal();
      await loadEmployees(true);
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.non_field_errors?.[0] ||
          "Could not save employee."
      );
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
        title="Employees & Users"
        subtitle="Manage staff profiles, roles, user logins, permissions, and active team members."
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
          title="User Logins"
          value={stats.userLogins}
          icon={UserCog}
          helper="Can access the system"
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
              placeholder="Search employee, role, email..."
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
          description="Create staff profiles and optional login accounts for cashiers, bartenders, waiters, managers, security, hosts, and inventory staff."
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
            className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingEmployee ? "Edit Employee" : "New Employee"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Add staff details and optionally create a login account.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
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

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div>
                  <p className="text-sm font-black text-slate-950">
                    Create Login Account
                  </p>
                  <p className="text-xs font-medium text-slate-500">
                    Allow this employee to log into the system.
                  </p>
                </div>

                <input
                  type="checkbox"
                  checked={form.create_login}
                  disabled={Boolean(editingEmployee?.user)}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      create_login: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>

              {form.create_login && (
                <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <h3 className="text-sm font-black text-slate-950">
                      Login Details
                    </h3>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      These credentials are used by the employee to access the
                      Disco module.
                    </p>
                  </div>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Username
                    </span>
                    <input
                      value={form.username}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          username: e.target.value,
                        }))
                      }
                      required={form.create_login && !editingEmployee?.user}
                      placeholder="Example: maria.cashier"
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Email
                    </span>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          email: e.target.value,
                        }))
                      }
                      required={form.create_login && !editingEmployee?.user}
                      placeholder="Example: maria@company.com"
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Password
                    </span>
                    <input
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          password: e.target.value,
                        }))
                      }
                      required={form.create_login && !editingEmployee?.user}
                      placeholder={
                        editingEmployee?.user
                          ? "Leave empty to keep current password"
                          : "Create a temporary password"
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                    />
                  </label>
                </div>
              )}

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
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