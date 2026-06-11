// src/modules/disco/hooks/useDiscoProducts.ts

import { useEffect, useMemo, useState } from "react";
import {
  getProducts,
  createProduct as createProductApi,
  updateProduct as updateProductApi,
  deleteProduct as deleteProductApi,
} from "../api/productsApi";

export interface DiscoProduct {
  id: number;
  category?: number | null;
  category_name?: string;
  name: string;
  barcode?: string;
  sku?: string;
  image?: string | null;
  cost_price: number | string;
  sale_price: number | string;
  stock: number;
  minimum_stock: number;
  unit: string;
  is_alcohol: boolean;
  brand?: string;
  size_ml?: number | null;
  supplier_name?: string;
  is_active: boolean;
  is_low_stock?: boolean;
  profit_per_unit?: number;
  created_at?: string;
  updated_at?: string;
}

export type DiscoProductPayload = Partial<
  Omit<
    DiscoProduct,
    "id" | "created_at" | "updated_at" | "is_low_stock" | "profit_per_unit"
  >
>;

export default function useDiscoProducts() {
  const [products, setProducts] = useState<DiscoProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadProducts() {
    try {
      setLoading(true);
      setError(null);

      const data = await getProducts();
      const productsData = Array.isArray(data)
        ? data
        : (data as { results?: DiscoProduct[] })?.results || [];
      setProducts(productsData);
    } catch (err) {
      console.error("Failed to load disco products:", err);
      setError("Could not load products.");
    } finally {
      setLoading(false);
    }
  }

  async function createProduct(payload: DiscoProductPayload) {
    try {
      setSaving(true);
      setError(null);

      const created = await createProductApi(payload as any);
      setProducts((prev) => [created as DiscoProduct, ...prev]);

      return created;
    } catch (err) {
      console.error("Failed to create disco product:", err);
      setError("Could not create product.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function updateProduct(id: number, payload: DiscoProductPayload) {
    try {
      setSaving(true);
      setError(null);

      const updated = await updateProductApi(id, payload as any);

      setProducts((prev) =>
        prev.map((product) =>
          product.id === id ? (updated as DiscoProduct) : product
        )
      );

      return updated;
    } catch (err) {
      console.error("Failed to update disco product:", err);
      setError("Could not update product.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function deleteProduct(id: number) {
    try {
      setSaving(true);
      setError(null);

      await deleteProductApi(id);
      setProducts((prev) => prev.filter((product) => product.id !== id));
    } catch (err) {
      console.error("Failed to delete disco product:", err);
      setError("Could not delete product.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadProducts();
  }, []);

  const activeProducts = useMemo(
    () => products.filter((product) => product.is_active),
    [products]
  );

  const lowStockProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.is_low_stock ||
          Number(product.stock) <= Number(product.minimum_stock)
      ),
    [products]
  );

  return {
    products,
    activeProducts,
    lowStockProducts,

    loading,
    saving,
    error,

    loadProducts,
    refresh: loadProducts,
    refreshProducts: loadProducts,

    createProduct,
    updateProduct,
    deleteProduct,
  };
}

export { useDiscoProducts };