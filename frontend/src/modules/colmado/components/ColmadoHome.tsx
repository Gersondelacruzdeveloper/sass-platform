import {
  ArrowRight,
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
  Store,
} from "../types/colmado";

interface ColmadoHomeProps {
  store: Store;
  dashboard: DashboardData | null;
  cashRegisterOpen: boolean;
  loading?: boolean;
  onNavigate: (section: ColmadoSection) => void;
}

const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2,
});

const formatMoney = (value: string | number) => money.format(Number(value || 0));

export default function ColmadoHome({
  store,
  dashboard,
  cashRegisterOpen,
  loading = false,
  onNavigate,
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

  const stats = [
    {
      label: "Vendido hoy",
      value: formatMoney(summary?.revenue ?? "0"),
      help: `${summary?.sale_count ?? 0} venta${summary?.sale_count === 1 ? "" : "s"}`,
      color: "text-emerald-700",
    },
    {
      label: "Ganancia de hoy",
      value: formatMoney(summary?.net_profit ?? "0"),
      help: summary?.is_profitable ? "Vas ganando" : "Revisa los gastos",
      color: summary?.is_profitable ? "text-emerald-700" : "text-red-600",
    },
    {
      label: "Fiado pendiente",
      value: formatMoney(summary?.outstanding_credit ?? "0"),
      help: "Dinero por cobrar",
      color: "text-amber-700",
    },
    {
      label: "Por comprar",
      value: String(summary?.low_stock_count ?? 0),
      help: "Productos con poca existencia",
      color: summary?.low_stock_count ? "text-red-600" : "text-emerald-700",
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
      help: "Cobrar o consultar",
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
        <p className="text-sm font-bold text-emerald-100">Sucursal actual</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black sm:text-3xl">{store.name}</h1>
            {store.address && (
              <p className="mt-1 text-sm text-emerald-100">{store.address}</p>
            )}
          </div>
          {comparison?.change_percent !== null && comparison?.change_percent !== undefined && (
            <div className="flex items-center gap-2 rounded-xl bg-white/15 px-3 py-2 text-sm font-bold">
              {changeIsPositive ? (
                <TrendingUp aria-hidden="true" size={19} />
              ) : (
                <TrendingDown aria-hidden="true" size={19} />
              )}
              {Math.abs(change)}% frente a ayer
            </div>
          )}
        </div>
      </section>

      <section aria-label="Resumen de hoy" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
                    <span className="block truncate font-black">{order.customer_name}</span>
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
