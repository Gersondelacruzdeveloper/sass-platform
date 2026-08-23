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

vi.mock("../seller-onboarding/sellerOnboardingUi", () => ({
  formatMoney: (value: unknown) => String(value ?? ""),
  getApiError: (_error: unknown, fallback: string) => fallback,
}));

const TOKEN = "seller-public-invite-token";
const ORGANISATION_SLUG = "punta-cana-discovery";

const invite = {
  name: "Vendedores Punta Cana Discovery",
  description: "Únete a nuestro equipo de vendedores.",
  organisation_name: "Punta Cana Discovery",
  default_role: "seller",
  default_commission_type: "percentage",
  default_commission_rate: "15.00",
  default_fixed_commission_amount: "0.00",
  default_margin_percent: "0.00",
  default_max_customer_discount_percent: "0.00",
  show_commission_offer: true,
  allowed_products: [
    { id: 1, name: "Saona Island", product_type: "excursion" },
  ],
  allowed_product_types: [],
  require_profile_photo: false,
  require_identification: false,
  terms_version: "2026-01",
  expires_at: null,
  is_available: true,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/seller-apply/${TOKEN}`]}>
      <Routes>
        <Route
          path="/seller-apply/:token"
          element={<PublicSellerApplicationPage />}
        />
        <Route
          path="/ticketing/:organisationSlug/login"
          element={<div>Seller login reached</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

async function fillBasicForm() {
  const user = userEvent.setup();

  await screen.findByRole("heading", {
    name: "Crea tu cuenta de vendedor",
  });

  await user.type(
    screen.getByLabelText(/Nombre completo/i),
    "Juan Pérez",
  );

  await user.type(
    screen.getByLabelText(/^Email/i),
    "juan@example.com",
  );

  await user.type(
    screen.getByLabelText(/WhatsApp \/ teléfono/i),
    "+18095551234",
  );

  const passwordInputs = screen.getAllByDisplayValue("");
  const passwordFields = passwordInputs.filter(
    (element) =>
      element instanceof HTMLInputElement &&
      element.type === "password",
  );

  if (passwordFields.length !== 2) {
    throw new Error("Expected exactly two password inputs.");
  }

  await user.type(passwordFields[0], "SellerPassword123!");
  await user.type(passwordFields[1], "SellerPassword123!");

  await user.click(
    screen.getByRole("checkbox"),
  );

  return user;
}

describe("PublicSellerApplicationPage fast seller signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    apiMocks.getPublicSellerSignupInvite.mockResolvedValue(invite);
    apiMocks.submitPublicSellerApplication.mockResolvedValue({
      id: 77,
      status: "pending",
      organisation: "Punta Cana Discovery",
      organisation_slug: ORGANISATION_SLUG,
      message: "Your seller application was submitted for review.",
    });

    Object.defineProperty(window, "scrollTo", {
      value: vi.fn(),
      writable: true,
    });
  });

  it("loads the public seller invitation using the URL token", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Crea tu cuenta de vendedor",
      }),
    ).toBeInTheDocument();

    expect(
      apiMocks.getPublicSellerSignupInvite,
    ).toHaveBeenCalledTimes(1);

    expect(
      apiMocks.getPublicSellerSignupInvite,
    ).toHaveBeenCalledWith(TOKEN);
  });

  it("shows only the fast signup fields when optional verification is disabled", async () => {
    renderPage();

    await screen.findByRole("heading", {
      name: "Crea tu cuenta de vendedor",
    });

    expect(
      screen.getByLabelText(/Nombre completo/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/^Email/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/WhatsApp \/ teléfono/i),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Experiencia como vendedor"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Website"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Instagram URL"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Facebook URL"),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText("Verifica tu identidad"),
    ).not.toBeInTheDocument();
  });

  it("submits the fast form while preserving safe backend defaults", async () => {
    renderPage();

    const user = await fillBasicForm();

    await user.click(
      screen.getByRole("button", {
        name: "Crear mi cuenta de vendedor",
      }),
    );

    await waitFor(() => {
      expect(
        apiMocks.submitPublicSellerApplication,
      ).toHaveBeenCalledTimes(1);
    });

    expect(
      apiMocks.submitPublicSellerApplication,
    ).toHaveBeenCalledWith(
      TOKEN,
      expect.objectContaining({
        legal_name: "Juan Pérez",
        display_name: "Juan Pérez",
        email: "juan@example.com",
        phone: "+18095551234",
        whatsapp: "+18095551234",
        password: "SellerPassword123!",
        password_confirm: "SellerPassword123!",
        terms_accepted: true,

        country: "Dominican Republic",
        preferred_language: "es",
        seller_type: "independent",

        business_name: "",
        biography: "",
        languages: [],
        product_interests: [],
        website_url: "",
        instagram_url: "",
        facebook_url: "",
        identification_type: "",
        identification_number: "",
        identification_front: null,
        identification_back: null,
        verification_selfie: null,
        applicant_message: "",
      }),
    );
  });

  it("blocks submission when the passwords do not match", async () => {
    renderPage();

    const user = userEvent.setup();

    await screen.findByRole("heading", {
      name: "Crea tu cuenta de vendedor",
    });

    await user.type(
      screen.getByLabelText(/Nombre completo/i),
      "Juan Pérez",
    );

    await user.type(
      screen.getByLabelText(/^Email/i),
      "juan@example.com",
    );

    await user.type(
      screen.getByLabelText(/WhatsApp \/ teléfono/i),
      "+18095551234",
    );

    const passwordFields = Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[type="password"]',
      ),
    );

    await user.type(passwordFields[0], "SellerPassword123!");
    await user.type(passwordFields[1], "DifferentPassword123!");
    await user.click(screen.getByRole("checkbox"));

    await user.click(
      screen.getByRole("button", {
        name: "Crear mi cuenta de vendedor",
      }),
    );

    expect(
      await screen.findByText("Las contraseñas no coinciden."),
    ).toBeInTheDocument();

    expect(
      apiMocks.submitPublicSellerApplication,
    ).not.toHaveBeenCalled();
  });

  it("uses organisation_slug in the login link after successful registration", async () => {
    renderPage();

    const user = await fillBasicForm();

    await user.click(
      screen.getByRole("button", {
        name: "Crear mi cuenta de vendedor",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Ya puedes iniciar sesión",
      }),
    ).toBeInTheDocument();

    const loginLink = screen.getByRole("link", {
      name: /Iniciar sesión/i,
    });

    expect(loginLink).toHaveAttribute(
      "href",
      `/ticketing/${ORGANISATION_SLUG}/login`,
    );
  });

  it("requires the configured identity fields when the invitation requires identification", async () => {
    apiMocks.getPublicSellerSignupInvite.mockResolvedValue({
      ...invite,
      require_identification: true,
      require_profile_photo: true,
    });

    renderPage();

    await screen.findByRole("heading", {
      name: "Crea tu cuenta de vendedor",
    });

    expect(
      screen.getByText("Verifica tu identidad"),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Tipo de identificación/i),
    ).toBeRequired();

    expect(
      screen.getByLabelText(/Número de identificación/i),
    ).toBeRequired();

    expect(
      screen.getByLabelText(/Foto frontal de la identificación/i),
    ).toBeRequired();
  });
});
