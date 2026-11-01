import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { getPublicCustomerOrder } from "../api/publicStorefrontClient";
import type {
  PublicCustomerOrder,
  PublicOrderStatus,
} from "../api/publicStorefrontClient";


const ORDER_STEPS: Array<{
  status: PublicOrderStatus;
  title: string;
  description: string;
}> = [
  {
    status: "new",
    title: "Pedido recibido",
    description: "El colmado recibió tu pedido.",
  },
  {
    status: "preparing",
    title: "Preparando",
    description: "Estamos preparando tus productos.",
  },
  {
    status: "ready",
    title: "Listo",
    description: "Tu pedido está empacado y listo para salir.",
  },
  {
    status: "on_the_way",
    title: "En camino",
    description: "Tu pedido salió para la dirección indicada.",
  },
  {
    status: "delivered",
    title: "Entregado",
    description: "El pedido fue entregado.",
  },
];


const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});


const dateTime = new Intl.DateTimeFormat("es-DO", {
  dateStyle: "medium",
  timeStyle: "short",
});


function formatMoney(value: string): string {
  const number = Number(value);
  return money.format(Number.isFinite(number) ? number : 0);
}


function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}


function apiErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "No pudimos consultar este pedido.";
  }

  const data = (
    error as {
      response?: {
        data?: unknown;
      };
    }
  ).response?.data;

  if (typeof data === "string" && data.trim()) {
    return data;
  }

  if (data && typeof data === "object") {
    const detail = (data as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail.trim()) {
      return detail;
    }
  }

  return "No encontramos este pedido. Comprueba el enlace e intenta nuevamente.";
}


export default function PublicOrderTrackingPage() {
  const {
    slug = "",
    orderNumber = "",
  } = useParams<{
    slug: string;
    orderNumber: string;
  }>();
  const phoneStorageKey = `colmado:order-phone:${slug}:${orderNumber}`;
  const storedPhone = window.localStorage.getItem(phoneStorageKey) || "";
  const [order, setOrder] = useState<PublicCustomerOrder | null>(null);
  const [customerPhone, setCustomerPhone] = useState(storedPhone);
  const [verifiedPhone, setVerifiedPhone] = useState(storedPhone);
  const [loading, setLoading] = useState(Boolean(storedPhone));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadOrder = useCallback(
    async (phone: string, silent = false) => {
      const normalizedPhone = phone.trim();
      if (!normalizedPhone) {
        setLoading(false);
        return;
      }

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const result = await getPublicCustomerOrder(
          slug,
          orderNumber,
          normalizedPhone,
        );
        setOrder(result);
      } catch (loadError) {
        if (!silent) {
          setOrder(null);
          setError(apiErrorMessage(loadError));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderNumber, slug],
  );

  useEffect(() => {
    if (verifiedPhone) {
      void loadOrder(verifiedPhone);
    } else {
      setLoading(false);
    }
  }, [loadOrder, verifiedPhone]);

  useEffect(() => {
    if (!order || order.status === "delivered" || order.status === "cancelled") {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void loadOrder(verifiedPhone, true);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [loadOrder, order, verifiedPhone]);

  function submitPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPhone = customerPhone.trim();

    if (!normalizedPhone) {
      setError("Escribe el teléfono utilizado para hacer el pedido.");
      return;
    }

    window.localStorage.setItem(phoneStorageKey, normalizedPhone);
    setVerifiedPhone(normalizedPhone);
  }

  const currentStepIndex = useMemo(() => {
    return ORDER_STEPS.findIndex((step) => step.status === order?.status);
  }, [order?.status]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <p className="font-black text-slate-700" role="status">
          Consultando tu pedido...
        </p>
      </main>
    );
  }

  if (!order) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">📦</p>
          <h1 className="mt-4 text-2xl font-black text-slate-950">
            Consulta tu pedido
          </h1>
          <p className="mt-2 text-slate-600">
            Escribe el teléfono utilizado al hacer el pedido.
          </p>
          <form className="mt-6 space-y-4 text-left" onSubmit={submitPhone}>
            <label className="block text-sm font-bold text-slate-700">
              Teléfono del pedido
              <input
                autoComplete="tel"
                autoFocus
                className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-4 font-normal outline-none focus:border-emerald-600"
                inputMode="tel"
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Ejemplo: 809-555-1234"
                value={customerPhone}
              />
            </label>
            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">
                {error}
              </p>
            )}
            <button
              className="min-h-12 w-full rounded-2xl bg-emerald-700 px-5 font-black text-white"
              type="submit"
            >
              Ver mi pedido
            </button>
          </form>
          <Link
            className="mt-3 flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 px-5 font-black text-slate-800"
            to={`/pedir/${encodeURIComponent(slug)}`}
          >
            Volver al colmado
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-3xl bg-emerald-800 p-6 text-white shadow-sm sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-black text-emerald-200">
                {order.store_name}
              </p>
              <h1 className="mt-1 text-3xl font-black">Sigue tu pedido</h1>
              <p className="mt-3 break-all text-sm text-emerald-50">
                Pedido {order.order_number}
              </p>
            </div>
            <button
              className="min-h-11 rounded-xl bg-white/10 px-4 font-black text-white disabled:opacity-60"
              disabled={refreshing}
              onClick={() => void loadOrder(verifiedPhone, true)}
              type="button"
            >
              {refreshing ? "Actualizando..." : "Actualizar estado"}
            </button>
          </div>
        </header>

        {error && (
          <p className="mt-4 rounded-2xl bg-amber-50 p-4 font-bold text-amber-900" role="alert">
            {error}
          </p>
        )}

        {order.status === "cancelled" ? (
          <section className="mt-5 rounded-3xl border border-red-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-2xl" aria-hidden="true">
              ×
            </div>
            <h2 className="mt-4 text-2xl font-black text-red-800">
              Pedido cancelado
            </h2>
            <p className="mt-2 text-slate-600">
              Este pedido fue cancelado. Si necesitas ayuda, comunícate directamente con {order.store_name}.
            </p>
          </section>
        ) : (
          <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8" aria-labelledby="order-progress-title">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-slate-500">Estado actual</p>
                <h2 className="text-2xl font-black text-emerald-700" id="order-progress-title">
                  {order.status_display}
                </h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
                Actualizado {formatDate(order.updated_at)}
              </span>
            </div>

            <ol className="mt-7 space-y-0">
              {ORDER_STEPS.map((step, index) => {
                const completed = index < currentStepIndex;
                const current = index === currentStepIndex;
                const active = completed || current;

                return (
                  <li
                    aria-current={current ? "step" : undefined}
                    className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-3 pb-7 last:pb-0"
                    key={step.status}
                  >
                    {index < ORDER_STEPS.length - 1 && (
                      <span
                        aria-hidden="true"
                        className={`absolute left-[19px] top-10 h-[calc(100%-40px)] w-0.5 ${
                          completed ? "bg-emerald-600" : "bg-slate-200"
                        }`}
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={`z-10 flex h-10 w-10 items-center justify-center rounded-full font-black ${
                        active
                          ? "bg-emerald-700 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}
                    >
                      {completed ? "✓" : index + 1}
                    </span>
                    <div className="pt-1">
                      <p className={`font-black ${active ? "text-slate-950" : "text-slate-400"}`}>
                        {step.title}
                      </p>
                      <p className={`text-sm ${active ? "text-slate-600" : "text-slate-400"}`}>
                        {step.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8" aria-labelledby="order-summary-title">
          <h2 className="text-xl font-black" id="order-summary-title">
            Resumen del pedido
          </h2>
          <div className="mt-5 space-y-4">
            {order.items.map((item) => (
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0" key={item.id}>
                <div>
                  <p className="font-black">{item.product_name}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {Number(item.quantity)} × {formatMoney(item.unit_price)}
                  </p>
                </div>
                <p className="shrink-0 font-black">{formatMoney(item.line_total)}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-2 border-t border-slate-200 pt-5">
            <div className="flex justify-between"><span>Subtotal</span><strong>{formatMoney(order.subtotal)}</strong></div>
            <div className="flex justify-between"><span>Entrega</span><strong>{formatMoney(order.delivery_fee)}</strong></div>
            <div className="flex justify-between pt-2 text-xl"><span className="font-black">Total</span><strong>{formatMoney(order.total)}</strong></div>
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-6 shadow-sm sm:p-8" aria-labelledby="delivery-title">
          <h2 className="text-xl font-black" id="delivery-title">Entrega</h2>
          <dl className="mt-4 space-y-4">
            <div>
              <dt className="text-sm font-bold text-slate-500">Cliente</dt>
              <dd className="font-black">{order.customer_name}</dd>
            </div>
            <div>
              <dt className="text-sm font-bold text-slate-500">Teléfono</dt>
              <dd className="font-black">{order.customer_phone}</dd>
            </div>
            <div>
              <dt className="text-sm font-bold text-slate-500">Dirección</dt>
              <dd className="font-black">{order.delivery_address}</dd>
            </div>
            {order.delivery_notes && (
              <div>
                <dt className="text-sm font-bold text-slate-500">Nota</dt>
                <dd>{order.delivery_notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <Link
          className="mt-5 flex min-h-12 w-full items-center justify-center rounded-2xl border border-emerald-700 bg-white px-5 text-center font-black text-emerald-800"
          to={`/pedir/${encodeURIComponent(slug)}`}
        >
          Volver a {order.store_name}
        </Link>
      </div>
    </main>
  );
}
