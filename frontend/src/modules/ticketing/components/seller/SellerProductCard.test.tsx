import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ticketingSellerProductsPageTranslations } from "../../admin-i18n/translations/ticketingSellerProductsPageTranslations";
import type { ExperienceProduct } from "../../types/ticketingTypes";
import SellerProductCard from "./SellerProductCard";

const translationCatalog =
  ticketingSellerProductsPageTranslations as Record<
    "en" | "es",
    Record<string, string>
  >;

const axiosMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

const translationState = vi.hoisted(() => ({
  language: "es" as "en" | "es",
}));

vi.mock("../../../../api/axios", () => ({
  default: axiosMocks,
}));

vi.mock("../../admin-i18n/useTicketingAdminTranslation", async () => {
  const translations = await import(
    "../../admin-i18n/translations/ticketingSellerProductsPageTranslations"
  );

  return {
    useTicketingAdminTranslation: () => ({
      language: translationState.language,
      setLanguage: vi.fn(),
      t: (key: string, _values?: unknown, fallback?: string) =>
        (translations.ticketingSellerProductsPageTranslations as Record<
          "en" | "es",
          Record<string, string>
        >)[translationState.language]?.[key] ||
        (translations.ticketingSellerProductsPageTranslations as Record<
          "en" | "es",
          Record<string, string>
        >).en[key] ||
        fallback ||
        key,
    }),
  };
});

const requiredCardKeys = [
  "sellerProducts.card.noImage",
  "sellerProducts.card.offer.title",
  "sellerProducts.card.offer.description",
  "sellerProducts.card.serviceDate",
  "sellerProducts.card.exactOption",
  "sellerProducts.card.loadingLiveOptions",
  "sellerProducts.card.noAvailableOptions",
  "sellerProducts.card.soldOut",
  "sellerProducts.card.quantity",
  "sellerProducts.card.loadingPricing",
  "sellerProducts.card.retailTotal",
  "sellerProducts.card.assignedAllowance",
  "sellerProducts.card.lowestCustomerTotal",
  "sellerProducts.card.rule",
  "sellerProducts.card.rule.fixedPerTicket",
  "sellerProducts.card.rule.fixedAmount",
  "sellerProducts.card.rule.percentageAllowance",
  "sellerProducts.card.customerTotalPrice",
  "sellerProducts.card.fullPrice",
  "sellerProducts.card.lowestPrice",
  "sellerProducts.card.discountDisabled",
  "sellerProducts.card.customerDiscount",
  "sellerProducts.card.sellerEarns",
  "sellerProducts.card.customerPays",
  "sellerProducts.card.generateCustomerLink",
  "sellerProducts.card.selectValidOption",
  "sellerProducts.card.generatedLinkLabel",
  "sellerProducts.card.copyLinkLabel",
  "sellerProducts.card.createBooking",
  "sellerProducts.card.livePrice",
  "sellerProducts.card.messages.offerCreated",
  "sellerProducts.card.messages.linkCopied",
  "sellerProducts.card.errors.liveOptions",
  "sellerProducts.card.errors.pricing",
  "sellerProducts.card.errors.generateLink",
  "sellerProducts.card.errors.copyLink",
  "sellerProducts.card.productTypes.excursion",
  "sellerProducts.card.productTypes.ticket",
  "sellerProducts.card.productTypes.nightlife",
  "sellerProducts.card.productTypes.transfer",
  "sellerProducts.card.productTypes.event",
  "sellerProducts.card.productTypes.custom",
] as const;

const product = {
  id: 1,
  name: "Saona Island Full Day",
  slug: "saona-island-full-day",
  product_type: "excursion",
  base_price: "65.00",
  adult_price: "65.00",
  short_description: "Excursión de día completo.",
  public_enabled: true,
  seller_enabled: true,
  is_active: true,
  status: "active",
  packages: [],
  event_ticket_types: [],
} as unknown as ExperienceProduct;

const pricingQuote = {
  product_id: 1,
  quantity: 1,
  unit_price: "65.00",
  original_price: "65.00",
  allowance_type: "fixed_amount",
  seller_allowance_amount: "5.00",
  maximum_discount_amount: "5.00",
  maximum_discount_percent: "7.69",
  minimum_selling_price: "60.00",
  seller_commission_amount: "5.00",
  owner_net_amount: "60.00",
  can_apply_discounts: true,
  is_per_unit: true,
  currency: "USD",
};

function renderCard() {
  return render(
    <MemoryRouter
      initialEntries={[
        "/ticketing/punta-cana-discovery/seller/products",
      ]}
    >
      <Routes>
        <Route
          path="/ticketing/:organisationSlug/seller/products"
          element={
            <SellerProductCard
              product={product}
              bookingPath="/ticketing/punta-cana-discovery/seller/new-booking"
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SellerProductCard translations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    translationState.language = "es";
    axiosMocks.get.mockResolvedValue({ data: pricingQuote });
  });

  it("keeps the English and Spanish card catalogs synchronized", () => {
    for (const key of requiredCardKeys) {
      expect(translationCatalog.en[key]).toBeTruthy();
      expect(translationCatalog.es[key]).toBeTruthy();
    }
  });

  it("renders the seller offer controls in Spanish", async () => {
    renderCard();

    expect(
      await screen.findByText("Oferta segura para el cliente"),
    ).toBeInTheDocument();
    expect(screen.getByText("Cantidad")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Total de venta")).toBeInTheDocument();
    });

    expect(screen.getByText("Tu margen asignado")).toBeInTheDocument();
    expect(screen.getByText("Precio completo")).toBeInTheDocument();
    expect(screen.getByText("Precio mínimo")).toBeInTheDocument();
    expect(screen.getByText("Crear reserva")).toBeInTheDocument();
  });

  it("does not show the former hardcoded English controls in Spanish", async () => {
    renderCard();

    await screen.findByText("Oferta segura para el cliente");

    expect(screen.queryByText("Secure customer offer")).not.toBeInTheDocument();
    expect(screen.queryByText("Retail total")).not.toBeInTheDocument();
    expect(screen.queryByText("Your assigned allowance")).not.toBeInTheDocument();
    expect(screen.queryByText("Lowest customer total")).not.toBeInTheDocument();
    expect(screen.queryByText("Create Booking")).not.toBeInTheDocument();
  });

  it("keeps the English interface available", async () => {
    translationState.language = "en";
    renderCard();

    expect(
      await screen.findByText("Secure customer offer"),
    ).toBeInTheDocument();
    expect(screen.getByText("Quantity")).toBeInTheDocument();
    expect(screen.getByText("Create booking")).toBeInTheDocument();
  });

  it("translates every supported product type", () => {
    const es = translationCatalog.es;

    expect(es["sellerProducts.card.productTypes.excursion"]).toBe("Excursión");
    expect(es["sellerProducts.card.productTypes.ticket"]).toBe("Entrada");
    expect(es["sellerProducts.card.productTypes.nightlife"]).toBe("Vida nocturna");
    expect(es["sellerProducts.card.productTypes.transfer"]).toBe("Traslado");
    expect(es["sellerProducts.card.productTypes.event"]).toBe("Evento");
    expect(es["sellerProducts.card.productTypes.custom"]).toBe("Personalizado");
  });

  it("never calls a real pricing provider", async () => {
    renderCard();

    await waitFor(() => expect(axiosMocks.get).toHaveBeenCalled());
    expect(axiosMocks.post).not.toHaveBeenCalled();
  });
});
