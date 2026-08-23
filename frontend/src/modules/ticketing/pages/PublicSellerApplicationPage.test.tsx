import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PublicSellerApplicationPage from "./PublicSellerApplicationPage";


const apiMocks = vi.hoisted(() => ({
  getPublicSellerSignupInvite: vi.fn(),
  submitPublicSellerApplication: vi.fn(),
}));

vi.mock("../api/ticketingApi", () => ({
  default: apiMocks,
}));


const TOKEN = "seller-public-invite-token";
const ORGANISATION_SLUG = "punta-cana-discovery";

const invite = {
  id: 10,
  token: TOKEN,
  name: "Únete a nuestro equipo de ventas",
  description: "Solicita acceso para vender nuestras excursiones.",
  organisation_name: "Punta Cana Discovery",
  organisation_slug: ORGANISATION_SLUG,
  is_available: true,
  default_role: "seller",
  default_commission_type: "percentage",
  default_commission_rate: "15.00",
  default_fixed_commission_amount: "0.00",
  default_margin_percent: "15.00",
  default_max_customer_discount_percent: "10.00",
  default_permissions: {
    can_access_dashboard: true,
    can_create_bookings: true,
    can_view_own_sales: true,
    can_view_own_commissions: true,
  },
  allowed_products: [],
  allowed_product_types: ["excursion"],
  require_profile_photo: false,
  require_identification: false,
  show_commission_offer: true,
  terms_version: "seller-terms-v1",
  max_uses: 20,
  used_count: 0,
};


function renderApplicationPage() {
  return render(
    <MemoryRouter initialEntries={[`/seller-apply/${TOKEN}`]}>
      <Routes>
        <Route
          path="/seller-apply/:token"
          element={<PublicSellerApplicationPage />}
        />
        <Route
          path="/ticketing/:organisationSlug/login"
          element={<div>Página de login del vendedor</div>}
        />
        <Route
          path="/ticketing"
          element={<div>Launcher genérico</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}


async function completeRequiredApplicationFields() {
  const user = userEvent.setup();

  await user.type(
    screen.getByLabelText(/Nombre completo/i),
    "Juan Pérez"
  );
  await user.type(
    screen.getByLabelText(/^Email/i),
    "juan.perez@example.com"
  );
  await user.type(
    screen.getByLabelText(/Número de teléfono/i),
    "+18095550123"
  );
  await user.type(
    screen.getByLabelText(/Crear contraseña/i),
    "SellerPassword123!"
  );
  await user.type(
    screen.getByLabelText(/Confirmar contraseña/i),
    "SellerPassword123!"
  );

  await user.click(
    screen.getByRole("checkbox")
  );

  return user;
}


describe("PublicSellerApplicationPage seller login redirect", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });

    apiMocks.getPublicSellerSignupInvite.mockResolvedValue(invite);
  });

  it("loads the public seller invitation using the URL token", async () => {
    renderApplicationPage();

    expect(
      await screen.findByRole("heading", {
        name: "Solicita ser vendedor autorizado",
      })
    ).toBeInTheDocument();

    expect(apiMocks.getPublicSellerSignupInvite).toHaveBeenCalledTimes(1);
    expect(apiMocks.getPublicSellerSignupInvite).toHaveBeenCalledWith(TOKEN);
  });

  it("uses organisation_slug in the login link after a successful application", async () => {
    apiMocks.submitPublicSellerApplication.mockResolvedValue({
      id: 501,
      status: "pending",
      organisation: "Punta Cana Discovery",
      organisation_slug: ORGANISATION_SLUG,
      message: "Your seller application was submitted for review.",
    });

    renderApplicationPage();

    await screen.findByRole("heading", {
      name: "Solicita ser vendedor autorizado",
    });

    const user = await completeRequiredApplicationFields();

    await user.click(
      screen.getByRole("button", {
        name: /Enviar solicitud de vendedor/i,
      })
    );

    await waitFor(() => {
      expect(apiMocks.submitPublicSellerApplication).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByRole("heading", {
        name: "Gracias por solicitar ser vendedor",
      })
    ).toBeInTheDocument();

    const loginLink = screen.getByRole("link", {
      name: /Iniciar sesión para ver el estado/i,
    });

    expect(loginLink).toHaveAttribute(
      "href",
      `/ticketing/${ORGANISATION_SLUG}/login`
    );
    expect(screen.queryByText("Launcher genérico")).not.toBeInTheDocument();
  });

  it("passes the entered credentials and terms acceptance to the API", async () => {
    apiMocks.submitPublicSellerApplication.mockResolvedValue({
      id: 502,
      status: "pending",
      organisation: "Punta Cana Discovery",
      organisation_slug: ORGANISATION_SLUG,
      message: "Your seller application was submitted for review.",
    });

    renderApplicationPage();

    await screen.findByRole("heading", {
      name: "Solicita ser vendedor autorizado",
    });

    const user = await completeRequiredApplicationFields();

    await user.click(
      screen.getByRole("button", {
        name: /Enviar solicitud de vendedor/i,
      })
    );

    await waitFor(() => {
      expect(apiMocks.submitPublicSellerApplication).toHaveBeenCalledTimes(1);
    });

    expect(apiMocks.submitPublicSellerApplication).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({
        legal_name: "Juan Pérez",
        email: "juan.perez@example.com",
        phone: "+18095550123",
        password: "SellerPassword123!",
        password_confirm: "SellerPassword123!",
        terms_accepted: true,
      })
    );
  });
});
