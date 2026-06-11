// src/modules/disco/hooks/useDiscoSales.ts

import { useEffect, useState } from "react";
import {
  getSales,
  createSale as createSaleApi,
  updateSale as updateSaleApi,
  deleteSale as deleteSaleApi,
} from "../api/salesApi";

export default function useDiscoSales() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadSales() {
    try {
      setLoading(true);
      setError(null);

      const data = await getSales();
      // getSales may return an array or an object with a `results` field
      const results = Array.isArray(data) ? data : (data as any)?.results || [];
      setSales(results);
    } catch (err) {
      console.error("Failed to load disco sales:", err);
      setError("Could not load sales.");
    } finally {
      setLoading(false);
    }
  }

  async function createSale(payload: any) {
    try {
      setSaving(true);
      setError(null);

      const created = await createSaleApi(payload);
      setSales((prev) => [created, ...prev]);

      return created;
    } catch (err) {
      console.error("Failed to create disco sale:", err);
      setError("Could not create sale.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function updateSale(id: number, payload: any) {
    try {
      setSaving(true);
      setError(null);

      const updated = await updateSaleApi(id, payload);
      setSales((prev) =>
        prev.map((sale) => (sale.id === id ? updated : sale))
      );

      return updated;
    } catch (err) {
      console.error("Failed to update disco sale:", err);
      setError("Could not update sale.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function deleteSale(id: number) {
    try {
      setSaving(true);
      setError(null);

      await deleteSaleApi(id);
      setSales((prev) => prev.filter((sale) => sale.id !== id));
    } catch (err) {
      console.error("Failed to delete disco sale:", err);
      setError("Could not delete sale.");
      throw err;
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    loadSales();
  }, []);

  return {
    sales,
    loading,
    saving,
    error,

    loadSales,
    refresh: loadSales,
    refreshSales: loadSales,

    createSale,
    updateSale,
    deleteSale,
  };
}

export { useDiscoSales };