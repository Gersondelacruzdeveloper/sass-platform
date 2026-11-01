import api from "../../../api/axios";

type ApiList<T> = T[] | { results: T[] };

export interface StorefrontConfiguration {
  id: number;
  store: number;
  store_name: string;
  slug: string;
  display_name: string;
  description: string;
  public_phone: string;
  public_address: string;
  delivery_fee: string;
  minimum_order: string;
  is_accepting_orders: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SaveStorefrontPayload {
  store: number;
  slug: string;
  display_name: string;
  description: string;
  public_phone: string;
  public_address: string;
  delivery_fee: string;
  minimum_order: string;
  is_accepting_orders: boolean;
  is_active: boolean;
}

function organisationConfig(organisationSlug: string) {
  const normalizedSlug = organisationSlug.trim();

  if (!normalizedSlug) {
    throw new Error("Debe seleccionar una organización.");
  }

  return {
    headers: {
      "X-Organisation-Slug": normalizedSlug,
    },
  };
}

const listResults = <T>(data: ApiList<T>): T[] =>
  Array.isArray(data) ? data : data.results;

export async function getStorefrontConfigurations(
  organisationSlug: string,
): Promise<StorefrontConfiguration[]> {
  const response = await api.get<ApiList<StorefrontConfiguration>>(
    "/colmado/storefronts/",
    organisationConfig(organisationSlug),
  );

  return listResults(response.data);
}

export async function createStorefrontConfiguration(
  organisationSlug: string,
  payload: SaveStorefrontPayload,
): Promise<StorefrontConfiguration> {
  const response = await api.post<StorefrontConfiguration>(
    "/colmado/storefronts/",
    payload,
    organisationConfig(organisationSlug),
  );

  return response.data;
}

export async function updateStorefrontConfiguration(
  organisationSlug: string,
  storefrontId: number,
  payload: Partial<SaveStorefrontPayload>,
): Promise<StorefrontConfiguration> {
  const response = await api.patch<StorefrontConfiguration>(
    `/colmado/storefronts/${storefrontId}/`,
    payload,
    organisationConfig(organisationSlug),
  );

  return response.data;
}
