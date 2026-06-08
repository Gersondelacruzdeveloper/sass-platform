// src/modules/disco/components/InventoryTable.tsx

import { AlertTriangle, Package, Search } from "lucide-react";

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

export default function InventoryTable({
  products,
  searchValue = "",
  onSearchChange,
  onAdjustStock,
  onView,
}: InventoryTableProps) {
  const money = (value: number | string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const isLowStock = (product: Product) =>
    Number(product.stock) <= Number(product.minimum_stock);

  return (
    <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="space-y-4 border-b border-slate-100 p-4 sm:p-5 lg:flex lg:items-center lg:justify-between lg:space-y-0">
        <div>
          <h2 className="text-lg font-black text-slate-900">Inventory</h2>
          <p className="text-sm font-semibold text-slate-500">
            Track stock levels, costs, pricing and low stock alerts.
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
              placeholder="Search inventory..."
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
                    {product.category_name || "Uncategorized"}
                  </p>
                </div>

                {isLowStock(product) ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                    <AlertTriangle size={13} />
                    Low
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                    OK
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Info label="Stock" value={`${product.stock} ${product.unit}`} />
                <Info label="Minimum" value={`${product.minimum_stock}`} />
                <Info label="Cost" value={money(product.cost_price)} />
                <Info label="Price" value={money(product.sale_price)} />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {onView && (
                  <button
                    onClick={() => onView(product)}
                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700"
                  >
                    View
                  </button>
                )}

                {onAdjustStock && (
                  <button
                    onClick={() => onAdjustStock(product)}
                    className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white"
                  >
                    Adjust Stock
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
              {[
                "Product",
                "SKU",
                "Stock",
                "Minimum",
                "Cost",
                "Price",
                "Status",
                "Actions",
              ].map((head) => (
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
                      {product.category_name || "Uncategorized"}
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
                    {money(product.cost_price)}
                  </td>

                  <td className="px-5 py-4 text-sm font-black text-slate-900">
                    {money(product.sale_price)}
                  </td>

                  <td className="px-5 py-4">
                    {isLowStock(product) ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                        <AlertTriangle size={13} />
                        Low Stock
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                        In Stock
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
                          View
                        </button>
                      )}

                      {onAdjustStock && (
                        <button
                          onClick={() => onAdjustStock(product)}
                          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-black text-white hover:bg-black"
                        >
                          Adjust
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
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center p-8 text-center">
      <Package size={42} className="mb-3 text-slate-300" />
      <p className="text-sm font-black text-slate-700">
        No inventory products found
      </p>
      <p className="mt-1 text-xs font-semibold text-slate-400">
        Add products or adjust your filters.
      </p>
    </div>
  );
}