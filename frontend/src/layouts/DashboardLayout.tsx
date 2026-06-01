import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  Building2,
  GraduationCap,
  LogOut,
  Map,
  Package,
  Receipt,
  Users,
  Wine,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useAppDispatch } from "../store/hooks";
import { logoutUser } from "../features/auth/authSlice";
import {
  getBranding,
  defaultBranding,
  type Branding,
} from "../api/brandingApi";

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: BarChart3 },
  { label: "Disco", path: "/dashboard/disco", icon: Wine },
  { label: "Products", path: "/dashboard/disco/products", icon: Package },
  { label: "Expenses", path: "/dashboard/disco/expenses", icon: Receipt },
  { label: "Organisations", path: "/dashboard/organisations", icon: Building2 },
  { label: "A&B Training", path: "/training", icon: GraduationCap },
  { label: "Empleados A&B", path: "/training/employees", icon: Users },
  { label: "Entrenamientos", path: "/training/sessions", icon: GraduationCap },
  { label: "Roadmap 90 días", path: "/training/roadmap", icon: Map },
];

export default function DashboardLayout() {
  const location = useLocation();
  const dispatch = useAppDispatch();
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
      const data = await getBranding();
      setBranding(data);
    }

    loadBranding();
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--primary-color",
      branding.primary_color
    );

    document.documentElement.style.setProperty(
      "--accent-color",
      branding.accent_color
    );
  }, [branding]);

  const handleLogout = () => {
    dispatch(logoutUser());
    window.location.href = "/login";
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      <aside
        className="w-72 text-white p-5 hidden md:flex flex-col"
        style={{ backgroundColor: branding.primary_color }}
      >
        <div className="mb-8">
          <div className="flex items-center gap-3">
            {branding.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.company_name}
                className="h-11 w-11 rounded-xl object-contain bg-white p-1"
              />
            ) : (
              <div
                className="h-11 w-11 rounded-xl flex items-center justify-center font-bold text-white"
                style={{ backgroundColor: branding.accent_color }}
              >
                {branding.company_name.charAt(0)}
              </div>
            )}

            <div>
              <h1 className="text-xl font-bold leading-tight">
                {branding.platform_name}
              </h1>
              <p className="text-sm text-white/70">{branding.company_name}</p>
            </div>
          </div>
        </div>

        <nav className="space-y-2 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;

            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                  active
                    ? "bg-white text-slate-950"
                    : "text-white/75 hover:bg-white/10"
                }`}
              >
                <Icon size={20} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700"
        >
          <LogOut size={20} />
          Logout
        </button>
      </aside>

      <main className="flex-1">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-slate-900">
              {branding.platform_name}
            </h2>
            <p className="text-sm text-slate-500">
              Manage {branding.company_name} modules
            </p>
          </div>
        </header>

        <Outlet />
      </main>
    </div>
  );
}