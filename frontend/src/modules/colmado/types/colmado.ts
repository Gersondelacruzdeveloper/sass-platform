export type ProductUnit = "unit" | "lb" | "kg" | "liter" | "portion";

export type SaleMode = "unit" | "weight" | "amount";

export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

export type SaleStatus = "completed" | "voided";

export type CashRegisterStatus = "open" | "closed";

export type ColmadoSection =
  | "inicio"
  | "vender"
  | "inventario"
  | "pedidos"
  | "fiado"
  | "caja";

export interface Store {
  id: number;
  name: string;
  address: string;
  phone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: number;
  store: number;
  master_product: number;
  product_name: string;
  product_display_name: string;
  barcode: string | null;
  brand: string;
  presentation: string;
  category: string;
  unit: ProductUnit;
  sale_mode: SaleMode;
  units_per_case: number;
  image_url: string | null;
  cost_price: string;
  sale_price: string;
  quantity: string;
  reorder_level: string;
  low_stock: boolean;
  stock_value: string;
  profit_per_unit: string;
  is_quick_sale: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address: string;
  notes: string;
  credit_limit: string;
  balance: string;
  available_credit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaleLineInput {
  inventory_item_id: number;
  quantity: string;
}

export interface CreateSalePayload {
  store_id: number;
  payment_method: PaymentMethod;
  customer_id?: number;
  credit_due_date?: string;
  discount?: string;
  amount_received?: string;
  items: SaleLineInput[];
}

export interface SaleItem {
  id: number;
  inventory_item_id: number;
  product_name: string;
  barcode: string;
  unit: ProductUnit;
  quantity: string;
  unit_price: string;
  unit_cost: string;
  line_total: string;
  profit: string;
}

export interface Sale {
  id: number;
  receipt_number: string;
  store: number;
  store_name: string;
  cashier: number;
  cashier_name: string;
  customer: number | null;
  customer_name: string | null;
  cash_register_session: number | null;
  cash_register_session_number: string | null;
  payment_method: PaymentMethod;
  payment_method_display: string;
  subtotal: string;
  discount: string;
  total: string;
  amount_received: string;
  change_due: string;
  profit: string;
  status: SaleStatus;
  status_display: string;
  credit_due_date: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  items: SaleItem[];
}

export interface CashRegisterSession {
  id: number;
  session_number: string;
  store: number;
  store_name: string;
  opened_by: number;
  opened_by_name: string;
  closed_by: number | null;
  closed_by_name: string | null;
  status: CashRegisterStatus;
  status_display: string;
  opening_amount: string;
  cash_sales: string;
  expected_cash: string;
  counted_cash: string | null;
  difference: string | null;
  note: string;
  opened_at: string;
  closed_at: string | null;
  updated_at: string;
}

export interface DashboardSummary {
  sale_count: number;
  revenue: string;
  discounts: string;
  cost_of_goods: string;
  gross_profit: string;
  operating_expenses: string;
  payroll: string;
  net_profit: string;
  is_profitable: boolean;
  outstanding_credit: string;
  low_stock_count: number;
  new_orders: number;
  active_orders: number;
}

export interface DashboardComparison {
  previous_date: string;
  previous_revenue: string;
  change_amount: string;
  change_percent: string | null;
}

export interface DashboardLowStockItem {
  inventory_item_id: number;
  store_id: number;
  store_name: string;
  product_name: string;
  barcode: string | null;
  quantity: string;
  reorder_level: string;
}

export interface DashboardPaymentTotal {
  amount: string;
  count: number;
}

export interface DashboardOrder {
  id: number;
  order_number: string;
  store_id: number;
  store_name: string;
  customer_name: string;
  status: string;
  status_display: string;
  total: string;
  created_at: string;
}

export interface DashboardTopProduct {
  product_name: string;
  quantity_sold: string;
  sales_total: string;
}

export interface DashboardStoreComparison {
  store_id: number;
  store_name: string;
  sale_count: number;
  revenue: string;
  gross_profit: string;
}

export interface DashboardData {
  date: string;
  store: { id: number; name: string } | null;
  summary: DashboardSummary;
  comparison: DashboardComparison;
  payments: Record<PaymentMethod, DashboardPaymentTotal>;
  low_stock: DashboardLowStockItem[];
  orders: DashboardOrder[];
  top_products: DashboardTopProduct[];
  stores: DashboardStoreComparison[];
}

export interface ApiFieldErrors {
  [field: string]: string | string[] | ApiFieldErrors;
}
