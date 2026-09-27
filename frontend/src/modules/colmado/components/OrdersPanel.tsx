import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Clock3,
  ExternalLink,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Phone,
  RefreshCw,
  Search,
  ShoppingBag,
  Truck,
  XCircle,
} from "lucide-react";

import {
  changeCustomerOrderStatus,
  getApiErrorMessage,
  getCustomerOrders,
  type CustomerOrder,
  type CustomerOrderStatus,
} from "../api/colmadoClient";
import type { Store } from "../types/colmado";

interface OrdersPanelProps {
  organisationSlug: string;
  store: Store;
  onOrdersChanged?: () => void | Promise<void>;
}

type StatusFilter = "active" | CustomerOrderStatus;

const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

const dateTime = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "medium",
  timeStyle: "short",
});

const statusStyles: Record<CustomerOrderStatus, string> = {
  new: "bg-red-100 text-red-800",
  preparing: "bg-amber-100 text-amber-900",
  ready: "bg-blue-100 text-blue-800",
  on_the_way: "bg-violet-100 text-violet-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
};

const nextStep: Partial<
  Record<CustomerOrderStatus, { status: CustomerOrderStatus; label: string }>
> = {
  new: { status: "preparing", label: "Empezar a preparar" },
  preparing: { status: "ready", label: "Marcar como listo" },
  ready: { status: "on_the_way", label: "Enviar pedido" },
  on_the_way: { status: "delivered", label: "Marcar entregado" },
};

export default function OrdersPanel({
  organisationSlug,
  store,
  onOrdersChanged,
}: OrdersPanelProps) {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [selected, setSelected] = useState<CustomerOrder | null>(null);

  const loadOrders = useCallback(
    async (quiet = false) => {
      quiet ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setOrders(
          await getCustomerOrders(organisationSlug, {
            store: store.id,
            search: search.trim() || undefined,
            status: filter === "active" ? undefined : filter,
          }),
        );
      } catch (caught) {
        setError(getApiErrorMessage(caught));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter, organisationSlug, search, store.id],
  );

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOrders(), 250);
    return () => window.clearTimeout(timeout);
  }, [loadOrders]);

  const visibleOrders = useMemo(() => {
    if (filter !== "active") return orders;
    return orders.filter(
      (order) => order.status !== "delivered" && order.status !== "cancelled",
    );
  }, [filter, orders]);

  const newCount = orders.filter((order) => order.status === "new").length;

  async function orderChanged(order: CustomerOrder) {
    setSelected(order);
    await loadOrders(true);
    await onOrdersChanged?.();
  }

  if (selected) {
    return (
      <OrderDetail
        organisationSlug={organisationSlug}
        order={selected}
        onBack={() => setSelected(null)}
        onChanged={orderChanged}
      />
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="orders-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">{store.name}</p>
          <h1 id="orders-title" className="text-2xl font-black text-slate-950">
            Pedidos
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Prepara y despacha cada pedido paso a paso.
          </p>
        </div>
        <button
          type="button"
          aria-label="Actualizar pedidos"
          disabled={refreshing}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-slate-300 bg-white text-slate-700 disabled:opacity-50"
          onClick={() => void loadOrders(true)}
        >
          <RefreshCw className={refreshing ? "animate-spin" : ""} aria-hidden="true" />
        </button>
      </div>

      {newCount > 0 && (
        <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
          <p className="font-black text-red-800">
            {newCount} {newCount === 1 ? "pedido nuevo necesita" : "pedidos nuevos necesitan"} atención
          </p>
        </div>
      )}

      <label className="relative block">
        <span className="sr-only">Buscar pedido</span>
        <Search
          aria-hidden="true"
          className="absolute left-3 top-3.5 text-slate-400"
          size={19}
        />
        <input
          className="min-h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
          placeholder="Cliente, teléfono o dirección"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>

      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar pedidos">
        {(
          [
            ["active", "Activos"],
            ["new", "Nuevos"],
            ["preparing", "Preparando"],
            ["ready", "Listos"],
            ["on_the_way", "En camino"],
            ["delivered", "Entregados"],
            ["cancelled", "Cancelados"],
          ] as Array<[StatusFilter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-black ${
              filter === value
                ? "bg-slate-950 text-white"
                : "border border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 font-bold text-slate-600">
          <LoaderCircle className="animate-spin" aria-hidden="true" /> Cargando pedidos...
        </div>
      ) : visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <PackageCheck className="mx-auto text-emerald-600" aria-hidden="true" size={46} />
          <p className="mt-3 font-black text-slate-900">No hay pedidos aquí</p>
          <p className="mt-1 text-sm text-slate-500">
            Los pedidos nuevos aparecerán automáticamente en esta lista.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((order) => (
            <button
              key={order.id}
              type="button"
              className="w-full rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm hover:border-emerald-300"
              onClick={() => setSelected(order)}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700">
                  <ShoppingBag aria-hidden="true" size={22} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-black text-slate-950">{order.customer_name}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-black ${statusStyles[order.status]}`}>
                      {order.status_display}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-sm text-slate-500">
                    {order.delivery_address}
                  </span>
                  <span className="mt-2 flex items-center gap-1 text-xs font-bold text-slate-500">
                    <Clock3 aria-hidden="true" size={14} /> {dateTime.format(new Date(order.created_at))}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-lg font-black text-slate-950">
                    {money.format(Number(order.total))}
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {order.items.length} {order.items.length === 1 ? "producto" : "productos"}
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

interface OrderDetailProps {
  organisationSlug: string;
  order: CustomerOrder;
  onBack: () => void;
  onChanged: (order: CustomerOrder) => void | Promise<void>;
}

function OrderDetail({
  organisationSlug,
  order,
  onBack,
  onChanged,
}: OrderDetailProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = nextStep[order.status];
  const closed = order.status === "delivered" || order.status === "cancelled";

  async function changeStatus(status: CustomerOrderStatus) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onChanged(
        await changeCustomerOrderStatus(organisationSlug, order.id, status),
      );
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  function cancelOrder() {
    if (
      window.confirm(
        `¿Seguro que quieres cancelar el pedido de ${order.customer_name}?`,
      )
    ) {
      void changeStatus("cancelled");
    }
  }

  return (
    <section className="space-y-5" aria-labelledby="order-detail-title">
      <button
        type="button"
        className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 font-black text-emerald-800"
        onClick={onBack}
      >
        <ChevronLeft aria-hidden="true" /> Volver a pedidos
      </button>

      <div className="rounded-2xl bg-slate-950 p-5 text-white">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-slate-300">
            Pedido #{order.order_number.slice(0, 8).toUpperCase()}
          </p>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${statusStyles[order.status]}`}>
            {order.status_display}
          </span>
        </div>
        <h1 id="order-detail-title" className="mt-2 text-2xl font-black">
          {order.customer_name}
        </h1>
        <p className="mt-1 text-sm text-slate-300">
          {dateTime.format(new Date(order.created_at))}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={`tel:${order.customer_phone}`}
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 bg-white px-4 font-black text-emerald-800"
        >
          <Phone aria-hidden="true" /> Llamar al cliente
        </a>
        <a
          href={order.maps_url}
          target="_blank"
          rel="noreferrer"
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 font-black text-white"
        >
          <MapPin aria-hidden="true" /> Abrir dirección <ExternalLink aria-hidden="true" size={17} />
        </a>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="font-black text-slate-950">Entrega</h2>
        <p className="mt-2 font-bold text-slate-800">{order.delivery_address}</p>
        <p className="mt-1 text-sm text-slate-500">Tel. {order.customer_phone}</p>
        {order.delivery_notes && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
            Nota: {order.delivery_notes}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h2 className="border-b border-slate-200 p-4 font-black text-slate-950">
          Productos
        </h2>
        <div className="divide-y divide-slate-100">
          {order.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-4">
              <span className="grid h-10 min-w-10 place-items-center rounded-lg bg-slate-100 font-black text-slate-900">
                {item.quantity}
              </span>
              <span className="min-w-0 flex-1 font-bold text-slate-900">
                {item.product_name}
              </span>
              <span className="font-black text-slate-900">
                {money.format(Number(item.line_total))}
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-2 border-t border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between">
            <span>Productos</span>
            <span className="font-bold">{money.format(Number(order.subtotal))}</span>
          </div>
          <div className="flex justify-between">
            <span>Delivery</span>
            <span className="font-bold">{money.format(Number(order.delivery_fee))}</span>
          </div>
          <div className="flex justify-between text-lg font-black text-slate-950">
            <span>Total</span>
            <span>{money.format(Number(order.total))}</span>
          </div>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">
          {error}
        </p>
      )}

      {!closed && (
        <div className="sticky bottom-20 space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:bottom-4">
          {step && (
            <button
              type="button"
              disabled={saving}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 text-lg font-black text-white disabled:opacity-50"
              onClick={() => void changeStatus(step.status)}
            >
              {step.status === "on_the_way" ? (
                <Truck aria-hidden="true" />
              ) : (
                <CheckCircle2 aria-hidden="true" />
              )}
              {saving ? "Guardando..." : step.label}
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-black text-red-700 disabled:opacity-50"
            onClick={cancelOrder}
          >
            <XCircle aria-hidden="true" size={19} /> Cancelar pedido
          </button>
        </div>
      )}
    </section>
  );
}
