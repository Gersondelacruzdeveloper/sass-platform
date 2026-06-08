import { useMemo, useState } from "react";
import {
  AlertCircle,
  Boxes,
  Package,
  Plus,
  RefreshCcw,
  Search,
  TrendingDown,
  Wine,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import ProductCard from "../components/ProductCard";

import { useDiscoProducts } from "../hooks/useDiscoProducts";
import { createProduct, updateProduct } from "../api/productsApi";

type Product = {
  id: number;
  name: string;
  barcode?: string;
  sku?: string;
  image?: string | null;
  cost_price: string | number;
  sale_price: string | number;
  stock: number;
  minimum_stock: number;
  unit: string;
  category?: number | null;
  category_name?: string;
  brand?: string;
  size_ml?: number | null;
  supplier_name?: string;
  is_alcohol?: boolean;
  is_active: boolean;
  is_low_stock?: boolean;
};

const initialForm = {
  name: "",
  barcode: "",
  sku: "",
  cost_price: "",
  sale_price: "",
  stock: "",
  minimum_stock: "",
  unit: "unit",
  brand: "",
  size_ml: "",
  supplier_name: "",
  is_alcohol: false,
  is_active: true,
};

const unitOptions = [
  { value: "unit", label: "Unit" },
  { value: "bottle", label: "Bottle" },
  { value: "can", label: "Can" },
  { value: "box", label: "Box" },
  { value: "case", label: "Case" },
  { value: "liter", label: "Liter" },
  { value: "ml", label: "ML" },
];

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoProductsPage() {
  const { products, loading, error, refresh } = useDiscoProducts();

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState(initialForm);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;

    return products.filter((product: Product) =>
      [
        product.name,
        product.barcode,
        product.sku,
        product.category_name,
        product.brand,
        product.supplier_name,
        product.unit,
        product.is_alcohol ? "alcohol" : "non alcohol",
        product.is_low_stock ? "low stock" : "in stock",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search]);

  const stats = useMemo(() => {
    const active = products.filter((product: Product) => product.is_active);
    const lowStock = active.filter(
      (product: Product) =>
        product.is_low_stock || product.stock <= product.minimum_stock
    );
    const alcohol = active.filter((product: Product) => product.is_alcohol);

    const retailValue = active.reduce(
      (sum: number, product: Product) =>
        sum + Number(product.sale_price || 0) * Number(product.stock || 0),
      0
    );

    return {
      total: products.length,
      active: active.length,
      lowStock: lowStock.length,
      alcohol: alcohol.length,
      retailValue,
    };
  }, [products]);

  function openCreateModal() {
    setEditingProduct(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setForm({
      name: product.name || "",
      barcode: product.barcode || "",
      sku: product.sku || "",
      cost_price: String(product.cost_price || ""),
      sale_price: String(product.sale_price || ""),
      stock: String(product.stock || ""),
      minimum_stock: String(product.minimum_stock || ""),
      unit: product.unit || "unit",
      brand: product.brand || "",
      size_ml: String(product.size_ml || ""),
      supplier_name: product.supplier_name || "",
      is_alcohol: Boolean(product.is_alcohol),
      is_active: Boolean(product.is_active),
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setLocalError("");

      const payload = {
        name: form.name,
        barcode: form.barcode,
        sku: form.sku,
        cost_price: Number(form.cost_price || 0),
        sale_price: Number(form.sale_price || 0),
        stock: Number(form.stock || 0),
        minimum_stock: Number(form.minimum_stock || 0),
        unit: form.unit,
        brand: form.brand,
        size_ml: form.size_ml ? Number(form.size_ml) : null,
        supplier_name: form.supplier_name,
        is_alcohol: form.is_alcohol,
        is_active: form.is_active,
      };

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      setModalOpen(false);
      setEditingProduct(null);
      setForm(initialForm);
      await refresh();
    } catch (err) {
      console.error(err);
      setLocalError("Could not save product.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Products"
        subtitle="Manage drinks, bottles, stock items, prices, suppliers, and product availability."
        icon={Package}
        actionLabel="New Product"
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Active Products"
          value={stats.active}
          icon={Package}
          helper="Available products"
        />

        <DiscoStatCard
          title="Low Stock"
          value={stats.lowStock}
          icon={TrendingDown}
          helper="Need restocking"
        />

        <DiscoStatCard
          title="Alcohol Items"
          value={stats.alcohol}
          icon={Wine}
          helper="Alcohol products"
        />

        <DiscoStatCard
          title="Retail Value"
          value={money(stats.retailValue)}
          icon={Boxes}
          helper="Estimated inventory value"
        />
      </section>

      {(error || localError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || localError}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={refresh}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <DiscoEmptyState
          icon={Package}
          title="No products found"
          description="Create products for your POS, inventory, stock movements, and sales reports."
        />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredProducts.map((product: Product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => openEditModal(product)}
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:max-w-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingProduct ? "Edit Product" : "New Product"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Add product details for POS and inventory control.
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

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Name</span>
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  placeholder="Example: Presidente Bottle"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Sale Price
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.sale_price}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      sale_price: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Cost Price
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.cost_price}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      cost_price: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Stock</span>
                <input
                  type="number"
                  min="0"
                  value={form.stock}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, stock: e.target.value }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Minimum Stock
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.minimum_stock}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      minimum_stock: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Unit</span>
                <select
                  value={form.unit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                >
                  {unitOptions.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {unit.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Brand</span>
                <input
                  value={form.brand}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, brand: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Barcode
                </span>
                <input
                  value={form.barcode}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, barcode: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">SKU</span>
                <input
                  value={form.sku}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, sku: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Size ML
                </span>
                <input
                  type="number"
                  min="0"
                  value={form.size_ml}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, size_ml: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Supplier
                </span>
                <input
                  value={form.supplier_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      supplier_name: e.target.value,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-black text-slate-950">
                  Alcohol Product
                </span>
                <input
                  type="checkbox"
                  checked={form.is_alcohol}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_alcohol: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <span className="text-sm font-black text-slate-950">
                  Active
                </span>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      is_active: e.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingProduct
                  ? "Save Changes"
                  : "Create Product"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}