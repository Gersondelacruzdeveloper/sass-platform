import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Barcode,
  Boxes,
  Camera,
  LoaderCircle,
  PackagePlus,
  Search,
  X,
} from "lucide-react";

import {
  addInitialInventoryItem,
  findCatalogProductByBarcode,
  getApiErrorMessage,
  getInventory,
  receiveInventoryCases,
  type CatalogProduct,
} from "../api/colmadoClient";
import type { InventoryItem, Store } from "../types/colmado";
import BarcodeScannerModal from "./BarcodeScannerModal";

interface InventoryPanelProps {
  organisationSlug: string;
  store: Store;
  onInventoryChanged?: () => void | Promise<void>;
}

type Notice = { kind: "success" | "error"; text: string } | null;

const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
  minimumFractionDigits: 2,
});

export default function InventoryPanel({
  organisationSlug,
  store,
  onInventoryChanged,
}: InventoryPanelProps) {
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [catalogProduct, setCatalogProduct] = useState<CatalogProduct | null>(null);
  const [receivingItem, setReceivingItem] = useState<InventoryItem | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      setInventory(await getInventory(organisationSlug, { store: store.id }));
    } catch (error) {
      setNotice({ kind: "error", text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [organisationSlug, store.id]);

  useEffect(() => {
    setSearch("");
    setBarcode("");
    setCatalogProduct(null);
    setReceivingItem(null);
    setNotice(null);
    void loadInventory();
  }, [loadInventory]);

  const visibleInventory = useMemo(() => {
    const words = search.trim().toLocaleLowerCase("es");
    return inventory.filter((item) => {
      if (onlyLowStock && !item.low_stock) return false;
      if (!words) return true;
      return [
        item.product_name,
        item.product_display_name,
        item.brand,
        item.presentation,
        item.barcode ?? "",
      ].some((value) => value.toLocaleLowerCase("es").includes(words));
    });
  }, [inventory, onlyLowStock, search]);

  async function selectBarcode(rawBarcode: string) {
    const cleanBarcode = rawBarcode.trim();
    if (!cleanBarcode || lookingUp) return;

    setBarcode(cleanBarcode);
    setCatalogProduct(null);
    setReceivingItem(null);
    setNotice(null);

    const existing = inventory.find((item) => item.barcode === cleanBarcode);
    if (existing) {
      setReceivingItem(existing);
      setNotice({
        kind: "success",
        text: `${existing.product_display_name} ya está en tu inventario. Puedes recibir sus cajas ahora.`,
      });
      return;
    }

    setLookingUp(true);
    try {
      setCatalogProduct(
        await findCatalogProductByBarcode(organisationSlug, cleanBarcode),
      );
    } catch (error) {
      setNotice({
        kind: "error",
        text: getApiErrorMessage(
          error,
          "Ese código todavía no está en el catálogo maestro.",
        ),
      });
    } finally {
      setLookingUp(false);
    }
  }

  function clearAction() {
    setBarcode("");
    setCatalogProduct(null);
    setReceivingItem(null);
    setNotice(null);
  }

  async function inventoryChanged() {
    await loadInventory();
    await onInventoryChanged?.();
  }

  return (
    <section className="space-y-5" aria-labelledby="inventory-title">
      <div>
        <p className="text-sm font-bold text-emerald-700">{store.name}</p>
        <h1 id="inventory-title" className="text-2xl font-black text-slate-950">
          Inventario
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Escanea para agregar productos o recibir mercancía.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 font-black text-slate-900">
          <Barcode aria-hidden="true" size={21} /> Escanear producto
        </h2>
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            void selectBarcode(barcode);
          }}
        >
          <label className="sr-only" htmlFor="inventory-barcode">
            Código de barra
          </label>
          <input
            id="inventory-barcode"
            inputMode="numeric"
            autoComplete="off"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-slate-300 px-4 text-base font-bold outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            placeholder="Escanea o escribe el código"
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
          />
          <button
            type="submit"
            disabled={!barcode.trim() || lookingUp}
            className="min-h-12 rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50"
          >
            {lookingUp ? "Buscando..." : "Buscar"}
          </button>
          <button
            type="button"
            className="flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-emerald-700 px-4 font-black text-emerald-800"
            onClick={() => setScannerOpen(true)}
          >
            <Camera aria-hidden="true" size={20} /> Cámara
          </button>
        </form>
      </div>

      {notice && (
        <div
          role={notice.kind === "error" ? "alert" : "status"}
          className={`rounded-xl border p-3 text-sm font-bold ${
            notice.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {notice.text}
        </div>
      )}

      {catalogProduct && (
        <InitialInventoryForm
          product={catalogProduct}
          storeId={store.id}
          organisationSlug={organisationSlug}
          onCancel={clearAction}
          onSaved={async (item) => {
            setCatalogProduct(null);
            setBarcode("");
            setNotice({
              kind: "success",
              text: `${item.product_display_name} fue agregado al inventario.`,
            });
            await inventoryChanged();
          }}
        />
      )}

      {receivingItem && (
        <ReceiveCasesForm
          item={receivingItem}
          organisationSlug={organisationSlug}
          onCancel={clearAction}
          onSaved={async (updated, unitsAdded) => {
            setReceivingItem(null);
            setBarcode("");
            setNotice({
              kind: "success",
              text: `Listo: agregamos ${unitsAdded} unidades de ${updated.product_display_name}.`,
            });
            await inventoryChanged();
          }}
        />
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black text-slate-900">Productos en existencia</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
              {visibleInventory.length}
            </span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Buscar en el inventario</span>
              <Search
                aria-hidden="true"
                className="absolute left-3 top-3.5 text-slate-400"
                size={19}
              />
              <input
                className="min-h-12 w-full rounded-xl border border-slate-300 pl-10 pr-4 outline-none focus:border-emerald-600"
                placeholder="Buscar producto o código"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-pressed={onlyLowStock}
              className={`min-h-12 rounded-xl border px-4 font-black ${
                onlyLowStock
                  ? "border-amber-500 bg-amber-50 text-amber-900"
                  : "border-slate-300 text-slate-700"
              }`}
              onClick={() => setOnlyLowStock((current) => !current)}
            >
              Se está acabando
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 font-bold text-slate-600">
            <LoaderCircle className="animate-spin" aria-hidden="true" /> Cargando...
          </div>
        ) : visibleInventory.length === 0 ? (
          <div className="p-10 text-center">
            <Boxes className="mx-auto text-slate-400" aria-hidden="true" size={42} />
            <p className="mt-3 font-black text-slate-800">No hay productos aquí</p>
            <p className="mt-1 text-sm text-slate-500">
              Escanea el primero o cambia la búsqueda.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleInventory.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-black text-slate-900">
                      {item.product_display_name}
                    </h3>
                    {item.low_stock && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-black text-amber-900">
                        <AlertTriangle aria-hidden="true" size={14} /> Poco
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.barcode || "Sin código"} · Venta {money.format(Number(item.sale_price))}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-right">
                    <p className="text-2xl font-black text-slate-950">{item.quantity}</p>
                    <p className="text-xs font-bold text-slate-500">en existencia</p>
                  </div>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl bg-slate-900 px-4 font-black text-white"
                    onClick={() => {
                      setCatalogProduct(null);
                      setReceivingItem(item);
                      setBarcode(item.barcode ?? "");
                      setNotice(null);
                    }}
                  >
                    Recibir cajas
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <BarcodeScannerModal
        open={scannerOpen}
        title="Escanear para inventario"
        onClose={() => setScannerOpen(false)}
        onDetected={(detectedBarcode) => void selectBarcode(detectedBarcode)}
      />
    </section>
  );
}

interface InitialInventoryFormProps {
  product: CatalogProduct;
  storeId: number;
  organisationSlug: string;
  onSaved: (item: InventoryItem) => void | Promise<void>;
  onCancel: () => void;
}

function InitialInventoryForm({
  product,
  storeId,
  organisationSlug,
  onSaved,
  onCancel,
}: InitialInventoryFormProps) {
  const [quantity, setQuantity] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("5");
  const [quickSale, setQuickSale] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!product.barcode || saving) return;
    setSaving(true);
    setError(null);
    try {
      const item = await addInitialInventoryItem(organisationSlug, {
        store_id: storeId,
        barcode: product.barcode,
        quantity,
        cost_price: costPrice,
        sale_price: salePrice,
        reorder_level: reorderLevel,
        is_quick_sale: quickSale,
      });
      await onSaved(item);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4"
    >
      <div className="flex items-start gap-3">
        <PackagePlus className="mt-1 text-emerald-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase text-emerald-700">Producto encontrado</p>
          <h2 className="text-lg font-black text-slate-950">{product.display_name}</h2>
          <p className="text-sm text-slate-600">{product.barcode}</p>
        </div>
        <button type="button" aria-label="Cancelar" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <NumberField label="¿Cuántas unidades tienes?" value={quantity} onChange={setQuantity} step="0.001" />
        <NumberField label="Costo por unidad (RD$)" value={costPrice} onChange={setCostPrice} step="0.01" />
        <NumberField label="Precio de venta (RD$)" value={salePrice} onChange={setSalePrice} step="0.01" />
        <NumberField label="Avísame cuando queden" value={reorderLevel} onChange={setReorderLevel} step="0.001" />
      </div>

      <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl bg-white px-4 font-bold text-slate-800">
        <input
          type="checkbox"
          className="h-5 w-5 accent-emerald-700"
          checked={quickSale}
          onChange={(event) => setQuickSale(event.target.checked)}
        />
        Mostrarlo entre los productos de venta rápida
      </label>

      {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={saving || !quantity || !costPrice || !salePrice || !reorderLevel}
        className="mt-4 min-h-12 w-full rounded-xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50"
      >
        {saving ? "Guardando..." : "Agregar a mi inventario"}
      </button>
    </form>
  );
}

interface ReceiveCasesFormProps {
  item: InventoryItem;
  organisationSlug: string;
  onSaved: (item: InventoryItem, unitsAdded: string) => void | Promise<void>;
  onCancel: () => void;
}

function ReceiveCasesForm({
  item,
  organisationSlug,
  onSaved,
  onCancel,
}: ReceiveCasesFormProps) {
  const [cases, setCases] = useState("1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expectedUnits = Number(cases || 0) * item.units_per_case;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await receiveInventoryCases(
        organisationSlug,
        item.id,
        cases,
      );
      await onSaved(updated, updated.units_added);
    } catch (caught) {
      setError(getApiErrorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void submit(event)}
      className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-4"
    >
      <div className="flex items-start gap-3">
        <Boxes className="mt-1 text-blue-700" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase text-blue-700">Recibir mercancía</p>
          <h2 className="text-lg font-black text-slate-950">{item.product_display_name}</h2>
          <p className="text-sm text-slate-600">
            Cada caja tiene {item.units_per_case} unidades.
          </p>
        </div>
        <button type="button" aria-label="Cancelar" onClick={onCancel}>
          <X aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 max-w-sm">
        <NumberField label="¿Cuántas cajas llegaron?" value={cases} onChange={setCases} step="0.001" />
      </div>
      <p className="mt-3 font-black text-blue-900">
        Se agregarán {Number.isFinite(expectedUnits) ? expectedUnits : 0} unidades.
      </p>
      {error && <p role="alert" className="mt-3 text-sm font-bold text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={saving || Number(cases) <= 0}
        className="mt-4 min-h-12 w-full rounded-xl bg-blue-700 px-5 font-black text-white disabled:opacity-50 sm:w-auto"
      >
        {saving ? "Guardando..." : "Confirmar cajas recibidas"}
      </button>
    </form>
  );
}

interface NumberFieldProps {
  label: string;
  value: string;
  step: string;
  onChange: (value: string) => void;
}

function NumberField({ label, value, step, onChange }: NumberFieldProps) {
  return (
    <label className="block text-sm font-black text-slate-800">
      {label}
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        required
        className="mt-1 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-bold outline-none focus:border-emerald-600"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
