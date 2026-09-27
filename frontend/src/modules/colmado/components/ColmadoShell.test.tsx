import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { ColmadoSection, Store } from "../types/colmado";
import ColmadoShell from "./ColmadoShell";

const stores: Store[] = [
  {
    id: 2,
    name: "Colmado Macao",
    address: "Macao",
    phone: "809-555-0000",
    is_active: true,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
  },
  {
    id: 3,
    name: "Colmado Verón",
    address: "Verón",
    phone: "809-555-0001",
    is_active: true,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
  },
];

interface RenderOptions {
  section?: ColmadoSection;
  cashRegisterOpen?: boolean;
  refreshing?: boolean;
  onSelectStore?: (storeId: number) => void;
  onSelectSection?: (section: ColmadoSection) => void;
  onRefresh?: () => void;
}

function renderShell(options: RenderOptions = {}) {
  return render(
    <ColmadoShell
      organisationName="Colmados Don Juan"
      stores={stores}
      selectedStoreId={2}
      section={options.section ?? "inicio"}
      cashRegisterOpen={options.cashRegisterOpen ?? false}
      refreshing={options.refreshing ?? false}
      onSelectStore={options.onSelectStore ?? vi.fn()}
      onSelectSection={options.onSelectSection ?? vi.fn()}
      onRefresh={options.onRefresh ?? vi.fn()}
    >
      <p>Contenido principal</p>
    </ColmadoShell>,
  );
}

describe("ColmadoShell", () => {
  it("shows the business, selected store and page content", () => {
    renderShell();

    expect(screen.getByText("Colmados Don Juan")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sucursal actual" })).toHaveValue(
      "2",
    );
    expect(screen.getByText("Contenido principal")).toBeInTheDocument();
  });

  it("lets the employee switch stores from one simple selector", async () => {
    const user = userEvent.setup();
    const onSelectStore = vi.fn();
    renderShell({ onSelectStore });

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sucursal actual" }),
      "3",
    );

    expect(onSelectStore).toHaveBeenCalledWith(3);
  });

  it("connects the refresh button and disables it while updating", async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    const { rerender } = renderShell({ onRefresh });

    await user.click(
      screen.getByRole("button", { name: "Actualizar información" }),
    );
    expect(onRefresh).toHaveBeenCalledOnce();

    rerender(
      <ColmadoShell
        organisationName="Colmados Don Juan"
        stores={stores}
        selectedStoreId={2}
        section="inicio"
        cashRegisterOpen={false}
        refreshing
        onSelectStore={vi.fn()}
        onSelectSection={vi.fn()}
        onRefresh={onRefresh}
      >
        <p>Contenido principal</p>
      </ColmadoShell>,
    );
    expect(
      screen.getByRole("button", { name: "Actualizar información" }),
    ).toBeDisabled();
  });

  it("navigates from both desktop and mobile controls", async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    renderShell({ onSelectSection });

    const inventoryButtons = screen.getAllByRole("button", {
      name: "Inventario",
    });
    expect(inventoryButtons).toHaveLength(2);
    await user.click(inventoryButtons[0]);
    await user.click(inventoryButtons[1]);

    expect(onSelectSection).toHaveBeenNthCalledWith(1, "inventario");
    expect(onSelectSection).toHaveBeenNthCalledWith(2, "inventario");
  });

  it("sends the employee to cash opening when the register is closed", async () => {
    const user = userEvent.setup();
    const onSelectSection = vi.fn();
    renderShell({ cashRegisterOpen: false, onSelectSection });

    const openCashButtons = screen.getAllByRole("button", {
      name: "Abrir caja",
    });
    expect(openCashButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(openCashButtons[0]);

    expect(onSelectSection).toHaveBeenCalledWith("caja");
  });

  it("clearly shows when the register is already open", () => {
    renderShell({ cashRegisterOpen: true, section: "caja" });

    expect(
      screen.getAllByRole("button", { name: "Caja abierta" }).length,
    ).toBeGreaterThanOrEqual(1);
    const cashNavigationIsActive = screen
      .getAllByRole("button", { name: /^Caja/i })
      .some((button) => button.getAttribute("aria-current") === "page");
    expect(cashNavigationIsActive).toBe(true);
  });
});
