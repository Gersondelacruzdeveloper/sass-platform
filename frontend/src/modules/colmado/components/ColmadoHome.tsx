import {
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardList,
  HandCoins,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";

import type {
  ColmadoSection,
  DashboardData,
  DashboardPeriod,
  Store,
} from "../types/colmado";

interface ColmadoHomeProps {
  store: Store;
  dashboard: DashboardData | null;
  dashboardPeriod: DashboardPeriod;
  cashRegisterOpen: boolean;
  loading?: boolean;
  onNavigate: (section: ColmadoSection) => void;
  onSelectDashboardPeriod: (period: DashboardPeriod) => void;
}

const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2,
});

const dayFormatter = new Intl.DateTimeFormat("es-DO", {
  day: "numeric",
  month: "short",
});

const formatMoney = (value: string | number) => money.format(Number(value || 0));

const formatDay = (value: string) =>
  dayFormatter.format(new Date(`${value}T00:00:00`));

const periodOptions: Array<{
  value: DashboardPeriod;
  label: string;
}> = [
  { value: "day", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
];

const periodNames: Record<DashboardPeriod, string> = {
  day: "hoy",
  week: "esta semana",
  month: "este mes",
};

const previousPeriodNames: Record<DashboardPeriod, string> = {
  day: "ayer",
  week: "la semana anterior",
  month: "el mes anterior",
};

export default function ColmadoHome({
  store,
  dashboard,
  dashboardPeriod,
  cashRegisterOpen,
  loading = false,
  onNavigate,
  onSelectDashboardPeriod,
}: ColmadoHomeProps) {
  if (loading && !dashboard) {
    return (
      <div aria-label="Cargando resumen" className="space-y-4">
        <div className="h-20 animate-pulse rounded-2xl bg-white" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-28 animate-pulse rounded-2xl bg-white"
            />
          ))}
        </div>
      </div>
    );
  }

  const summary = dashboard?.summary;
  const comparison = dashboard?.comparison;
  const change = Number(comparison?.change_percent ?? 0);
  const changeIsPositive = change >= 0;
  const periodName = periodNames[dashboardPeriod];
  const previousPeriodName = previousPeriodNames[dashboardPeriod];
  const trend = dashboard?.trend ?? [];
  const highestRevenue = Math.max(
    ...trend.map((item) => Number(item.revenue)),
    1,
  );

  const stats = [
    {
      label: `Vendido ${periodName}`,
      value: formatMoney(summary?.revenue ?? "0"),
      help: `${summary?.sale_count ?? 0} venta${summary?.sale_count === 1 ? "" : "s"}`,
      color: "text-emerald-700",
    },
    {
      label: "Ganancia neta",
      value: formatMoney(summary?.net_profit ?? "0"),
      help: summary?.is_profitable
        ? "Después de costos y gastos"
        : "Los costos superan los ingresos",
      color: summary?.is_profitable ? "text-emerald-700" : "text-red-600",
    },
    {
      label: "Costo de mercancía",
      value: formatMoney(summary?.cost_of_goods ?? "0"),
      help: "Costo de los productos vendidos",
      color: "text-slate-900",
    },
    {
      label: "Ganancia bruta",
      value: formatMoney(summary?.gross_profit ?? "0"),
      help: "Ventas menos mercancía",
      color: "text-sky-700",
    },
    {
      label: "Gastos operativos",
      value: formatMoney(summary?.operating_expenses ?? "0"),
      help: "Gastos registrados en el período",
      color: "text-amber-700",
    },
    {
      label: "Nómina pagada",
      value: formatMoney(summary?.payroll ?? "0"),
      help: "Pagos de empleados",
      color: "text-violet-700",
    },
  ];

  const quickActions = [
    {
      section: "vender",
      label: "Hacer una venta",
      help: "Escanear y cobrar",
      icon: ShoppingCart,
      style: "bg-emerald-700 text-white",
    },
    {
      section: "pedidos",
      label: "Ver pedidos",
      help: `${summary?.active_orders ?? 0} pendiente${summary?.active_orders === 1 ? "" : "s"}`,
      icon: ClipboardList,
      style: "bg-sky-700 text-white",
    },
    {
      section: "fiado",
      label: "Ver fiados",
      help: formatMoney(summary?.outstanding_credit ?? "0"),
      icon: HandCoins,
      style: "bg-amber-400 text-amber-950",
    },
    {
      section: "caja",
      label: cashRegisterOpen ? "Ver caja" : "Abrir caja",
      help: cashRegisterOpen ? "Caja abierta" : "Necesaria para el turno",
      icon: WalletCards,
      style: cashRegisterOpen
        ? "bg-slate-800 text-white"
        : "bg-red-600 text-white",
    },
  ] satisfies Array<{
    section: ColmadoSection;
    label: string;
    help: string;
    icon: typeof ShoppingCart;
    style: string;
  }>;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-emerald-800 to-emerald-700 p-5 text-white shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold text-emerald-100">
              Sucursal actual
            </p>
            <h1 className="mt-1 text-2xl font-black sm:text-3xl">
              {store.name}
            </h1>
            {store.address && (
              <p className="mt-1 text-sm text-emerald-100">{store.address}</p>
            )}
          </div>

          <div
            aria-label="Período del resumen"
            className="grid grid-cols-3 gap-1 rounded-xl bg-white/15 p-1"
            role="group"
          >
            {periodOptions.map((option) => {
              const selected = dashboardPeriod === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={selected}
                  disabled={loading}
                  className={`min-h-10 rounded-lg px-3 text-sm font-black transition disabled:cursor-wait disabled:opacity-70 ${
                    selected
                      ? "bg-white text-emerald-800 shadow-sm"
                      : "text-white hover:bg-white/10"
                  }`}
                  onClick={() => onSelectDashboardPeriod(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/20 pt-4">
          <div>
            <p className="text-sm font-bold text-emerald-100">
              Resultado {periodName}
            </p>
            <p className="mt-1 text-2xl font-black">
              {formatMoney(summary?.net_profit ?? "0")}
            </p>
            <p className="mt-1 text-sm text-emerald-100">
              {summary?.is_profitable
                ? "El colmado produjo ganancia."
                : "El período cerró con pérdida."}
            </p>
          </div>

          {comparison?.change_percent !== null &&
            comparison?.change_percent !== undefined && (
              <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
                {changeIsPositive ? (
                  <TrendingUp aria-hidden="true" size={19} />
                ) : (
                  <TrendingDown aria-hidden="true" size={19} />
                )}
                {Math.abs(change)}% frente a {previousPeriodName}
              </div>
            )}
        </div>
      </section>

      <section
        aria-label={`Resumen de ${periodName}`}
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        {stats.map((stat) => (
          <article key={stat.label} className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-500">{stat.label}</p>
            <p className={`mt-2 text-xl font-black sm:text-2xl ${stat.color}`}>
              {stat.value}
            </p>
            <p className="mt-1 text-xs text-slate-500">{stat.help}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black">
              <BarChart3 aria-hidden="true" className="text-emerald-700" size={22} />
              Ventas por día
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Así se movieron las ventas durante {periodName}.
            </p>
          </div>
          {dashboard && (
            <p className="text-sm font-bold text-slate-600">
              {formatDay(dashboard.period_start)} – {formatDay(dashboard.period_end)}
            </p>
          )}
        </div>

        {trend.length ? (
          <div
            aria-label={`Gráfica de ventas de ${periodName}`}
            className="mt-5 overflow-x-auto pb-2"
            role="img"
          >
            <div className="flex min-w-max items-end gap-2 border-b border-slate-200 px-1 pt-8">
              {trend.map((item) => {
                const revenue = Number(item.revenue);
                const height = Math.max((revenue / highestRevenue) * 160, 8);
                const profitable = Number(item.net_profit) >= 0;

                return (
                  <div
                    key={item.date}
                    className="flex w-12 flex-col items-center justify-end sm:w-14"
                    title={`${formatDay(item.date)}: ${formatMoney(item.revenue)}`}
                  >
                    <span className="mb-1 text-[10px] font-bold text-slate-500">
                      {revenue > 0 ? formatMoney(revenue) : ""}
                    </span>
                    <div
                      aria-label={`${formatDay(item.date)}: ${formatMoney(item.revenue)} en ventas, ${formatMoney(item.net_profit)} de ganancia neta`}
                      className={`w-7 rounded-t-md sm:w-8 ${
                        profitable ? "bg-emerald-600" : "bg-red-500"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                    <span className="mt-2 whitespace-nowrap text-[11px] font-bold text-slate-600">
                      {formatDay(item.date)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-600">
            Todavía no hay ventas registradas en este período.
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-xs font-bold text-slate-600">
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-emerald-600" />
            Día con ganancia
          </span>
          <span className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-red-500" />
            Día con pérdida
          </span>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-black">¿Qué quieres hacer?</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {quickActions.map(({ section, label, help, icon: Icon, style }) => (
            <button
              key={section}
              type="button"
              className={`flex min-h-24 items-center gap-3 rounded-2xl p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-emerald-200 ${style}`}
              onClick={() => onNavigate(section)}
            >
              <Icon aria-hidden="true" size={30} />
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-black">{label}</span>
                <span className="block text-sm opacity-80">{help}</span>
              </span>
              <ArrowRight aria-hidden="true" size={20} />
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <ClipboardList aria-hidden="true" className="text-sky-700" size={22} />
              Pedidos pendientes
            </h2>
            <button
              type="button"
              className="font-bold text-sky-700"
              onClick={() => onNavigate("pedidos")}
            >
              Ver todos
            </button>
          </div>
          {dashboard?.orders.length ? (
            <div className="space-y-2">
              {dashboard.orders.slice(0, 3).map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left hover:bg-sky-50"
                  onClick={() => onNavigate("pedidos")}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-black">
                      {order.customer_name}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {order.status_display}
                    </span>
                  </span>
                  <strong>{formatMoney(order.total)}</strong>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              No hay pedidos pendientes.
            </p>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-black">
              <Boxes aria-hidden="true" className="text-red-600" size={22} />
              Productos por comprar
            </h2>
            <button
              type="button"
              className="font-bold text-emerald-700"
              onClick={() => onNavigate("inventario")}
            >
              Ver inventario
            </button>
          </div>
          {dashboard?.low_stock.length ? (
            <div className="space-y-2">
              {dashboard.low_stock.slice(0, 3).map((item) => (
                <button
                  key={item.inventory_item_id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-xl bg-red-50 p-3 text-left hover:bg-red-100"
                  onClick={() => onNavigate("inventario")}
                >
                  <span className="min-w-0 flex-1 truncate font-black">
                    {item.product_name}
                  </span>
                  <span className="text-sm font-bold text-red-700">
                    Quedan {Number(item.quantity)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              El inventario está bien por ahora.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
