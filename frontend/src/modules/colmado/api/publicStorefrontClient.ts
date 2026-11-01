import api from "../../../api/axios";

type ApiList<T> = T[] | { results: T[] };

export type PublicProductUnit = "unit" | "lb" | "kg" | "liter" | "portion";
export type PublicProductSaleMode = "unit" | "weight" | "amount";
export type PublicOrderStatus =
  | "new"
  | "preparing"
  | "ready"
  | "on_the_way"
  | "delivered"
  | "cancelled";

export interface PublicStorefront {
  slug: string;
  display_name: string;
  description: string;
  public_phone: string;
  public_address: string;
  delivery_fee: string;
  minimum_order: string;
  is_accepting_orders: boolean;
}

export interface PublicCatalogProduct {
  id: number;
  product_name: string;
  product_display_name: string;
  barcode: string | null;
  category: string;
  unit: PublicProductUnit;
  sale_mode: PublicProductSaleMode;
  sale_price: string;
  image_url: string | null;
}

export interface PublicOrderItem {
  id: number;
  inventory_item_id: number;
  product_name: string;
  barcode: string;
  unit: PublicProductUnit;
  quantity: string;
  unit_price: string;
  line_total: string;
}

export interface PublicCustomerOrder {
  order_number: string;
  store_name: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  latitude: string | null;
  longitude: string | null;
  delivery_notes: string;
  status: PublicOrderStatus;
  status_display: string;
  subtotal: string;
  delivery_fee: string;
  total: string;
  maps_url: string;
  accepted_at: string | null;
  ready_at: string | null;
  dispatched_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
  items: PublicOrderItem[];
}

export interface CreatePublicOrderLine {
  inventory_item_id: number;
  quantity: string;
}

export interface CreatePublicOrderPayload {
  idempotency_key: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  latitude?: string | null;
  longitude?: string | null;
  delivery_notes?: string;
  items: CreatePublicOrderLine[];
}

const listResults = <T>(data: ApiList<T>): T[] =>
  Array.isArray(data) ? data : data.results;

function storefrontPath(slug: string): string {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    throw new Error("La dirección pública del colmado es obligatoria.");
  }

  return `/colmado/public/storefronts/${encodeURIComponent(normalizedSlug)}`;
}

export function createOrderIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== "undefined"
    && typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return [
    "pedido",
    Date.now().toString(36),
    Math.random().toString(36).slice(2),
  ].join("-");
}

export async function getPublicStorefront(
  slug: string,
): Promise<PublicStorefront> {
  const response = await api.get<PublicStorefront>(
    `${storefrontPath(slug)}/`,
  );

  return response.data;
}

export async function getPublicStorefrontCatalog(
  slug: string,
): Promise<PublicCatalogProduct[]> {
  const response = await api.get<ApiList<PublicCatalogProduct>>(
    `${storefrontPath(slug)}/catalog/`,
  );

  return listResults(response.data);
}

export async function createPublicCustomerOrder(
  slug: string,
  payload: CreatePublicOrderPayload,
): Promise<PublicCustomerOrder> {
  const response = await api.post<PublicCustomerOrder>(
    `${storefrontPath(slug)}/orders/`,
    payload,
  );

  return response.data;
}

export async function getPublicCustomerOrder(
  slug: string,
  orderNumber: string,
  customerPhone: string,
): Promise<PublicCustomerOrder> {
  const normalizedOrderNumber = orderNumber.trim();
  const normalizedPhone = customerPhone.trim();

  if (!normalizedOrderNumber) {
    throw new Error("El número del pedido es obligatorio.");
  }
  if (!normalizedPhone) {
    throw new Error("El teléfono utilizado para hacer el pedido es obligatorio.");
  }

  const response = await api.get<PublicCustomerOrder>(
    `${storefrontPath(slug)}/orders/${encodeURIComponent(
      normalizedOrderNumber,
    )}/`,
    {
      params: {
        phone: normalizedPhone,
      },
    },
  );

  return response.data;
}
