import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createColmadoCheckout,
  getColmadoCheckoutStatus,
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


  it("requests only the approved colmado plan", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: "Plan Completo",
          slug: "colmado-completo",
          price: "19.00",
          currency: "USD",
          interval: "monthly",
          max_users: 10,
          max_employees: 30,
          max_modules: 3,
          is_active: true,
        },
      ],
    });

    const plans = await getColmadoPlans();

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/subscriptions/plans/",
      {
        params: {
          app: "colmado",
        },
      },
    );
    expect(plans).toHaveLength(1);
    expect(plans[0]).toEqual(
      expect.objectContaining({
        name: "Plan Completo",
        slug: "colmado-completo",
        price: "19.00",
        currency: "USD",
      }),
    );
  });


  it("still excludes inactive plans returned by the server", async () => {
    apiMocks.get.mockResolvedValueOnce({
      data: [
        {
          id: 1,
          name: "Plan Completo",
          slug: "colmado-completo",
          price: "19.00",
          currency: "USD",
          interval: "monthly",
          max_users: 10,
          max_employees: 30,
          max_modules: 3,
          is_active: true,
        },
        {
          id: 2,
          name: "Plan anterior",
          slug: "basic",
          price: "99.00",
          currency: "USD",
          interval: "monthly",
          max_users: 3,
          max_employees: 10,
          max_modules: 1,
          is_active: false,
        },
      ],
    });

    const plans = await getColmadoPlans();

    expect(plans).toHaveLength(1);
    expect(plans[0].slug).toBe("colmado-completo");
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
      plan: "colmado-completo",
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
        plan: "colmado-completo",
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
      plan: "colmado-completo",
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
      plan: "colmado-completo",
    });

    expect(result).toEqual(responseData);
  });


  it("checks a completed Stripe checkout session", async () => {
    const responseData = {
      payment_status: "paid",
      organisation_name: "Colmado La Esquina",
      organisation_slug: "colmado-la-esquina",
      app_slug: "colmado",
      login_url: "/colmado/colmado-la-esquina/login",
      is_active: true,
    };
    apiMocks.get.mockResolvedValueOnce({ data: responseData });

    const result = await getColmadoCheckoutStatus("cs_test_123");

    expect(apiMocks.get).toHaveBeenCalledWith(
      "/subscriptions/checkout-session-status/",
      {
        params: {
          session_id: "cs_test_123",
        },
      },
    );
    expect(result).toEqual(responseData);
  });
});
