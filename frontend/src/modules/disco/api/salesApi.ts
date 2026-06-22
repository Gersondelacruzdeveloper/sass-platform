// src/modules/disco/api/salesApi.ts

import api from "../../../api/axios";

export type PaymentMethod = "cash" | "card" | "transfer" | "credit";

export type SaleStatus =
  | "completed"
  | "pending"
  | "cancelled"
  | "refunded";

export type SaleType =
  | "pos"
  | "table"
  | "delivery"
  | "entry_fee"
  | "vip"
  | "bottle_service";

export interface SaleItemPayload {
  product_id: number;
  quantity: number;
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
  profit?: number | string;
  created_at?: string;
}

export interface Sale {
  id: number;
  organisation: number;

  receipt_number?: string | null;
  payment_method: PaymentMethod;
  status: SaleStatus;
  sale_type: SaleType;

  customer_name?: string | null;
  table: number | null;
  table_name?: string | null;
  table_number?: string | null;

  cash_shift: number | null;
  waiter: number | null;
  waiter_name?: string | null;
  bartender: number | null;
  bartender_name?: string | null;

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

export interface OpenTableBillPayload {
  table_id: number;
  customer_name?: string;
  waiter_id?: number | null;
  bartender_id?: number | null;
}

export interface AddTableItemPayload {
  product_id: number;
  quantity: number;
}

export interface UpdateTableItemPayload {
  item_id: number;
  quantity: number;
}

export interface RemoveTableItemPayload {
  item_id: number;
}

export interface CheckoutTableBillPayload {
  payment_method: PaymentMethod;
  discount?: number | string;
  tax?: number | string;
}

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

export async function markSaleAsCompleted(id: number) {
  const res = await api.patch<Sale>(`/disco/sales/${id}/`, {
    status: "completed",
  });

  return res.data;
}

export async function getSalesByCashShift(cashShiftId: number) {
  const res = await api.get<Sale[]>("/disco/sales/", {
    params: { cash_shift: cashShiftId },
  });

  return res.data;
}

/**
 * TABLE BILL FLOW
 */

export async function getOpenTableBills() {
  const res = await api.get<Sale[]>("/disco/sales/open_bills/");
  return res.data;
}

export async function openTableBill(payload: OpenTableBillPayload) {
  const res = await api.post<Sale>("/disco/sales/open_table/", payload);
  return res.data;
}

export async function addItemToTableBill(
  saleId: number,
  payload: AddTableItemPayload
) {
  const res = await api.post<Sale>(
    `/disco/sales/${saleId}/add_item/`,
    payload
  );

  return res.data;
}

export async function updateTableBillItem(
  saleId: number,
  payload: UpdateTableItemPayload
) {
  const res = await api.post<Sale>(
    `/disco/sales/${saleId}/update_item/`,
    payload
  );

  return res.data;
}

export async function removeItemFromTableBill(
  saleId: number,
  payload: RemoveTableItemPayload
) {
  const res = await api.post<Sale>(
    `/disco/sales/${saleId}/remove_item/`,
    payload
  );

  return res.data;
}

export async function checkoutTableBill(
  saleId: number,
  payload: CheckoutTableBillPayload
) {
  const res = await api.post<Sale>(
    `/disco/sales/${saleId}/checkout/`,
    payload
  );

  return res.data;
}

export async function cancelTableBill(saleId: number) {
  const res = await api.post<Sale>(
    `/disco/sales/${saleId}/cancel_bill/`
  );

  return res.data;
}