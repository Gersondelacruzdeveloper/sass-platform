import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BrowserMultiFormatReader,
  type IScannerControls,
} from "@zxing/browser";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";

import {
  createSale,
  getApiErrorMessage,
  getCustomers,
  getInventory,
} from "../api/colmadoClient";
import type {
  Customer,
  InventoryItem,
  PaymentMethod,
  Store,
} from "../types/colmado";

interface SalePanelProps {
  organisationSlug: string;
  store: Store;
  cashRegisterOpen: boolean;
  onOpenCashRegister: () => void;
  onSaleCompleted: () => void | Promise<void>;
}

interface CartLine {
  item: InventoryItem;
  quantity: number;
}

const currency = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  maximumFractionDigits: 2,
});

const money = (value: number | string) => currency.format(Number(value || 0));

const paymentOptions: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Efectivo" },
  { value: "card", label: "Tarjeta" },
  { value: "transfer", label: "Transferencia" },
  { value: "credit", label: "Fiado" },
];

export default function SalePanel({
  organisationSlug,
  store,
  cashRegisterOpen,
  onOpenCashRegister,
  onSaleCompleted,
}: SalePanelProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [customerId, setCustomerId] = useState<number | null>(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const loadSaleData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stock, people] = await Promise.all([
        getInventory(organisationSlug, { store: store.id }),
        getCustomers(organisationSlug),
      ]);
      setInventory(stock.filter((item) => item.is_active));
      setCustomers(people.filter((customer) => customer.is_active));
    } catch (requestError) {
      setError(
        getApiErrorMessage(
          requestError,
          "No pudimos cargar los productos para vender.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [organisationSlug, store.id]);

  useEffect(() => {
    setCart([]);
    setQuery("");
    setSuccess(null);
    void loadSaleData();
  }, [loadSaleData]);

  const filteredInventory = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    const rows = term
      ? inventory.filter((item) =>
          [
            item.product_name,
            item.product_display_name,
            item.brand,
            item.category,
            item.barcode ?? "",
          ]
            .join(" ")
            .toLocaleLowerCase("es")
            .includes(term),
        )
      : inventory.filter((item) => item.is_quick_sale);

    return (rows.length || term ? rows : inventory).slice(0, 60);
  }, [inventory, query]);

  const total = useMemo(
    () =>
      cart.reduce(
        (sum, line) => sum + Number(line.item.sale_price) * line.quantity,
        0,
      ),
    [cart],
  );

  const change =
    paymentMethod === "cash" && Number(amountReceived) >= total
      ? Number(amountReceived) - total
      : null;

  const addProduct = useCallback((item: InventoryItem) => {
    if (Number(item.quantity) <= 0) return;
    setError(null);
    setSuccess(null);
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (!existing) return [...current, { item, quantity: 1 }];
      const nextQuantity = Math.min(
        existing.quantity + 1,
        Number(item.quantity),
      );
      return current.map((line) =>
        line.item.id === item.id
          ? { ...line, quantity: nextQuantity }
          : line,
      );
    });
  }, []);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;

    let active = true;
    const reader = new BrowserMultiFormatReader();
    void reader
      .decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, _error, controls) => {
          if (!active || !result) return;
          const barcode = result.getText();
          const item = inventory.find((row) => row.barcode === barcode);
          controls.stop();
          scannerControlsRef.current = null;
          setScanning(false);
          if (item) {
            addProduct(item);
            setQuery("");
          } else {
            setQuery(barcode);
            setError("Ese producto no está en el inventario de esta sucursal.");
          }
        },
      )
      .then((controls) => {
        if (!active) {
          controls.stop();
          return;
        }
        scannerControlsRef.current = controls;
      })
      .catch(() => {
        if (!active) return;
        setScanning(false);
        setError("No pudimos usar la cámara. Puedes buscar el producto por nombre.");
      });

    return () => {
      active = false;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [addProduct, inventory, scanning]);

  function setQuantity(itemId: number, quantity: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.item.id === itemId
            ? {
                ...line,
                quantity: Math.min(
                  Math.max(quantity, 0),
                  Number(line.item.quantity),
                ),
              }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  async function completeSale() {
    if (!cashRegisterOpen) {
      onOpenCashRegister();
      return;
    }
    if (cart.length === 0) {
      setError("Agrega al menos un producto.");
      return;
    }
    if (paymentMethod === "credit" && !customerId) {
      setError("Selecciona el cliente que llevará la compra fiada.");
      return;
    }
    if (paymentMethod === "cash" && Number(amountReceived) < total) {
      setError(`Faltan ${money(total - Number(amountReceived || 0))}.`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const sale = await createSale(organisationSlug, {
        store_id: store.id,
        payment_method: paymentMethod,
        customer_id: paymentMethod === "credit" ? (customerId ?? undefined) : undefined,
        amount_received:
          paymentMethod === "cash"
            ? Number(amountReceived).toFixed(2)
            : undefined,
        discount: "0.00",
        items: cart.map((line) => ({
          inventory_item_id: line.item.id,
          quantity: line.quantity.toFixed(3),
        })),
      });
      setCart([]);
      setAmountReceived("");
      setCustomerId(null);
      setPaymentMethod("cash");
      setSuccess(
        sale.change_due !== "0.00"
          ? `Venta lista. Devuelve ${money(sale.change_due)}.`
          : `Venta registrada por ${money(sale.total)}.`,
      );
      await Promise.all([loadSaleData(), onSaleCompleted()]);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, "No pudimos registrar la venta."));
    } finally {
      setSaving(false);
    }
  }

  if (!cashRegisterOpen) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl bg-white p-6 text-center shadow-sm sm:p-9">
        <WalletCards aria-hidden="true" className="mx-auto text-amber-600" size={48} />
        <h1 className="mt-4 text-2xl font-black">Abre la caja para vender</h1>
        <p className="mt-2 text-slate-600">
          Así el sistema podrá decirte cuánto efectivo debe haber al final.
        </p>
        <button
          type="button"
          className="mt-6 min-h-14 w-full rounded-xl bg-emerald-700 px-5 text-lg font-black text-white"
          onClick={onOpenCashRegister}
        >
          Abrir caja
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-emerald-700">{store.name}</p>
          <h1 className="text-2xl font-black sm:text-3xl">Vender</h1>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-2 text-sm font-black text-emerald-800">
          <CheckCircle2 aria-hidden="true" size={17} /> Caja abierta
        </span>
      </div>

      {error && <Message kind="error" text={error} />}
      {success && <Message kind="success" text={success} />}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <section className="min-w-0">
          <div className="mb-3 flex gap-2">
            <label className="flex min-h-14 flex-1 items-center gap-2 rounded-xl bg-white px-4 shadow-sm focus-within:ring-4 focus-within:ring-emerald-100">
              <Search aria-hidden="true" className="text-slate-500" size={22} />
              <span className="sr-only">Buscar producto</span>
              <input
                autoFocus
                type="search"
                value={query}
                placeholder="Buscar por nombre o código"
                className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none"
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-label="Escanear código de barra"
              className="grid min-h-14 min-w-14 place-items-center rounded-xl bg-emerald-700 text-white shadow-sm"
              onClick={() => {
                setError(null);
                setScanning(true);
              }}
            >
              <Camera aria-hidden="true" size={25} />
            </button>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-xl bg-white" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {filteredInventory.map((item) => {
                const outOfStock = Number(item.quantity) <= 0;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={outOfStock}
                    className="min-h-28 rounded-xl bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow disabled:opacity-45"
                    onClick={() => addProduct(item)}
                  >
                    <span className="line-clamp-2 block font-black">
                      {item.product_display_name || item.product_name}
                    </span>
                    <span className="mt-2 block text-lg font-black text-emerald-700">
                      {money(item.sale_price)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      {outOfStock ? "Agotado" : `Quedan ${Number(item.quantity)}`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="self-start rounded-2xl bg-white p-4 shadow-sm xl:sticky xl:top-20">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-xl font-black">
              <ShoppingCart aria-hidden="true" /> Venta
            </h2>
            {cart.length > 0 && (
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-bold text-red-600"
                onClick={() => setCart([])}
              >
                <Trash2 aria-hidden="true" size={17} /> Limpiar
              </button>
            )}
          </div>

          {cart.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-10 text-center font-bold text-slate-400">
              Escanea o toca un producto
            </p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {cart.map((line) => (
                <div key={line.item.id} className="border-b border-slate-100 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-black">
                      {line.item.product_name}
                    </span>
                    <strong>{money(Number(line.item.sale_price) * line.quantity)}</strong>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Quitar ${line.item.product_name}`}
                      className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"
                      onClick={() => setQuantity(line.item.id, line.quantity - 1)}
                    >
                      <Minus aria-hidden="true" size={17} />
                    </button>
                    <input
                      aria-label={`Cantidad de ${line.item.product_name}`}
                      type="number"
                      inputMode="decimal"
                      min="0.001"
                      max={line.item.quantity}
                      step={line.item.unit === "unit" ? "1" : "0.001"}
                      value={line.quantity}
                      className="w-24 rounded-lg border px-2 py-2 text-center font-black"
                      onChange={(event) =>
                        setQuantity(line.item.id, Number(event.target.value))
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Agregar ${line.item.product_name}`}
                      className="grid h-9 w-9 place-items-center rounded-full bg-slate-100"
                      onClick={() => addProduct(line.item)}
                    >
                      <Plus aria-hidden="true" size={17} />
                    </button>
                    <span className="text-xs text-slate-500">{line.item.unit}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="my-4 flex items-center justify-between text-2xl font-black">
            <span>Total</span><span>{money(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`min-h-11 rounded-xl px-2 font-black ${
                  paymentMethod === option.value
                    ? "bg-emerald-700 text-white"
                    : "bg-slate-100 text-slate-700"
                }`}
                onClick={() => setPaymentMethod(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {paymentMethod === "cash" && (
            <div className="mt-3">
              <label className="text-sm font-black" htmlFor="cash-received">
                Efectivo recibido
              </label>
              <input
                id="cash-received"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amountReceived}
                className="mt-1 w-full rounded-xl border-2 px-3 py-3 text-lg font-black outline-none focus:border-emerald-600"
                placeholder="RD$ 0.00"
                onChange={(event) => setAmountReceived(event.target.value)}
              />
              {change !== null && (
                <p className="mt-2 rounded-lg bg-emerald-50 p-2 text-center font-black text-emerald-800">
                  Devolver {money(change)}
                </p>
              )}
            </div>
          )}

          {paymentMethod === "credit" && (
            <label className="mt-3 block">
              <span className="text-sm font-black">Cliente del fiado</span>
              <select
                value={customerId ?? ""}
                className="mt-1 w-full rounded-xl border-2 px-3 py-3 font-bold outline-none focus:border-emerald-600"
                onChange={(event) =>
                  setCustomerId(event.target.value ? Number(event.target.value) : null)
                }
              >
                <option value="">Seleccionar cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} · Debe {money(customer.balance)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            type="button"
            disabled={saving || cart.length === 0}
            className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-xl font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            onClick={() => void completeSale()}
          >
            {saving && <LoaderCircle aria-hidden="true" className="animate-spin" />}
            {saving ? "Guardando..." : `Cobrar ${money(total)}`}
          </button>
        </aside>
      </div>

      {scanning && (
        <div className="fixed inset-0 z-50 bg-black p-4">
          <button
            type="button"
            aria-label="Cerrar cámara"
            className="absolute right-5 top-5 z-10 grid h-12 w-12 place-items-center rounded-full bg-white text-black"
            onClick={() => {
              scannerControlsRef.current?.stop();
              scannerControlsRef.current = null;
              setScanning(false);
            }}
          >
            <X aria-hidden="true" />
          </button>
          <p className="absolute inset-x-0 top-6 text-center font-black text-white">
            Apunta al código de barra
          </p>
          <video ref={videoRef} className="h-full w-full object-contain" />
        </div>
      )}
    </div>
  );
}

function Message({ kind, text }: { kind: "error" | "success"; text: string }) {
  const Icon = kind === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-2 rounded-xl p-3 font-bold ${
        kind === "error"
          ? "bg-red-50 text-red-800"
          : "bg-emerald-50 text-emerald-800"
      }`}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
      {text}
    </div>
  );
}
