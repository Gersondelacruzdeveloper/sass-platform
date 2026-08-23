import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TicketingLandingPage from "./TicketingLandingPage";


const selectorState = vi.hoisted(() => ({
  auth: {
    user: null as any,
    initialized: true,
    loading: false,
  },
}));

vi.mock("../../../store/hooks", () => ({
  useAppSelector: (selector: (state: typeof selectorState) => unknown) =>
    selector(selectorState),
}));


const ORGANISATION_SLUG = "punta-cana-discovery";


function renderTenantLanding(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/ticketing/:organisationSlug"
          element={<TicketingLandingPage />}
        />
        <Route
          path="/ticketing"
          element={<TicketingLandingPage />}
        />
        <Route
          path="/ticketing/:organisationSlug/login"
          element={<div>Tenant login reached</div>}
        />
        <Route
          path="/ticketing/:organisationSlug/seller/dashboard"
          element={<div>Seller dashboard reached</div>}
        />
        <Route
          path="/ticketing/:organisationSlug/seller-application"
          element={<div>Seller application reached</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}


describe("TicketingLandingPage tenant persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();

    selectorState.auth = {
      user: null,
      initialized: true,
      loading: false,
    };
  });

  it("stores a valid tenant slug from the URL before redirecting to login", async () => {
    renderTenantLanding(`/ticketing/${ORGANISATION_SLUG}`);

    expect(
      await screen.findByText("Tenant login reached")
    ).toBeInTheDocument();

    expect(
      window.localStorage.getItem("last_ticketing_slug")
    ).toBe(ORGANISATION_SLUG);
  });

  it("reuses the saved tenant when the PWA later opens at /ticketing", async () => {
    window.localStorage.setItem(
      "last_ticketing_slug",
      ORGANISATION_SLUG
    );

    renderTenantLanding("/ticketing");

    expect(
      await screen.findByText("Tenant login reached")
    ).toBeInTheDocument();
  });

  it("does not treat reserved route words as organisation slugs", async () => {
    renderTenantLanding("/ticketing/dashboard");

    expect(
      await screen.findByRole("heading", {
        name: "Organisation required",
      })
    ).toBeInTheDocument();

    expect(
      window.localStorage.getItem("last_ticketing_slug")
    ).toBeNull();
  });

  it("routes an approved seller from a saved tenant to the seller dashboard", async () => {
    window.localStorage.setItem(
      "last_ticketing_slug",
      ORGANISATION_SLUG
    );

    selectorState.auth = {
      user: {
        role: "seller",
        seller: {
          organisation_slug: ORGANISATION_SLUG,
          application_status: "approved",
          is_active: true,
        },
      },
      initialized: true,
      loading: false,
    };

    renderTenantLanding("/ticketing");

    expect(
      await screen.findByText("Seller dashboard reached")
    ).toBeInTheDocument();
  });
});
