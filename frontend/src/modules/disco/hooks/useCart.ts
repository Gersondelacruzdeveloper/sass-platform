// src/modules/disco/hooks/useCart.ts

import { useMemo, useState } from "react";

export interface CartItem {
  productId: number;
  name: string;
  price: number;
  costPrice?: number;
  quantity: number;
  image?: string;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);

  const addItem = (product: Omit<CartItem, "quantity">) => {
    setItems((prev) => {
      const existing = prev.find(
        (item) => item.productId === product.productId
      );

      if (existing) {
        return prev.map((item) =>
          item.productId === product.productId
            ? {
                ...item,
                quantity: item.quantity + 1,
              }
            : item
        );
      }

      return [
        ...prev,
        {
          ...product,
          quantity: 1,
        },
      ];
    });
  };

  const removeItem = (productId: number) => {
    setItems((prev) =>
      prev.filter((item) => item.productId !== productId)
    );
  };

  const increaseQuantity = (productId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity: item.quantity + 1,
            }
          : item
      )
    );
  };

  const decreaseQuantity = (productId: number) => {
    setItems((prev) =>
      prev
        .map((item) =>
          item.productId === productId
            ? {
                ...item,
                quantity: item.quantity - 1,
              }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateQuantity = (
    productId: number,
    quantity: number
  ) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.productId === productId
          ? {
              ...item,
              quantity,
            }
          : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setDiscount(0);
  };

  const subtotal = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
  }, [items]);

  const tax = useMemo(() => {
    return subtotal * 0.18;
  }, [subtotal]);

  const total = useMemo(() => {
    return subtotal + tax - discount;
  }, [subtotal, tax, discount]);

  const totalItems = useMemo(() => {
    return items.reduce(
      (sum, item) => sum + item.quantity,
      0
    );
  }, [items]);

  const totalProfit = useMemo(() => {
    return items.reduce((sum, item) => {
      const cost = item.costPrice || 0;

      return (
        sum +
        (item.price - cost) *
          item.quantity
      );
    }, 0);
  }, [items]);

  return {
    items,

    subtotal,
    tax,
    total,

    discount,
    setDiscount,

    totalItems,
    totalProfit,

    addItem,
    removeItem,

    increaseQuantity,
    decreaseQuantity,
    updateQuantity,

    clearCart,
  };
}