// src/modules/disco/components/CartPanel.tsx

import {
  Banknote,
  CreditCard,
  Minus,
  Plus,
  ShoppingCart,
  Trash2,
} from "lucide-react";

type CartItem = {
  product: {
    id: number;
    name: string;
    sale_price: number | string;
  };
  quantity: number;
};

type CartPanelProps = {
  items: CartItem[];
  subtotal: number;
  tax: number;
  total: number;
  onIncrease: (productId: number) => void;
  onDecrease: (productId: number) => void;
  onRemove: (productId: number) => void;
  onClear: () => void;
  onCheckout: (paymentMethod: "cash" | "card") => void;
  loading?: boolean;
};

export default function CartPanel({
  items,
  subtotal,
  tax,
  total,
  onIncrease,
  onDecrease,
  onRemove,
  onClear,
  onCheckout,
  loading = false,
}: CartPanelProps) {
  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);

  return (
    <aside className="flex h-full flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 p-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Current Order
          </p>
          <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
            <ShoppingCart size={20} />
            Cart
          </h2>
        </div>

        {items.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-full bg-red-50 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-100"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {items.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
            <ShoppingCart className="mb-3 text-slate-300" size={42} />
            <p className="text-sm font-bold text-slate-700">
              No products added yet
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Select products from the POS to start an order.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const productId = item.product.id;
            const price = Number(item.product.sale_price || 0);

            return (
              <div
                key={productId}
                className="rounded-2xl border border-slate-100 bg-slate-50 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-900">
                      {item.product.name}
                    </h3>
                    <p className="text-xs font-semibold text-slate-500">
                      {formatMoney(price)} each
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemove(productId)}
                    className="rounded-full bg-white p-2 text-red-500 shadow-sm hover:bg-red-50"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center rounded-full bg-white p-1 shadow-sm">
                    <button
                      type="button"
                      onClick={() => onDecrease(productId)}
                      className="rounded-full bg-slate-100 p-2 text-slate-700 hover:bg-slate-200"
                    >
                      <Minus size={14} />
                    </button>

                    <span className="w-10 text-center text-sm font-black text-slate-900">
                      {item.quantity}
                    </span>

                    <button
                      type="button"
                      onClick={() => onIncrease(productId)}
                      className="rounded-full bg-slate-900 p-2 text-white hover:bg-black"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  <p className="text-sm font-black text-slate-900">
                    {formatMoney(price * item.quantity)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="border-t border-slate-100 p-4">
        <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
          <div className="flex justify-between text-sm font-semibold text-slate-500">
            <span>Subtotal</span>
            <span>{formatMoney(subtotal)}</span>
          </div>

          <div className="flex justify-between text-sm font-semibold text-slate-500">
            <span>Tax 18%</span>
            <span>{formatMoney(tax)}</span>
          </div>

          <div className="border-t border-slate-200 pt-2">
            <div className="flex justify-between text-lg font-black text-slate-900">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={items.length === 0 || loading}
            onClick={() => onCheckout("cash")}
            className="flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Banknote size={18} />
            Cash
          </button>

          <button
            type="button"
            disabled={items.length === 0 || loading}
            onClick={() => onCheckout("card")}
            className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-4 text-sm font-black text-white shadow-sm hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CreditCard size={18} />
            Card
          </button>
        </div>
      </div>
    </aside>
  );
}