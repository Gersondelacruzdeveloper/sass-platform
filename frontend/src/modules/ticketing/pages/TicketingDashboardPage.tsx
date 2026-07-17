// src/modules/ticketing/pages/TicketingDashboardPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
  CalendarClock,
  Car,
  MapPin,
  Plane,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Receipt,
  Ticket,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../api/ticketingApi";
import type {
  DashboardProductRanking,
  DashboardSellerRanking,
  TicketingDashboard,
} from "../types/ticketingTypes";

type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
};

function formatMoney(
  value: unknown,
  language: "en" | "es",
) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    },
  ).format(amount);
}

function formatNumber(
  value: unknown,
  language: "en" | "es",
) {
  const amount = Number(value || 0);

  return new Intl.NumberFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      maximumFractionDigits: 0,
    },
  ).format(amount);
}

function numberValue(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function readNumber(
  source: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const amount = numberValue(source[key]);

    if (amount !== 0) {
      return amount;
    }
  }

  return 0;
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


function productTypeLabel(
  value: string | null | undefined,
  t: (key: string, values?: Record<string, string | number | boolean | null | undefined>, fallback?: string) => string,
) {
  const normalized = String(value || "product").toLowerCase();

  return t(
    `dashboard.productTypes.${normalized}`,
    undefined,
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

function productTypeClasses(value?: string | null) {
  const normalized = String(value || "").toLowerCase();

  if (normalized === "transfer") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (normalized === "excursion") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (normalized === "ticket" || normalized === "nightlife") {
    return "bg-purple-50 text-purple-700 ring-purple-200";
  }

  if (normalized === "event") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function ProductTypeBadge({
  type,
}: {
  type?: string | null;
}) {
  const { t } = useTicketingAdminTranslation();

  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
        productTypeClasses(type),
      ].join(" ")}
    >
      {productTypeLabel(type, t)}
    </span>
  );
}

function TransferSnapshot({
  slug,
  products,
}: {
  slug?: string;
  products: DashboardProductRanking[];
}) {
  const { language, t } = useTicketingAdminTranslation();

  const transferProducts = products.filter(
    (product) => String(product.product_type || "").toLowerCase() === "transfer"
  );

  const transfersSold = transferProducts.reduce(
    (sum, product) => sum + Number(product.quantity_sold || 0),
    0
  );

  const transferRevenue = transferProducts.reduce(
    (sum, product) => sum + Number(product.revenue || 0),
    0
  );

  return (
    <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
            <Car className="h-6 w-6" />
          </div>

          <div>
            <p className="text-xs font-black uppercase tracking-wide text-sky-700">
              {t("dashboard.transfer.engine")}
            </p>
            <h2 className="mt-1 text-lg font-black text-slate-950">
              {t("dashboard.transfer.title")}
            </h2>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              {t("dashboard.transfer.description")}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:min-w-[320px]">
          <div className="rounded-2xl border border-sky-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              {t("dashboard.transfer.sold")}
            </p>
            <p className="mt-1 text-xl font-black text-slate-950">
              {formatNumber(transfersSold, language)}
            </p>
          </div>

          <div className="rounded-2xl border border-sky-100 bg-white p-4">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              {t("dashboard.transfer.revenue")}
            </p>
            <p className="mt-1 text-xl font-black text-emerald-600">
              {formatMoney(transferRevenue, language)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          to={`/ticketing/${slug}/transfers`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800"
        >
          <MapPin className="h-4 w-4" />
          {t("dashboard.transfer.manageRoutes")}
        </Link>

        <Link
          to={`/ticketing/${slug}/bookings`}
          className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
        >
          <Plane className="h-4 w-4" />
          {t("dashboard.transfer.viewBookings")}
        </Link>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
        <Ticket className="h-8 w-8" />
      </div>

      <h2 className="mt-4 text-xl font-black text-slate-950">
        {t("dashboard.empty.title")}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
        {t("dashboard.empty.description")}
      </p>
    </div>
  );
}

function ProductRankingTable({
  products,
}: {
  products: DashboardProductRanking[];
}) {
  const { language, t } = useTicketingAdminTranslation();

  if (!products.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            {t("dashboard.products.noSales")}
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
            <Trophy className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black text-slate-950">
              {t("dashboard.products.title")}
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              {t("dashboard.products.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">{t("dashboard.table.product")}</th>
              <th className="px-5 py-4">{t("dashboard.table.type")}</th>
              <th className="px-5 py-4 text-right">{t("dashboard.table.sold")}</th>
              <th className="px-5 py-4 text-right">{t("dashboard.table.revenue")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {products.map((product, index) => (
              <tr key={`${product.product_name}-${index}`} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">
                    {product.product_name || t("dashboard.products.unnamed")}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <ProductTypeBadge type={product.product_type} />
                </td>
                <td className="px-5 py-4 text-right font-black text-slate-900">
                  {formatNumber(product.quantity_sold, language)}
                </td>
                <td className="px-5 py-4 text-right font-black text-emerald-600">
                  {formatMoney(product.revenue, language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SellerRankingTable({
  sellers,
}: {
  sellers: DashboardSellerRanking[];
}) {
  const { language, t } = useTicketingAdminTranslation();

  if (!sellers.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            {t("dashboard.sellers.noSales")}
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
            <Users className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black text-slate-950">
              {t("dashboard.sellers.title")}
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              {t("dashboard.sellers.subtitle")}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">{t("dashboard.table.seller")}</th>
              <th className="px-5 py-4 text-right">{t("dashboard.table.bookings")}</th>
              <th className="px-5 py-4 text-right">{t("dashboard.table.sales")}</th>
              <th className="px-5 py-4 text-right">{t("dashboard.table.commission")}</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {sellers.map((seller) => (
              <tr key={seller.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">
                    {seller.full_name || t("dashboard.sellers.fallback")}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    /s/{seller.seller_slug}
                  </p>
                </td>
                <td className="px-5 py-4 text-right font-black text-slate-900">
                  {formatNumber(seller.bookings_count, language)}
                </td>
                <td className="px-5 py-4 text-right font-black text-emerald-600">
                  {formatMoney(seller.sales_total, language)}
                </td>
                <td className="px-5 py-4 text-right font-black text-amber-600">
                  {formatMoney(seller.commission_total, language)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function TicketingDashboardPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [dashboard, setDashboard] = useState<TicketingDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug;

  async function loadDashboard() {
    try {
      setLoading(true);
      setErrorMessage("");

      const data = await ticketingApi.getDashboard(slug);
      setDashboard(data);
    } catch (error) {
      console.error("Could not load ticketing dashboard:", error);
      setErrorMessage(t("dashboard.errors.load"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const summary = dashboard?.summary;

  const hasAnyData = useMemo(() => {
    if (!summary) return false;

    return (
      Number(summary.total_bookings || 0) > 0 ||
      Number(summary.total_sales || 0) > 0 ||
      Number(summary.pending_payments || 0) > 0 ||
      Number(summary.pending_approvals || 0) > 0
    );
  }, [summary]);

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-slate-950" />
          <p className="mt-4 text-sm font-black text-slate-700">
            {t("dashboard.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="max-w-lg rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <AlertCircle className="h-7 w-7" />
          </div>

          <h1 className="mt-4 text-xl font-black text-slate-950">
            {t("dashboard.errors.title")}
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
            {t("dashboard.actions.retry")}
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard || !summary) {
    return <EmptyState />;
  }

  const summaryRecord = summary as unknown as Record<string, unknown>;

  const sellerDueToCompany = readNumber(summaryRecord, [
    "seller_due_to_company",
    "seller_due_to_company_amount",
    "money_owed_to_company",
    "owed_to_company",
    "total_owed_to_company",
    "total_seller_due_to_company",
    "pending_settlement_amount",
  ]);

  const ownerNet = readNumber(summaryRecord, [
    "owner_net_amount",
    "owner_net",
    "total_owner_net_amount",
  ]);

  const ownerReceived = readNumber(summaryRecord, [
    "owner_received_amount",
    "owner_received",
    "total_owner_received_amount",
  ]);

  const ownerPending =
    readNumber(summaryRecord, [
      "owner_remaining_amount",
      "owner_pending",
      "owner_pending_amount",
      "total_owner_remaining_amount",
      "total_owner_pending_amount",
    ]) || Math.max(ownerNet - ownerReceived, 0);

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-600">
            PCD Experiences
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950">
            {t("dashboard.title")}
          </h1>

          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
            {t("dashboard.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            {t("dashboard.actions.refresh")}
          </button>

          <Link
            to={`/ticketing/${slug}/new-booking`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            {t("dashboard.actions.newBooking")}
          </Link>
        </div>
      </div>

      {!hasAnyData && <EmptyState />}

      <TransferSnapshot slug={slug} products={dashboard.top_products || []} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t("dashboard.stats.totalBookings")}
          value={formatNumber(summary.total_bookings, language)}
          subtitle={t("dashboard.stats.createdToday", { count: formatNumber(summary.today_bookings, language) })}
          icon={Receipt}
        />

        <StatCard
          title={t("dashboard.stats.totalSales")}
          value={formatMoney(summary.total_sales, language)}
          subtitle={t("dashboard.stats.revenueGenerated")}
          icon={BadgeDollarSign}
        />

        <StatCard
          title={t("dashboard.stats.pendingPayments")}
          value={formatNumber(summary.pending_payments, language)}
          subtitle={t("dashboard.stats.toCollect", { amount: formatMoney(summary.balance_due, language) })}
          icon={CreditCard}
        />

        <StatCard
          title={t("dashboard.stats.approvals")}
          value={formatNumber(summary.pending_approvals, language)}
          subtitle={t("dashboard.stats.pendingSupervisor")}
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          title={t("dashboard.stats.confirmed")}
          value={formatNumber(summary.confirmed_bookings, language)}
          subtitle={t("dashboard.stats.confirmedBookings")}
          icon={CheckCircle2}
        />

        <StatCard
          title={t("dashboard.stats.upcoming")}
          value={formatNumber(summary.upcoming_bookings, language)}
          subtitle={t("dashboard.stats.futureServices")}
          icon={CalendarClock}
        />

        <StatCard
          title={t("dashboard.stats.commissionGenerated")}
          value={formatMoney(summary.commission_generated, language)}
          subtitle={t("dashboard.stats.pendingAmount", { amount: formatMoney(summary.commission_pending, language) })}
          icon={BarChart3}
        />

        <StatCard
          title={t("dashboard.stats.owedToCompany")}
          value={formatMoney(sellerDueToCompany, language)}
          subtitle={t("dashboard.stats.collectedBySellers")}
          icon={Users}
        />

        <StatCard
          title={t("dashboard.stats.ownerPending")}
          value={formatMoney(ownerPending, language)}
          subtitle={t("dashboard.stats.notReceived")}
          icon={CreditCard}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ProductRankingTable products={dashboard.top_products || []} />
        <SellerRankingTable sellers={dashboard.top_sellers || []} />
      </div>
    </section>
  );
}
