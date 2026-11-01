import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import PublicOrderTrackingPage from "./PublicOrderTrackingPage";


const publicApiMocks = vi.hoisted(() => ({
  getPublicCustomerOrder: vi.fn(),
}));


vi.mock(
  "../api/publicStorefrontClient",
  () => publicApiMocks,
);


const orderNumber = "65fd724d-c072-4aa4-ab66-47a21af8368a";


const order = {
  order_number: orderNumber,
  store_name: "Colmado Rodrigo",
  customer_name: "Ana Pérez",
  customer_phone: "809-555-1234",
  delivery_address: "Macao, cerca de la iglesia",
  latitude: null,
  longitude: null,
  delivery_notes: "Llamar al llegar",
  status: "preparing" as const,
  status_display: "Preparando",
  subtotal: "150.00",
  delivery_fee: "100.00",
  total: "250.00",
  maps_url: "https://www.google.com/maps/dir/?api=1&destination=Macao",
  accepted_at: "2026-11-01T08:05:00Z",
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  cancelled_at: null,
  created_at: "2026-11-01T08:00:00Z",
  updated_at: "2026-11-01T08:05:00Z",
  items: [
    {
      id: 9,
      inventory_item_id: 15,
      product_name: "Coca-Cola 20 oz",
      barcode: "746000000001",
      unit: "unit" as const,
      quantity: "2.000",
      unit_price: "75.00",
      line_total: "150.00",
    },
  ],
};


function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        `/pedir/colmado-rodrigo/pedido/${orderNumber}`,
      ]}
    >
      <Routes>
        <Route
          element={<PublicOrderTrackingPage />}
          path="/pedir/:slug/pedido/:orderNumber"
        />
        <Route
          element={<p>Página del colmado</p>}
          path="/pedir/:slug"
        />
      </Routes>
    </MemoryRouter>,
  );
}


describe("PublicOrderTrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.localStorage.setItem(
      `colmado:order-phone:colmado-rodrigo:${orderNumber}`,
      "809-555-1234",
    );
    publicApiMocks.getPublicCustomerOrder.mockResolvedValue(order);
  });


  it("loads and displays the public order progress", async () => {
    renderPage();

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("Consultando tu pedido");

    expect(
      await screen.findByRole("heading", {
        name: "Sigue tu pedido",
      }),
    ).toBeInTheDocument();

    expect(
      publicApiMocks.getPublicCustomerOrder,
    ).toHaveBeenCalledWith(
      "colmado-rodrigo",
      orderNumber,
      "809-555-1234",
    );
    expect(
      screen.getByRole("heading", {
        name: "Preparando",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Coca-Cola 20 oz"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Macao, cerca de la iglesia"),
    ).toBeInTheDocument();

    const currentStep = document.querySelector(
      '[aria-current="step"]',
    );
    expect(currentStep).toHaveTextContent("Preparando");
  });


  it("asks for the phone when the order is opened on another device", async () => {
    const user = userEvent.setup();
    window.localStorage.clear();

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Consulta tu pedido",
      }),
    ).toBeInTheDocument();
    expect(
      publicApiMocks.getPublicCustomerOrder,
    ).not.toHaveBeenCalled();

    await user.type(
      screen.getByLabelText("Teléfono del pedido"),
      "809-555-1234",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Ver mi pedido",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Sigue tu pedido",
      }),
    ).toBeInTheDocument();
    expect(
      publicApiMocks.getPublicCustomerOrder,
    ).toHaveBeenCalledWith(
      "colmado-rodrigo",
      orderNumber,
      "809-555-1234",
    );
    expect(
      window.localStorage.getItem(
        `colmado:order-phone:colmado-rodrigo:${orderNumber}`,
      ),
    ).toBe("809-555-1234");
  });


  it("lets the customer refresh and see the new status", async () => {
    const user = userEvent.setup();
    publicApiMocks.getPublicCustomerOrder
      .mockResolvedValueOnce(order)
      .mockResolvedValueOnce({
        ...order,
        status: "ready",
        status_display: "Listo",
        ready_at: "2026-11-01T08:15:00Z",
        updated_at: "2026-11-01T08:15:00Z",
      });

    renderPage();

    await screen.findByRole("heading", {
      name: "Preparando",
    });
    await user.click(
      screen.getByRole("button", {
        name: "Actualizar estado",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Listo",
      }),
    ).toBeInTheDocument();
    expect(
      publicApiMocks.getPublicCustomerOrder,
    ).toHaveBeenCalledTimes(2);
  });


  it("shows the complete order summary and return link", async () => {
    renderPage();

    await screen.findByText("Coca-Cola 20 oz");

    expect(
      screen.getByText("2 ×", { exact: false }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Volver a Colmado Rodrigo",
      }),
    ).toHaveAttribute(
      "href",
      "/pedir/colmado-rodrigo",
    );
  });


  it("shows a clear cancelled-order state", async () => {
    publicApiMocks.getPublicCustomerOrder.mockResolvedValueOnce({
      ...order,
      status: "cancelled",
      status_display: "Cancelado",
      cancelled_at: "2026-11-01T08:10:00Z",
      updated_at: "2026-11-01T08:10:00Z",
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Pedido cancelado",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Estado actual",
      }),
    ).not.toBeInTheDocument();
  });


  it("lets the customer correct the phone when the order cannot be loaded", async () => {
    publicApiMocks.getPublicCustomerOrder.mockRejectedValueOnce({
      response: {
        data: {
          detail: "No encontramos este pedido.",
        },
      },
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Consulta tu pedido",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent("No encontramos este pedido.");
    expect(
      screen.getByLabelText("Teléfono del pedido"),
    ).toHaveValue("809-555-1234");
    expect(
      screen.getByRole("link", {
        name: "Volver al colmado",
      }),
    ).toHaveAttribute(
      "href",
      "/pedir/colmado-rodrigo",
    );
  });
});
