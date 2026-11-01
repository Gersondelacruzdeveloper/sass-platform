import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type {
  ColmadoSection,
  DashboardData,
  DashboardPeriod,
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
  period: "month",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
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
    previous_date: "2026-08-31",
    previous_period_start: "2026-08-01",
    previous_period_end: "2026-08-31",
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
  trend: [
    {
      date: "2026-09-01",
      sale_count: 4,
      revenue: "2500.00",
      cost_of_goods: "1400.00",
      gross_profit: "1100.00",
      operating_expenses: "100.00",
      payroll: "0.00",
      net_profit: "1000.00",
    },
    {
      date: "2026-09-02",
      sale_count: 3,
      revenue: "1800.00",
      cost_of_goods: "1200.00",
      gross_profit: "600.00",
      operating_expenses: "800.00",
      payroll: "0.00",
      net_profit: "-200.00",
    },
    {
      date: "2026-09-03",
      sale_count: 5,
      revenue: "4200.00",
      cost_of_goods: "2400.00",
      gross_profit: "1800.00",
      operating_expenses: "0.00",
      payroll: "300.00",
      net_profit: "1500.00",
    },
  ],
  low_stock: [
    {
      inventory_item_id: 10,
      store_id: 2,
      store_name: "Colmado Macao",
      product_name: "Coca-Cola 12 oz",
      barcode: "746000000001",
      image_url: "https://cdn.example.com/coca-cola-12-oz.jpg",
      quantity: "3.000",
      reorder_level: "5.000",
    },
    {
      inventory_item_id: 11,
      store_id: 2,
      store_name: "Colmado Macao",
      product_name: "Arroz Selecto 1 lb",
      barcode: "746000000002",
      image_url: null,
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
    dashboardPeriod?: DashboardPeriod;
    cashRegisterOpen?: boolean;
    loading?: boolean;
    onNavigate?: (section: ColmadoSection) => void;
    onSelectDashboardPeriod?: (period: DashboardPeriod) => void;
  } = {},
) {
  return render(
    <ColmadoHome
      store={store}
      dashboard={options.data === undefined ? dashboard : options.data}
      dashboardPeriod={options.dashboardPeriod ?? "month"}
      cashRegisterOpen={options.cashRegisterOpen ?? true}
      loading={options.loading ?? false}
      onNavigate={options.onNavigate ?? vi.fn()}
      onSelectDashboardPeriod={options.onSelectDashboardPeriod ?? vi.fn()}
    />,
  );
}

describe("ColmadoHome", () => {
  it("shows a simple loading state before the dashboard arrives", () => {
    renderHome({ data: null, loading: true });

    expect(screen.getByLabelText("Cargando resumen")).toBeInTheDocument();
    expect(screen.queryByText("Vendido este mes")).not.toBeInTheDocument();
  });

  it("shows the current store and the complete monthly business result", () => {
    renderHome();

    expect(
      screen.getByRole("heading", { name: "Colmado Macao" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Calle Principal, Macao")).toBeInTheDocument();
    expect(screen.getByText("Vendido este mes")).toBeInTheDocument();
    expect(screen.getByText("Ganancia neta")).toBeInTheDocument();
    expect(screen.getByText("Costo de mercancía")).toBeInTheDocument();
    expect(screen.getByText("Ganancia bruta")).toBeInTheDocument();
    expect(screen.getByText("Gastos operativos")).toBeInTheDocument();
    expect(screen.getByText("Nómina pagada")).toBeInTheDocument();
    expect(screen.getByText("25% frente al mes anterior")).toBeInTheDocument();
    expect(screen.getByText("El colmado produjo ganancia.")).toBeInTheDocument();
  });

  it("changes between daily, weekly and monthly summaries", async () => {
    const user = userEvent.setup();
    const onSelectDashboardPeriod = vi.fn();
    renderHome({ onSelectDashboardPeriod });

    expect(screen.getByRole("button", { name: "Este mes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(screen.getByRole("button", { name: "Hoy" }));
    await user.click(screen.getByRole("button", { name: "Esta semana" }));

    expect(onSelectDashboardPeriod).toHaveBeenNthCalledWith(1, "day");
    expect(onSelectDashboardPeriod).toHaveBeenNthCalledWith(2, "week");
  });

  it("shows the daily sales trend and identifies profit and loss days", () => {
    renderHome();

    expect(screen.getByText("Ventas por día")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "Gráfica de ventas de este mes" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Día con ganancia")).toBeInTheDocument();
    expect(screen.getByText("Día con pérdida")).toBeInTheDocument();
    expect(screen.getByLabelText(/2 sept.*-RD/i)).toBeInTheDocument();
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
    expect(
      screen.getByRole("img", {
        name: "Foto de Coca-Cola 12 oz",
      }),
    ).toHaveAttribute(
      "src",
      "https://cdn.example.com/coca-cola-12-oz.jpg",
    );

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
    expect(
      screen.getByText("El inventario está bien por ahora."),
    ).toBeInTheDocument();
  });

  it("shows a neutral result and one date when the selected day has no movement", () => {
    renderHome({
      data: {
        ...dashboard,
        period: "day",
        period_start: "2026-11-01",
        period_end: "2026-11-01",
        summary: {
          ...dashboard.summary,
          revenue: "0.00",
          cost_of_goods: "0.00",
          gross_profit: "0.00",
          operating_expenses: "0.00",
          payroll: "0.00",
          net_profit: "0.00",
          is_profitable: true,
        },
        trend: [
          {
            date: "2026-11-01",
            revenue: "0.00",
            net_profit: "0.00",
          },
        ],
      },
    });

    expect(screen.getByText("Sin ganancia ni pérdida.")).toBeInTheDocument();
    expect(screen.getByText("Sin movimiento")).toBeInTheDocument();
    expect(screen.queryByText("1 nov – 1 nov")).not.toBeInTheDocument();
  });
});
