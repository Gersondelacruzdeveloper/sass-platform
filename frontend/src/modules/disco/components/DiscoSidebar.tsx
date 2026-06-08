// src/modules/disco/components/DiscoSidebar.tsx

import { NavLink, useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  Music4,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Table2,
  UserCircle,
  Users,
  Wallet,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import { logoutUser } from "../../../features/auth/authSlice";

type DiscoSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
};

export default function DiscoSidebar({
  mobileOpen,
  onClose,
}: DiscoSidebarProps) {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { organisationSlug } = useParams();
  const { user } = useAppSelector((state) => state.auth);

  const slug = organisationSlug || user?.organisation?.slug || "almond-brownie";

  const displayName =
    user?.disco_employee?.full_name ||
    user?.username ||
    user?.email ||
    "Logged in user";

  const role =
    user?.disco_employee?.role ||
    user?.role ||
    "User";

  const organisationName =
    user?.disco_employee?.organisation_name ||
    user?.organisation?.name ||
    slug;

  const links = [
    {
      name: "Dashboard",
      icon: LayoutDashboard,
      path: `/disco/${slug}/dashboard`,
    },
    {
      name: "POS",
      icon: ShoppingCart,
      path: `/disco/${slug}/pos`,
    },
    {
      name: "Products",
      icon: Package,
      path: `/disco/${slug}/products`,
    },
    {
      name: "Inventory",
      icon: Boxes,
      path: `/disco/${slug}/inventory`,
    },
    {
      name: "Stock Movements",
      icon: ArrowLeftRight,
      path: `/disco/${slug}/stock-movements`,
    },
    {
      name: "Tables",
      icon: Table2,
      path: `/disco/${slug}/tables`,
    },
    {
      name: "Reservations",
      icon: CalendarDays,
      path: `/disco/${slug}/reservations`,
    },
    {
      name: "Employees",
      icon: Users,
      path: `/disco/${slug}/employees`,
    },
    {
      name: "Cash Shifts",
      icon: Wallet,
      path: `/disco/${slug}/cash-shifts`,
    },
    {
      name: "Expenses",
      icon: Receipt,
      path: `/disco/${slug}/expenses`,
    },
    {
      name: "Reports",
      icon: BarChart3,
      path: `/disco/${slug}/reports`,
    },
    {
      name: "Activity Logs",
      icon: Activity,
      path: `/disco/${slug}/activity-logs`,
    },
    {
      name: "Settings",
      icon: Settings,
      path: `/disco/${slug}/settings`,
    },
  ];

  async function handleLogout() {
    try {
      await api.post("/accounts/logout/");
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      dispatch(logoutUser());
      navigate(`/disco/${slug}/login`, { replace: true });
      onClose();
    }
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`
          fixed left-0 top-0 z-50 h-screen w-72
          transform border-r border-slate-800
          bg-slate-950 text-white transition-transform duration-300
          lg:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
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
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-800 lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex h-[calc(100vh-80px)] flex-col overflow-hidden">
          <div className="border-b border-slate-800 p-4">
            <div className="rounded-3xl bg-slate-900 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-950">
                  <UserCircle size={24} />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-white">
                    {displayName}
                  </p>

                  <p className="truncate text-xs font-semibold capitalize text-slate-400">
                    {role.replace("_", " ")}
                  </p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-950/60 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Organisation
                </p>

                <p className="mt-1 truncate text-sm font-black text-white">
                  {organisationName}
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
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
          </div>

          <div className="border-t border-slate-800 p-4">
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-500/10 px-4 py-3 text-sm font-black text-red-300 transition hover:bg-red-500 hover:text-white"
            >
              <LogOut size={18} />
              Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}