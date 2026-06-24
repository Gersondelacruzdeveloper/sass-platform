// src/modules/disco/hooks/useDiscoDashboard.ts

import { useEffect, useState } from "react";
import { getDiscoDashboard } from "../api/discoApi";

export interface DiscoDashboardStats {
  sales_today: number;
  sales_this_month: number;
  sales_month: number;

  subtotal_today: number;
  subtotal_this_month: number;

  discount_today: number;
  discount_this_month: number;

  tax_today: number;
  tax_this_month: number;

  product_cost_today: number;
  product_cost_this_month: number;

  gross_profit_today: number;
  gross_profit_this_month: number;

  expenses_today: number;
  expenses_this_month: number;
  expenses_month: number;

  payroll_today: number;
  payroll_this_month: number;

  net_profit_today: number;
  net_profit_this_month: number;
  net_profit_month: number;

  orders_today: number;

  low_stock_products: number;
  low_stock_count: number;

  total_products: number;
  products_count: number;

  open_tables: number;
  reserved_tables: number;
  active_employees: number;
  pending_reservations: number;
  open_cash_shifts: number;

  tax_percentage: string | number;
  currency_symbol: string;
}

export interface DiscoDashboardActivity {
  id: number;
  action: string;
  description: string;
  user_name?: string;
  created_at: string;
}

export interface DiscoDashboardLowStockProduct {
  id: number;
  name: string;
  stock: number;
  minimum_stock: number;
  unit: string;
}

export interface DiscoDashboardReservation {
  id: number;
  customer_name: string;
  customer_phone?: string;
  people_count: number;
  reservation_datetime: string;
  status: string;
  table_name?: string;
}

export interface DiscoDashboardData {
  stats: DiscoDashboardStats;
  recent_activity: DiscoDashboardActivity[];
  low_stock: DiscoDashboardLowStockProduct[];
  pending_reservations: DiscoDashboardReservation[];
  sales_chart?: any[];

  // Also expose the most important fields at dashboard level,
  // because some pages read dashboard.currency_symbol directly.
  tax_percentage: string | number;
  currency_symbol: string;
}

function n(value: any) {
  return Number(value || 0);
}

const emptyStats: DiscoDashboardStats = {
  sales_today: 0,
  sales_this_month: 0,
  sales_month: 0,

  subtotal_today: 0,
  subtotal_this_month: 0,

  discount_today: 0,
  discount_this_month: 0,

  tax_today: 0,
  tax_this_month: 0,

  product_cost_today: 0,
  product_cost_this_month: 0,

  gross_profit_today: 0,
  gross_profit_this_month: 0,

  expenses_today: 0,
  expenses_this_month: 0,
  expenses_month: 0,

  payroll_today: 0,
  payroll_this_month: 0,

  net_profit_today: 0,
  net_profit_this_month: 0,
  net_profit_month: 0,

  orders_today: 0,

  low_stock_products: 0,
  low_stock_count: 0,

  total_products: 0,
  products_count: 0,

  open_tables: 0,
  reserved_tables: 0,
  active_employees: 0,
  pending_reservations: 0,
  open_cash_shifts: 0,

  tax_percentage: "0.00",
  currency_symbol: "RD$",
};

const emptyDashboard: DiscoDashboardData = {
  stats: emptyStats,
  recent_activity: [],
  low_stock: [],
  pending_reservations: [],
  sales_chart: [],
  tax_percentage: "0.00",
  currency_symbol: "RD$",
};

function normalizeDashboard(data: any): DiscoDashboardData {
  const sourceStats = data?.stats || data || {};

  const currencySymbol =
    sourceStats.currency_symbol ||
    data?.currency_symbol ||
    "RD$";

  const taxPercentage =
    sourceStats.tax_percentage ||
    data?.tax_percentage ||
    "0.00";

  const stats: DiscoDashboardStats = {
    ...emptyStats,

    sales_today: n(sourceStats.sales_today),
    sales_this_month: n(
      sourceStats.sales_this_month ||
        sourceStats.sales_month
    ),
    sales_month: n(
      sourceStats.sales_month ||
        sourceStats.sales_this_month
    ),

    subtotal_today: n(sourceStats.subtotal_today),
    subtotal_this_month: n(sourceStats.subtotal_this_month),

    discount_today: n(sourceStats.discount_today),
    discount_this_month: n(sourceStats.discount_this_month),

    tax_today: n(sourceStats.tax_today),
    tax_this_month: n(sourceStats.tax_this_month),

    product_cost_today: n(sourceStats.product_cost_today),
    product_cost_this_month: n(sourceStats.product_cost_this_month),

    gross_profit_today: n(sourceStats.gross_profit_today),
    gross_profit_this_month: n(sourceStats.gross_profit_this_month),

    expenses_today: n(sourceStats.expenses_today),
    expenses_this_month: n(
      sourceStats.expenses_this_month ||
        sourceStats.expenses_month
    ),
    expenses_month: n(
      sourceStats.expenses_month ||
        sourceStats.expenses_this_month
    ),

    payroll_today: n(sourceStats.payroll_today),
    payroll_this_month: n(sourceStats.payroll_this_month),

    net_profit_today: n(sourceStats.net_profit_today),
    net_profit_this_month: n(
      sourceStats.net_profit_this_month ||
        sourceStats.net_profit_month ||
        sourceStats.net_profit
    ),
    net_profit_month: n(
      sourceStats.net_profit_month ||
        sourceStats.net_profit_this_month ||
        sourceStats.net_profit
    ),

    orders_today: n(sourceStats.orders_today),

    low_stock_products: n(
      sourceStats.low_stock_products ||
        sourceStats.low_stock_count
    ),
    low_stock_count: n(
      sourceStats.low_stock_count ||
        sourceStats.low_stock_products
    ),

    total_products: n(
      sourceStats.total_products ||
        sourceStats.products_count
    ),
    products_count: n(
      sourceStats.products_count ||
        sourceStats.total_products
    ),

    open_tables: n(sourceStats.open_tables),
    reserved_tables: n(sourceStats.reserved_tables),
    active_employees: n(sourceStats.active_employees),
    pending_reservations: n(sourceStats.pending_reservations),
    open_cash_shifts: n(sourceStats.open_cash_shifts),

    tax_percentage: taxPercentage,
    currency_symbol: currencySymbol,
  };

  return {
    ...emptyDashboard,

    stats,

    recent_activity:
      data?.recent_activity ||
      data?.recentActivity ||
      [],

    low_stock:
      data?.low_stock ||
      data?.low_stock_products ||
      [],

    pending_reservations:
      data?.pending_reservations_list ||
      data?.pending_reservations_data ||
      data?.pending_reservations_items ||
      data?.pending_reservations ||
      [],

    sales_chart: data?.sales_chart || [],

    tax_percentage: taxPercentage,
    currency_symbol: currencySymbol,
  };
}

export default function useDiscoDashboard() {
  const [dashboard, setDashboard] =
    useState<DiscoDashboardData>(emptyDashboard);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    try {
      setLoading(true);
      setError(null);

      const data = await getDiscoDashboard();
      setDashboard(normalizeDashboard(data));
    } catch (err) {
      console.error("Failed to load Disco dashboard:", err);
      setError("Could not load dashboard data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  return {
    dashboard,
    stats: dashboard.stats,
    recentActivity: dashboard.recent_activity,
    lowStock: dashboard.low_stock,
    pendingReservations: dashboard.pending_reservations,

    loading,
    error,

    refreshDashboard: loadDashboard,
  };
}

export { useDiscoDashboard };
