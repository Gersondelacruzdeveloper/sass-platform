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

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoDashboardPage() {
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
          title="Dashboard"
          subtitle="Loading your live disco overview..."
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
        title="Dashboard"
        subtitle="Live overview of sales, inventory, cash shifts, tables, reservations, and staff activity."
        icon={TrendingUp}
        actionLabel="Refresh"
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
          title="Sales Today"
          value={money(dashboardStats.salesToday)}
          icon={DollarSign}
          change="Today's total"
        />

        <KPIStatCard
          title="Sales This Month"
          value={money(dashboardStats.salesMonth)}
          icon={ShoppingCart}
          change="This month"
        />

        <KPIStatCard
          title="Net Profit"
          value={money(dashboardStats.netProfit)}
          icon={TrendingUp}
          change="Month to date"
        />

        <KPIStatCard
          title="Open Cash Shifts"
          value={String(dashboardStats.openCashShifts)}
          icon={Banknote}
          change="Active shifts"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Low Stock"
          value={dashboardStats.lowStock}
          icon={Package}
          helper="Products below minimum"
        />

        <DiscoStatCard
          title="Open Tables"
          value={dashboardStats.openTables}
          icon={Utensils}
          helper="Tables currently active"
        />

        <DiscoStatCard
          title="Reserved Tables"
          value={dashboardStats.reservedTables}
          icon={CalendarDays}
          helper="Upcoming reservations"
        />

        <DiscoStatCard
          title="Employees"
          value={dashboardStats.employees}
          icon={Users}
          helper="Active team members"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                Sales Performance
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Recent sales trend and revenue movement.
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
              title="No sales chart data"
              description="Sales analytics will appear here once POS transactions are recorded."
            />
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <Clock className="h-6 w-6" />
            </div>

            <div>
              <h2 className="text-lg font-black">Today’s Operations</h2>
              <p className="text-sm font-medium text-white/60">
                Fast executive snapshot
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                Pending Reservations
              </p>
              <p className="mt-2 text-3xl font-black">
                {dashboardStats.pendingReservations}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                Open Tables
              </p>
              <p className="mt-2 text-3xl font-black">
                {dashboardStats.openTables}
              </p>
            </div>

            <div className="rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-white/50">
                Low Stock Alerts
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
            Low Stock Products
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Products that need inventory attention.
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
                title="Stock looks good"
                description="No products are currently below minimum stock."
              />
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-black text-slate-950">
            Pending Reservations
          </h2>
          <p className="mt-1 text-sm font-medium text-slate-500">
            Reservations waiting for confirmation.
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
                title="No pending reservations"
                description="New reservations will appear here."
              />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}