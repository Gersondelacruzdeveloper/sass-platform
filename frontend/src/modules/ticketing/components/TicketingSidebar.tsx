// src/modules/ticketing/components/TicketingSidebar.tsx

import { Link, useLocation, useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  BarChart3,
  Building2,
  CalendarCheck2,
  CalendarClock,
  CalendarDays,
  Clock3,
  Globe2,
  Handshake,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Package,
  Plane,
  QrCode,
  Receipt,
  ScanLine,
  Search,
  Settings,
  Sparkles,
  Ticket,
  Users,
  WalletCards,
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

  organisationName?: string | null;
  organisationLogoUrl?: string | null;
  companyName?: string | null;
  companyLogoUrl?: string | null;
  portalLabel?: string;
};

type NavSection = "main" | "operations" | "configuration";

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  permissions: TicketingPermissionKey[];
  section: NavSection;
  ownerOnly?: boolean;
  sellerOnly?: boolean;
};

function buildPath(slug: string, path: string) {
  if (!slug) return "#";
  return `/ticketing/${slug}${path}`;
}

function getPermissionValue(
  seller: Seller | null | undefined,
  permission: TicketingPermissionKey,
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
  permissions: TicketingPermissionKey[],
) {
  if (!seller) return false;

  const role = String(seller.role || "").toLowerCase();

  if (["owner", "admin", "manager"].includes(role)) return true;

  return permissions.some((permission) =>
    getPermissionValue(seller, permission),
  );
}

export default function TicketingSidebar({
  mobileOpen,
  onClose,
  slug,
  currentSeller = null,
  currentSellerLoading = false,
  isOwnerOrAdmin = false,
  organisationName,
  organisationLogoUrl,
  companyName,
  companyLogoUrl,
  portalLabel,
}: TicketingSidebarProps) {
  const location = useLocation();
  const params = useParams();

  const routeSlug = params.organisationSlug || params.slug || "";
  const safeSlug = slug || routeSlug;

  const displayCompanyName =
    companyName?.trim() ||
    organisationName?.trim() ||
    "Ticketing Platform";

  const displayCompanyLogo =
    companyLogoUrl?.trim() ||
    organisationLogoUrl?.trim() ||
    null;

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      path: buildPath(safeSlug, "/dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
      section: "main",
      ownerOnly: true,
    },
    {
      label: "Seller Dashboard",
      path: buildPath(safeSlug, "/seller-dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
      section: "main",
      sellerOnly: true,
    },
    {
      label: "Bookings",
      path: buildPath(safeSlug, "/bookings"),
      icon: Receipt,
      permissions: ["can_view_own_sales", "can_create_bookings"],
      section: "main",
    },
    {
      label: "New Booking",
      path: buildPath(safeSlug, "/new-booking"),
      icon: Ticket,
      permissions: ["can_create_bookings"],
      section: "main",
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
      section: "main",
    },
    {
      label: "Pickup Times",
      path: buildPath(safeSlug, "/pickup-schedules"),
      icon: Clock3,
      permissions: ["can_manage_products", "can_override_pickup_time"],
      section: "main",
      ownerOnly: true,
    },
    {
      label: "Availability",
      path: buildPath(safeSlug, "/availability"),
      icon: CalendarDays,
      permissions: ["can_manage_products"],
      section: "main",
      ownerOnly: true,
    },
    {
      label: "Excursions",
      path: buildPath(safeSlug, "/excursions"),
      icon: Sparkles,
      permissions: ["can_manage_products", "can_sell_excursions"],
      section: "main",
    },
    {
      label: "Transfers",
      path: buildPath(safeSlug, "/transfers"),
      icon: Plane,
      permissions: ["can_manage_products", "can_sell_transfers"],
      section: "main",
    },
    {
      label: "Events",
      path: buildPath(safeSlug, "/events"),
      icon: CalendarClock,
      permissions: ["can_manage_products", "can_sell_events"],
      section: "main",
    },
    {
      label: "Sellers",
      path: buildPath(safeSlug, "/sellers"),
      icon: Users,
      permissions: ["can_manage_sellers"],
      section: "main",
      ownerOnly: true,
    },
    {
      label: "Commissions",
      path: buildPath(safeSlug, "/commissions"),
      icon: BadgeDollarSign,
      permissions: ["can_view_own_commissions", "can_view_reports"],
      section: "main",
    },
    {
      label: "Reports",
      path: buildPath(safeSlug, "/reports"),
      icon: BarChart3,
      permissions: ["can_view_reports"],
      section: "main",
      ownerOnly: true,
    },

    // Operations
    {
      label: "Operations Dashboard",
      path: buildPath(safeSlug, "/operations/dashboard"),
      icon: LayoutDashboard,
      permissions: ["can_view_reports"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Business Entities",
      path: buildPath(safeSlug, "/operations/business-entities"),
      icon: Building2,
      permissions: ["can_manage_settings"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Agreements",
      path: buildPath(safeSlug, "/operations/agreements"),
      icon: Handshake,
      permissions: ["can_manage_settings"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "QR Scanner",
      path: buildPath(safeSlug, "/operations/scanner"),
      icon: ScanLine,
      permissions: ["can_access_dashboard"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Admissions",
      path: buildPath(safeSlug, "/operations/admissions"),
      icon: CalendarCheck2,
      permissions: ["can_view_reports"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Scan History",
      path: buildPath(safeSlug, "/operations/scan-attempts"),
      icon: QrCode,
      permissions: ["can_view_reports"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Settlements",
      path: buildPath(safeSlug, "/operations/settlements"),
      icon: WalletCards,
      permissions: ["can_view_reports"],
      section: "operations",
      ownerOnly: true,
    },
    {
      label: "Ledger",
      path: buildPath(safeSlug, "/operations/ledger"),
      icon: ListChecks,
      permissions: ["can_view_reports"],
      section: "operations",
      ownerOnly: true,
    },

    // Configuration
    {
      label: "Branding",
      path: buildPath(safeSlug, "/branding"),
      icon: Globe2,
      permissions: ["can_manage_settings"],
      section: "configuration",
      ownerOnly: true,
    },
    {
      label: "Domain",
      path: buildPath(safeSlug, "/domain"),
      icon: Landmark,
      permissions: ["can_manage_settings"],
      section: "configuration",
      ownerOnly: true,
    },
    {
      label: "Integrations",
      path: buildPath(safeSlug, "/integrations"),
      icon: Settings,
      permissions: ["can_manage_integrations"],
      section: "configuration",
      ownerOnly: true,
    },
    {
      label: "SEO",
      path: buildPath(safeSlug, "/seo"),
      icon: Search,
      permissions: ["can_manage_settings"],
      section: "configuration",
      ownerOnly: true,
    },
    {
      label: "Settings",
      path: buildPath(safeSlug, "/settings"),
      icon: Settings,
      permissions: ["can_manage_settings"],
      section: "configuration",
      ownerOnly: true,
    },
  ];

  const sellerRole = String(currentSeller?.role || "").toLowerCase();
  const sellerIsAdminLike = ["owner", "admin", "manager"].includes(sellerRole);
  const sellerMode =
    Boolean(currentSeller) && !isOwnerOrAdmin && !sellerIsAdminLike;

  const visibleItems =
    isOwnerOrAdmin || sellerIsAdminLike
      ? navItems.filter((item) => !item.sellerOnly)
      : currentSeller
        ? navItems.filter((item) => {
            if (item.ownerOnly) return false;
            return hasAnyPermission(currentSeller, item.permissions);
          })
        : [];

  const sectionLabels: Record<NavSection, string> = {
    main: "Ticketing",
    operations: "Operations",
    configuration: "Configuration",
  };

  const groupedVisibleItems = (["main", "operations", "configuration"] as NavSection[])
    .map((section) => ({
      section,
      items: visibleItems.filter((item) => item.section === section),
    }))
    .filter((group) => group.items.length > 0);

  const sellerName =
    currentSeller?.full_name ||
    (currentSellerLoading ? "Loading access..." : "Owner / Admin");

  const sellerSubtitle =
    currentSeller?.role ||
    (currentSellerLoading ? "Checking permissions" : "Full module access");

  const homePath = sellerMode
    ? buildPath(safeSlug, "/seller-dashboard")
    : buildPath(safeSlug, "/dashboard");

  const resolvedPortalLabel =
    portalLabel ||
    (sellerMode ? "Seller Portal" : "Tours, Tickets & Transfers");

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex min-h-20 items-center justify-between border-b border-white/10 px-5 py-3">
        <Link
          to={homePath}
          className="flex min-w-0 items-center gap-3"
          onClick={onClose}
        >
          {displayCompanyLogo ? (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white shadow-lg">
              <img
                src={displayCompanyLogo}
                alt={`${displayCompanyName} logo`}
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20">
              <Ticket className="h-6 w-6" />
            </div>
          )}

          <div className="min-w-0">
            <p className="truncate text-sm font-black leading-tight text-white">
              {displayCompanyName}
            </p>
            <p className="mt-1 truncate text-xs font-semibold text-white/50">
              {resolvedPortalLabel}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Close navigation menu"
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
          groupedVisibleItems.map((group) => (
            <div key={group.section} className="space-y-1">
              <div className="px-4 pb-1 pt-4 text-[11px] font-black uppercase tracking-[0.18em] text-white/30 first:pt-0">
                {sectionLabels[group.section]}
              </div>

              {group.items.map((item) => {
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
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))
        )}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/5">
          <p className="text-xs font-black uppercase tracking-wide text-white/40">
            {sellerMode ? "Seller" : "Account"}
          </p>

          <p className="mt-1 truncate text-sm font-black text-white">
            {sellerName}
          </p>

          <p className="mt-1 truncate text-xs font-semibold capitalize text-white/50">
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
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          onClick={onClose}
          aria-hidden="true"
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
