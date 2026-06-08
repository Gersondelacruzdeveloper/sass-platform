import api from "../../../api/axios";

export interface DiscoDashboardStats {
  sales_today: number;
  sales_month: number;
  expenses_today: number;
  expenses_month: number;
  net_profit_today: number;
  net_profit_month: number;
  low_stock_count: number;
  open_tables_count: number;
  reserved_tables_count: number;
  employees_count: number;
  pending_reservations_count: number;
  open_cash_shifts_count: number;
}

export interface DiscoActivityLog {
  id: number;
  action: string;
  description: string;
  user_name?: string | null;
  created_at: string;
}

export async function getDiscoDashboard() {
  const res = await api.get<DiscoDashboardStats>("/disco/dashboard/");
  return res.data;
}

export async function getDiscoActivityLogs() {
  const res = await api.get<DiscoActivityLog[]>("/disco/activity-logs/");
  return res.data;
}