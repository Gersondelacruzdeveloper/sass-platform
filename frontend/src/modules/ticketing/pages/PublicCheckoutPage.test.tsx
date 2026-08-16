import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PublicCheckoutPage from "./PublicCheckoutPage";


const apiMocks = vi.hoisted(() => ({
  getPublicBranding: vi.fn(),
  getPublicProducts: vi.fn(),
  getPublicPaymentOptions: vi.fn(),
  getPublicCustomerCartSession: vi.fn(),
  convertPublicCustomerCartSession: vi.fn(),
  createPublicStripeCheckoutSession: vi.fn(),
  createPublicPayPalOrder: vi.fn(),
}));

vi.mock("../api/ticketingApi", () => ({
  default: apiMocks,
}));

vi.mock("../i18n", () => ({
  ticketingLanguageOptions: [{ value: "en", label: "English" }],
  useTicketingTranslation: () => ({
    language: "en",
    setLanguage: vi.fn(),
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));


const TOKEN = "customer-cart-token-long-enough-for-checkout";
const ORGANISATION_SLUG = "test-company";

const branding = {
  organisation: {
    id: 7,
    slug: ORGANISATION_SLUG,
    name: "Test Company",
  },
  public_site: {
    site_title: "Test Company Experiences",
  },
  ticketing_settings: {
    public_brand_name: "Test Company Experiences",
    currency_symbol: "US$",
  },
};

const paymentOptions = {
  stripe_enabled: true,
  paypal_enabled: true,
  default_provider: "stripe",
};

const customerCartSession = {
  cart_id: 91,
  status: "active",
  language: "en",
  currency: "USD",
  subtotal: "180.00",
  discount_total: "20.00",
  total: "160.00",
  expires_at: "2026-08-16T18:00:00Z",
  is_expired: false,
  can_checkout: true,
  organisation: {
    id: 7,
    slug: ORGANISATION_SLUG,
    name: "Test Company",
  },
  promotions: [
    {
      promotion_id: 3,
      name: "Two excursion saving",
      discount_type: "fixed",
      discount_amount: "20.00",
      currency: "USD",
      eligible_item_positions: [1, 2],
    },
  ],
  validation_notices: [],
  items: [
    {
      id: 101,
      position: 1,
      product_id: 11,
      product_slug: "saona-island",
      product_url: "/product/saona-island",
      product_image_url: null,
      service_date: "2026-08-20",
      adults: 2,
      children: 0,
      infants: 0,
      package_id: null,
      event_ticket_type_id: null,
      selected_external_option_id: "",
      pickup_location_id: 8,
      product_name_snapshot: "Saona Island",
      option_name_snapshot: "Classic",
      pickup_name_snapshot: "Test Hotel",
      pickup_time_snapshot: "07:30:00",
      unit_price_snapshot: "50.00",
      line_subtotal: "100.00",
      line_discount: "10.00",
      line_total: "90.00",
      currency: "USD",
    },
    {
      id: 102,
      position: 2,
      product_id: 12,
      product_slug: "catalina-island",
      product_url: "/product/catalina-island",
      product_image_url: null,
      service_date: "2026-08-22",
      adults: 2,
      children: 0,
      infants: 0,
      package_id: null,
      event_ticket_type_id: null,
      selected_external_option_id: "",
      pickup_location_id: 8,
      product_name_snapshot: "Catalina Island",
      option_name_snapshot: "Full day",
      pickup_name_snapshot: "Test Hotel",
      pickup_time_snapshot: "08:00:00",
      unit_price_snapshot: "45.00",
      line_subtotal: "80.00",
      line_discount: "10.00",
      line_total: "70.00",
      currency: "USD",
    },
  ],
};

const convertedBooking = {
  id: 501,
  booking_code: "PCD-CART501",
  status: "pending_payment",
  payment_status: "unpaid",
  payment_mode: "pending_payment",
  payment_method: "none",
  service_date: "2026-08-20",
  service_time: null,
  customer_name: "Jane Customer",
  customer_email: "jane@example.com",
  customer_hotel: "Test Hotel",
  adults: 2,
  children: 0,
  infants: 0,
  total_guests: 2,
  subtotal_amount: "180.00",
  discount_amount: "20.00",
  tax_amount: "0.00",
  total_amount: "160.00",
  deposit_required: "0.00",
  deposit_paid: "0.00",
  balance_due: "160.00",
  items: [],
  pickup_info: null,
  created_at: "2026-08-16T14:00:00Z",
};


function renderCheckout() {
  return render(
    <MemoryRouter
      initialEntries={[
        `/experiences/${ORGANISATION_SLUG}/checkout?cart_session=${TOKEN}`,
      ]}
    >
      <Routes>
        <Route
          path="/experiences/:organisationSlug/checkout"
          element={<PublicCheckoutPage />}
        />
        <Route
          path="/experiences/:organisationSlug/confirmation/:bookingCode"
          element={<div>Confirmation page reached</div>}
        />
      </Routes>
    </MemoryRouter>
  );
}

async function waitForCart() {
  await screen.findByRole("heading", { name: "Complete your booking" });
}

async function completeCustomerFields() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/^Full name/), "Jane Customer");
  await user.type(screen.getByLabelText(/^WhatsApp/), "+18095553001");
  await user.type(screen.getByLabelText(/^Email/), "jane@example.com");
  await user.type(
    screen.getByLabelText("Hotel / pickup location"),
    "Test Hotel"
  );
  await user.type(screen.getByLabelText("Notes"), "Vegetarian lunch");
  return user;
}


describe("PublicCheckoutPage customer cart session", () => {
  beforeEach(() => {
    apiMocks.getPublicBranding.mockResolvedValue(branding);
    apiMocks.getPublicProducts.mockResolvedValue([]);
    apiMocks.getPublicPaymentOptions.mockResolvedValue(paymentOptions);
    apiMocks.getPublicCustomerCartSession.mockResolvedValue(customerCartSession);
    apiMocks.convertPublicCustomerCartSession.mockResolvedValue({
      success: true,
      created: true,
      booking: convertedBooking,
    });
  });

  it("loads the cart with the tenant slug and bearer token", async () => {
    renderCheckout();
    await waitForCart();

    expect(apiMocks.getPublicCustomerCartSession).toHaveBeenCalledTimes(1);
    expect(apiMocks.getPublicCustomerCartSession).toHaveBeenCalledWith(
      ORGANISATION_SLUG,
      TOKEN
    );
    expect(apiMocks.getPublicProducts).not.toHaveBeenCalled();
  });

  it("renders the server-approved itinerary, pickup, promotion and totals", async () => {
    renderCheckout();
    await waitForCart();

    expect(screen.getByText("Saona Island")).toBeInTheDocument();
    expect(screen.getByText("Catalina Island")).toBeInTheDocument();
    expect(screen.getAllByText(/Test Hotel/).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Two excursion saving/)).toBeInTheDocument();
    expect(screen.getByText("USD 180.00")).toBeInTheDocument();
    expect(screen.getAllByText("USD 160.00").length).toBeGreaterThan(0);
  });

  it("shows a safe error when the session cannot be resolved", async () => {
    apiMocks.getPublicCustomerCartSession.mockRejectedValue({
      response: {
        data: {
          code: "invalid_token",
          message: "The cart session could not be found.",
        },
      },
    });

    renderCheckout();

    expect(
      await screen.findByText("The cart session could not be found.")
    ).toBeInTheDocument();
    expect(apiMocks.convertPublicCustomerCartSession).not.toHaveBeenCalled();
  });

  it("requires customer email before conversion", async () => {
    renderCheckout();
    await waitForCart();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Full name/), "Jane Customer");
    await user.type(screen.getByLabelText(/^WhatsApp/), "+18095553001");

    const submitButton = screen.getByRole("button", { name: "Confirm Booking" });
    const form = submitButton.closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(apiMocks.convertPublicCustomerCartSession).not.toHaveBeenCalled();
  });

  it("sends only customer-entered fields and navigates to confirmation", async () => {
    renderCheckout();
    await waitForCart();
    const user = await completeCustomerFields();

    await user.click(screen.getByRole("button", { name: "Confirm Booking" }));

    await waitFor(() => {
      expect(apiMocks.convertPublicCustomerCartSession).toHaveBeenCalledTimes(1);
    });
    expect(apiMocks.convertPublicCustomerCartSession).toHaveBeenCalledWith(
      ORGANISATION_SLUG,
      {
        token: TOKEN,
        full_name: "Jane Customer",
        whatsapp: "+18095553001",
        email: "jane@example.com",
        hotel_name: "Test Hotel",
        notes: "Vegetarian lunch",
        payment_choice: "pending",
      }
    );

    const sentPayload = apiMocks.convertPublicCustomerCartSession.mock.calls[0][1];
    expect(sentPayload).not.toHaveProperty("items");
    expect(sentPayload).not.toHaveProperty("total");
    expect(sentPayload).not.toHaveProperty("discount_total");
    expect(sentPayload).not.toHaveProperty("product_id");
    expect(
      await screen.findByText("Confirmation page reached")
    ).toBeInTheDocument();
  });

  it("prevents a second conversion while the first request is pending", async () => {
    let resolveConversion: ((value: unknown) => void) | undefined;
    apiMocks.convertPublicCustomerCartSession.mockReturnValue(
      new Promise((resolve) => {
        resolveConversion = resolve;
      })
    );

    renderCheckout();
    await waitForCart();
    const user = await completeCustomerFields();
    const submitButton = screen.getByRole("button", { name: "Confirm Booking" });

    await user.click(submitButton);
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    expect(apiMocks.convertPublicCustomerCartSession).toHaveBeenCalledTimes(1);

    resolveConversion?.({
      success: true,
      created: true,
      booking: convertedBooking,
    });
    expect(
      await screen.findByText("Confirmation page reached")
    ).toBeInTheDocument();
  });
});
