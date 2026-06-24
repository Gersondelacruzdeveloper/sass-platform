// src/modules/disco/pages/DiscoEmployeesPage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Image as ImageIcon,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
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

import {
  getDiscoSettings,
  type DiscoSettings,
} from "../api/settingsApi";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

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

type EmployeePermissions = Record<EmployeePermissionKey, boolean>;

type DiscoEmployee = {
  id: number;
  user?: number | null;
  username?: string;
  email?: string;

  full_name: string;
  role: EmployeeRole;
  phone?: string;

  daily_pay?: string | number;
  start_date?: string | null;
  end_date?: string | null;

  permissions?: Partial<EmployeePermissions>;

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
  daily_pay: string;
  start_date: string;
  end_date: string;
  photo: File | null;
  photoPreview: string;
  is_active: boolean;
  permissions: EmployeePermissions;
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

const permissionLabels: Record<
  EmployeePermissionKey,
  {
    label: string;
    description: string;
    group: "access" | "management" | "cash" | "reports";
  }
> = {
  can_access_dashboard: {
    label: "Acceder al dashboard",
    description: "Puede ver el resumen principal del negocio.",
    group: "access",
  },
  can_access_pos: {
    label: "Acceder al POS",
    description: "Puede vender, agregar productos y trabajar cuentas.",
    group: "access",
  },
  can_manage_products: {
    label: "Manejar productos",
    description: "Puede crear, editar y eliminar productos.",
    group: "management",
  },
  can_manage_inventory: {
    label: "Manejar inventario",
    description: "Puede registrar entradas, salidas, pérdidas y ajustes.",
    group: "management",
  },
  can_manage_employees: {
    label: "Manejar empleados",
    description: "Puede crear empleados, logins y modificar permisos.",
    group: "management",
  },
  can_manage_tables: {
    label: "Manejar mesas",
    description: "Puede crear, editar y administrar mesas.",
    group: "management",
  },
  can_manage_reservations: {
    label: "Manejar reservaciones",
    description: "Puede crear, confirmar o cancelar reservaciones.",
    group: "management",
  },
  can_manage_expenses: {
    label: "Manejar gastos",
    description: "Puede registrar y editar gastos del negocio.",
    group: "management",
  },
  can_view_reports: {
    label: "Ver reportes",
    description: "Puede ver ventas, costos, nómina y ganancias.",
    group: "reports",
  },
  can_manage_settings: {
    label: "Manejar configuración",
    description: "Puede cambiar impuesto, moneda y configuración general.",
    group: "management",
  },
  can_view_activity_logs: {
    label: "Ver actividad",
    description: "Puede ver el historial de acciones del sistema.",
    group: "reports",
  },
  can_open_cash_shift: {
    label: "Abrir caja",
    description: "Puede iniciar un turno de caja.",
    group: "cash",
  },
  can_close_cash_shift: {
    label: "Cerrar caja",
    description: "Puede cerrar un turno de caja.",
    group: "cash",
  },
  can_apply_discounts: {
    label: "Aplicar descuentos",
    description: "Puede aplicar descuentos en ventas y cuentas.",
    group: "cash",
  },
  can_cancel_sales: {
    label: "Cancelar ventas/cuentas",
    description: "Puede cancelar cuentas abiertas o ventas cuando aplique.",
    group: "cash",
  },
};

const roleDefaultPermissions: Record<EmployeeRole, EmployeePermissions> = {
  owner: {
    can_access_dashboard: true,
    can_access_pos: true,
    can_manage_products: true,
    can_manage_inventory: true,
    can_manage_employees: true,
    can_manage_tables: true,
    can_manage_reservations: true,
    can_manage_expenses: true,
    can_view_reports: true,
    can_manage_settings: true,
    can_view_activity_logs: true,
    can_open_cash_shift: true,
    can_close_cash_shift: true,
    can_apply_discounts: true,
    can_cancel_sales: true,
  },
  manager: {
    can_access_dashboard: true,
    can_access_pos: true,
    can_manage_products: true,
    can_manage_inventory: true,
    can_manage_employees: true,
    can_manage_tables: true,
    can_manage_reservations: true,
    can_manage_expenses: true,
    can_view_reports: true,
    can_manage_settings: false,
    can_view_activity_logs: true,
    can_open_cash_shift: true,
    can_close_cash_shift: true,
    can_apply_discounts: true,
    can_cancel_sales: true,
  },
  cashier: {
    can_access_dashboard: true,
    can_access_pos: true,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: true,
    can_manage_reservations: false,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: true,
    can_close_cash_shift: true,
    can_apply_discounts: true,
    can_cancel_sales: false,
  },
  bartender: {
    can_access_dashboard: false,
    can_access_pos: true,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: true,
    can_manage_reservations: false,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
  waiter: {
    can_access_dashboard: false,
    can_access_pos: true,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: true,
    can_manage_reservations: false,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
  security: {
    can_access_dashboard: false,
    can_access_pos: false,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: false,
    can_manage_reservations: false,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
  host: {
    can_access_dashboard: false,
    can_access_pos: false,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: true,
    can_manage_reservations: true,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
  promoter: {
    can_access_dashboard: false,
    can_access_pos: false,
    can_manage_products: false,
    can_manage_inventory: false,
    can_manage_employees: false,
    can_manage_tables: false,
    can_manage_reservations: true,
    can_manage_expenses: false,
    can_view_reports: false,
    can_manage_settings: false,
    can_view_activity_logs: false,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
  inventory_manager: {
    can_access_dashboard: true,
    can_access_pos: false,
    can_manage_products: true,
    can_manage_inventory: true,
    can_manage_employees: false,
    can_manage_tables: false,
    can_manage_reservations: false,
    can_manage_expenses: false,
    can_view_reports: true,
    can_manage_settings: false,
    can_view_activity_logs: true,
    can_open_cash_shift: false,
    can_close_cash_shift: false,
    can_apply_discounts: false,
    can_cancel_sales: false,
  },
};

const permissionGroupLabels: Record<
  "access" | "management" | "cash" | "reports",
  string
> = {
  access: "Acceso",
  management: "Administración",
  cash: "Caja y ventas",
  reports: "Reportes y auditoría",
};

const roleOptions: { value: EmployeeRole; translationKey: string }[] = [
  { value: "owner", translationKey: "employees.role.owner" },
  { value: "manager", translationKey: "employees.role.manager" },
  { value: "cashier", translationKey: "employees.role.cashier" },
  { value: "bartender", translationKey: "employees.role.bartender" },
  { value: "waiter", translationKey: "employees.role.waiter" },
  { value: "security", translationKey: "employees.role.security" },
  { value: "host", translationKey: "employees.role.host" },
  { value: "promoter", translationKey: "employees.role.promoter" },
  {
    value: "inventory_manager",
    translationKey: "employees.role.inventory_manager",
  },
];

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function getDefaultPermissions(role: EmployeeRole): EmployeePermissions {
  return { ...roleDefaultPermissions[role] };
}

function getEmployeePermissions(employee: DiscoEmployee): EmployeePermissions {
  const defaults = getDefaultPermissions(employee.role || "waiter");
  const apiPermissions = employee.permissions || {};

  const permissions = { ...defaults };

  permissionKeys.forEach((key) => {
    if (typeof apiPermissions[key] === "boolean") {
      permissions[key] = Boolean(apiPermissions[key]);
    } else if (typeof employee[key] === "boolean") {
      permissions[key] = Boolean(employee[key]);
    }
  });

  return permissions;
}

function createInitialForm(): EmployeeForm {
  return {
    full_name: "",
    username: "",
    email: "",
    password: "",
    create_login: false,
    role: "waiter",
    phone: "",
    daily_pay: "0.00",
    start_date: todayISODate(),
    end_date: "",
    photo: null,
    photoPreview: "",
    is_active: true,
    permissions: getDefaultPermissions("waiter"),
  };
}

const initialForm = createInitialForm();

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

function getEmployeeRoleLabel(
  role: EmployeeRole,
  t: (key: string, fallback?: string) => string
) {
  return t(`employees.role.${role}`, role.replace(/_/g, " "));
}

function formatMoney(
  value?: string | number | null,
  language: DiscoLanguage = "en",
  currencySymbol = "RD$"
) {
  const locale = language === "es" ? "es-DO" : "en-US";

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

  return `${currencySymbol} ${formatted}`;
}

function getErrorMessage(
  err: any,
  t: (key: string, fallback?: string) => string
) {
  const data = err?.response?.data;

  if (!data) return t("employees.errorSave");

  if (typeof data === "string") return data;

  return (
    data.detail ||
    data.non_field_errors?.[0] ||
    data.full_name?.[0] ||
    data.role?.[0] ||
    data.phone?.[0] ||
    data.daily_pay?.[0] ||
    data.start_date?.[0] ||
    data.end_date?.[0] ||
    data.photo?.[0] ||
    data.login_email?.[0] ||
    data.login_username?.[0] ||
    data.login_password?.[0] ||
    t("employees.errorSave")
  );
}

export default function DiscoEmployeesPage() {
  const { language, t } = useDiscoTranslation();

  const [employees, setEmployees] = useState<DiscoEmployee[]>([]);
  const [discoSettings, setDiscoSettings] = useState<DiscoSettings | null>(
    null
  );

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

  const currencySymbol = discoSettings?.currency_symbol || "RD$";

  async function loadEmployees(isRefresh = false) {
    try {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const data = await getEmployees();

      setEmployees(data);
    } catch (err) {
      console.error(err);
      setError(t("employees.errorLoad"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    async function loadSettings() {
      try {
        const settings = await getDiscoSettings();
        setDiscoSettings(settings);
      } catch (err) {
        console.error("Could not load disco settings:", err);
      }
    }

    loadSettings();
    loadEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        getEmployeeRoleLabel(employee.role, t),
        employee.phone,
        employee.daily_pay,
        employee.start_date,
        employee.end_date,
        employee.user ? "login account" : "no login",
        employee.user
          ? t("employees.search.loginAccount")
          : t("employees.search.noLogin"),
        employee.is_active ? "active" : "inactive",
        employee.is_active
          ? t("employees.search.active")
          : t("employees.search.inactive"),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [employees, search, t]);

  const stats = useMemo(() => {
    const activeEmployees = employees.filter((employee) => employee.is_active);
    const active = activeEmployees.length;
    const inactive = employees.length - active;
    const managers = employees.filter((employee) =>
      ["owner", "manager"].includes(employee.role)
    ).length;
    const userLogins = employees.filter((employee) => employee.user).length;

    const dailyPayroll = activeEmployees.reduce((sum, employee) => {
      return sum + Number(employee.daily_pay || 0);
    }, 0);

    return { active, inactive, managers, userLogins, dailyPayroll };
  }, [employees]);

  function openCreateModal() {
    setEditingEmployee(null);
    setForm(createInitialForm());
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
      daily_pay: String(employee.daily_pay ?? "0.00"),
      start_date: employee.start_date || todayISODate(),
      end_date: employee.end_date || "",
      photo: null,
      photoPreview: getEmployeeDisplayImage(employee),
      is_active: employee.is_active,
      permissions: getEmployeePermissions(employee),
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (form.photoPreview.startsWith("blob:")) {
      URL.revokeObjectURL(form.photoPreview);
    }

    setModalOpen(false);
    setEditingEmployee(null);
    setForm(createInitialForm());
  }

  function handleRoleChange(role: EmployeeRole) {
    setForm((prev) => ({
      ...prev,
      role,
      permissions: getDefaultPermissions(role),
    }));
  }

  function togglePermission(permission: EmployeePermissionKey) {
    setForm((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        [permission]: !prev.permissions[permission],
      },
    }));
  }

  function selectAllPermissions() {
    setForm((prev) => ({
      ...prev,
      permissions: permissionKeys.reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as EmployeePermissions),
    }));
  }

  function resetPermissionsForRole() {
    setForm((prev) => ({
      ...prev,
      permissions: getDefaultPermissions(prev.role),
    }));
  }

  function clearAllPermissions() {
    setForm((prev) => ({
      ...prev,
      permissions: permissionKeys.reduce((acc, key) => {
        acc[key] = false;
        return acc;
      }, {} as EmployeePermissions),
    }));
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setError(t("employees.errorInvalidPhoto"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError(t("employees.errorPhotoTooLarge"));
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
      payload.append("daily_pay", form.daily_pay || "0.00");
      payload.append("start_date", form.start_date || todayISODate());
      payload.append("end_date", form.end_date || "");
      payload.append("is_active", String(form.is_active));
      payload.append("create_login", String(form.create_login));

      permissionKeys.forEach((key) => {
        payload.append(key, String(form.permissions[key]));
      });

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
      setError(getErrorMessage(err, t));
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
      setError(t("employees.errorUpdateStatus"));
    }
  }

  const groupedPermissionKeys = useMemo(() => {
    return permissionKeys.reduce(
      (acc, key) => {
        const group = permissionLabels[key].group;

        if (!acc[group]) {
          acc[group] = [];
        }

        acc[group].push(key);
        return acc;
      },
      {} as Record<"access" | "management" | "cash" | "reports", EmployeePermissionKey[]>
    );
  }, []);

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("employees.title")}
        subtitle={t("employees.subtitle")}
        icon={Users}
        actionLabel={t("employees.newEmployee")}
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("employees.totalEmployees")}
          value={employees.length}
          icon={Users}
          helper={t("employees.registeredTeamMembers")}
        />

        <DiscoStatCard
          title={t("employees.active")}
          value={stats.active}
          icon={UserCheck}
          helper={t("employees.currentlyActive")}
        />

        <DiscoStatCard
          title="Nómina diaria"
          value={formatMoney(stats.dailyPayroll, language, currencySymbol)}
          icon={Banknote}
          helper="Suma del pago diario de empleados activos"
        />

        <DiscoStatCard
          title={t("employees.userLogins")}
          value={stats.userLogins}
          icon={UserCog}
          helper={t("employees.canAccessSystem")}
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
              placeholder={t("employees.searchPlaceholder")}
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
              {t("pos.refresh")}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("employees.add")}
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
          title={t("employees.noEmployeesFound")}
          description={t("employees.noEmployeesFoundDescription")}
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
            className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:max-w-3xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingEmployee
                    ? t("employees.editEmployee")
                    : t("employees.newEmployee")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("employees.modalSubtitle")}
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

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <div className="space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("employees.fullName")}
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
                    placeholder={t("employees.fullNamePlaceholder")}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("employees.role")}
                  </span>

                  <select
                    value={form.role}
                    onChange={(e) =>
                      handleRoleChange(e.target.value as EmployeeRole)
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                  >
                    {roleOptions.map((role) => (
                      <option key={role.value} value={role.value}>
                        {t(role.translationKey)}
                      </option>
                    ))}
                  </select>

                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Al cambiar el rol, se aplican los permisos recomendados para
                    ese puesto.
                  </p>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("employees.phone")}
                  </span>

                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        phone: e.target.value,
                      }))
                    }
                    placeholder={t("employees.phonePlaceholder")}
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Pago diario
                  </span>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.daily_pay}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        daily_pay: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                  />

                  <p className="mt-1 text-xs font-semibold text-slate-500">
                    Este monto se usará en reportes y cierre para calcular la
                    nómina diaria.
                  </p>
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Fecha de inicio
                    </span>

                    <input
                      type="date"
                      value={form.start_date}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          start_date: e.target.value,
                        }))
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Fecha de salida
                    </span>

                    <input
                      type="date"
                      value={form.end_date}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          end_date: e.target.value,
                        }))
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
                    />

                    <p className="mt-1 text-xs font-semibold text-slate-500">
                      Déjalo vacío si todavía está activo.
                    </p>
                  </label>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {t("employees.employeePhoto")}
                      </p>

                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {t("employees.employeePhotoDescription")}
                      </p>
                    </div>

                    <ImageIcon className="h-5 w-5 text-slate-400" />
                  </div>

                  <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-24 w-24 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                      {form.photoPreview ? (
                        <img
                          src={form.photoPreview}
                          alt={form.full_name || t("employees.employeePreview")}
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
                        {t("employees.uploadPhoto")}

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
                          {t("employees.reset")}
                        </button>
                      )}

                      <p className="text-xs font-medium text-slate-500">
                        {t("employees.imageHelp")}
                      </p>
                    </div>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {t("employees.createLoginAccount")}
                    </p>

                    <p className="text-xs font-medium text-slate-500">
                      {t("employees.createLoginDescription")}
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
                        {t("employees.loginDetails")}
                      </h3>

                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {t("employees.loginDetailsDescription")}
                      </p>
                    </div>

                    <label className="block">
                      <span className="text-sm font-bold text-slate-700">
                        {t("employees.username")}
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
                        placeholder={t("employees.usernamePlaceholder")}
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-slate-700">
                        {t("employees.email")}
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
                        placeholder={t("employees.emailPlaceholder")}
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-bold text-slate-700">
                        {t("employees.password")}
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
                            ? t("employees.passwordPlaceholderExisting")
                            : t("employees.passwordPlaceholderNew")
                        }
                        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold outline-none transition focus:border-slate-400"
                      />
                    </label>
                  </div>
                )}

                <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {t("employees.activeEmployee")}
                    </p>

                    <p className="text-xs font-medium text-slate-500">
                      {t("employees.activeEmployeeDescription")}
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

              <div className="space-y-4">
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-slate-700" />

                        <h3 className="text-sm font-black text-slate-950">
                          Permisos del usuario
                        </h3>
                      </div>

                      <p className="mt-1 text-xs font-medium text-slate-500">
                        Define qué puede hacer este empleado dentro del sistema.
                        Los permisos se guardan en backend.
                      </p>
                    </div>
                  </div>

                  {!form.create_login && (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                      Este empleado no tiene cuenta de login. Los permisos se
                      guardarán, pero solo se aplicarán cuando tenga acceso al
                      sistema.
                    </div>
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      onClick={resetPermissionsForRole}
                      className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                    >
                      Rol recomendado
                    </button>

                    <button
                      type="button"
                      onClick={selectAllPermissions}
                      className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                    >
                      Marcar todo
                    </button>

                    <button
                      type="button"
                      onClick={clearAllPermissions}
                      className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100"
                    >
                      Quitar todo
                    </button>
                  </div>

                  <div className="mt-5 space-y-5">
                    {(["access", "cash", "management", "reports"] as const).map(
                      (group) => (
                        <div key={group}>
                          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
                            {permissionGroupLabels[group]}
                          </p>

                          <div className="space-y-2">
                            {(groupedPermissionKeys[group] || []).map((key) => {
                              const permission = permissionLabels[key];

                              return (
                                <label
                                  key={key}
                                  className={`flex cursor-pointer items-start justify-between gap-3 rounded-2xl border p-3 transition ${
                                    form.permissions[key]
                                      ? "border-slate-300 bg-white"
                                      : "border-slate-200 bg-white/60"
                                  }`}
                                >
                                  <div>
                                    <p className="text-sm font-black text-slate-900">
                                      {permission.label}
                                    </p>

                                    <p className="mt-0.5 text-xs font-medium text-slate-500">
                                      {permission.description}
                                    </p>
                                  </div>

                                  <input
                                    type="checkbox"
                                    checked={form.permissions[key]}
                                    onChange={() => togglePermission(key)}
                                    className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300"
                                  />
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? t("employees.saving")
                : editingEmployee
                  ? t("employees.saveChanges")
                  : t("employees.createEmployee")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
