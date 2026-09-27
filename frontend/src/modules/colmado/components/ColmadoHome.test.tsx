import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  ColmadoSection,
  DashboardData,
  Store,
} from "../types/colmado";
import ColmadoHome from "./ColmadoHome";

const store: Store = {
  id: 2,
  name: "Colmado Macao",
  address: "Calle Principal, Macao",
  phone: "809-555-0000",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const dashboard: DashboardData = {
  date: "2026-09-27",
  store: { id: 2, name: "Colmado Macao" },
  summary: {
    sale_count: 12,
    revenue: "8500.00",
    discounts: "100.00",
    cost_of_goods: "5000.00",
    gross_profit: "3500.00",
    operating_expenses: "500.00",
    payroll: "300.00",
    net_profit: "2700.00",
    is_profitable: true,
    outstanding_credit: "1200.00",
    low_stock_count: 2,
    new_orders: 1,
    active_orders: 2,
  },
  comparison: {
    previous_date: "2026-09-26",
    previous_revenue: "6800.00",
    change_amount: "1700.00",
    change_percent: "25.00",
  },
  payments: {
    cash: { amount: "5000.00", count: 7 },
    card: { amount: "1000.00", count: 1 },
    transfer: { amount: "1500.00", count: 2 },
    credit: { amount: "1000.00", count: 2 },
  },
  low_stock: [
    {
      inventory_item_id: 10,
      store_id: 2,
      store_name: "Colmado Macao",
      product_name: "Coca-Cola 12 oz",
      barcode: "746000000001",
      quantity: "3.000",
      reorder_level: "5.000",
    },
    {
      inventory_item_id: 11,
      store_id: 2,
      store_name: "Colmado Macao",
      product_name: "Arroz Selecto 1 lb",
      barcode: "746000000002",
      quantity: "2.000",
      reorder_level: "6.000",
    },
  ],
  orders: [
    {
      id: 40,
      order_number: "12345678-1234-1234-1234-123456789012",
      store_id: 2,
      store_name: "Colmado Macao",
      customer_name: "Ana Pérez",
      status: "new",
      status_display: "Nuevo",
      total: "300.00",
      created_at: "2026-09-27T12:00:00Z",
    },
  ],
  top_products: [],
  stores: [],
};

function renderHome(
  options: {
    data?: DashboardData | null;
    cashRegisterOpen?: boolean;
    loading?: boolean;
    onNavigate?: (section: ColmadoSection) => void;
  } = {},
) {
  return render(
    <ColmadoHome
      store={store}
      dashboard={options.data === undefined ? dashboard : options.data}
      cashRegisterOpen={options.cashRegisterOpen ?? true}
      loading={options.loading ?? false}
      onNavigate={options.onNavigate ?? vi.fn()}
    />,
  );
}

describe("ColmadoHome", () => {
  it("shows a simple loading state before the dashboard arrives", () => {
    renderHome({ data: null, loading: true });

    expect(screen.getByLabelText("Cargando resumen")).toBeInTheDocument();
    expect(screen.queryByText("Vendido hoy")).not.toBeInTheDocument();
  });

  it("shows the current store and the four essential business numbers", () => {
    renderHome();

    expect(screen.getByRole("heading", { name: "Colmado Macao" })).toBeInTheDocument();
    expect(screen.getByText("Calle Principal, Macao")).toBeInTheDocument();
    expect(screen.getByText("Vendido hoy")).toBeInTheDocument();
    expect(screen.getByText("Ganancia de hoy")).toBeInTheDocument();
    expect(screen.getByText("Fiado pendiente")).toBeInTheDocument();
    expect(screen.getByText("Por comprar")).toBeInTheDocument();
    expect(screen.getByText("25% frente a ayer")).toBeInTheDocument();
  });

  it("connects every quick action to its correct section", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderHome({ onNavigate });

    await user.click(screen.getByRole("button", { name: /Hacer una venta/i }));
    await user.click(screen.getByRole("button", { name: /Ver pedidos/i }));
    await user.click(screen.getByRole("button", { name: /Ver fiados/i }));
    await user.click(screen.getByRole("button", { name: /Ver caja/i }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "vender");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "pedidos");
    expect(onNavigate).toHaveBeenNthCalledWith(3, "fiado");
    expect(onNavigate).toHaveBeenNthCalledWith(4, "caja");
  });

  it("makes opening the register an obvious action when cash is closed", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderHome({ cashRegisterOpen: false, onNavigate });

    await user.click(screen.getByRole("button", { name: /Abrir caja/i }));

    expect(onNavigate).toHaveBeenCalledWith("caja");
    expect(screen.getByText("Necesaria para el turno")).toBeInTheDocument();
  });

  it("shows urgent orders and low-stock products with direct navigation", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderHome({ onNavigate });

    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Coca-Cola 12 oz")).toBeInTheDocument();
    expect(screen.getByText("Arroz Selecto 1 lb")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Ana Pérez/i }));
    await user.click(screen.getByRole("button", { name: /Coca-Cola 12 oz/i }));

    expect(onNavigate).toHaveBeenNthCalledWith(1, "pedidos");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "inventario");
  });

  it("reassures the employee when there are no pending orders or shortages", () => {
    renderHome({
      data: {
        ...dashboard,
        summary: {
          ...dashboard.summary,
          new_orders: 0,
          active_orders: 0,
          low_stock_count: 0,
        },
        orders: [],
        low_stock: [],
      },
    });

    expect(screen.getByText("No hay pedidos pendientes.")).toBeInTheDocument();
    expect(screen.getByText("El inventario está bien por ahora.")).toBeInTheDocument();
  });
});
