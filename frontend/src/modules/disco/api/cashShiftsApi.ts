import api from "../../../api/axios";

export type CashShiftStatus = "open" | "closed";

export interface CashShift {
  id: number;
  organisation: number;
  opened_by: number | null;
  opened_by_name?: string | null;
  closed_by: number | null;
  closed_by_name?: string | null;
  opening_cash: string;
  closing_cash: string | null;
  opened_at: string;
  closed_at: string | null;
  is_open: boolean;
}

export interface CreateCashShiftPayload {
  opening_cash: number | string;
}

export interface CloseCashShiftPayload {
  closing_cash: number | string;
}

export async function getCashShifts() {
  const res = await api.get<CashShift[]>("/disco/cash-shifts/");
  return res.data;
}

export async function getOpenCashShifts() {
  const res = await api.get<CashShift[]>("/disco/cash-shifts/", {
    params: { is_open: true },
  });
  return res.data;
}

export async function createCashShift(payload: CreateCashShiftPayload) {
  const res = await api.post<CashShift>("/disco/cash-shifts/", payload);
  return res.data;
}

export async function closeCashShift(
  id: number,
  payload: CloseCashShiftPayload
) {
  const res = await api.patch<CashShift>(`/disco/cash-shifts/${id}/`, {
    ...payload,
    is_open: false,
  });

  return res.data;
}

export async function updateCashShift(
  id: number,
  payload: Partial<CashShift>
) {
  const res = await api.patch<CashShift>(
    `/disco/cash-shifts/${id}/`,
    payload
  );

  return res.data;
}

export async function deleteCashShift(id: number) {
  await api.delete(`/disco/cash-shifts/${id}/`);
}