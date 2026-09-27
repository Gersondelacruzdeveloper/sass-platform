import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer, Store } from "../types/colmado";
import CreditPanel from "./CreditPanel";

const apiMocks = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  createCustomer: vi.fn(),
  getCustomerCreditHistory: vi.fn(),
  recordCreditPayment: vi.fn(),
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

const ana: Customer = {
  id: 8,
  name: "Ana Pérez",
  phone: "809-555-1234",
  address: "Macao",
  notes: "",
  credit_limit: "1000.00",
  balance: "300.00",
  available_credit: "700.00",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const juan: Customer = {
  ...ana,
  id: 9,
  name: "Juan Rodríguez",
  phone: "809-555-5678",
  balance: "150.00",
  available_credit: "850.00",
};

function renderCredit(onDataChanged = vi.fn()) {
  return render(
    <CreditPanel
      organisationSlug="colmado-don-juan"
      store={store}
      onDataChanged={onDataChanged}
    />,
  );
}

describe("CreditPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
    apiMocks.getCustomers.mockResolvedValue([ana, juan]);
    apiMocks.getCustomerCreditHistory.mockResolvedValue([]);
  });

  it("loads only customers with debt and shows the amount to collect", async () => {
    renderCredit();

    expect(await screen.findByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Juan Rodríguez")).toBeInTheDocument();
    expect(screen.getByText(/2 clientes deben/i)).toBeInTheDocument();
    expect(apiMocks.getCustomers).toHaveBeenCalledWith(
      "colmado-don-juan",
      { hasDebt: true },
    );
  });

  it("filters debtors by name or phone", async () => {
    const user = userEvent.setup();
    renderCredit();
    await screen.findByText("Ana Pérez");

    await user.type(
      screen.getByRole("textbox", { name: "Buscar cliente" }),
      "5678",
    );

    expect(screen.getByText("Juan Rodríguez")).toBeInTheDocument();
    expect(screen.queryByText("Ana Pérez")).not.toBeInTheDocument();
  });

  it("opens one customer and loads the complete credit history", async () => {
    const user = userEvent.setup();
    apiMocks.getCustomerCreditHistory.mockResolvedValue([
      {
        id: 1,
        customer: 8,
        customer_name: "Ana Pérez",
        store: 2,
        store_name: "Colmado Macao",
        sale: 70,
        created_by: 1,
        created_by_name: "Cajero",
        transaction_type: "charge",
        transaction_type_display: "Compra fiada",
        amount: "400.00",
        balance_after: "400.00",
        note: "Venta V-70",
        created_at: "2026-09-27T12:00:00Z",
      },
      {
        id: 2,
        customer: 8,
        customer_name: "Ana Pérez",
        store: 2,
        store_name: "Colmado Macao",
        sale: null,
        created_by: 1,
        created_by_name: "Cajero",
        transaction_type: "payment",
        transaction_type_display: "Abono",
        amount: "100.00",
        balance_after: "300.00",
        note: "Efectivo",
        created_at: "2026-09-27T13:00:00Z",
      },
    ]);
    renderCredit();
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );

    expect(await screen.findByText("Compra fiada")).toBeInTheDocument();
    expect(screen.getByText("Abono")).toBeInTheDocument();
    expect(screen.getByText("Venta V-70")).toBeInTheDocument();
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(apiMocks.getCustomerCreditHistory).toHaveBeenCalledWith(
      "colmado-don-juan",
      8,
    );
  });

  it("creates a customer with an optional credit limit", async () => {
    const user = userEvent.setup();
    const onDataChanged = vi.fn();
    const newCustomer: Customer = {
      ...ana,
      id: 12,
      name: "María López",
      phone: "809-555-9999",
      address: "El Cortecito",
      credit_limit: "2000.00",
      balance: "0.00",
      available_credit: "2000.00",
    };
    apiMocks.createCustomer.mockResolvedValue(newCustomer);
    renderCredit(onDataChanged);

    await user.click(
      await screen.findByRole("button", { name: "Nuevo cliente" }),
    );
    await user.type(screen.getByLabelText("Nombre completo"), "  María López  ");
    await user.type(screen.getByLabelText("Teléfono"), "809-555-9999");
    await user.type(screen.getByLabelText("Dirección"), "El Cortecito");
    const limit = screen.getByRole("spinbutton", {
      name: /Límite de fiado/i,
    });
    await user.clear(limit);
    await user.type(limit, "2000");
    await user.click(screen.getByRole("button", { name: "Guardar cliente" }));

    await waitFor(() =>
      expect(apiMocks.createCustomer).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          name: "María López",
          phone: "809-555-9999",
          address: "El Cortecito",
          credit_limit: "2000",
          is_active: true,
        },
      ),
    );
    expect(
      await screen.findByRole("heading", { name: "María López" }),
    ).toBeInTheDocument();
    expect(onDataChanged).toHaveBeenCalledOnce();
  });

  it("does not enable an installment greater than the customer balance", async () => {
    const user = userEvent.setup();
    renderCredit();
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );
    await user.type(screen.getByLabelText("¿Cuánto pagó? (RD$)"), "400");

    expect(
      screen.getByRole("button", { name: "Confirmar abono" }),
    ).toBeDisabled();
    expect(apiMocks.recordCreditPayment).not.toHaveBeenCalled();
  });

  it("records an installment and updates the displayed balance", async () => {
    const user = userEvent.setup();
    const onDataChanged = vi.fn();
    const updatedCustomer = {
      ...ana,
      balance: "200.00",
      available_credit: "800.00",
    };
    apiMocks.recordCreditPayment.mockResolvedValue({
      customer: updatedCustomer,
      transaction: {
        id: 3,
        customer: 8,
        customer_name: "Ana Pérez",
        store: 2,
        store_name: "Colmado Macao",
        sale: null,
        created_by: 1,
        created_by_name: "Cajero",
        transaction_type: "payment",
        transaction_type_display: "Abono",
        amount: "100.00",
        balance_after: "200.00",
        note: "Pagó en efectivo",
        created_at: "2026-09-27T14:00:00Z",
      },
    });
    renderCredit(onDataChanged);
    await user.click(
      await screen.findByRole("button", { name: /Ana Pérez/i }),
    );
    await user.type(screen.getByLabelText("¿Cuánto pagó? (RD$)"), "100");
    await user.type(screen.getByLabelText("Nota opcional"), "Pagó en efectivo");
    await user.click(
      screen.getByRole("button", { name: "Confirmar abono" }),
    );

    await waitFor(() =>
      expect(apiMocks.recordCreditPayment).toHaveBeenCalledWith(
        "colmado-don-juan",
        8,
        {
          store_id: 2,
          amount: "100",
          note: "Pagó en efectivo",
        },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Abono guardado",
    );
    expect(onDataChanged).toHaveBeenCalledOnce();
  });
});
