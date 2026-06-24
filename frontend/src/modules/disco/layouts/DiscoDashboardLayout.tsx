// src/modules/disco/layouts/DiscoDashboardLayout.tsx

import { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import DiscoSidebar from "../components/DiscoSidebar";
import DiscoTopbar from "../components/DiscoTopbar";

import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

import {
  getPublicDiscoBranding,
  type OrganisationBranding,
} from "../api/brandingApi";

import {
  getCurrentDiscoEmployee,
  type DiscoEmployee,
  type EmployeePermissionKey,
} from "../api/employeesApi";

function getApiBaseUrl() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api"
  );
}

function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}

function resolveAssetUrl(url?: string | null) {
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

function updateOrCreateLinkById(
  id: string,
  rel: string,
  href: string,
  type?: string
) {
  if (!href) return;

  let link = document.getElementById(id) as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.id = id;
    document.head.appendChild(link);
  }

  link.rel = rel;
  link.href = href;

  if (type) {
    link.type = type;
  }
}

function updateOrCreateMetaById(id: string, name: string, content: string) {
  if (!content) return;

  let meta = document.getElementById(id) as HTMLMetaElement | null;

  if (!meta) {
    meta = document.createElement("meta");
    meta.id = id;
    document.head.appendChild(meta);
  }

  meta.name = name;
  meta.content = content;
}

type ProtectedRoute = {
  segment: string;
  path: (slug: string) => string;
  permissions: EmployeePermissionKey[];
};

const protectedRoutes: ProtectedRoute[] = [
  {
    segment: "dashboard",
    path: (slug) => `/disco/${slug}/dashboard`,
    permissions: ["can_access_dashboard"],
  },
  {
    segment: "pos",
    path: (slug) => `/disco/${slug}/pos`,
    permissions: ["can_access_pos"],
  },
  {
    segment: "products",
    path: (slug) => `/disco/${slug}/products`,
    permissions: ["can_manage_products"],
  },
  {
    segment: "inventory",
    path: (slug) => `/disco/${slug}/inventory`,
    permissions: ["can_manage_inventory"],
  },
  {
    segment: "stock-movements",
    path: (slug) => `/disco/${slug}/stock-movements`,
    permissions: ["can_manage_inventory"],
  },
  {
    segment: "tables",
    path: (slug) => `/disco/${slug}/tables`,
    permissions: ["can_manage_tables", "can_access_pos"],
  },
  {
    segment: "reservations",
    path: (slug) => `/disco/${slug}/reservations`,
    permissions: ["can_manage_reservations"],
  },
  {
    segment: "employees",
    path: (slug) => `/disco/${slug}/employees`,
    permissions: ["can_manage_employees"],
  },
  {
    segment: "cash-shifts",
    path: (slug) => `/disco/${slug}/cash-shifts`,
    permissions: [
      "can_open_cash_shift",
      "can_close_cash_shift",
      "can_view_reports",
    ],
  },
  {
    segment: "expenses",
    path: (slug) => `/disco/${slug}/expenses`,
    permissions: ["can_manage_expenses"],
  },
  {
    segment: "reports",
    path: (slug) => `/disco/${slug}/reports`,
    permissions: ["can_view_reports"],
  },
  {
    segment: "activity-logs",
    path: (slug) => `/disco/${slug}/activity-logs`,
    permissions: ["can_view_activity_logs"],
  },
  {
    segment: "settings",
    path: (slug) => `/disco/${slug}/settings`,
    permissions: ["can_manage_settings"],
  },
];

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
  permissions: EmployeePermissionKey[]
) {
  if (!employee) return false;
  if (employee.role === "owner") return true;

  return permissions.some((permission) =>
    getPermissionValue(employee, permission)
  );
}

function getCurrentRoute(pathname: string) {
  return protectedRoutes.find((route) =>
    pathname.includes(`/${route.segment}`)
  );
}

function getFirstAllowedPath(employee: DiscoEmployee | null, slug: string) {
  const firstAllowedRoute = protectedRoutes.find((route) =>
    hasAnyPermission(employee, route.permissions)
  );

  return firstAllowedRoute?.path(slug) || "";
}

export default function DiscoDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<OrganisationBranding | null>(null);
  const [currentEmployee, setCurrentEmployee] =
    useState<DiscoEmployee | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState("");

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { organisationSlug } = useParams();

  const { user } = useAppSelector((state) => state.auth);
  const authUser = user as any;

  const slug =
    organisationSlug || authUser?.organisation?.slug || "almond-brownie";

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const data = await getPublicDiscoBranding(slug);
        setBranding(data);
      } catch (error) {
        console.error("Could not load disco branding in layout:", error);
      }
    }

    loadBranding();
  }, [slug]);

  useEffect(() => {
    async function loadCurrentEmployee() {
      try {
        setPermissionsLoading(true);
        setPermissionsError("");

        const data = await getCurrentDiscoEmployee();
        setCurrentEmployee(data);
      } catch (error) {
        console.error("Could not load current employee permissions:", error);

        if (authUser?.disco_employee) {
          setCurrentEmployee(authUser.disco_employee as DiscoEmployee);
          return;
        }

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
            user: authUser?.id,
            username: authUser?.username,
            email: authUser?.email,
            full_name:
              authUser?.full_name ||
              authUser?.name ||
              authUser?.username ||
              authUser?.email ||
              "Owner",
            role: "owner",
            is_active: true,
            permissions: {},
          });
          return;
        }

        setPermissionsError("No se pudieron cargar tus permisos.");
        setCurrentEmployee(null);
      } finally {
        setPermissionsLoading(false);
      }
    }

    loadCurrentEmployee();
  }, [authUser]);

  const currentRoute = useMemo(() => {
    return getCurrentRoute(location.pathname);
  }, [location.pathname]);

  const currentRouteAllowed = useMemo(() => {
    if (!currentRoute) return true;
    return hasAnyPermission(currentEmployee, currentRoute.permissions);
  }, [currentEmployee, currentRoute]);

  const firstAllowedPath = useMemo(() => {
    return getFirstAllowedPath(currentEmployee, slug);
  }, [currentEmployee, slug]);

  useEffect(() => {
    if (permissionsLoading) return;
    if (!currentRoute) return;
    if (currentRouteAllowed) return;

    if (firstAllowedPath && firstAllowedPath !== location.pathname) {
      navigate(firstAllowedPath, { replace: true });
    }
  }, [
    permissionsLoading,
    currentRoute,
    currentRouteAllowed,
    firstAllowedPath,
    location.pathname,
    navigate,
  ]);

  const userName =
    currentEmployee?.full_name ||
    authUser?.disco_employee?.full_name ||
    authUser?.full_name ||
    authUser?.name ||
    authUser?.username ||
    authUser?.email ||
    "Staff Member";

  const userEmail =
    currentEmployee?.email ||
    authUser?.email ||
    "";

  const organisationName =
    branding?.platform_name ||
    branding?.company_name ||
    authUser?.disco_employee?.organisation_name ||
    authUser?.organisation?.name ||
    slug;

  const userAvatarUrl =
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
    null;

  const manifestUrl = useMemo(() => {
    if (!slug) return "";

    return `${getApiBaseUrl()}/organisations/public-manifest/disco/${slug}/manifest.json`;
  }, [slug]);

  const faviconUrl = useMemo(() => {
    return resolveAssetUrl(
      branding?.favicon_url ||
        branding?.favicon ||
        branding?.app_icon_192_url ||
        branding?.app_icon_192 ||
        branding?.logo_url ||
        branding?.logo ||
        ""
    );
  }, [branding]);

  const appleTouchIconUrl = useMemo(() => {
    return resolveAssetUrl(
      branding?.app_icon_192_url ||
        branding?.app_icon_192 ||
        branding?.app_icon_512_url ||
        branding?.app_icon_512 ||
        branding?.logo_url ||
        branding?.logo ||
        ""
    );
  }, [branding]);

  useEffect(() => {
    if (!manifestUrl) return;

    updateOrCreateLinkById(
      "app-manifest",
      "manifest",
      manifestUrl,
      "application/manifest+json"
    );
  }, [manifestUrl]);

  useEffect(() => {
    if (!branding) return;

    const appName =
      branding.platform_name ||
      branding.company_name ||
      organisationName ||
      "Disco Platform";

    document.title = appName;

    if (faviconUrl) {
      updateOrCreateLinkById("app-favicon", "icon", faviconUrl, "image/png");
      updateOrCreateLinkById(
        "app-shortcut-icon",
        "shortcut icon",
        faviconUrl,
        "image/png"
      );
    }

    if (appleTouchIconUrl) {
      updateOrCreateLinkById(
        "apple-touch-icon",
        "apple-touch-icon",
        appleTouchIconUrl
      );
    }

    updateOrCreateMetaById(
      "app-theme-color",
      "theme-color",
      branding.theme_color || branding.primary_color || "#020617"
    );

    updateOrCreateMetaById(
      "apple-mobile-web-app-title",
      "apple-mobile-web-app-title",
      appName
    );
  }, [branding, faviconUrl, appleTouchIconUrl, organisationName]);

  async function handleLogout() {
    await dispatch(logoutUser());
    navigate(`/disco/${slug}/login`, { replace: true });
  }

  const shouldShowPermissionBlocked =
    !permissionsLoading &&
    Boolean(currentRoute) &&
    !currentRouteAllowed &&
    !firstAllowedPath;

  return (
    <div className="min-h-screen bg-slate-50">
      <DiscoSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      <div className="min-h-screen lg:pl-72">
        <DiscoTopbar
          user={authUser}
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          organisationName={organisationName}
          onMenuClick={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl">
            {permissionsLoading ? (
              <div className="grid min-h-[60vh] place-items-center">
                <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
                  <p className="mt-4 text-sm font-black text-slate-700">
                    Cargando permisos...
                  </p>
                </div>
              </div>
            ) : shouldShowPermissionBlocked ? (
              <div className="grid min-h-[60vh] place-items-center">
                <div className="max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                    <ShieldAlert className="h-7 w-7" />
                  </div>

                  <h1 className="mt-4 text-xl font-black text-slate-950">
                    No tienes permisos activos
                  </h1>

                  <p className="mt-2 text-sm font-semibold text-slate-500">
                    Tu usuario no tiene acceso a ningún módulo del sistema.
                    Contacta al dueño o administrador para activar permisos.
                  </p>

                  {permissionsError && (
                    <p className="mt-3 text-xs font-bold text-red-600">
                      {permissionsError}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
