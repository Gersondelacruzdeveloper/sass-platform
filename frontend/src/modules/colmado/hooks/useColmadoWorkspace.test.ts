import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CashRegisterSession,
  DashboardData,
  Store,
} from "../types/colmado";
import { useColmadoWorkspace } from "./useColmadoWorkspace";

const apiMocks = vi.hoisted(() => ({
  getStores: vi.fn(),
  getDashboard: vi.fn(),
  getCurrentCashRegister: vi.fn(),
  getApiErrorMessage: vi.fn(
    (_error: unknown, fallback?: string) => fallback || "Error de prueba",
  ),
}));

vi.mock("../api/colmadoClient", () => apiMocks);

const activeStore = (id: number, name: string): Store =>
  ({
    id,
    name,
    address: "Punta Cana",
    phone: "809-555-0000",
    is_active: true,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
  }) satisfies Store;

const dashboardFor = (storeId: number, revenue: string): DashboardData =>
  ({
    date: "2026-09-27",
    store: { id: storeId, name: `Sucursal ${storeId}` },
    summary: {
      sale_count: 1,
      revenue,
      discounts: "0.00",
      cost_of_goods: "50.00",
      gross_profit: "50.00",
      operating_expenses: "0.00",
      payroll: "0.00",
      net_profit: "50.00",
      is_profitable: true,
      outstanding_credit: "0.00",
      low_stock_count: 0,
      new_orders: 0,
      active_orders: 0,
    },
    comparison: {
      previous_date: "2026-09-26",
      previous_revenue: "0.00",
      change_amount: revenue,
      change_percent: null,
    },
    payments: {
      cash: { amount: revenue, count: 1 },
      card: { amount: "0.00", count: 0 },
      transfer: { amount: "0.00", count: 0 },
      credit: { amount: "0.00", count: 0 },
    },
    low_stock: [],
    orders: [],
    top_products: [],
    stores: [],
  }) satisfies DashboardData;

const openRegister = (storeId: number): CashRegisterSession =>
  ({
    id: 50 + storeId,
    session_number: `CAJA-${storeId}`,
    store: storeId,
    store_name: `Sucursal ${storeId}`,
    opened_by: 1,
    opened_by_name: "Cajero",
    closed_by: null,
    closed_by_name: null,
    status: "open",
    status_display: "Abierta",
    opening_amount: "1000.00",
    cash_sales: "0.00",
    expected_cash: "1000.00",
    counted_cash: null,
    difference: null,
    note: "",
    opened_at: "2026-09-27T10:00:00Z",
    closed_at: null,
    updated_at: "2026-09-27T10:00:00Z",
  }) satisfies CashRegisterSession;

describe("useColmadoWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
    apiMocks.getDashboard.mockImplementation(
      (_slug: string, storeId: number) =>
        Promise.resolve(dashboardFor(storeId, `${storeId}00.00`)),
    );
    apiMocks.getCurrentCashRegister.mockImplementation(
      (_slug: string, storeId: number) => Promise.resolve(openRegister(storeId)),
    );
  });

  it("keeps only active stores and selects the first one", async () => {
    apiMocks.getStores.mockResolvedValue([
      activeStore(1, "Macao"),
      { ...activeStore(2, "Cerrada"), is_active: false },
    ]);

    const { result } = renderHook(() =>
      useColmadoWorkspace("colmado-don-juan"),
    );

    await waitFor(() => expect(result.current.loadingStores).toBe(false));
    await waitFor(() => expect(result.current.dashboard).not.toBeNull());

    expect(result.current.stores.map((store) => store.id)).toEqual([1]);
    expect(result.current.selectedStore?.name).toBe("Macao");
    expect(apiMocks.getDashboard).toHaveBeenCalledWith(
      "colmado-don-juan",
      1,
    );
    expect(apiMocks.getCurrentCashRegister).toHaveBeenCalledWith(
      "colmado-don-juan",
      1,
    );
  });

  it("restores the last store selected for that organisation", async () => {
    window.localStorage.setItem(
      "colmado:selected-store:colmado-don-juan",
      "3",
    );
    apiMocks.getStores.mockResolvedValue([
      activeStore(1, "Macao"),
      activeStore(3, "Verón"),
    ]);

    const { result } = renderHook(() =>
      useColmadoWorkspace("colmado-don-juan"),
    );

    await waitFor(() => expect(result.current.selectedStoreId).toBe(3));
    await waitFor(() => expect(result.current.dashboard?.store?.id).toBe(3));
    expect(result.current.selectedStore?.name).toBe("Verón");
  });

  it("changes store, persists it and reloads dashboard and cash register", async () => {
    apiMocks.getStores.mockResolvedValue([
      activeStore(1, "Macao"),
      activeStore(3, "Verón"),
    ]);
    const { result } = renderHook(() =>
      useColmadoWorkspace("colmado-don-juan"),
    );
    await waitFor(() => expect(result.current.selectedStoreId).toBe(1));

    act(() => result.current.selectStore(3));

    await waitFor(() => expect(result.current.dashboard?.store?.id).toBe(3));
    expect(result.current.cashRegister?.store).toBe(3);
    expect(window.localStorage.getItem("colmado:selected-store:colmado-don-juan")).toBe("3");
    expect(apiMocks.getDashboard).toHaveBeenCalledWith("colmado-don-juan", 3);
  });

  it("does not allow selecting a store that is outside the loaded organisation", async () => {
    apiMocks.getStores.mockResolvedValue([activeStore(1, "Macao")]);
    const { result } = renderHook(() =>
      useColmadoWorkspace("colmado-don-juan"),
    );
    await waitFor(() => expect(result.current.selectedStoreId).toBe(1));

    act(() => result.current.selectStore(999));

    expect(result.current.selectedStoreId).toBe(1);
    expect(window.localStorage.getItem("colmado:selected-store:colmado-don-juan")).toBeNull();
    expect(apiMocks.getDashboard).not.toHaveBeenCalledWith(
      "colmado-don-juan",
      999,
    );
  });

  it("clears the old workspace when the organisation changes", async () => {
    apiMocks.getStores.mockImplementation((slug: string) =>
      Promise.resolve(
        slug === "negocio-a"
          ? [activeStore(1, "Sucursal A")]
          : [activeStore(9, "Sucursal B")],
      ),
    );
    const { result, rerender } = renderHook(
      ({ slug }) => useColmadoWorkspace(slug),
      { initialProps: { slug: "negocio-a" } },
    );
    await waitFor(() => expect(result.current.selectedStoreId).toBe(1));

    rerender({ slug: "negocio-b" });

    await waitFor(() => expect(result.current.selectedStoreId).toBe(9));
    await waitFor(() => expect(result.current.dashboard?.store?.id).toBe(9));
    expect(result.current.stores).toHaveLength(1);
    expect(result.current.stores[0].name).toBe("Sucursal B");
    expect(apiMocks.getDashboard).toHaveBeenCalledWith("negocio-b", 9);
  });

  it("shows a clear error and exposes no stores when loading fails", async () => {
    apiMocks.getStores.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() =>
      useColmadoWorkspace("colmado-don-juan"),
    );

    await waitFor(() => expect(result.current.loadingStores).toBe(false));
    expect(result.current.stores).toEqual([]);
    expect(result.current.selectedStore).toBeNull();
    expect(result.current.error).toBe(
      "No pudimos cargar las sucursales del colmado.",
    );
  });
});
