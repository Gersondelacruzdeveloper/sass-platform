import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import type { Seller } from "../types/ticketingTypes";
import TicketingSellerSidebar from "./TicketingSellerSidebar";

vi.mock("../admin-i18n/useTicketingAdminTranslation", () => ({
  useTicketingAdminTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function makeSeller(sellerAIEnabled: boolean): Seller {
  return {
    id: 7,
    organisation: 1,
    full_name: "Test Seller",
    seller_slug: "test-seller",
    role: "seller",
    commission_rate: "0.00",
    fixed_commission_amount: "0.00",
    seller_ai_enabled: sellerAIEnabled,
    is_active: true,
    can_create_bookings: true,
    permissions: {
      can_create_bookings: true,
    },
  } as Seller;
}

function renderSidebar(seller: Seller) {
  render(
    <MemoryRouter
      initialEntries={["/ticketing/punta-cana-discovery/seller/dashboard"]}
    >
      <TicketingSellerSidebar
        mobileOpen
        onClose={vi.fn()}
        onLogout={vi.fn()}
        slug="punta-cana-discovery"
        currentSeller={seller}
      />
    </MemoryRouter>,
  );
}

describe("TicketingSellerSidebar seller AI visibility", () => {
  it("shows the AI assistant only for an enabled seller", () => {
    renderSidebar(makeSeller(true));

    expect(screen.getByText("AI Booking Assistant")).toBeInTheDocument();
  });

  it("hides the AI assistant for only the disabled seller", () => {
    renderSidebar(makeSeller(false));

    expect(screen.queryByText("AI Booking Assistant")).not.toBeInTheDocument();
  });
});
