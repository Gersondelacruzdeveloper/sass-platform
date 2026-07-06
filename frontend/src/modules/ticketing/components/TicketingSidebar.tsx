// src/modules/ticketing/components/TicketingSidebar.tsx

import { Link, useLocation, useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Clock3,
  Globe2,
  Landmark,
  Loader2,
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

import type { Seller, SellerPermissions } from "../types/ticketingTypes";

type TicketingPermissionKey = keyof SellerPermissions;

type TicketingSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;

  slug?: string;
  currentSeller?: Seller | null;
  currentSellerLoading?: boolean;
  isOwnerOrAdmin?: boolean;
};

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  permissions: TicketingPermissionKey[];
  ownerOnly?: boolean;
  sellerOnly?: boolean;
};

function buildPath(slug: string, path: string) {
  if (!slug) return "#";
  return `/ticketing/${slug}${path}`;
}

function getPermissionValue(
  seller: Seller | null | undefined,
  permission: TicketingPermissionKey
) {
  if (!seller) return false;

  const role = String(seller.role || "").toLowerCase();

  if (["owner", "admin", "manager"].includes(role)) return true;

  if (typeof seller.permissions?.[permission] === "boolean") {
    return Boolean(seller.permissions[permission]);
  }

  if (typeof seller[permission] === "boolean") {
    return Boolean(seller[permission]);
  }

  return false;
}

function hasAnyPermission(
  seller: Seller | null | undefined,
  permissions: TicketingPermissionKey[]
) {
  if (!seller) return false;

  const role = String(seller.role || "").toLowerCase();

  if (["owner", "admin", "manager"].includes(role)) return true;

  return permissions.some((permission) =>
    getPermissionValue(seller, permission)
  );
}

export default function TicketingSidebar({
  mobileOpen,
  onClose,
  slug,
  currentSeller = null,
  currentSellerLoading = false,
  isOwnerOrAdmin = false,
}: TicketingSidebarProps) {
  const location = useLocation();
  const params = useParams();

  const routeSlug = params.organisationSlug || params.slug || "";
  const safeSlug = slug || routeSlug;

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      path: buildPath(safeSlug, "/dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
      ownerOnly: true,
    },
    {
      label: "Seller Dashboard",
      path: buildPath(safeSlug, "/seller-dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
      sellerOnly: true,
    },
    {
      label: "Bookings",
      path: buildPath(safeSlug, "/bookings"),
      icon: Receipt,
      permissions: ["can_view_own_sales", "can_create_bookings"],
    },
    {
      label: "New Booking",
      path: buildPath(safeSlug, "/new-booking"),
      icon: Ticket,
      permissions: ["can_create_bookings"],
    },
    {
      label: "Products",
      path: buildPath(safeSlug, "/products"),
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
      label: "Pickup Times",
      path: buildPath(safeSlug, "/pickup-schedules"),
      icon: Clock3,
      permissions: ["can_manage_products", "can_override_pickup_time"],
      ownerOnly: true,
    },
    {
      label: "Availability",
      path: buildPath(safeSlug, "/availability"),
      icon: CalendarDays,
      permissions: ["can_manage_products"],
      ownerOnly: true,
    },
    {
      label: "Excursions",
      path: buildPath(safeSlug, "/excursions"),
      icon: Sparkles,
      permissions: ["can_manage_products", "can_sell_excursions"],
    },
    {
      label: "Transfers",
      path: buildPath(safeSlug, "/transfers"),
      icon: Plane,
      permissions: ["can_manage_products", "can_sell_transfers"],
    },
    {
      label: "Events",
      path: buildPath(safeSlug, "/events"),
      icon: CalendarClock,
      permissions: ["can_manage_products", "can_sell_events"],
    },
    {
      label: "Sellers",
      path: buildPath(safeSlug, "/sellers"),
      icon: Users,
      permissions: ["can_manage_sellers"],
      ownerOnly: true,
    },
    {
      label: "Commissions",
      path: buildPath(safeSlug, "/commissions"),
      icon: BadgeDollarSign,
      permissions: ["can_view_own_commissions", "can_view_reports"],
    },
    {
      label: "Reports",
      path: buildPath(safeSlug, "/reports"),
      icon: BarChart3,
      permissions: ["can_view_reports"],
      ownerOnly: true,
    },
    {
      label: "Branding",
      path: buildPath(safeSlug, "/branding"),
      icon: Globe2,
      permissions: ["can_manage_settings"],
      ownerOnly: true,
    },
    {
      label: "Domain",
      path: buildPath(safeSlug, "/domain"),
      icon: Landmark,
      permissions: ["can_manage_settings"],
      ownerOnly: true,
    },
    {
      label: "Integrations",
      path: buildPath(safeSlug, "/integrations"),
      icon: Settings,
      permissions: ["can_manage_integrations"],
      ownerOnly: true,
    },
    {
      label: "SEO",
      path: buildPath(safeSlug, "/seo"),
      icon: Search,
      permissions: ["can_manage_settings"],
      ownerOnly: true,
    },
    {
      label: "Settings",
      path: buildPath(safeSlug, "/settings"),
      icon: Settings,
      permissions: ["can_manage_settings"],
      ownerOnly: true,
    },
  ];

  const sellerRole = String(currentSeller?.role || "").toLowerCase();
  const sellerIsAdminLike = ["owner", "admin", "manager"].includes(sellerRole);
  const sellerMode = Boolean(currentSeller) && !isOwnerOrAdmin && !sellerIsAdminLike;

  const visibleItems = isOwnerOrAdmin || sellerIsAdminLike
    ? navItems.filter((item) => !item.sellerOnly)
    : currentSeller
      ? navItems.filter((item) => {
          if (item.ownerOnly) return false;
          return hasAnyPermission(currentSeller, item.permissions);
        })
      : [];

  const sellerName =
    currentSeller?.full_name ||
    (currentSellerLoading ? "Loading access..." : "Owner / Admin");

  const sellerSubtitle =
    currentSeller?.role ||
    (currentSellerLoading ? "Checking permissions" : "Full module access");

  const homePath = sellerMode
    ? buildPath(safeSlug, "/seller-dashboard")
    : buildPath(safeSlug, "/dashboard");

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <Link
          to={homePath}
          className="flex items-center gap-3"
          onClick={onClose}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
            <Ticket className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-black leading-tight">PCD Experiences</p>
            <p className="text-xs font-semibold text-white/50">
              {sellerMode ? "Seller Portal" : "Tickets & Transfers"}
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
        {currentSellerLoading && !isOwnerOrAdmin ? (
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-white/60">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading permissions...</span>
          </div>
        ) : (
          visibleItems.map((item) => {
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
          })
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-3xl bg-white/5 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-white/40">
            {sellerMode ? "Seller" : "Account"}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {sellerName}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/50">
            {sellerSubtitle}
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
