// src/modules/disco/api/productsApi.ts

import api from "../../../api/axios";

export interface Product {
  id: number;
  organisation: number;

  category: number | null;
  category_name?: string;

  name: string;
  barcode?: string | null;
  sku?: string | null;

  image?: string | null;
  image_url?: string | null;

  cost_price: string;
  sale_price: string;

  stock: number;
  minimum_stock: number;

  unit:
    | "unit"
    | "bottle"
    | "can"
    | "box"
    | "case"
    | "liter"
    | "ml";

  is_alcohol: boolean;

  brand?: string | null;
  size_ml?: number | null;
  supplier_name?: string | null;

  is_active: boolean;
  is_low_stock?: boolean;
  profit_per_unit?: number | string;

  created_at?: string;
  updated_at?: string;
}

export interface CreateProductPayload {
  category?: number | null;

  name: string;
  barcode?: string;
  sku?: string;

  image?: File | string | null;

  cost_price: number | string;
  sale_price: number | string;

  stock?: number;
  minimum_stock?: number;

  unit?: Product["unit"];

  is_alcohol?: boolean;

  brand?: string;
  size_ml?: number | null;
  supplier_name?: string;

  is_active?: boolean;
}

export interface UpdateProductPayload extends Partial<CreateProductPayload> {}

export interface ProductFilters {
  category?: number;
  search?: string;
  is_active?: boolean;
}

type ProductPayload = CreateProductPayload | UpdateProductPayload | FormData;

export async function getProducts(filters?: ProductFilters) {
  const res = await api.get<Product[]>("/disco/products/", {
    params: filters,
  });

  return res.data;
}

export async function getProduct(id: number) {
  const res = await api.get<Product>(`/disco/products/${id}/`);
  return res.data;
}

export async function createProduct(payload: ProductPayload) {
  const res = await api.post<Product>("/disco/products/", payload);
  return res.data;
}

export async function updateProduct(id: number, payload: ProductPayload) {
  const res = await api.patch<Product>(`/disco/products/${id}/`, payload);
  return res.data;
}

export async function deleteProduct(id: number) {
  await api.delete(`/disco/products/${id}/`);
}

export async function getLowStockProducts() {
  const res = await api.get<Product[]>("/disco/products/low_stock/");
  return res.data;
}

export async function getProductsByCategory(categoryId: number) {
  return getProducts({
    category: categoryId,
    is_active: true,
  });
}

export async function searchProducts(search: string) {
  return getProducts({
    search,
    is_active: true,
  });
}

export async function getActiveProducts() {
  return getProducts({
    is_active: true,
  });
}

export async function updateProductStock(id: number, stock: number) {
  const res = await api.patch<Product>(`/disco/products/${id}/`, {
    stock,
  });

  return res.data;
}