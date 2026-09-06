import api from "../../../api/axios";

export type MoneyValue = string | number;

export type PartnerNetworkSettings = {
  id: number;
  organisation: number;
  enabled: boolean;
  default_commission_trigger: "deposit_paid" | "fully_paid" | "service_completed";
  default_payout_frequency: "monthly" | "biweekly" | "weekly" | "manual";
  google_review_url: string;
  feedback_delay_hours: number;
  feedback_channel: "disabled" | "whatsapp" | "email" | "both";
  feedback_whatsapp_template_name: string;
  feedback_whatsapp_template_language: string;
  referral_session_hours: number;
  created_at: string;
  updated_at: string;
};

export type NetworkMetrics = {
  partners: number;
  active_partners: number;
  qr_scans: number;
  referral_sessions: number;
  bookings: number;
  gross_sales: MoneyValue;
  commissions_generated: MoneyValue;
  paid_out: MoneyValue;
  conversion_rate: MoneyValue;
  top_partners: Array<Record<string, unknown>>;
  top_properties: Array<Record<string, unknown>>;
  top_products: Array<Record<string, unknown>>;
};

export type ReferralPartner = {
  id: number;
  organisation: number;
  name: string;
  slug: string;
  partner_type: string;
  product_access_mode: "inherit" | "custom";
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_whatsapp: string;
  status: "pending" | "active" | "suspended" | "disabled";
  payout_frequency: string;
  preferred_payout_method: string;
  internal_notes: string;
  locations_count: number;
  created_at: string;
  updated_at: string;
};

export type Readiness = {
  status: "incomplete" | "ready" | "active" | "problem";
  problems: string[];
  product_count: number;
  pickup_location_id: number | null;
  has_active_qr: boolean;
};

export type ReferralPartnerLocation = {
  id: number;
  partner: number;
  partner_name: string;
  display_name: string;
  property_type: string;
  product_access_mode: "inherit" | "custom";
  address: string;
  google_maps_link: string;
  linked_pickup_location: number | null;
  pickup_location_name: string | null;
  welcome_message: string;
  property_information: string;
  concierge_introduction: string;
  is_active: boolean;
  readiness: Readiness;
  created_at: string;
  updated_at: string;
};

export type ReferralQRCode = {
  id: number;
  partner_location: number;
  partner_name: string;
  property_name: string;
  status: "active" | "revoked";
  scan_count: number;
  public_url: string;
  created_at: string;
  revoked_at: string | null;
};

export type ReferralCommissionRule = {
  id: number;
  organisation: number;
  partner: number | null;
  partner_name: string | null;
  partner_location: number | null;
  property_name: string | null;
  product: number | null;
  product_name: string | null;
  commission_type: string;
  commission_value: MoneyValue;
  trigger: string;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ReferralProductAccess = {
  id: number;
  organisation: number;
  partner: number | null;
  partner_location: number | null;
  product: number;
  product_name: string;
  is_active: boolean;
  is_recommended: boolean;
};

export type ReferralPartnerAccess = {
  id: number;
  organisation: number;
  partner: number;
  partner_name: string;
  user: number;
  resolved_user_email: string;
  can_access_dashboard: boolean;
  can_view_earnings: boolean;
  can_edit_concierge: boolean;
  can_download_qr: boolean;
  is_active: boolean;
};

export type ReferralCommission = {
  id: number;
  partner: number;
  partner_name: string;
  partner_location: number;
  property_name: string;
  booking: number;
  booking_code: string;
  booking_item: number | null;
  trigger: string;
  currency: string;
  amount: MoneyValue;
  status: string;
  earned_at: string | null;
  paid_at: string | null;
  reversed_at: string | null;
  reversal_reason: string;
  created_at: string;
};

export type ReferralPayout = {
  id: number;
  partner: number;
  partner_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  total_amount: MoneyValue;
  status: string;
  payment_reference: string;
  internal_note: string;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  lines: Array<{
    id: number;
    commission: number;
    booking_code: string;
    amount: MoneyValue;
    created_at: string;
  }>;
  adjustment_lines: Array<{
    id: number;
    adjustment: number;
    booking_code: string;
    reason: string;
    amount: MoneyValue;
    created_at: string;
  }>;
};

export type PartnerMetrics = {
  qr_scans: number;
  referral_sessions: number;
  bookings: number;
  gross_sales: MoneyValue;
  pending_earnings: MoneyValue;
  earned_earnings: MoneyValue;
  paid_earnings: MoneyValue;
  this_month_paid: MoneyValue;
  lifetime_earnings: MoneyValue;
  outstanding_adjustments: MoneyValue;
  conversion_rate: MoneyValue;
};

export type PartnerPortalBootstrap = {
  portal_type: "referral_partner";
  organisation: { id: number; name: string; slug: string };
  partner: { id: number; name: string; type: string };
  permissions: {
    can_access_dashboard: boolean;
    can_view_earnings: boolean;
    can_edit_concierge: boolean;
    can_download_qr: boolean;
  };
  locations: ReferralPartnerLocation[];
};

export type NetworkOptions = {
  products: Array<{
    id: number;
    name: string;
    product_type: string;
    requires_pickup_location: boolean;
  }>;
  pickup_locations: Array<{
    id: number;
    name: string;
    location_type: string;
    address: string;
    default_pickup_point: string;
  }>;
};

function params(organisationSlug: string) {
  return { organisation_slug: organisationSlug };
}

export const partnerNetworkApi = {
  async getSettings(organisationSlug: string) {
    const response = await api.get<PartnerNetworkSettings[]>("/partner-network/settings/", {
      params: params(organisationSlug),
    });
    return response.data[0] ?? null;
  },

  async createSettings(organisationSlug: string, payload: Partial<PartnerNetworkSettings>) {
    const response = await api.post<PartnerNetworkSettings>("/partner-network/settings/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async updateSettings(organisationSlug: string, id: number, payload: Partial<PartnerNetworkSettings>) {
    const response = await api.patch<PartnerNetworkSettings>(`/partner-network/settings/${id}/`, payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async getOverview(organisationSlug: string) {
    const response = await api.get<{ settings: PartnerNetworkSettings; metrics: NetworkMetrics }>(
      "/partner-network/overview/",
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async getOptions(organisationSlug: string) {
    const response = await api.get<NetworkOptions>("/partner-network/options/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async listPartners(organisationSlug: string) {
    const response = await api.get<ReferralPartner[]>("/partner-network/partners/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async createPartner(organisationSlug: string, payload: Partial<ReferralPartner>) {
    const response = await api.post<ReferralPartner>("/partner-network/partners/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async updatePartner(organisationSlug: string, partnerId: number, payload: Partial<ReferralPartner>) {
    const response = await api.patch<ReferralPartner>(`/partner-network/partners/${partnerId}/`, payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async listLocations(organisationSlug: string, partnerId?: number) {
    const response = await api.get<ReferralPartnerLocation[]>("/partner-network/locations/", {
      params: { ...params(organisationSlug), partner_id: partnerId },
    });
    return response.data;
  },

  async createLocation(organisationSlug: string, payload: Partial<ReferralPartnerLocation>) {
    const response = await api.post<ReferralPartnerLocation>("/partner-network/locations/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async updateLocation(organisationSlug: string, locationId: number, payload: Partial<ReferralPartnerLocation>) {
    const response = await api.patch<ReferralPartnerLocation>(`/partner-network/locations/${locationId}/`, payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async getLocationReadiness(organisationSlug: string, locationId: number) {
    const response = await api.get<{ status: string; problems: string[]; warnings?: string[] }>(
      `/partner-network/locations/${locationId}/readiness/`,
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async generateQR(organisationSlug: string, locationId: number) {
    const response = await api.post<ReferralQRCode>(
      `/partner-network/locations/${locationId}/generate_qr/`,
      {},
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async listQRs(organisationSlug: string) {
    const response = await api.get<ReferralQRCode[]>("/partner-network/qrs/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async revokeQR(organisationSlug: string, qrId: number) {
    const response = await api.post<ReferralQRCode>(
      `/partner-network/qrs/${qrId}/revoke/`,
      {},
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async listProductAccess(organisationSlug: string, partnerId?: number, locationId?: number) {
    const response = await api.get<ReferralProductAccess[]>("/partner-network/product-access/", {
      params: {
        ...params(organisationSlug),
        partner_id: partnerId,
        partner_location_id: locationId,
      },
    });
    return response.data;
  },

  async createProductAccess(organisationSlug: string, payload: Partial<ReferralProductAccess>) {
    const response = await api.post<ReferralProductAccess>("/partner-network/product-access/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async deleteProductAccess(organisationSlug: string, id: number) {
    await api.delete(`/partner-network/product-access/${id}/`, {
      params: params(organisationSlug),
    });
  },

  async listCommissionRules(organisationSlug: string) {
    const response = await api.get<ReferralCommissionRule[]>("/partner-network/commission-rules/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async createCommissionRule(organisationSlug: string, payload: Partial<ReferralCommissionRule>) {
    const response = await api.post<ReferralCommissionRule>("/partner-network/commission-rules/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async listAccess(organisationSlug: string, partnerId?: number) {
    const response = await api.get<ReferralPartnerAccess[]>("/partner-network/access/", {
      params: { ...params(organisationSlug), partner_id: partnerId },
    });
    return response.data;
  },

  async createAccessByEmail(organisationSlug: string, partnerId: number, userEmail: string) {
    const response = await api.post<ReferralPartnerAccess>(
      "/partner-network/access/",
      { partner: partnerId, user_email: userEmail },
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async listPayouts(organisationSlug: string, partnerId?: number) {
    const response = await api.get<ReferralPayout[]>("/partner-network/payouts/", {
      params: { ...params(organisationSlug), partner_id: partnerId },
    });
    return response.data;
  },

  async createPayout(organisationSlug: string, payload: { partner: number; period_start: string; period_end: string; currency: string }) {
    const response = await api.post<ReferralPayout>("/partner-network/payouts/", payload, {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async markPayoutPaid(organisationSlug: string, payoutId: number, paymentReference: string) {
    const response = await api.post<ReferralPayout>(
      `/partner-network/payouts/${payoutId}/mark_paid/`,
      { payment_reference: paymentReference },
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async cancelPayout(organisationSlug: string, payoutId: number) {
    const response = await api.post<ReferralPayout>(
      `/partner-network/payouts/${payoutId}/cancel/`,
      {},
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async getPartnerBootstrap(organisationSlug: string) {
    const response = await api.get<PartnerPortalBootstrap>("/partner-network/portal/bootstrap/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async getPartnerDashboard(organisationSlug: string) {
    const response = await api.get<PartnerMetrics>("/partner-network/portal/dashboard/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  async getPartnerQRs(organisationSlug: string) {
    const response = await api.get<ReferralQRCode[]>("/partner-network/portal/qr/", {
      params: params(organisationSlug),
    });
    return response.data;
  },

  partnerQRDownloadUrl(organisationSlug: string, qrId: number) {
    const base = String(import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
    return `${base}/partner-network/portal/qr/${qrId}/png/?organisation_slug=${encodeURIComponent(organisationSlug)}`;
  },

  async updatePartnerLocationSettings(
    organisationSlug: string,
    locationId: number,
    payload: Partial<Pick<ReferralPartnerLocation, "display_name" | "welcome_message" | "property_information" | "concierge_introduction">>,
  ) {
    const response = await api.patch<ReferralPartnerLocation>(
      "/partner-network/portal/settings/",
      { location_id: locationId, ...payload },
      { params: params(organisationSlug) },
    );
    return response.data;
  },

  async getPartnerEarnings(organisationSlug: string) {
    const response = await api.get<{
      summary: PartnerMetrics;
      commissions: ReferralCommission[];
      payouts: ReferralPayout[];
    }>("/partner-network/portal/earnings/", {
      params: params(organisationSlug),
    });
    return response.data;
  },
};
