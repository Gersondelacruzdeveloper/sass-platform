// src/modules/ticketing/components/TicketingSellerSidebar.tsx

import { Link, useLocation, useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  BarChart3,
  BookOpen,
  LogOut,
  Package,
  Receipt,
  Ticket,
  UserCircle,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { Seller, SellerPermissions } from "../types/ticketingTypes";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type TicketingPermissionKey = keyof SellerPermissions;

type TicketingSellerSidebarProps = {
  mobileOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  slug?: string;
  currentSeller?: Seller | null;
  currentSellerLoading?: boolean;
};

type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  permissions?: TicketingPermissionKey[];
  alwaysShow?: boolean;
};

function buildPath(slug: string, path: string) {
  if (!slug) return "#";
  return `/ticketing/${slug}/seller${path}`;
}

function getPermissionValue(
  seller: Seller | null | undefined,
  permission: TicketingPermissionKey
) {
  if (!seller) return false;

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
  permissions?: TicketingPermissionKey[]
) {
  if (!permissions || permissions.length === 0) return true;
  if (!seller) return false;

  return permissions.some((permission) =>
    getPermissionValue(seller, permission)
  );
}

export default function TicketingSellerSidebar({
  mobileOpen,
  onClose,
  onLogout,
  slug,
  currentSeller = null,
  currentSellerLoading = false,
}: TicketingSellerSidebarProps) {
  const { t } = useTicketingAdminTranslation();
  const location = useLocation();
  const params = useParams();

  const routeSlug = params.organisationSlug || params.slug || "";
  const safeSlug = slug || routeSlug;

  const navItems: NavItem[] = [
    {
      label: t("sellerSidebar.navigation.dashboard"),
      path: buildPath(safeSlug, "/dashboard"),
      icon: BarChart3,
      permissions: ["can_access_dashboard"],
    },
    {
      label: t("sellerSidebar.navigation.products"),
      path: buildPath(safeSlug, "/products"),
      icon: Package,
      permissions: [
        "can_sell_excursions",
        "can_sell_transfers",
        "can_sell_events",
        "can_sell_custom_tours",
        "can_sell_cocobongo",
      ],
    },
    {
      label: t("sellerSidebar.navigation.newBooking"),
      path: buildPath(safeSlug, "/new-booking"),
      icon: Ticket,
      permissions: ["can_create_bookings"],
    },
    {
      label: t("sellerSidebar.navigation.bookings"),
      path: buildPath(safeSlug, "/bookings"),
      icon: Receipt,
      permissions: ["can_view_own_sales", "can_create_bookings"],
    },
    {
      label: t("sellerSidebar.navigation.customers"),
      path: buildPath(safeSlug, "/customers"),
      icon: Users,
      permissions: ["can_view_own_sales", "can_create_bookings"],
    },
    {
      label: t("sellerSidebar.navigation.commissions"),
      path: buildPath(safeSlug, "/commissions"),
      icon: BadgeDollarSign,
      permissions: ["can_view_own_commissions"],
    },
    {
      label: t("sellerSidebar.navigation.profile"),
      path: buildPath(safeSlug, "/profile"),
      icon: UserCircle,
      alwaysShow: true,
    },
  ];

  const visibleItems = currentSeller
    ? navItems.filter(
        (item) =>
          item.alwaysShow ||
          hasAnyPermission(currentSeller, item.permissions)
      )
    : [];

  const sellerName =
    currentSeller?.full_name ||
    (currentSellerLoading
      ? t("sellerSidebar.seller.loading")
      : t("sellerSidebar.seller.defaultName"));

  const sellerSubtitle =
    currentSeller?.role ||
    (currentSellerLoading
      ? t("sellerSidebar.seller.checkingAccess")
      : t("sellerSidebar.seller.portal"));

  const homePath = buildPath(safeSlug, "/dashboard");

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-950 text-white">
      <div className="flex h-20 items-center justify-between border-b border-white/10 px-5">
        <Link to={homePath} className="flex items-center gap-3" onClick={onClose}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400 text-slate-950">
            <BookOpen className="h-6 w-6" />
          </div>

          <div>
            <p className="text-sm font-black leading-tight">
              {t("sellerSidebar.header.title")}
            </p>
            <p className="text-xs font-semibold text-white/50">
              {t("sellerSidebar.header.subtitle")}
            </p>
          </div>
        </Link>

        <button
          type="button"
          onClick={onClose}
          aria-label={t("sellerSidebar.actions.close")}
          className="rounded-xl p-2 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {currentSellerLoading ? (
          <div className="rounded-2xl px-4 py-3 text-sm font-bold text-white/60">
            {t("sellerSidebar.loadingPermissions")}
          </div>
        ) : visibleItems.length > 0 ? (
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
        ) : (
          <div className="rounded-2xl px-4 py-3 text-sm font-bold leading-6 text-white/60">
            {t("sellerSidebar.emptyPermissions")}
          </div>
        )}
      </nav>

      <div className="space-y-3 border-t border-white/10 p-4">
        <div className="rounded-3xl bg-white/5 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-white/40">
            {t("sellerSidebar.seller.label")}
          </p>
          <p className="mt-1 truncate text-sm font-black text-white">
            {sellerName}
          </p>
          <p className="mt-1 truncate text-xs font-semibold text-white/50">
            {sellerSubtitle}
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
        >
          <LogOut className="h-4 w-4" />
          {t("sellerSidebar.actions.logout")}
        </button>
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
