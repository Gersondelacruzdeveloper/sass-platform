// frontend/src/modules/disco/components/ProductCard.tsx

import type { Product } from "../types/pos"

interface Props {
  product: Product
  onClick: () => void
}

export default function ProductCard({
  product,
  onClick,
}: Props) {

  return (
    <button
      onClick={onClick}
      className="
        rounded-2xl
        bg-slate-900
        p-4
        text-left
        text-white
        transition
        hover:scale-[1.02]
      "
    >
      {product.image && (
        <img
          src={product.image}
          className="
            mb-3
            h-36
            w-full
            rounded-xl
            object-cover
          "
        />
      )}

      <h3 className="font-semibold">
        {product.name}
      </h3>

      <p className="mt-1 text-sm text-slate-400">
        Stock: {product.stock}
      </p>

      <div className="mt-3 text-xl font-bold">
        RD$ {product.sale_price}
      </div>

      {product.is_low_stock && (
        <div className="mt-2 text-xs text-red-400">
          Low stock
        </div>
      )}
    </button>
  )
}