// src/modules/disco/components/ProductCard.tsx

import { Edit, Package, Plus, AlertTriangle } from "lucide-react";

type Product = {
  id: number;
  name: string;
  category_name?: string;

  image?: string | null;
  image_url?: string | null;

  sale_price: number | string;
  cost_price?: number | string;

  stock: number;
  minimum_stock: number;
  unit: string;

  is_active: boolean;
  is_alcohol?: boolean;
  brand?: string | null;
};

type ProductCardProps = {
  product: Product;
  onAddToCart?: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onView?: (product: Product) => void;
};

export default function ProductCard({
  product,
  onAddToCart,
  onEdit,
  onView,
}: ProductCardProps) {
  const money = (value: number | string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const apiOrigin =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/api\/?$/, "") ||
    "http://127.0.0.1:8000";

  const resolveImageUrl = (url?: string | null) => {
    if (!url) return "";

    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("blob:")
    ) {
      return url;
    }

    return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
  };

  const imageUrl = resolveImageUrl(product.image_url || product.image);

  const isLowStock = Number(product.stock) <= Number(product.minimum_stock);
  const isOutOfStock = Number(product.stock) <= 0;

  return (
    <article className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
      <button
        type="button"
        onClick={() => onView?.(product)}
        className="block w-full text-left"
      >
        <div className="relative aspect-[4/3] bg-slate-100">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.name}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Package size={44} className="text-slate-300" />
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {!product.is_active && (
              <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-black text-white">
                Inactive
              </span>
            )}

            {isOutOfStock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-3 py-1 text-xs font-black text-white">
                <AlertTriangle size={13} />
                Out
              </span>
            )}

            {!isOutOfStock && isLowStock && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700">
                <AlertTriangle size={13} />
                Low
              </span>
            )}

            {product.is_alcohol && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
                Alcohol
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="space-y-4 p-4 sm:p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {product.category_name || product.brand || "Product"}
          </p>

          <h3 className="mt-1 line-clamp-2 text-base font-black text-slate-900">
            {product.name}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-400">
              Price
            </p>
            <p className="mt-1 text-sm font-black text-slate-900">
              {money(product.sale_price)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-50 p-3">
            <p className="text-xs font-black uppercase text-slate-400">
              Stock
            </p>
            <p
              className={`mt-1 text-sm font-black ${
                isOutOfStock
                  ? "text-red-700"
                  : isLowStock
                    ? "text-amber-700"
                    : "text-slate-900"
              }`}
            >
              {product.stock} {product.unit}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(product);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              <Edit size={16} />
              Edit
            </button>
          )}

          {onAddToCart && (
            <button
              type="button"
              disabled={!product.is_active || isOutOfStock}
              onClick={(e) => {
                e.stopPropagation();
                onAddToCart(product);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-black text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={16} />
              Add
            </button>
          )}
        </div>
      </div>
    </article>
  );
}