// src/modules/ticketing/layouts/TicketingSellerLayout.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Download, LogOut } from "lucide-react";

import api from "../../../api/axios";
import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import TicketingSellerSidebar from "../components/TicketingSellerSidebar";
import TicketingTopbar from "../components/TicketingTopbar";
import ticketingApi from "../api/ticketingApi";
import type { Seller } from "../types/ticketingTypes";

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

function getErrorMessage(error: any, t: (key: string) => string) {
  const data = error?.response?.data;

  if (!data) return t("sellerLayout.errors.noAccess");
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  return t("sellerLayout.errors.noAccess");
}

export default function TicketingSellerLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<OrganisationBranding | null>(null);
  const [currentSeller, setCurrentSeller] = useState<Seller | null>(null);
  const [currentSellerLoading, setCurrentSellerLoading] = useState(true);
  const [sellerAccessError, setSellerAccessError] = useState("");
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  const { t } = useTicketingAdminTranslation();
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { organisationSlug } = useParams<{ organisationSlug: string }>();

  const { user } = useAppSelector((state) => state.auth);
  const authUser = user as any;

  const slug =
    organisationSlug ||
    authUser?.organisation?.slug ||
    authUser?.seller?.organisation_slug ||
    "";

  useEffect(() => {
    async function loadCurrentSeller() {
      if (!slug) {
        setCurrentSeller(null);
        setSellerAccessError(t("sellerLayout.errors.missingOrganisation"));
        setCurrentSellerLoading(false);
        return;
      }

      try {
        setCurrentSellerLoading(true);
        setSellerAccessError("");

        const seller = await ticketingApi.getSellerMe(slug);

        if (!seller || seller.is_active === false) {
          setCurrentSeller(null);
          setSellerAccessError(t("sellerLayout.errors.profileInactive"));
          return;
        }

        setCurrentSeller(seller);
      } catch (error) {
        console.error("Seller portal access denied:", error);
        setCurrentSeller(null);
        setSellerAccessError(getErrorMessage(error, t));
      } finally {
        setCurrentSellerLoading(false);
      }
    }

    loadCurrentSeller();
  }, [slug]);

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const response = await api.get<OrganisationBranding>(
          `/organisations/public-branding/ticketing/${slug}/`
        );

        setBranding(response.data);
      } catch (error) {
        console.error("Could not load ticketing branding in seller layout:", error);
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

  const organisationName =
    branding?.platform_name ||
    branding?.company_name ||
    authUser?.organisation?.name ||
    slug ||
    t("navigation.defaults.platform");

  const organisationLogoUrl = resolveAssetUrl(branding?.logo_url || branding?.logo || "");

  const userName = currentSeller?.full_name || getUserDisplayName(authUser, t("common.staffMember"));
  const userEmail = currentSeller?.email || authUser?.email || "";
  const userAvatarUrl =
    currentSeller?.photo_url || getUserAvatarUrl(authUser);

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
      t("sellerLayout.defaults.platform");

    document.title = `${appName} ${t("navigation.portals.seller")}`;

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

    updateOrCreateMetaById(
      "mobile-web-app-capable",
      "mobile-web-app-capable",
      "yes"
    );
  }, [branding, faviconUrl, appleTouchIconUrl, organisationName, t]);

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

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
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

  const showInstallButton = Boolean(installPrompt && !isInstalled);

  if (currentSellerLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-slate-950" />
          <p className="mt-4 text-sm font-black text-slate-600">
            {t("navigation.account.loadingAccess")}
          </p>
        </div>
      </div>
    );
  }

  if (!currentSeller) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </div>

          <p className="mt-4 text-sm font-black uppercase tracking-wide text-red-600">
            {t("navigation.account.loadingPermissions")}
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950">
            {t("navigation.portals.seller")}
          </h1>

          <p className="mx-auto mt-3 max-w-sm text-sm font-semibold leading-6 text-slate-500">
            {sellerAccessError ||
              t("sellerLayout.errors.needActiveProfile")}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              to={`/ticketing/${slug}/login`}
              className="inline-flex h-12 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            >{t("sellerLayout.actions.login")}
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700"
            >
              <LogOut className="h-4 w-4" />{t("sellerLayout.actions.logout")}
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <TicketingSellerSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
        onLogout={handleLogout}
        slug={slug}
        currentSeller={currentSeller}
        currentSellerLoading={currentSellerLoading}
      />

      <div className="min-h-screen lg:pl-72">
        <TicketingTopbar
          user={authUser}
          userName={userName}
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          organisationName={organisationName}
          organisationLogoUrl={organisationLogoUrl}
          portalLabel={t("navigation.portals.seller")}
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
                  {installing ? t("layout.installing") : t("layout.installApp")}
                </button>
              </div>
            )}

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
