import {
  render,
  screen,
  waitFor,
  within,
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

import PublicStorefrontPage from "./PublicStorefrontPage";


const publicApiMocks = vi.hoisted(() => ({
  createOrderIdempotencyKey: vi.fn(() => "pedido-prueba-001"),
  createPublicCustomerOrder: vi.fn(),
  getPublicCustomerOrder: vi.fn(),
  getPublicStorefront: vi.fn(),
  getPublicStorefrontCatalog: vi.fn(),
}));


vi.mock(
  "../api/publicStorefrontClient",
  () => publicApiMocks,
);


const storefront = {
  slug: "colmado-rodrigo",
  display_name: "Colmado Rodrigo",
  description: "Compra fácil y recibe en tu casa.",
  public_phone: "809-555-0101",
  public_address: "Macao, La Altagracia",
  delivery_fee: "100.00",
  minimum_order: "150.00",
  is_accepting_orders: true,
};


const products = [
  {
    id: 15,
    product_name: "Coca-Cola",
    product_display_name: "Coca-Cola 20 oz",
    barcode: "746000000001",
    category: "Bebidas",
    unit: "unit" as const,
    sale_mode: "unit" as const,
    sale_price: "75.00",
    image_url: "https://api.example.com/media/coca-cola.jpg",
  },
  {
    id: 22,
    product_name: "Arroz Selecto",
    product_display_name: "Arroz Selecto 1 libra",
    barcode: null,
    category: "Comestibles",
    unit: "lb" as const,
    sale_mode: "weight" as const,
    sale_price: "60.00",
    image_url: null,
  },
];


const completedOrder = {
  order_number: "65fd724d-c072-4aa4-ab66-47a21af8368a",
  store_name: "Colmado Rodrigo",
  customer_name: "Ana Pérez",
  customer_phone: "809-555-1234",
  delivery_address: "Macao, cerca de la iglesia",
  latitude: null,
  longitude: null,
  delivery_notes: "Llamar al llegar",
  status: "new" as const,
  status_display: "Nuevo",
  subtotal: "150.00",
  delivery_fee: "100.00",
  total: "250.00",
  maps_url: "https://www.google.com/maps/dir/?api=1&destination=Macao",
  accepted_at: null,
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  cancelled_at: null,
  created_at: "2026-11-01T08:00:00Z",
  updated_at: "2026-11-01T08:00:00Z",
  items: [],
};


function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/pedir/colmado-rodrigo"]}>
      <Routes>
        <Route
          element={<PublicStorefrontPage />}
          path="/pedir/:slug"
        />
        <Route
          element={<p>Página de seguimiento</p>}
          path="/pedir/:slug/pedido/:orderNumber"
        />
      </Routes>
    </MemoryRouter>,
  );
}


async function productCard(productName: string) {
  const productText = await screen.findByText(productName);
  const card = productText.closest("article");

  if (!card) {
    throw new Error(`No se encontró la tarjeta de ${productName}.`);
  }

  return within(card);
}


describe("PublicStorefrontPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    vi.stubGlobal(
      "scrollTo",
      vi.fn(),
    );

    publicApiMocks.getPublicStorefront.mockResolvedValue(storefront);
    publicApiMocks.getPublicStorefrontCatalog.mockResolvedValue(products);
    publicApiMocks.createPublicCustomerOrder.mockResolvedValue(completedOrder);
  });


  it("loads the public colmado and its available products", async () => {
    renderPage();

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("Cargando el colmado");

    expect(
      await screen.findByRole("heading", {
        name: "Colmado Rodrigo",
      }),
    ).toBeInTheDocument();

    expect(
      publicApiMocks.getPublicStorefront,
    ).toHaveBeenCalledWith("colmado-rodrigo");
    expect(
      publicApiMocks.getPublicStorefrontCatalog,
    ).toHaveBeenCalledWith("colmado-rodrigo");

    expect(
      screen.getByRole("img", {
        name: "Coca-Cola 20 oz",
      }),
    ).toHaveAttribute(
      "src",
      "https://api.example.com/media/coca-cola.jpg",
    );
    expect(
      screen.getByRole("img", {
        name: "Sin foto para Arroz Selecto 1 libra",
      }),
    ).toBeInTheDocument();
  });


  it("searches products and filters them by category", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Coca-Cola 20 oz");

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar productos",
      }),
      "arroz",
    );

    expect(
      screen.getByText("Arroz Selecto 1 libra"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Coca-Cola 20 oz"),
    ).not.toBeInTheDocument();

    await user.clear(
      screen.getByRole("searchbox", {
        name: "Buscar productos",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: "Bebidas",
      }),
    );

    expect(
      screen.getByText("Coca-Cola 20 oz"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Arroz Selecto 1 libra"),
    ).not.toBeInTheDocument();
  });


  it("adds products to the cart and explains the minimum order", async () => {
    const user = userEvent.setup();
    renderPage();

    const cola = await productCard("Coca-Cola 20 oz");
    await user.click(cola.getByRole("button", { name: "Agregar" }));

    expect(
      screen.getByText(/Agrega.*para llegar al pedido mínimo/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText("1 productos"),
    ).toBeInTheDocument();

    await user.click(
      cola.getByRole("button", {
        name: "Agregar Coca-Cola 20 oz",
      }),
    );

    expect(
      screen.queryByText(/para llegar al pedido mínimo/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("2 productos"),
    ).toBeInTheDocument();
  });


  it("requires customer information before sending an order", async () => {
    const user = userEvent.setup();
    renderPage();

    const cola = await productCard("Coca-Cola 20 oz");
    await user.click(cola.getByRole("button", { name: "Agregar" }));
    await user.click(
      cola.getByRole("button", {
        name: "Agregar Coca-Cola 20 oz",
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /Confirmar pedido/i,
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Completa tu nombre, teléfono y dirección de entrega.",
    );
    expect(
      publicApiMocks.createPublicCustomerOrder,
    ).not.toHaveBeenCalled();
  });


  it("sends a complete order and shows its receipt", async () => {
    const user = userEvent.setup();
    renderPage();

    const cola = await productCard("Coca-Cola 20 oz");
    await user.click(cola.getByRole("button", { name: "Agregar" }));
    await user.click(
      cola.getByRole("button", {
        name: "Agregar Coca-Cola 20 oz",
      }),
    );

    await user.type(
      screen.getByLabelText("Nombre *"),
      "Ana Pérez",
    );
    await user.type(
      screen.getByLabelText("Teléfono *"),
      "809-555-1234",
    );
    await user.type(
      screen.getByLabelText("Dirección de entrega *"),
      "Macao, cerca de la iglesia",
    );
    await user.type(
      screen.getByLabelText("Nota para el colmado"),
      "Llamar al llegar",
    );

    await user.click(
      screen.getByRole("button", {
        name: /Confirmar pedido/i,
      }),
    );

    await waitFor(() => {
      expect(
        publicApiMocks.createPublicCustomerOrder,
      ).toHaveBeenCalledWith(
        "colmado-rodrigo",
        {
          idempotency_key: "pedido-prueba-001",
          customer_name: "Ana Pérez",
          customer_phone: "809-555-1234",
          delivery_address: "Macao, cerca de la iglesia",
          latitude: null,
          longitude: null,
          delivery_notes: "Llamar al llegar",
          items: [
            {
              inventory_item_id: 15,
              quantity: "2.000",
            },
          ],
        },
      );
    });

    expect(
      await screen.findByRole("heading", {
        name: "¡Pedido recibido!",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(completedOrder.order_number),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Seguir mi pedido",
      }),
    ).toHaveAttribute(
      "href",
      "/pedir/colmado-rodrigo/pedido/" + completedOrder.order_number,
    );
    expect(
      window.localStorage.getItem(
        "colmado:last-order:colmado-rodrigo",
      ),
    ).toBe(completedOrder.order_number);
    expect(
      window.localStorage.getItem(
        "colmado:order-phone:colmado-rodrigo:" +
          completedOrder.order_number,
      ),
    ).toBe("809-555-1234");
  });


  it("prevents orders while the storefront is paused", async () => {
    publicApiMocks.getPublicStorefront.mockResolvedValueOnce({
      ...storefront,
      is_accepting_orders: false,
    });

    renderPage();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Este colmado está pausado",
    );
    expect(
      (await productCard("Coca-Cola 20 oz")).getByRole(
        "button",
        { name: "Agregar" },
      ),
    ).toBeDisabled();
  });


  it("shows a clear unavailable message when the storefront cannot load", async () => {
    publicApiMocks.getPublicStorefront.mockRejectedValueOnce({
      response: {
        data: {
          detail: "Este colmado no está disponible para pedidos.",
        },
      },
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Colmado no disponible",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "Este colmado no está disponible para pedidos.",
    );
  });
});
