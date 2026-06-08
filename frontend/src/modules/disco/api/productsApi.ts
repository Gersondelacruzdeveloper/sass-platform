import api from "../../../api/axios";

export interface Product {
  id: number;
  organisation: number;

  category: number | null;
  category_name?: string;

  name: string;
  barcode: string;
  sku: string;

  image?: string | null;

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

  brand: string;
  size_ml: number | null;
  supplier_name: string;

  is_active: boolean;
  is_low_stock?: boolean;
  profit_per_unit?: number;

  created_at?: string;
  updated_at?: string;
}

export interface CreateProductPayload {
  category?: number | null;

  name: string;
  barcode?: string;
  sku?: string;

  image?: string;

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

export interface UpdateProductPayload
  extends Partial<CreateProductPayload> {}

export async function getProducts() {
  const res = await api.get<Product[]>("/disco/products/");
  return res.data;
}

export async function getProduct(id: number) {
  const res = await api.get<Product>(
    `/disco/products/${id}/`
  );

  return res.data;
}

export async function createProduct(
  payload: CreateProductPayload
) {
  const res = await api.post<Product>(
    "/disco/products/",
    payload
  );

  return res.data;
}

export async function updateProduct(
  id: number,
  payload: UpdateProductPayload
) {
  const res = await api.patch<Product>(
    `/disco/products/${id}/`,
    payload
  );

  return res.data;
}

export async function deleteProduct(id: number) {
  await api.delete(`/disco/products/${id}/`);
}

export async function getLowStockProducts() {
  const res = await api.get<Product[]>("/disco/products/", {
    params: {
      low_stock: true,
    },
  });

  return res.data;
}

export async function getProductsByCategory(
  categoryId: number
) {
  const res = await api.get<Product[]>("/disco/products/", {
    params: {
      category: categoryId,
    },
  });

  return res.data;
}

export async function searchProducts(search: string) {
  const res = await api.get<Product[]>("/disco/products/", {
    params: {
      search,
    },
  });

  return res.data;
}

export async function updateProductStock(
  id: number,
  stock: number
) {
  const res = await api.patch<Product>(
    `/disco/products/${id}/`,
    {
      stock,
    }
  );

  return res.data;
}