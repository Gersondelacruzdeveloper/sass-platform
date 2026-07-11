// src/modules/ticketing/components/TicketingTopbar.tsx

import { LogOut, Menu, Ticket, UserCircle } from "lucide-react";

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
  portalLabel = "Tours, Tickets & Transfers",
  onMenuClick,
  onLogout,
}: TicketingTopbarProps) {
  const displayCompanyName =
    companyName?.trim() || organisationName?.trim() || "Ticketing";

  const displayCompanyLogo =
    companyLogoUrl?.trim() || organisationLogoUrl?.trim() || null;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur-xl">
      <div className="flex min-h-16 items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 lg:hidden"
            aria-label="Open navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {displayCompanyLogo ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img
                src={displayCompanyLogo}
                alt={`${displayCompanyName} logo`}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 shadow-sm ring-1 ring-amber-100">
              <Ticket className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-base font-black tracking-tight text-slate-950">
              {displayCompanyName}
            </p>

            <p className="truncate text-xs font-semibold text-slate-500">
              {portalLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden max-w-[220px] text-right sm:block">
            <p className="truncate text-sm font-black text-slate-950">
              {userName || "User"}
            </p>

            <p className="truncate text-xs font-semibold text-slate-500">
              {userEmail || ""}
            </p>
          </div>

          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={userName || "User"}
              className="h-10 w-10 rounded-2xl border border-slate-200 object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 ring-1 ring-slate-200">
              <UserCircle className="h-6 w-6" />
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
            title="Logout"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
