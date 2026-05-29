// frontend/src/modules/disco/hooks/useCart.ts

import { useMemo, useState } from "react"
import type { CartItem, Product } from "../types/pos"

export function useCart() {

  const [cart, setCart] = useState<CartItem[]>([])

  const addToCart = (product: Product) => {

    setCart((prev) => {

      const existing = prev.find(
        (item) => item.product.id === product.id
      )

      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        )
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
        },
      ]
    })
  }

  const removeFromCart = (productId: number) => {
    setCart((prev) =>
      prev.filter(
        (item) => item.product.id !== productId
      )
    )
  }

  const updateQuantity = (
    productId: number,
    quantity: number
  ) => {

    if (quantity <= 0) {
      removeFromCart(productId)
      return
    }

    setCart((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? {
              ...item,
              quantity,
            }
          : item
      )
    )
  }

  const clearCart = () => {
    setCart([])
  }

  const subtotal = useMemo(() => {
    return cart.reduce((acc, item) => {
      return (
        acc +
        Number(item.product.sale_price) *
          item.quantity
      )
    }, 0)
  }, [cart])

  const tax = subtotal * 0.18

  const total = subtotal + tax

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    subtotal,
    tax,
    total,
  }
}