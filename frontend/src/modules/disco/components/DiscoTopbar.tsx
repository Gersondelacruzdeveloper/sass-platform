// src/modules/disco/components/DiscoTopbar.tsx

import { Bell, LogOut, Menu, Search, User } from "lucide-react";
import { useParams } from "react-router-dom";

type DiscoTopbarProps = {
  onMenuClick: () => void;
  userName?: string;
  organisationName?: string;
  notificationCount?: number;
  onLogout?: () => void;
};

export default function DiscoTopbar({
  onMenuClick,
  userName = "Staff Member",
  organisationName,
  notificationCount = 0,
  onLogout,
}: DiscoTopbarProps) {
  const { organisationSlug } = useParams();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50 lg:hidden"
          >
            <Menu size={20} />
          </button>

          <div className="hidden sm:block">
            <p className="text-xs font-black uppercase tracking-widest text-slate-400">
              Disco Platform
            </p>

            <h1 className="text-lg font-black text-slate-900">
              {organisationName || organisationSlug}
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
              placeholder="Search products, reservations, employees..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-700 outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
              <User size={18} className="text-slate-700" />
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-900">
                {userName}
              </p>

              <p className="text-xs font-medium text-slate-500">
                Staff Account
              </p>
            </div>
          </div>

          <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm sm:hidden">
            <User size={18} />
          </div>

          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
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