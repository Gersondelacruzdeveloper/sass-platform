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
} from "../types/ticketingTypes";

type QueryParams = Record<string, string | number | boolean | null | undefined>;

export type LiveTicketOption = {
  provider: "wellet" | "local" | string;
  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  name?: string;
  option_name?: string;
  price?: number | string;
  currency?: string;
  available?: boolean;
  available_quantity?: number | null;
  sold_out?: boolean;
  service_date?: string;
  start_time?: string;
  end_time?: string;
  raw?: unknown;
};

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
  raw?: unknown;
  error?: string;
};

export interface PublicProductResolveResponse {
  product: ExperienceProduct;
  canonical_url: string;
  current_public_path: string;
  resolved_by: string;
  should_redirect: boolean;
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
    path: string
  ): Promise<PublicProductResolveResponse> => {
    const response = await api.get<PublicProductResolveResponse>(
      `/ticketing/public/${slug}/product-resolve/`,
      {
        params: cleanParams({ path }),
      }
    );

    return response.data;
  },

  getPublicProductByPath: async (
    slug: string,
    path: string
  ): Promise<ExperienceProduct> => {
    const response = await ticketingApi.getPublicProductResolve(slug, path);

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
};



export default ticketingApi;
