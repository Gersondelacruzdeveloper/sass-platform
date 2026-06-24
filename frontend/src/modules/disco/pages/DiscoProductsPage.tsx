import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Boxes,
  Image as ImageIcon,
  Package,
  Plus,
  RefreshCcw,
  Search,
  TrendingDown,
  Upload,
  Wine,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import ProductCard from "../components/ProductCard";

import { useDiscoProducts } from "../hooks/useDiscoProducts";
import { createProduct, updateProduct } from "../api/productsApi";
import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type Product = {
  id: number;
  name: string;
  barcode?: string;
  sku?: string;
  image?: string | null;
  image_url?: string | null;
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

type ProductForm = {
  name: string;
  barcode: string;
  sku: string;
  cost_price: string;
  sale_price: string;
  stock: string;
  minimum_stock: string;
  unit: string;
  brand: string;
  size_ml: string;
  supplier_name: string;
  imageFile: File | null;
  imagePreview: string;
  is_alcohol: boolean;
  is_active: boolean;
};

const initialForm: ProductForm = {
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
  imageFile: null,
  imagePreview: "",
  is_alcohol: false,
  is_active: true,
};

const unitOptions = [
  { value: "unit", translationKey: "products.unit.unit" },
  { value: "bottle", translationKey: "products.unit.bottle" },
  { value: "can", translationKey: "products.unit.can" },
  { value: "box", translationKey: "products.unit.box" },
  { value: "case", translationKey: "products.unit.case" },
  { value: "liter", translationKey: "products.unit.liter" },
  { value: "ml", translationKey: "products.unit.ml" },
];

function money(value?: string | number | null, language: DiscoLanguage = "en") {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

function getApiOrigin() {
  return (
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ||
    "http://127.0.0.1:8000"
  );
}

function resolveImageUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiOrigin();
  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function getProductImage(product?: Product | null) {
  if (!product) return "";
  return resolveImageUrl(product.image_url || product.image || "");
}

function getErrorMessage(
  err: any,
  t: (key: string, fallback?: string) => string
) {
  const data = err?.response?.data;

  if (!data) return t("products.errorSave");
  if (typeof data === "string") return data;

  return (
    data.detail ||
    data.non_field_errors?.[0] ||
    data.name?.[0] ||
    data.image?.[0] ||
    data.sale_price?.[0] ||
    data.cost_price?.[0] ||
    data.stock?.[0] ||
    data.minimum_stock?.[0] ||
    data.barcode?.[0] ||
    data.sku?.[0] ||
    t("products.errorSave")
  );
}

export default function DiscoProductsPage() {
  const { language, t } = useDiscoTranslation();
  const { products, loading, error, refresh } = useDiscoProducts();

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(initialForm);

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
        product.is_alcohol ? t("product.alcohol") : "",
        product.is_low_stock ? "low stock" : "in stock",
        product.is_low_stock ? t("products.lowStock") : "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [products, search, t]);

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
      imageFile: null,
      imagePreview: getProductImage(product),
      is_alcohol: Boolean(product.is_alcohol),
      is_active: Boolean(product.is_active),
    });

    setModalOpen(true);
  }

  function closeModal() {
    if (form.imagePreview.startsWith("blob:")) {
      URL.revokeObjectURL(form.imagePreview);
    }

    setModalOpen(false);
    setEditingProduct(null);
    setForm(initialForm);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLocalError(t("products.errorInvalidImage"));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setLocalError(t("products.errorImageTooLarge"));
      return;
    }

    const previewUrl = URL.createObjectURL(file);

    setForm((prev) => {
      if (prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }

      return {
        ...prev,
        imageFile: file,
        imagePreview: previewUrl,
      };
    });
  }

  function resetSelectedImage() {
    setForm((prev) => {
      if (prev.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(prev.imagePreview);
      }

      return {
        ...prev,
        imageFile: null,
        imagePreview: getProductImage(editingProduct),
      };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setLocalError("");

      const payload = new FormData();

      payload.append("name", form.name.trim());
      payload.append("barcode", form.barcode.trim());
      payload.append("sku", form.sku.trim());
      payload.append("cost_price", String(Number(form.cost_price || 0)));
      payload.append("sale_price", String(Number(form.sale_price || 0)));
      payload.append("stock", String(Number(form.stock || 0)));
      payload.append("minimum_stock", String(Number(form.minimum_stock || 0)));
      payload.append("unit", form.unit);
      payload.append("brand", form.brand.trim());
      payload.append("supplier_name", form.supplier_name.trim());
      payload.append("is_alcohol", String(form.is_alcohol));
      payload.append("is_active", String(form.is_active));

      if (form.size_ml) {
        payload.append("size_ml", String(Number(form.size_ml)));
      }

      if (form.imageFile) {
        payload.append("image", form.imageFile);
      }

      if (editingProduct) {
        await updateProduct(editingProduct.id, payload);
      } else {
        await createProduct(payload);
      }

      closeModal();
      await refresh();
    } catch (err: any) {
      console.error("Product save error:", err?.response?.data || err);
      setLocalError(getErrorMessage(err, t));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    return () => {
      if (form.imagePreview.startsWith("blob:")) {
        URL.revokeObjectURL(form.imagePreview);
      }
    };
  }, [form.imagePreview]);

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("products.title")}
        subtitle={t("products.subtitle")}
        icon={Package}
        actionLabel={t("products.newProduct")}
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("products.activeProducts")}
          value={stats.active}
          icon={Package}
          helper={t("products.availableProducts")}
        />

        <DiscoStatCard
          title={t("products.lowStock")}
          value={stats.lowStock}
          icon={TrendingDown}
          helper={t("products.needRestocking")}
        />

        <DiscoStatCard
          title={t("products.alcoholItems")}
          value={stats.alcohol}
          icon={Wine}
          helper={t("products.alcoholProducts")}
        />

        <DiscoStatCard
          title={t("products.retailValue")}
          value={money(stats.retailValue, language)}
          icon={Boxes}
          helper={t("products.estimatedInventoryValue")}
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
              placeholder={t("products.searchPlaceholder")}
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
              {t("pos.refresh")}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("product.add")}
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
          title={t("products.noProductsFound")}
          description={t("products.noProductsFoundDescription")}
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
                  {editingProduct
                    ? t("products.editProduct")
                    : t("products.newProduct")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("products.modalSubtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black text-slate-950">
                      {t("products.productImage")}
                    </p>

                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {t("products.productImageDescription")}
                    </p>
                  </div>

                  <ImageIcon className="h-5 w-5 text-slate-400" />
                </div>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="h-28 w-28 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                    {form.imagePreview ? (
                      <img
                        src={form.imagePreview}
                        alt={form.name || t("products.productPreview")}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-slate-300">
                        <Package className="h-9 w-9" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                      <Upload className="h-4 w-4" />
                      {t("products.uploadImage")}

                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="hidden"
                      />
                    </label>

                    {form.imagePreview && (
                      <button
                        type="button"
                        onClick={resetSelectedImage}
                        className="ml-2 inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        {t("products.reset")}
                      </button>
                    )}

                    <p className="text-xs font-medium text-slate-500">
                      {t("products.imageHelp")}
                    </p>
                  </div>
                </div>
              </div>

              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  {t("products.name")}
                </span>

                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  required
                  placeholder={t("products.namePlaceholder")}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("products.salePrice")}
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
                  {t("products.costPrice")}
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
                <span className="text-sm font-bold text-slate-700">
                  {t("products.stock")}
                </span>

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
                  {t("products.minimumStock")}
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
                <span className="text-sm font-bold text-slate-700">
                  {t("products.unit")}
                </span>

                <select
                  value={form.unit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, unit: e.target.value }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                >
                  {unitOptions.map((unit) => (
                    <option key={unit.value} value={unit.value}>
                      {t(unit.translationKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("products.brand")}
                </span>

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
                  {t("products.barcode")}
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
                <span className="text-sm font-bold text-slate-700">
                  {t("products.sku")}
                </span>

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
                  {t("products.sizeMl")}
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
                  {t("products.supplier")}
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
                  {t("products.alcoholProduct")}
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
                  {t("products.active")}
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
                ? t("products.saving")
                : editingProduct
                  ? t("products.saveChanges")
                  : t("products.createProduct")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}