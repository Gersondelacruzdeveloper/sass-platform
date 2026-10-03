import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PlatformCatalogPanel from "./PlatformCatalogPanel";


const catalogMocks = vi.hoisted(() => ({
  createPlatformProduct: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  getPlatformCatalog: vi.fn(),
  importPlatformCatalog: vi.fn(),
  updatePlatformProduct: vi.fn(),
}));

vi.mock("../api/platformCatalogClient", () => catalogMocks);

vi.mock("../api/colmadoClient", () => ({
  getApiErrorMessage: (_error: unknown, fallback?: string) =>
    fallback || "No pudimos completar la operación.",
}));


const product = {
  id: 12,
  internal_reference: "65fd724d-c072-4aa4-ab66-47a21af8368a",
  barcode: "5449000000996",
  name: "Coca-Cola",
  brand: "Coca-Cola",
  presentation: "330 ml",
  category: "Bebidas",
  unit: "unit" as const,
  sale_mode: "unit" as const,
  units_per_case: 24,
  image_url: null as string | null,
  display_name: "Coca-Cola 330 ml",
  is_active: true,
};


describe("PlatformCatalogPanel product images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the downloaded product image", async () => {
    const imageUrl = (
      "https://api.puntacanadiscovery.com/" +
      "media/colmado/products/5449000000996.jpg"
    );

    catalogMocks.getPlatformCatalog.mockResolvedValue([
      {
        ...product,
        image_url: imageUrl,
      },
    ]);

    render(<PlatformCatalogPanel />);

    const image = await screen.findByRole("img", {
      name: "Foto de Coca-Cola 330 ml",
    });

    expect(image).toHaveAttribute("src", imageUrl);
    expect(image).toHaveAttribute("loading", "lazy");
  });

  it("shows a simple pending state when the image is missing", async () => {
    catalogMocks.getPlatformCatalog.mockResolvedValue([
      {
        ...product,
        image_url: null,
      },
    ]);

    render(<PlatformCatalogPanel />);

    expect(
      await screen.findByRole("img", {
        name: "Sin foto para Coca-Cola 330 ml",
      }),
    ).toHaveTextContent("Sin foto");
  });
});
