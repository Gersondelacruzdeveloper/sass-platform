import { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  Package,
  RefreshCcw,
  Search,
  TrendingDown,
  Wine,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import InventoryTable from "../components/InventoryTable";

import { useDiscoProducts } from "../hooks/useDiscoProducts";

type Product = {
  id: number;
  name: string;
  barcode?: string;
  sku?: string;
  cost_price: string | number;
  sale_price: string | number;
  stock: number;
  minimum_stock: number;
  unit: string;
  category_name?: string;
  brand?: string;
  supplier_name?: string;
  is_active: boolean;
  is_alcohol?: boolean;
  is_low_stock?: boolean;
};

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoInventoryPage() {
  const { products, loading, error, refresh } = useDiscoProducts();
  const [search, setSearch] = useState("");

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
        product.is_active ? "active" : "inactive",
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

    const inventoryCost = active.reduce(
      (sum: number, product: Product) =>
        sum + Number(product.cost_price || 0) * Number(product.stock || 0),
      0
    );

    const inventoryRetail = active.reduce(
      (sum: number, product: Product) =>
        sum + Number(product.sale_price || 0) * Number(product.stock || 0),
      0
    );

    const alcoholProducts = active.filter(
      (product: Product) => product.is_alcohol
    ).length;

    return {
      total: products.length,
      active: active.length,
      lowStock: lowStock.length,
      alcoholProducts,
      inventoryCost,
      inventoryRetail,
    };
  }, [products]);

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Inventory"
        subtitle="Monitor stock levels, product value, low-stock alerts, suppliers, and inventory health."
        icon={Archive}
        actionLabel="Refresh"
        onAction={refresh}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Active Products"
          value={stats.active}
          icon={Package}
          helper="Available in inventory"
        />

        <DiscoStatCard
          title="Low Stock"
          value={stats.lowStock}
          icon={TrendingDown}
          helper="Need restocking"
        />

        <DiscoStatCard
          title="Inventory Cost"
          value={money(stats.inventoryCost)}
          icon={Archive}
          helper="Estimated stock cost"
        />

        <DiscoStatCard
          title="Alcohol Items"
          value={stats.alcoholProducts}
          icon={Wine}
          helper="Alcohol product count"
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search inventory..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
          >
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

      {error && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 7 }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredProducts.length === 0 ? (
        <DiscoEmptyState
          icon={Archive}
          title="No inventory found"
          description="Products will appear here once they are created in the products module."
        />
      ) : (
        <InventoryTable products={filteredProducts} />
      )}
    </div>
  );
}