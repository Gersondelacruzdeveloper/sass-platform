// src/modules/ticketing/pages/TicketingDashboardPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BadgeDollarSign,
  BarChart3,
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
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-amber-50 text-amber-600">
        <Ticket className="h-8 w-8" />
      </div>

      <h2 className="mt-4 text-xl font-black text-slate-950">
        Todavía no hay data suficiente
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
        Cuando empieces a crear productos, vendedores y reservas, aquí verás
        ventas, comisiones, pagos pendientes, rankings y actividad del módulo.
      </p>
    </div>
  );
}

function ProductRankingTable({
  products,
}: {
  products: DashboardProductRanking[];
}) {
  if (!products.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            No hay productos vendidos todavía.
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
              Productos más vendidos
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Ranking por cantidad vendida e ingresos.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Producto</th>
              <th className="px-5 py-4">Tipo</th>
              <th className="px-5 py-4 text-right">Vendidos</th>
              <th className="px-5 py-4 text-right">Ingresos</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {products.map((product, index) => (
              <tr key={`${product.product_name}-${index}`} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">
                    {product.product_name || "Producto sin nombre"}
                  </p>
                </td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                    {product.product_type || "product"}
                  </span>
                </td>
                <td className="px-5 py-4 text-right font-black text-slate-900">
                  {formatNumber(product.quantity_sold)}
                </td>
                <td className="px-5 py-4 text-right font-black text-emerald-600">
                  {formatMoney(product.revenue)}
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
  if (!sellers.length) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <Users className="h-5 w-5 text-slate-400" />
          <p className="text-sm font-bold text-slate-500">
            No hay ventas por vendedores todavía.
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
              Ranking de vendedores
            </h2>
            <p className="text-xs font-semibold text-slate-500">
              Ventas, reservas y comisiones generadas.
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-4">Vendedor</th>
              <th className="px-5 py-4 text-right">Reservas</th>
              <th className="px-5 py-4 text-right">Ventas</th>
              <th className="px-5 py-4 text-right">Comisión</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {sellers.map((seller) => (
              <tr key={seller.id} className="hover:bg-slate-50">
                <td className="px-5 py-4">
                  <p className="font-black text-slate-950">
                    {seller.full_name || "Vendedor"}
                  </p>
                  <p className="text-xs font-semibold text-slate-400">
                    /s/{seller.seller_slug}
                  </p>
                </td>
                <td className="px-5 py-4 text-right font-black text-slate-900">
                  {formatNumber(seller.bookings_count)}
                </td>
                <td className="px-5 py-4 text-right font-black text-emerald-600">
                  {formatMoney(seller.sales_total)}
                </td>
                <td className="px-5 py-4 text-right font-black text-amber-600">
                  {formatMoney(seller.commission_total)}
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
      setErrorMessage(
        "No se pudo cargar el dashboard. Revisa que el backend esté corriendo y que el usuario tenga permisos."
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
            Cargando dashboard...
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
            Error cargando el dashboard
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
            Intentar de nuevo
          </button>
        </div>
      </div>
    );
  }

  if (!dashboard || !summary) {
    return <EmptyState />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-amber-600">
            PCD Experiences
          </p>

          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Dashboard
          </h1>

          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">
            Resumen de reservas, ventas, pagos pendientes, comisiones y
            rendimiento de vendedores.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={loadDashboard}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refrescar
          </button>

          <Link
            to={`/ticketing/${slug}/new-booking`}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-slate-800"
          >
            <Plus className="h-4 w-4" />
            Nueva reserva
          </Link>
        </div>
      </div>

      {!hasAnyData && <EmptyState />}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Reservas totales"
          value={formatNumber(summary.total_bookings)}
          subtitle={`${formatNumber(summary.today_bookings)} creadas hoy`}
          icon={Receipt}
        />

        <StatCard
          title="Ventas totales"
          value={formatMoney(summary.total_sales)}
          subtitle="Ingresos generados"
          icon={BadgeDollarSign}
        />

        <StatCard
          title="Pagos pendientes"
          value={formatNumber(summary.pending_payments)}
          subtitle={`${formatMoney(summary.balance_due)} por cobrar`}
          icon={CreditCard}
        />

        <StatCard
          title="Aprobaciones"
          value={formatNumber(summary.pending_approvals)}
          subtitle="Pendientes de supervisor"
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Confirmadas"
          value={formatNumber(summary.confirmed_bookings)}
          subtitle="Reservas confirmadas"
          icon={CheckCircle2}
        />

        <StatCard
          title="Próximas"
          value={formatNumber(summary.upcoming_bookings)}
          subtitle="Servicios futuros"
          icon={CalendarClock}
        />

        <StatCard
          title="Comisión generada"
          value={formatMoney(summary.commission_generated)}
          subtitle={`${formatMoney(summary.commission_pending)} pendiente`}
          icon={BarChart3}
        />

        <StatCard
          title="Debe a compañía"
          value={formatMoney(summary.seller_due_to_company)}
          subtitle="Cobrado por vendedores"
          icon={Users}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ProductRankingTable products={dashboard.top_products || []} />
        <SellerRankingTable sellers={dashboard.top_sellers || []} />
      </div>
    </section>
  );
}
