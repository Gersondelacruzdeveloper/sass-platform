import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import {
  createOrderIdempotencyKey,
  createPublicCustomerOrder,
  getPublicStorefront,
  getPublicStorefrontCatalog,
} from "../api/publicStorefrontClient";
import type {
  PublicCatalogProduct,
  PublicCustomerOrder,
  PublicStorefront,
} from "../api/publicStorefrontClient";


interface CartLine {
  product: PublicCatalogProduct;
  quantity: number;
}


interface CheckoutForm {
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  deliveryNotes: string;
  latitude: string | null;
  longitude: string | null;
}


const EMPTY_CHECKOUT: CheckoutForm = {
  customerName: "",
  customerPhone: "",
  deliveryAddress: "",
  deliveryNotes: "",
  latitude: null,
  longitude: null,
};


const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});


function formatMoney(value: string | number): string {
  const numericValue = Number(value);
  return money.format(Number.isFinite(numericValue) ? numericValue : 0);
}


function apiErrorMessage(error: unknown): string {
  const fallback = "No pudimos completar el pedido. Intenta nuevamente.";

  if (!error || typeof error !== "object") {
    return fallback;
  }

  const responseData = (
    error as {
      response?: {
        data?: unknown;
      };
    }
  ).response?.data;

  if (typeof responseData === "string" && responseData.trim()) {
    return responseData;
  }

  if (!responseData || typeof responseData !== "object") {
    return fallback;
  }

  const data = responseData as Record<string, unknown>;
  const detail = data.detail;
  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  for (const value of Object.values(data)) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }

  return fallback;
}


function ProductImage({ product }: { product: PublicCatalogProduct }) {
  if (!product.image_url) {
    return (
      <div
        aria-label={`Sin foto para ${product.product_display_name}`}
        className="flex aspect-square items-center justify-center rounded-2xl bg-slate-100 px-3 text-center text-xs font-black text-slate-500"
        role="img"
      >
        Sin foto
      </div>
    );
  }

  return (
    <img
      alt={product.product_display_name}
      className="aspect-square w-full rounded-2xl bg-white object-contain p-2"
      loading="lazy"
      src={product.image_url}
    />
  );
}


export default function PublicStorefrontPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [storefront, setStorefront] = useState<PublicStorefront | null>(null);
  const [products, setProducts] = useState<PublicCatalogProduct[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todos");
  const [checkout, setCheckout] = useState<CheckoutForm>(EMPTY_CHECKOUT);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [successOrder, setSuccessOrder] = useState<PublicCustomerOrder | null>(
    null,
  );
  const [idempotencyKey, setIdempotencyKey] = useState(
    createOrderIdempotencyKey,
  );

  useEffect(() => {
    let active = true;

    async function loadStorefront() {
      setLoading(true);
      setError("");

      try {
        const [storefrontResult, catalogResult] = await Promise.all([
          getPublicStorefront(slug),
          getPublicStorefrontCatalog(slug),
        ]);

        if (!active) {
          return;
        }

        setStorefront(storefrontResult);
        setProducts(catalogResult);
      } catch (loadError) {
        if (active) {
          setError(
            apiErrorMessage(loadError) ||
              "Este colmado no está disponible para pedidos.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void loadStorefront();

    return () => {
      active = false;
    };
  }, [slug]);

  const categories = useMemo(() => {
    const values = new Set(
      products
        .map((product) => product.category.trim())
        .filter(Boolean),
    );

    return ["Todos", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");

    return products.filter((product) => {
      const matchesCategory =
        category === "Todos" || product.category === category;
      const searchable = [
        product.product_display_name,
        product.product_name,
        product.barcode || "",
        product.category,
      ]
        .join(" ")
        .toLocaleLowerCase("es");

      return (
        matchesCategory &&
        (!normalizedSearch || searchable.includes(normalizedSearch))
      );
    });
  }, [category, products, search]);

  const cartLines = useMemo<CartLine[]>(() => {
    return products
      .filter((product) => (cart[product.id] || 0) > 0)
      .map((product) => ({
        product,
        quantity: cart[product.id],
      }));
  }, [cart, products]);

  const subtotal = useMemo(() => {
    return cartLines.reduce(
      (total, line) =>
        total + Number(line.product.sale_price) * line.quantity,
      0,
    );
  }, [cartLines]);

  const deliveryFee = Number(storefront?.delivery_fee || 0);
  const minimumOrder = Number(storefront?.minimum_order || 0);
  const total = subtotal + deliveryFee;
  const missingMinimum = Math.max(minimumOrder - subtotal, 0);
  const itemCount = cartLines.reduce(
    (totalItems, line) => totalItems + line.quantity,
    0,
  );

  function changeQuantity(productId: number, change: number) {
    setCart((current) => {
      const nextQuantity = Math.max((current[productId] || 0) + change, 0);
      const next = { ...current };

      if (nextQuantity === 0) {
        delete next[productId];
      } else {
        next[productId] = nextQuantity;
      }

      return next;
    });
  }

  function updateCheckout(field: keyof CheckoutForm, value: string) {
    setCheckout((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      setError("Tu dispositivo no permite compartir la ubicación.");
      return;
    }

    setLocating(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCheckout((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setError(
          "No pudimos obtener tu ubicación. Puedes escribir la dirección manualmente.",
        );
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
      },
    );
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!storefront?.is_accepting_orders) {
      setError("Este colmado no está recibiendo pedidos en este momento.");
      return;
    }
    if (!cartLines.length) {
      setError("Agrega al menos un producto al carrito.");
      return;
    }
    if (missingMinimum > 0) {
      setError(`Agrega ${formatMoney(missingMinimum)} para completar el mínimo.`);
      return;
    }
    if (
      !checkout.customerName.trim() ||
      !checkout.customerPhone.trim() ||
      !checkout.deliveryAddress.trim()
    ) {
      setError("Completa tu nombre, teléfono y dirección de entrega.");
      return;
    }

    setSubmitting(true);

    try {
      const order = await createPublicCustomerOrder(slug, {
        idempotency_key: idempotencyKey,
        customer_name: checkout.customerName.trim(),
        customer_phone: checkout.customerPhone.trim(),
        delivery_address: checkout.deliveryAddress.trim(),
        latitude: checkout.latitude,
        longitude: checkout.longitude,
        delivery_notes: checkout.deliveryNotes.trim(),
        items: cartLines.map((line) => ({
          inventory_item_id: line.product.id,
          quantity: line.quantity.toFixed(3),
        })),
      });

      setSuccessOrder(order);
      setCart({});
      setIdempotencyKey(createOrderIdempotencyKey());
      window.localStorage.setItem(
        `colmado:last-order:${slug}`,
        order.order_number,
      );
      window.localStorage.setItem(
        `colmado:order-phone:${slug}:${order.order_number}`,
        checkout.customerPhone.trim(),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <p className="font-black text-slate-700" role="status">
          Cargando el colmado...
        </p>
      </main>
    );
  }

  if (!storefront) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
        <section className="w-full max-w-lg rounded-3xl bg-white p-8 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">🏪</p>
          <h1 className="mt-4 text-2xl font-black text-slate-950">
            Colmado no disponible
          </h1>
          <p className="mt-2 text-slate-600" role="alert">
            {error || "Comprueba el enlace e intenta nuevamente."}
          </p>
        </section>
      </main>
    );
  }

  if (successOrder) {
    return (
      <main className="min-h-screen bg-emerald-50 px-4 py-10">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-sm sm:p-9">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl" aria-hidden="true">
            ✓
          </div>
          <h1 className="mt-5 text-center text-3xl font-black text-slate-950">
            ¡Pedido recibido!
          </h1>
          <p className="mt-2 text-center text-slate-600">
            {storefront.display_name} ya recibió tu pedido.
          </p>

          <div className="mt-6 rounded-2xl bg-slate-50 p-5">
            <p className="text-sm font-bold text-slate-500">Número del pedido</p>
            <p className="mt-1 break-all text-lg font-black text-slate-950">
              {successOrder.order_number}
            </p>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="font-bold text-slate-600">Total</span>
              <span className="text-xl font-black text-slate-950">
                {formatMoney(successOrder.total)}
              </span>
            </div>
          </div>

          <Link
            className="mt-6 flex min-h-12 w-full items-center justify-center rounded-2xl bg-emerald-700 px-5 text-center font-black text-white"
            to={`/pedir/${encodeURIComponent(slug)}/pedido/${encodeURIComponent(
              successOrder.order_number,
            )}`}
          >
            Seguir mi pedido
          </Link>
          <button
            className="mt-3 min-h-12 w-full rounded-2xl border border-slate-300 px-5 font-black text-slate-800"
            onClick={() => {
              setSuccessOrder(null);
              setCheckout(EMPTY_CHECKOUT);
            }}
            type="button"
          >
            Hacer otro pedido
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 pb-32 text-slate-950 lg:pb-10">
      <header className="bg-emerald-800 text-white">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6">
          <p className="text-sm font-black text-emerald-200">Pide desde tu celular</p>
          <h1 className="mt-1 text-3xl font-black sm:text-4xl">
            {storefront.display_name}
          </h1>
          {storefront.description && (
            <p className="mt-2 max-w-2xl text-emerald-50">
              {storefront.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-bold text-emerald-50">
            {storefront.public_phone && <span>☎ {storefront.public_phone}</span>}
            {storefront.public_address && <span>⌖ {storefront.public_address}</span>}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="catalog-title" className="min-w-0">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black" id="catalog-title">
                Productos
              </h2>
              <p className="text-sm text-slate-600">
                Elige lo que necesitas y nosotros lo preparamos.
              </p>
            </div>
            <span className="rounded-full bg-white px-3 py-2 text-sm font-black shadow-sm">
              {products.length} disponibles
            </span>
          </div>

          {!storefront.is_accepting_orders && (
            <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 font-bold text-amber-900" role="alert">
              Este colmado está pausado y no recibe pedidos ahora mismo.
            </div>
          )}

          <label className="sr-only" htmlFor="public-product-search">
            Buscar productos
          </label>
          <input
            className="mt-5 min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 outline-none focus:border-emerald-600"
            id="public-product-search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar productos o categorías"
            type="search"
            value={search}
          />

          <div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Categorías">
            {categories.map((value) => (
              <button
                className={`min-h-10 shrink-0 rounded-full px-4 text-sm font-black ${
                  category === value
                    ? "bg-slate-950 text-white"
                    : "border border-slate-300 bg-white text-slate-700"
                }`}
                key={value}
                onClick={() => setCategory(value)}
                type="button"
              >
                {value}
              </button>
            ))}
          </div>

          {visibleProducts.length ? (
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visibleProducts.map((product) => {
                const quantity = cart[product.id] || 0;

                return (
                  <article className="flex flex-col rounded-3xl bg-white p-3 shadow-sm" key={product.id}>
                    <ProductImage product={product} />
                    <p className="mt-3 line-clamp-2 min-h-10 text-sm font-black">
                      {product.product_display_name}
                    </p>
                    <p className="mt-1 text-lg font-black text-emerald-700">
                      {formatMoney(product.sale_price)}
                    </p>
                    {quantity === 0 ? (
                      <button
                        className="mt-3 min-h-11 rounded-xl bg-emerald-700 px-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
                        disabled={!storefront.is_accepting_orders}
                        onClick={() => changeQuantity(product.id, 1)}
                        type="button"
                      >
                        Agregar
                      </button>
                    ) : (
                      <div className="mt-3 grid grid-cols-3 items-center overflow-hidden rounded-xl border border-emerald-700">
                        <button
                          aria-label={`Quitar ${product.product_display_name}`}
                          className="min-h-11 text-xl font-black text-emerald-800"
                          onClick={() => changeQuantity(product.id, -1)}
                          type="button"
                        >
                          −
                        </button>
                        <span className="text-center font-black">{quantity}</span>
                        <button
                          aria-label={`Agregar ${product.product_display_name}`}
                          className="min-h-11 text-xl font-black text-emerald-800"
                          onClick={() => changeQuantity(product.id, 1)}
                          type="button"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="mt-5 rounded-3xl bg-white p-8 text-center shadow-sm">
              <p className="font-black text-slate-800">No encontramos productos</p>
              <p className="mt-1 text-sm text-slate-500">Prueba otra búsqueda o categoría.</p>
            </div>
          )}
        </section>

        <aside className="h-fit rounded-3xl bg-white p-5 shadow-sm lg:sticky lg:top-5" aria-labelledby="cart-title">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-black" id="cart-title">Tu pedido</h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-black text-emerald-800">
              {itemCount} productos
            </span>
          </div>

          {cartLines.length ? (
            <div className="mt-4 space-y-3">
              {cartLines.map((line) => (
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3" key={line.product.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{line.product.product_display_name}</p>
                    <p className="text-xs text-slate-500">{line.quantity} × {formatMoney(line.product.sale_price)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-black">
                    {formatMoney(Number(line.product.sale_price) * line.quantity)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl bg-slate-50 p-4 text-center text-sm font-bold text-slate-500">
              Tu carrito está vacío.
            </p>
          )}

          <div className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><strong>{formatMoney(subtotal)}</strong></div>
            <div className="flex justify-between"><span>Entrega</span><strong>{formatMoney(deliveryFee)}</strong></div>
            <div className="flex justify-between border-t border-slate-200 pt-3 text-lg"><span className="font-black">Total</span><strong>{formatMoney(total)}</strong></div>
          </div>

          {missingMinimum > 0 && cartLines.length > 0 && (
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-bold text-amber-900">
              Agrega {formatMoney(missingMinimum)} para llegar al pedido mínimo.
            </p>
          )}

          <form className="mt-6 space-y-4" onSubmit={submitOrder}>
            <h3 className="font-black">Datos para la entrega</h3>
            <label className="block text-sm font-bold">
              Nombre *
              <input
                autoComplete="name"
                className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
                onChange={(event) => updateCheckout("customerName", event.target.value)}
                value={checkout.customerName}
              />
            </label>
            <label className="block text-sm font-bold">
              Teléfono *
              <input
                autoComplete="tel"
                className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 px-3 font-normal outline-none focus:border-emerald-600"
                inputMode="tel"
                onChange={(event) => updateCheckout("customerPhone", event.target.value)}
                value={checkout.customerPhone}
              />
            </label>
            <label className="block text-sm font-bold">
              Dirección de entrega *
              <textarea
                autoComplete="street-address"
                className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-emerald-600"
                onChange={(event) => updateCheckout("deliveryAddress", event.target.value)}
                placeholder="Sector, calle, número y una referencia"
                value={checkout.deliveryAddress}
              />
            </label>
            <button
              className="min-h-11 w-full rounded-xl border border-emerald-700 px-3 text-sm font-black text-emerald-800 disabled:opacity-60"
              disabled={locating}
              onClick={requestLocation}
              type="button"
            >
              {locating
                ? "Buscando ubicación..."
                : checkout.latitude
                  ? "✓ Ubicación agregada"
                  : "Agregar mi ubicación"}
            </button>
            <label className="block text-sm font-bold">
              Nota para el colmado
              <textarea
                className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 p-3 font-normal outline-none focus:border-emerald-600"
                onChange={(event) => updateCheckout("deliveryNotes", event.target.value)}
                placeholder="Ejemplo: llamar al llegar"
                value={checkout.deliveryNotes}
              />
            </label>

            {error && (
              <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800" role="alert">
                {error}
              </p>
            )}

            <button
              className="min-h-14 w-full rounded-2xl bg-emerald-700 px-5 text-lg font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={
                submitting ||
                !storefront.is_accepting_orders ||
                !cartLines.length
              }
              type="submit"
            >
              {submitting ? "Enviando pedido..." : `Confirmar pedido · ${formatMoney(total)}`}
            </button>
          </form>
        </aside>
      </div>

      {cartLines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white p-3 shadow-2xl lg:hidden">
          <a className="mx-auto flex min-h-14 max-w-xl items-center justify-between rounded-2xl bg-emerald-700 px-5 font-black text-white" href="#cart-title">
            <span>Ver pedido · {itemCount}</span>
            <span>{formatMoney(total)}</span>
          </a>
        </div>
      )}
    </main>
  );
}
