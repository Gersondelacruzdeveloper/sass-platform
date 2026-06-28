// src/modules/ticketing/components/TicketingTopbar.tsx

import { LogOut, Menu, UserCircle } from "lucide-react";

type TicketingTopbarProps = {
  user: any;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  organisationName: string;
  onMenuClick: () => void;
  onLogout: () => void;
};

export default function TicketingTopbar({
  userName,
  userEmail,
  userAvatarUrl,
  organisationName,
  onMenuClick,
  onLogout,
}: TicketingTopbarProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-2xl border border-slate-200 bg-white p-2 text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div>
            <p className="text-sm font-black text-slate-950">
              {organisationName}
            </p>
            <p className="text-xs font-semibold text-slate-500">
              Tours, Tickets & Transfers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-black text-slate-950">{userName}</p>
            <p className="text-xs font-semibold text-slate-500">{userEmail}</p>
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