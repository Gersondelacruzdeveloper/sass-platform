import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CustomerOrder,
  CustomerOrderStatus,
} from "../api/colmadoClient";
import type { Store } from "../types/colmado";
import OrdersPanel from "./OrdersPanel";

const apiMocks = vi.hoisted(() => ({
  getCustomerOrders: vi.fn(),
  changeCustomerOrderStatus: vi.fn(),
  getApiErrorMessage: vi.fn(
    (_error: unknown, fallback?: string) => fallback || "Error de prueba",
  ),
}));

vi.mock("../api/colmadoClient", () => apiMocks);

const store: Store = {
  id: 2,
  name: "Colmado Macao",
  address: "Macao",
  phone: "809-555-0000",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

function order(
  status: CustomerOrderStatus = "new",
  overrides: Partial<CustomerOrder> = {},
): CustomerOrder {
  const labels: Record<CustomerOrderStatus, string> = {
    new: "Nuevo",
    preparing: "Preparando",
    ready: "Listo",
    on_the_way: "En camino",
    delivered: "Entregado",
    cancelled: "Cancelado",
  };
  return {
    id: 40,
    order_number: "12345678-1234-1234-1234-123456789012",
    store: 2,
    store_name: "Colmado Macao",
    customer_name: "Ana Pérez",
    customer_phone: "8095551234",
    delivery_address: "Calle Principal #10, Macao",
    latitude: "18.766000",
    longitude: "-68.536000",
    delivery_notes: "Casa azul frente al parque",
    status,
    status_display: labels[status],
    subtotal: "250.00",
    delivery_fee: "50.00",
    total: "300.00",
    inventory_committed: status !== "new" && status !== "cancelled",
    maps_url:
      "https://www.google.com/maps/dir/?api=1&destination=18.766000,-68.536000",
    accepted_at: status === "new" ? null : "2026-09-27T12:05:00Z",
    ready_at: null,
    dispatched_at: null,
    delivered_at: status === "delivered" ? "2026-09-27T12:30:00Z" : null,
    cancelled_at: status === "cancelled" ? "2026-09-27T12:10:00Z" : null,
    created_at: "2026-09-27T12:00:00Z",
    updated_at: "2026-09-27T12:00:00Z",
    items: [
      {
        id: 1,
        inventory_item_id: 10,
        product_name: "Coca-Cola 12 oz",
        barcode: "746000000001",
        unit: "unit",
        quantity: "2.000",
        unit_price: "50.00",
        line_total: "100.00",
      },
      {
        id: 2,
        inventory_item_id: 11,
        product_name: "Arroz Selecto 1 lb",
        barcode: "746000000002",
        unit: "unit",
        quantity: "5.000",
        unit_price: "30.00",
        line_total: "150.00",
      },
    ],
    ...overrides,
  };
}

function renderOrders(onOrdersChanged = vi.fn()) {
  return render(
    <OrdersPanel
      organisationSlug="colmado-don-juan"
      store={store}
      onOrdersChanged={onOrdersChanged}
    />,
  );
}

describe("OrdersPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
    apiMocks.getCustomerOrders.mockResolvedValue([
      order("new"),
      order("delivered", {
        id: 41,
        order_number: "87654321-1234-1234-1234-123456789012",
        customer_name: "Juan Rodríguez",
      }),
    ]);
  });

  it("loads the selected store queue and shows active orders first", async () => {
    renderOrders();

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.queryByText("Juan Rodríguez")).not.toBeInTheDocument();
    expect(screen.getByText(/1 pedido nuevo necesita atención/i)).toBeInTheDocument();
    expect(apiMocks.getCustomerOrders).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2, search: undefined, status: undefined },
    );
  });

  it("requests a server-side status filter", async () => {
    const user = userEvent.setup();
    apiMocks.getCustomerOrders.mockImplementation(
      (_slug: string, filters: { status?: CustomerOrderStatus }) =>
        Promise.resolve(
          filters.status === "delivered"
            ? [
                order("delivered", {
                  id: 41,
                  customer_name: "Juan Rodríguez",
                }),
              ]
            : [order("new")],
        ),
    );
    renderOrders();
    await screen.findByText("Ana Pérez");

    await user.click(screen.getByRole("button", { name: "Entregados" }));

    expect(await screen.findByText("Juan Rodríguez")).toBeInTheDocument();
    await waitFor(() =>
      expect(apiMocks.getCustomerOrders).toHaveBeenLastCalledWith(
        "colmado-don-juan",
        { store: 2, search: undefined, status: "delivered" },
      ),
    );
  });

  it("shows products, delivery instructions, phone and Google Maps", async () => {
    const user = userEvent.setup();
    renderOrders();
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );

    expect(screen.getByText("Coca-Cola 12 oz")).toBeInTheDocument();
    expect(screen.getByText("Arroz Selecto 1 lb")).toBeInTheDocument();
    expect(screen.getByText(/Casa azul frente al parque/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Llamar al cliente" })).toHaveAttribute(
      "href",
      "tel:8095551234",
    );
    expect(screen.getByRole("link", { name: /Abrir dirección/i })).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps"),
    );
  });

  it("advances a new order only to preparing", async () => {
    const user = userEvent.setup();
    const onOrdersChanged = vi.fn();
    apiMocks.changeCustomerOrderStatus.mockResolvedValue(order("preparing"));
    renderOrders(onOrdersChanged);
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Empezar a preparar" }),
    );

    await waitFor(() =>
      expect(apiMocks.changeCustomerOrderStatus).toHaveBeenCalledWith(
        "colmado-don-juan",
        40,
        "preparing",
      ),
    );
    expect(
      await screen.findByRole("button", { name: "Marcar como listo" }),
    ).toBeInTheDocument();
    expect(onOrdersChanged).toHaveBeenCalledOnce();
  });

  it("moves ready orders to delivery with one clear action", async () => {
    const user = userEvent.setup();
    apiMocks.getCustomerOrders.mockResolvedValue([order("ready")]);
    apiMocks.changeCustomerOrderStatus.mockResolvedValue(order("on_the_way"));
    renderOrders();
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );
    await user.click(screen.getByRole("button", { name: "Enviar pedido" }));

    expect(apiMocks.changeCustomerOrderStatus).toHaveBeenCalledWith(
      "colmado-don-juan",
      40,
      "on_the_way",
    );
    expect(
      await screen.findByRole("button", { name: "Marcar entregado" }),
    ).toBeInTheDocument();
  });

  it("requires confirmation before cancelling an order", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    apiMocks.changeCustomerOrderStatus.mockResolvedValue(order("cancelled"));
    renderOrders();
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );
    await user.click(
      screen.getByRole("button", { name: "Cancelar pedido" }),
    );

    expect(confirm).toHaveBeenCalledWith(
      "¿Seguro que quieres cancelar el pedido de Ana Pérez?",
    );
    await waitFor(() =>
      expect(apiMocks.changeCustomerOrderStatus).toHaveBeenCalledWith(
        "colmado-don-juan",
        40,
        "cancelled",
      ),
    );
    expect(await screen.findByText("Cancelado")).toBeInTheDocument();
  });
});
