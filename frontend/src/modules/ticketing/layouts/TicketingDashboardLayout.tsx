// src/modules/ticketing/layouts/TicketingDashboardLayout.tsx
// Layout version: portal-router-v4-role-aware-fail-closed-2026-08-05

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
  | {
      loading: true;
      portalType: "checking";
      partner: null;
      resolvedFor: string;
    }
  | {
      loading: false;
      portalType:
        | "owner"
        | "seller"
        | "pending"
        | "denied"
        | "unavailable";
      partner: null;
      resolvedFor: string;
    }
  | {
      loading: false;
      portalType: "partner";
      partner: PartnerPortalBootstrap;
      resolvedFor: string;
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

function normalizeRole(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
}

function getHttpStatus(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("response" in error)
  ) {
    return undefined;
  }

  return (
    error as {
      response?: {
        status?: number;
      };
    }
  ).response?.status;
}

function getVerifiedUser(responseData: any) {
  return responseData?.user || responseData;
}

function hasExplicitOwnerAccess(
  user: any,
  organisationSlug: string,
) {
  if (
    user?.is_staff === true ||
    user?.is_superuser === true ||
    user?.is_platform_owner === true
  ) {
    return true;
  }

  const adminRoles = new Set(["owner", "admin", "manager"]);
  const currentOrganisationSlug =
    user?.organisation?.slug ||
    user?.organisation_slug ||
    "";

  return Boolean(
    currentOrganisationSlug === organisationSlug &&
      user?.organisation?.is_active !== false &&
      adminRoles.has(normalizeRole(user?.role)),
  );
}

function isNormalAccessFailure(status?: number) {
  return status === 401 || status === 403 || status === 404;
}

function organisationParams(organisationSlug: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
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

function PortalAccessScreen({
  title,
  message,
  onLogout,
  allowRetry = false,
}: {
  title: string;
  message: string;
  onLogout: () => void | Promise<void>;
  allowRetry?: boolean;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black text-slate-950">
          {title}
        </h1>

        <p className="mt-4 text-sm font-medium leading-6 text-slate-600">
          {message}
        </p>

        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          {allowRetry && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-black text-slate-800 transition hover:bg-slate-50"
            >
              Try again
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
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
  const [showIosInstallHelp, setShowIosInstallHelp] = useState(false);
  const [portalResolution, setPortalResolution] =
    useState<PortalResolution>({
      loading: true,
      portalType: "checking",
      partner: null,
      resolvedFor: "",
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

  const accessResolutionKey = `${
    authUser?.id || authUser?.email || "anonymous"
  }:${slug || "missing-organisation"}`;

  useEffect(() => {
    let cancelled = false;
    const resolvedFor = accessResolutionKey;

    function commitResolution(
      resolution: Omit<PortalResolution, "resolvedFor">,
    ) {
      if (cancelled) return;

      setPortalResolution({
        ...resolution,
        resolvedFor,
      } as PortalResolution);
    }

    async function resolvePortal() {
      commitResolution({
        loading: true,
        portalType: "checking",
        partner: null,
      });

      if (!slug) {
        commitResolution({
          loading: false,
          portalType: "denied",
          partner: null,
        });
        return;
      }

      let verifiedUser: any;

      try {
        const response = await api.get("/accounts/me/");
        verifiedUser = getVerifiedUser(response.data);
      } catch (error) {
        const status = getHttpStatus(error);

        commitResolution({
          loading: false,
          portalType: isNormalAccessFailure(status)
            ? "denied"
            : "unavailable",
          partner: null,
        });
        return;
      }

      if (!verifiedUser) {
        commitResolution({
          loading: false,
          portalType: "unavailable",
          partner: null,
        });
        return;
      }

      if (hasExplicitOwnerAccess(verifiedUser, slug)) {
        commitResolution({
          loading: false,
          portalType: "owner",
          partner: null,
        });
        return;
      }

      try {
        const response = await api.get("/ticketing/sellers/me/", {
          params: organisationParams(slug),
        });
        const seller = response.data;

        if (
          normalizeRole(seller?.application_status) === "approved" &&
          seller?.is_active === true &&
          seller?.can_access_dashboard !== false
        ) {
          commitResolution({
            loading: false,
            portalType: "seller",
            partner: null,
          });
          return;
        }
      } catch (error) {
        const status = getHttpStatus(error);

        if (!isNormalAccessFailure(status)) {
          commitResolution({
            loading: false,
            portalType: "unavailable",
            partner: null,
          });
          return;
        }
      }

      try {
        const response = await api.get("/ticketing/seller/application/", {
          params: organisationParams(slug),
        });
        const applicationStatus = normalizeRole(response.data?.status);

        if (
          applicationStatus === "pending" ||
          applicationStatus === "needs_information"
        ) {
          commitResolution({
            loading: false,
            portalType: "pending",
            partner: null,
          });
          return;
        }

        if (
          applicationStatus === "rejected" ||
          applicationStatus === "withdrawn" ||
          applicationStatus === "approved"
        ) {
          commitResolution({
            loading: false,
            portalType: "denied",
            partner: null,
          });
          return;
        }
      } catch (error) {
        const status = getHttpStatus(error);

        if (!isNormalAccessFailure(status)) {
          commitResolution({
            loading: false,
            portalType: "unavailable",
            partner: null,
          });
          return;
        }
      }

      try {
        const response = await api.get<PartnerPortalBootstrap>(
          "/ticketing/partner/bootstrap/",
          { params: organisationParams(slug) },
        );

        if (response.data?.portal_type !== "partner") {
          commitResolution({
            loading: false,
            portalType: "denied",
            partner: null,
          });
          return;
        }

        commitResolution({
          loading: false,
          portalType: "partner",
          partner: response.data,
        });
      } catch (error) {
        const status = getHttpStatus(error);

        commitResolution({
          loading: false,
          portalType: isNormalAccessFailure(status)
            ? "denied"
            : "unavailable",
          partner: null,
        });
      }
    }

    void resolvePortal();

    return () => {
      cancelled = true;
    };
  }, [accessResolutionKey, slug]);

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

  const isIosDevice = useMemo(() => {
    const userAgent = window.navigator.userAgent;
    const isClassicIos = /iPad|iPhone|iPod/.test(userAgent);
    const isModernIpad =
      window.navigator.platform === "MacIntel" &&
      window.navigator.maxTouchPoints > 1;

    return isClassicIos || isModernIpad;
  }, []);

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
    if (isInstalled) return;

    // iPhone/iPad Safari does not expose beforeinstallprompt. Apple requires
    // the user to confirm installation from Safari's Share menu.
    if (!installPrompt) {
      if (isIosDevice) {
        setShowIosInstallHelp(true);
      }
      return;
    }

    try {
      setInstalling(true);

      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;

      // The browser consumes beforeinstallprompt after it is used.
      // appinstalled will mark the app installed when installation succeeds.
      setInstallPrompt(null);

      if (choice.outcome === "accepted") {
        setShowIosInstallHelp(false);
      }
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
    !isInstalled && (installPrompt || isIosDevice),
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

  // Never render a result resolved for a previous user or organisation.
  // This prevents a brief flash of a cached owner dashboard after login,
  // logout, account switching, or slug changes.
  if (
    portalResolution.loading ||
    portalResolution.resolvedFor !== accessResolutionKey
  ) {
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

  if (portalResolution.portalType === "pending") {
    return (
      <PortalAccessScreen
        title="Seller application awaiting approval"
        message="Your application has been received. You cannot access any dashboard until an owner or administrator approves your seller account."
        onLogout={handleLogout}
      />
    );
  }

  if (portalResolution.portalType === "denied") {
    return (
      <PortalAccessScreen
        title="Access denied"
        message="Your account does not have permission to access this portal. No owner, seller, partner, booking, reporting, or financial information has been displayed."
        onLogout={handleLogout}
      />
    );
  }

  if (portalResolution.portalType === "unavailable") {
    return (
      <PortalAccessScreen
        title="Unable to verify access"
        message="The server could not confirm your permissions. For security, the dashboard has been blocked. Try again when the server is available."
        onLogout={handleLogout}
        allowRetry
      />
    );
  }

  // Fail closed for every unexpected state. The owner shell is rendered
  // only after an explicit verified "owner" resolution.
  if (portalResolution.portalType !== "owner") {
    return (
      <PortalAccessScreen
        title="Access denied"
        message="Your portal access could not be confirmed. No dashboard information has been displayed."
        onLogout={handleLogout}
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

      {showIosInstallHelp && !isInstalled && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ios-install-title"
          onClick={() => setShowIosInstallHelp(false)}
        >
          <section
            className="w-full max-w-md rounded-[2rem] bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
              <Download className="h-6 w-6" />
            </div>

            <h2
              id="ios-install-title"
              className="mt-4 text-center text-xl font-black text-slate-950"
            >
              Añade esta aplicación a tu iPhone
            </h2>

            <p className="mt-2 text-center text-sm font-semibold leading-6 text-slate-600">
              Apple requiere que la instalación se haga desde Safari. Solo toma unos pocos pasos:
            </p>

            <ol className="mt-5 space-y-3 text-sm font-bold text-slate-800">
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                1. Toca el botón Compartir en Safari.
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                2. Selecciona <span className="font-black">Agregar a pantalla de inicio</span>.
              </li>
              <li className="rounded-2xl bg-slate-50 px-4 py-3">
                3. Toca <span className="font-black">Agregar</span>.
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIosInstallHelp(false)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Entendido
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
