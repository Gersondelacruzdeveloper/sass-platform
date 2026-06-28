// src/modules/ticketing/components/TicketingSidebar.tsx

import { Link, useLocation } from "react-router-dom";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  Globe2,
  Landmark,
  LogOut,
  MapPinned,
  Package,
  Plane,
  Receipt,
  Search,
  Settings,
  Sparkles,
  Ticket,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type {
  Seller,
  SellerPermissions,
} from "../types/ticketingTypes";

type TicketingPermissionKey = keyof SellerPermissions;

type TicketingSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
  slug: string;
  currentSeller: Seller | null;
};

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  permissions: TicketingPermissionKey[];
};

function buildPath(slug: string, path: string) {
  return `/ticketing/${slug}${path}`;
}

function getPermissionValue(
  seller: Seller | null,
  permission: TicketingPermissionKey
) {
  if (!seller) return false;
  if (seller.role === "owner") return true;

  if (typeof seller.permissions?.[permission] === "boolean") {
    return Boolean(seller.permissions[permission]);
  }

  if (typeof seller[permission] === "boolean") {
    return Boolean(seller[permission]);
  }

  return false;
}

function hasAnyPermission(
  seller: Seller | null,
  permissions: TicketingPermissionKey[]
) {
  if (!seller) return false;
  if (seller.role === "owner") return true;

  return permissions.some((permission) =>
    getPermissionValue(seller, permission)
  );
}

export default function TicketingSidebar({
  mobileOpen,
  onClose,
  slug,
  currentSeller,
}: TicketingSidebarProps) {
  const location = useLocation();

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      path: buildPath(slug, "/dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
    },
    {
      label: "Bookings",
      path: buildPath(slug, "/bookings"),
      icon: Receipt,
      permissions: ["can_view_own_sales", "can_create_bookings"],
    },
    {
      label: "New Booking",
      path: buildPath(slug, "/new-booking"),
      icon: Ticket,
      permissions: ["can_create_bookings"],
    },
    {
      label: "Products",
      path: buildPath(slug, "/products"),
      icon: Package,
      permissions: [
        "can_manage_products",
        "can_sell_excursions",
        "can_sell_transfers",
        "can_sell_events",
        "can_sell_custom_tours",
        "can_sell_cocobongo",
      ],
    },
    {
      label: "Excursions",
      path: buildPath(slug, "/excursions"),
      icon: Sparkles,
      permissions: ["can_manage_products", "can_sell_excursions"],
    },
    {
      label: "Transfers",
      path: buildPath(slug, "/transfers"),
      icon: Plane,
      permissions: ["can_manage_products", "can_sell_transfers"],
    },
    {
      label: "Events",
      path: buildPath(slug, "/events"),
      icon: CalendarClock,
      permissions: ["can_manage_products", "can_sell_events"],
    },
    {
      label: "Sellers",
      path: buildPath(slug, "/sellers"),
      icon: Users,
      permissions: ["can_manage_sellers"],
    },
    {
      label: "Commissions",
      path: buildPath(slug, "/commissions"),
      icon: BadgeDollarSign,
      permissions: ["can_view_own_commissions", "can_view_reports"],
    },
    {
      label: "Reports",
      path: buildPath(slug, "/reports"),
      icon: BarChart3,
      permissions: ["can_view_reports"],
    },
    {
      label: "Pickup Schedules",
      path: buildPath(slug, "/pickup-schedules"),
      icon: MapPinned,
      permissions: ["can_manage_products", "can_override_pickup_time"],
    },
    {
      label: "Branding",
      path: buildPath(slug, "/branding"),
      icon: Globe2,
      permissions: ["can_manage_settings"],
    },
    {
      label: "Domain",
      path: buildPath(slug, "/domain"),
      icon: Landmark,
      permissions: ["can_manage_settings"],
    },
    {
      label: "Integrations",
      path: buildPath(slug, "/integrations"),
      icon: Settings,
      permissions: ["can_manage_integrations"],
    },
    {
      label: "SEO",
      path: buildPath(slug, "/seo"),
      icon: Search,
      permissions: ["can_manage_settings"],
    },
    {
      label: "Settings",
      path: buildPath(slug, "/settings"),
      icon: Settings,
      permissions: ["can_manage_settings"],
    },
  ];

  const visibleItems = navItems.filter((item) =>
    hasAnyPermission(currentSeller, item.permissions)
  );

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <Link to={buildPath(slug, "/dashboard")} className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
            <Ticket className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-black leading-tight">
              PCD Experiences
            </p>
            <p className="text-xs font-semibold text-white/50">
              Tickets & Transfers
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active =
            location.pathname === item.path ||
            location.pathname.startsWith(`${item.path}/`);

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                active
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-3xl bg-white/5 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-white/40">
            Seller
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {currentSeller?.full_name || "Loading..."}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/50">
            {currentSeller?.role || "seller"}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-200 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
