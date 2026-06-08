import api from "../../../api/axios";

export type StockMovementType = "in" | "out" | "adjustment" | "loss";

export interface StockMovement {
  id: number;
  organisation: number;

  product: number;
  product_name?: string;

  movement_type: StockMovementType;
  quantity: number;
  note: string;

  created_by?: number | null;
  created_by_name?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface CreateStockMovementPayload {
  product: number;
  movement_type: StockMovementType;
  quantity: number;
  note?: string;
}

export interface UpdateStockMovementPayload
  extends Partial<CreateStockMovementPayload> {}

export async function getStockMovements() {
  const res = await api.get<StockMovement[]>("/disco/stock-movements/");
  return res.data;
}

export async function getStockMovement(id: number) {
  const res = await api.get<StockMovement>(
    `/disco/stock-movements/${id}/`
  );
  return res.data;
}

export async function createStockMovement(
  payload: CreateStockMovementPayload
) {
  const res = await api.post<StockMovement>(
    "/disco/stock-movements/",
    payload
  );
  return res.data;
}

export async function updateStockMovement(
  id: number,
  payload: UpdateStockMovementPayload
) {
  const res = await api.patch<StockMovement>(
    `/disco/stock-movements/${id}/`,
    payload
  );
  return res.data;
}

export async function deleteStockMovement(id: number) {
  await api.delete(`/disco/stock-movements/${id}/`);
}

export async function getStockMovementsByProduct(productId: number) {
  const res = await api.get<StockMovement[]>("/disco/stock-movements/", {
    params: { product: productId },
  });
  return res.data;
}

export async function getStockMovementsByType(
  movementType: StockMovementType
) {
  const res = await api.get<StockMovement[]>("/disco/stock-movements/", {
    params: { movement_type: movementType },
  });
  return res.data;
}