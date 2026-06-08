import api from "../../../api/axios";

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

export interface DiscoReservation {
  id: number;
  organisation: number;

  table: number | null;
  table_name?: string | null;

  customer_name: string;
  customer_phone: string;

  people_count: number;
  reservation_datetime: string;

  deposit_amount: string;
  status: ReservationStatus;

  note: string;
  created_by?: number | null;
  created_by_name?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface CreateReservationPayload {
  table?: number | null;
  customer_name: string;
  customer_phone?: string;
  people_count: number;
  reservation_datetime: string;
  deposit_amount?: number | string;
  status?: ReservationStatus;
  note?: string;
}

export interface UpdateReservationPayload
  extends Partial<CreateReservationPayload> {}

export async function getReservations() {
  const res = await api.get<DiscoReservation[]>("/disco/reservations/");
  return res.data;
}

export async function getReservation(id: number) {
  const res = await api.get<DiscoReservation>(
    `/disco/reservations/${id}/`
  );
  return res.data;
}

export async function createReservation(
  payload: CreateReservationPayload
) {
  const res = await api.post<DiscoReservation>(
    "/disco/reservations/",
    payload
  );
  return res.data;
}

export async function updateReservation(
  id: number,
  payload: UpdateReservationPayload
) {
  const res = await api.patch<DiscoReservation>(
    `/disco/reservations/${id}/`,
    payload
  );
  return res.data;
}

export async function deleteReservation(id: number) {
  await api.delete(`/disco/reservations/${id}/`);
}

export async function getPendingReservations() {
  const res = await api.get<DiscoReservation[]>("/disco/reservations/", {
    params: { status: "pending" },
  });
  return res.data;
}

export async function confirmReservation(id: number) {
  const res = await api.patch<DiscoReservation>(
    `/disco/reservations/${id}/`,
    { status: "confirmed" }
  );
  return res.data;
}

export async function cancelReservation(id: number) {
  const res = await api.patch<DiscoReservation>(
    `/disco/reservations/${id}/`,
    { status: "cancelled" }
  );
  return res.data;
}

export async function completeReservation(id: number) {
  const res = await api.patch<DiscoReservation>(
    `/disco/reservations/${id}/`,
    { status: "completed" }
  );
  return res.data;
}