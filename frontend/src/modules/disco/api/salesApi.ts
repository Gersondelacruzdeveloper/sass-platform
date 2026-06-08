import api from "../../../api/axios";

export type PaymentMethod = "cash" | "card" | "transfer" | "mixed";
export type SaleStatus = "paid" | "pending" | "cancelled";
export type SaleType = "bar" | "table" | "takeaway" | "entry";

export interface SaleItemPayload {
  product_id: number;
  quantity: number;
}

export interface SaleItem {
  id: number;
  product: number;
  product_name?: string;
  quantity: number;
  unit_price: string;
  unit_cost: string;
  total: string;
  profit?: number;
}

export interface Sale {
  id: number;
  organisation: number;

  receipt_number: string;
  payment_method: PaymentMethod;
  status: SaleStatus;
  sale_type: SaleType;

  customer_name: string;
  table: number | null;
  table_number: string;

  cash_shift: number | null;
  waiter: number | null;
  bartender: number | null;

  subtotal: string;
  discount: string;
  tax: string;
  total: string;

  created_by?: number | null;
  created_by_name?: string | null;

  sale_items?: SaleItem[];

  created_at?: string;
  updated_at?: string;
}

export interface CreateSalePayload {
  payment_method: PaymentMethod;
  status?: SaleStatus;
  sale_type?: SaleType;

  customer_name?: string;
  table?: number | null;
  table_number?: string;

  cash_shift?: number | null;
  waiter?: number | null;
  bartender?: number | null;

  discount?: number | string;
  tax?: number | string;

  items: SaleItemPayload[];
}

export interface UpdateSalePayload extends Partial<CreateSalePayload> {}

export async function getSales() {
  const res = await api.get<Sale[]>("/disco/sales/");
  return res.data;
}

export async function getSale(id: number) {
  const res = await api.get<Sale>(`/disco/sales/${id}/`);
  return res.data;
}

export async function createSale(payload: CreateSalePayload) {
  const res = await api.post<Sale>("/disco/sales/", payload);
  return res.data;
}

export async function updateSale(id: number, payload: UpdateSalePayload) {
  const res = await api.patch<Sale>(`/disco/sales/${id}/`, payload);
  return res.data;
}

export async function deleteSale(id: number) {
  await api.delete(`/disco/sales/${id}/`);
}

export async function cancelSale(id: number) {
  const res = await api.patch<Sale>(`/disco/sales/${id}/`, {
    status: "cancelled",
  });

  return res.data;
}

export async function markSaleAsPaid(id: number) {
  const res = await api.patch<Sale>(`/disco/sales/${id}/`, {
    status: "paid",
  });

  return res.data;
}

export async function getSalesByCashShift(cashShiftId: number) {
  const res = await api.get<Sale[]>("/disco/sales/", {
    params: { cash_shift: cashShiftId },
  });

  return res.data;
}