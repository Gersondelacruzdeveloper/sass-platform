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

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

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

const movementOptions: {
  value: MovementType;
  translationKey: string;
}[] = [
  { value: "in", translationKey: "stockMovements.type.in" },
  { value: "out", translationKey: "stockMovements.type.out" },
  { value: "adjustment", translationKey: "stockMovements.type.adjustment" },
  { value: "loss", translationKey: "stockMovements.type.loss" },
];

function formatDate(value: string | undefined, language: DiscoLanguage) {
  if (!value) return "";

  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function movementLabel(
  type: MovementType,
  t: (key: string, fallback?: string) => string
) {
  const option = movementOptions.find((item) => item.value === type);
  return option ? t(option.translationKey) : type;
}

export default function DiscoStockMovementsPage() {
  const { language, t } = useDiscoTranslation();

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
      setError(t("stockMovements.errorLoad"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshMovements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredMovements = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return movements;

    return movements.filter((movement) =>
      [
        movement.product_name,
        movement.movement_type,
        movementLabel(movement.movement_type, t),
        movement.quantity,
        movement.note,
        movement.created_by_name,
        formatDate(movement.created_at, language),
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [movements, search, language, t]);

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
      setLocalError(t("stockMovements.errorCreate"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("stockMovements.title")}
        subtitle={t("stockMovements.subtitle")}
        icon={PackageSearch}
        actionLabel={t("stockMovements.newMovement")}
        onAction={() => setModalOpen(true)}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("stockMovements.stockIn")}
          value={stats.stockIn}
          icon={ArrowDownCircle}
          helper={t("stockMovements.unitsAdded")}
        />

        <DiscoStatCard
          title={t("stockMovements.stockOut")}
          value={stats.stockOut}
          icon={ArrowUpCircle}
          helper={t("stockMovements.unitsRemoved")}
        />

        <DiscoStatCard
          title={t("stockMovements.adjustments")}
          value={stats.adjustments}
          icon={Shuffle}
          helper={t("stockMovements.manualCorrections")}
        />

        <DiscoStatCard
          title={t("stockMovements.losses")}
          value={stats.losses}
          icon={Trash2}
          helper={t("stockMovements.damagedOrMissing")}
        />
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
              placeholder={t("stockMovements.searchPlaceholder")}
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
              {t("pos.refresh")}
            </button>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("product.add")}
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-24 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredMovements.length === 0 ? (
        <DiscoEmptyState
          icon={PackageSearch}
          title={t("stockMovements.noMovementsFound")}
          description={t("stockMovements.noMovementsFoundDescription")}
        />
      ) : (
        <DiscoDataTable
          data={filteredMovements}
          columns={
            [
              {
                header: t("stockMovements.product"),
                accessor: "product_name",
                render: (movement: StockMovement) => (
                  <span className="text-sm font-black text-slate-950">
                    {movement.product_name ||
                      `${t("stockMovements.productFallback")} #${
                        movement.product
                      }`}
                  </span>
                ),
              },
              {
                header: t("stockMovements.type"),
                accessor: "movement_type",
                render: (movement: StockMovement) => (
                  <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black uppercase tracking-wide text-slate-700">
                    {movementLabel(movement.movement_type, t)}
                  </span>
                ),
              },
              {
                header: t("stockMovements.quantity"),
                accessor: "quantity",
                render: (movement: StockMovement) => (
                  <span className="text-sm font-black text-slate-950">
                    {movement.quantity}
                  </span>
                ),
              },
              {
                header: t("stockMovements.note"),
                accessor: "note",
                render: (movement: StockMovement) => (
                  <span className="text-sm font-semibold text-slate-600">
                    {movement.note || "—"}
                  </span>
                ),
              },
              {
                header: t("stockMovements.createdBy"),
                accessor: "created_by_name",
                render: (movement: StockMovement) => (
                  <span className="text-sm font-bold text-slate-600">
                    {movement.created_by_name || t("stockMovements.system")}
                  </span>
                ),
              },
              {
                header: t("stockMovements.date"),
                accessor: "created_at",
                render: (movement: StockMovement) => (
                  <span className="text-sm font-bold text-slate-500">
                    {formatDate(movement.created_at, language)}
                  </span>
                ),
              },
            ] as any
          }
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
                  {t("stockMovements.modalTitle")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("stockMovements.modalSubtitle")}
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
                <span className="text-sm font-bold text-slate-700">
                  {t("stockMovements.product")}
                </span>

                <select
                  value={form.product}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, product: e.target.value }))
                  }
                  disabled={productsLoading}
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white disabled:opacity-60"
                >
                  <option value="">{t("stockMovements.selectProduct")}</option>

                  {products.map((product: Product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} • {t("stockMovements.stock")}:{" "}
                      {product.stock} {product.unit || ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("stockMovements.movementType")}
                </span>

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
                      {t(item.translationKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("stockMovements.quantity")}
                </span>

                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, quantity: e.target.value }))
                  }
                  required
                  placeholder={t("stockMovements.quantityPlaceholder")}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("stockMovements.note")}
                </span>

                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder={t("stockMovements.notePlaceholder")}
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? t("stockMovements.saving")
                : t("stockMovements.createMovement")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}