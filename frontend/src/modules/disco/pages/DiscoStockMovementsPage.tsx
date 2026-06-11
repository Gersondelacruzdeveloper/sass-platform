import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowUpCircle,
  PackageSearch,
  Plus,
  RefreshCcw,
  Search,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import DiscoDataTable from "../components/DiscoDataTable";
import type { StockMovement } from "../api/stockMovementsApi";

import useDiscoProducts from "../hooks/useDiscoProducts";
import {
  createStockMovement,
  getStockMovements,
} from "../api/stockMovementsApi";

type MovementType = "in" | "out" | "adjustment" | "loss";


type Product = {
  id: number;
  name: string;
  stock: number;
  unit?: string;
};

const initialForm = {
  product: "",
  movement_type: "in" as MovementType,
  quantity: "",
  note: "",
};

const movementOptions = [
  { value: "in", label: "Stock In" },
  { value: "out", label: "Stock Out" },
  { value: "adjustment", label: "Adjustment" },
  { value: "loss", label: "Loss" },
];

function formatDate(value: string | undefined) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function movementLabel(type: MovementType) {
  return movementOptions.find((item) => item.value === type)?.label || type;
}

export default function DiscoStockMovementsPage() {
  const {
    products,
    loading: productsLoading,
    error: productsError,
    refreshProducts,
  } = useDiscoProducts();

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);

  async function refreshMovements() {
    try {
      setLoading(true);
      setError(null);

      const data = await getStockMovements();
      const results = Array.isArray(data)
        ? data
        : (data as { results?: StockMovement[] })?.results;
      setMovements(results || []);
    } catch (err) {
      console.error("Failed to load stock movements:", err);
      setError("Could not load stock movements.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshMovements();
  }, []);

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return movements;

    return movements.filter((movement) =>
      [
        movement.product_name,
        movement.movement_type,
        movementLabel(movement.movement_type),
        movement.quantity,
        movement.note,
        movement.created_by_name,
        formatDate(movement.created_at),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [movements, search]);

  const stats = useMemo(() => {
    const stockIn = movements
      .filter((item) => item.movement_type === "in")
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const stockOut = movements
      .filter((item) => item.movement_type === "out")
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    const adjustments = movements.filter(
      (item) => item.movement_type === "adjustment"
    ).length;

    const losses = movements
      .filter((item) => item.movement_type === "loss")
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    return { stockIn, stockOut, adjustments, losses };
  }, [movements]);

  function refreshAll() {
    refreshMovements();
    refreshProducts();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setLocalError("");

      await createStockMovement({
        product: Number(form.product),
        movement_type: form.movement_type,
        quantity: Number(form.quantity || 0),
        note: form.note,
      });

      setForm(initialForm);
      setModalOpen(false);
      refreshAll();
    } catch (err) {
      console.error(err);
      setLocalError("Could not create stock movement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Stock Movements"
        subtitle="Track stock in, stock out, adjustments, losses, and inventory audit history."
        icon={PackageSearch}
        actionLabel="New Movement"
        onAction={() => setModalOpen(true)}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard title="Stock In" value={stats.stockIn} icon={ArrowDownCircle} helper="Units added" />
        <DiscoStatCard title="Stock Out" value={stats.stockOut} icon={ArrowUpCircle} helper="Units removed" />
        <DiscoStatCard title="Adjustments" value={stats.adjustments} icon={Shuffle} helper="Manual corrections" />
        <DiscoStatCard title="Losses" value={stats.losses} icon={Trash2} helper="Damaged or missing" />
      </section>

      {(error || productsError || localError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || productsError || localError}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stock movements..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-3xl bg-slate-100" />
          ))}
        </div>
      ) : filteredMovements.length === 0 ? (
        <DiscoEmptyState
          icon={PackageSearch}
          title="No stock movements found"
          description="Create stock movements when products are received, sold, lost, or adjusted."
        />
      ) : (
        <DiscoDataTable
          data={filteredMovements}
          columns={([
            {
              header: "Product",
              accessor: "product_name",
              render: (movement: StockMovement) => (
                <span className="text-sm font-black text-slate-950">
                  {movement.product_name || `Product #${movement.product}`}
                </span>
              ),
            },
            {
              header: "Type",
              accessor: "movement_type",
              render: (movement: StockMovement) => (
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                  {movementLabel(movement.movement_type)}
                </span>
              ),
            },
            {
              header: "Quantity",
              accessor: "quantity",
              render: (movement: StockMovement) => (
                <span className="text-sm font-black text-slate-950">
                  {movement.quantity}
                </span>
              ),
            },
            {
              header: "Note",
              accessor: "note",
              render: (movement: StockMovement) => (
                <span className="text-sm font-semibold text-slate-600">
                  {movement.note || "—"}
                </span>
              ),
            },
            {
              header: "Created By",
              accessor: "created_by_name",
              render: (movement: StockMovement) => (
                <span className="text-sm font-bold text-slate-600">
                  {movement.created_by_name || "System"}
                </span>
              ),
            },
            {
              header: "Date",
              accessor: "created_at",
              render: (movement: StockMovement) => (
                <span className="text-sm font-bold text-slate-500">
                  {formatDate(movement.created_at)}
                </span>
              ),
            },
          ] as any)}
        />
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="w-full rounded-3xl bg-white p-5 shadow-2xl sm:max-w-lg"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  New Stock Movement
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Select the product, movement type, quantity, and note.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">Product</span>
                <select
                  value={form.product}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, product: e.target.value }))
                  }
                  disabled={productsLoading}
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white disabled:opacity-60"
                >
                  <option value="">Select product</option>
                  {products.map((product: Product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} • Stock: {product.stock} {product.unit || ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Movement Type</span>
                <select
                  value={form.movement_type}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      movement_type: e.target.value as MovementType,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                >
                  {movementOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Quantity</span>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                  required
                  placeholder="Example: 10"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Note</span>
                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder="Example: Received from supplier, damaged bottle, manual stock count..."
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Create Movement"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}