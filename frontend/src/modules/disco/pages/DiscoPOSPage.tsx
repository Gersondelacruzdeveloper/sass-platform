import { useMemo, useState } from "react";
import {
  AlertCircle,
  Package,
  RefreshCcw,
  Search,
  ShoppingCart,
  Utensils,
} from "lucide-react";

import CartPanel from "../components/CartPanel";
import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import ProductCard from "../components/ProductCard";
import TableCard from "../components/TableCard";

import { useCart } from "../hooks/useCart";
import { useDiscoProducts } from "../hooks/useDiscoProducts";
import { useDiscoSales } from "../hooks/useDiscoSales";
import { useDiscoTables } from "../hooks/useDiscoTables";

type Product = {
  id: number;
  name: string;
  sale_price: string | number;
  cost_price?: string | number;
  stock: number;
  minimum_stock?: number;
  unit?: string;
  category_name?: string;
  brand?: string;
  image?: string | null;
  is_active: boolean;
  is_low_stock?: boolean;
};

type Table = {
  id: number;
  name: string;
  floor?: string;
  capacity?: number;
  minimum_spend?: string | number;
  status: string;
  is_vip?: boolean;
};

function money(value?: string | number | null) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value || 0));
}

export default function DiscoPOSPage() {
  const { products, loading, error, refresh } = useDiscoProducts();

  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refreshTables,
  } = useDiscoTables();

  const { createSale, saving, error: saleError } = useDiscoSales();

  const {
    items,
    subtotal,
    tax,
    total,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    clearCart,
  } = useCart();

  const [search, setSearch] = useState("");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [customerName, setCustomerName] = useState("");

  const availableProducts = useMemo(() => {
    return products.filter(
      (product: Product) => product.is_active && Number(product.stock || 0) > 0
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return availableProducts;

    return availableProducts.filter((product: Product) =>
      [
        product.name,
        product.category_name,
        product.brand,
        product.unit,
        product.sale_price,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [availableProducts, search]);

  const openTables = useMemo(() => {
    return tables.filter((table: Table) =>
      ["available", "open", "occupied", "reserved"].includes(table.status)
    );
  }, [tables]);

  async function handleCheckout(paymentMethod: "cash" | "card") {
    if (items.length === 0) return;

const payload = {
  payment_method: paymentMethod,
  sale_type: selectedTable ? "table" : "pos",
  customer_name: customerName || "",
  table_number: selectedTable?.name || "",
  items: items.map((item) => ({
    product_id: item.product.id,
    quantity: item.quantity,
  })),
};

    await createSale(payload);

    clearCart();
    setCustomerName("");
    setSelectedTable(null);
    await refresh();
    await refreshTables();
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="POS"
        subtitle="Fast mobile-first point of sale for products, tables, drinks, payments, and receipts."
        icon={ShoppingCart}
        actionLabel="Refresh"
        onAction={refresh}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Products Available"
          value={availableProducts.length}
          icon={Package}
          helper="Ready for sale"
        />

        <DiscoStatCard
          title="Cart Items"
          value={items.reduce((sum, item) => sum + item.quantity, 0)}
          icon={ShoppingCart}
          helper="Current order"
        />

        <DiscoStatCard
          title="Order Total"
          value={money(total)}
          icon={ShoppingCart}
          helper="Including tax"
        />

        <DiscoStatCard
          title="Open Tables"
          value={openTables.length}
          icon={Utensils}
          helper="Available or active"
        />
      </section>

      {(error || saleError || tablesError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || saleError || tablesError}
        </div>
      )}

      <section className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product, brand, category..."
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

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4">
              <h2 className="text-lg font-black text-slate-950">Tables</h2>
              <p className="text-sm font-medium text-slate-500">
                Select a table for table service orders.
              </p>
            </div>

            {tablesLoading ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <div
                    key={index}
                    className="h-32 animate-pulse rounded-3xl bg-slate-100"
                  />
                ))}
              </div>
            ) : openTables.length === 0 ? (
              <DiscoEmptyState
                icon={Utensils}
                title="No tables available"
                description="You can still process this order as a bar sale."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {openTables.slice(0, 6).map((table: Table) => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() =>
                      setSelectedTable((current) =>
                        current?.id === table.id ? null : table
                      )
                    }
                    className={`rounded-3xl text-left transition ${
                      selectedTable?.id === table.id
                        ? "ring-2 ring-slate-950"
                        : ""
                    }`}
                  >
                    <TableCard table={table} compact />
                  </button>
                ))}
              </div>
            )}
          </section>

          <section>
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
                description="Create active products with stock before using the POS."
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product: Product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onAddToCart={() => addItem(product)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <aside className="xl:sticky xl:top-5 xl:self-start">
          <CartPanel
            items={items}
            subtotal={subtotal}
            tax={tax}
            total={total}
            onIncrease={increaseQuantity}
            onDecrease={decreaseQuantity}
            onRemove={removeItem}
            onClear={clearCart}
            onCheckout={handleCheckout}
            loading={saving}
          />
        </aside>
      </section>
    </div>
  );
}