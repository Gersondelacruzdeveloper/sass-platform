// src/modules/ticketing/layouts/TicketingDashboardLayout.tsx
// Layout version: portal-router-v2-2026-07-13

import { useEffect, useMemo, useState } from "react";
import {
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import { Download, Loader2 } from "lucide-react";

import api from "../../../api/axios";
import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import TicketingSidebar from "../components/TicketingSidebar";
import TicketingTopbar from "../components/TicketingTopbar";

type OrganisationBranding = {
  id?: number;
  company_name?: string;
  platform_name?: string;

  logo?: string | null;
  logo_url?: string | null;

  favicon?: string | null;
  favicon_url?: string | null;

  app_icon_192?: string | null;
  app_icon_192_url?: string | null;

  app_icon_512?: string | null;
  app_icon_512_url?: string | null;

  maskable_icon?: string | null;
  maskable_icon_url?: string | null;

  app_short_name?: string;
  app_description?: string;

  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  theme_color?: string;
  background_color?: string;

  login_title?: string;
  login_subtitle?: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export type PartnerPortalPermissions = {
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

type PartnerPortalBootstrap = {
  portal_type: "partner";
  organisation: {
    id: number;
    name: string;
    slug: string;
  };
  default_business_entity_id: number;
  default_business_entity?: {
    id: number;
    name: string;
    slug: string;
    entity_type: string;
  };
  role: string;
  permissions: PartnerPortalPermissions;
};

type PortalResolution =
  | { loading: true; portalType: "unknown"; partner: null }
  | { loading: false; portalType: "owner"; partner: null }
  | { loading: false; portalType: "seller"; partner: null }
  | {
      loading: false;
      portalType: "partner";
      partner: PartnerPortalBootstrap;
    };

export type TicketingDashboardOutletContext = {
  slug: string;
  organisationName: string;
  companyName: string;
  companyLogoUrl: string;
  branding: OrganisationBranding | null;
  isOperationsRoute: boolean;
  portalLabel: string;
  portalType: "owner";
  isOwner: true;
  isSeller: false;
  isPartner: false;
  partnerPermissions: null;
};

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
  type?: string,
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

function updateOrCreateMetaById(
  id: string,
  name: string,
  content: string,
) {
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

function getUserDisplayName(user: any, fallback: string) {
  return (
    user?.full_name ||
    user?.name ||
    user?.username ||
    user?.email ||
    fallback
  );
}

function getUserAvatarUrl(user: any) {
  return (
    user?.profile_image_url ||
    user?.avatar_url ||
    user?.user_avatar_url ||
    user?.image_url ||
    user?.avatar ||
    null
  );
}


function getPartnerDestination(
  slug: string,
  permissions: PartnerPortalPermissions,
) {
  const base = `/ticketing/${slug}/partner`;

  if (permissions.can_scan) {
    return `${base}/scanner`;
  }

  if (permissions.can_view_admissions) {
    return `${base}/admissions`;
  }

  if (permissions.can_view_settlements) {
    return `${base}/settlements`;
  }

  if (permissions.can_view_today_bookings) {
    return `${base}/scan-history`;
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
          {t("layout.checkingPortalAccess")}
        </span>
      </div>
    </div>
  );
}

export default function TicketingDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] =
    useState<OrganisationBranding | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [portalResolution, setPortalResolution] =
    useState<PortalResolution>({
      loading: true,
      portalType: "unknown",
      partner: null,
    });

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTicketingAdminTranslation();
  const { organisationSlug } = useParams<{
    organisationSlug: string;
  }>();

  const { user } = useAppSelector((state) => state.auth);
  const authUser = user as any;

  const slug =
    organisationSlug ||
    authUser?.organisation?.slug ||
    authUser?.seller?.organisation_slug ||
    "";

  const isSellerAccount =
    Boolean(authUser?.seller) ||
    authUser?.role === "seller" ||
    authUser?.membership?.role === "seller";

  useEffect(() => {
    let cancelled = false;

    async function resolvePortal() {
      if (!slug) {
        setPortalResolution({
          loading: false,
          portalType: "owner",
          partner: null,
        });
        return;
      }

      if (isSellerAccount) {
        setPortalResolution({
          loading: false,
          portalType: "seller",
          partner: null,
        });
        return;
      }

      setPortalResolution({
        loading: true,
        portalType: "unknown",
        partner: null,
      });

      try {
        const response = await api.get<PartnerPortalBootstrap>(
          "/ticketing/partner/bootstrap/",
          {
            params: {
              slug,
              organisation_slug: slug,
            },
          },
        );

        if (!cancelled && response.data?.portal_type === "partner") {
          setPortalResolution({
            loading: false,
            portalType: "partner",
            partner: response.data,
          });
        }
      } catch {
        if (!cancelled) {
          setPortalResolution({
            loading: false,
            portalType: "owner",
            partner: null,
          });
        }
      }
    }

    void resolvePortal();

    return () => {
      cancelled = true;
    };
  }, [isSellerAccount, slug]);

  const isOperationsRoute = location.pathname.includes("/operations");
  const portalLabel = isOperationsRoute
    ? t("navigation.portals.operations")
    : t("navigation.portals.owner");

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const response = await api.get<OrganisationBranding>(
          `/organisations/public-branding/ticketing/${slug}/`,
        );

        setBranding(response.data);
      } catch (error) {
        console.error(
          "Could not load ticketing branding in owner layout:",
          error,
        );
      }
    }

    loadBranding();
  }, [slug]);

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
        "",
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
        "",
    );
  }, [branding]);

  const rawOrganisationName =
    authUser?.organisation?.name ||
    authUser?.seller?.organisation_name ||
    slug ||
    t("navigation.defaults.platform");

  const companyName =
    branding?.platform_name ||
    branding?.company_name ||
    rawOrganisationName;

  const companyLogoUrl = resolveAssetUrl(
    branding?.logo_url || branding?.logo || "",
  );

  const userName = getUserDisplayName(
    authUser,
    t("common.staffMember"),
  );
  const userEmail = authUser?.email || "";
  const userAvatarUrl = getUserAvatarUrl(authUser);

  useEffect(() => {
    if (!manifestUrl) return;

    updateOrCreateLinkById(
      "app-manifest",
      "manifest",
      manifestUrl,
      "application/manifest+json",
    );
  }, [manifestUrl]);

  useEffect(() => {
    if (!branding) return;

    const appName =
      branding.platform_name ||
      branding.company_name ||
      companyName ||
      "PCD Experiences";

    document.title = isOperationsRoute
      ? `${appName} · ${t("navigation.sections.operations")}`
      : appName;

    if (faviconUrl) {
      updateOrCreateLinkById(
        "app-favicon",
        "icon",
        faviconUrl,
        "image/png",
      );
      updateOrCreateLinkById(
        "app-shortcut-icon",
        "shortcut icon",
        faviconUrl,
        "image/png",
      );
    }

    if (appleTouchIconUrl) {
      updateOrCreateLinkById(
        "apple-touch-icon",
        "apple-touch-icon",
        appleTouchIconUrl,
      );
    }

    updateOrCreateMetaById(
      "app-theme-color",
      "theme-color",
      branding.theme_color ||
        branding.primary_color ||
        "#020617",
    );

    updateOrCreateMetaById(
      "apple-mobile-web-app-title",
      "apple-mobile-web-app-title",
      appName,
    );

    updateOrCreateMetaById(
      "mobile-web-app-capable",
      "mobile-web-app-capable",
      "yes",
    );
  }, [
    branding,
    faviconUrl,
    appleTouchIconUrl,
    companyName,
    isOperationsRoute,
    t,
  ]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone === true;

    setIsInstalled(isStandalone);

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleAppInstalled() {
      setInstallPrompt(null);
      setIsInstalled(true);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener(
        "appinstalled",
        handleAppInstalled,
      );
    };
  }, []);

  async function handleInstallApp() {
    if (!installPrompt) return;

    try {
      setInstalling(true);

      await installPrompt.prompt();
      await installPrompt.userChoice;

      setInstallPrompt(null);
    } catch (error) {
      console.error("Could not install Ticketing app:", error);
    } finally {
      setInstalling(false);
    }
  }

  async function handleLogout() {
    await dispatch(logoutUser());
    navigate(`/ticketing/${slug}/login`, { replace: true });
  }

  const showInstallButton = Boolean(
    installPrompt && !isInstalled,
  );

  const outletContext = useMemo<TicketingDashboardOutletContext>(
    () => ({
      slug,
      organisationName: rawOrganisationName,
      companyName,
      companyLogoUrl,
      branding,
      isOperationsRoute,
      portalLabel,
      portalType: "owner",
      isOwner: true,
      isSeller: false,
      isPartner: false,
      partnerPermissions: null,
    }),
    [
      slug,
      rawOrganisationName,
      companyName,
      companyLogoUrl,
      branding,
      isOperationsRoute,
      portalLabel,
    ],
  );

  if (portalResolution.loading) {
    return <PortalLoadingScreen />;
  }

  if (portalResolution.portalType === "seller") {
    return (
      <Navigate
        to={`/ticketing/${slug}/seller/dashboard`}
        replace
      />
    );
  }

  if (
    portalResolution.portalType === "partner" &&
    portalResolution.partner
  ) {
    return (
      <Navigate
        to={getPartnerDestination(
          slug,
          portalResolution.partner.permissions,
        )}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TicketingSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slug={slug}
        isOwnerOrAdmin
        organisationName={rawOrganisationName}
        organisationLogoUrl={companyLogoUrl}
        companyName={companyName}
        companyLogoUrl={companyLogoUrl}
        portalLabel={portalLabel}
      />

      <div className="min-h-screen lg:pl-72">
        <TicketingTopbar
          user={authUser}
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          organisationName={rawOrganisationName}
          organisationLogoUrl={companyLogoUrl}
          companyName={companyName}
          companyLogoUrl={companyLogoUrl}
          portalLabel={portalLabel}
          onMenuClick={() => setMobileOpen(true)}
          onLogout={handleLogout}
        />

        <main className="px-4 pb-24 pt-4 sm:px-6 lg:px-8 lg:pb-10">
          <div className="mx-auto w-full max-w-7xl">
            {showInstallButton && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleInstallApp}
                  disabled={installing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {installing
                    ? t("layout.installing")
                    : t("layout.installApp")}
                </button>
              </div>
            )}

            <Outlet context={outletContext} />
          </div>
        </main>
      </div>
    </div>
  );
}
