// src/modules/ticketing/pages/TicketingSellerDashboardPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BadgeDollarSign,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Receipt,
  Ticket,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import type {
  Booking,
  ExperienceProduct,
  Seller,
  SellerPermissions,
} from "../types/ticketingTypes";

type SellerDashboardResponse = {
  seller: Seller;
  permissions?: Partial<SellerPermissions>;
  summary: {
    today_bookings?: number;
    week_bookings?: number;
    month_bookings?: number;
    total_bookings?: number;

    today_sales?: string | number;
    today_deposits?: string | number;
    money_collected?: string | number;
    money_owed_to_company?: string | number;
    outstanding_balance?: string | number;

    pending_payments?: number;
    confirmed_bookings?: number;
    tickets_generated?: number;

    commission_today?: string | number;
    commission_week?: string | number;
    commission_month?: string | number;
    commission_pending?: string | number;
    commission_paid?: string | number;
    commission_lifetime?: string | number;

    // Backward compatibility with older SellerDashboard response shape.
    my_bookings?: number;
    commission_generated?: string | number;
  };
  recent_bookings?: Booking[];
  available_products?: ExperienceProduct[];
};

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
};

function formatMoney(value: unknown) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatNumber(value: unknown) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount);
}

function getPermission(
  dashboard: SellerDashboardResponse | null,
  permission: keyof SellerPermissions
) {
  if (!dashboard) return false;

  if (typeof dashboard.permissions?.[permission] === "boolean") {
    return Boolean(dashboard.permissions[permission]);
  }

  if (typeof dashboard.seller?.permissions?.[permission] === "boolean") {
    return Boolean(dashboard.seller.permissions[permission]);
  }

  if (typeof dashboard.seller?.[permission] === "boolean") {
    return Boolean(dashboard.seller[permission]);
  }

  return false;
}

function StatCard({ title, value, subtitle, icon: Icon }: StatCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{title}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>

          {subtitle && (
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <Loader2 className="mx-auto h-10 w-10 animate-spin text-slate-950" />
        <p className="mt-4 text-sm font-black text-slate-700">
          Loading seller dashboard...
        </p>
      </div>
    </div>
  );
}

function EmptyState({ slug, canCreateBookings }: { slug?: string; canCreateBookings: boolean }) {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
        <Ticket className="h-8 w-8" />
      </div>

      <h2 className="mt-4 text-xl font-black text-slate-950">
        No seller activity yet
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
        Once you create bookings, collect payments, and sell products, your
        sales and commission summary will appear here.
      </p>

      {canCreateBookings && (
        <Link
          to={`/ticketing/${slug}/new-booking`}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
        >
          <Plus className="h-4 w-4" />
          Create first booking
        </Link>
      )}
    </div>
  );
}

function RecentBookings({
  bookings,
  slug,
}: {
  bookings: Booking[];
  slug?: string;
}) {
  if (!bookings.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Receipt className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            No recent bookings yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Receipt className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black text-slate-950">
              Recent bookings
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Your latest customer bookings.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {bookings.map((booking) => (
          <Link
            key={booking.id}
            to={`/ticketing/${slug}/bookings`}
            className="block p-5 transition hover:bg-slate-50"
          >
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-black text-slate-950">
                  {booking.customer_name || "Customer"}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {booking.booking_code} · {booking.primary_product_detail?.name || "Booking"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                  {booking.status}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">
                  {formatMoney(booking.total_amount)}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AvailableProducts({
  products,
  slug,
}: {
  products: ExperienceProduct[];
  slug?: string;
}) {
  if (!products.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            No products available to sell yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Package className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black text-slate-950">
              Products you can sell
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Only products allowed by your permissions are shown.
            </p>
          </div>
        </div>
      </div>

      <div className="divide-y divide-slate-100">
        {products.slice(0, 6).map((product) => (
          <Link
            key={product.id}
            to={`/ticketing/${slug}/new-booking?product=${product.id}`}
            className="block p-5 transition hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-black text-slate-950">{product.name}</p>
                <p className="mt-1 text-xs font-semibold text-slate-400">
                  {product.product_type} · {formatMoney(product.base_price)}
                </p>
              </div>

              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                Sell
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="border-t border-slate-100 p-4">
        <Link
          to={`/ticketing/${slug}/products`}
          className="text-sm font-black text-slate-950 hover:underline"
        >
          View all products
        </Link>
      </div>
    </div>
  );
}

export default function TicketingSellerDashboardPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [dashboard, setDashboard] = useState<SellerDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug;

  async function loadDashboard() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await ticketingApi.getSellerDashboard(slug);
      setDashboard(data as unknown as SellerDashboardResponse);
    } catch (error) {
      console.error("Could not load seller dashboard:", error);
      setErrorMessage(
        "Could not load the seller dashboard. Check that this user has an active seller profile and seller dashboard permission."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const summary = dashboard?.summary;
  const canCreateBookings = getPermission(dashboard, "can_create_bookings");

  const hasAnyData = useMemo(() => {
    if (!summary) return false;

    return (
      Number(summary.total_bookings || summary.my_bookings || 0) > 0 ||
      Number(summary.today_sales || 0) > 0 ||
      Number(summary.money_collected || 0) > 0 ||
      Number(summary.commission_lifetime || summary.commission_generated || 0) > 0
    );
  }, [summary]);

  if (loading) {
    return <LoadingState />;
  }

  if (errorMessage) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-lg rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </div>

          <h1 className="mt-4 text-xl font-black text-slate-950">
            Seller dashboard unavailable
          </h1>

          <p className="mt-2 text-sm font-semibold text-slate-500">
            {errorMessage}
          </p>

          <button
            type="button"
            onClick={loadDashboard}
            className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-slate-800"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard || !summary) {
    return <EmptyState slug={slug} canCreateBookings={canCreateBookings} />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-600">
            Seller Portal
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Welcome, {dashboard.seller?.full_name || "Seller"}
          </h1>

          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
            Your sales, bookings, collections, outstanding balances, and
            commission summary.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          {canCreateBookings && (
            <Link
              to={`/ticketing/${slug}/new-booking`}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              New booking
            </Link>
          )}
        </div>
      </div>

      {!hasAnyData && (
        <EmptyState slug={slug} canCreateBookings={canCreateBookings} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Sales today"
          value={formatMoney(summary.today_sales)}
          subtitle={`${formatNumber(summary.today_bookings)} bookings today`}
          icon={BadgeDollarSign}
        />

        <StatCard
          title="Money collected"
          value={formatMoney(summary.money_collected)}
          subtitle="Total collected by you"
          icon={Wallet}
        />

        <StatCard
          title="Outstanding balance"
          value={formatMoney(summary.outstanding_balance)}
          subtitle={`${formatNumber(summary.pending_payments)} pending payments`}
          icon={CreditCard}
        />

        <StatCard
          title="Due to company"
          value={formatMoney(summary.money_owed_to_company)}
          subtitle="Collected minus commission"
          icon={Receipt}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Commission today"
          value={formatMoney(summary.commission_today)}
          subtitle="Generated today"
          icon={BadgeDollarSign}
        />

        <StatCard
          title="Commission this week"
          value={formatMoney(summary.commission_week)}
          subtitle={`${formatNumber(summary.week_bookings)} bookings this week`}
          icon={CalendarClock}
        />

        <StatCard
          title="Commission this month"
          value={formatMoney(summary.commission_month)}
          subtitle={`${formatNumber(summary.month_bookings)} bookings this month`}
          icon={CheckCircle2}
        />

        <StatCard
          title="Pending commission"
          value={formatMoney(summary.commission_pending)}
          subtitle={`${formatMoney(summary.commission_paid)} already paid`}
          icon={Clock3}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RecentBookings bookings={dashboard.recent_bookings || []} slug={slug} />
        <AvailableProducts products={dashboard.available_products || []} slug={slug} />
      </div>
    </section>
  );
}
