import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Image as ImageIcon,
  Plus,
  RefreshCcw,
  Search,
  UserCheck,
  UserCog,
  Upload,
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

  // Backend display fields from your serializer
  profile_image_url?: string | null;
  user_avatar_url?: string | null;
  employee_photo_url?: string | null;

  // Optional fallback fields, in case older API data still returns them
  photo?: string | null;
  photo_url?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;

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
  photo: File | null;
  photoPreview: string;
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
  photo: null,
  photoPreview: "",
  is_active: true,
};

function getApiOrigin() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ||
    "http://127.0.0.1:8000"
  );
}

function resolveImageUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiOrigin();
  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function getEmployeeDisplayImage(employee?: DiscoEmployee | null) {
  if (!employee) return "";

  return resolveImageUrl(
    employee.profile_image_url ||
      employee.employee_photo_url ||
      employee.user_avatar_url ||
      employee.photo_url ||
      employee.photo ||
      employee.avatar_url ||
      employee.avatar ||
      ""
  );
}

function getErrorMessage(err: any) {
  const data = err?.response?.data;

  if (!data) return "Could not save employee.";

  if (typeof data === "string") return data;

  return (
    data.detail ||
    data.non_field_errors?.[0] ||
    data.full_name?.[0] ||
    data.role?.[0] ||
    data.phone?.[0] ||
    data.photo?.[0] ||
    data.login_email?.[0] ||
    data.login_username?.[0] ||
    data.login_password?.[0] ||
    "Could not save employee."
  );
}

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

      // Temporary debug. Remove later when everything is confirmed.
      console.log("Employees API response:", data);

      setEmployees(data);
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
      photo: null,
      photoPreview: getEmployeeDisplayImage(employee),
      is_active: employee.is_active,
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (form.photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(form.photoPreview);
    }

    setModalOpen(false);
    setEditingEmployee(null);
    setForm(initialForm);
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError("Please upload a valid employee photo.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError("The employee photo must be 5MB or smaller.");
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setForm((prev) => {
      if (prev.photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.photoPreview);
      }

      return {
        ...prev,
        photo: file,
        photoPreview: previewUrl,
      };
    });
  }

  function removeSelectedPhoto() {
    setForm((prev) => {
      if (prev.photoPreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.photoPreview);
      }

      return {
        ...prev,
        photo: null,
        photoPreview: getEmployeeDisplayImage(editingEmployee),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setError("");

      const payload = new FormData();

      payload.append("full_name", form.full_name.trim());
      payload.append("role", form.role);
      payload.append("phone", form.phone.trim());
      payload.append("is_active", String(form.is_active));
      payload.append("create_login", String(form.create_login));

      if (form.create_login) {
        payload.append("login_username", form.username.trim());
        payload.append("login_email", form.email.trim());

        if (form.password) {
          payload.append("login_password", form.password);
        }
      }

      // IMPORTANT:
      // Your backend serializer expects the uploaded image field to be called "photo".
      if (form.photo) {
        payload.append("photo", form.photo);
      }

      if (editingEmployee) {
        await updateEmployee(editingEmployee.id, payload);
      } else {
        await createEmployee(payload);
      }

      closeModal();
      await loadEmployees(true);
    } catch (err: any) {
      console.error("Employee save error:", err?.response?.data || err);
      setError(getErrorMessage(err));
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
                  Add staff details, profile photo, and optionally create a
                  login account.
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

              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      Employee Photo
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      Optional. Use this to identify staff, even when they do
                      not have a login account.
                    </p>
                  </div>

                  <ImageIcon className="h-5 w-5 text-slate-400" />
                </div>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="h-24 w-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {form.photoPreview ? (
                      <img
                        src={form.photoPreview}
                        alt={form.full_name || "Employee preview"}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <Users className="h-8 w-8" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                      <Upload className="h-4 w-4" />
                      Upload Photo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handlePhotoChange}
                        className="hidden"
                      />
                    </label>

                    {form.photoPreview && (
                      <button
                        type="button"
                        onClick={removeSelectedPhoto}
                        className="ml-2 inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        Reset
                      </button>
                    )}

                    <p className="text-xs font-medium text-slate-500">
                      JPG, PNG, or WEBP. Maximum size: 5MB.
                    </p>
                  </div>
                </div>
              </div>

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