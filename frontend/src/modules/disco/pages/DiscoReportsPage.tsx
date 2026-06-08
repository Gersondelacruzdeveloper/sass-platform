import { useMemo } from "react";
import {
  AlertCircle,
  Banknote,
  BarChart3,
  CalendarDays,
  DollarSign,
  Package,
  RefreshCcw,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Users,
  Utensils,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import KPIStatCard from "../components/KPIStatCard";
import SalesChart from "../components/SalesChart";

import useDiscoDashboard from "../hooks/useDiscoDashboard";
import useDiscoProducts from "../hooks/useDiscoProducts";
import useDiscoReservations from "../hooks/useDiscoReservations";
import useDiscoTables from "../hooks/useDiscoTables";

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoReportsPage() {
  const {
    dashboard,
    stats,
    loading: dashboardLoading,
    error: dashboardError,
    refreshDashboard,
  } = useDiscoDashboard();

  const {
    products,
    loading: productsLoading,
    error: productsError,
    refreshProducts,
  } = useDiscoProducts();

  const {
    reservations,
    loading: reservationsLoading,
    error: reservationsError,
    refreshReservations,
  } = useDiscoReservations();

  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refreshTables,
  } = useDiscoTables();

  const loading =
    dashboardLoading || productsLoading || reservationsLoading || tablesLoading;

  const error =
    dashboardError || productsError || reservationsError || tablesError;

  function refreshAll() {
    refreshDashboard();
    refreshProducts();
    refreshReservations();
    refreshTables();
  }

  const report = useMemo(() => {
    const activeProducts = products.filter((product: any) => product.is_active);

    const lowStockProducts = activeProducts.filter(
      (product: any) =>
        product.is_low_stock ||
        Number(product.stock || 0) <= Number(product.minimum_stock || 0)
    );

    const inventoryCost = activeProducts.reduce(
      (sum: number, product: any) =>
        sum + Number(product.cost_price || 0) * Number(product.stock || 0),
      0
    );

    const inventoryRetail = activeProducts.reduce(
      (sum: number, product: any) =>
        sum + Number(product.sale_price || 0) * Number(product.stock || 0),
      0
    );

    const pendingReservations = reservations.filter(
      (reservation: any) => reservation.status === "pending"
    ).length;

    const confirmedReservations = reservations.filter(
      (reservation: any) => reservation.status === "confirmed"
    ).length;

    const openTables = tables.filter((table: any) =>
      ["open", "occupied", "available"].includes(table.status)
    ).length;

    const reservedTables = tables.filter(
      (table: any) => table.status === "reserved"
    ).length;

    const vipTables = tables.filter((table: any) => table.is_vip).length;

    return {
      salesToday: stats.sales_today ?? 0,
      salesMonth: stats.sales_month ?? 0,
      netProfit: stats.net_profit_month ?? 0,
      openCashShifts: stats.open_cash_shifts ?? 0,
      employees: stats.active_employees ?? 0,
      activeProducts: activeProducts.length,
      lowStockProducts: lowStockProducts.length,
      inventoryCost,
      inventoryRetail,
      reservations: reservations.length,
      pendingReservations,
      confirmedReservations,
      tables: tables.length,
      openTables,
      reservedTables,
      vipTables,
    };
  }, [stats, products, reservations, tables]);

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Reports"
        subtitle="Executive overview of sales, profit, stock, tables, reservations, cash shifts, and operations."
        icon={BarChart3}
        actionLabel="Refresh"
        onAction={refreshAll}
      />

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
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
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KPIStatCard
              title="Sales Today"
              value={money(report.salesToday)}
              icon={DollarSign}
              helper="Daily revenue"
            />

            <KPIStatCard
              title="Sales This Month"
              value={money(report.salesMonth)}
              icon={ShoppingCart}
              helper="Monthly revenue"
            />

            <KPIStatCard
              title="Net Profit"
              value={money(report.netProfit)}
              icon={TrendingUp}
              helper="Estimated profit"
            />

            <KPIStatCard
              title="Open Cash Shifts"
              value={report.openCashShifts}
              icon={Banknote}
              helper="Active shifts"
            />
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <DiscoStatCard
              title="Inventory Cost"
              value={money(report.inventoryCost)}
              icon={Package}
              helper="Total stock cost"
            />

            <DiscoStatCard
              title="Retail Value"
              value={money(report.inventoryRetail)}
              icon={TrendingUp}
              helper="Potential sales value"
            />

            <DiscoStatCard
              title="Low Stock"
              value={report.lowStockProducts}
              icon={TrendingDown}
              helper="Products to restock"
            />

            <DiscoStatCard
              title="Employees"
              value={report.employees}
              icon={Users}
              helper="Active team members"
            />
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black text-slate-950">
                    Sales Analytics
                  </h2>
                  <p className="text-sm font-medium text-slate-500">
                    Visual performance based on recent sales activity.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={refreshAll}
                  className="rounded-2xl border border-slate-200 p-3 text-slate-600 transition hover:bg-slate-50"
                >
                  <RefreshCcw className="h-4 w-4" />
                </button>
              </div>

              {(dashboard as any)?.sales_chart?.length ? (
                <SalesChart data={(dashboard as any).sales_chart} />
              ) : (
                <DiscoEmptyState
                  icon={BarChart3}
                  title="No chart data"
                  description="Sales chart data will appear after POS transactions are recorded."
                />
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <h2 className="text-lg font-black">Executive Snapshot</h2>
              <p className="mt-1 text-sm font-medium text-white/60">
                Fast operational report for management.
              </p>

              <div className="mt-5 space-y-3">
                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-white/50">
                    Active Products
                  </p>
                  <p className="mt-2 text-3xl font-black">
                    {report.activeProducts}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-white/50">
                    Reservations
                  </p>
                  <p className="mt-2 text-3xl font-black">
                    {report.reservations}
                  </p>
                </div>

                <div className="rounded-2xl bg-white/10 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-white/50">
                    Tables
                  </p>
                  <p className="mt-2 text-3xl font-black">{report.tables}</p>
                </div>
              </div>
            </div>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <CalendarDays className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-black text-slate-950">
                  Reservations
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Pending
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.pendingReservations}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Confirmed
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.confirmedReservations}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Utensils className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-black text-slate-950">Tables</h2>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Open/Available
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.openTables}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Reserved
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.reservedTables}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">VIP</span>
                  <span className="text-xl font-black text-slate-950">
                    {report.vipTables}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-slate-500" />
                <h2 className="text-lg font-black text-slate-950">
                  Inventory Health
                </h2>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Products
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.activeProducts}
                  </span>
                </div>

                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-4">
                  <span className="text-sm font-bold text-slate-600">
                    Low Stock
                  </span>
                  <span className="text-xl font-black text-slate-950">
                    {report.lowStockProducts}
                  </span>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}