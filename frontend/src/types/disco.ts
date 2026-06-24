export interface Category {
  id: number;
  organisation: number;
  name: string;
}

export interface Product {
  id: number;
  organisation: number;
  category?: number | null;
  category_name?: string | null;

  name: string;
  barcode?: string | null;
  sku?: string | null;

  image?: string | null;
  image_url?: string | null;

  cost_price: string;
  sale_price: string;

  stock: number;
  minimum_stock: number;

  unit?: string;
  is_alcohol?: boolean;

  brand?: string | null;
  size_ml?: number | null;
  supplier_name?: string | null;

  is_active: boolean;

  is_low_stock?: boolean;
  profit_per_unit?: string;

  created_at?: string;
  updated_at?: string;
}

export interface StockMovement {
  id: number;
  organisation: number;
  product: number;
  product_name?: string;

  movement_type: "in" | "out" | "adjustment" | "loss";
  quantity: number;
  note?: string | null;

  created_by?: number | null;
  created_by_name?: string | null;

  created_at: string;
  updated_at?: string;
}

export interface SaleItem {
  id: number;
  sale: number;
  product: number;
  product_name?: string;

  quantity: number;

  unit_price: string;
  unit_cost: string;
  total: string;

  profit?: string;
  created_at?: string;
}

export interface Sale {
  id: number;
  organisation: number;

  receipt_number?: string | null;

  payment_method: "cash" | "card" | "transfer" | "credit";
  status?: "completed" | "pending" | "cancelled" | "refunded";

  sale_type?: "pos" | "table" | "delivery" | "entry_fee" | "vip" | "bottle_service";

  customer_name?: string | null;

  table?: number | null;
  table_name?: string | null;
  table_number?: string | null;

  cash_shift?: number | null;

  waiter?: number | null;
  waiter_name?: string | null;

  bartender?: number | null;
  bartender_name?: string | null;

  subtotal: string;
  discount: string;
  tax: string;
  total: string;

  created_by?: number | null;
  created_by_name?: string | null;

  /**
   * Backend reads completed sales using sale_items.
   * Direct POS create payload sends items.
   */
  sale_items?: SaleItem[];
  items?: SaleItem[];

  /**
   * Financial calculated fields.
   * These will come from backend serializers/reports.
   */
  product_cost_total?: string;
  gross_profit?: string;
  net_profit?: string;

  created_at: string;
  updated_at?: string;
}

export interface SaleCreateItem {
  product_id: number;
  quantity: number;
}

export interface SaleCreatePayload {
  payment_method: "cash" | "card" | "transfer" | "credit";
  sale_type?: "pos" | "table" | "delivery" | "entry_fee" | "vip" | "bottle_service";
  customer_name?: string | null;
  table_number?: string | null;
  discount?: string | number;
  tax?: string | number;
  items: SaleCreateItem[];
}

export interface Expense {
  id: number;
  organisation: number;

  title: string;
  category?: string | null;
  amount: string;
  note?: string | null;

  created_by?: number | null;
  created_by_name?: string | null;

  created_at: string;
  updated_at?: string;
}

export interface DiscoEmployee {
  id: number;
  organisation: number;

  user?: number | null;
  username?: string | null;
  email?: string | null;

  full_name: string;
  role:
    | "owner"
    | "manager"
    | "cashier"
    | "bartender"
    | "waiter"
    | "security"
    | "host"
    | "promoter"
    | "inventory_manager";

  phone?: string | null;

  /**
   * Needed for daily payroll calculation.
   */
  daily_pay?: string;

  is_active: boolean;

  profile_image_url?: string | null;
  user_avatar_url?: string | null;
  employee_photo_url?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface DiscoSettings {
  id: number;
  organisation: number;

  tax_percentage: string;
  currency_symbol: string;

  created_at?: string;
  updated_at?: string;
}

export interface DiscoDashboard {
  sales_today: string | number;
  sales_this_month: string | number;
  sales_month?: string | number;

  expenses_today?: string | number;
  expenses_this_month: string | number;

  payroll_today?: string | number;
  payroll_this_month?: string | number;

  product_cost_today?: string | number;
  product_cost_this_month?: string | number;

  gross_profit_today?: string | number;
  gross_profit_this_month?: string | number;

  net_profit_today?: string | number;
  net_profit_this_month: string | number;
  net_profit_month?: string | number;

  orders_today: number;

  products_count: number;
  low_stock_count: number;

  open_tables: number;
  reserved_tables: number;

  active_employees: number;
  pending_reservations: number;
  open_cash_shifts: number;

  tax_percentage?: string | number;
  currency_symbol?: string;

  sales_chart?: Array<{
    date: string;
    label: string;
    total: number;
    orders: number;
  }>;
}

export interface DiscoFinancialReport {
  start_date: string;
  end_date: string;

  sales_total: string | number;
  product_cost_total: string | number;
  gross_profit: string | number;

  expenses_total: string | number;
  payroll_total: string | number;

  net_profit: string | number;

  orders_count: number;

  tax_total?: string | number;
  discount_total?: string | number;
}