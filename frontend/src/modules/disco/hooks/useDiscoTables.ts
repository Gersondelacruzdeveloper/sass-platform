// src/modules/disco/hooks/useDiscoTables.ts

import { useEffect, useMemo, useState } from "react";
import {
  getTables,
  createTable as createTableApi,
  updateTable as updateTableApi,
  deleteTable as deleteTableApi,
} from "../api/tablesApi";

export interface DiscoTable {
  id: number;
  name: string;
  floor?: string;
  capacity: number;
  minimum_spend: number | string;
  status: "available" | "occupied" | "reserved" | "cleaning" | "inactive" | string;
  is_vip: boolean;
  created_at?: string;
  updated_at?: string;
}

export type DiscoTablePayload = Partial<
  Omit<DiscoTable, "id" | "created_at" | "updated_at">
>;

export default function useDiscoTables() {
  const [tables, setTables] = useState<DiscoTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadTables() {
    try {
      setLoading(true);
      setError(null);

      const data = await getTables();
      setTables(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      console.error("Failed to load disco tables:", err);
      setError("Could not load tables.");
    } finally {
      setLoading(false);
    }
  }

  async function createTable(payload: DiscoTablePayload) {
    try {
      setSaving(true);
      setError(null);

      const created = await createTableApi(payload as any);
      setTables((prev) => [created as DiscoTable, ...prev]);

      return created;
    } catch (err) {
      console.error("Failed to create disco table:", err);
      setError("Could not create table.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function updateTable(id: number, payload: DiscoTablePayload) {
    try {
      setSaving(true);
      setError(null);

      const updated = await updateTableApi(id, payload as any);

      setTables((prev) =>
        prev.map((table) =>
          table.id === id ? (updated as DiscoTable) : table
        )
      );

      return updated;
    } catch (err) {
      console.error("Failed to update disco table:", err);
      setError("Could not update table.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function deleteTable(id: number) {
    try {
      setSaving(true);
      setError(null);

      await deleteTableApi(id);
      setTables((prev) => prev.filter((table) => table.id !== id));
    } catch (err) {
      console.error("Failed to delete disco table:", err);
      setError("Could not delete table.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadTables();
  }, []);

  const availableTables = useMemo(
    () => tables.filter((table) => table.status === "available"),
    [tables]
  );

  const occupiedTables = useMemo(
    () => tables.filter((table) => table.status === "occupied"),
    [tables]
  );

  const reservedTables = useMemo(
    () => tables.filter((table) => table.status === "reserved"),
    [tables]
  );

  const vipTables = useMemo(
    () => tables.filter((table) => table.is_vip),
    [tables]
  );

  return {
    tables,
    availableTables,
    occupiedTables,
    reservedTables,
    vipTables,

    loading,
    saving,
    error,

    loadTables,
    refresh: loadTables,
    refreshTables: loadTables,

    createTable,
    updateTable,
    deleteTable,
  };
}

export { useDiscoTables };