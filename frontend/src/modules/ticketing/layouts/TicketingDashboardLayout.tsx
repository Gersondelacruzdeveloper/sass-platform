// src/modules/ticketing/layouts/TicketingDashboardLayout.tsx

import { useEffect, useMemo, useState } from "react";
import {
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { ShieldAlert } from "lucide-react";

import TicketingSidebar from "../components/TicketingSidebar";
import TicketingTopbar from "../components/TicketingTopbar";

import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

import ticketingApi from "../api/ticketingApi";
import type {
  PublicBrandingResponse,
  Seller,
  SellerPermissions,
} from "../types/ticketingTypes";

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

type TicketingPermissionKey = keyof SellerPermissions;

type TicketingBranding = {
  company_name: string;
  platform_name: string;
  logo_url?: string | null;
  logo?: string | null;
  favicon_url?: string | null;
  favicon?: string | null;
  app_icon_192_url?: string | null;
  app_icon_192?: string | null;
  app_icon_512_url?: string | null;
  app_icon_512?: string | null;
  primary_color: string;
  accent_color: string;
  theme_color?: string;
};

const defaultTicketingBranding: TicketingBranding = {
  company_name: "PCD Experiences",
  platform_name: "Tours, Tickets & Transfers",
  logo_url: "",
  logo: "",
  favicon_url: "",
  favicon: "",
  app_icon_192_url: "",
  app_icon_192: "",
  app_icon_512_url: "",
  app_icon_512: "",
  primary_color: "#020617",
  accent_color: "#F59E0B",
  theme_color: "#020617",
};

function mapPublicBrandingToLayoutBranding(
  data: PublicBrandingResponse
): TicketingBranding {
  return {
    company_name:
      data.public_site?.display_title ||
      data.public_site?.site_title ||
      data.organisation?.name ||
      "PCD Experiences",
    platform_name:
      data.ticketing_settings?.public_brand_name ||
      data.ticketing_settings?.module_name ||
      "Tours, Tickets & Transfers",
    logo_url: data.public_site?.logo_url || "",
    logo: data.public_site?.logo || "",
    favicon_url: data.public_site?.favicon_url || "",
    favicon: data.public_site?.favicon || "",
    app_icon_192_url: data.public_site?.logo_url || "",
    app_icon_192: data.public_site?.logo || "",
    app_icon_512_url: data.public_site?.hero_image_url || data.public_site?.logo_url || "",
    app_icon_512: data.public_site?.hero_image || data.public_site?.logo || "",
    primary_color: data.public_site?.primary_color || "#020617",
    accent_color: data.public_site?.accent_color || "#F59E0B",
    theme_color: data.public_site?.primary_color || "#020617",
  };
}

type ProtectedRoute = {
  segment: string;
  path: (slug: string) => string;
  permissions: TicketingPermissionKey[];
};

const protectedRoutes: ProtectedRoute[] = [
  {
    segment: "dashboard",
    path: (slug) => `/ticketing/${slug}/dashboard`,
    permissions: ["can_access_dashboard"],
  },
  {
    segment: "bookings",
    path: (slug) => `/ticketing/${slug}/bookings`,
    permissions: ["can_view_own_sales", "can_create_bookings"],
  },
  {
    segment: "new-booking",
    path: (slug) => `/ticketing/${slug}/new-booking`,
    permissions: ["can_create_bookings"],
  },
  {
    segment: "products",
    path: (slug) => `/ticketing/${slug}/products`,
    permissions: [
      "can_manage_products",
      "can_sell_excursions",
      "can_sell_transfers",
      "can_sell_events",
      "can_sell_custom_tours",
      "can_sell_cocobongo",
    ],
  },
  {
    segment: "excursions",
    path: (slug) => `/ticketing/${slug}/excursions`,
    permissions: ["can_manage_products", "can_sell_excursions"],
  },
  {
    segment: "transfers",
    path: (slug) => `/ticketing/${slug}/transfers`,
    permissions: ["can_manage_products", "can_sell_transfers"],
  },
  {
    segment: "events",
    path: (slug) => `/ticketing/${slug}/events`,
    permissions: ["can_manage_products", "can_sell_events"],
  },
  {
    segment: "sellers",
    path: (slug) => `/ticketing/${slug}/sellers`,
    permissions: ["can_manage_sellers"],
  },
  {
    segment: "commissions",
    path: (slug) => `/ticketing/${slug}/commissions`,
    permissions: ["can_view_own_commissions", "can_view_reports"],
  },
  {
    segment: "reports",
    path: (slug) => `/ticketing/${slug}/reports`,
    permissions: ["can_view_reports"],
  },
  {
    segment: "pickup-schedules",
    path: (slug) => `/ticketing/${slug}/pickup-schedules`,
    permissions: ["can_manage_products", "can_override_pickup_time"],
  },
  {
    segment: "branding",
    path: (slug) => `/ticketing/${slug}/branding`,
    permissions: ["can_manage_settings"],
  },
  {
    segment: "domain",
    path: (slug) => `/ticketing/${slug}/domain`,
    permissions: ["can_manage_settings"],
  },
  {
    segment: "integrations",
    path: (slug) => `/ticketing/${slug}/integrations`,
    permissions: ["can_manage_integrations"],
  },
  {
    segment: "seo",
    path: (slug) => `/ticketing/${slug}/seo`,
    permissions: ["can_manage_settings"],
  },
  {
    segment: "settings",
    path: (slug) => `/ticketing/${slug}/settings`,
    permissions: ["can_manage_settings"],
  },
];

function getPermissionValue(
  seller: Seller | null,
  permission: TicketingPermissionKey
) {
  if (!seller) return false;

  if (seller.role === "owner") return true;

  if (typeof seller.permissions?.[permission] === "boolean") {
    return Boolean(seller.permissions[permission]);
  }

  if (typeof seller[permission] === "boolean") {
    return Boolean(seller[permission]);
  }

  return false;
}

function hasAnyPermission(
  seller: Seller | null,
  permissions: TicketingPermissionKey[]
) {
  if (!seller) return false;
  if (seller.role === "owner") return true;

  return permissions.some((permission) =>
    getPermissionValue(seller, permission)
  );
}

function getCurrentRoute(pathname: string) {
  return protectedRoutes.find((route) =>
    pathname.includes(`/${route.segment}`)
  );
}

function getFirstAllowedPath(seller: Seller | null, slug: string) {
  const firstAllowedRoute = protectedRoutes.find((route) =>
    hasAnyPermission(seller, route.permissions)
  );

  return firstAllowedRoute?.path(slug) || "";
}

export default function TicketingDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<TicketingBranding>(
    defaultTicketingBranding
  );
  const [currentSeller, setCurrentSeller] = useState<Seller | null>(null);
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionsError, setPermissionsError] = useState("");

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { organisationSlug } = useParams();

  const { user } = useAppSelector((state) => state.auth);
  const authUser = user as any;

  const slug =
    organisationSlug ||
    authUser?.organisation?.slug ||
    "almond-brownie";

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const data = await ticketingApi.getPublicBranding(slug);
        setBranding(mapPublicBrandingToLayoutBranding(data));
      } catch (error) {
        console.error("Could not load ticketing branding in layout:", error);

        setBranding({
          ...defaultTicketingBranding,
          company_name:
            authUser?.organisation?.name ||
            defaultTicketingBranding.company_name,
        });
      }
    }

    loadBranding();
  }, [slug, authUser?.organisation?.name]);

  useEffect(() => {
    async function loadCurrentSeller() {
      try {
        setPermissionsLoading(true);
        setPermissionsError("");

        const data = await ticketingApi.getSellerMe(slug);
        setCurrentSeller(data);
      } catch (error) {
        console.error("Could not load current seller permissions:", error);

        if (authUser?.ticketing_seller) {
          setCurrentSeller(authUser.ticketing_seller as Seller);
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
          setCurrentSeller({
            id: 0,
            organisation: authUser?.organisation?.id || 0,
            user: authUser?.id,
            username: authUser?.username,
            user_email: authUser?.email,
            full_name:
              authUser?.full_name ||
              authUser?.name ||
              authUser?.username ||
              authUser?.email ||
              "Owner",
            seller_slug: "owner",
            role: "owner",
            email: authUser?.email || "",
            phone: authUser?.phone || "",
            whatsapp: authUser?.phone || "",
            commission_rate: "0.00",
            fixed_commission_amount: "0.00",
            is_active: true,
            total_sales_amount: "0.00",
            total_commission_amount: "0.00",
            total_collected_amount: "0.00",
            total_owed_to_company: "0.00",
            permissions: {} as SellerPermissions,
            can_access_dashboard: true,
            can_sell_cocobongo: true,
            can_sell_excursions: true,
            can_sell_transfers: true,
            can_sell_events: true,
            can_sell_custom_tours: true,
            can_create_bookings: true,
            can_take_deposits: true,
            can_take_full_payments: true,
            can_collect_cash_payment: true,
            can_generate_ticket_without_customer_online_payment: true,
            can_mark_customer_deposit_paid: true,
            can_mark_customer_full_paid: true,
            can_pay_full_amount_as_seller: true,
            can_pay_deposit_as_seller: true,
            can_pay_commission_only: true,
            can_create_pending_payment_booking: true,
            can_request_supervisor_approval: true,
            can_send_receipt_before_full_payment: true,
            can_view_own_sales: true,
            can_view_own_commissions: true,
            can_apply_discounts: true,
            can_cancel_bookings: true,
            can_send_whatsapp: true,
            can_send_email: true,
            can_override_pickup_time: true,
            can_view_reports: true,
            can_manage_products: true,
            can_manage_sellers: true,
            can_manage_settings: true,
            can_manage_integrations: true,
          });
          return;
        }

        setPermissionsError("No se pudieron cargar tus permisos.");
        setCurrentSeller(null);
      } finally {
        setPermissionsLoading(false);
      }
    }

    loadCurrentSeller();
  }, [authUser, slug]);

  const currentRoute = useMemo(() => {
    return getCurrentRoute(location.pathname);
  }, [location.pathname]);

  const currentRouteAllowed = useMemo(() => {
    if (!currentRoute) return true;
    return hasAnyPermission(currentSeller, currentRoute.permissions);
  }, [currentSeller, currentRoute]);

  const firstAllowedPath = useMemo(() => {
    return getFirstAllowedPath(currentSeller, slug);
  }, [currentSeller, slug]);

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
    currentSeller?.full_name ||
    authUser?.ticketing_seller?.full_name ||
    authUser?.full_name ||
    authUser?.name ||
    authUser?.username ||
    authUser?.email ||
    "Seller";

  const userEmail =
    currentSeller?.user_email ||
    currentSeller?.email ||
    authUser?.email ||
    "";

  const organisationName =
    branding?.platform_name ||
    branding?.company_name ||
    authUser?.ticketing_seller?.organisation_name ||
    authUser?.organisation?.name ||
    slug;

  const userAvatarUrl =
    currentSeller?.photo_url ||
    authUser?.ticketing_seller?.photo_url ||
    authUser?.profile_image_url ||
    authUser?.avatar_url ||
    authUser?.user_avatar_url ||
    authUser?.image_url ||
    authUser?.avatar ||
    null;

  const manifestUrl = useMemo(() => {
    if (!slug) return "";

    return `${getApiBaseUrl()}/organisations/public-manifest/ticketing/${slug}/manifest.json`;
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
    const appName =
      branding.platform_name ||
      branding.company_name ||
      organisationName ||
      "PCD Experiences";

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
    navigate(`/ticketing/${slug}/login`, { replace: true });
  }

  const shouldShowPermissionBlocked =
    !permissionsLoading &&
    Boolean(currentRoute) &&
    !currentRouteAllowed &&
    !firstAllowedPath;

  return (
    <div className="min-h-screen bg-slate-50">
      <TicketingSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slug={slug}
        currentSeller={currentSeller}
      />

      <div className="min-h-screen lg:pl-72">
        <TicketingTopbar
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
                    Tu usuario no tiene acceso a ningún módulo de PCD Experiences.
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
