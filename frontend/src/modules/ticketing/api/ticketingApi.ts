import api from "../../../api/axios";

import type {
  Booking,
  BookingCreatePayload,
  BookingPayment,
  BookingPaymentPayload,
  Customer,
  CreatePayload,
  EventTicketType,
  ExperienceCategory,
  ExperiencePackage,
  ExperienceProduct,
  ExternalProviderConfig,
  PickupLocation,
  PickupResolveResponse,
  PickupZone,
  ProductAvailability,
  ProductGalleryImage,
  ProductPickupSchedule,
  ProductReview,
  PublicBrandingResponse,
  Receipt,
  Seller,
  SellerCommission,
  SellerDashboard,
  TicketingDashboard,
  TicketingPublicSiteSettings,
  TicketingPaymentProviderSettings,
  PublicPaymentOptions,
  StripeCheckoutSessionPayload,
  StripeCheckoutSessionResponse,
  PayPalCreateOrderPayload,
  PayPalCreateOrderResponse,
  PayPalCaptureOrderPayload,
  PayPalCaptureOrderResponse,
  TicketingReports,
  TicketingSettings,
  TransferRoute,
  UpdatePayload,
  WelletProductsResponse,
  TicketingBusinessEntity,
  BusinessEntityUserAccess,
  BusinessEntityUserCreatePayload,
  BusinessEntityPasswordResetResponse,
  ProductBusinessAgreement,
  BookingFinancialSnapshot,
  AdmissionToken,
  TicketScanAttempt,
  TicketAdmission,
  TicketingLedgerEntry,
  PartnerSettlementPeriod,
  PartnerSettlementPayment,
  AdmissionTokenIssuePayload,
  TicketScanResolvePayload,
  TicketAdmissionCreatePayload,
  TicketAdmissionReversePayload,
  TicketScanResolution,
  OfflineScanEvent,
  OfflineScanSyncResponse,
  SettlementGeneratePayload,
  SettlementApprovalPayload,
  SettlementPaymentCreatePayload,
  SettlementPreview,
  BusinessEntityDashboard,
  AdmissionsDashboard,
  LedgerSummary,
  ManualLedgerAdjustmentPayload,
  SettlementReconciliation,
  BlogCategory,
  BlogPost,
  BlogPostGalleryImage,
  BlogPostWritePayload,
  PublicBlogPostSummary,
  PublicBlogPostDetail,
} from "../types/ticketingTypes";

import type {
  PublicSellerApplicationPayload,
  PublicSellerSignupInvite,
  SellerApplication,
  SellerApplicationDecisionPayload,
  SellerPayoutAccount,
  SellerPayoutAccountPayload,
  SellerPayoutBalance,
  SellerPayoutCreatePayload,
  SellerPayoutDecisionPayload,
  SellerPayoutRequest,
  SellerSignupInvite,
  SellerSignupInvitePayload,
} from "../types/ticketingTypes";

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type LiveTicketOption = {
  provider: "wellet" | "local" | string;

  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  external_option_id?: string;
  selected_external_product_id?: string;

  name?: string;
  option_name?: string;
  original_option_name?: string;

  price?: number | string;
  original_price?: number | string;
  discount_amount?: number | string;
  discount_percent?: number | string;

  currency?: string;

  available?: boolean;
  available_quantity?: number | null;
  sold_out?: boolean;

  service_date?: string;
  start_time?: string;
  end_time?: string;
  checkin_time?: string;
  performance_id?: string;

  description?: string;
  features?: string[];
  high_demand?: boolean;

  has_seller_offer?: boolean;
  seller_offer_locked?: boolean;
  seller_offer_external_option_id?: string;

  seller_commission_per_unit?: number | string;
  seller_allowance_per_unit?: number | string;
  owner_net_per_unit?: number | string;

  raw?: unknown;
};

export type SellerOfferAllowanceType =
  | "fixed_amount"
  | "percentage"
  | string;

export type SellerOfferLockMap = {
  product?: boolean;
  service_date?: boolean;
  external_option?: boolean;
  quantity?: boolean;
  package?: boolean;
  event_ticket_type?: boolean;
};

/**
 * Shared lock fields returned by the product-resolve and live-availability
 * endpoints. Both the direct fields and the nested `locked` shape are
 * supported while the frontend and backend migrate to one response format.
 */
export type SellerOfferLockFields = {
  product_locked?: boolean;
  option_locked?: boolean;
  package_locked?: boolean;
  event_ticket_type_locked?: boolean;
  service_date_locked?: boolean;
  date_locked?: boolean;
  quantity_locked?: boolean;
  locked?: SellerOfferLockMap;
};

export type PublicSellerOffer = SellerOfferLockFields & {
  valid: boolean;
  seller_id: number;
  seller_slug: string;
  seller_name?: string;

  legacy_offer?: boolean;
  offer_version?: number;

  rule_id?: number | null;
  rule_match_type?: string;
  allowance_type?: SellerOfferAllowanceType;

  quantity: number | string;

  unit_price?: number | string | null;
  original_unit_price?: number | string | null;
  original_price?: number | string | null;

  discount_percent?: number | string | null;
  customer_discount_amount?: number | string | null;
  discount_amount?: number | string | null;
  discount_per_unit?: number | string | null;

  customer_unit_price?: number | string | null;
  customer_final_price?: number | string | null;

  seller_allowance_amount?: number | string | null;
  seller_commission_amount?: number | string | null;
  seller_commission_per_unit?: number | string | null;
  owner_net_amount?: number | string | null;

  maximum_discount_amount?: number | string | null;
  maximum_discount_percent?: number | string | null;
  minimum_selling_price?: number | string | null;

  currency?: string;

  package_id?: number | null;
  event_ticket_type_id?: number | null;

  external_option_id?: string;
  external_option_ids?: string[];
  matched_external_option_id?: string;
  external_option_name?: string;

  service_date?: string;
};

export type LiveSellerOffer = PublicSellerOffer;

export type LiveProductAvailabilityResponse = {
  ok: boolean;
  provider: "wellet" | "local" | string;

  product?: {
    id: number;
    name: string;
    slug: string;
    external_product_id?: string;
  };

  service_date?: string;
  options: LiveTicketOption[];

  offer_valid?: boolean;
  seller_offer?: LiveSellerOffer | null;
  selected_offer_option_id?: string;

  raw?: unknown;
  error?: string;
  detail?: string;
};

export type SellerPricingQuoteParams = {
  quantity?: number;
  unit_price?: number | string;

  service_date?: string;
  date?: string;

  package?: number;
  package_id?: number;

  event_ticket_type?: number;
  event_ticket_type_id?: number;

  external_option_id?: string;
  selected_external_product_id?: string;
  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  external_option_name?: string;
};

export type SellerPricingQuoteResponse = {
  product_id: number;
  product_name?: string;

  quantity: number;
  unit_price: string;
  original_price: string;

  rule_id?: number | null;
  rule_match_type?: string;
  rule_name?: string;
  allowance_type: SellerOfferAllowanceType;
  allowance_percentage?: string;

  seller_allowance_amount: string;
  seller_commission_amount: string;

  maximum_discount_amount: string;
  maximum_discount_percent: string;
  minimum_selling_price: string;
  owner_net_amount: string;

  is_per_unit?: boolean;
  can_apply_discounts?: boolean;
  currency?: string;

  package_id?: number | string | null;
  event_ticket_type_id?: number | string | null;

  external_option_id?: string;
  external_option_ids?: string[];
  external_option_name?: string;
  service_date?: string;
};

export type SellerSignedOfferLinkPayload = SellerPricingQuoteParams & {
  customer_unit_price?: number | string;
  customer_price?: number | string;
  customer_total_price?: number | string;
  discount_amount?: number | string;
  discount_percent?: number | string;
};

export interface SellerSignedOfferLinkResponse {
  organisation_slug: string;
  seller_slug: string;

  product_id: number;
  product_slug: string;

  rule_id?: number | null;
  rule_match_type?: string;
  allowance_type?: SellerOfferAllowanceType;

  quantity: number;
  unit_price: string;
  original_price: string;

  discount_percent: string;
  discount_amount: string;
  maximum_discount_percent: string;
  maximum_discount_amount: string;

  customer_unit_price: string;
  customer_final_price: string;
  minimum_selling_price: string;

  seller_allowance_amount: string;
  seller_commission_per_unit: string;
  seller_commission_amount: string;
  owner_net_amount: string;

  external_option_id?: string;
  external_option_name?: string;
  currency?: string;

  offer_token: string;
  expires_in_seconds: number;
  offer_url?: string;
}

export type SupportedProductLanguage = "en" | "es" | "fr" | "pt" | "de";

export type ProductTranslationMeta = {
  source?: "manual" | "ai" | string;
  manually_edited?: boolean;
  source_language?: SupportedProductLanguage | string;
  target_language?: SupportedProductLanguage | string;
  provider?: string;
  model?: string;
  generated_at?: string;
  updated_at?: string;
  updated_by?: number | null;
};

export type ProductTranslation = {
  name?: string;
  short_description?: string;
  long_description?: string;
  includes?: unknown[];
  excludes?: unknown[];
  itinerary?: unknown[];
  faqs?: unknown[];
  meeting_point?: string;
  ticket_information?: string;
  instructions?: string;
  cancellation_policy?: string;
  _meta?: ProductTranslationMeta;
};

export type ProductTranslations = Partial<
  Record<SupportedProductLanguage, ProductTranslation>
>;

export type ProductTranslationsResponse = {
  product_id: number;
  default_language: SupportedProductLanguage;
  supported_languages: SupportedProductLanguage[];
  translations: ProductTranslations;
};

export type ProductTranslationResponse = {
  product_id: number;
  language: SupportedProductLanguage;
  translation: ProductTranslation;
};

export type GeneratedProductTranslationResponse = {
  product_id: number;
  source_language: SupportedProductLanguage;
  target_language: SupportedProductLanguage;
  translation: ProductTranslation;
};

export type OrganisationAISettings = {
  id: number;
  organisation: number;
  provider: "openai" | string;
  is_enabled: boolean;
  translations_enabled: boolean;
  default_model: string;
  has_api_key: boolean;
  provider_api_key_last_updated?: string | null;
  ai_ready: boolean;
  last_test_at?: string | null;
  last_error_message?: string;
  created_at?: string;
  updated_at?: string;
};

export type OrganisationAISettingsUpdatePayload = Partial<
  Pick<
    OrganisationAISettings,
    "provider" | "is_enabled" | "translations_enabled" | "default_model"
  >
> & {
  api_key?: string;
  clear_api_key?: boolean;
};

export type OrganisationAIConnectionTestResponse = {
  success: boolean;
  message: string;
};

export interface PublicProductResolveResponse {
  found?: boolean;
  offer_valid?: boolean;
  seller_offer?: PublicSellerOffer | null;

  product: ExperienceProduct & {
    has_seller_offer?: boolean;
    seller_offer?: PublicSellerOffer | null;
    seller_offer_original_price?: number | string | null;
    seller_offer_customer_price?: number | string | null;
    seller_offer_discount_amount?: number | string | null;
    seller_offer_discount_percent?: number | string | null;
  };

  canonical_url: string;
  canonical_path?: string;
  current_public_path: string;
  requested_path?: string;

  resolved_by: string;
  should_redirect: boolean;
  redirect_path?: string;
  redirect_type: number;
}

const cleanParams = (params?: QueryParams): QueryParams => {
  if (!params) return {};

  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
};

const withSlug = (params?: QueryParams, slug?: string): QueryParams => {
  return cleanParams({
    ...params,
    slug,
    organisation_slug: slug,
  });
};

const unwrapList = <T>(payload: T[] | { results?: T[] }): T[] => {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.results) ? payload.results : [];
};


const appendFormValue = (formData: FormData, key: string, value: unknown) => {
  if (value === undefined || value === null) return;

  if (value instanceof File) {
    formData.append(key, value);
    return;
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    formData.append(key, JSON.stringify(value));
    return;
  }

  if (typeof value === "boolean") {
    formData.append(key, value ? "true" : "false");
    return;
  }

  formData.append(key, String(value));
};

const buildSellerApplicationFormData = (
  payload: Partial<PublicSellerApplicationPayload>,
): FormData => {
  const formData = new FormData();

  Object.entries(payload).forEach(([key, value]) => {
    appendFormValue(formData, key, value);
  });

  return formData;
};

export const ticketingApi = {
  // Dashboard and reports
  getDashboard: async (slug?: string): Promise<TicketingDashboard> => {
    const response = await api.get<TicketingDashboard>("/ticketing/dashboard/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getReports: async (slug?: string, params?: QueryParams): Promise<TicketingReports> => {
    const response = await api.get<TicketingReports>("/ticketing/reports/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerDashboard: async (slug?: string): Promise<SellerDashboard> => {
    const response = await api.get<SellerDashboard>("/ticketing/seller/dashboard/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  // Settings
  getSettings: async (slug?: string): Promise<TicketingSettings> => {
    const response = await api.get<TicketingSettings>("/ticketing/settings/mine/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateSettings: async (
    payload: UpdatePayload<TicketingSettings>,
    slug?: string
  ): Promise<TicketingSettings> => {
    const response = await api.patch<TicketingSettings>("/ticketing/settings/mine/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getPublicSiteSettings: async (slug?: string): Promise<TicketingPublicSiteSettings> => {
    const response = await api.get<TicketingPublicSiteSettings>(
      "/ticketing/public-site-settings/mine/",
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updatePublicSiteSettings: async (
    payload: UpdatePayload<TicketingPublicSiteSettings> | FormData,
    slug?: string
  ): Promise<TicketingPublicSiteSettings> => {
    const response = await api.patch<TicketingPublicSiteSettings>(
      "/ticketing/public-site-settings/mine/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },




  getOrganisationAISettings: async (
    slug?: string
  ): Promise<OrganisationAISettings> => {
    const response = await api.get<OrganisationAISettings>(
      "/organisations/ai-settings/mine/",
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updateOrganisationAISettings: async (
    payload: OrganisationAISettingsUpdatePayload,
    slug?: string
  ): Promise<OrganisationAISettings> => {
    const response = await api.patch<OrganisationAISettings>(
      "/organisations/ai-settings/mine/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  testOrganisationAIConnection: async (
    slug?: string
  ): Promise<OrganisationAIConnectionTestResponse> => {
    const response = await api.post<OrganisationAIConnectionTestResponse>(
      "/organisations/ai-settings/test/",
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  getPaymentProviderSettings: async (slug?: string): Promise<TicketingPaymentProviderSettings> => {
    const response = await api.get<TicketingPaymentProviderSettings>(
      "/ticketing/payment-provider-settings/mine/",
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updatePaymentProviderSettings: async (
    payload: UpdatePayload<TicketingPaymentProviderSettings>,
    slug?: string
  ): Promise<TicketingPaymentProviderSettings> => {
    const response = await api.patch<TicketingPaymentProviderSettings>(
      "/ticketing/payment-provider-settings/mine/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Categories
  getCategories: async (slug?: string, params?: QueryParams): Promise<ExperienceCategory[]> => {
    const response = await api.get<ExperienceCategory[]>("/ticketing/categories/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createCategory: async (
    payload: CreatePayload<ExperienceCategory> | FormData,
    slug?: string
  ): Promise<ExperienceCategory> => {
    const response = await api.post<ExperienceCategory>("/ticketing/categories/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateCategory: async (
    id: number,
    payload: UpdatePayload<ExperienceCategory> | FormData,
    slug?: string
  ): Promise<ExperienceCategory> => {
    const response = await api.patch<ExperienceCategory>(`/ticketing/categories/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deleteCategory: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/categories/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  // Products
  getProducts: async (slug?: string, params?: QueryParams): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/products/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerProducts: async (slug?: string, params?: QueryParams): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/seller/products/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getProduct: async (id: number, slug?: string): Promise<ExperienceProduct> => {
    const response = await api.get<ExperienceProduct>(`/ticketing/products/${id}/`, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getExcursions: async (slug?: string): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/products/excursions/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getTransfers: async (slug?: string): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/products/transfers/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getEvents: async (slug?: string): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/products/events/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getTickets: async (slug?: string): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/products/tickets/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createProduct: async (
    payload: CreatePayload<ExperienceProduct> | FormData,
    slug?: string
  ): Promise<ExperienceProduct> => {
    const response = await api.post<ExperienceProduct>("/ticketing/products/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateProduct: async (
    id: number,
    payload: UpdatePayload<ExperienceProduct> | FormData,
    slug?: string
  ): Promise<ExperienceProduct> => {
    const response = await api.patch<ExperienceProduct>(`/ticketing/products/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deleteProduct: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/products/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },


  getProductTranslations: async (
    productId: number,
    slug?: string
  ): Promise<ProductTranslationsResponse> => {
    const response = await api.get<ProductTranslationsResponse>(
      `/ticketing/products/${productId}/translations/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  saveProductTranslation: async (
    productId: number,
    language: SupportedProductLanguage,
    translation: ProductTranslation,
    slug?: string
  ): Promise<ProductTranslationResponse> => {
    const response = await api.put<ProductTranslationResponse>(
      `/ticketing/products/${productId}/translations/${language}/`,
      {
        translation,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deleteProductTranslation: async (
    productId: number,
    language: SupportedProductLanguage,
    slug?: string
  ): Promise<void> => {
    await api.delete(
      `/ticketing/products/${productId}/translations/${language}/`,
      {
        params: withSlug(undefined, slug),
      }
    );
  },

  generateProductTranslation: async (
    productId: number,
    language: SupportedProductLanguage,
    options: {
      force?: boolean;
    } = {},
    slug?: string
  ): Promise<GeneratedProductTranslationResponse> => {
    const response = await api.post<GeneratedProductTranslationResponse>(
      `/ticketing/products/${productId}/translations/${language}/generate/`,
      {
        force: options.force ?? false,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Product gallery images
  getProductGalleryImages: async (
    slug?: string,
    params?: QueryParams
  ): Promise<ProductGalleryImage[]> => {
    const response = await api.get<ProductGalleryImage[]>(
      "/ticketing/product-gallery-images/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  createProductGalleryImage: async (
    payload: FormData,
    slug?: string
  ): Promise<ProductGalleryImage> => {
    const response = await api.post<ProductGalleryImage>(
      "/ticketing/product-gallery-images/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updateProductGalleryImage: async (
    id: number,
    payload: UpdatePayload<ProductGalleryImage> | FormData,
    slug?: string
  ): Promise<ProductGalleryImage> => {
    const response = await api.patch<ProductGalleryImage>(
      `/ticketing/product-gallery-images/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deleteProductGalleryImage: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/product-gallery-images/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  makeProductGalleryImageCover: async (
    id: number,
    slug?: string
  ): Promise<ProductGalleryImage> => {
    const response = await api.post<ProductGalleryImage>(
      `/ticketing/product-gallery-images/${id}/make-cover/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Packages and availability
  getPackages: async (slug?: string, params?: QueryParams): Promise<ExperiencePackage[]> => {
    const response = await api.get<ExperiencePackage[]>("/ticketing/packages/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createPackage: async (
    payload: CreatePayload<ExperiencePackage> & { product_id?: number },
    slug?: string
  ): Promise<ExperiencePackage> => {
    const response = await api.post<ExperiencePackage>("/ticketing/packages/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updatePackage: async (
    id: number,
    payload: UpdatePayload<ExperiencePackage>,
    slug?: string
  ): Promise<ExperiencePackage> => {
    const response = await api.patch<ExperiencePackage>(`/ticketing/packages/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deletePackage: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/packages/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getAvailability: async (slug?: string, params?: QueryParams): Promise<ProductAvailability[]> => {
    const response = await api.get<ProductAvailability[]>("/ticketing/availability/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createAvailability: async (
    payload: CreatePayload<ProductAvailability> & { product_id?: number; package_id?: number | null },
    slug?: string
  ): Promise<ProductAvailability> => {
    const response = await api.post<ProductAvailability>("/ticketing/availability/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateAvailability: async (
    id: number,
    payload: UpdatePayload<ProductAvailability>,
    slug?: string
  ): Promise<ProductAvailability> => {
    const response = await api.patch<ProductAvailability>(`/ticketing/availability/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deleteAvailability: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/availability/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  // Pickup
  getPickupZones: async (slug?: string): Promise<PickupZone[]> => {
    const response = await api.get<PickupZone[]>("/ticketing/pickup-zones/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createPickupZone: async (payload: CreatePayload<PickupZone>, slug?: string): Promise<PickupZone> => {
    const response = await api.post<PickupZone>("/ticketing/pickup-zones/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updatePickupZone: async (
    id: number,
    payload: UpdatePayload<PickupZone>,
    slug?: string
  ): Promise<PickupZone> => {
    const response = await api.patch<PickupZone>(`/ticketing/pickup-zones/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deletePickupZone: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/pickup-zones/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getPickupLocations: async (slug?: string, params?: QueryParams): Promise<PickupLocation[]> => {
    const response = await api.get<PickupLocation[]>("/ticketing/pickup-locations/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getPublicPickupLocations: async (
    slug: string,
    params?: QueryParams
  ): Promise<PickupLocation[]> => {
    const response = await api.get<PickupLocation[]>(
      "/ticketing/public/pickup-locations/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  createPickupLocation: async (
    payload: CreatePayload<PickupLocation> & { zone_id?: number | null },
    slug?: string
  ): Promise<PickupLocation> => {
    const response = await api.post<PickupLocation>("/ticketing/pickup-locations/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updatePickupLocation: async (
    id: number,
    payload: UpdatePayload<PickupLocation> & { zone_id?: number | null },
    slug?: string
  ): Promise<PickupLocation> => {
    const response = await api.patch<PickupLocation>(`/ticketing/pickup-locations/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deletePickupLocation: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/pickup-locations/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getPickupSchedules: async (
    slug?: string,
    params?: QueryParams
  ): Promise<ProductPickupSchedule[]> => {
    const response = await api.get<ProductPickupSchedule[]>("/ticketing/pickup-schedules/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  resolvePickupSchedule: async (
    slug: string | undefined,
    product: number,
    pickupLocation: number,
    serviceDate: string
  ): Promise<PickupResolveResponse> => {
    const response = await api.get<PickupResolveResponse>("/ticketing/pickup-schedules/resolve/", {
      params: withSlug(
        {
          product,
          pickup_location: pickupLocation,
          service_date: serviceDate,
        },
        slug
      ),
    });
    return response.data;
  },

  resolvePublicPickupSchedule: async (
    slug: string,
    product: number,
    pickupLocation: number,
    serviceDate: string
  ): Promise<PickupResolveResponse> => {
    const response = await api.get<PickupResolveResponse>(
      "/ticketing/public/pickup-schedules/resolve/",
      {
        params: withSlug(
          {
            product,
            pickup_location: pickupLocation,
            service_date: serviceDate,
          },
          slug
        ),
      }
    );
    return response.data;
  },

  createPickupSchedule: async (
    payload: CreatePayload<ProductPickupSchedule> & {
      product_id?: number;
      pickup_location_id?: number;
    },
    slug?: string
  ): Promise<ProductPickupSchedule> => {
    const response = await api.post<ProductPickupSchedule>("/ticketing/pickup-schedules/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updatePickupSchedule: async (
    id: number,
    payload: UpdatePayload<ProductPickupSchedule>,
    slug?: string
  ): Promise<ProductPickupSchedule> => {
    const response = await api.patch<ProductPickupSchedule>(
      `/ticketing/pickup-schedules/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deletePickupSchedule: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/pickup-schedules/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  // Customers
  getCustomers: async (slug?: string, params?: QueryParams): Promise<Customer[]> => {
    const response = await api.get<Customer[]>("/ticketing/customers/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createCustomer: async (payload: CreatePayload<Customer>, slug?: string): Promise<Customer> => {
    const response = await api.post<Customer>("/ticketing/customers/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateCustomer: async (id: number, payload: UpdatePayload<Customer>, slug?: string): Promise<Customer> => {
    const response = await api.patch<Customer>(`/ticketing/customers/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  // Sellers
  getSellers: async (slug?: string, params?: QueryParams): Promise<Seller[]> => {
    const response = await api.get<Seller[]>("/ticketing/sellers/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerMe: async (slug?: string): Promise<Seller> => {
    const response = await api.get<Seller>("/ticketing/sellers/me/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createSeller: async (
    payload: CreatePayload<Seller> | FormData,
    slug?: string
  ): Promise<Seller> => {
    const response = await api.post<Seller>("/ticketing/sellers/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateSeller: async (
    id: number,
    payload: UpdatePayload<Seller> | FormData,
    slug?: string
  ): Promise<Seller> => {
    const response = await api.patch<Seller>(`/ticketing/sellers/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  deleteSeller: async (id: number, slug?: string): Promise<void> => {
    await api.delete(`/ticketing/sellers/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  applySellerRoleDefaults: async (id: number, slug?: string): Promise<Seller> => {
    const response = await api.post<Seller>(
      `/ticketing/sellers/${id}/apply-role-defaults/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Bookings
  getBookings: async (slug?: string, params?: QueryParams): Promise<Booking[]> => {
    const response = await api.get<Booking[]>("/ticketing/bookings/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerBookings: async (slug?: string, params?: QueryParams): Promise<Booking[]> => {
    const response = await api.get<Booking[]>("/ticketing/seller/bookings/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getBooking: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.get<Booking>(`/ticketing/bookings/${id}/`, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createBooking: async (payload: BookingCreatePayload, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>("/ticketing/bookings/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateBooking: async (id: number, payload: Partial<Booking>, slug?: string): Promise<Booking> => {
    const response = await api.patch<Booking>(`/ticketing/bookings/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  confirmBooking: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(`/ticketing/bookings/${id}/confirm/`, {}, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  approveBooking: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(`/ticketing/bookings/${id}/approve/`, {}, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  markTicketGenerated: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(
      `/ticketing/bookings/${id}/mark-ticket-generated/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  completeBooking: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(`/ticketing/bookings/${id}/complete/`, {}, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  cancelBooking: async (id: number, reason = "", slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(
      `/ticketing/bookings/${id}/cancel/`,
      { reason },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  addBookingPayment: async (
    bookingId: number,
    payload: BookingPaymentPayload,
    slug?: string
  ): Promise<{ payment: BookingPayment; booking: Booking }> => {
    const response = await api.post<{ payment: BookingPayment; booking: Booking }>(
      `/ticketing/bookings/${bookingId}/add-payment/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  createSellerBooking: async (
    payload: BookingCreatePayload,
    slug?: string
  ): Promise<Booking> => {
    const response = await api.post<Booking>("/ticketing/seller/bookings/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  addSellerBookingPayment: async (
    bookingId: number,
    payload: BookingPaymentPayload,
    slug?: string
  ): Promise<{ payment: BookingPayment; booking: Booking }> => {
    const response = await api.post<{ payment: BookingPayment; booking: Booking }>(
      `/ticketing/seller/bookings/${bookingId}/add-payment/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  markSellerTicketGenerated: async (id: number, slug?: string): Promise<Booking> => {
    const response = await api.post<Booking>(
      `/ticketing/seller/bookings/${id}/mark-ticket-generated/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  cancelSellerBooking: async (
    id: number,
    reason = "",
    slug?: string
  ): Promise<Booking> => {
    const response = await api.post<Booking>(
      `/ticketing/seller/bookings/${id}/cancel/`,
      { reason },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  overridePickup: async (
    bookingId: number,
    payload: {
      pickup_time?: string;
      pickup_point?: string;
      instructions?: string;
      override_reason?: string;
    },
    slug?: string
  ) => {
    const response = await api.post(`/ticketing/bookings/${bookingId}/override-pickup/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  // Payments, commissions, receipts
  getPayments: async (slug?: string, params?: QueryParams): Promise<BookingPayment[]> => {
    const response = await api.get<BookingPayment[]>("/ticketing/payments/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getCommissions: async (slug?: string, params?: QueryParams): Promise<SellerCommission[]> => {
    const response = await api.get<SellerCommission[]>("/ticketing/commissions/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerPayments: async (slug?: string, params?: QueryParams): Promise<BookingPayment[]> => {
    const response = await api.get<BookingPayment[]>("/ticketing/seller/payments/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getSellerCommissions: async (slug?: string, params?: QueryParams): Promise<SellerCommission[]> => {
    const response = await api.get<SellerCommission[]>("/ticketing/seller/commissions/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  markCommissionPaid: async (id: number, slug?: string): Promise<SellerCommission> => {
    const response = await api.post<SellerCommission>(
      `/ticketing/commissions/${id}/mark-paid/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  getReceipts: async (slug?: string, params?: QueryParams): Promise<Receipt[]> => {
    const response = await api.get<Receipt[]>("/ticketing/receipts/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  markReceiptEmailSent: async (id: number, slug?: string): Promise<Receipt> => {
    const response = await api.post<Receipt>(
      `/ticketing/receipts/${id}/mark-email-sent/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  markReceiptWhatsAppSent: async (id: number, slug?: string): Promise<Receipt> => {
    const response = await api.post<Receipt>(
      `/ticketing/receipts/${id}/mark-whatsapp-sent/`,
      {},
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Transfer routes and event ticket types
  getTransferRoutes: async (slug?: string, params?: QueryParams): Promise<TransferRoute[]> => {
    const response = await api.get<TransferRoute[]>("/ticketing/transfer-routes/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createTransferRoute: async (
    payload: CreatePayload<TransferRoute> & { product_id?: number },
    slug?: string
  ): Promise<TransferRoute> => {
    const response = await api.post<TransferRoute>("/ticketing/transfer-routes/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateTransferRoute: async (
    id: number,
    payload: UpdatePayload<TransferRoute>,
    slug?: string
  ): Promise<TransferRoute> => {
    const response = await api.patch<TransferRoute>(`/ticketing/transfer-routes/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  getEventTicketTypes: async (slug?: string, params?: QueryParams): Promise<EventTicketType[]> => {
    const response = await api.get<EventTicketType[]>("/ticketing/event-ticket-types/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createEventTicketType: async (
    payload: CreatePayload<EventTicketType> & { product_id?: number },
    slug?: string
  ): Promise<EventTicketType> => {
    const response = await api.post<EventTicketType>("/ticketing/event-ticket-types/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateEventTicketType: async (
    id: number,
    payload: UpdatePayload<EventTicketType>,
    slug?: string
  ): Promise<EventTicketType> => {
    const response = await api.patch<EventTicketType>(
      `/ticketing/event-ticket-types/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Reviews
  getReviews: async (slug?: string, params?: QueryParams): Promise<ProductReview[]> => {
    const response = await api.get<ProductReview[]>("/ticketing/reviews/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  createReview: async (payload: CreatePayload<ProductReview>, slug?: string): Promise<ProductReview> => {
    const response = await api.post<ProductReview>("/ticketing/reviews/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateReview: async (
    id: number,
    payload: UpdatePayload<ProductReview>,
    slug?: string
  ): Promise<ProductReview> => {
    const response = await api.patch<ProductReview>(`/ticketing/reviews/${id}/`, payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  // Integrations
  getWelletSettings: async (slug?: string): Promise<ExternalProviderConfig> => {
    const response = await api.get<ExternalProviderConfig>("/ticketing/integrations/wellet/settings/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  updateWelletSettings: async (
    payload: UpdatePayload<ExternalProviderConfig>,
    slug?: string
  ): Promise<ExternalProviderConfig> => {
    const response = await api.patch<ExternalProviderConfig>(
      "/ticketing/integrations/wellet/settings/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  getWelletProducts: async (slug?: string, params?: QueryParams): Promise<WelletProductsResponse> => {
    const response = await api.get<WelletProductsResponse>("/ticketing/integrations/wellet/products/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

  getLiveAvailability: async (
    slug?: string,
    params?: QueryParams
  ): Promise<LiveProductAvailabilityResponse> => {
    const response = await api.get<LiveProductAvailabilityResponse>(
      "/ticketing/live-availability/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },


  // ==========================================================================
  // Operations: business entities, admissions, settlements and ledger
  // ==========================================================================

  // Business entities
  getBusinessEntities: async (
    slug?: string,
    params?: QueryParams
  ): Promise<TicketingBusinessEntity[]> => {
    const response = await api.get<TicketingBusinessEntity[]>(
      "/ticketing/business-entities/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getMyBusinessEntities: async (
    slug?: string
  ): Promise<TicketingBusinessEntity[]> => {
    const response = await api.get<TicketingBusinessEntity[]>(
      "/ticketing/business-entities/mine/",
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  getBusinessEntity: async (
    id: number,
    slug?: string
  ): Promise<TicketingBusinessEntity> => {
    const response = await api.get<TicketingBusinessEntity>(
      `/ticketing/business-entities/${id}/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  createBusinessEntity: async (
    payload: CreatePayload<TicketingBusinessEntity>,
    slug?: string
  ): Promise<TicketingBusinessEntity> => {
    const response = await api.post<TicketingBusinessEntity>(
      "/ticketing/business-entities/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updateBusinessEntity: async (
    id: number,
    payload: UpdatePayload<TicketingBusinessEntity>,
    slug?: string
  ): Promise<TicketingBusinessEntity> => {
    const response = await api.patch<TicketingBusinessEntity>(
      `/ticketing/business-entities/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deleteBusinessEntity: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/business-entities/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getBusinessEntityDashboard: async (
    id: number,
    slug?: string,
    params?: QueryParams
  ): Promise<BusinessEntityDashboard> => {
    const response = await api.get<BusinessEntityDashboard>(
      `/ticketing/business-entities/${id}/dashboard/`,
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  // Business entity user access
  getBusinessEntityUsers: async (
    slug?: string,
    params?: QueryParams
  ): Promise<BusinessEntityUserAccess[]> => {
    const response = await api.get<BusinessEntityUserAccess[]>(
      "/ticketing/business-entity-access/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  createBusinessEntityUser: async (
    payload: BusinessEntityUserCreatePayload,
    slug?: string
  ): Promise<BusinessEntityUserAccess> => {
    const response = await api.post<BusinessEntityUserAccess>(
      "/ticketing/business-entity-access/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updateBusinessEntityUser: async (
    id: number,
    payload: UpdatePayload<BusinessEntityUserAccess>,
    slug?: string
  ): Promise<BusinessEntityUserAccess> => {
    const response = await api.patch<BusinessEntityUserAccess>(
      `/ticketing/business-entity-access/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deleteBusinessEntityUser: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/business-entity-access/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },


  resetBusinessEntityUserPassword: async (
    id: number,
    payload: { temporary_password?: string; generate_password?: boolean } = { generate_password: true },
    slug?: string
  ): Promise<BusinessEntityPasswordResetResponse> => {
    const response = await api.post<BusinessEntityPasswordResetResponse>(
      `/ticketing/business-entity-access/${id}/reset-password/`,
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  activateBusinessEntityUser: async (
    id: number,
    slug?: string
  ): Promise<BusinessEntityUserAccess> => {
    const response = await api.post<BusinessEntityUserAccess>(
      `/ticketing/business-entity-access/${id}/activate/`,
      {},
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  deactivateBusinessEntityUser: async (
    id: number,
    slug?: string
  ): Promise<BusinessEntityUserAccess> => {
    const response = await api.post<BusinessEntityUserAccess>(
      `/ticketing/business-entity-access/${id}/deactivate/`,
      {},
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  applyBusinessEntityUserRoleDefaults: async (
    id: number,
    role: BusinessEntityUserAccess["role"],
    slug?: string
  ): Promise<BusinessEntityUserAccess> => {
    const response = await api.post<BusinessEntityUserAccess>(
      `/ticketing/business-entity-access/${id}/apply-role-defaults/`,
      { role },
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  // Product/business agreements
  getBusinessAgreements: async (
    slug?: string,
    params?: QueryParams
  ): Promise<ProductBusinessAgreement[]> => {
    const response = await api.get<ProductBusinessAgreement[]>(
      "/ticketing/business-agreements/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getBusinessAgreement: async (
    id: number,
    slug?: string
  ): Promise<ProductBusinessAgreement> => {
    const response = await api.get<ProductBusinessAgreement>(
      `/ticketing/business-agreements/${id}/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  createBusinessAgreement: async (
    payload: CreatePayload<ProductBusinessAgreement> & {
      business_entity_id: number;
      product_id: number;
    },
    slug?: string
  ): Promise<ProductBusinessAgreement> => {
    const response = await api.post<ProductBusinessAgreement>(
      "/ticketing/business-agreements/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  updateBusinessAgreement: async (
    id: number,
    payload: UpdatePayload<ProductBusinessAgreement>,
    slug?: string
  ): Promise<ProductBusinessAgreement> => {
    const response = await api.patch<ProductBusinessAgreement>(
      `/ticketing/business-agreements/${id}/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  deleteBusinessAgreement: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/business-agreements/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  // Financial snapshots
  getFinancialSnapshots: async (
    slug?: string,
    params?: QueryParams
  ): Promise<BookingFinancialSnapshot[]> => {
    const response = await api.get<BookingFinancialSnapshot[]>(
      "/ticketing/financial-snapshots/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  captureBookingSnapshots: async (
    bookingId: number,
    slug?: string,
    forceRefresh = false
  ): Promise<BookingFinancialSnapshot[]> => {
    const response = await api.post<BookingFinancialSnapshot[]>(
      "/ticketing/financial-snapshots/capture-booking/",
      {
        booking_id: bookingId,
        force_refresh: forceRefresh,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Admission tokens
  getAdmissionTokens: async (
    slug?: string,
    params?: QueryParams
  ): Promise<AdmissionToken[]> => {
    const response = await api.get<AdmissionToken[]>(
      "/ticketing/admission-tokens/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  issueAdmissionToken: async (
    payload: AdmissionTokenIssuePayload,
    slug?: string
  ): Promise<AdmissionToken & { qr_payload?: string }> => {
    const response = await api.post<AdmissionToken & { qr_payload?: string }>(
      "/ticketing/admission-tokens/issue/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  rotateAdmissionToken: async (
    id: number,
    payload: {
      reason?: string;
      metadata?: Record<string, unknown>;
    } = {},
    slug?: string
  ): Promise<AdmissionToken> => {
    const response = await api.post<AdmissionToken>(
      `/ticketing/admission-tokens/${id}/rotate/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  revokeAdmissionToken: async (
    id: number,
    reason = "Admission token revoked.",
    slug?: string
  ): Promise<AdmissionToken> => {
    const response = await api.post<AdmissionToken>(
      `/ticketing/admission-tokens/${id}/revoke/`,
      { reason },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // QR scanner
  resolveTicket: async (
    payload: TicketScanResolvePayload,
    slug?: string
  ): Promise<TicketScanResolution> => {
    const response = await api.post<TicketScanResolution>(
      "/ticketing/scanner/resolve/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  admitTicket: async (
    payload: TicketAdmissionCreatePayload,
    slug?: string
  ): Promise<TicketScanResolution> => {
    const response = await api.post<TicketScanResolution>(
      "/ticketing/scanner/admit/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  syncOfflineScans: async (
    businessEntityId: number,
    events: OfflineScanEvent[],
    slug?: string
  ): Promise<OfflineScanSyncResponse> => {
    const response = await api.post<OfflineScanSyncResponse>(
      "/ticketing/scanner/sync-offline/",
      {
        business_entity_id: businessEntityId,
        events,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Admissions and scan audit
  getAdmissions: async (
    slug?: string,
    params?: QueryParams
  ): Promise<TicketAdmission[]> => {
    const response = await api.get<TicketAdmission[]>(
      "/ticketing/admissions/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getAdmission: async (
    id: number,
    slug?: string
  ): Promise<TicketAdmission> => {
    const response = await api.get<TicketAdmission>(
      `/ticketing/admissions/${id}/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  reverseAdmission: async (
    id: number,
    payload: TicketAdmissionReversePayload,
    slug?: string
  ): Promise<TicketAdmission> => {
    const response = await api.post<TicketAdmission>(
      `/ticketing/admissions/${id}/reverse/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  getAdmissionsDashboard: async (
    slug?: string,
    params?: QueryParams
  ): Promise<AdmissionsDashboard> => {
    const response = await api.get<AdmissionsDashboard>(
      "/ticketing/admissions/dashboard/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getScanAttempts: async (
    slug?: string,
    params?: QueryParams
  ): Promise<TicketScanAttempt[]> => {
    const response = await api.get<TicketScanAttempt[]>(
      "/ticketing/scan-attempts/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  // Partner settlements
  getPartnerSettlements: async (
    slug?: string,
    params?: QueryParams
  ): Promise<PartnerSettlementPeriod[]> => {
    const response = await api.get<PartnerSettlementPeriod[]>(
      "/ticketing/partner-settlements/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getPartnerSettlement: async (
    id: number,
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.get<PartnerSettlementPeriod>(
      `/ticketing/partner-settlements/${id}/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  previewPartnerSettlement: async (
    payload: SettlementGeneratePayload,
    slug?: string
  ): Promise<SettlementPreview> => {
    const response = await api.post<SettlementPreview>(
      "/ticketing/partner-settlements/preview/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  generatePartnerSettlement: async (
    payload: SettlementGeneratePayload,
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.post<PartnerSettlementPeriod>(
      "/ticketing/partner-settlements/generate/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  submitPartnerSettlementForReview: async (
    id: number,
    payload: SettlementApprovalPayload = {},
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.post<PartnerSettlementPeriod>(
      `/ticketing/partner-settlements/${id}/submit-review/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  approvePartnerSettlement: async (
    id: number,
    payload: SettlementApprovalPayload = {},
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.post<PartnerSettlementPeriod>(
      `/ticketing/partner-settlements/${id}/approve/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  disputePartnerSettlement: async (
    id: number,
    notes: string,
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.post<PartnerSettlementPeriod>(
      `/ticketing/partner-settlements/${id}/dispute/`,
      { notes },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  cancelPartnerSettlement: async (
    id: number,
    notes = "",
    slug?: string
  ): Promise<PartnerSettlementPeriod> => {
    const response = await api.post<PartnerSettlementPeriod>(
      `/ticketing/partner-settlements/${id}/cancel/`,
      { notes },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  recordPartnerSettlementPayment: async (
    id: number,
    payload: SettlementPaymentCreatePayload,
    slug?: string
  ): Promise<{
    payment: PartnerSettlementPayment;
    settlement: PartnerSettlementPeriod;
  }> => {
    const requestPayload =
      payload.attachment instanceof File
        ? (() => {
            const form = new FormData();
            Object.entries(payload).forEach(([key, value]) => {
              if (value === undefined || value === null || value === "") return;
              if (key === "attachment" && value instanceof File) {
                form.append(key, value);
              } else {
                form.append(key, String(value));
              }
            });
            return form;
          })()
        : payload;

    const response = await api.post<{
      payment: PartnerSettlementPayment;
      settlement: PartnerSettlementPeriod;
    }>(
      `/ticketing/partner-settlements/${id}/record-payment/`,
      requestPayload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  reconcilePartnerSettlement: async (
    id: number,
    slug?: string
  ): Promise<SettlementReconciliation> => {
    const response = await api.get<SettlementReconciliation>(
      `/ticketing/partner-settlements/${id}/reconcile/`,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Settlement payments
  getPartnerSettlementPayments: async (
    slug?: string,
    params?: QueryParams
  ): Promise<PartnerSettlementPayment[]> => {
    const response = await api.get<PartnerSettlementPayment[]>(
      "/ticketing/partner-settlement-payments/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  changePartnerSettlementPaymentStatus: async (
    id: number,
    paymentStatus: PartnerSettlementPayment["status"],
    notes = "",
    slug?: string
  ): Promise<{
    payment: PartnerSettlementPayment;
    settlement: PartnerSettlementPeriod;
  }> => {
    const response = await api.post<{
      payment: PartnerSettlementPayment;
      settlement: PartnerSettlementPeriod;
    }>(
      `/ticketing/partner-settlement-payments/${id}/change-status/`,
      {
        status: paymentStatus,
        notes,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Ledger
  getLedgerEntries: async (
    slug?: string,
    params?: QueryParams
  ): Promise<TicketingLedgerEntry[]> => {
    const response = await api.get<TicketingLedgerEntry[]>(
      "/ticketing/ledger/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  getLedgerSummary: async (
    slug?: string,
    params?: QueryParams
  ): Promise<LedgerSummary> => {
    const response = await api.get<LedgerSummary>(
      "/ticketing/ledger/summary/",
      {
        params: withSlug(params, slug),
      }
    );
    return response.data;
  },

  createManualLedgerAdjustment: async (
    payload: ManualLedgerAdjustmentPayload,
    slug?: string
  ): Promise<TicketingLedgerEntry[]> => {
    const response = await api.post<TicketingLedgerEntry[]>(
      "/ticketing/ledger/manual-adjustment/",
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  reverseLedgerGroup: async (
    entryGroup: string,
    reason = "Ledger group reversed.",
    slug?: string
  ): Promise<TicketingLedgerEntry[]> => {
    const response = await api.post<TicketingLedgerEntry[]>(
      "/ticketing/ledger/reverse-group/",
      {
        entry_group: entryGroup,
        reason,
      },
      {
        params: withSlug(undefined, slug),
      }
    );
    return response.data;
  },

  // Public website API
  getPublicBranding: async (slug: string): Promise<PublicBrandingResponse> => {
    const response = await api.get<PublicBrandingResponse>(`/ticketing/public/${slug}/branding/`);
    return response.data;
  },

  getPublicProducts: async (slug: string, params?: QueryParams): Promise<ExperienceProduct[]> => {
    const response = await api.get<ExperienceProduct[]>("/ticketing/public/products/", {
      params: withSlug(params, slug),
    });
    return response.data;
  },

getPublicProductResolve: async (
  slug: string,
  path: string,
  language?: SupportedProductLanguage,
  offerToken?: string
): Promise<PublicProductResolveResponse> => {
  const response = await api.get<PublicProductResolveResponse>(
    `/ticketing/public/${slug}/product-resolve/`,
    {
      params: cleanParams({
        path,
        language,
        offer_token: offerToken,
      }),
    }
  );

  return response.data;
},

  getPublicProductByPath: async (
    slug: string,
    path: string,
    language?: SupportedProductLanguage
  ): Promise<ExperienceProduct> => {
    const response = await ticketingApi.getPublicProductResolve(
      slug,
      path,
      language
    );

    return response.product;
  },

  getPublicProductAvailability: async (
    slug: string,
    productSlug: string,
    params?: QueryParams
  ): Promise<LiveProductAvailabilityResponse> => {
    const response = await api.get<LiveProductAvailabilityResponse>(
      `/ticketing/public/${slug}/products/${productSlug}/availability/`,
      {
        params: cleanParams(params),
      }
    );
    return response.data;
  },

  getPublicCategories: async (slug: string): Promise<ExperienceCategory[]> => {
    const response = await api.get<ExperienceCategory[]>("/ticketing/public/categories/", {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createPublicBooking: async (slug: string, payload: BookingCreatePayload): Promise<Booking> => {
    const response = await api.post<Booking>("/ticketing/public/bookings/", payload, {
      params: withSlug(undefined, slug),
    });
    return response.data;
  },

  createPublicSellerBooking: async (
    slug: string,
    sellerSlug: string,
    payload: BookingCreatePayload
  ): Promise<Booking> => {
    const response = await api.post<Booking>(
      `/ticketing/public/${slug}/s/${sellerSlug}/bookings/`,
      payload
    );
    return response.data;
  },


  getPublicPaymentOptions: async (slug: string): Promise<PublicPaymentOptions> => {
    const response = await api.get<PublicPaymentOptions>(
      `/ticketing/public/${slug}/payments/options/`
    );
    return response.data;
  },

  getPublicBookingConfirmation: async (
    slug: string,
    bookingCode: string
  ): Promise<Booking> => {
    const response = await api.get<Booking[] | Booking>(
      `/ticketing/public/${slug}/confirmation/${bookingCode}/`
    );

    if (Array.isArray(response.data)) {
      if (!response.data[0]) {
        throw new Error("Booking not found.");
      }
      return response.data[0];
    }

    return response.data;
  },

  createPublicStripeCheckoutSession: async (
    slug: string,
    payload: StripeCheckoutSessionPayload
  ): Promise<StripeCheckoutSessionResponse> => {
    const response = await api.post<StripeCheckoutSessionResponse>(
      `/ticketing/public/${slug}/payments/stripe/create-checkout-session/`,
      payload
    );
    return response.data;
  },

  confirmPublicStripeSession: async (
    slug: string,
    payload: { session_id: string }
  ): Promise<{
    provider: "stripe";
    confirmed: boolean;
    payment_status?: string;
    payment_id?: number;
    booking_id?: number;
    booking_code?: string;
    booking: Booking;
    detail?: string;
  }> => {
    const response = await api.post(
      `/ticketing/public/${slug}/payments/stripe/confirm-session/`,
      payload
    );
    return response.data;
  },

  createPublicPayPalOrder: async (
    slug: string,
    payload: PayPalCreateOrderPayload
  ): Promise<PayPalCreateOrderResponse> => {
    const response = await api.post<PayPalCreateOrderResponse>(
      `/ticketing/public/${slug}/payments/paypal/create-order/`,
      payload
    );
    return response.data;
  },

  capturePublicPayPalOrder: async (
    slug: string,
    payload: PayPalCaptureOrderPayload
  ): Promise<PayPalCaptureOrderResponse> => {
    const response = await api.post<PayPalCaptureOrderResponse>(
      `/ticketing/public/${slug}/payments/paypal/capture-order/`,
      payload
    );
    return response.data;
  },

  getPublicSEO: async (slug: string) => {
    const response = await api.get(`/ticketing/public/${slug}/seo/`);
    return response.data;
  },

  getSellerPricingQuote: async (
    productId: number,
    params: SellerPricingQuoteParams = {},
    slug?: string
  ): Promise<SellerPricingQuoteResponse> => {
    const response = await api.get<SellerPricingQuoteResponse>(
      `/ticketing/seller/products/${productId}/pricing-quote/`,
      {
        params: withSlug(params, slug),
      }
    );

    return response.data;
  },

  generateSellerOfferLink: async (
    productId: number,
    payloadOrDiscount: SellerSignedOfferLinkPayload | number,
    slug?: string
  ): Promise<SellerSignedOfferLinkResponse> => {
    /*
     * A numeric second argument keeps older calls working:
     * generateSellerOfferLink(productId, 10, slug)
     *
     * New code should pass the complete exact-option payload so the backend
     * signs the quantity, date, option and customer price.
     */
    const payload: SellerSignedOfferLinkPayload =
      typeof payloadOrDiscount === "number"
        ? { discount_percent: payloadOrDiscount }
        : payloadOrDiscount;

    const response = await api.post<SellerSignedOfferLinkResponse>(
      `/ticketing/seller/products/${productId}/signed-offer-link/`,
      payload,
      {
        params: withSlug(undefined, slug),
      }
    );

    return response.data;
  },


  // ==========================================================================
  // Blog CMS
  // ==========================================================================

  getBlogCategories: async (
    slug?: string,
    params?: QueryParams
  ): Promise<BlogCategory[]> => {
    const response = await api.get<BlogCategory[] | { results?: BlogCategory[] }>(
      "/ticketing/blog-categories/",
      { params: withSlug(params, slug) }
    );
    return unwrapList(response.data);
  },

  getBlogCategory: async (
    id: number,
    slug?: string
  ): Promise<BlogCategory> => {
    const response = await api.get<BlogCategory>(
      `/ticketing/blog-categories/${id}/`,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  createBlogCategory: async (
    payload: Partial<BlogCategory> | FormData,
    slug?: string
  ): Promise<BlogCategory> => {
    const response = await api.post<BlogCategory>(
      "/ticketing/blog-categories/",
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  updateBlogCategory: async (
    id: number,
    payload: Partial<BlogCategory> | FormData,
    slug?: string
  ): Promise<BlogCategory> => {
    const response = await api.patch<BlogCategory>(
      `/ticketing/blog-categories/${id}/`,
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  deleteBlogCategory: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/blog-categories/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getBlogPosts: async (
    slug?: string,
    params?: QueryParams
  ): Promise<BlogPost[]> => {
    const response = await api.get<BlogPost[] | { results?: BlogPost[] }>(
      "/ticketing/blog-posts/",
      { params: withSlug(params, slug) }
    );
    return unwrapList(response.data);
  },

  getBlogPost: async (
    id: number,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.get<BlogPost>(
      `/ticketing/blog-posts/${id}/`,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  createBlogPost: async (
    payload: BlogPostWritePayload | FormData,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.post<BlogPost>(
      "/ticketing/blog-posts/",
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  updateBlogPost: async (
    id: number,
    payload: Partial<BlogPostWritePayload> | FormData,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.patch<BlogPost>(
      `/ticketing/blog-posts/${id}/`,
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  deleteBlogPost: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/blog-posts/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  publishBlogPost: async (
    id: number,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.post<BlogPost>(
      `/ticketing/blog-posts/${id}/publish/`,
      {},
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  unpublishBlogPost: async (
    id: number,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.post<BlogPost>(
      `/ticketing/blog-posts/${id}/unpublish/`,
      {},
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  archiveBlogPost: async (
    id: number,
    slug?: string
  ): Promise<BlogPost> => {
    const response = await api.post<BlogPost>(
      `/ticketing/blog-posts/${id}/archive/`,
      {},
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  getBlogGalleryImages: async (
    slug?: string,
    params?: QueryParams
  ): Promise<BlogPostGalleryImage[]> => {
    const response = await api.get<
      BlogPostGalleryImage[] | { results?: BlogPostGalleryImage[] }
    >("/ticketing/blog-gallery-images/", {
      params: withSlug(params, slug),
    });
    return unwrapList(response.data);
  },

  createBlogGalleryImage: async (
    payload: FormData,
    slug?: string
  ): Promise<BlogPostGalleryImage> => {
    const response = await api.post<BlogPostGalleryImage>(
      "/ticketing/blog-gallery-images/",
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  updateBlogGalleryImage: async (
    id: number,
    payload: Partial<BlogPostGalleryImage> | FormData,
    slug?: string
  ): Promise<BlogPostGalleryImage> => {
    const response = await api.patch<BlogPostGalleryImage>(
      `/ticketing/blog-gallery-images/${id}/`,
      payload,
      { params: withSlug(undefined, slug) }
    );
    return response.data;
  },

  deleteBlogGalleryImage: async (
    id: number,
    slug?: string
  ): Promise<void> => {
    await api.delete(`/ticketing/blog-gallery-images/${id}/`, {
      params: withSlug(undefined, slug),
    });
  },

  getPublicBlogCategories: async (
    slug: string,
    params?: QueryParams
  ): Promise<BlogCategory[]> => {
    const response = await api.get<BlogCategory[] | { results?: BlogCategory[] }>(
      `/ticketing/public/${slug}/blog-categories/`,
      { params: cleanParams(params) }
    );
    return unwrapList(response.data);
  },

  getPublicBlogPosts: async (
    slug: string,
    params?: QueryParams
  ): Promise<PublicBlogPostSummary[]> => {
    const response = await api.get<
      PublicBlogPostSummary[] | { results?: PublicBlogPostSummary[] }
    >(`/ticketing/public/${slug}/blog/`, {
      params: cleanParams(params),
    });
    return unwrapList(response.data);
  },

  getPublicBlogPost: async (
    slug: string,
    blogSlug: string,
    params?: QueryParams
  ): Promise<PublicBlogPostDetail> => {
    const response = await api.get<PublicBlogPostDetail>(
      `/ticketing/public/${slug}/blog/${blogSlug}/`,
      { params: cleanParams(params) }
    );
    return response.data;
  },


  // Seller onboarding — owner/admin
  getSellerSignupInvites: async (
    slug: string,
    params?: QueryParams,
  ): Promise<SellerSignupInvite[]> => {
    const response = await api.get<SellerSignupInvite[] | { results?: SellerSignupInvite[] }>(
      "/ticketing/seller-signup-invites/",
      { params: withSlug(params, slug) },
    );

    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  createSellerSignupInvite: async (
    slug: string,
    payload: SellerSignupInvitePayload,
  ): Promise<SellerSignupInvite> => {
    const response = await api.post<SellerSignupInvite>(
      "/ticketing/seller-signup-invites/",
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  updateSellerSignupInvite: async (
    slug: string,
    inviteId: number,
    payload: Partial<SellerSignupInvitePayload>,
  ): Promise<SellerSignupInvite> => {
    const response = await api.patch<SellerSignupInvite>(
      `/ticketing/seller-signup-invites/${inviteId}/`,
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  deleteSellerSignupInvite: async (
    slug: string,
    inviteId: number,
  ): Promise<void> => {
    await api.delete(`/ticketing/seller-signup-invites/${inviteId}/`, {
      params: withSlug(undefined, slug),
    });
  },

  rotateSellerSignupInviteToken: async (
    slug: string,
    inviteId: number,
  ): Promise<SellerSignupInvite> => {
    const response = await api.post<SellerSignupInvite>(
      `/ticketing/seller-signup-invites/${inviteId}/rotate-token/`,
      {},
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  getSellerApplications: async (
    slug: string,
    params?: QueryParams,
  ): Promise<SellerApplication[]> => {
    const response = await api.get<SellerApplication[] | { results?: SellerApplication[] }>(
      "/ticketing/seller-applications/",
      { params: withSlug(params, slug) },
    );
    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  getSellerApplication: async (
    slug: string,
    applicationId: number,
  ): Promise<SellerApplication> => {
    const response = await api.get<SellerApplication>(
      `/ticketing/seller-applications/${applicationId}/`,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  approveSellerApplication: async (
    slug: string,
    applicationId: number,
    payload: SellerApplicationDecisionPayload,
  ): Promise<SellerApplication> => {
    const response = await api.post<SellerApplication>(
      `/ticketing/seller-applications/${applicationId}/approve/`,
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  rejectSellerApplication: async (
    slug: string,
    applicationId: number,
    rejectionReason: string,
    reviewNotes = "",
  ): Promise<SellerApplication> => {
    const response = await api.post<SellerApplication>(
      `/ticketing/seller-applications/${applicationId}/reject/`,
      {
        rejection_reason: rejectionReason,
        review_notes: reviewNotes,
      },
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  requestSellerApplicationInformation: async (
    slug: string,
    applicationId: number,
    reviewNotes: string,
  ): Promise<SellerApplication> => {
    const response = await api.post<SellerApplication>(
      `/ticketing/seller-applications/${applicationId}/request-information/`,
      { review_notes: reviewNotes },
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  // Public seller application
  getPublicSellerSignupInvite: async (
    token: string,
  ): Promise<PublicSellerSignupInvite> => {
    const response = await api.get<PublicSellerSignupInvite>(
      `/ticketing/public/seller-apply/${token}/`,
    );
    return response.data;
  },

  submitPublicSellerApplication: async (
    token: string,
    payload: PublicSellerApplicationPayload,
  ): Promise<{
    id: number;
    status: string;
    organisation: string;
    organisation_slug?: string;
    message: string;
  }> => {
    const response = await api.post(
      `/ticketing/public/seller-apply/${token}/`,
      buildSellerApplicationFormData(payload),
    );
    return response.data;
  },

  getMySellerApplication: async (
    slug: string,
  ): Promise<SellerApplication> => {
    const response = await api.get<SellerApplication>(
      "/ticketing/seller/application/",
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  updateMySellerApplication: async (
    slug: string,
    payload: Partial<PublicSellerApplicationPayload>,
  ): Promise<SellerApplication> => {
    const response = await api.patch<SellerApplication>(
      "/ticketing/seller/application/",
      buildSellerApplicationFormData(payload),
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  resubmitMySellerApplication: async (
    slug: string,
  ): Promise<SellerApplication> => {
    const response = await api.post<SellerApplication>(
      "/ticketing/seller/application/",
      {},
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  // Seller payout accounts and requests
  getSellerPayoutAccounts: async (
    slug: string,
  ): Promise<SellerPayoutAccount[]> => {
    const response = await api.get<SellerPayoutAccount[] | { results?: SellerPayoutAccount[] }>(
      "/ticketing/seller/payout-accounts/",
      { params: withSlug(undefined, slug) },
    );
    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  createSellerPayoutAccount: async (
    slug: string,
    payload: SellerPayoutAccountPayload,
  ): Promise<SellerPayoutAccount> => {
    const response = await api.post<SellerPayoutAccount>(
      "/ticketing/seller/payout-accounts/",
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  updateSellerPayoutAccount: async (
    slug: string,
    accountId: number,
    payload: Partial<SellerPayoutAccountPayload>,
  ): Promise<SellerPayoutAccount> => {
    const response = await api.patch<SellerPayoutAccount>(
      `/ticketing/seller/payout-accounts/${accountId}/`,
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  deleteSellerPayoutAccount: async (
    slug: string,
    accountId: number,
  ): Promise<void> => {
    await api.delete(`/ticketing/seller/payout-accounts/${accountId}/`, {
      params: withSlug(undefined, slug),
    });
  },

  makeSellerPayoutAccountDefault: async (
    slug: string,
    accountId: number,
  ): Promise<SellerPayoutAccount> => {
    const response = await api.post<SellerPayoutAccount>(
      `/ticketing/seller/payout-accounts/${accountId}/make-default/`,
      {},
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  getSellerPayoutBalance: async (
    slug: string,
  ): Promise<SellerPayoutBalance> => {
    const response = await api.get<SellerPayoutBalance>(
      "/ticketing/seller/payout-requests/balance/",
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  getMySellerPayoutRequests: async (
    slug: string,
  ): Promise<SellerPayoutRequest[]> => {
    const response = await api.get<SellerPayoutRequest[] | { results?: SellerPayoutRequest[] }>(
      "/ticketing/seller/payout-requests/",
      { params: withSlug(undefined, slug) },
    );
    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  createSellerPayoutRequest: async (
    slug: string,
    payload: SellerPayoutCreatePayload,
  ): Promise<SellerPayoutRequest> => {
    const response = await api.post<SellerPayoutRequest>(
      "/ticketing/seller/payout-requests/",
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  cancelSellerPayoutRequest: async (
    slug: string,
    payoutId: number,
  ): Promise<SellerPayoutRequest> => {
    const response = await api.post<SellerPayoutRequest>(
      `/ticketing/seller/payout-requests/${payoutId}/cancel/`,
      {},
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  // Owner payout processing
  getOwnerSellerPayoutRequests: async (
    slug: string,
    params?: QueryParams,
  ): Promise<SellerPayoutRequest[]> => {
    const response = await api.get<SellerPayoutRequest[] | { results?: SellerPayoutRequest[] }>(
      "/ticketing/seller-payout-requests/",
      { params: withSlug(params, slug) },
    );
    return Array.isArray(response.data)
      ? response.data
      : response.data.results || [];
  },

  approveSellerPayoutRequest: async (
    slug: string,
    payoutId: number,
    payload: SellerPayoutDecisionPayload = {},
  ): Promise<SellerPayoutRequest> => {
    const response = await api.post<SellerPayoutRequest>(
      `/ticketing/seller-payout-requests/${payoutId}/approve/`,
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  rejectSellerPayoutRequest: async (
    slug: string,
    payoutId: number,
    payload: SellerPayoutDecisionPayload,
  ): Promise<SellerPayoutRequest> => {
    const response = await api.post<SellerPayoutRequest>(
      `/ticketing/seller-payout-requests/${payoutId}/reject/`,
      payload,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  markSellerPayoutProcessing: async (
    slug: string,
    payoutId: number,
  ): Promise<SellerPayoutRequest> => {
    const response = await api.post<SellerPayoutRequest>(
      `/ticketing/seller-payout-requests/${payoutId}/mark-processing/`,
      {},
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

  markSellerPayoutPaid: async (
    slug: string,
    payoutId: number,
    payload: SellerPayoutDecisionPayload,
  ): Promise<SellerPayoutRequest> => {
    const formData = new FormData();
    appendFormValue(formData, "payment_reference", payload.payment_reference || "");
    appendFormValue(formData, "owner_note", payload.owner_note || "");
    appendFormValue(formData, "payment_receipt", payload.payment_receipt || null);

    const response = await api.post<SellerPayoutRequest>(
      `/ticketing/seller-payout-requests/${payoutId}/mark-paid/`,
      formData,
      { params: withSlug(undefined, slug) },
    );
    return response.data;
  },

};



export default ticketingApi;
