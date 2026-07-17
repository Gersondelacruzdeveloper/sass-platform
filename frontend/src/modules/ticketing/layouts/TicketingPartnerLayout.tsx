// src/modules/ticketing/layouts/TicketingPartnerLayout.tsx
// Layout version: partner-portal-v1-2026-07-13

import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  CalendarCheck2,
  ChevronRight,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  QrCode,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import { logoutUser } from "../../../features/auth/authSlice";
import {
  useAppDispatch,
  useAppSelector,
} from "../../../store/hooks";

export type PartnerPermissions = {
  can_access_dashboard: boolean;
  can_scan: boolean;
  can_view_today_bookings: boolean;
  can_view_admissions: boolean;
  can_view_customer_contact: boolean;
  can_view_financials: boolean;
  can_view_settlements: boolean;
  can_record_payments: boolean;
  can_reverse_admissions: boolean;
  can_manage_users: boolean;
};

type PartnerBusinessEntity = {
  id: number;
  name: string;
  slug: string;
  entity_type: string;
  currency?: string;
  can_scan_tickets?: boolean;
  require_check_in_confirmation?: boolean;
  allow_partial_admission?: boolean;
  allow_offline_scanning?: boolean;
};

type PartnerAccess = {
  id: number;
  role: string;
  is_active: boolean;
  last_access_at?: string | null;
  business_entity: PartnerBusinessEntity;
  permissions: PartnerPermissions;
};

type PartnerBranding = {
  company_name?: string;
  platform_name?: string;
  logo_url?: string;
  favicon_url?: string;
  app_icon_192_url?: string;
  app_icon_512_url?: string;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
};

type PartnerBootstrap = {
  portal_type: "partner";
  user: {
    id: number;
    name: string;
    email: string;
    username: string;
  };
  organisation: {
    id: number;
    name: string;
    slug: string;
  };
  branding?: PartnerBranding;
  default_access_id: number;
  default_business_entity_id: number;
  default_business_entity: PartnerBusinessEntity;
  role: string;
  permissions: PartnerPermissions;
  accesses: PartnerAccess[];
  routes?: {
    dashboard?: string;
    scanner?: string;
    admissions?: string;
    scan_history?: string;
    settlements?: string;
    users?: string;
    profile?: string;
  };
};

export type TicketingPartnerOutletContext = {
  slug: string;
  organisationName: string;
  portalType: "partner";
  role: string;
  permissions: PartnerPermissions;
  businessEntity: PartnerBusinessEntity;
  businessEntityId: number;
  partnerAccesses: PartnerAccess[];
  branding: PartnerBranding | null;
};

type NavigationItem = {
  label: string;
  to: string;
  icon: typeof LayoutDashboard;
  permission?: keyof PartnerPermissions;
};

function getPartnerHome(
  slug: string,
  permissions: PartnerPermissions,
): string {
  const base = `/ticketing/${slug}/partner`;

  if (permissions.can_scan) {
    return `${base}/scanner`;
  }

  if (permissions.can_view_admissions) {
    return `${base}/admissions`;
  }

  if (permissions.can_view_today_bookings) {
    return `${base}/scan-history`;
  }

  if (permissions.can_view_settlements) {
    return `${base}/settlements`;
  }

  return `${base}/access-denied`;
}

function PortalLoadingScreen() {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
        <span className="text-sm font-black text-slate-700">
          {t("navigation.account.loadingAccess")}
        </span>
      </div>
    </div>
  );
}

function PortalErrorScreen({
  message,
  loginPath,
}: {
  message: string;
  loginPath: string;
}) {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-xl rounded-[2rem] border border-rose-200 bg-white p-7 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-11 w-11 text-rose-600" />

        <h1 className="mt-4 text-2xl font-black text-slate-950">
          {t("navigation.errors.partnerAccessUnavailable", undefined, "Partner access unavailable")}
        </h1>

        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {message}
        </p>

        <Link
          to={loginPath}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
        >
          {t("navigation.actions.returnToLogin", undefined, "Return to login")}
        </Link>
      </div>
    </div>
  );
}

function initials(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "P";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default function TicketingPartnerLayout() {
  const { t } = useTicketingAdminTranslation();
  const [bootstrap, setBootstrap] =
    useState<PartnerBootstrap | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const authUser = useAppSelector(
    (state) => state.auth.user,
  ) as any;

  const slug =
    organisationSlug ||
    authUser?.organisation?.slug ||
    authUser?.organisation_slug ||
    "";

  useEffect(() => {
    let cancelled = false;

    async function loadPartnerBootstrap() {
      if (!slug) {
        setLoading(false);
        setLoadError(t("navigation.defaults.platform"));
        return;
      }

      setLoading(true);
      setLoadError("");

      try {
        const response = await api.get<PartnerBootstrap>(
          "/ticketing/partner/bootstrap/",
          {
            params: {
              slug,
              organisation_slug: slug,
            },
          },
        );

        if (cancelled) return;

        if (response.data?.portal_type !== "partner") {
          setLoadError(
            t("navigation.errors.noOperationsAccess", undefined, "This account does not have Operations access."),
          );
          setBootstrap(null);
          return;
        }

        setBootstrap(response.data);
      } catch (error: any) {
        if (cancelled) return;

        const message =
          error?.response?.data?.detail ||
          error?.response?.data?.message ||
          t("navigation.errors.loadOperationsAccess", undefined, "Could not load your Operations access.");

        setLoadError(message);
        setBootstrap(null);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadPartnerBootstrap();

    return () => {
      cancelled = true;
    };
  }, [slug, t]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const navigation = useMemo<NavigationItem[]>(() => {
    if (!bootstrap || !slug) return [];

    const base = `/ticketing/${slug}/partner`;
    const permissions = bootstrap.permissions;

    return [
      permissions.can_access_dashboard
        ? {
            label: t("navigation.items.operationsDashboard"),
            to: `${base}/dashboard`,
            icon: LayoutDashboard,
            permission: "can_access_dashboard",
          }
        : null,
      permissions.can_scan
        ? {
            label: t("navigation.items.qrScanner"),
            to: `${base}/scanner`,
            icon: QrCode,
            permission: "can_scan",
          }
        : null,
      permissions.can_view_admissions
        ? {
            label: t("navigation.items.admissions"),
            to: `${base}/admissions`,
            icon: CalendarCheck2,
            permission: "can_view_admissions",
          }
        : null,
      permissions.can_view_today_bookings
        ? {
            label: t("navigation.items.scanHistory"),
            to: `${base}/scan-history`,
            icon: History,
            permission: "can_view_today_bookings",
          }
        : null,
      permissions.can_view_settlements
        ? {
            label: t("navigation.items.settlements"),
            to: `${base}/settlements`,
            icon: WalletCards,
            permission: "can_view_settlements",
          }
        : null,
      {
        label: t("navigation.account.account"),
        to: `${base}/profile`,
        icon: UserRound,
      },
    ].filter(Boolean) as NavigationItem[];
  }, [bootstrap, slug, t]);

  const outletContext = useMemo<
    TicketingPartnerOutletContext | null
  >(() => {
    if (!bootstrap) return null;

    return {
      slug,
      organisationName: bootstrap.organisation.name,
      portalType: "partner",
      role: bootstrap.role,
      permissions: bootstrap.permissions,
      businessEntity: bootstrap.default_business_entity,
      businessEntityId: bootstrap.default_business_entity_id,
      partnerAccesses: bootstrap.accesses,
      branding: bootstrap.branding || null,
    };
  }, [bootstrap, slug]);

  async function handleLogout() {
    await dispatch(logoutUser());

    navigate(`/ticketing/${slug}/login`, {
      replace: true,
    });
  }

  if (loading) {
    return <PortalLoadingScreen />;
  }

  if (!slug) {
    return <Navigate to="/ticketing" replace />;
  }

  if (loadError || !bootstrap || !outletContext) {
    return (
      <PortalErrorScreen
        message={
          loadError ||
          t("navigation.errors.noActiveOperationsAccess", undefined, "This account does not have active Operations access.")
        }
        loginPath={`/ticketing/${slug}/login`}
      />
    );
  }

  const businessEntityName =
    bootstrap.default_business_entity?.name ||
    bootstrap.organisation.name;

  const brandName =
    bootstrap.branding?.platform_name ||
    bootstrap.branding?.company_name ||
    bootstrap.organisation.name;

  const logoUrl = bootstrap.branding?.logo_url || "";

  const userName =
    bootstrap.user?.name ||
    bootstrap.user?.username ||
    bootstrap.user?.email ||
    t("common.user");

  const homePath = getPartnerHome(
    slug,
    bootstrap.permissions,
  );

  const currentPath = location.pathname;

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileOpen && (
        <button
          type="button"
          aria-label={t("navigation.actions.closePartnerMenu", undefined, "Close partner menu")}
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-slate-800 bg-slate-950 text-white transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full"
        }`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5">
          <Link
            to={homePath}
            className="flex min-w-0 items-center gap-3"
          >
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={brandName}
                className="h-11 w-11 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-sm font-black">
                {initials(businessEntityName)}
              </div>
            )}

            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                {businessEntityName}
              </p>
              <p className="truncate text-xs font-bold text-slate-400">
                {t("navigation.portals.operations")}
              </p>
            </div>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-300 hover:bg-white/10 lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b border-slate-800 px-5 py-4">
          <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-500">
            {t("navigation.account.account")}
          </p>

          <p className="mt-2 truncate text-sm font-black text-white">
            {userName}
          </p>

          <p className="mt-1 truncate text-xs font-semibold text-slate-400">
            {bootstrap.user.email}
          </p>

          <span className="mt-3 inline-flex rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-black capitalize text-emerald-300">
            {bootstrap.role.replaceAll("_", " ")}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;

              const active =
                currentPath === item.to ||
                currentPath.startsWith(`${item.to}/`);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-black transition ${
                    active
                      ? "bg-white text-slate-950"
                      : "text-slate-300 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </span>

                  <ChevronRight className="h-4 w-4 opacity-50" />
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-slate-800 p-4">
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white/10 text-sm font-black text-white transition hover:bg-white/15"
          >
            <LogOut className="h-4 w-4" />
            {t("topbar.logout")}
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-72">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-700 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-black text-slate-950">
                {businessEntityName}
              </p>
              <p className="truncate text-xs font-semibold text-slate-500">
                {t("navigation.labels.restrictedOperations", undefined, "Restricted Operations")}
              </p>
            </div>

            <div className="hidden items-center gap-3 sm:flex">
              <div className="text-right">
                <p className="text-sm font-black text-slate-900">
                  {userName}
                </p>
                <p className="text-xs font-semibold capitalize text-slate-500">
                  {bootstrap.role.replaceAll("_", " ")}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black text-white">
                {initials(userName)}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 py-5 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet context={outletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}
