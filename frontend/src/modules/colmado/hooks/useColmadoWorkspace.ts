import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getApiErrorMessage,
  getCurrentCashRegister,
  getDashboard,
  getStores,
} from "../api/colmadoClient";
import type {
  CashRegisterSession,
  DashboardData,
  Store,
} from "../types/colmado";

const selectedStoreKey = (organisationSlug: string) =>
  `colmado:selected-store:${organisationSlug}`;

export interface ColmadoWorkspace {
  stores: Store[];
  selectedStoreId: number;
  selectedStore: Store | null;
  dashboard: DashboardData | null;
  cashRegister: CashRegisterSession | null;
  loadingStores: boolean;
  loadingWorkspace: boolean;
  error: string | null;
  selectStore: (storeId: number) => void;
  refreshWorkspace: () => Promise<void>;
}

export function useColmadoWorkspace(
  organisationSlug: string,
): ColmadoWorkspace {
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState(0);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [cashRegister, setCashRegister] =
    useState<CashRegisterSession | null>(null);
  const [loadingStores, setLoadingStores] = useState(true);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workspaceRequestId = useRef(0);

  useEffect(() => {
    let active = true;
    workspaceRequestId.current += 1;
    setSelectedStoreId(0);
    setDashboard(null);
    setCashRegister(null);

    async function loadAvailableStores() {
      setLoadingStores(true);
      setError(null);
      try {
        const rows = (await getStores(organisationSlug)).filter(
          (store) => store.is_active,
        );
        if (!active) return;

        setStores(rows);
        const savedStoreId = Number(
          localStorage.getItem(selectedStoreKey(organisationSlug)),
        );
        const savedStoreExists = rows.some(
          (store) => store.id === savedStoreId,
        );
        setSelectedStoreId(
          savedStoreExists ? savedStoreId : (rows[0]?.id ?? 0),
        );
      } catch (requestError) {
        if (!active) return;
        setStores([]);
        setSelectedStoreId(0);
        setError(
          getApiErrorMessage(
            requestError,
            "No pudimos cargar las sucursales del colmado.",
          ),
        );
      } finally {
        if (active) setLoadingStores(false);
      }
    }

    if (organisationSlug) {
      void loadAvailableStores();
    } else {
      setStores([]);
      setSelectedStoreId(0);
      setLoadingStores(false);
      setError("No se pudo identificar el negocio.");
    }

    return () => {
      active = false;
    };
  }, [organisationSlug]);

  const refreshWorkspace = useCallback(async () => {
    const requestId = ++workspaceRequestId.current;
    if (!organisationSlug || !selectedStoreId) {
      setDashboard(null);
      setCashRegister(null);
      return;
    }

    setLoadingWorkspace(true);
    setError(null);
    try {
      const [nextDashboard, nextCashRegister] = await Promise.all([
        getDashboard(organisationSlug, selectedStoreId),
        getCurrentCashRegister(organisationSlug, selectedStoreId),
      ]);
      if (requestId !== workspaceRequestId.current) return;
      setDashboard(nextDashboard);
      setCashRegister(nextCashRegister);
    } catch (requestError) {
      if (requestId !== workspaceRequestId.current) return;
      setError(
        getApiErrorMessage(
          requestError,
          "No pudimos actualizar la información del colmado.",
        ),
      );
    } finally {
      if (requestId === workspaceRequestId.current) {
        setLoadingWorkspace(false);
      }
    }
  }, [organisationSlug, selectedStoreId]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const selectStore = useCallback(
    (storeId: number) => {
      if (!stores.some((store) => store.id === storeId)) return;
      localStorage.setItem(selectedStoreKey(organisationSlug), String(storeId));
      setSelectedStoreId(storeId);
    },
    [organisationSlug, stores],
  );

  const selectedStore = useMemo(
    () => stores.find((store) => store.id === selectedStoreId) ?? null,
    [selectedStoreId, stores],
  );

  return {
    stores,
    selectedStoreId,
    selectedStore,
    dashboard,
    cashRegister,
    loadingStores,
    loadingWorkspace,
    error,
    selectStore,
    refreshWorkspace,
  };
}
