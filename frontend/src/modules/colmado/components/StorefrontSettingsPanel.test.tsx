import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { Store } from "../types/colmado";
import StorefrontSettingsPanel from "./StorefrontSettingsPanel";

const storefrontMocks = vi.hoisted(() => ({
  createStorefrontConfiguration: vi.fn(),
  getStorefrontConfigurations: vi.fn(),
  updateStorefrontConfiguration: vi.fn(),
}));

vi.mock(
  "../api/storefrontAdminClient",
  () => storefrontMocks,
);

const store: Store = {
  id: 2,
  name: "Colmado Rodrigo",
  address: "Macao, La Altagracia",
  phone: "809-555-1234",
  is_active: true,
  created_at: "2026-11-01T09:00:00Z",
  updated_at: "2026-11-01T09:00:00Z",
};

const configuration = {
  id: 1,
  store: 2,
  store_name: "Colmado Rodrigo",
  slug: "colmado-rodrigo",
  display_name: "Colmado Rodrigo",
  description: "Haz tu pedido fácil y rápido.",
  public_phone: "809-555-1234",
  public_address: "Macao, La Altagracia",
  delivery_fee: "100.00",
  minimum_order: "300.00",
  is_accepting_orders: true,
  is_active: true,
  created_at: "2026-11-01T09:00:00Z",
  updated_at: "2026-11-01T09:00:00Z",
};

function renderPanel() {
  return render(
    <StorefrontSettingsPanel
      organisationSlug="colmado-rodrigo"
      store={store}
    />,
  );
}

describe("StorefrontSettingsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storefrontMocks.getStorefrontConfigurations.mockResolvedValue([
      configuration,
    ]);
    storefrontMocks.createStorefrontConfiguration.mockResolvedValue(
      configuration,
    );
    storefrontMocks.updateStorefrontConfiguration.mockResolvedValue(
      configuration,
    );

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("loads the selected store public configuration", async () => {
    renderPanel();

    expect(screen.getByRole("status")).toHaveTextContent(
      "Cargando pedidos en línea",
    );

    expect(
      await screen.findByRole("heading", {
        name: "Pedidos en línea",
      }),
    ).toBeInTheDocument();
    expect(
      storefrontMocks.getStorefrontConfigurations,
    ).toHaveBeenCalledWith("colmado-rodrigo");
    expect(screen.getByLabelText("Nombre público *")).toHaveValue(
      "Colmado Rodrigo",
    );
    expect(screen.getByLabelText("Costo de entrega (RD$)")).toHaveValue(100);
    expect(screen.getByText("Tienda publicada")).toBeInTheDocument();
  });

  it("creates a public storefront when the store does not have one", async () => {
    const user = userEvent.setup();
    storefrontMocks.getStorefrontConfigurations.mockResolvedValueOnce([]);

    renderPanel();

    await screen.findByRole("button", {
      name: "Crear tienda pública",
    });
    await user.clear(screen.getByLabelText("Costo de entrega (RD$)"));
    await user.type(screen.getByLabelText("Costo de entrega (RD$)"), "75");
    await user.clear(screen.getByLabelText("Pedido mínimo (RD$)"));
    await user.type(screen.getByLabelText("Pedido mínimo (RD$)"), "250");
    await user.click(
      screen.getByRole("button", {
        name: "Crear tienda pública",
      }),
    );

    await waitFor(() => {
      expect(
        storefrontMocks.createStorefrontConfiguration,
      ).toHaveBeenCalledWith(
        "colmado-rodrigo",
        expect.objectContaining({
          store: 2,
          slug: "colmado-rodrigo",
          display_name: "Colmado Rodrigo",
          delivery_fee: "75",
          minimum_order: "250",
          is_accepting_orders: true,
          is_active: true,
        }),
      );
    });
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Tu tienda pública está lista.");
  });

  it("updates an existing storefront", async () => {
    const user = userEvent.setup();
    storefrontMocks.updateStorefrontConfiguration.mockResolvedValueOnce({
      ...configuration,
      delivery_fee: "125.00",
      is_accepting_orders: false,
    });

    renderPanel();

    await screen.findByText("Tienda publicada");
    const deliveryFee = screen.getByLabelText("Costo de entrega (RD$)");
    await user.clear(deliveryFee);
    await user.type(deliveryFee, "125");
    await user.click(screen.getByLabelText(/Recibir pedidos ahora/i));
    await user.click(
      screen.getByRole("button", {
        name: "Guardar cambios",
      }),
    );

    await waitFor(() => {
      expect(
        storefrontMocks.updateStorefrontConfiguration,
      ).toHaveBeenCalledWith(
        "colmado-rodrigo",
        1,
        expect.objectContaining({
          delivery_fee: "125",
          is_accepting_orders: false,
        }),
      );
    });
    expect(
      await screen.findByRole("status"),
    ).toHaveTextContent("Configuración actualizada.");
  });

  it("copies the public ordering link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderPanel();

    await screen.findByText("Tienda publicada");
    await user.click(
      screen.getByRole("button", {
        name: "Copiar enlace",
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      `${window.location.origin}/pedir/colmado-rodrigo`,
    );
    expect(
      screen.getByRole("button", {
        name: "Copiado",
      }),
    ).toBeInTheDocument();
  });
});
