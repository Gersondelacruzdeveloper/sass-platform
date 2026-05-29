// frontend/src/modules/disco/components/CartPanel.tsx

import { CartItem } from "../types/pos"

interface Props {
  cart: CartItem[]
  subtotal: number
  tax: number
  total: number
  onRemove: (id: number) => void
  onComplete: () => void
}

export default function CartPanel({
  cart,
  subtotal,
  tax,
  total,
  onRemove,
  onComplete,
}: Props) {

  return (
    <div
      className="
        flex
        h-full
        flex-col
        rounded-2xl
        bg-white
        p-5
        shadow-xl
      "
    >
      <h2 className="text-2xl font-bold">
        Cart
      </h2>

      <div className="mt-5 flex-1 space-y-3 overflow-auto">

        {cart.map((item) => (
          <div
            key={item.product.id}
            className="
              flex
              items-center
              justify-between
              rounded-xl
              border
              p-3
            "
          >
            <div>
              <h4 className="font-medium">
                {item.product.name}
              </h4>

              <p className="text-sm text-slate-500">
                Qty: {item.quantity}
              </p>
            </div>

            <div className="text-right">
              <div className="font-bold">
                RD$
                {(
                  Number(item.product.sale_price) *
                  item.quantity
                ).toFixed(2)}
              </div>

              <button
                onClick={() =>
                  onRemove(item.product.id)
                }
                className="
                  mt-1
                  text-xs
                  text-red-500
                "
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t pt-5">

        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>RD$ {subtotal.toFixed(2)}</span>
        </div>

        <div className="mt-2 flex justify-between">
          <span>Tax</span>
          <span>RD$ {tax.toFixed(2)}</span>
        </div>

        <div className="mt-3 flex justify-between text-xl font-bold">
          <span>Total</span>
          <span>RD$ {total.toFixed(2)}</span>
        </div>

        <button
          onClick={onComplete}
          className="
            mt-5
            w-full
            rounded-xl
            bg-black
            py-4
            font-semibold
            text-white
          "
        >
          Complete Sale
        </button>
      </div>
    </div>
  )
}