import {
  render,
  screen,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import ColmadoSubscriptionSuccessPage from "./ColmadoSubscriptionSuccessPage";


const apiMocks = vi.hoisted(() => ({
  getColmadoCheckoutStatus: vi.fn(),
}));


vi.mock(
  "../api/colmadoSignupClient",
  () => apiMocks,
);


function renderPage(
  path = "/colmado/subscription/success?session_id=cs_test_123",
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          element={<ColmadoSubscriptionSuccessPage />}
          path="/colmado/subscription/success"
        />
        <Route
          element={<h1>Login del colmado</h1>}
          path="/colmado/:organisationSlug/login"
        />
        <Route
          element={<h1>Login general</h1>}
          path="/colmado/login"
        />
      </Routes>
    </MemoryRouter>,
  );
}


describe("ColmadoSubscriptionSuccessPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  it("redirects a paid and active colmado to its login", async () => {
    apiMocks.getColmadoCheckoutStatus.mockResolvedValueOnce({
      payment_status: "paid",
      organisation_name: "Colmado La Esquina",
      organisation_slug: "colmado-la-esquina",
      app_slug: "colmado",
      login_url: "/colmado/colmado-la-esquina/login",
      is_active: true,
    });

    renderPage();

    expect(
      await screen.findByRole("heading", {
        name: "Login del colmado",
      }),
    ).toBeInTheDocument();
    expect(
      apiMocks.getColmadoCheckoutStatus,
    ).toHaveBeenCalledWith("cs_test_123");
  });


  it("does not call the API without a Stripe session ID", async () => {
    renderPage("/colmado/subscription/success");

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "No encontramos la referencia del pago",
    );
    expect(
      apiMocks.getColmadoCheckoutStatus,
    ).not.toHaveBeenCalled();
  });


  it("waits when Stripe has paid but the webhook is still activating", async () => {
    apiMocks.getColmadoCheckoutStatus.mockResolvedValue({
      payment_status: "paid",
      organisation_name: "Colmado La Esquina",
      organisation_slug: "colmado-la-esquina",
      app_slug: "colmado",
      login_url: "/colmado/colmado-la-esquina/login",
      is_active: false,
    });

    renderPage();

    expect(
      await screen.findByText(
        "Pago recibido. Estamos activando Colmado La Esquina...",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "Login del colmado",
      }),
    ).not.toBeInTheDocument();
  });


  it("does not redirect an unpaid checkout", async () => {
    apiMocks.getColmadoCheckoutStatus.mockResolvedValueOnce({
      payment_status: "unpaid",
      organisation_name: "Colmado La Esquina",
      organisation_slug: "colmado-la-esquina",
      app_slug: "colmado",
      login_url: "/colmado/colmado-la-esquina/login",
      is_active: false,
    });

    renderPage();

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(
      "Stripe todavía no confirma el pago",
    );
    expect(
      screen.queryByRole("heading", {
        name: "Login del colmado",
      }),
    ).not.toBeInTheDocument();
  });


  it("lets the customer retry a temporary status error", async () => {
    const user = userEvent.setup();

    apiMocks.getColmadoCheckoutStatus
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        payment_status: "paid",
        organisation_name: "Colmado La Esquina",
        organisation_slug: "colmado-la-esquina",
        app_slug: "colmado",
        login_url: "/colmado/colmado-la-esquina/login",
        is_active: true,
      });

    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Revisar activación",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Login del colmado",
      }),
    ).toBeInTheDocument();
    expect(
      apiMocks.getColmadoCheckoutStatus,
    ).toHaveBeenCalledTimes(2);
  });
});
