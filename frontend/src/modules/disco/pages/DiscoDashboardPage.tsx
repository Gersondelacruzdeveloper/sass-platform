import { useMemo } from "react";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  Clock,
  DollarSign,
  Package,
  RefreshCcw,
  ShoppingCart,
  TrendingUp,
  Users,
  Utensils,
  Wine,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import KPIStatCard from "../components/KPIStatCard";
import SalesChart from "../components/SalesChart";
import ProductCard from "../components/ProductCard";
import ReservationCard from "../components/ReservationCard";

import useDiscoDashboard from "../hooks/useDiscoDashboard";
import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

function money(value?: string | number | null, language: DiscoLanguage = "en") {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoDashboardPage() {
  const { language, t } = useDiscoTranslation();

  const {
    dashboard,
    stats,
    lowStock,
    pendingReservations,
    loading,
    error,
    refreshDashboard,
  } = useDiscoDashboard();

  const dashboardStats = useMemo(() => {
    return {
      salesToday: stats.sales_today,
      salesMonth: stats.sales_month,
      netProfit: stats.net_profit_month,
      lowStock: stats.low_stock_products,
      openTables: stats.open_tables,
      reservedTables: stats.reserved_tables,
      pendingReservations: stats.pending_reservations,
      openCashShifts: stats.open_cash_shifts,
      employees: stats.active_employees,
    };
  }, [stats]);

  if (loading) {
    return (
      <div className="space-y-5 pb-24">
        <DiscoPageHeader
          title={t("dashboard.title")}
          subtitle={t("dashboard.loadingSubtitle")}
          icon={TrendingUp}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </section>

        <div className="h-80 animate-pulse rounded-3xl bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        icon={TrendingUp}
        actionLabel={t("dashboard.refresh")}
        onAction={refreshDashboard}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard
          title={t("dashboard.salesToday")}
          value={money(dashboardStats.salesToday, language)}
          icon={DollarSign}
          change={t("dashboard.salesTodayChange")}
        />

        <KPIStatCard
          title={t("dashboard.salesThisMonth")}
          value={money(dashboardStats.salesMonth, language)}
          icon={ShoppingCart}
          change={t("dashboard.salesThisMonthChange")}
        />

        <KPIStatCard
          title={t("dashboard.netProfit")}
          value={money(dashboardStats.netProfit, language)}
          icon={TrendingUp}
          change={t("dashboard.netProfitChange")}
        />

        <KPIStatCard
          title={t("dashboard.openCashShifts")}
          value={String(dashboardStats.openCashShifts)}
          icon={Banknote}
          change={t("dashboard.openCashShiftsChange")}
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("dashboard.lowStock")}
          value={dashboardStats.lowStock}
          icon={Package}
          helper={t("dashboard.lowStockHelper")}
        />

        <DiscoStatCard
          title={t("dashboard.openTables")}
          value={dashboardStats.openTables}
          icon={Utensils}
          helper={t("dashboard.openTablesHelper")}
        />

        <DiscoStatCard
          title={t("dashboard.reservedTables")}
          value={dashboardStats.reservedTables}
          icon={CalendarDays}
          helper={t("dashboard.reservedTablesHelper")}
        />

        <DiscoStatCard
          title={t("dashboard.employees")}
          value={dashboardStats.employees}
          icon={Users}
          helper={t("dashboard.employeesHelper")}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                {t("dashboard.salesPerformance")}
              </h2>

              <p className="text-sm font-medium text-slate-500">
                {t("dashboard.salesPerformanceDescription")}
              </p>
            </div>

            <RefreshCcw
              onClick={refreshDashboard}
              className="h-5 w-5 cursor-pointer text-slate-400 transition hover:text-slate-950"
            />
          </div>

          {(dashboard as any)?.sales_chart?.length ? (
            <SalesChart data={(dashboard as any).sales_chart} />
          ) : (
            <DiscoEmptyState
              icon={Wine}
              title={t("dashboard.noSalesChartData")}
              description={t("dashboard.noSalesChartDataDescription")}
            />
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Clock className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-lg font-black">
                {t("dashboard.todaysOperations")}
              </h2>

              <p className="text-sm font-medium text-white/60">
                {t("dashboard.fastExecutiveSnapshot")}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                {t("dashboard.pendingReservations")}
              </p>

              <p className="mt-2 text-3xl font-black">
                {dashboardStats.pendingReservations}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                {t("dashboard.openTables")}
              </p>

              <p className="mt-2 text-3xl font-black">
                {dashboardStats.openTables}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                {t("dashboard.lowStockAlerts")}
              </p>

              <p className="mt-2 text-3xl font-black">
                {dashboardStats.lowStock}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">
            {t("dashboard.lowStockProducts")}
          </h2>

          <p className="mt-1 text-sm font-medium text-slate-500">
            {t("dashboard.lowStockProductsDescription")}
          </p>

          <div className="mt-4 space-y-3">
            {lowStock.length ? (
              lowStock.slice(0, 4).map((product) => (
                <ProductCard
                  key={product.id}
                  product={{
                    ...product,
                    sale_price: 0,
                    cost_price: 0,
                    is_active: true,
                  }}
                />
              ))
            ) : (
              <DiscoEmptyState
                icon={Package}
                title={t("dashboard.stockLooksGood")}
                description={t("dashboard.stockLooksGoodDescription")}
              />
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">
            {t("dashboard.pendingReservations")}
          </h2>

          <p className="mt-1 text-sm font-medium text-slate-500">
            {t("dashboard.pendingReservationsDescription")}
          </p>

          <div className="mt-4 space-y-3">
            {pendingReservations.length ? (
              pendingReservations.slice(0, 4).map((reservation) => (
                <ReservationCard
                  key={reservation.id}
                  reservation={{
                    ...reservation,
                    status: reservation.status as
                      | "pending"
                      | "confirmed"
                      | "cancelled"
                      | "completed"
                      | "no_show",
                  }}
                />
              ))
            ) : (
              <DiscoEmptyState
                icon={CalendarDays}
                title={t("dashboard.noPendingReservations")}
                description={t("dashboard.noPendingReservationsDescription")}
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}