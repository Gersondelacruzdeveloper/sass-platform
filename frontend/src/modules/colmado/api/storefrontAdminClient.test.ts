import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createStorefrontConfiguration,
  getStorefrontConfigurations,
  updateStorefrontConfiguration,
} from "./storefrontAdminClient";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));

const storefront = {
  id: 1,
  store: 2,
  store_name: "colmado rodrigo",
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

const payload = {
  store: 2,
  slug: "colmado-rodrigo",
  display_name: "Colmado Rodrigo",
  description: "Haz tu pedido fácil y rápido.",
  public_phone: "809-555-1234",
  public_address: "Macao, La Altagracia",
  delivery_fee: "100.00",
  minimum_order: "300.00",
  is_accepting_orders: true,
  is_active: true,
};

const organisationHeaders = {
  headers: {
    "X-Organisation-Slug": "colmado-rodrigo",
  },
};

describe("storefrontAdminClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the storefront configurations for the selected organisation", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: { results: [storefront] },
    });

    const result = await getStorefrontConfigurations("colmado-rodrigo");

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/storefronts/",
      organisationHeaders,
    );
    expect(result).toEqual([storefront]);
  });

  it("accepts an unpaginated storefront response", async () => {
    apiMocks.get.mockResolvedValueOnce({ data: [storefront] });

    const result = await getStorefrontConfigurations("colmado-rodrigo");

    expect(result).toEqual([storefront]);
  });

  it("creates the public storefront for one store", async () => {
    apiMocks.post.mockResolvedValueOnce({ data: storefront });

    const result = await createStorefrontConfiguration(
      "colmado-rodrigo",
      payload,
    );

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/storefronts/",
      payload,
      organisationHeaders,
    );
    expect(result).toEqual(storefront);
  });

  it("updates only the selected storefront settings", async () => {
    apiMocks.patch.mockResolvedValueOnce({
      data: {
        ...storefront,
        is_accepting_orders: false,
      },
    });

    const result = await updateStorefrontConfiguration(
      "colmado-rodrigo",
      1,
      { is_accepting_orders: false },
    );

    expect(apiMocks.patch).toHaveBeenCalledWith(
      "/colmado/storefronts/1/",
      { is_accepting_orders: false },
      organisationHeaders,
    );
    expect(result.is_accepting_orders).toBe(false);
  });

  it("rejects a request without an organisation", async () => {
    await expect(
      getStorefrontConfigurations("   "),
    ).rejects.toThrow("Debe seleccionar una organización.");

    expect(apiMocks.get).not.toHaveBeenCalled();
  });
});
