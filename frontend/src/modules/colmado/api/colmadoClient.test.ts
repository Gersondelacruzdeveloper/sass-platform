import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addCatalogProductToInventory,
  addInitialInventoryItem,
  changeCustomerOrderStatus,
  closeCashRegister,
  createCustomer,
  createEmployee,
  createExpense,
  createPayrollPayment,
  createSale,
  findCatalogProductByBarcode,
  getCurrentCashRegister,
  getCustomerCreditHistory,
  getCustomerOrders,
  getCustomers,
  getDashboard,
  getEmployees,
  getExpenses,
  getInventory,
  getCatalogProducts,
  getStores,
  getPayrollPayments,
  openCashRegister,
  receiveInventoryCases,
  recordCreditPayment,
  updateCustomer,
} from "./colmadoClient";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));

const organisationSlug = "colmado-don-juan";
const headers = { "X-Organisation-Slug": organisationSlug };

describe("Colmado API client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only the stores for the selected organisation", async () => {
    const stores = [{ id: 1, name: "Sucursal Macao" }];
    apiMocks.get.mockResolvedValue({ data: { results: stores } });

    await expect(getStores(organisationSlug)).resolves.toEqual(stores);
    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/stores/", {
      headers,
    });
  });

  it("loads the daily dashboard for one store by default", async () => {
    const dashboard = {
      date: "2026-09-26",
      period: "day",
      summary: { revenue: "500.00" },
    };
    apiMocks.get.mockResolvedValue({ data: dashboard });

    await expect(getDashboard(organisationSlug, 3)).resolves.toBe(dashboard);
    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/dashboard/", {
      headers,
      params: {
        store: 3,
        period: "day",
        date: undefined,
      },
    });
  });

  it("loads the monthly dashboard using the selected date", async () => {
    const dashboard = {
      date: "2026-11-01",
      period: "month",
      period_start: "2026-11-01",
      period_end: "2026-11-30",
      summary: { revenue: "125000.00" },
    };
    apiMocks.get.mockResolvedValue({ data: dashboard });

    await expect(
      getDashboard(organisationSlug, 3, "month", "2026-11-01"),
    ).resolves.toBe(dashboard);

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/dashboard/", {
      headers,
      params: {
        store: 3,
        period: "month",
        date: "2026-11-01",
      },
    });
  });

  it("sends inventory filters using the backend parameter names", async () => {
    apiMocks.get.mockResolvedValue({ data: [] });

    await getInventory(organisationSlug, {
      store: 4,
      search: "arroz",
      barcode: "746000000001",
      quickSale: true,
      lowStock: true,
    });

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/inventory/", {
      headers,
      params: {
        store: 4,
        search: "arroz",
        barcode: "746000000001",
        quick_sale: "true",
        low_stock: "true",
      },
    });
  });

  it("looks up a master product by its barcode", async () => {
    const product = { id: 9, barcode: "746000000009", name: "Habichuelas" };
    apiMocks.get.mockResolvedValue({ data: product });

    await expect(
      findCatalogProductByBarcode(organisationSlug, "746000000009"),
    ).resolves.toBe(product);
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/catalog/by-barcode/",
      { headers, params: { barcode: "746000000009" } },
    );
  });

  it("searches the master catalog by name for the selected colmado", async () => {
    const products = [
      {
        id: 9,
        barcode: null,
        name: "Plátano maduro",
        display_name: "Plátano maduro",
      },
    ];
    apiMocks.get.mockResolvedValue({ data: { results: products } });

    await expect(
      getCatalogProducts(organisationSlug, {
        search: "  plátano  ",
      }),
    ).resolves.toEqual(products);

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/catalog/", {
      headers,
      params: {
        search: "plátano",
        category: undefined,
      },
    });
  });

  it("adds a selected master product to one store inventory", async () => {
    const payload = {
      store: 2,
      master_product: 9,
      quantity: "30.000",
      cost_price: "12.00",
      sale_price: "20.00",
      reorder_level: "5.000",
      is_quick_sale: true,
      is_active: true,
    };
    const inventoryItem = {
      id: 21,
      product_display_name: "Plátano maduro",
      ...payload,
    };
    apiMocks.post.mockResolvedValue({ data: inventoryItem });

    await expect(
      addCatalogProductToInventory(organisationSlug, payload),
    ).resolves.toEqual(inventoryItem);

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/inventory/",
      payload,
      { headers },
    );
  });

  it("adds the first stock count without changing the payload", async () => {
    const payload = {
      store_id: 2,
      barcode: "746000000010",
      quantity: "24.000",
      cost_price: "45.00",
      sale_price: "60.00",
      reorder_level: "6.000",
      is_quick_sale: true,
    };
    apiMocks.post.mockResolvedValue({ data: { id: 20, ...payload } });

    await addInitialInventoryItem(organisationSlug, payload);
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/inventory/initial-scan/",
      payload,
      { headers },
    );
  });

  it("receives cases for the correct inventory item", async () => {
    apiMocks.post.mockResolvedValue({
      data: { id: 20, cases_received: "3", units_added: "72" },
    });

    await receiveInventoryCases(organisationSlug, 20, "3");
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/inventory/20/receive-cases/",
      { cases: "3" },
      { headers },
    );
  });

  it("creates a sale with the exact POS payload", async () => {
    const payload = {
      store_id: 2,
      payment_method: "cash" as const,
      amount_received: "500.00",
      items: [{ inventory_item_id: 20, quantity: "2" }],
    };
    apiMocks.post.mockResolvedValue({ data: { id: 31, total: "120.00" } });

    await createSale(organisationSlug, payload);
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/sales/",
      payload,
      { headers },
    );
  });

  it("returns null when the store has no open cash register", async () => {
    apiMocks.get.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: "No hay caja abierta." } },
    });

    await expect(
      getCurrentCashRegister(organisationSlug, 2),
    ).resolves.toBeNull();
    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/cash-registers/current/",
      { headers, params: { store: 2 } },
    );
  });

  it("opens and closes the cash register using separate safe actions", async () => {
    apiMocks.post
      .mockResolvedValueOnce({ data: { id: 40, status: "open" } })
      .mockResolvedValueOnce({ data: { id: 40, status: "closed" } });

    await openCashRegister(organisationSlug, {
      store_id: 2,
      opening_amount: "1000.00",
      note: "Inicio del turno",
    });
    await closeCashRegister(organisationSlug, 40, {
      counted_cash: "2500.00",
      note: "Cierre",
    });

    expect(apiMocks.post).toHaveBeenNthCalledWith(
      1,
      "/colmado/cash-registers/open/",
      { store_id: 2, opening_amount: "1000.00", note: "Inicio del turno" },
      { headers },
    );
    expect(apiMocks.post).toHaveBeenNthCalledWith(
      2,
      "/colmado/cash-registers/40/close/",
      { counted_cash: "2500.00", note: "Cierre" },
      { headers },
    );
  });

  it("loads debtors and sends the backend debt filter", async () => {
    const customers = [{ id: 5, name: "María", balance: "300.00" }];
    apiMocks.get.mockResolvedValue({ data: customers });

    await expect(
      getCustomers(organisationSlug, { search: "María", hasDebt: true }),
    ).resolves.toEqual(customers);
    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/customers/", {
      headers,
      params: { search: "María", has_debt: "true" },
    });
  });

  it("creates and updates a customer inside the selected tenant", async () => {
    apiMocks.post.mockResolvedValue({ data: { id: 5, name: "María" } });
    apiMocks.patch.mockResolvedValue({
      data: { id: 5, name: "María", phone: "8095550000" },
    });

    await createCustomer(organisationSlug, {
      name: "María",
      credit_limit: "1000.00",
    });
    await updateCustomer(organisationSlug, 5, { phone: "8095550000" });

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/customers/",
      { name: "María", credit_limit: "1000.00" },
      { headers },
    );
    expect(apiMocks.patch).toHaveBeenCalledWith(
      "/colmado/customers/5/",
      { phone: "8095550000" },
      { headers },
    );
  });

  it("loads credit history and records an installment for the selected store", async () => {
    const history = [{ id: 1, transaction_type: "charge", amount: "300.00" }];
    apiMocks.get.mockResolvedValue({ data: history });
    apiMocks.post.mockResolvedValue({
      data: { customer: { id: 5, balance: "200.00" }, transaction: { id: 2 } },
    });

    await expect(
      getCustomerCreditHistory(organisationSlug, 5),
    ).resolves.toEqual(history);
    await recordCreditPayment(organisationSlug, 5, {
      store_id: 2,
      amount: "100.00",
      note: "Abono en efectivo",
    });

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/customers/5/history/",
      { headers },
    );
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/customers/5/payments/",
      { store_id: 2, amount: "100.00", note: "Abono en efectivo" },
      { headers },
    );
  });

  it("loads one store order queue with its filters", async () => {
    apiMocks.get.mockResolvedValue({ data: { results: [] } });

    await getCustomerOrders(organisationSlug, {
      store: 2,
      status: "preparing",
      search: "Ana",
    });

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/customer-orders/", {
      headers,
      params: { store: 2, status: "preparing", search: "Ana" },
    });
  });

  it("advances an order through the dedicated status action", async () => {
    apiMocks.post.mockResolvedValue({
      data: { id: 70, status: "ready", status_display: "Listo" },
    });

    await changeCustomerOrderStatus(organisationSlug, 70, "ready");
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/customer-orders/70/set-status/",
      { status: "ready" },
      { headers },
    );
  });

  it("loads active employees from the selected store", async () => {
    const employees = [
      {
        id: 12,
        store: 2,
        name: "Ana Pérez",
        position: "Cajera",
        is_active: true,
      },
    ];
    apiMocks.get.mockResolvedValue({ data: { results: employees } });

    await expect(
      getEmployees(organisationSlug, { store: 2, active: true }),
    ).resolves.toEqual(employees);

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/employees/", {
      headers,
      params: { store: 2, active: "true" },
    });
  });

  it("creates an employee for the selected colmado", async () => {
    const payload = {
      store: 2,
      name: "Ana Pérez",
      phone: "8095551234",
      position: "Cajera",
      pay_frequency: "biweekly" as const,
      pay_amount: "12000.00",
      start_date: "2026-11-01",
      is_active: true,
    };
    apiMocks.post.mockResolvedValue({ data: { id: 12, ...payload } });

    await createEmployee(organisationSlug, payload);

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/employees/",
      payload,
      { headers },
    );
  });

  it("loads and creates operating expenses for one store", async () => {
    const expenses = [
      {
        id: 30,
        store: 2,
        category: "electricity",
        description: "Factura de luz",
        amount: "3500.00",
        expense_date: "2026-11-01",
      },
    ];
    apiMocks.get.mockResolvedValueOnce({ data: { results: expenses } });
    apiMocks.post.mockResolvedValueOnce({ data: expenses[0] });

    await expect(
      getExpenses(organisationSlug, {
        store: 2,
        dateFrom: "2026-11-01",
        dateTo: "2026-11-30",
      }),
    ).resolves.toEqual(expenses);

    await createExpense(organisationSlug, {
      store: 2,
      category: "electricity",
      description: "Factura de luz",
      amount: "3500.00",
      expense_date: "2026-11-01",
    });

    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/expenses/", {
      headers,
      params: {
        store: 2,
        category: undefined,
        date_from: "2026-11-01",
        date_to: "2026-11-30",
      },
    });
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/expenses/",
      {
        store: 2,
        category: "electricity",
        description: "Factura de luz",
        amount: "3500.00",
        expense_date: "2026-11-01",
      },
      { headers },
    );
  });

  it("loads and records payroll payments for one employee", async () => {
    const payments = [
      {
        id: 41,
        store: 2,
        employee: 12,
        employee_name: "Ana Pérez",
        amount: "12000.00",
        period_start: "2026-10-16",
        period_end: "2026-10-31",
        paid_on: "2026-11-01",
        note: "Pago quincenal",
      },
    ];
    apiMocks.get.mockResolvedValueOnce({ data: { results: payments } });
    apiMocks.post.mockResolvedValueOnce({ data: payments[0] });

    await expect(
      getPayrollPayments(organisationSlug, {
        store: 2,
        employee: 12,
      }),
    ).resolves.toEqual(payments);

    await createPayrollPayment(organisationSlug, {
      store: 2,
      employee: 12,
      amount: "12000.00",
      period_start: "2026-10-16",
      period_end: "2026-10-31",
      paid_on: "2026-11-01",
      note: "Pago quincenal",
    });

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/payroll-payments/",
      {
        headers,
        params: {
          store: 2,
          employee: 12,
          date_from: undefined,
          date_to: undefined,
        },
      },
    );
    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/payroll-payments/",
      {
        store: 2,
        employee: 12,
        amount: "12000.00",
        period_start: "2026-10-16",
        period_end: "2026-10-31",
        paid_on: "2026-11-01",
        note: "Pago quincenal",
      },
      { headers },
    );
  });
});
