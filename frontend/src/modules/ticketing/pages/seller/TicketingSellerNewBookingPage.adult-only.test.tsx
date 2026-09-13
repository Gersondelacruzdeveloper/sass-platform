import {
  render,
  screen,
} from "@testing-library/react";

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

import TicketingSellerNewBookingPage
  from "./TicketingSellerNewBookingPage";


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


vi.mock(
  "../../../../api/axios",
  () => ({
    default: axiosMocks,
  }),
);


vi.mock(
  "../../api/ticketingApi",
  () => ({
    default: ticketingApiMocks,
  }),
);


vi.mock(
  "../../admin-i18n/useTicketingAdminTranslation",
  () => ({
    useTicketingAdminTranslation: () => ({
      t: (key: string) => {
        const values: Record<string, string> = {
          "sellerNewBooking.loading":
            "Loading",

          "sellerNewBooking.guests.adults":
            "Adults",

          "sellerNewBooking.guests.children":
            "Children",

          "sellerNewBooking.guests.infants":
            "Infants",

          "sellerNewBooking.errors.loadForm":
            "Unable to load booking form",
        };

        return values[key] || key;
      },
    }),
  }),
);


const ORGANISATION_SLUG =
  "punta-cana-discovery";


const seller = {
  id: 7,
  full_name: "Trusted Seller",

  can_create_bookings: true,

  can_apply_discounts: false,

  can_create_pending_payment_booking: true,

  can_take_deposits: false,

  can_take_full_payments: false,

  can_collect_cash_payment: false,

  can_generate_ticket_without_customer_online_payment:
    true,

  can_pay_deposit_as_seller: false,

  can_pay_full_amount_as_seller: false,

  can_pay_commission_only: false,

  can_request_supervisor_approval: false,

  can_send_receipt_before_full_payment:
    false,
};


const baseProduct = {
  id: 101,

  name: "Test Product",

  slug: "test-product",

  status: "active",

  is_active: true,

  seller_enabled: true,

  public_enabled: true,

  base_price: "100.00",

  adult_price: "100.00",

  child_price: "50.00",

  infant_price: "0.00",

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

  seller_allowance_amount: "0.00",

  maximum_discount_amount: "0.00",

  maximum_discount_percent: "0.00",

  minimum_selling_price: "100.00",

  seller_commission_amount: "0.00",

  owner_net_amount: "100.00",

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
          element={
            <TicketingSellerNewBookingPage />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}


function configureProduct(
  productType:
    | "event"
    | "nightlife"
    | "excursion",
) {
  const product = {
    ...baseProduct,
    product_type: productType,
  };


  ticketingApiMocks
    .getSellerMe
    .mockResolvedValue(
      seller,
    );


  ticketingApiMocks
    .getSellerProducts
    .mockResolvedValue([
      product,
    ]);


  ticketingApiMocks
    .getPickupLocations
    .mockResolvedValue([]);


  ticketingApiMocks
    .getPickupSchedules
    .mockResolvedValue([]);


  ticketingApiMocks
    .getPublicProducts
    .mockResolvedValue([
      product,
    ]);


  ticketingApiMocks
    .getPublicProductAvailability
    .mockResolvedValue({});


  ticketingApiMocks
    .resolvePublicPickupSchedule
    .mockResolvedValue(null);


  ticketingApiMocks
    .resolvePickupSchedule
    .mockResolvedValue(null);


  axiosMocks.get.mockImplementation(
    (url: string) => {
      if (
        url ===
        "/ticketing/seller/products/101/pricing-quote/"
      ) {
        return Promise.resolve({
          data: pricingQuote,
        });
      }

      return Promise.reject(
        new Error(
          `Unexpected GET ${url}`,
        ),
      );
    },
  );
}


describe(
  "TicketingSellerNewBookingPage adult-only products",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });


    it.each(
      [
        "event",
        "nightlife",
      ] as const,
    )(
      "hides Children and Infants for %s products",
      async (productType) => {
        configureProduct(
          productType,
        );

        renderPage();


        await screen.findByText(
          "Adults",
        );


        expect(
          screen.queryByText(
            "Children",
          ),
        ).not.toBeInTheDocument();


        expect(
          screen.queryByText(
            "Infants",
          ),
        ).not.toBeInTheDocument();


        expect(
          screen.getByText(
            "Events and nightlife are adult-only. Children and infants are not selectable.",
          ),
        ).toBeInTheDocument();
      },
    );


    it(
      "still shows Children and Infants for an excursion",
      async () => {
        configureProduct(
          "excursion",
        );

        renderPage();


        await screen.findByText(
          "Adults",
        );


        expect(
          screen.getByText(
            "Children",
          ),
        ).toBeInTheDocument();


        expect(
          screen.getByText(
            "Infants",
          ),
        ).toBeInTheDocument();


        expect(
          screen.queryByText(
            "Events and nightlife are adult-only. Children and infants are not selectable.",
          ),
        ).not.toBeInTheDocument();
      },
    );
  },
);