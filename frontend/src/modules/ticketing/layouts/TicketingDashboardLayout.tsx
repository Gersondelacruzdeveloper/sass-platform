// src/modules/ticketing/layouts/TicketingDashboardLayout.tsx

import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";
import { Download } from "lucide-react";

import api from "../../../api/axios";
import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

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

function getUserDisplayName(user: any) {
  return (
    user?.full_name ||
    user?.name ||
    user?.username ||
    user?.email ||
    "Staff Member"
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

export default function TicketingDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<OrganisationBranding | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

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
    async function loadBranding() {
      if (!slug) return;

      try {
        const response = await api.get<OrganisationBranding>(
          `/organisations/public-branding/ticketing/${slug}/`
        );

        setBranding(response.data);
      } catch (error) {
        console.error("Could not load ticketing branding in layout:", error);
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
    "PCD Experiences";

  const userName = getUserDisplayName(authUser);
  const userEmail = authUser?.email || "";
  const userAvatarUrl = getUserAvatarUrl(authUser);

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

    updateOrCreateMetaById(
      "apple-mobile-web-app-capable",
      "apple-mobile-web-app-capable",
      "yes"
    );

    updateOrCreateMetaById(
      "mobile-web-app-capable",
      "mobile-web-app-capable",
      "yes"
    );
  }, [branding, faviconUrl, appleTouchIconUrl, organisationName]);

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

  return (
    <div className="min-h-screen bg-slate-50">
      <TicketingSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
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
            {showInstallButton && (
              <div className="mb-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleInstallApp}
                  disabled={installing}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {installing ? "Installing..." : "Install App"}
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
