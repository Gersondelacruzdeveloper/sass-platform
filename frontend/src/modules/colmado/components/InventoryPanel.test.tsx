import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { InventoryItem, Store } from "../types/colmado";
import InventoryPanel from "./InventoryPanel";

const apiMocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  findCatalogProductByBarcode: vi.fn(),
  addInitialInventoryItem: vi.fn(),
  receiveInventoryCases: vi.fn(),
  getApiErrorMessage: vi.fn(
    (_error: unknown, fallback?: string) => fallback || "Error de prueba",
  ),
}));

vi.mock("../api/colmadoClient", () => apiMocks);

vi.mock("./BarcodeScannerModal", () => ({
  default: ({
    open,
    onDetected,
  }: {
    open: boolean;
    onDetected: (barcode: string) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onDetected("746000000001")}>
        Simular escaneo
      </button>
    ) : null,
}));

const store: Store = {
  id: 2,
  name: "Colmado Macao",
  address: "Macao",
  phone: "809-555-0000",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

function inventoryItem(
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id: 10,
    store: 2,
    master_product: 100,
    product_name: "Coca-Cola",
    product_display_name: "Coca-Cola 12 oz",
    barcode: "746000000001",
    brand: "Coca-Cola",
    presentation: "12 oz",
    category: "Bebidas",
    unit: "unit",
    sale_mode: "unit",
    units_per_case: 24,
    image_url: null,
    cost_price: "35.00",
    sale_price: "50.00",
    quantity: "48.000",
    reorder_level: "12.000",
    low_stock: false,
    stock_value: "1680.00",
    profit_per_unit: "15.00",
    is_quick_sale: true,
    is_active: true,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

const rice = inventoryItem({
  id: 11,
  master_product: 101,
  product_name: "Arroz Selecto",
  product_display_name: "Arroz Selecto 1 lb",
  barcode: "746000000002",
  brand: "Selecto",
  presentation: "1 lb",
  category: "Comida",
  cost_price: "30.00",
  sale_price: "40.00",
  quantity: "3.000",
  reorder_level: "5.000",
  low_stock: true,
  units_per_case: 12,
});

describe("InventoryPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
    apiMocks.getInventory.mockResolvedValue([inventoryItem(), rice]);
  });

  it("loads the inventory only for the selected store", async () => {
    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
      />,
    );

    expect(await screen.findByText("Coca-Cola 12 oz")).toBeInTheDocument();
    expect(screen.getByText("Arroz Selecto 1 lb")).toBeInTheDocument();
    expect(apiMocks.getInventory).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2 },
    );
  });

  it("searches locally by product name or barcode", async () => {
    const user = userEvent.setup();
    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
      />,
    );
    await screen.findByText("Coca-Cola 12 oz");

    await user.type(
      screen.getByRole("textbox", { name: "Buscar en el inventario" }),
      "746000000002",
    );

    expect(screen.getByText("Arroz Selecto 1 lb")).toBeInTheDocument();
    expect(screen.queryByText("Coca-Cola 12 oz")).not.toBeInTheDocument();
  });

  it("shows only products that are running low", async () => {
    const user = userEvent.setup();
    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
      />,
    );
    await screen.findByText("Coca-Cola 12 oz");

    await user.click(
      screen.getByRole("button", { name: "Se está acabando" }),
    );

    expect(screen.getByText("Arroz Selecto 1 lb")).toBeInTheDocument();
    expect(screen.queryByText("Coca-Cola 12 oz")).not.toBeInTheDocument();
  });

  it("finds a catalog product and saves its first inventory count", async () => {
    const user = userEvent.setup();
    const onInventoryChanged = vi.fn();
    apiMocks.findCatalogProductByBarcode.mockResolvedValue({
      id: 103,
      internal_reference: "PLATANO-001",
      barcode: "746000000003",
      name: "Plátano",
      brand: "",
      presentation: "Unidad",
      category: "Víveres",
      unit: "unit",
      sale_mode: "unit",
      units_per_case: 1,
      image_url: null,
      display_name: "Plátano por unidad",
      is_active: true,
    });
    const savedItem = inventoryItem({
      id: 13,
      master_product: 103,
      product_name: "Plátano",
      product_display_name: "Plátano por unidad",
      barcode: "746000000003",
      quantity: "30.000",
      cost_price: "8.00",
      sale_price: "12.00",
      reorder_level: "10.000",
    });
    apiMocks.addInitialInventoryItem.mockResolvedValue({
      ...savedItem,
      already_in_inventory: false,
    });

    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
        onInventoryChanged={onInventoryChanged}
      />,
    );
    await screen.findByText("Coca-Cola 12 oz");
    await user.type(
      screen.getByRole("textbox", { name: "Código de barra" }),
      "746000000003",
    );
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    const form = await screen.findByText("Plátano por unidad");
    const inventoryForm = form.closest("form");
    expect(inventoryForm).not.toBeNull();
    const fields = within(inventoryForm!);
    await user.type(fields.getByLabelText("¿Cuántas unidades tienes?"), "30");
    await user.type(fields.getByLabelText("Costo por unidad (RD$)"), "8");
    await user.type(fields.getByLabelText("Precio de venta (RD$)"), "12");
    await user.clear(fields.getByLabelText("Avísame cuando queden"));
    await user.type(fields.getByLabelText("Avísame cuando queden"), "10");
    await user.click(
      fields.getByRole("button", { name: "Agregar a mi inventario" }),
    );

    await waitFor(() =>
      expect(apiMocks.addInitialInventoryItem).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          store_id: 2,
          barcode: "746000000003",
          quantity: "30",
          cost_price: "8",
          sale_price: "12",
          reorder_level: "10",
          is_quick_sale: false,
        },
      ),
    );
    expect(
      await screen.findByText(
        "Plátano por unidad fue agregado al inventario.",
      ),
    ).toBeInTheDocument();
    expect(onInventoryChanged).toHaveBeenCalledOnce();
  });

  it("does not duplicate an existing barcode and opens receiving instead", async () => {
    const user = userEvent.setup();
    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
      />,
    );
    await screen.findByText("Coca-Cola 12 oz");
    await user.type(
      screen.getByRole("textbox", { name: "Código de barra" }),
      "746000000001",
    );
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(
      await screen.findByText(/ya está en tu inventario/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Recibir mercancía")).toBeInTheDocument();
    expect(apiMocks.findCatalogProductByBarcode).not.toHaveBeenCalled();
    expect(apiMocks.addInitialInventoryItem).not.toHaveBeenCalled();
  });

  it("receives cases and lets the server calculate added units", async () => {
    const user = userEvent.setup();
    const onInventoryChanged = vi.fn();
    apiMocks.receiveInventoryCases.mockResolvedValue({
      ...inventoryItem({ quantity: "120.000" }),
      cases_received: "3",
      units_added: "72.000",
    });
    render(
      <InventoryPanel
        organisationSlug="colmado-don-juan"
        store={store}
        onInventoryChanged={onInventoryChanged}
      />,
    );
    await screen.findByText("Coca-Cola 12 oz");
    await user.type(
      screen.getByRole("textbox", { name: "Código de barra" }),
      "746000000001",
    );
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    const casesInput = await screen.findByLabelText("¿Cuántas cajas llegaron?");
    await user.clear(casesInput);
    await user.type(casesInput, "3");
    expect(screen.getByText("Se agregarán 72 unidades.")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Confirmar cajas recibidas" }),
    );

    await waitFor(() =>
      expect(apiMocks.receiveInventoryCases).toHaveBeenCalledWith(
        "colmado-don-juan",
        10,
        "3",
      ),
    );
    expect(
      await screen.findByText(
        "Listo: agregamos 72.000 unidades de Coca-Cola 12 oz.",
      ),
    ).toBeInTheDocument();
    expect(onInventoryChanged).toHaveBeenCalledOnce();
  });
});
