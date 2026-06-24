// src/modules/disco/components/DiscoTopbar.tsx

import { Bell, Languages, LogOut, Menu, Music4, Search, User } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { getPublicDiscoBranding } from "../api/brandingApi";
import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type DiscoUserLike = {
  full_name?: string | null;
  name?: string | null;
  username?: string | null;
  email?: string | null;

  profile_image_url?: string | null;
  employee_photo_url?: string | null;
  user_avatar_url?: string | null;

  photo?: string | null;
  photo_url?: string | null;
  avatar?: string | null;
  avatar_url?: string | null;
};

type TopbarBranding = {
  company_name?: string | null;
  platform_name?: string | null;
  logo?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  favicon_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
};

type DiscoTopbarProps = {
  onMenuClick: () => void;

  user?: DiscoUserLike | null;

  userName?: string;
  userEmail?: string;

  userImage?: string | null;
  userAvatar?: string | null;
  userAvatarUrl?: string | null;

  profileImageUrl?: string | null;
  employeePhotoUrl?: string | null;
  userAvatarImageUrl?: string | null;
  photoUrl?: string | null;
  photo?: string | null;
  avatarUrl?: string | null;
  avatar?: string | null;

  organisationName?: string;
  notificationCount?: number;
  onLogout?: () => void;
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

export default function DiscoTopbar({
  onMenuClick,
  user,

  userName,
  userEmail,

  userImage,
  userAvatar,
  userAvatarUrl,

  profileImageUrl,
  employeePhotoUrl,
  userAvatarImageUrl,
  photoUrl,
  photo,
  avatarUrl,
  avatar,

  organisationName,
  notificationCount = 0,
  onLogout,
}: DiscoTopbarProps) {
  const { organisationSlug } = useParams();
  const { language, setLanguage, t } = useDiscoTranslation();

  const [imageError, setImageError] = useState(false);
  const [brandingLogoError, setBrandingLogoError] = useState(false);
  const [branding, setBranding] = useState<TopbarBranding | null>(null);

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadBranding() {
      if (!slug) return;

      try {
        const data = await getPublicDiscoBranding(slug);
        setBranding(data);
      } catch (err) {
        console.error("Could not load topbar branding:", err);
      }
    }

    loadBranding();
  }, [slug]);

  const displayName =
    userName ||
    user?.full_name ||
    user?.name ||
    user?.username ||
    t("common.staffMember");

  const displayEmail = userEmail || user?.email || t("common.staffAccount");

  const displayOrganisationName =
    branding?.platform_name ||
    branding?.company_name ||
    organisationName ||
    organisationSlug ||
    t("common.discoPlatform");

  const rawBrandingLogoUrl = branding?.logo_url || branding?.logo || "";

  useEffect(() => {
    setBrandingLogoError(false);
  }, [rawBrandingLogoUrl]);

  const brandingLogoUrl = useMemo(() => {
    if (!rawBrandingLogoUrl || brandingLogoError) return "";
    return resolveImageUrl(rawBrandingLogoUrl);
  }, [rawBrandingLogoUrl, brandingLogoError]);

  const rawImageUrl = useMemo(() => {
    return (
      profileImageUrl ||
      employeePhotoUrl ||
      userAvatarImageUrl ||
      userAvatarUrl ||
      userImage ||
      photoUrl ||
      photo ||
      avatarUrl ||
      avatar ||
      userAvatar ||
      user?.profile_image_url ||
      user?.employee_photo_url ||
      user?.user_avatar_url ||
      user?.photo_url ||
      user?.photo ||
      user?.avatar_url ||
      user?.avatar ||
      ""
    );
  }, [
    profileImageUrl,
    employeePhotoUrl,
    userAvatarImageUrl,
    userAvatarUrl,
    userImage,
    photoUrl,
    photo,
    avatarUrl,
    avatar,
    userAvatar,
    user,
  ]);

  const resolvedProfileImageUrl = useMemo(() => {
    if (!rawImageUrl || imageError) return "";
    return resolveImageUrl(rawImageUrl);
  }, [rawImageUrl, imageError]);

  useEffect(() => {
    setImageError(false);
  }, [rawImageUrl]);

  function Avatar({ mobile = false }: { mobile?: boolean }) {
    const sizeClass = mobile ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-xl";

    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden bg-slate-100 ${sizeClass}`}
      >
        {resolvedProfileImageUrl ? (
          <img
            src={resolvedProfileImageUrl}
            alt={displayName}
            onError={() => setImageError(true)}
            className="h-full w-full object-cover"
          />
        ) : (
          <User size={18} className="text-slate-700" />
        )}
      </div>
    );
  }

  function BrandLogo() {
    return (
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {brandingLogoUrl ? (
          <img
            src={brandingLogoUrl}
            alt={displayOrganisationName}
            onError={() => setBrandingLogoError(true)}
            className="h-full w-full object-contain p-1.5"
          />
        ) : (
          <Music4 size={20} className="text-slate-700" />
        )}
      </div>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t("topbar.openMenu")}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <BrandLogo />

          <div className="hidden sm:block">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              {t("common.discoPlatform")}
            </p>

            <h1 className="max-w-[220px] truncate text-lg font-black text-slate-900 xl:max-w-md">
              {displayOrganisationName}
            </h1>
          </div>
        </div>

        <div className="hidden flex-1 justify-center lg:flex">
          <div className="relative w-full max-w-lg">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              type="text"
              placeholder={t("topbar.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm md:flex">
            <Languages size={17} className="text-slate-500" />

            <select
              value={language}
              aria-label={t("topbar.language")}
              onChange={(event) =>
                setLanguage(event.target.value as DiscoLanguage)
              }
              className="bg-transparent text-sm font-black text-slate-700 outline-none"
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </div>

          <button
            type="button"
            aria-label={t("topbar.notifications")}
            className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Bell size={18} />

            {notificationCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white">
                {notificationCount > 99 ? "99+" : notificationCount}
              </span>
            )}
          </button>

          <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:flex">
            <Avatar />

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {displayName}
              </p>

              <p className="truncate text-xs font-medium text-slate-500">
                {displayEmail}
              </p>
            </div>
          </div>

          <div className="sm:hidden">
            <Avatar mobile />
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              aria-label={t("topbar.logout")}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-600 shadow-sm hover:bg-red-100"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}