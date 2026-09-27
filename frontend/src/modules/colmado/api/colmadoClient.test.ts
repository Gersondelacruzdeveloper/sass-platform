import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  addInitialInventoryItem,
  changeCustomerOrderStatus,
  closeCashRegister,
  createCustomer,
  createSale,
  findCatalogProductByBarcode,
  getCurrentCashRegister,
  getCustomerCreditHistory,
  getCustomerOrders,
  getCustomers,
  getDashboard,
  getInventory,
  getStores,
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

  it("loads the dashboard for one store", async () => {
    const dashboard = { date: "2026-09-26", summary: { revenue: "500.00" } };
    apiMocks.get.mockResolvedValue({ data: dashboard });

    await expect(getDashboard(organisationSlug, 3)).resolves.toBe(dashboard);
    expect(apiMocks.get).toHaveBeenCalledWith("/colmado/dashboard/", {
      headers,
      params: { store: 3 },
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

    await expect(getCurrentCashRegister(organisationSlug, 2)).resolves.toBeNull();
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
});
