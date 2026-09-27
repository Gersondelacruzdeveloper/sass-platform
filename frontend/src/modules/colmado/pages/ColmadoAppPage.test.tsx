import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ColmadoWorkspace } from "../hooks/useColmadoWorkspace";
import type { ColmadoSection, Store } from "../types/colmado";
import ColmadoAppPage from "./ColmadoAppPage";

const workspaceMock = vi.hoisted(() => ({
  current: null as unknown as ColmadoWorkspace,
}));

vi.mock("../hooks/useColmadoWorkspace", () => ({
  useColmadoWorkspace: () => workspaceMock.current,
}));

vi.mock("../components/ColmadoShell", () => ({
  default: ({
    children,
    organisationName,
    onSelectSection,
    onSelectStore,
    onRefresh,
  }: {
    children: ReactNode;
    organisationName: string;
    onSelectSection: (section: ColmadoSection) => void;
    onSelectStore: (storeId: number) => void;
    onRefresh: () => void;
  }) => (
    <div>
      <p>Negocio: {organisationName}</p>
      <nav>
        {(["inicio", "vender", "inventario", "pedidos", "fiado", "caja"] as ColmadoSection[]).map(
          (section) => (
            <button
              key={section}
              type="button"
              onClick={() => onSelectSection(section)}
            >
              Ir a {section}
            </button>
          ),
        )}
      </nav>
      <button type="button" onClick={() => onSelectStore(3)}>
        Seleccionar sucursal 3
      </button>
      <button type="button" onClick={onRefresh}>
        Actualizar todo
      </button>
      {children}
    </div>
  ),
}));

vi.mock("../components/ColmadoHome", () => ({
  default: ({ onNavigate }: { onNavigate: (section: ColmadoSection) => void }) => (
    <div>
      <p>Pantalla de inicio</p>
      <button type="button" onClick={() => onNavigate("vender")}>
        Venta rápida
      </button>
    </div>
  ),
}));

vi.mock("../components/SalePanel", () => ({
  default: ({
    onOpenCashRegister,
    onSaleCompleted,
  }: {
    onOpenCashRegister: () => void;
    onSaleCompleted: () => void | Promise<void>;
  }) => (
    <div>
      <p>Pantalla de venta</p>
      <button type="button" onClick={onOpenCashRegister}>
        Solicitar caja
      </button>
      <button type="button" onClick={() => void onSaleCompleted()}>
        Completar venta simulada
      </button>
    </div>
  ),
}));

vi.mock("../components/InventoryPanel", () => ({
  default: () => <p>Pantalla de inventario</p>,
}));

vi.mock("../components/OrdersPanel", () => ({
  default: () => <p>Pantalla de pedidos</p>,
}));

vi.mock("../components/CreditPanel", () => ({
  default: () => <p>Pantalla de fiado</p>,
}));

vi.mock("../components/CashRegisterPanel", () => ({
  default: () => <p>Pantalla de caja</p>,
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

function baseWorkspace(
  overrides: Partial<ColmadoWorkspace> = {},
): ColmadoWorkspace {
  return {
    stores: [store, { ...store, id: 3, name: "Colmado Verón" }],
    selectedStoreId: 2,
    selectedStore: store,
    dashboard: null,
    cashRegister: null,
    loadingStores: false,
    loadingWorkspace: false,
    error: null,
    selectStore: vi.fn(),
    refreshWorkspace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/colmado/colmado-don-juan"]}>
      <Routes>
        <Route
          path="/colmado/:organisationSlug"
          element={<ColmadoAppPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ColmadoAppPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    workspaceMock.current = baseWorkspace();
  });

  it("shows a clear loading screen while stores are being loaded", () => {
    workspaceMock.current = baseWorkspace({
      loadingStores: true,
      selectedStore: null,
      selectedStoreId: 0,
    });

    renderPage();

    expect(screen.getByText("Abriendo tu colmado...")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de inicio")).not.toBeInTheDocument();
  });

  it("explains what to do when the organisation has no active stores", () => {
    workspaceMock.current = baseWorkspace({
      stores: [],
      selectedStore: null,
      selectedStoreId: 0,
      error: "No hay sucursales activas.",
    });

    renderPage();

    expect(
      screen.getByRole("heading", { name: "Falta crear una sucursal" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No hay sucursales activas.",
    );
  });

  it("opens the simple home screen and formats the organisation name", () => {
    renderPage();

    expect(screen.getByText("Negocio: Colmado Don Juan")).toBeInTheDocument();
    expect(screen.getByText("Pantalla de inicio")).toBeInTheDocument();
  });

  it("navigates between every operational section", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Ir a vender" }));
    expect(screen.getByText("Pantalla de venta")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a inventario" }));
    expect(screen.getByText("Pantalla de inventario")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a pedidos" }));
    expect(screen.getByText("Pantalla de pedidos")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a fiado" }));
    expect(screen.getByText("Pantalla de fiado")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a caja" }));
    expect(screen.getByText("Pantalla de caja")).toBeInTheDocument();
  });

  it("restores the last section used for the same organisation", () => {
    window.localStorage.setItem(
      "colmado:selected-section:colmado-don-juan",
      "fiado",
    );

    renderPage();

    expect(screen.getByText("Pantalla de fiado")).toBeInTheDocument();
    expect(screen.queryByText("Pantalla de inicio")).not.toBeInTheDocument();
  });

  it("connects store selection and refresh actions to the workspace", async () => {
    const user = userEvent.setup();
    const selectStore = vi.fn();
    const refreshWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceMock.current = baseWorkspace({ selectStore, refreshWorkspace });
    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Seleccionar sucursal 3" }),
    );
    await user.click(screen.getByRole("button", { name: "Actualizar todo" }));

    expect(selectStore).toHaveBeenCalledWith(3);
    expect(refreshWorkspace).toHaveBeenCalledOnce();
  });

  it("refreshes the workspace after a completed sale", async () => {
    const user = userEvent.setup();
    const refreshWorkspace = vi.fn().mockResolvedValue(undefined);
    workspaceMock.current = baseWorkspace({ refreshWorkspace });
    renderPage();

    await user.click(screen.getByRole("button", { name: "Ir a vender" }));
    await user.click(
      screen.getByRole("button", { name: "Completar venta simulada" }),
    );

    expect(refreshWorkspace).toHaveBeenCalledOnce();
  });
});
