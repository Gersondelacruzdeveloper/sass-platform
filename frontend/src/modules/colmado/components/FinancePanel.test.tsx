import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Store } from "../types/colmado";
import FinancePanel from "./FinancePanel";

const apiMocks = vi.hoisted(() => ({
  getEmployees: vi.fn(),
  createEmployee: vi.fn(),
  getExpenses: vi.fn(),
  createExpense: vi.fn(),
  getPayrollPayments: vi.fn(),
  createPayrollPayment: vi.fn(),
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

const employee = {
  id: 12,
  store: 2,
  store_name: "Colmado Macao",
  name: "Ana Pérez",
  phone: "8095551234",
  position: "Cajera",
  pay_frequency: "biweekly" as const,
  pay_frequency_display: "Quincenal",
  pay_amount: "12000.00",
  start_date: "2026-10-01",
  end_date: null,
  is_active: true,
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-01T10:00:00Z",
};

const expense = {
  id: 30,
  store: 2,
  store_name: "Colmado Macao",
  created_by: 1,
  created_by_name: "Juan Pérez",
  category: "electricity" as const,
  category_display: "Luz",
  description: "Factura de luz",
  amount: "3500.00",
  expense_date: "2026-11-01",
  receipt_image_url: null,
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-01T10:00:00Z",
};

const payrollPayment = {
  id: 41,
  store: 2,
  store_name: "Colmado Macao",
  employee: 12,
  employee_name: "Ana Pérez",
  created_by: 1,
  created_by_name: "Juan Pérez",
  amount: "12000.00",
  period_start: "2026-10-16",
  period_end: "2026-10-31",
  paid_on: "2026-11-01",
  note: "Pago quincenal",
  created_at: "2026-11-01T10:00:00Z",
};

function renderPanel(onDataChanged = vi.fn()) {
  return render(
    <FinancePanel
      organisationSlug="colmado-don-juan"
      store={store}
      onDataChanged={onDataChanged}
    />,
  );
}

describe("FinancePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getEmployees.mockResolvedValue([employee]);
    apiMocks.getExpenses.mockResolvedValue([expense]);
    apiMocks.getPayrollPayments.mockResolvedValue([payrollPayment]);
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
  });

  it("loads employees, expenses and payroll for the selected store", async () => {
    renderPanel();

    expect(await screen.findByText("Factura de luz")).toBeInTheDocument();
    expect(screen.getAllByText("Ana Pérez").length).toBeGreaterThanOrEqual(1);

    expect(apiMocks.getEmployees).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2, active: true },
    );
    expect(apiMocks.getExpenses).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2 },
    );
    expect(apiMocks.getPayrollPayments).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2 },
    );
  });

  it("records an operating expense and refreshes the dashboard", async () => {
    const user = userEvent.setup();
    const onDataChanged = vi.fn();
    apiMocks.createExpense.mockResolvedValue(expense);
    renderPanel(onDataChanged);

    await screen.findByText("Factura de luz");
    await user.click(screen.getByRole("button", { name: "Registrar gasto" }));
    await user.selectOptions(screen.getByLabelText("Categoría"), "electricity");
    await user.type(screen.getByLabelText("Descripción"), "Factura de luz");
    await user.type(screen.getByLabelText("Monto del gasto"), "3500");
    await user.clear(screen.getByLabelText("Fecha del gasto"));
    await user.type(screen.getByLabelText("Fecha del gasto"), "2026-11-01");
    await user.click(screen.getByRole("button", { name: "Guardar gasto" }));

    await waitFor(() =>
      expect(apiMocks.createExpense).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          store: 2,
          category: "electricity",
          description: "Factura de luz",
          amount: "3500.00",
          expense_date: "2026-11-01",
        },
      ),
    );
    expect(onDataChanged).toHaveBeenCalledOnce();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Gasto registrado",
    );
  });

  it("creates an employee with simple payroll information", async () => {
    const user = userEvent.setup();
    apiMocks.createEmployee.mockResolvedValue(employee);
    renderPanel();

    await screen.findByText("Factura de luz");
    await user.click(screen.getByRole("button", { name: "Agregar empleado" }));
    await user.type(screen.getByLabelText("Nombre del empleado"), "Ana Pérez");
    await user.type(screen.getByLabelText("Puesto"), "Cajera");
    await user.selectOptions(screen.getByLabelText("Frecuencia de pago"), "biweekly");
    await user.type(screen.getByLabelText("Pago habitual"), "12000");
    await user.clear(screen.getByLabelText("Fecha de inicio"));
    await user.type(screen.getByLabelText("Fecha de inicio"), "2026-10-01");
    await user.click(screen.getByRole("button", { name: "Guardar empleado" }));

    await waitFor(() =>
      expect(apiMocks.createEmployee).toHaveBeenCalledWith(
        "colmado-don-juan",
        expect.objectContaining({
          store: 2,
          name: "Ana Pérez",
          position: "Cajera",
          pay_frequency: "biweekly",
          pay_amount: "12000.00",
          start_date: "2026-10-01",
          is_active: true,
        }),
      ),
    );
  });

  it("records one payroll payment and refreshes the dashboard", async () => {
    const user = userEvent.setup();
    const onDataChanged = vi.fn();
    apiMocks.createPayrollPayment.mockResolvedValue(payrollPayment);
    renderPanel(onDataChanged);

    await screen.findByText("Factura de luz");
    await user.click(screen.getByRole("button", { name: "Pagar nómina" }));
    await user.selectOptions(screen.getByLabelText("Empleado"), "12");
    await user.clear(screen.getByLabelText("Monto pagado"));
    await user.type(screen.getByLabelText("Monto pagado"), "12000");
    await user.clear(screen.getByLabelText("Inicio del período"));
    await user.type(screen.getByLabelText("Inicio del período"), "2026-10-16");
    await user.clear(screen.getByLabelText("Final del período"));
    await user.type(screen.getByLabelText("Final del período"), "2026-10-31");
    await user.clear(screen.getByLabelText("Fecha de pago"));
    await user.type(screen.getByLabelText("Fecha de pago"), "2026-11-01");
    await user.type(screen.getByLabelText("Nota del pago"), "Pago quincenal");
    await user.click(screen.getByRole("button", { name: "Confirmar pago" }));

    await waitFor(() =>
      expect(apiMocks.createPayrollPayment).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          store: 2,
          employee: 12,
          amount: "12000.00",
          period_start: "2026-10-16",
          period_end: "2026-10-31",
          paid_on: "2026-11-01",
          note: "Pago quincenal",
        },
      ),
    );
    expect(onDataChanged).toHaveBeenCalledOnce();
  });

  it("explains that an employee is required before paying payroll", async () => {
    apiMocks.getEmployees.mockResolvedValue([]);
    renderPanel();

    expect(
      await screen.findByText("Agrega un empleado antes de registrar nómina."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Pagar nómina" }),
    ).toBeDisabled();
  });

  it("shows a clear loading error", async () => {
    apiMocks.getExpenses.mockRejectedValue(new Error("network"));
    renderPanel();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No pudimos cargar los gastos y la nómina.",
    );
  });
});
