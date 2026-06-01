import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  LayoutDashboard,
  CreditCard,
  ShoppingCart,
  Boxes,
  Users,
  Receipt,
  BarChart3,
  Crown,
  Settings,
  LogOut,
} from "lucide-react";

import api from "../../../api/axios";

export default function DiscoSidebar() {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();

  const basePath = `/disco/${organisationSlug}`;

  const links = [
    {
      label: "Dashboard",
      to: `${basePath}/dashboard`,
      icon: LayoutDashboard,
    },
    {
      label: "POS",
      to: `${basePath}/pos`,
      icon: CreditCard,
    },
    {
      label: "Sales",
      to: `${basePath}/sales`,
      icon: ShoppingCart,
    },
    {
      label: "Inventory",
      to: `${basePath}/inventory`,
      icon: Boxes,
    },
    {
      label: "Employees",
      to: `${basePath}/employees`,
      icon: Users,
    },
    {
      label: "Expenses",
      to: `${basePath}/expenses`,
      icon: Receipt,
    },
    {
      label: "Reports",
      to: `${basePath}/reports`,
      icon: BarChart3,
    },
    {
      label: "Subscription",
      to: `${basePath}/subscription`,
      icon: Crown,
    },
    {
      label: "Settings",
      to: `${basePath}/settings`,
      icon: Settings,
    },
  ];

  const handleLogout = async () => {
    try {
      await api.post("/accounts/logout/");
    } catch (error) {
      console.error(error);
    } finally {
      navigate(`/disco/${organisationSlug}/login`);
    }
  };

  return (
    <aside className="hidden w-72 flex-col border-r border-white/10 bg-[#0f172a] text-white md:flex">
      <div className="border-b border-white/10 px-6 py-6">
        <h1 className="text-2xl font-bold tracking-tight">
          Disco<span className="text-cyan-400">OS</span>
        </h1>

        <p className="mt-1 text-sm text-slate-400">
          Premium nightclub management
        </p>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        {links.map((link) => {
          const Icon = link.icon;

          return (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `
                group flex items-center gap-3 rounded-2xl px-4 py-3
                text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                    : "text-slate-300 hover:bg-white/5 hover:text-white"
                }
              `
              }
            >
              <Icon
                size={20}
                className="transition-transform duration-200 group-hover:scale-110"
              />

              <span>{link.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-2xl bg-white/5 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Current Plan
          </p>

          <div className="mt-2 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Pro Plan</h3>
              <p className="text-sm text-slate-400">
                12 Employees Active
              </p>
            </div>

            <div className="rounded-full bg-cyan-500/20 px-3 py-1 text-xs font-semibold text-cyan-300">
              ACTIVE
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-red-500 hover:text-white"
      >
        <LogOut size={18} />
        Logout
      </button>
    </aside>
  );
}