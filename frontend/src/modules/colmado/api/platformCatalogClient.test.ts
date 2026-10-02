import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlatformProduct,
  downloadCatalogTemplate,
  getCatalogImports,
  getPlatformCatalog,
  importPlatformCatalog,
  updatePlatformProduct,
} from "./platformCatalogClient";


const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));


const product = {
  id: 12,
  internal_reference: "65fd724d-c072-4aa4-ab66-47a21af8368a",
  barcode: "7460123456789",
  name: "Coca-Cola",
  brand: "Coca-Cola",
  presentation: "12 oz",
  category: "Bebidas",
  unit: "unit" as const,
  sale_mode: "unit" as const,
  units_per_case: 24,
  image_url: null,
  display_name: "Coca-Cola Coca-Cola 12 oz",
  is_active: true,
};


const importResult = {
  id: 3,
  import_number: "IMP-000003",
  uploaded_by: 1,
  uploaded_by_name: "Administrador",
  original_filename: "productos.xlsx",
  file_format: "xlsx",
  status: "completed",
  status_display: "Completado",
  total_rows: 10,
  created_products: 8,
  updated_products: 2,
  unchanged_products: 0,
  error_rows: 0,
  errors: [],
  was_successful: true,
  completed_at: "2026-10-02T10:00:00Z",
  created_at: "2026-10-02T10:00:00Z",
  updated_at: "2026-10-02T10:00:00Z",
};


describe("platformCatalogClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads products using simple search filters", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: {
        results: [product],
      },
    });

    const result = await getPlatformCatalog({
      search: "  coca cola  ",
      barcode: " 7460123456789 ",
      category: " Bebidas ",
      active: true,
    });

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/platform-catalog/",
      {
        params: {
          search: "coca cola",
          barcode: "7460123456789",
          category: "Bebidas",
          active: "true",
        },
      },
    );

    expect(result).toEqual([product]);
  });

  it("can request inactive products", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: [],
    });

    await getPlatformCatalog({
      active: false,
    });

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/platform-catalog/",
      {
        params: {
          search: undefined,
          barcode: undefined,
          category: undefined,
          active: "false",
        },
      },
    );
  });

  it("creates a master product", async () => {
    apiMocks.post.mockResolvedValueOnce({
      data: product,
    });

    const payload = {
      barcode: "7460123456789",
      name: "Coca-Cola",
      brand: "Coca-Cola",
      presentation: "12 oz",
      category: "Bebidas",
      unit: "unit" as const,
      sale_mode: "unit" as const,
      units_per_case: 24,
      is_active: true,
    };

    const result = await createPlatformProduct(payload);

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/colmado/platform-catalog/",
      payload,
    );

    expect(result).toEqual(product);
  });

  it("updates only the selected product fields", async () => {
    const updatedProduct = {
      ...product,
      presentation: "2 litros",
    };

    apiMocks.patch.mockResolvedValueOnce({
      data: updatedProduct,
    });

    const result = await updatePlatformProduct(
      12,
      {
        presentation: "2 litros",
      },
    );

    expect(apiMocks.patch).toHaveBeenCalledWith(
      "/colmado/platform-catalog/12/",
      {
        presentation: "2 litros",
      },
    );

    expect(result.presentation).toBe("2 litros");
  });

  it("loads the catalog import history", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: {
        results: [importResult],
      },
    });

    const result = await getCatalogImports();

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/catalog-imports/",
    );

    expect(result).toEqual([importResult]);
  });

  it("uploads the selected catalog file", async () => {
    apiMocks.post.mockResolvedValueOnce({
      data: importResult,
    });

    const file = new File(
      [
        "codigo_barra,nombre\n" +
        "7460123456789,Coca-Cola",
      ],
      "productos.csv",
      {
        type: "text/csv",
      },
    );

    const result = await importPlatformCatalog(file);

    expect(apiMocks.post).toHaveBeenCalledTimes(1);

    const [url, body] = apiMocks.post.mock.calls[0];

    expect(url).toBe(
      "/colmado/catalog-imports/",
    );
    expect(body).toBeInstanceOf(FormData);
    expect(
      (body as FormData).get("file"),
    ).toBe(file);
    expect(result.was_successful).toBe(true);
  });

  it("downloads the Spanish catalog template", async () => {
    const template = new Blob(
      ["codigo_barra,nombre"],
      {
        type: "text/csv",
      },
    );

    apiMocks.get.mockResolvedValueOnce({
      data: template,
    });

    const result = await downloadCatalogTemplate();

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/colmado/catalog-imports/template/",
      {
        responseType: "blob",
      },
    );

    expect(result).toBe(template);
  });
});