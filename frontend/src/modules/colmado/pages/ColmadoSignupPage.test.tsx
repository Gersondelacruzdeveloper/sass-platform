import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ColmadoSignupPage from "./ColmadoSignupPage";


const signupApiMocks = vi.hoisted(() => ({
  createColmadoCheckout: vi.fn(),
  getColmadoPlans: vi.fn(),
}));

vi.mock("../api/colmadoSignupClient", () => signupApiMocks);

const completePlan = {
  id: 1,
  name: "Plan Completo",
  slug: "colmado-completo",
  price: "19.00",
  currency: "USD",
  interval: "monthly",
  max_users: 10,
  max_employees: 30,
  max_modules: 3,
  is_active: true,
};


function renderPage() {
  return render(
    <MemoryRouter>
      <ColmadoSignupPage />
    </MemoryRouter>,
  );
}


async function completeForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Tu nombre"), "Juan Pérez");
  await user.type(
    screen.getByLabelText("Nombre del colmado"),
    "Colmado La Esquina",
  );
  await user.type(
    screen.getByLabelText("Teléfono o WhatsApp"),
    "8095550101",
  );
  await user.type(
    screen.getByLabelText("Dirección"),
    "Calle Duarte número 10",
  );
  await user.type(
    screen.getByLabelText("Correo electrónico"),
    "juan@example.com",
  );
  await user.type(
    screen.getByLabelText("Crea una contraseña"),
    "ClaveSegura123",
  );
}


describe("ColmadoSignupPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signupApiMocks.getColmadoPlans.mockResolvedValue([completePlan]);
  });

  it("shows a simple loading state while the plan arrives", () => {
    signupApiMocks.getColmadoPlans.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText("Cargando plan…")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continuar al pago" }),
    ).toBeDisabled();
  });

  it("shows one complete plan for USD 19 per month and per branch", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: "Plan Completo" }),
    ).toBeInTheDocument();
    expect(screen.getByText("US$19 al mes")).toBeInTheDocument();
    expect(screen.getByText("por sucursal")).toBeInTheDocument();
    expect(
      screen.getByText(/Todas las herramientas incluidas/i),
    ).toBeInTheDocument();

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByText("Básico")).not.toBeInTheDocument();
    expect(screen.queryByText("Premium")).not.toBeInTheDocument();
    expect(screen.queryByText("Pro")).not.toBeInTheDocument();
  });

  it("uses the only server-approved plan for checkout", async () => {
    const user = userEvent.setup();
    signupApiMocks.createColmadoCheckout.mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await screen.findByRole("heading", { name: "Plan Completo" });
    await completeForm(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar al pago" }),
    );

    expect(signupApiMocks.createColmadoCheckout).toHaveBeenCalledWith({
      company_name: "Colmado La Esquina",
      owner_name: "Juan Pérez",
      email: "juan@example.com",
      password: "ClaveSegura123",
      plan: "colmado-completo",
      store_name: "Colmado La Esquina",
      store_address: "Calle Duarte número 10",
      store_phone: "8095550101",
    });
  });

  it("disables checkout if the approved plan is unavailable", async () => {
    signupApiMocks.getColmadoPlans.mockResolvedValue([]);

    renderPage();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("El plan no está disponible en este momento.");
    expect(
      screen.getByRole("button", { name: "Continuar al pago" }),
    ).toBeDisabled();
  });

  it("prevents a second click while checkout is being prepared", async () => {
    const user = userEvent.setup();
    signupApiMocks.createColmadoCheckout.mockReturnValue(
      new Promise(() => {}),
    );
    renderPage();

    await screen.findByRole("heading", { name: "Plan Completo" });
    await completeForm(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar al pago" }),
    );

    const preparingButton = screen.getByRole("button", {
      name: "Preparando pago…",
    });
    expect(preparingButton).toBeDisabled();
    expect(signupApiMocks.createColmadoCheckout).toHaveBeenCalledTimes(1);
  });

  it("shows a clear backend error and lets the owner try again", async () => {
    const user = userEvent.setup();
    signupApiMocks.createColmadoCheckout.mockRejectedValue({
      response: {
        data: {
          detail: "Este correo ya está registrado.",
        },
      },
    });
    renderPage();

    await screen.findByRole("heading", { name: "Plan Completo" });
    await completeForm(user);
    await user.click(
      screen.getByRole("button", { name: "Continuar al pago" }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Este correo ya está registrado.");
    expect(
      screen.getByRole("button", { name: "Continuar al pago" }),
    ).toBeEnabled();
  });

  it("links existing owners to the colmado login", async () => {
    renderPage();

    await waitFor(() => {
      expect(signupApiMocks.getColmadoPlans).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByRole("link", { name: "Entrar a mi colmado" }),
    ).toHaveAttribute("href", "/colmado/login");
  });
});
