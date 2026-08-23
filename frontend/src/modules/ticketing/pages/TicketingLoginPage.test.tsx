import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TicketingLoginPage from "./TicketingLoginPage";

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

const dispatchMocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  unwrap: vi.fn(),
}));

const loginUserMock = vi.hoisted(() => vi.fn());

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));

vi.mock("../../../store/hooks", () => ({
  useAppDispatch: () => dispatchMocks.dispatch,
}));

vi.mock("../../../features/auth/authSlice", () => ({
  loginUser: loginUserMock,
}));

vi.mock("../admin-i18n/useTicketingAdminTranslation", () => ({
  useTicketingAdminTranslation: () => ({
    t: (key: string) => {
      const values: Record<string, string> = {
        "login.errors.emailRequired": "Email is required",
        "login.errors.passwordRequired": "Password is required",
        "login.errors.invalidCredentials": "Invalid credentials",
        "login.errors.connection": "Connection error",
      };
      return values[key] || key;
    },
  }),
}));

const ORGANISATION_SLUG = "punta-cana-discovery";

const branding = {
  company_name: "Punta Cana Discovery",
  platform_name: "Punta Cana Discovery Platform",
  login_title: "Welcome back",
  login_subtitle: "Sign in to continue",
  logo: null,
  logo_url: null,
  primary_color: "#020617",
  secondary_color: "#475569",
  accent_color: "#F59E0B",
};

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={[`/ticketing/${ORGANISATION_SLUG}/login`]}>
      <Routes>
        <Route
          path="/ticketing/:organisationSlug/login"
          element={<TicketingLoginPage />}
        />
        <Route
          path="/ticketing/:organisationSlug/dashboard"
          element={<div>Owner dashboard reached</div>}
        />
        <Route
          path="/ticketing/:organisationSlug/seller/dashboard"
          element={<div>Seller dashboard reached</div>}
        />
        <Route
          path="/ticketing/:organisationSlug/billing-locked"
          element={<div>Billing locked reached</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("TicketingLoginPage tenant persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();

    apiMocks.get.mockImplementation((url: string) => {
      if (
        url ===
        `/organisations/public-branding/ticketing/${ORGANISATION_SLUG}/`
      ) {
        return Promise.resolve({ data: branding });
      }

      if (url === "/ticketing/sellers/me/") {
        return Promise.reject({
          response: { status: 404 },
        });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });

    dispatchMocks.unwrap.mockResolvedValue({
      id: 99,
      email: "owner@example.com",
      organisation: {
        slug: ORGANISATION_SLUG,
        is_active: true,
        business_type: "ticketing",
      },
      role: "owner",
    });

    dispatchMocks.dispatch.mockReturnValue({
      unwrap: dispatchMocks.unwrap,
    });

    loginUserMock.mockImplementation((payload) => ({
      type: "auth/loginUser",
      payload,
    }));
  });

  it("stores the organisation slug as soon as the tenant login page opens", async () => {
    renderLogin();

    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        `/organisations/public-branding/ticketing/${ORGANISATION_SLUG}/`
      );
    });

    expect(
      window.localStorage.getItem("last_ticketing_slug")
    ).toBe(ORGANISATION_SLUG);
  });

  it("passes the tenant slug to loginUser and routes an owner to that tenant dashboard", async () => {
    renderLogin();

    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        `/organisations/public-branding/ticketing/${ORGANISATION_SLUG}/`
      );
    });

    const user = userEvent.setup();

    const emailInput =
      screen.queryByLabelText(/email/i) ||
      screen.getByRole("textbox");

    await user.type(emailInput, "owner@example.com");

    const passwordInput =
      document.querySelector('input[type="password"]');

    if (!(passwordInput instanceof HTMLInputElement)) {
      throw new Error("Password input was not found.");
    }

    await user.type(passwordInput, "StrongPassword123!");

    const submitButton =
      document.querySelector('button[type="submit"]');

    if (!(submitButton instanceof HTMLButtonElement)) {
      throw new Error("Submit button was not found.");
    }

    await user.click(submitButton);

    await waitFor(() => {
      expect(loginUserMock).toHaveBeenCalledWith({
        login: "owner@example.com",
        password: "StrongPassword123!",
        organisation_slug: ORGANISATION_SLUG,
      });
    });

    expect(
      await screen.findByText("Owner dashboard reached")
    ).toBeInTheDocument();
  });
});
