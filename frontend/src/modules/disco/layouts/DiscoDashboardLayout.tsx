// src/modules/disco/layouts/DiscoDashboardLayout.tsx

import { useEffect, useMemo, useState } from "react";
import { Outlet, useNavigate, useParams } from "react-router-dom";

import DiscoSidebar from "../components/DiscoSidebar";
import DiscoTopbar from "../components/DiscoTopbar";

import { logoutUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";

import {
  getPublicDiscoBranding,
  type OrganisationBranding,
} from "../api/brandingApi";

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

export default function DiscoDashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [branding, setBranding] = useState<OrganisationBranding | null>(null);

  const dispatch = useAppDispatch();
  const navigate = useNavigate();
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

  const userName =
    authUser?.disco_employee?.full_name ||
    authUser?.full_name ||
    authUser?.name ||
    authUser?.username ||
    authUser?.email ||
    "Staff Member";

  const userEmail = authUser?.email || "";

  const organisationName =
    branding?.platform_name ||
    branding?.company_name ||
    authUser?.disco_employee?.organisation_name ||
    authUser?.organisation?.name ||
    slug;

  const userAvatarUrl =
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
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}