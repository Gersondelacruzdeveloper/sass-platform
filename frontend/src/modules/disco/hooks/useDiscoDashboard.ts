// src/modules/disco/hooks/useDiscoDashboard.ts

import { useEffect, useState } from "react";
import { getDiscoDashboard } from "../api/discoApi";

export interface DiscoDashboardStats {
  sales_today: number;
  sales_month: number;
  expenses_today: number;
  expenses_month: number;
  net_profit_today: number;
  net_profit_month: number;
  low_stock_products: number;
  total_products: number;
  open_tables: number;
  reserved_tables: number;
  active_employees: number;
  pending_reservations: number;
  open_cash_shifts: number;
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
}

const emptyDashboard: DiscoDashboardData = {
  stats: {
    sales_today: 0,
    sales_month: 0,
    expenses_today: 0,
    expenses_month: 0,
    net_profit_today: 0,
    net_profit_month: 0,
    low_stock_products: 0,
    total_products: 0,
    open_tables: 0,
    reserved_tables: 0,
    active_employees: 0,
    pending_reservations: 0,
    open_cash_shifts: 0,
  },
  recent_activity: [],
  low_stock: [],
  pending_reservations: [],
};

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
      setDashboard({
        ...emptyDashboard,
        ...data,
        stats: {
          ...emptyDashboard.stats,
          ...(data?.stats || {}),
        },
      });
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