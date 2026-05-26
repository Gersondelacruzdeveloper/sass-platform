export interface Category {
  id: number;
  organisation: number;
  name: string;
}

export interface Product {
  id: number;
  organisation: number;
  category?: number | null;
  name: string;
  barcode?: string | null;
  cost_price: string;
  sale_price: string;
  stock: number;
  minimum_stock: number;
  is_active: boolean;
  profit_per_unit?: string;
}

export interface StockMovement {
  id: number;
  organisation: number;
  product: number;
  movement_type: "in" | "out" | "adjustment" | "loss";
  quantity: number;
  note?: string | null;
  created_by?: number | null;
  created_at: string;
}

export interface Sale {
  id: number;
  organisation: number;
  payment_method: "cash" | "card" | "transfer" | "credit";
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  created_by?: number | null;
  created_at: string;
  items?: SaleItem[];
}

export interface SaleItem {
  id: number;
  sale: number;
  product: number;
  quantity: number;
  unit_price: string;
  unit_cost: string;
  total: string;
  profit?: string;
}

export interface Expense {
  id: number;
  organisation: number;
  title: string;
  category?: string | null;
  amount: string;
  note?: string | null;
  created_by?: number | null;
  created_at: string;
}