import axios from "axios";

import api from "../../../api/axios";
import type {
  CashRegisterSession,
  CreateSalePayload,
  Customer,
  DashboardData,
  InventoryItem,
  Sale,
  Store,
} from "../types/colmado";

type ApiList<T> = T[] | { results: T[] };

export interface InventoryFilters {
  store: number;
  search?: string;
  barcode?: string;
  quickSale?: boolean;
  lowStock?: boolean;
}

export interface OpenCashRegisterPayload {
  store_id: number;
  opening_amount: string;
  note?: string;
}

export interface CloseCashRegisterPayload {
  counted_cash: string;
  note?: string;
}

export interface CreateCustomerPayload {
  name: string;
  phone?: string;
  address?: string;
  notes?: string;
  credit_limit?: string;
  is_active?: boolean;
}

export interface CreditTransaction {
  id: number;
  customer: number;
  customer_name: string;
  store: number;
  store_name: string;
  sale: number | null;
  created_by: number;
  created_by_name: string;
  transaction_type: "charge" | "payment";
  transaction_type_display: string;
  amount: string;
  balance_after: string;
  note: string;
  created_at: string;
}

export interface RecordCreditPaymentPayload {
  store_id: number;
  amount: string;
  note?: string;
}

export interface CreditPaymentResult {
  customer: Customer;
  transaction: CreditTransaction;
}

export type CustomerOrderStatus =
  | "new"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface CustomerOrderItem {
  id: number;
  inventory_item_id: number;
  product_name: string;
  barcode: string;
  unit: "unit" | "lb" | "kg" | "liter" | "portion";
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface CustomerOrder {
  id: number;
  order_number: string;
  store: number;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  latitude: string | null;
  longitude: string | null;
  delivery_notes: string;
  status: CustomerOrderStatus;
  status_display: string;
  subtotal: string;
  delivery_fee: string;
  total: string;
  inventory_committed: boolean;
  maps_url: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items: CustomerOrderItem[];
}

export interface CustomerOrderFilters {
  store: number;
  status?: CustomerOrderStatus;
  search?: string;
}

export interface CatalogProduct {
  id: number;
  internal_reference: string;
  barcode: string | null;
  name: string;
  brand: string;
  presentation: string;
  category: string;
  unit: "unit" | "lb" | "kg" | "liter" | "portion";
  sale_mode: "unit" | "weight" | "amount";
  units_per_case: number;
  image_url: string | null;
  display_name: string;
  is_active: boolean;
}

export interface InitialInventoryPayload {
  store_id: number;
  barcode: string;
  quantity: string;
  cost_price: string;
  sale_price: string;
  reorder_level?: string;
  is_quick_sale?: boolean;
}

export type InventoryAdjustmentReason =
  | "damaged"
  | "expired"
  | "loss"
  | "personal_use"
  | "correction";

const tenantHeaders = (organisationSlug: string) => ({
  "X-Organisation-Slug": organisationSlug,
});

const listResults = <T>(data: ApiList<T>): T[] =>
  Array.isArray(data) ? data : data.results;

export async function getStores(organisationSlug: string): Promise<Store[]> {
  const response = await api.get<ApiList<Store>>("/colmado/stores/", {
    headers: tenantHeaders(organisationSlug),
  });
  return listResults(response.data);
}

export async function getDashboard(
  organisationSlug: string,
  store?: number,
): Promise<DashboardData> {
  const response = await api.get<DashboardData>("/colmado/dashboard/", {
    headers: tenantHeaders(organisationSlug),
    params: store ? { store } : undefined,
  });
  return response.data;
}

export async function getInventory(
  organisationSlug: string,
  filters: InventoryFilters,
): Promise<InventoryItem[]> {
  const response = await api.get<ApiList<InventoryItem>>("/colmado/inventory/", {
    headers: tenantHeaders(organisationSlug),
    params: {
      store: filters.store,
      search: filters.search || undefined,
      barcode: filters.barcode || undefined,
      quick_sale: filters.quickSale ? "true" : undefined,
      low_stock: filters.lowStock ? "true" : undefined,
    },
  });
  return listResults(response.data);
}

export async function findCatalogProductByBarcode(
  organisationSlug: string,
  barcode: string,
): Promise<CatalogProduct> {
  const response = await api.get<CatalogProduct>(
    "/colmado/catalog/by-barcode/",
    {
      headers: tenantHeaders(organisationSlug),
      params: { barcode },
    },
  );
  return response.data;
}

export async function addInitialInventoryItem(
  organisationSlug: string,
  payload: InitialInventoryPayload,
): Promise<InventoryItem & { already_in_inventory: boolean }> {
  const response = await api.post<
    InventoryItem & { already_in_inventory: boolean }
  >("/colmado/inventory/initial-scan/", payload, {
    headers: tenantHeaders(organisationSlug),
  });
  return response.data;
}

export async function receiveInventoryCases(
  organisationSlug: string,
  inventoryItemId: number,
  cases: string,
): Promise<InventoryItem & { cases_received: string; units_added: string }> {
  const response = await api.post<
    InventoryItem & { cases_received: string; units_added: string }
  >(
    `/colmado/inventory/${inventoryItemId}/receive-cases/`,
    { cases },
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export async function adjustInventoryQuantity(
  organisationSlug: string,
  inventoryItemId: number,
  payload: {
    new_quantity: string;
    reason: InventoryAdjustmentReason;
    note?: string;
  },
): Promise<
  InventoryItem & {
    movement_id: number;
    quantity_change: string;
    adjustment_reason: InventoryAdjustmentReason;
  }
> {
  const response = await api.post<
    InventoryItem & {
      movement_id: number;
      quantity_change: string;
      adjustment_reason: InventoryAdjustmentReason;
    }
  >(`/colmado/inventory/${inventoryItemId}/adjust/`, payload, {
    headers: tenantHeaders(organisationSlug),
  });
  return response.data;
}

export async function getCustomers(
  organisationSlug: string,
  options: { search?: string; hasDebt?: boolean } = {},
): Promise<Customer[]> {
  const response = await api.get<ApiList<Customer>>("/colmado/customers/", {
    headers: tenantHeaders(organisationSlug),
    params: {
      search: options.search || undefined,
      has_debt: options.hasDebt ? "true" : undefined,
    },
  });
  return listResults(response.data);
}

export async function createCustomer(
  organisationSlug: string,
  payload: CreateCustomerPayload,
): Promise<Customer> {
  const response = await api.post<Customer>("/colmado/customers/", payload, {
    headers: tenantHeaders(organisationSlug),
  });
  return response.data;
}

export async function updateCustomer(
  organisationSlug: string,
  customerId: number,
  payload: Partial<CreateCustomerPayload>,
): Promise<Customer> {
  const response = await api.patch<Customer>(
    `/colmado/customers/${customerId}/`,
    payload,
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export async function getCustomerCreditHistory(
  organisationSlug: string,
  customerId: number,
): Promise<CreditTransaction[]> {
  const response = await api.get<ApiList<CreditTransaction>>(
    `/colmado/customers/${customerId}/history/`,
    { headers: tenantHeaders(organisationSlug) },
  );
  return listResults(response.data);
}

export async function recordCreditPayment(
  organisationSlug: string,
  customerId: number,
  payload: RecordCreditPaymentPayload,
): Promise<CreditPaymentResult> {
  const response = await api.post<CreditPaymentResult>(
    `/colmado/customers/${customerId}/payments/`,
    payload,
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export async function getCustomerOrders(
  organisationSlug: string,
  filters: CustomerOrderFilters,
): Promise<CustomerOrder[]> {
  const response = await api.get<ApiList<CustomerOrder>>(
    "/colmado/customer-orders/",
    {
      headers: tenantHeaders(organisationSlug),
      params: {
        store: filters.store,
        status: filters.status || undefined,
        search: filters.search || undefined,
      },
    },
  );
  return listResults(response.data);
}

export async function changeCustomerOrderStatus(
  organisationSlug: string,
  orderId: number,
  orderStatus: CustomerOrderStatus,
): Promise<CustomerOrder> {
  const response = await api.post<CustomerOrder>(
    `/colmado/customer-orders/${orderId}/set-status/`,
    { status: orderStatus },
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export async function createSale(
  organisationSlug: string,
  payload: CreateSalePayload,
): Promise<Sale> {
  const response = await api.post<Sale>("/colmado/sales/", payload, {
    headers: tenantHeaders(organisationSlug),
  });
  return response.data;
}

export async function getCurrentCashRegister(
  organisationSlug: string,
  store: number,
): Promise<CashRegisterSession | null> {
  try {
    const response = await api.get<CashRegisterSession>(
      "/colmado/cash-registers/current/",
      {
        headers: tenantHeaders(organisationSlug),
        params: { store },
      },
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function openCashRegister(
  organisationSlug: string,
  payload: OpenCashRegisterPayload,
): Promise<CashRegisterSession> {
  const response = await api.post<CashRegisterSession>(
    "/colmado/cash-registers/open/",
    payload,
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export async function closeCashRegister(
  organisationSlug: string,
  cashRegisterId: number,
  payload: CloseCashRegisterPayload,
): Promise<CashRegisterSession> {
  const response = await api.post<CashRegisterSession>(
    `/colmado/cash-registers/${cashRegisterId}/close/`,
    payload,
    { headers: tenantHeaders(organisationSlug) },
  );
  return response.data;
}

export function getApiErrorMessage(
  error: unknown,
  fallback = "No pudimos completar la operación. Inténtalo otra vez.",
): string {
  if (!axios.isAxiosError(error)) {
    return fallback;
  }

  const data = error.response?.data;
  if (typeof data === "string" && data.trim()) {
    return data;
  }
  if (!data || typeof data !== "object") {
    return fallback;
  }

  const values = Object.values(data as Record<string, unknown>);
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === "string") {
      return value[0];
    }
  }
  return fallback;
}
