import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createOrderIdempotencyKey,
  createPublicCustomerOrder,
  getPublicCustomerOrder,
  getPublicStorefront,
  getPublicStorefrontCatalog,
} from "./publicStorefrontClient";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));

const storefront = {
  slug: "colmado-rodrigo",
  display_name: "Colmado Rodrigo",
  description: "Compra fácil y recibe en tu casa.",
  public_phone: "809-555-0101",
  public_address: "Macao, La Altagracia",
  delivery_fee: "100.00",
  minimum_order: "300.00",
  is_accepting_orders: true,
};

const product = {
  id: 15,
  product_name: "Coca-Cola",
  product_display_name: "Coca-Cola 20 oz",
  barcode: "746000000001",
  category: "Bebidas",
  unit: "unit" as const,
  sale_mode: "unit" as const,
  sale_price: "75.00",
  image_url: "https://api.example.com/media/coca-cola.jpg",
};

const order = {
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
  subtotal: "300.00",
  delivery_fee: "100.00",
  total: "400.00",
  maps_url: "https://www.google.com/maps/dir/?api=1&destination=Macao",
  accepted_at: null,
  ready_at: null,
  dispatched_at: null,
  delivered_at: null,
  cancelled_at: null,
  created_at: "2026-11-01T08:00:00Z",
  updated_at: "2026-11-01T08:00:00Z",
  items: [
    {
      id: 9,
      inventory_item_id: 15,
      product_name: "Coca-Cola 20 oz",
      barcode: "746000000001",
      unit: "unit" as const,
      quantity: "4.000",
      unit_price: "75.00",
      line_total: "300.00",
    },
  ],
};

describe("publicStorefrontClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the public storefront without authentication data", async () => {
    apiMocks.get.mockResolvedValueOnce({ data: storefront });

    const result = await getPublicStorefront("  Colmado-Rodrigo  ");

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/public/storefronts/colmado-rodrigo/",
    );
    expect(result).toEqual(storefront);
  });

  it("loads the public product catalog with images and prices", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: { results: [product] },
    });

    const result = await getPublicStorefrontCatalog("colmado-rodrigo");

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/public/storefronts/colmado-rodrigo/catalog/",
    );
    expect(result).toEqual([product]);
  });

  it("also accepts an unpaginated public catalog", async () => {
    apiMocks.get.mockResolvedValueOnce({ data: [product] });

    const result = await getPublicStorefrontCatalog("colmado-rodrigo");

    expect(result).toEqual([product]);
  });

  it("creates a public customer order", async () => {
    apiMocks.post.mockResolvedValueOnce({ data: order });

    const payload = {
      idempotency_key: "pedido-seguro-001",
      customer_name: "Ana Pérez",
      customer_phone: "809-555-1234",
      delivery_address: "Macao, cerca de la iglesia",
      latitude: null,
      longitude: null,
      delivery_notes: "Llamar al llegar",
      items: [
        {
          inventory_item_id: 15,
          quantity: "4.000",
        },
      ],
    };

    const result = await createPublicCustomerOrder(
      "colmado-rodrigo",
      payload,
    );

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/public/storefronts/colmado-rodrigo/orders/",
      payload,
    );
    expect(result).toEqual(order);
  });

  it("sends the customer phone when loading an order for tracking", async () => {
    apiMocks.get.mockResolvedValueOnce({ data: order });

    const result = await getPublicCustomerOrder(
      "colmado-rodrigo",
      order.order_number,
      " 809-555-1234 ",
    );

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/public/storefronts/colmado-rodrigo/orders/" +
        "65fd724d-c072-4aa4-ab66-47a21af8368a/",
      {
        params: {
          phone: "809-555-1234",
        },
      },
    );
    expect(result.status).toBe("new");
  });

  it("creates a non-empty key to prevent duplicate order submissions", () => {
    const firstKey = createOrderIdempotencyKey();
    const secondKey = createOrderIdempotencyKey();

    expect(firstKey.length).toBeGreaterThan(10);
    expect(secondKey.length).toBeGreaterThan(10);
    expect(firstKey).not.toBe(secondKey);
  });

  it("rejects empty storefront, order and phone values", async () => {
    await expect(
      getPublicStorefront("   "),
    ).rejects.toThrow(
      "La dirección pública del colmado es obligatoria.",
    );

    await expect(
      getPublicCustomerOrder("colmado-rodrigo", "   ", "809-555-1234"),
    ).rejects.toThrow(
      "El número del pedido es obligatorio.",
    );

    await expect(
      getPublicCustomerOrder(
        "colmado-rodrigo",
        order.order_number,
        "   ",
      ),
    ).rejects.toThrow(
      "El teléfono utilizado para hacer el pedido es obligatorio.",
    );

    expect(apiMocks.get).not.toHaveBeenCalled();
  });
});
