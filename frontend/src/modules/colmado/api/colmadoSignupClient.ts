import api from "../../../api/axios";


export interface ColmadoSubscriptionPlan {
  id: number;
  name: string;
  slug: string;
  price: string;
  currency: string;
  interval: "monthly" | "yearly";
  max_users: number;
  max_employees: number;
  max_modules: number;
  is_active: boolean;
}

export interface CreateColmadoCheckoutPayload {
  company_name: string;
  owner_name: string;
  email: string;
  password: string;
  plan: string;
  store_name?: string;
  store_address?: string;
  store_phone?: string;
}

export interface CreateColmadoCheckoutResponse {
  checkout_url: string;
  organisation_slug: string;
  login_url: string;
}

export async function getColmadoPlans(): Promise<
  ColmadoSubscriptionPlan[]
> {
  const response = await api.get<ColmadoSubscriptionPlan[]>(
    "/subscriptions/plans/",
  );

  return response.data.filter((plan) => plan.is_active);
}

export async function createColmadoCheckout(
  payload: CreateColmadoCheckoutPayload,
): Promise<CreateColmadoCheckoutResponse> {
  const response = await api.post<CreateColmadoCheckoutResponse>(
    "/subscriptions/create-checkout-session/",
    {
      ...payload,
      app: "colmado",
      business_type: "colmado",
    },
  );

  return response.data;
}
