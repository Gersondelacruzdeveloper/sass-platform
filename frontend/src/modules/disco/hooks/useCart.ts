// src/modules/disco/hooks/useCart.ts

import { useMemo, useState } from "react";

export interface CartProduct {
  id: number;
  name: string;
  sale_price: number | string;
  cost_price?: number | string;
  image?: string | null;
}

export interface CartItem {
  product: CartProduct;
  quantity: number;
}

type UseCartOptions = {
  taxPercentage?: number | string;
};

export function useCart(options: UseCartOptions = {}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discount, setDiscount] = useState(0);

  const taxPercentage = useMemo(() => {
    const value = Number(options.taxPercentage ?? 0);

    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }

    return value;
  }, [options.taxPercentage]);

  const addItem = (product: CartProduct) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);

      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [...prev, { product, quantity: 1 }];
    });
  };

  const removeItem = (productId: number) => {
    setItems((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const increaseQuantity = (productId: number) => {
    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  };

  const decreaseQuantity = (productId: number) => {
    setItems((prev) =>
      prev
        .map((item) =>
          item.product.id === productId
            ? { ...item, quantity: item.quantity - 1 }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const updateQuantity = (productId: number, quantity: number) => {
    if (quantity <= 0) {
      removeItem(productId);
      return;
    }

    setItems((prev) =>
      prev.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const clearCart = () => {
    setItems([]);
    setDiscount(0);
  };

  const subtotal = useMemo(() => {
    return items.reduce(
      (sum, item) =>
        sum + Number(item.product.sale_price || 0) * item.quantity,
      0
    );
  }, [items]);

  const tax = useMemo(() => {
    return subtotal * (taxPercentage / 100);
  }, [subtotal, taxPercentage]);

  const total = useMemo(
    () => subtotal + tax - Number(discount || 0),
    [subtotal, tax, discount]
  );

  const totalItems = useMemo(() => {
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }, [items]);

  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => {
      const cost = Number(item.product.cost_price || 0);
      return sum + cost * item.quantity;
    }, 0);
  }, [items]);

  const totalProfit = useMemo(() => {
    return items.reduce((sum, item) => {
      const sale = Number(item.product.sale_price || 0);
      const cost = Number(item.product.cost_price || 0);

      return sum + (sale - cost) * item.quantity;
    }, 0);
  }, [items]);

  return {
    items,
    subtotal,
    tax,
    taxPercentage,
    total,
    discount,
    setDiscount,
    totalItems,
    totalCost,
    totalProfit,
    addItem,
    removeItem,
    increaseQuantity,
    decreaseQuantity,
    updateQuantity,
    clearCart,
  };
}

export default useCart;