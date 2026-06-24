// src/modules/disco/components/InventoryTable.tsx

import { AlertTriangle, Package, Search } from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type Product = {
  id: number;
  name: string;
  category_name?: string;
  sku?: string;
  barcode?: string;
  stock: number;
  minimum_stock: number;
  unit: string;
  sale_price: number | string;
  cost_price: number | string;
  is_active: boolean;
};

type InventoryTableProps = {
  products: Product[];
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  onAdjustStock?: (product: Product) => void;
  onView?: (product: Product) => void;
};

function money(value: number | string, language: DiscoLanguage) {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function InventoryTable({
  products,
  searchValue = "",
  onSearchChange,
  onAdjustStock,
  onView,
}: InventoryTableProps) {
  const { language, t } = useDiscoTranslation();

  const isLowStock = (product: Product) =>
    Number(product.stock) <= Number(product.minimum_stock);

  const tableHeads = [
    t("inventoryTable.product"),
    t("inventoryTable.sku"),
    t("inventoryTable.stock"),
    t("inventoryTable.minimum"),
    t("inventoryTable.cost"),
    t("inventoryTable.price"),
    t("inventoryTable.status"),
    t("inventoryTable.actions"),
  ];

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:space-y-0">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            {t("inventoryTable.title")}
          </h2>

          <p className="text-sm font-semibold text-slate-500">
            {t("inventoryTable.description")}
          </p>
        </div>

        {onSearchChange && (
          <div className="relative">
            <Search
              size={17}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />

            <input
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t("inventoryTable.searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white sm:w-80"
            />
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="divide-y divide-slate-100 md:hidden">
        {products.length === 0 ? (
          <Empty />
        ) : (
          products.map((product) => (
            <div key={product.id} className="space-y-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black text-slate-900">
                    {product.name}
                  </h3>

                  <p className="text-xs font-bold text-slate-400">
                    {product.category_name || t("inventoryTable.uncategorized")}
                  </p>
                </div>

                {isLowStock(product) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                    <AlertTriangle size={13} />
                    {t("inventoryTable.low")}
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    {t("inventoryTable.ok")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Info
                  label={t("inventoryTable.stock")}
                  value={`${product.stock} ${product.unit}`}
                />

                <Info
                  label={t("inventoryTable.minimum")}
                  value={`${product.minimum_stock}`}
                />

                <Info
                  label={t("inventoryTable.cost")}
                  value={money(product.cost_price, language)}
                />

                <Info
                  label={t("inventoryTable.price")}
                  value={money(product.sale_price, language)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {onView && (
                  <button
                    onClick={() => onView(product)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
                  >
                    {t("inventoryTable.view")}
                  </button>
                )}

                {onAdjustStock && (
                  <button
                    onClick={() => onAdjustStock(product)}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                  >
                    {t("inventoryTable.adjustStock")}
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50">
            <tr>
              {tableHeads.map((head) => (
                <th
                  key={head}
                  className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500"
                >
                  {head}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <Empty />
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <p className="font-black text-slate-900">{product.name}</p>

                    <p className="text-xs font-semibold text-slate-400">
                      {product.category_name ||
                        t("inventoryTable.uncategorized")}
                    </p>
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-slate-600">
                    {product.sku || product.barcode || "—"}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-slate-900">
                    {product.stock} {product.unit}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-slate-600">
                    {product.minimum_stock}
                  </td>

                  <td className="px-5 py-4 text-sm font-bold text-slate-600">
                    {money(product.cost_price, language)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-slate-900">
                    {money(product.sale_price, language)}
                  </td>

                  <td className="px-5 py-4">
                    {isLowStock(product) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                        <AlertTriangle size={13} />
                        {t("inventoryTable.lowStock")}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                        {t("inventoryTable.inStock")}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-4">
                    <div className="flex gap-2">
                      {onView && (
                        <button
                          onClick={() => onView(product)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                        >
                          {t("inventoryTable.view")}
                        </button>
                      )}

                      {onAdjustStock && (
                        <button
                          onClick={() => onAdjustStock(product)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-black"
                        >
                          {t("inventoryTable.adjust")}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function Empty() {
  const { t } = useDiscoTranslation();

  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
      <Package size={42} className="mb-3 text-slate-300" />

      <p className="text-sm font-black text-slate-700">
        {t("inventoryTable.noProductsFound")}
      </p>

      <p className="mt-1 text-xs font-semibold text-slate-400">
        {t("inventoryTable.noProductsFoundDescription")}
      </p>
    </div>
  );
}