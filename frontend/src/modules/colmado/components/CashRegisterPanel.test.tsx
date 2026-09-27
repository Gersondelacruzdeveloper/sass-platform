import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CashRegisterSession, Store } from "../types/colmado";
import CashRegisterPanel from "./CashRegisterPanel";

const apiMocks = vi.hoisted(() => ({
  openCashRegister: vi.fn(),
  closeCashRegister: vi.fn(),
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

const openSession: CashRegisterSession = {
  id: 40,
  session_number: "CAJA-000040",
  store: 2,
  store_name: "Colmado Macao",
  opened_by: 1,
  opened_by_name: "Gerson",
  closed_by: null,
  closed_by_name: null,
  status: "open",
  status_display: "Abierta",
  opening_amount: "1000.00",
  cash_sales: "1500.00",
  expected_cash: "2500.00",
  counted_cash: null,
  difference: null,
  note: "Turno de la mañana",
  opened_at: "2026-09-27T12:00:00Z",
  closed_at: null,
  updated_at: "2026-09-27T12:00:00Z",
};

function renderCashRegister(
  cashRegister: CashRegisterSession | null,
  onChanged = vi.fn(),
) {
  return render(
    <CashRegisterPanel
      organisationSlug="colmado-don-juan"
      store={store}
      cashRegister={cashRegister}
      onChanged={onChanged}
    />,
  );
}

describe("CashRegisterPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
  });

  it("shows a simple opening form when there is no active register", () => {
    renderCashRegister(null);

    expect(
      screen.getByRole("heading", { name: "Abrir caja" }),
    ).toBeInTheDocument();
    expect(screen.getByText("La caja está cerrada")).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: /Efectivo inicial/i }),
    ).toHaveValue(0);
  });

  it("opens the register with its initial cash and optional note", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    apiMocks.openCashRegister.mockResolvedValue(openSession);
    renderCashRegister(null, onChanged);

    const initialCash = screen.getByRole("spinbutton", {
      name: /Efectivo inicial/i,
    });
    await user.clear(initialCash);
    await user.type(initialCash, "1000");
    await user.type(
      screen.getByRole("textbox", { name: /Nota/i }),
      "Turno de la mañana",
    );
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));

    await waitFor(() =>
      expect(apiMocks.openCashRegister).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          store_id: 2,
          opening_amount: "1000.00",
          note: "Turno de la mañana",
        },
      ),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("rejects an invalid negative opening amount before calling the API", async () => {
    renderCashRegister(null);
    const initialCash = screen.getByRole("spinbutton", {
      name: /Efectivo inicial/i,
    });
    fireEvent.change(
      initialCash,
      { target: { value: "-5" } },
    );
    fireEvent.submit(initialCash.closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Escribe una cantidad válida",
    );
    expect(apiMocks.openCashRegister).not.toHaveBeenCalled();
  });

  it("shows the opening cash, cash sales and expected cash", () => {
    renderCashRegister(openSession);

    expect(
      screen.getByRole("heading", { name: "Caja del turno" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Comenzó con")).toBeInTheDocument();
    expect(screen.getByText("Ventas en efectivo")).toBeInTheDocument();
    expect(screen.getByText("Debe haber")).toBeInTheDocument();
    expect(screen.getByText("Caja abierta")).toBeInTheDocument();
  });

  it("shows whether counted cash is short, over or exact", async () => {
    const user = userEvent.setup();
    renderCashRegister(openSession);
    const counted = screen.getByRole("spinbutton", {
      name: /Efectivo contado/i,
    });

    await user.type(counted, "2400");
    expect(screen.getByText("Dinero faltante")).toBeInTheDocument();

    await user.clear(counted);
    await user.type(counted, "2600");
    expect(screen.getByText("Dinero sobrante")).toBeInTheDocument();

    await user.clear(counted);
    await user.type(counted, "2500");
    expect(screen.getByText("La caja está exacta")).toBeInTheDocument();
  });

  it("closes the correct register with counted cash and a note", async () => {
    const user = userEvent.setup();
    const onChanged = vi.fn();
    apiMocks.closeCashRegister.mockResolvedValue({
      ...openSession,
      status: "closed",
      status_display: "Cerrada",
      counted_cash: "2500.00",
      difference: "0.00",
    });
    renderCashRegister(openSession, onChanged);

    await user.type(
      screen.getByRole("spinbutton", { name: /Efectivo contado/i }),
      "2500",
    );
    await user.type(
      screen.getByRole("textbox", { name: /Nota del cierre/i }),
      "Todo correcto",
    );
    await user.click(screen.getByRole("button", { name: "Cerrar caja" }));

    await waitFor(() =>
      expect(apiMocks.closeCashRegister).toHaveBeenCalledWith(
        "colmado-don-juan",
        40,
        { counted_cash: "2500.00", note: "Todo correcto" },
      ),
    );
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("shows a safe message when the API cannot open the register", async () => {
    const user = userEvent.setup();
    apiMocks.openCashRegister.mockRejectedValue(new Error("database details"));
    renderCashRegister(null);

    await user.click(screen.getByRole("button", { name: "Abrir caja" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos abrir la caja.",
    );
  });
});
