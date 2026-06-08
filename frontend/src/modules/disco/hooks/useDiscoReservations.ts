// src/modules/disco/hooks/useDiscoReservations.ts

import { useEffect, useMemo, useState } from "react";
import {
  getReservations,
  createReservation as createReservationApi,
  updateReservation as updateReservationApi,
  deleteReservation as deleteReservationApi,
} from "../api/reservationsApi";

export interface DiscoReservation {
  id: number;
  table?: number | null;
  table_name?: string;
  customer_name: string;
  customer_phone?: string;
  people_count: number;
  reservation_datetime: string;
  deposit_amount: number | string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show" | string;
  note?: string;
  created_by?: number;
  created_by_name?: string;
  created_at?: string;
  updated_at?: string;
}

export type DiscoReservationPayload = Partial<
  Omit<
    DiscoReservation,
    | "id"
    | "table_name"
    | "created_by"
    | "created_by_name"
    | "created_at"
    | "updated_at"
  >
>;

export default function useDiscoReservations() {
  const [reservations, setReservations] = useState<DiscoReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReservations() {
    try {
      setLoading(true);
      setError(null);

      const data = await getReservations();
      setReservations(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error("Failed to load disco reservations:", err);
      setError("Could not load reservations.");
    } finally {
      setLoading(false);
    }
  }

  async function createReservation(payload: DiscoReservationPayload) {
    try {
      setSaving(true);
      setError(null);

      const created = await createReservationApi(payload as any);
      setReservations((prev) => [created as DiscoReservation, ...prev]);

      return created;
    } catch (err) {
      console.error("Failed to create disco reservation:", err);
      setError("Could not create reservation.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function updateReservation(
    id: number,
    payload: DiscoReservationPayload
  ) {
    try {
      setSaving(true);
      setError(null);

      const updated = await updateReservationApi(id, payload as any);

      setReservations((prev) =>
        prev.map((reservation) =>
          reservation.id === id ? (updated as DiscoReservation) : reservation
        )
      );

      return updated;
    } catch (err) {
      console.error("Failed to update disco reservation:", err);
      setError("Could not update reservation.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function deleteReservation(id: number) {
    try {
      setSaving(true);
      setError(null);

      await deleteReservationApi(id);

      setReservations((prev) =>
        prev.filter((reservation) => reservation.id !== id)
      );
    } catch (err) {
      console.error("Failed to delete disco reservation:", err);
      setError("Could not delete reservation.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadReservations();
  }, []);

  const pendingReservations = useMemo(
    () => reservations.filter((reservation) => reservation.status === "pending"),
    [reservations]
  );

  const confirmedReservations = useMemo(
    () =>
      reservations.filter((reservation) => reservation.status === "confirmed"),
    [reservations]
  );

  const todayReservations = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    return reservations.filter((reservation) =>
      reservation.reservation_datetime?.startsWith(today)
    );
  }, [reservations]);

  return {
    reservations,
    pendingReservations,
    confirmedReservations,
    todayReservations,

    loading,
    saving,
    error,

    loadReservations,
    refresh: loadReservations,
    refreshReservations: loadReservations,

    createReservation,
    updateReservation,
    deleteReservation,
  };
}

export { useDiscoReservations };