// src/modules/ticketing/components/TicketingTopbar.tsx

import { LogOut, Menu, Ticket, UserCircle } from "lucide-react";

type TicketingTopbarProps = {
  user: any;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  organisationName: string;
  organisationLogoUrl?: string | null;
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
  portalLabel = "Tours, Tickets & Transfers",
  onMenuClick,
  onLogout,
}: TicketingTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          {organisationLogoUrl ? (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <img
                src={organisationLogoUrl}
                alt={organisationName}
                className="h-full w-full object-contain p-1"
              />
            </div>
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
              <Ticket className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-black text-slate-950">
              {organisationName}
            </p>
            <p className="truncate text-xs font-semibold text-slate-500">
              {portalLabel}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <div className="hidden max-w-[220px] text-right sm:block">
            <p className="truncate text-sm font-black text-slate-950">
              {userName}
            </p>
            <p className="truncate text-xs font-semibold text-slate-500">
              {userEmail}
            </p>
          </div>

          {userAvatarUrl ? (
            <img
              src={userAvatarUrl}
              alt={userName}
              className="h-10 w-10 rounded-2xl object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <UserCircle className="h-6 w-6" />
            </div>
          )}

          <button
            type="button"
            onClick={onLogout}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-red-50 hover:text-red-600"
            title="Logout"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
