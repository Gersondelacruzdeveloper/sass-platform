// src/modules/disco/components/DiscoSidebar.tsx

import { NavLink, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  ArrowLeftRight,
  Table2,
  CalendarDays,
  Users,
  Wallet,
  Receipt,
  BarChart3,
  Activity,
  Settings,
  X,
  Music4,
} from "lucide-react";

type DiscoSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export default function DiscoSidebar({
  mobileOpen,
  onClose,
}: DiscoSidebarProps) {
  const { organisationSlug } = useParams();

  const links = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      path: `/disco/${organisationSlug}/dashboard`,
    },
    {
      name: "POS",
      icon: ShoppingCart,
      path: `/disco/${organisationSlug}/pos`,
    },
    {
      name: "Products",
      icon: Package,
      path: `/disco/${organisationSlug}/products`,
    },
    {
      name: "Inventory",
      icon: Boxes,
      path: `/disco/${organisationSlug}/inventory`,
    },
    {
      name: "Stock Movements",
      icon: ArrowLeftRight,
      path: `/disco/${organisationSlug}/stock-movements`,
    },
    {
      name: "Tables",
      icon: Table2,
      path: `/disco/${organisationSlug}/tables`,
    },
    {
      name: "Reservations",
      icon: CalendarDays,
      path: `/disco/${organisationSlug}/reservations`,
    },
    {
      name: "Employees",
      icon: Users,
      path: `/disco/${organisationSlug}/employees`,
    },
    {
      name: "Cash Shifts",
      icon: Wallet,
      path: `/disco/${organisationSlug}/cash-shifts`,
    },
    {
      name: "Expenses",
      icon: Receipt,
      path: `/disco/${organisationSlug}/expenses`,
    },
    {
      name: "Reports",
      icon: BarChart3,
      path: `/disco/${organisationSlug}/reports`,
    },
    {
      name: "Activity Logs",
      icon: Activity,
      path: `/disco/${organisationSlug}/activity-logs`,
    },
    {
      name: "Settings",
      icon: Settings,
      path: `/disco/${organisationSlug}/settings`,
    },
  ];

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed left-0 top-0 z-50 h-screen w-72
          transform border-r border-slate-800
          bg-slate-950 text-white transition-transform duration-300
          lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="flex h-20 items-center justify-between border-b border-slate-800 px-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Disco
            </p>

            <h2 className="flex items-center gap-2 text-xl font-black">
              <Music4 size={22} />
              Nightclub POS
            </h2>
          </div>

          <button
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-800 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <div className="h-[calc(100vh-80px)] overflow-y-auto p-4">
          <nav className="space-y-2">
            {links.map((link) => {
              const Icon = link.icon;

              return (
                <NavLink
                  key={link.path}
                  to={link.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `
                      flex items-center gap-3 rounded-2xl px-4 py-3
                      text-sm font-bold transition-all
                      ${
                        isActive
                          ? "bg-white text-slate-950 shadow-lg"
                          : "text-slate-300 hover:bg-slate-900 hover:text-white"
                      }
                    `
                  }
                >
                  <Icon size={18} />
                  {link.name}
                </NavLink>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="mt-8 rounded-3xl bg-slate-900 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Organisation
            </p>

            <h3 className="mt-1 truncate text-sm font-black">
              {organisationSlug}
            </h3>

            <p className="mt-2 text-xs text-slate-400">
              Multi-tenant Disco Management Platform
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}