import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TicketingSellerNewBookingPage from "./TicketingSellerNewBookingPage";

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

const ticketingApiMocks = vi.hoisted(() => ({
  getSellerMe: vi.fn(),
  getSellerProducts: vi.fn(),
  getPickupLocations: vi.fn(),
  getPickupSchedules: vi.fn(),
  getPublicProducts: vi.fn(),
  getPublicProductAvailability: vi.fn(),
  resolvePublicPickupSchedule: vi.fn(),
  resolvePickupSchedule: vi.fn(),
  createSellerBooking: vi.fn(),
  markSellerTicketGenerated: vi.fn(),
}));

vi.mock("../../../../api/axios", () => ({
  default: axiosMocks,
}));

vi.mock("../../api/ticketingApi", () => ({
  default: ticketingApiMocks,
}));

const translationMock = vi.hoisted(() => {
  const values: Record<string, string> = {
    "sellerNewBooking.loading": "Loading",
    "sellerNewBooking.header.eyebrow": "Seller",
    "sellerNewBooking.header.title": "New booking",
    "sellerNewBooking.header.description": "Create a booking",
    "sellerNewBooking.labels.seller": "Seller",
    "sellerNewBooking.labels.selected": "Selected",
    "sellerNewBooking.steps.step1": "Step 1",
    "sellerNewBooking.steps.chooseTour": "Choose tour",
    "sellerNewBooking.steps.step2": "Step 2",
    "sellerNewBooking.steps.chooseDate": "Choose date",
    "sellerNewBooking.steps.step3": "Step 3",
    "sellerNewBooking.steps.chooseHotel": "Choose hotel",
    "sellerNewBooking.steps.step4": "Step 4",
    "sellerNewBooking.steps.customer": "Customer",
    "sellerNewBooking.steps.step5": "Step 5",
    "sellerNewBooking.steps.payment": "Payment",
    "sellerNewBooking.search.tour": "Search tour",
    "sellerNewBooking.search.hotel": "Search hotel",
    "sellerNewBooking.fields.serviceDate": "Service date",
    "sellerNewBooking.fields.customerName": "Customer name",
    "sellerNewBooking.fields.whatsapp": "WhatsApp",
    "sellerNewBooking.fields.discount": "Discount",
    "sellerNewBooking.fields.email": "Email",
    "sellerNewBooking.fields.notes": "Notes",
    "sellerNewBooking.fields.paymentReference": "Payment reference",
    "sellerNewBooking.fields.paymentNote": "Payment note",
    "sellerNewBooking.guests.adults": "Adults",
    "sellerNewBooking.guests.children": "Children",
    "sellerNewBooking.guests.infants": "Infants",
    "sellerNewBooking.pickup.notRequired": "Pickup not required",
    "sellerNewBooking.summary.title": "Summary",
    "sellerNewBooking.summary.chooseTour": "Choose tour",
    "sellerNewBooking.summary.date": "Date",
    "sellerNewBooking.summary.guests": "Guests",
    "sellerNewBooking.summary.totalGuests": "guests",
    "sellerNewBooking.summary.charged": "charged",
    "sellerNewBooking.summary.hotel": "Hotel",
    "sellerNewBooking.summary.pickup": "Pickup",
    "sellerNewBooking.summary.subtotal": "Subtotal",
    "sellerNewBooking.summary.total": "Customer pays",
    "sellerNewBooking.summary.today": "Pay now",
    "sellerNewBooking.summary.balance": "Balance",
    "sellerNewBooking.summary.noPayment": "No payment",
    "sellerNewBooking.paymentActions.later": "Pay later",
    "sellerNewBooking.paymentActions.laterShort": "Later",
    "sellerNewBooking.payment.noneEnabled": "No payment option enabled",
    "sellerNewBooking.errors.loadForm": "Unable to load booking form",
  };

  return {
    t: (key: string) => values[key] || key,
  };
});

vi.mock("../../admin-i18n/useTicketingAdminTranslation", () => ({
  useTicketingAdminTranslation: () => ({
    t: translationMock.t,
  }),
}));

const ORGANISATION_SLUG = "punta-cana-discovery";

const seller = {
  id: 7,
  full_name: "Simple Seller",
  can_create_bookings: true,
  can_apply_discounts: true,
  can_create_pending_payment_booking: true,
  can_take_deposits: false,
  can_take_full_payments: false,
  can_collect_cash_payment: false,
  can_generate_ticket_without_customer_online_payment: false,
  can_pay_deposit_as_seller: false,
  can_pay_full_amount_as_seller: false,
  can_pay_commission_only: false,
  can_request_supervisor_approval: false,
  can_send_receipt_before_full_payment: false,
};

const product = {
  id: 101,
  name: "Coco Test Tour",
  slug: "regular-tour",
  product_type: "excursion",
  status: "active",
  is_active: true,
  seller_enabled: true,
  public_enabled: true,
  base_price: "100.00",
  adult_price: "100.00",
  cost_price: "60.00",
  deposit_amount: "0.00",
  deposit_percentage: "0.00",
  supports_pickup: false,
  requires_pickup_location: false,
  pickup_schedules: [],
  start_time: null,
  image: null,
  image_url: null,
  gallery_images: [],
};

const pricingQuote = {
  product_id: 101,
  quantity: 1,
  unit_price: "100.00",
  original_price: "100.00",
  allowance_type: "fixed_amount",
  seller_allowance_amount: "10.00",
  maximum_discount_amount: "10.00",
  maximum_discount_percent: "10.00",
  minimum_selling_price: "90.00",
  seller_commission_amount: "10.00",
  owner_net_amount: "90.00",
  currency: "USD",
};

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        `/ticketing/${ORGANISATION_SLUG}/seller/new-booking`,
      ]}
    >
      <Routes>
        <Route
          path="/ticketing/:organisationSlug/seller/new-booking"
          element={<TicketingSellerNewBookingPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function waitForPricing() {
  await screen.findByText("Normal price");
  await waitFor(() => {
    expect(axiosMocks.get).toHaveBeenCalledWith(
      "/ticketing/seller/products/101/pricing-quote/",
      expect.objectContaining({
        params: expect.objectContaining({
          slug: ORGANISATION_SLUG,
          organisation_slug: ORGANISATION_SLUG,
          quantity: 1,
          unit_price: "100.00",
        }),
      }),
    );
  });
}

function expectTextAtLeastOnce(text: string | RegExp) {
  expect(screen.getAllByText(text).length).toBeGreaterThan(0);
}

describe("TicketingSellerNewBookingPage simple seller discount UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    ticketingApiMocks.getSellerMe.mockResolvedValue(seller);
    ticketingApiMocks.getSellerProducts.mockResolvedValue([product]);
    ticketingApiMocks.getPickupLocations.mockResolvedValue([]);
    ticketingApiMocks.getPickupSchedules.mockResolvedValue([]);
    ticketingApiMocks.getPublicProducts.mockResolvedValue([product]);

    axiosMocks.get.mockImplementation((url: string) => {
      if (url === "/ticketing/seller/products/101/pricing-quote/") {
        return Promise.resolve({ data: pricingQuote });
      }

      return Promise.reject(new Error(`Unexpected GET ${url}`));
    });
  });

  it("shows the seller simple money-based allowance information", async () => {
    renderPage();
    await waitForPricing();

    expectTextAtLeastOnce("Normal price");
    expectTextAtLeastOnce("You can give up to");
    expectTextAtLeastOnce("US$ 100.00");
    expectTextAtLeastOnce("US$ 10.00");

    expect(
      screen.queryByText(/Apply maximum discount/i),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByText(/Maximum 10\.00%/i),
    ).not.toBeInTheDocument();
  });

  it("starts with no discount: customer pays 100 and seller earns 10", async () => {
    renderPage();
    await waitForPricing();

    expectTextAtLeastOnce("Customer pays");
    expectTextAtLeastOnce("Your earnings");
    expectTextAtLeastOnce("US$ 100.00");
    expectTextAtLeastOnce("US$ 10.00");
  });

  it("half-allowance quick button makes customer pay 95 and seller earn 5", async () => {
    const user = userEvent.setup();

    renderPage();
    await waitForPricing();

    const input = screen.getByLabelText("Customer discount");

    await user.click(
      screen.getByRole("button", {
        name: "US$ 5.00",
      }),
    );

    await waitFor(() => {
      expect(input).toHaveValue("5.00");
      expectTextAtLeastOnce("US$ 95.00");
    });

    expectTextAtLeastOnce("US$ 5.00");
  });

  it("maximum quick button makes customer pay 90 and seller earn 0", async () => {
    const user = userEvent.setup();

    renderPage();
    await waitForPricing();

    const input = screen.getByLabelText("Customer discount");

    await user.click(
      screen.getByRole("button", {
        name: "Max US$ 10.00",
      }),
    );

    await waitFor(() => {
      expect(input).toHaveValue("10.00");
      expectTextAtLeastOnce("US$ 90.00");
      expectTextAtLeastOnce("US$ 0.00");
    });
  });

  it("lets the seller type a simple dollar discount and updates both totals", async () => {
    const user = userEvent.setup();

    renderPage();
    await waitForPricing();

    const input = screen.getByLabelText("Customer discount");

    await user.clear(input);
    await user.type(input, "5");

    await waitFor(() => {
      expect(input).toHaveValue("5");
      expectTextAtLeastOnce("US$ 95.00");
    });

    expectTextAtLeastOnce("US$ 5.00");
  });

  it("clamps a typed value above the backend maximum when the field loses focus", async () => {
    const user = userEvent.setup();

    renderPage();
    await waitForPricing();

    const input = screen.getByLabelText("Customer discount");

    await user.clear(input);
    await user.type(input, "11");

    expect(input).toHaveValue("11");

    await user.tab();

    await waitFor(() => {
      expect(input).toHaveValue("10.00");
      expectTextAtLeastOnce("US$ 90.00");
      expectTextAtLeastOnce("US$ 0.00");
    });
  });

  it("uses the backend quote as the source of allowance and minimum price", async () => {
    renderPage();
    await waitForPricing();

    expect(
      screen.getByText(
        /Your available allowance is US\$ 10\.00\./,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /The minimum customer price is US\$ 90\.00\./,
      ),
    ).toBeInTheDocument();
  });
});
