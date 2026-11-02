import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Customer, InventoryItem, Store } from "../types/colmado";
import SalePanel from "./SalePanel";

const apiMocks = vi.hoisted(() => ({
  getInventory: vi.fn(),
  getCustomers: vi.fn(),
  createSale: vi.fn(),
  getApiErrorMessage: vi.fn(
    (_error: unknown, fallback?: string) => fallback || "Error de prueba",
  ),
}));

const scannerMocks = vi.hoisted(() => ({
  decodeFromVideoDevice: vi.fn(),
  stop: vi.fn(),
  callback: null as null | ((
    result: { getText: () => string } | null,
    error: unknown,
    controls: { stop: () => void },
  ) => void),
}));

vi.mock("../api/colmadoClient", () => apiMocks);

vi.mock("@zxing/browser", () => ({
  BrowserMultiFormatReader: class BrowserMultiFormatReader {
    decodeFromVideoDevice(
      deviceId: string | undefined,
      video: HTMLVideoElement,
      callback: (
        result: { getText: () => string } | null,
        error: unknown,
        controls: { stop: () => void },
      ) => void,
    ) {
      scannerMocks.decodeFromVideoDevice(deviceId, video, callback);
      scannerMocks.callback = callback;
      return Promise.resolve({ stop: scannerMocks.stop });
    }
  },
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

const soda: InventoryItem = {
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
  quantity: "5.000",
  reorder_level: "2.000",
  low_stock: false,
  stock_value: "175.00",
  profit_per_unit: "15.00",
  is_quick_sale: true,
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const customer: Customer = {
  id: 8,
  name: "Ana Pérez",
  phone: "809-555-1234",
  address: "Macao",
  notes: "",
  credit_limit: "1000.00",
  balance: "100.00",
  available_credit: "900.00",
  is_active: true,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

function renderSale(
  options: {
    cashRegisterOpen?: boolean;
    onOpenCashRegister?: () => void;
    onSaleCompleted?: () => void | Promise<void>;
  } = {},
) {
  return render(
    <SalePanel
      organisationSlug="colmado-don-juan"
      store={store}
      cashRegisterOpen={options.cashRegisterOpen ?? true}
      onOpenCashRegister={options.onOpenCashRegister ?? vi.fn()}
      onSaleCompleted={options.onSaleCompleted ?? vi.fn()}
    />,
  );
}

async function addSoda(user: ReturnType<typeof userEvent.setup>) {
  const productButton = await screen.findByRole("button", {
    name: /Coca-Cola 12 oz/i,
  });
  await user.click(productButton);
}

describe("SalePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    scannerMocks.callback = null;
    apiMocks.getApiErrorMessage.mockImplementation(
      (_error: unknown, fallback?: string) => fallback || "Error de prueba",
    );
    apiMocks.getInventory.mockResolvedValue([soda]);
    apiMocks.getCustomers.mockResolvedValue([customer]);
  });

  it("blocks the POS while the cash register is closed", async () => {
    const user = userEvent.setup();
    const onOpenCashRegister = vi.fn();
    renderSale({ cashRegisterOpen: false, onOpenCashRegister });

    expect(
      screen.getByRole("heading", { name: "Abre la caja para vender" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Abrir caja" }));

    expect(onOpenCashRegister).toHaveBeenCalledOnce();
    expect(apiMocks.createSale).not.toHaveBeenCalled();
  });

  it("loads products and customers for the selected store and tenant", async () => {
    renderSale();

    expect(
      await screen.findByRole("button", { name: /Coca-Cola 12 oz/i }),
    ).toBeInTheDocument();
    expect(apiMocks.getInventory).toHaveBeenCalledWith(
      "colmado-don-juan",
      { store: 2 },
    );
    expect(apiMocks.getCustomers).toHaveBeenCalledWith("colmado-don-juan");
  });

  it("shows the platform product image in the sale card", async () => {
    apiMocks.getInventory.mockResolvedValue([
      {
        ...soda,
        image_url:
          "https://media.puntacanadiscovery.com/colmado/products/coca.webp",
      },
    ]);

    renderSale();

    const image = await screen.findByRole("img", {
      name: "Coca-Cola 12 oz",
    });
    expect(image).toHaveAttribute(
      "src",
      "https://media.puntacanadiscovery.com/colmado/products/coca.webp",
    );
  });

  it("shows a simple fallback when the product has no image", async () => {
    renderSale();

    expect(
      await screen.findByRole("img", {
        name: "Sin foto de Coca-Cola 12 oz",
      }),
    ).toHaveTextContent("Sin foto");
  });

  it("adds products and changes their quantity without exceeding stock", async () => {
    const user = userEvent.setup();
    renderSale();
    await addSoda(user);

    await user.click(
      screen.getByRole("button", { name: "Agregar Coca-Cola" }),
    );
    expect(screen.getByLabelText("Cantidad de Coca-Cola")).toHaveValue(2);

    const quantity = screen.getByLabelText("Cantidad de Coca-Cola");
    fireEvent.change(quantity, { target: { value: "99" } });
    expect(quantity).toHaveValue(5);

    await user.click(
      screen.getByRole("button", { name: "Quitar Coca-Cola" }),
    );
    expect(quantity).toHaveValue(4);
  });

  it("accepts the EAN-13 equivalent of a UPC-A entered manually", async () => {
    const user = userEvent.setup();
    renderSale();

    const search = await screen.findByPlaceholderText(
      "Buscar por nombre o código",
    );
    await user.type(search, `0${soda.barcode}{Enter}`);

    expect(
      await screen.findByLabelText("Cantidad de Coca-Cola"),
    ).toHaveValue(1);
    expect(search).toHaveValue("");
  });

  it("opens the shared scanner and adds the scanned inventory product once", async () => {
    const user = userEvent.setup();
    renderSale();

    await screen.findByRole("button", { name: /Coca-Cola 12 oz/i });
    await user.click(
      screen.getByRole("button", { name: "Escanear código de barra" }),
    );

    expect(
      screen.getByRole("dialog", {
        name: "Escanear producto para vender",
      }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(scannerMocks.decodeFromVideoDevice).toHaveBeenCalledWith(
        undefined,
        expect.any(HTMLVideoElement),
        expect.any(Function),
      );
    });

    const callback = scannerMocks.callback;
    expect(callback).not.toBeNull();

    act(() => {
      callback?.(
        { getText: () => `0${soda.barcode}` },
        null,
        { stop: scannerMocks.stop },
      );
      callback?.(
        { getText: () => `0${soda.barcode}` },
        null,
        { stop: scannerMocks.stop },
      );
    });

    expect(
      await screen.findByLabelText("Cantidad de Coca-Cola"),
    ).toHaveValue(1);
    expect(scannerMocks.stop).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("explains when a scanned product is not active in store inventory", async () => {
    const user = userEvent.setup();
    renderSale();

    await screen.findByRole("button", { name: /Coca-Cola 12 oz/i });
    await user.click(
      screen.getByRole("button", { name: "Escanear código de barra" }),
    );
    await waitFor(() => expect(scannerMocks.callback).not.toBeNull());

    act(() => {
      scannerMocks.callback?.(
        { getText: () => "9999999999999" },
        null,
        { stop: scannerMocks.stop },
      );
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "no está disponible en el inventario de esta sucursal",
    );
  });

  it("rejects cash that is below the sale total", async () => {
    const user = userEvent.setup();
    renderSale();
    await addSoda(user);
    await user.type(screen.getByLabelText("Efectivo recibido"), "40");
    await user.click(screen.getByRole("button", { name: /Cobrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Faltan");
    expect(apiMocks.createSale).not.toHaveBeenCalled();
  });

  it("completes a cash sale and shows the change to return", async () => {
    const user = userEvent.setup();
    const onSaleCompleted = vi.fn();
    apiMocks.createSale.mockResolvedValue({
      id: 70,
      receipt_number: "V-000070",
      total: "50.00",
      change_due: "50.00",
    });
    renderSale({ onSaleCompleted });
    await addSoda(user);
    await user.type(screen.getByLabelText("Efectivo recibido"), "100");
    await user.click(screen.getByRole("button", { name: /Cobrar/i }));

    await waitFor(() =>
      expect(apiMocks.createSale).toHaveBeenCalledWith(
        "colmado-don-juan",
        {
          store_id: 2,
          payment_method: "cash",
          customer_id: undefined,
          amount_received: "100.00",
          discount: "0.00",
          items: [{ inventory_item_id: 10, quantity: "1.000" }],
        },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Venta lista. Devuelve",
    );
    expect(onSaleCompleted).toHaveBeenCalledOnce();
    expect(
      screen.getByText("Escanea o toca un producto"),
    ).toBeInTheDocument();
  });

  it("requires a customer before completing a credit sale", async () => {
    const user = userEvent.setup();
    apiMocks.createSale.mockResolvedValue({
      id: 71,
      receipt_number: "V-000071",
      total: "50.00",
      change_due: "0.00",
    });
    renderSale();
    await addSoda(user);
    await user.click(screen.getByRole("button", { name: "Fiado" }));
    await user.click(screen.getByRole("button", { name: /Cobrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Selecciona el cliente",
    );
    expect(apiMocks.createSale).not.toHaveBeenCalled();

    await user.selectOptions(screen.getByLabelText("Cliente del fiado"), "8");
    await user.click(screen.getByRole("button", { name: /Cobrar/i }));

    await waitFor(() =>
      expect(apiMocks.createSale).toHaveBeenCalledWith(
        "colmado-don-juan",
        expect.objectContaining({
          store_id: 2,
          payment_method: "credit",
          customer_id: 8,
          amount_received: undefined,
          items: [{ inventory_item_id: 10, quantity: "1.000" }],
        }),
      ),
    );
  });
});
