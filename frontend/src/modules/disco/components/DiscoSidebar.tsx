// src/modules/disco/components/DiscoSidebar.tsx

import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Music4,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Table2,
  UserCircle,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import api from "../../../api/axios";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { logoutUser } from "../../../features/auth/authSlice";
import { getPublicDiscoBranding } from "../api/brandingApi";
import {
  getCurrentDiscoEmployee,
  type DiscoEmployee,
  type EmployeePermissionKey,
} from "../api/employeesApi";
import {
  translateDiscoRole,
  useDiscoTranslation,
} from "../i18n/useDiscoTranslation";

type DiscoSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

type SidebarBranding = {
  company_name?: string | null;
  platform_name?: string | null;
  logo?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
};

type SidebarLink = {
  name: string;
  icon: LucideIcon;
  path: string;
  permissions?: EmployeePermissionKey[];
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

function getPermissionValue(
  employee: DiscoEmployee | null,
  permission: EmployeePermissionKey
) {
  if (!employee) return false;

  if (employee.role === "owner") return true;

  if (typeof employee.permissions?.[permission] === "boolean") {
    return Boolean(employee.permissions[permission]);
  }

  if (typeof employee[permission] === "boolean") {
    return Boolean(employee[permission]);
  }

  return false;
}

function hasAnyPermission(
  employee: DiscoEmployee | null,
  permissions?: EmployeePermissionKey[]
) {
  if (!permissions || permissions.length === 0) return true;
  if (!employee) return false;
  if (employee.role === "owner") return true;

  return permissions.some((permission) =>
    getPermissionValue(employee, permission)
  );
}

export default function DiscoSidebar({
  mobileOpen,
  onClose,
}: DiscoSidebarProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { organisationSlug } = useParams();
  const { user } = useAppSelector((state) => state.auth);
  const { t } = useDiscoTranslation();

  const authUser = user as any;

  const [imageError, setImageError] = useState(false);
  const [brandingLogoError, setBrandingLogoError] = useState(false);
  const [branding, setBranding] = useState<SidebarBranding | null>(null);
  const [currentEmployee, setCurrentEmployee] =
    useState<DiscoEmployee | null>(null);

  const slug =
    organisationSlug || authUser?.organisation?.slug || "almond-brownie";

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const data = await getPublicDiscoBranding(slug);
        setBranding(data);
      } catch (err) {
        console.error("Could not load sidebar branding:", err);
      }
    }

    loadBranding();
  }, [slug]);

  useEffect(() => {
    async function loadCurrentEmployee() {
      try {
        const data = await getCurrentDiscoEmployee();
        setCurrentEmployee(data);
      } catch (err) {
        console.error("Could not load current disco employee permissions:", err);

        // Fallback for older login payloads where disco_employee is already
        // inside the authenticated user object.
        if (authUser?.disco_employee) {
          setCurrentEmployee(authUser.disco_employee as DiscoEmployee);
          return;
        }

        // Safe owner fallback for the original business account.
        // Backend still protects all endpoints.
        const fallbackRole = String(authUser?.role || "").toLowerCase();

        if (
          [
            "owner",
            "admin",
            "administrator",
            "business_owner",
            "organisation_owner",
            "organization_owner",
            "superadmin",
            "super_admin",
          ].includes(fallbackRole)
        ) {
          setCurrentEmployee({
            id: 0,
            organisation: authUser?.organisation?.id || 0,
            full_name:
              authUser?.full_name ||
              authUser?.name ||
              authUser?.username ||
              authUser?.email ||
              "Owner",
            role: "owner",
            is_active: true,
            user: authUser?.id,
            username: authUser?.username,
            email: authUser?.email,
            permissions: {},
          });
        }
      }
    }

    loadCurrentEmployee();
  }, [authUser]);

  const displayName =
    currentEmployee?.full_name ||
    authUser?.disco_employee?.full_name ||
    authUser?.full_name ||
    authUser?.name ||
    authUser?.username ||
    authUser?.email ||
    t("common.loggedInUser");

  const role =
    currentEmployee?.role ||
    authUser?.disco_employee?.role ||
    authUser?.role ||
    "user";

  const displayRole = translateDiscoRole(role, t);

  const organisationName =
    branding?.platform_name ||
    branding?.company_name ||
    authUser?.disco_employee?.organisation_name ||
    authUser?.organisation?.name ||
    slug;

  const rawBrandingLogoUrl = branding?.logo_url || branding?.logo || "";

  useEffect(() => {
    setBrandingLogoError(false);
  }, [rawBrandingLogoUrl]);

  const brandingLogoUrl = useMemo(() => {
    if (!rawBrandingLogoUrl || brandingLogoError) return "";
    return resolveImageUrl(rawBrandingLogoUrl);
  }, [rawBrandingLogoUrl, brandingLogoError]);

  const rawProfileImageUrl =
    currentEmployee?.profile_image_url ||
    currentEmployee?.employee_photo_url ||
    currentEmployee?.user_avatar_url ||
    authUser?.disco_employee?.profile_image_url ||
    authUser?.disco_employee?.photo_url ||
    authUser?.disco_employee?.employee_photo_url ||
    authUser?.disco_employee?.photo ||
    authUser?.profile_image_url ||
    authUser?.avatar_url ||
    authUser?.user_avatar_url ||
    authUser?.image_url ||
    authUser?.avatar ||
    "";

  useEffect(() => {
    setImageError(false);
  }, [rawProfileImageUrl]);

  const profileImageUrl = useMemo(() => {
    if (!rawProfileImageUrl || imageError) return "";
    return resolveImageUrl(rawProfileImageUrl);
  }, [rawProfileImageUrl, imageError]);

  const allLinks = useMemo<SidebarLink[]>(
    () => [
      {
        name: t("sidebar.dashboard"),
        icon: LayoutDashboard,
        path: `/disco/${slug}/dashboard`,
        permissions: ["can_access_dashboard"],
      },
      {
        name: t("sidebar.pos"),
        icon: ShoppingCart,
        path: `/disco/${slug}/pos`,
        permissions: ["can_access_pos"],
      },
      {
        name: t("sidebar.products"),
        icon: Package,
        path: `/disco/${slug}/products`,
        permissions: ["can_manage_products"],
      },
      {
        name: t("sidebar.inventory"),
        icon: Boxes,
        path: `/disco/${slug}/inventory`,
        permissions: ["can_manage_inventory"],
      },
      {
        name: t("sidebar.stockMovements"),
        icon: ArrowLeftRight,
        path: `/disco/${slug}/stock-movements`,
        permissions: ["can_manage_inventory"],
      },
      {
        name: t("sidebar.tables"),
        icon: Table2,
        path: `/disco/${slug}/tables`,
        permissions: ["can_manage_tables", "can_access_pos"],
      },
      {
        name: t("sidebar.reservations"),
        icon: CalendarDays,
        path: `/disco/${slug}/reservations`,
        permissions: ["can_manage_reservations"],
      },
      {
        name: t("sidebar.employees"),
        icon: Users,
        path: `/disco/${slug}/employees`,
        permissions: ["can_manage_employees"],
      },
      {
        name: t("sidebar.cashShifts"),
        icon: Wallet,
        path: `/disco/${slug}/cash-shifts`,
        permissions: [
          "can_open_cash_shift",
          "can_close_cash_shift",
          "can_view_reports",
        ],
      },
      {
        name: t("sidebar.expenses"),
        icon: Receipt,
        path: `/disco/${slug}/expenses`,
        permissions: ["can_manage_expenses"],
      },
      {
        name: t("sidebar.reports"),
        icon: BarChart3,
        path: `/disco/${slug}/reports`,
        permissions: ["can_view_reports"],
      },
      {
        name: t("sidebar.activityLogs"),
        icon: Activity,
        path: `/disco/${slug}/activity-logs`,
        permissions: ["can_view_activity_logs"],
      },
      {
        name: t("sidebar.settings"),
        icon: Settings,
        path: `/disco/${slug}/settings`,
        permissions: ["can_manage_settings"],
      },
    ],
    [slug, t]
  );

  const links = useMemo(() => {
    return allLinks.filter((link) =>
      hasAnyPermission(currentEmployee, link.permissions)
    );
  }, [allLinks, currentEmployee]);

  async function handleLogout() {
    try {
      await api.post("/accounts/logout/");
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      dispatch(logoutUser());
      navigate(`/disco/${slug}/login`, { replace: true });
      onClose();
    }
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 h-screen w-72
          transform border-r border-slate-800
          bg-slate-950 text-white transition-transform duration-300
          lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-950">
              {brandingLogoUrl ? (
                <img
                  src={brandingLogoUrl}
                  alt={organisationName}
                  onError={() => setBrandingLogoError(true)}
                  className="h-full w-full object-contain p-1.5"
                />
              ) : (
                <Music4 size={24} />
              )}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Disco
              </p>

              <h2 className="truncate text-lg font-black">
                {organisationName}
              </h2>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-800 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">
          <div className="border-b border-slate-800 p-4">
            <div className="rounded-3xl bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-slate-950">
                  {profileImageUrl ? (
                    <img
                      src={profileImageUrl}
                      alt={displayName}
                      onError={() => setImageError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <UserCircle size={24} />
                  )}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    {displayName}
                  </p>

                  <p className="truncate text-xs font-semibold capitalize text-slate-400">
                    {displayRole}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-950/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  {t("sidebar.organisation")}
                </p>

                <p className="mt-1 truncate text-sm font-black text-white">
                  {organisationName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <nav className="space-y-2">
              {links.length ? (
                links.map((link) => {
                  const Icon = link.icon;

                  return (
                    <NavLink
                      key={link.path}
                      to={link.path}
                      onClick={onClose}
                      className={({ isActive }) =>
                        `
                          flex items-center gap-3 rounded-2xl px-4 py-3
                          text-sm font-bold transition-all
                          ${
                            isActive
                              ? "bg-white text-slate-950 shadow-lg"
                              : "text-slate-300 hover:bg-slate-900 hover:text-white"
                          }
                        `
                      }
                    >
                      <Icon size={18} />
                      {link.name}
                    </NavLink>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-slate-900 p-4 text-sm font-semibold text-slate-400">
                  No tienes permisos activos para ver módulos.
                </div>
              )}
            </nav>
          </div>

          <div className="border-t border-slate-800 p-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 transition hover:bg-red-500 hover:text-white"
            >
              <LogOut size={18} />
              {t("common.logout")}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
