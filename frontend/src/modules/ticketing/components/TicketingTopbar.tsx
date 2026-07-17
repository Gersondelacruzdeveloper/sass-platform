import {
  Languages,
  LogOut,
  Menu,
  Ticket,
  UserCircle,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type TicketingTopbarProps = {
  user: any;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;

  organisationName: string;
  organisationLogoUrl?: string | null;

  companyName?: string | null;
  companyLogoUrl?: string | null;

  portalLabel?: string;
  onMenuClick: () => void;
  onLogout: () => void;
};

export default function TicketingTopbar({
  userName,
  userEmail,
  userAvatarUrl,
  organisationName,
  organisationLogoUrl,
  companyName,
  companyLogoUrl,
  portalLabel,
  onMenuClick,
  onLogout,
}: TicketingTopbarProps) {
  const { language, setLanguage, t } =
    useTicketingAdminTranslation();

  const displayCompanyName =
    companyName?.trim() ||
    organisationName?.trim() ||
    t("navigation.defaults.ticketing");

  const displayCompanyLogo =
    companyLogoUrl?.trim() ||
    organisationLogoUrl?.trim() ||
    null;

  const resolvedPortalLabel =
    portalLabel || t("navigation.portals.default");

  const resolvedUserName =
    userName || t("common.user");

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="flex min-h-16 items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
            aria-label={t(
              "navigation.accessibility.openMenu",
            )}
          >
            <Menu className="h-5 w-5" />
          </button>

          {displayCompanyLogo ? (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:h-12 sm:w-12">
              <img
                src={displayCompanyLogo}
                alt={t(
                  "navigation.accessibility.companyLogo",
                  {
                    company: displayCompanyName,
                  },
                )}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-100 sm:h-12 sm:w-12">
              <Ticket className="h-5 w-5 sm:h-6 sm:w-6" />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-slate-950 sm:text-base">
              {displayCompanyName}
            </p>

            <p className="truncate text-[11px] font-semibold text-slate-500 sm:text-xs">
              {resolvedPortalLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
          <label className="relative block shrink-0">
            <span className="sr-only">
              {t("topbar.language")}
            </span>

            <Languages className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 sm:left-3" />

            <select
              value={language}
              onChange={(event) =>
                setLanguage(
                  event.target.value === "es"
                    ? "es"
                    : "en",
                )
              }
              className="h-10 w-[68px] appearance-none rounded-2xl border border-slate-200 bg-white py-0 pl-7 pr-5 text-[11px] font-black text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-slate-400 sm:w-auto sm:pl-9 sm:pr-8 sm:text-xs"
              aria-label={t("topbar.language")}
            >
              <option value="en">EN</option>
              <option value="es">ES</option>
            </select>
          </label>

          <div className="hidden max-w-[220px] text-right sm:block">
            <p className="truncate text-sm font-black text-slate-950">
              {resolvedUserName}
            </p>

            <p className="truncate text-xs font-semibold text-slate-500">
              {userEmail || ""}
            </p>
          </div>

          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={resolvedUserName}
              className="h-10 w-10 shrink-0 rounded-2xl border border-slate-200 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200">
              <UserCircle className="h-6 w-6" />
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            title={t("topbar.logout")}
            aria-label={t(
              "navigation.accessibility.logout",
            )}
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
