import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import api from "../../../../api/axios";
import TicketingSellerAIBookingPage from "./TicketingSellerAIBookingPage";

vi.mock("../../../../api/axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedApi = vi.mocked(api);

function renderPage() {
  render(
    <MemoryRouter
      initialEntries={[
        "/ticketing/punta-cana-discovery/seller/ai-booking",
      ]}
    >
      <Routes>
        <Route
          path="/ticketing/:organisationSlug/seller/ai-booking"
          element={<TicketingSellerAIBookingPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("TicketingSellerAIBookingPage access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("blocks direct page access when this seller's AI is disabled", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 7,
        seller_ai_enabled: false,
      },
    });

    renderPage();

    expect(
      await screen.findByText("AI Booking Assistant unavailable"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "The AI Booking Assistant has been disabled for your seller account.",
      ),
    ).toBeInTheDocument();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  it("keeps the assistant available for another enabled seller", async () => {
    mockedApi.get.mockResolvedValueOnce({
      data: {
        id: 8,
        seller_ai_enabled: true,
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("AI Booking Assistant")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("AI Booking Assistant unavailable"),
    ).not.toBeInTheDocument();
  });
});
