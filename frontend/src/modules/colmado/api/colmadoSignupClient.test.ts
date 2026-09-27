import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createColmadoCheckout,
  getColmadoPlans,
} from "./colmadoSignupClient";


const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("../../../api/axios", () => ({
  default: apiMocks,
}));


describe("colmadoSignupClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads only active subscription plans", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: "Básico",
          slug: "basic",
          price: "29.00",
          currency: "USD",
          interval: "monthly",
          max_users: 3,
          max_employees: 10,
          max_modules: 1,
          is_active: true,
        },
        {
          id: 2,
          name: "Plan anterior",
          slug: "old-plan",
          price: "10.00",
          currency: "USD",
          interval: "monthly",
          max_users: 1,
          max_employees: 1,
          max_modules: 1,
          is_active: false,
        },
      ],
    });

    const plans = await getColmadoPlans();

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/subscriptions/plans/",
    );
    expect(plans).toHaveLength(1);
    expect(plans[0].slug).toBe("basic");
  });

  it("creates a checkout with the owner and first store", async () => {
    apiMocks.post.mockResolvedValueOnce({
      data: {
        checkout_url: "https://checkout.stripe.test/session-1",
        organisation_slug: "colmado-la-esquina",
        login_url: "/colmado/colmado-la-esquina/login",
      },
    });

    const result = await createColmadoCheckout({
      company_name: "Colmado La Esquina",
      owner_name: "Juan Pérez",
      email: "juan@example.com",
      password: "ClaveSegura123",
      plan: "basic",
      store_name: "Sucursal Principal",
      store_address: "Calle Duarte número 10",
      store_phone: "8095550101",
    });

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/subscriptions/create-checkout-session/",
      {
        company_name: "Colmado La Esquina",
        owner_name: "Juan Pérez",
        email: "juan@example.com",
        password: "ClaveSegura123",
        plan: "basic",
        store_name: "Sucursal Principal",
        store_address: "Calle Duarte número 10",
        store_phone: "8095550101",
        app: "colmado",
        business_type: "colmado",
      },
    );
    expect(result.organisation_slug).toBe("colmado-la-esquina");
  });

  it("forces the application and business type to colmado", async () => {
    apiMocks.post.mockResolvedValueOnce({
      data: {
        checkout_url: "https://checkout.stripe.test/session-2",
        organisation_slug: "colmado-central",
        login_url: "/colmado/colmado-central/login",
      },
    });

    await createColmadoCheckout({
      company_name: "Colmado Central",
      owner_name: "Ana Pérez",
      email: "ana@example.com",
      password: "ClaveSegura123",
      plan: "basic",
      app: "ticketing",
      business_type: "ticketing",
    } as Parameters<typeof createColmadoCheckout>[0] & {
      app: string;
      business_type: string;
    });

    expect(apiMocks.post).toHaveBeenCalledWith(
      "/subscriptions/create-checkout-session/",
      expect.objectContaining({
        app: "colmado",
        business_type: "colmado",
      }),
    );
  });

  it("returns the checkout information from the server", async () => {
    const responseData = {
      checkout_url: "https://checkout.stripe.test/session-3",
      organisation_slug: "colmado-del-barrio",
      login_url: "/colmado/colmado-del-barrio/login",
    };
    apiMocks.post.mockResolvedValueOnce({ data: responseData });

    const result = await createColmadoCheckout({
      company_name: "Colmado del Barrio",
      owner_name: "Luis Gómez",
      email: "luis@example.com",
      password: "ClaveSegura123",
      plan: "basic",
    });

    expect(result).toEqual(responseData);
  });
});
