import {
  render,
  screen,
  waitFor,
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

import TicketingSellerCreditTicketsPage
  from "./TicketingSellerCreditTicketsPage";


const apiMocks = vi.hoisted(() => ({
  getBookings: vi.fn(),
  updateSellerCreditStatus: vi.fn(),
}));


vi.mock(
  "../api/ticketingApi",
  () => ({
    ticketingApi: apiMocks,
  }),
);


const slug = "punta-cana-discovery";


const pendingBooking = {
  id: 41,

  booking_code: "TKT-0041",

  customer_name:
    "Customer One",

  customer_whatsapp:
    "+1 809 555 0101",

  service_date:
    "2026-09-14",

  total_amount:
    "120.00",

  seller_due_to_company:
    "100.00",

  seller_credit_status:
    "pending_collection",

  seller_detail: {
    id: 9,

    full_name:
      "Lucas Seller",
  },
};


function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        `/ticketing/${slug}/seller-credit-tickets`,
      ]}
    >
      <Routes>
        <Route
          path="/ticketing/:organisationSlug/seller-credit-tickets"
          element={
            <TicketingSellerCreditTicketsPage />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}


describe(
  "TicketingSellerCreditTicketsPage",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();

      apiMocks
        .getBookings
        .mockResolvedValue([
          pendingBooking,
        ]);
    });


    it(
      "loads only seller-credit tickets and shows who owes the company",
      async () => {
        renderPage();


        expect(
          await screen.findByText(
            "TKT-0041",
          ),
        ).toBeInTheDocument();


        expect(
          screen.getByText(
            "Customer One",
          ),
        ).toBeInTheDocument();


        expect(
          screen.getByText(
            "Lucas Seller",
          ),
        ).toBeInTheDocument();


        expect(
          screen.getAllByText(
            "$100.00",
          ).length,
        ).toBeGreaterThan(0);


        expect(
          screen.getByText(
            "Pending collection",
          ),
        ).toBeInTheDocument();


        expect(
          apiMocks.getBookings,
        ).toHaveBeenCalledWith(
          slug,
          {
            seller_credit: true,
          },
        );
      },
    );


    it(
      "lets the administrator block a ticket when the seller has not paid",
      async () => {
        const user =
          userEvent.setup();


        apiMocks
          .updateSellerCreditStatus
          .mockResolvedValue({
            ...pendingBooking,

            seller_credit_status:
              "blocked",
          });


        renderPage();


        await screen.findByText(
          "TKT-0041",
        );


        await user.click(
          screen.getByRole(
            "button",
            {
              name:
                /Not paid \/ block/i,
            },
          ),
        );


        await waitFor(() => {
          expect(
            apiMocks
              .updateSellerCreditStatus,
          ).toHaveBeenCalledWith(
            41,
            "blocked",
            slug,
          );
        });


        expect(
          await screen.findByText(
            "Not paid / blocked",
          ),
        ).toBeInTheDocument();
      },
    );


    it(
      "lets the administrator confirm that the seller paid the company",
      async () => {
        const user =
          userEvent.setup();


        apiMocks
          .updateSellerCreditStatus
          .mockResolvedValue({
            ...pendingBooking,

            seller_credit_status:
              "settled",
          });


        renderPage();


        await screen.findByText(
          "TKT-0041",
        );


        await user.click(
          screen.getByRole(
            "button",
            {
              name: /^Paid$/i,
            },
          ),
        );


        await waitFor(() => {
          expect(
            apiMocks
              .updateSellerCreditStatus,
          ).toHaveBeenCalledWith(
            41,
            "settled",
            slug,
          );
        });


        await waitFor(() => {
          expect(
            screen.getAllByText(
              "Paid to company",
            ).length,
          ).toBeGreaterThan(0);
        });
      },
    );
  },
);