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

import PlatformCatalogPanel from "./PlatformCatalogPanel";


const catalogMocks = vi.hoisted(() => ({
  createPlatformProduct: vi.fn(),
  downloadCatalogTemplate: vi.fn(),
  getPlatformCatalog: vi.fn(),
  importPlatformCatalog: vi.fn(),
  updatePlatformProduct: vi.fn(),
}));


vi.mock(
  "../api/platformCatalogClient",
  () => catalogMocks,
);


vi.mock("../api/colmadoClient", () => ({
  getApiErrorMessage: (
    _error: unknown,
    fallback?: string,
  ) => (
    fallback ||
    "No pudimos completar la operación."
  ),
}));


const product = {
  id: 12,
  internal_reference:
    "65fd724d-c072-4aa4-ab66-47a21af8368a",
  barcode: "7460123456789",
  name: "Coca-Cola",
  brand: "Coca-Cola",
  presentation: "12 oz",
  category: "Bebidas",
  unit: "unit" as const,
  sale_mode: "unit" as const,
  units_per_case: 24,
  image_url: null,
  display_name: "Coca-Cola 12 oz",
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


describe("PlatformCatalogPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    catalogMocks.getPlatformCatalog
      .mockResolvedValue([product]);

    catalogMocks.createPlatformProduct
      .mockResolvedValue(product);

    catalogMocks.updatePlatformProduct
      .mockResolvedValue(product);

    catalogMocks.importPlatformCatalog
      .mockResolvedValue(importResult);

    catalogMocks.downloadCatalogTemplate
      .mockResolvedValue(
        new Blob(
          ["codigo_barra,nombre"],
          {
            type: "text/csv",
          },
        ),
      );
  });


  it("loads and shows the master catalog", async () => {
    render(<PlatformCatalogPanel />);

    expect(
      screen.getByRole(
        "heading",
        {
          name: "Catálogo maestro",
        },
      ),
    ).toBeInTheDocument();

    expect(
      await screen.findByText(
        "Coca-Cola 12 oz",
      ),
    ).toBeInTheDocument();

    expect(
      catalogMocks.getPlatformCatalog,
    ).toHaveBeenCalledWith({
      search: "",
    });
  });


  it("searches by product name, brand or barcode", async () => {
    const user = userEvent.setup();

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    await user.type(
      screen.getByLabelText(
        "Buscar productos",
      ),
      "refresco",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Buscar",
        },
      ),
    );

    expect(
      catalogMocks.getPlatformCatalog,
    ).toHaveBeenLastCalledWith({
      search: "refresco",
    });
  });


  it("creates a product with the simple form", async () => {
    const user = userEvent.setup();

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Agregar producto",
        },
      ),
    );

    await user.type(
      screen.getByLabelText("Nombre *"),
      "Arroz selecto",
    );

    await user.type(
      screen.getByLabelText(
        "Código de barra",
      ),
      "7460999999999",
    );

    await user.type(
      screen.getByLabelText("Marca"),
      "Selecto",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Guardar producto",
        },
      ),
    );

    await waitFor(() => {
      expect(
        catalogMocks.createPlatformProduct,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Arroz selecto",
          barcode: "7460999999999",
          brand: "Selecto",
          units_per_case: 1,
          is_active: true,
        }),
      );
    });

    expect(
      await screen.findByText(
        "Producto agregado al catálogo maestro.",
      ),
    ).toBeInTheDocument();
  });


  it("edits an existing product", async () => {
    const user = userEvent.setup();

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Editar",
        },
      ),
    );

    const presentation =
      screen.getByLabelText(
        "Presentación",
      );

    await user.clear(presentation);

    await user.type(
      presentation,
      "2 litros",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Guardar producto",
        },
      ),
    );

    await waitFor(() => {
      expect(
        catalogMocks.updatePlatformProduct,
      ).toHaveBeenCalledWith(
        12,
        expect.objectContaining({
          presentation: "2 litros",
        }),
      );
    });
  });


  it("deactivates an active product", async () => {
    const user = userEvent.setup();

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Desactivar",
        },
      ),
    );

    await waitFor(() => {
      expect(
        catalogMocks.updatePlatformProduct,
      ).toHaveBeenCalledWith(
        12,
        {
          is_active: false,
        },
      );
    });

    expect(
      await screen.findByText(
        "Producto desactivado.",
      ),
    ).toBeInTheDocument();
  });


  it("imports an Excel or CSV catalog", async () => {
    const user = userEvent.setup();

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    const file = new File(
      ["producto"],
      "productos.xlsx",
      {
        type:
          "application/vnd.openxmlformats-" +
          "officedocument.spreadsheetml.sheet",
      },
    );

    await user.upload(
      screen.getByLabelText(
        "Importar Excel o CSV",
      ),
      file,
    );

    await waitFor(() => {
      expect(
        catalogMocks.importPlatformCatalog,
      ).toHaveBeenCalledWith(file);
    });

    expect(
      await screen.findByText(
        "Importación lista: " +
        "8 creados y 2 actualizados.",
      ),
    ).toBeInTheDocument();
  });


  it("downloads the Spanish catalog template", async () => {
    const user = userEvent.setup();

    const createObjectURL = vi.fn(
      () => "blob:catalog-template",
    );

    const revokeObjectURL = vi.fn();

    Object.defineProperty(
      URL,
      "createObjectURL",
      {
        configurable: true,
        value: createObjectURL,
      },
    );

    Object.defineProperty(
      URL,
      "revokeObjectURL",
      {
        configurable: true,
        value: revokeObjectURL,
      },
    );

    vi.spyOn(
      HTMLAnchorElement.prototype,
      "click",
    ).mockImplementation(() => {});

    render(<PlatformCatalogPanel />);

    await screen.findByText(
      "Coca-Cola 12 oz",
    );

    await user.click(
      screen.getByRole(
        "button",
        {
          name: "Descargar plantilla",
        },
      ),
    );

    await waitFor(() => {
      expect(
        catalogMocks.downloadCatalogTemplate,
      ).toHaveBeenCalledTimes(1);

      expect(
        createObjectURL,
      ).toHaveBeenCalledTimes(1);

      expect(
        revokeObjectURL,
      ).toHaveBeenCalledWith(
        "blob:catalog-template",
      );
    });
  });
});