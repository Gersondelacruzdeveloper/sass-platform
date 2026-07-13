export type ID = number;
export type Money = string | number;

export type ProductType =
  | "excursion"
  | "transfer"
  | "ticket"
  | "event"
  | "nightlife"
  | "custom";

export type ProductStatus =
  | "draft"
  | "active"
  | "inactive"
  | "sold_out"
  | "archived";

export type BookingStatus =
  | "draft"
  | "pending_payment"
  | "pending_approval"
  | "confirmed"
  | "ticket_generated"
  | "completed"
  | "cancelled"
  | "refunded"
  | "no_show";

export type PaymentStatus =
  | "unpaid"
  | "pending"
  | "deposit_paid"
  | "partially_paid"
  | "paid"
  | "refunded";

export type PaymentMode =
  | "customer_full_online"
  | "customer_deposit_online"
  | "customer_cash_to_seller"
  | "seller_full_payment"
  | "seller_deposit_payment"
  | "seller_commission_only"
  | "pending_payment"
  | "requires_supervisor_approval"
  | "manual_bank_transfer"
  | "mixed_payment";

export type PaymentMethod =
  | "cash"
  | "card"
  | "online"
  | "stripe"
  | "paypal"
  | "bank_transfer"
  | "seller_collected"
  | "mixed"
  | "none";

export type BookingSource =
  | "public_site"
  | "seller_dashboard"
  | "seller_public_link"
  | "owner_dashboard"
  | "external_provider";

export type SellerRole =
  | "owner"
  | "manager"
  | "supervisor"
  | "seller"
  | "external_vendor"
  | "driver"
  | "viewer";

export interface TicketingSettings {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  module_name: string;
  public_brand_name: string;
  currency_symbol: string;
  default_currency: string;
  supported_currencies: string[];
  tax_percentage: Money;
  default_deposit_percentage: Money;
  allow_public_bookings: boolean;
  allow_seller_bookings: boolean;
  allow_full_payment: boolean;
  allow_deposit_payment: boolean;
  allow_pending_payment: boolean;
  allow_cash_to_seller: boolean;
  allow_manual_bank_transfer: boolean;
  allow_mixed_payments: boolean;
  send_customer_email: boolean;
  send_customer_whatsapp: boolean;
  notify_owner_on_booking: boolean;
  require_supervisor_approval_for_unpaid_tickets: boolean;
  wellet_enabled: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TicketingPublicSiteSettings {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  site_title: string;
  display_title?: string;
  public_description: string;
  public_email?: string | null;
  public_whatsapp?: string | null;
  subdomain?: string | null;
  custom_domain?: string | null;
  logo?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  favicon_url?: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_media_type: "image" | "video";
  hero_image?: string | null;
  hero_image_url?: string | null;
  hero_video?: string | null;
  hero_video_file_url?: string | null;
  hero_video_url: string;
  hero_video_poster?: string | null;
  hero_video_poster_url?: string | null;
  hero_overlay_opacity: Money;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  button_color: string;
  text_color: string;
  muted_text_color: string;
  card_background_color: string;
  homepage_layout_style: "marketplace" | "luxury" | "minimal" | "adventure";
  trust_badges: string[];
  show_category_grid: boolean;
  show_trust_badges: boolean;
  show_excursions_section: boolean;
  show_transfers_section: boolean;
  show_tickets_section: boolean;
  show_events_section: boolean;
  show_nightlife_section: boolean;
  show_packages_section: boolean;
  show_ai_assistant_section: boolean;
  show_final_cta_section: boolean;
  excursions_section_title: string;
  excursions_section_subtitle: string;
  transfers_section_title: string;
  transfers_section_subtitle: string;
  tickets_section_title: string;
  tickets_section_subtitle: string;
  events_section_title: string;
  events_section_subtitle: string;
  nightlife_section_title: string;
  nightlife_section_subtitle: string;
  packages_section_title: string;
  packages_section_subtitle: string;
  ai_assistant_title: string;
  ai_assistant_subtitle: string;
  final_cta_title: string;
  final_cta_subtitle: string;
  primary_cta_label: string;
  secondary_cta_label: string;
  whatsapp_cta_label: string;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  product_url_pattern: string;
  custom_product_url_pattern: string;
  preserve_imported_product_urls: boolean;
  auto_create_product_redirects: boolean;
  og_title: string;
  og_description: string;
  og_image?: string | null;
  og_image_url?: string | null;
  robots_allow_indexing: boolean;
  robots_allow_ai_crawlers: boolean;
  allow_gptbot: boolean;
  allow_oai_searchbot: boolean;
  json_ld_local_business: Record<string, unknown>;
  show_public_rankings: boolean;
  show_seller_public_pages: boolean;
  show_reviews: boolean;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ExperienceCategory {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  name: string;
  slug: string;
  description: string;
  image?: string | null;
  image_url?: string | null;
  is_active: boolean;
  sort_order: number;
  seo_title: string;
  meta_description: string;
  created_at?: string;
  updated_at?: string;
}

export interface ExperiencePackage {
  id: ID;
  product: ID;
  product_name?: string;
  name: string;
  description: string;
  price: Money;
  cost_price: Money;
  deposit_amount: Money;
  capacity: number;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface ProductAvailability {
  id: ID;
  product: ID;
  product_name?: string;
  package?: ID | null;
  package_name?: string | null;
  date: string;
  available_capacity: number;
  booked_quantity: number;
  remaining_capacity?: number;
  price_override?: Money | null;
  deposit_override?: Money | null;
  is_available: boolean;
  note: string;
  created_at?: string;
  updated_at?: string;
}

export interface PickupZone {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  name: string;
  description: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PickupLocation {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  zone?: ID | null;
  zone_name?: string | null;
  name: string;
  slug: string;
  location_type: "hotel" | "airport" | "meeting_point" | "private_address" | "other";
  address: string;
  default_pickup_point: string;
  default_instructions: string;
  google_maps_link: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductPickupSchedule {
  id: ID;
  product: ID;
  product_name?: string;
  pickup_location: ID;
  pickup_location_name?: string;
  day_of_week?: number | null;
  specific_date?: string | null;
  pickup_time: string;
  pickup_point: string;
  resolved_pickup_point?: string;
  instructions: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TransferRoute {
  id: ID;
  product: ID;
  product_name?: string;
  origin: string;
  destination: string;
  airport: string;
  vehicle_type: string;
  is_round_trip: boolean;
  base_passengers: number;
  max_passengers: number;
  price: Money;
  round_trip_price: Money;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface EventTicketType {
  id: ID;
  product: ID;
  product_name?: string;
  name: string;
  description: string;
  price: Money;
  deposit_amount: Money;
  capacity: number;
  sold_quantity: number;
  available_tickets?: number;
  is_active: boolean;
  sort_order: number;
}

export interface ProductGalleryImage {
  id: ID;
  product: ID;
  product_name?: string;
  image: string;
  image_url?: string | null;
  alt_text: string;
  caption: string;
  sort_order: number;
  is_cover: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ProductURLAlias {
  id: ID;
  path: string;
  is_primary: boolean;
  is_active: boolean;
  redirect_to_primary: boolean;
  redirect_type: number;
  source: string;
  original_full_url: string;
  hit_count: number;
  last_hit_at?: string | null;
}

export interface ProductSEOInformation {
  canonical_url: string;
  current_public_path: string;
  primary_url: string;
  imported_from_url: string;
  imported_from_domain: string;
  preserve_legacy_url: boolean;
  url_aliases: ProductURLAlias[];
}

export interface ExperienceProduct {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  category?: ID | null;
  category_detail?: ExperienceCategory | null;
  name: string;
  slug: string;
  current_public_path: string;
  primary_url: string;

  imported_from_url: string;
  imported_from_domain: string;
  preserve_legacy_url: boolean;

  url_aliases: ProductURLAlias[];
  product_type: ProductType;
  sku?: string | null;
  external_provider: "local" | "wellet";
  external_product_id?: string | null;
  is_cocobongo_product: boolean;
  short_description: string;
  long_description: string;
  image?: string | null;
  image_url?: string | null;
  gallery: unknown[];
  gallery_images?: ProductGalleryImage[];
  base_price: Money;
  cost_price: Money;
  profit_per_unit?: Money;
  deposit_amount: Money;
  deposit_percentage: Money;
  capacity: number;
  duration_text: string;
  start_time?: string | null;
  end_time?: string | null;
  location: string;
  address: string;
  google_maps_link: string;
  itinerary: unknown[];
  includes: unknown[];
  excludes: unknown[];
  faqs: unknown[];
  cancellation_policy: string;
  instructions: string;
  pickup_instructions: string;
  supports_pickup: boolean;
  requires_pickup_location: boolean;
  allow_full_payment: boolean;
  allow_deposit_payment: boolean;
  allow_pending_payment: boolean;
  allow_cash_payment: boolean;
  seller_enabled: boolean;
  public_enabled: boolean;
  is_featured: boolean;
  is_recommended: boolean;
  is_top_excursion: boolean;
  is_top_transfer: boolean;
  is_best_seller: boolean;
  event_date?: string | null;
  event_start_datetime?: string | null;
  event_end_datetime?: string | null;
  event_age_restriction: string;
  event_dress_code: string;
  event_organizer_contact: string;
  status: ProductStatus;
  seo_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;
  twitter_title: string;
  twitter_description: string;
  image_alt_text: string;
  keywords_tags: string[];
  json_ld_override: Record<string, unknown>;
  view_count: number;
  booking_count: number;
  average_rating: Money;
  review_count: number;
  is_active: boolean;
  created_by?: ID | null;
  packages?: ExperiencePackage[];
  availability?: ProductAvailability[];
  pickup_schedules?: ProductPickupSchedule[];
  transfer_routes?: TransferRoute[];
  event_ticket_types?: EventTicketType[];
  created_at?: string;
  updated_at?: string;
}

export interface Customer {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  full_name: string;
  whatsapp?: string | null;
  phone?: string | null;
  email?: string | null;
  hotel_name: string;
  notes: string;
  total_bookings: number;
  total_spent: Money;
  created_at?: string;
  updated_at?: string;
}

export interface SellerPermissions {
  can_access_dashboard: boolean;
  can_sell_cocobongo: boolean;
  can_sell_excursions: boolean;
  can_sell_transfers: boolean;
  can_sell_events: boolean;
  can_sell_custom_tours: boolean;
  can_create_bookings: boolean;
  can_take_deposits: boolean;
  can_take_full_payments: boolean;
  can_collect_cash_payment: boolean;
  can_generate_ticket_without_customer_online_payment: boolean;
  can_mark_customer_deposit_paid: boolean;
  can_mark_customer_full_paid: boolean;
  can_pay_full_amount_as_seller: boolean;
  can_pay_deposit_as_seller: boolean;
  can_pay_commission_only: boolean;
  can_create_pending_payment_booking: boolean;
  can_request_supervisor_approval: boolean;
  can_send_receipt_before_full_payment: boolean;
  can_view_own_sales: boolean;
  can_view_own_commissions: boolean;
  can_apply_discounts: boolean;
  can_cancel_bookings: boolean;
  can_send_whatsapp: boolean;
  can_send_email: boolean;
  can_override_pickup_time: boolean;
  can_view_reports: boolean;
  can_manage_products: boolean;
  can_manage_sellers: boolean;
  can_manage_settings: boolean;
  can_manage_integrations: boolean;
}

export interface Seller extends SellerPermissions {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  user?: ID | null;
  username?: string;
  user_email?: string;
  full_name: string;
  seller_slug: string;
  public_path?: string;
  role: SellerRole;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  photo?: string | null;
  photo_url?: string | null;
  commission_rate: Money;
  fixed_commission_amount: Money;
  permissions?: SellerPermissions;
  is_active: boolean;
  total_sales_amount: Money;
  total_commission_amount: Money;
  total_collected_amount: Money;
  total_owed_to_company: Money;
  created_at?: string;
  updated_at?: string;
}

export interface BookingPickupInfo {
  id: ID;
  booking: ID;
  pickup_location?: ID | null;
  pickup_location_name?: string | null;
  pickup_schedule?: ID | null;
  pickup_schedule_label?: string;
  pickup_zone_name: string;
  hotel_or_location_name: string;
  pickup_time?: string | null;
  pickup_point: string;
  instructions: string;
  was_overridden: boolean;
  override_reason: string;
  overridden_by?: ID | null;
  created_at?: string;
  updated_at?: string;
}

export interface BookingItem {
  id: ID;
  booking: ID;
  product?: ID | null;
  product_name_display?: string;
  package?: ID | null;
  package_name?: string | null;
  event_ticket_type?: ID | null;
  event_ticket_type_name?: string | null;
  external_snapshot?: ID | null;
  product_name: string;
  product_type: ProductType | string;
  service_date?: string | null;
  service_time?: string | null;
  quantity: number;
  unit_price: Money;
  unit_cost: Money;
  total: Money;
  profit?: Money;
  instructions: string;
  created_at?: string;
}

export interface BookingPayment {
  id: ID;
  booking: ID;
  seller?: ID | null;
  seller_name?: string;
  collected_by?: ID | null;
  collected_by_email?: string;
  amount: Money;
  payment_type: "full" | "deposit" | "balance" | "commission_only" | "partial" | "refund";
  payer_type: "customer" | "seller" | "company";
  method: "cash" | "card" | "online" | "stripe" | "paypal" | "bank_transfer" | "seller_balance" | "other";
  status: "pending" | "confirmed" | "failed" | "refunded" | "cancelled";
  provider?: string;
  provider_payment_id?: string;
  provider_checkout_id?: string;
  provider_order_id?: string;
  provider_capture_id?: string;
  provider_status?: string;
  provider_response?: Record<string, unknown>;
  reference: string;
  note: string;
  paid_at?: string;
  created_at?: string;
}

export interface SellerCommission {
  id: ID;
  organisation: ID;
  seller: ID;
  seller_name?: string;
  booking: ID;
  booking_code?: string;
  amount: Money;
  rate_used: Money;
  status: "pending" | "approved" | "paid" | "cancelled";
  paid_at?: string | null;
  paid_by?: ID | null;
  paid_by_email?: string;
  note: string;
  created_at?: string;
}

export interface Receipt {
  id: ID;
  booking: ID;
  booking_code?: string;
  customer_name?: string;
  receipt_number: string;
  receipt_data: Record<string, unknown>;
  pdf_file?: string | null;
  public_url_token: string;
  sent_by_email: boolean;
  sent_by_whatsapp: boolean;
  email_sent_at?: string | null;
  whatsapp_sent_at?: string | null;
  created_at?: string;
}

export interface Booking {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  booking_code: string;
  customer?: ID | null;
  customer_detail?: Customer | null;
  seller?: ID | null;
  seller_detail?: Seller | null;
  primary_product?: ID | null;
  primary_product_detail?: ExperienceProduct | null;
  source: BookingSource;
  status: BookingStatus;
  payment_status: PaymentStatus;
  payment_mode: PaymentMode;
  payment_method: PaymentMethod;
  service_date?: string | null;
  service_time?: string | null;
  customer_name: string;
  customer_whatsapp?: string | null;
  customer_email?: string | null;
  customer_hotel: string;
  customer_notes: string;
  adults: number;
  children: number;
  infants: number;
  total_guests: number;
  subtotal_amount: Money;
  discount_amount: Money;
  tax_amount: Money;
  total_amount: Money;
  deposit_required: Money;
  deposit_paid: Money;
  balance_due: Money;
  seller_collected_amount: Money;
  seller_due_to_company: Money;
  seller_commission_amount: Money;
  commission_paid_amount: Money;
  commission_pending_amount?: Money;
  is_fully_paid?: boolean;
  requires_supervisor_approval: boolean;
  supervisor_approved_by?: ID | null;
  supervisor_approved_at?: string | null;
  supervisor_notes: string;
  receipt_sent_before_full_payment: boolean;
  transfer_origin: string;
  transfer_destination: string;
  transfer_airport: string;
  transfer_flight_number: string;
  transfer_vehicle_type: string;
  transfer_round_trip: boolean;
  transfer_return_date?: string | null;
  transfer_return_time?: string | null;
  transfer_status: string;
  driver_name: string;
  driver_phone: string;
  external_provider: string;
  external_reference: string;
  cancellation_reason: string;
  created_by?: ID | null;
  created_at?: string;
  updated_at?: string;
  confirmed_at?: string | null;
  cancelled_at?: string | null;
  completed_at?: string | null;
  items?: BookingItem[];
  payments?: BookingPayment[];
  commissions?: SellerCommission[];
  pickup_info?: BookingPickupInfo | null;
  receipt?: Receipt | null;
}

export interface BookingItemPayload {
  product_id: ID;
  package_id?: ID | null;
  event_ticket_type_id?: ID | null;
  external_snapshot_id?: ID | null;
  product_name?: string;
  service_date?: string | null;
  service_time?: string | null;
  quantity?: number;
  unit_price?: Money | null;
  unit_cost?: Money | null;
  instructions?: string;
}

export interface BookingPaymentPayload {
  seller_id?: ID | null;
  amount: Money;
  payment_type: BookingPayment["payment_type"];
  payer_type?: BookingPayment["payer_type"];
  method: BookingPayment["method"];
  status?: BookingPayment["status"];
  reference?: string;
  note?: string;
}

export interface BookingCreatePayload
  extends Partial<Omit<Booking, "id" | "items" | "payments" | "commissions" | "receipt">> {
  items_payload?: BookingItemPayload[];
  payments_payload?: BookingPaymentPayload[];
  pickup_location_id?: ID | null;
  seller_slug?: string;
}

export interface DashboardSummary {
  total_bookings: number;
  today_bookings: number;
  upcoming_bookings: number;
  pending_payments: number;
  pending_approvals: number;
  confirmed_bookings: number;
  cancelled_bookings: number;
  total_sales: Money;
  deposit_paid: Money;
  balance_due: Money;
  seller_due_to_company: Money;
  commission_generated: Money;
  commission_paid: Money;
  commission_pending: Money;
}

export interface DashboardProductRanking {
  product_name: string;
  product_type: string;
  quantity_sold: number;
  revenue: Money;
}

export interface DashboardSellerRanking {
  id: ID;
  full_name: string;
  seller_slug: string;
  bookings_count: number;
  sales_total: Money;
  commission_total: Money;
}

export interface TicketingDashboard {
  summary: DashboardSummary;
  top_products: DashboardProductRanking[];
  top_sellers: DashboardSellerRanking[];
}

export interface TicketingReports {
  sales_by_seller: Record<string, unknown>[];
  sales_by_product: Record<string, unknown>[];
  payment_statuses: Record<string, unknown>[];
  booking_statuses: Record<string, unknown>[];
}

export interface SellerDashboard {
  seller: Seller;
  permissions: SellerPermissions;
  summary: {
    today_bookings: number;
    week_bookings: number;
    month_bookings: number;
    total_bookings: number;

    today_sales: Money;
    today_deposits: Money;
    money_collected: Money;
    money_owed_to_company: Money;
    outstanding_balance: Money;

    pending_payments: number;
    confirmed_bookings: number;
    tickets_generated: number;

    commission_today: Money;
    commission_week: Money;
    commission_month: Money;
    commission_pending: Money;
    commission_paid: Money;
    commission_lifetime: Money;
  };
  recent_bookings: Booking[];
  available_products: ExperienceProduct[];
}

export interface PickupResolveResponse {
  found: boolean;
  schedule?: ProductPickupSchedule;
  product?: string;
  pickup_location?: string;
  service_date?: string;
  message?: string;
}

export interface PublicBrandingResponse {
  organisation: {
    id: ID;
    name: string;
    slug: string;
    email?: string | null;
    phone?: string | null;
  };
  ticketing_settings: TicketingSettings;
  public_site: TicketingPublicSiteSettings;
}


export type TicketingPaymentProvider = "stripe" | "paypal" | "none";

export interface TicketingPaymentProviderSettings {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  default_provider: TicketingPaymentProvider;
  stripe_enabled: boolean;
  stripe_publishable_key: string;
  stripe_connect_account_id: string;
  stripe_connect_status: "not_connected" | "pending" | "connected" | "restricted";
  stripe_configured?: boolean;
  paypal_enabled: boolean;
  paypal_mode: "sandbox" | "live";
  paypal_client_id: string;
  paypal_merchant_id: string;
  paypal_configured?: boolean;
  payment_success_message: string;
  payment_pending_message: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PublicPaymentOptions {
  default_provider: TicketingPaymentProvider;
  stripe_enabled: boolean;
  paypal_enabled: boolean;
  stripe_publishable_key?: string;
  paypal_mode?: "sandbox" | "live";
  payment_success_message?: string;
  payment_pending_message?: string;
}

export interface StripeCheckoutSessionPayload {
  booking_id?: ID;
  booking_code?: string;
  payment_type: "full" | "deposit" | "balance";
  success_url?: string;
  cancel_url?: string;
}

export interface StripeCheckoutSessionResponse {
  provider: "stripe";
  booking_id: ID;
  booking_code: string;
  session_id: string;
  checkout_url: string;
}

export interface PayPalCreateOrderPayload {
  booking_id?: ID;
  booking_code?: string;
  payment_type: "full" | "deposit" | "balance";
  success_url?: string;
  cancel_url?: string;
}

export interface PayPalCreateOrderResponse {
  provider: "paypal";
  booking_id: ID;
  booking_code: string;
  order_id: string;
  approve_url?: string;
}

export interface PayPalCaptureOrderPayload {
  order_id?: string;
  token?: string;
}

export interface PayPalCaptureOrderResponse {
  provider: "paypal";
  booking_id: ID;
  booking_code: string;
  status: string;
  booking: Booking;
}

export interface ExternalProviderConfig {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  provider: "wellet" | "other";
  is_enabled: boolean;
  api_base_url: string;
  api_key: string;
  show_id: string;
  category_id: string;
  currency: string;
  lang: string;
  include_table: boolean;
  extra_settings: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ExternalProviderProductSnapshot {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  provider: string;
  product?: ID | null;
  product_name?: string;
  external_product_id: string;
  external_name: string;
  price: Money;
  currency: string;
  service_date?: string | null;
  raw_data: Record<string, unknown>;
  created_at?: string;
}

export interface WelletProductsResponse {
  provider: "wellet";
  enabled: boolean;
  message: string;
  config: {
    show_id: string;
    category_id: string;
    currency: string;
    lang: string;
    include_table: boolean;
  };
  snapshots: ExternalProviderProductSnapshot[];
}

export interface ProductReview {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  product: ID;
  product_name?: string;
  customer?: ID | null;
  customer_full_name?: string | null;
  customer_name: string;
  rating: number;
  title: string;
  comment: string;
  is_public: boolean;
  is_approved: boolean;
  created_at?: string;
}

export type CreatePayload<T> = Partial<Omit<T, "id" | "created_at" | "updated_at">>;
export type UpdatePayload<T> = Partial<Omit<T, "id" | "created_at" | "updated_at">>;

// =============================================================================
// Operations, partner access, admissions, settlements, and ledger
// =============================================================================

export type BusinessEntityType =
  | "partner"
  | "venue"
  | "operator"
  | "transport_company"
  | "driver"
  | "guide"
  | "event_organizer"
  | "other";

export type BusinessEntityRole =
  | "administrator"
  | "finance"
  | "supervisor"
  | "scanner"
  | "driver"
  | "guide"
  | "viewer";

export type AgreementType =
  | "fixed_partner_net"
  | "percentage_split"
  | "fixed_platform_commission"
  | "percentage_platform_commission"
  | "custom";

export type SettlementBasis =
  | "checked_in"
  | "confirmed_booking"
  | "fully_paid_booking"
  | "provider_confirmation";

export type CollectionMode =
  | "platform_collects"
  | "partner_collects"
  | "seller_collects"
  | "customer_pays_partner"
  | "mixed";

export type AdmissionTokenStatus = "active" | "consumed" | "revoked" | "expired";

export type ScanResult =
  | "valid"
  | "admitted"
  | "partially_used"
  | "already_used"
  | "wrong_date"
  | "cancelled"
  | "refunded"
  | "wrong_partner"
  | "expired"
  | "revoked"
  | "unauthorised"
  | "not_found"
  | "invalid";

export type AdmissionStatus = "admitted" | "reversed";

export type SettlementStatus =
  | "draft"
  | "review"
  | "approved"
  | "partially_paid"
  | "settled"
  | "disputed"
  | "cancelled";

export type SettlementParty = "platform" | "partner" | "seller" | "customer";
export type LedgerDirection = "debit" | "credit";
export type LedgerEntryType =
  | "booking"
  | "payment"
  | "commission"
  | "settlement"
  | "refund"
  | "adjustment"
  | "reversal"
  | "admission";

export interface TicketingBusinessEntity {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  name: string;
  slug: string;
  entity_type: BusinessEntityType;
  legal_name: string;
  tax_identifier: string;
  contact_name: string;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_whatsapp?: string | null;
  address: string;
  notes: string;
  currency: string;
  settlement_cycle_days: number;
  settlement_anchor_date?: string | null;
  can_collect_customer_balance: boolean;
  can_scan_tickets: boolean;
  require_check_in_confirmation: boolean;
  allow_partial_admission: boolean;
  allow_offline_scanning: boolean;
  external_provider: string;
  external_entity_id: string;
  extra_settings: Record<string, unknown>;
  is_active: boolean;
  active_agreements_count?: number;
  active_users_count?: number;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessEntityUserAccess {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  business_entity: ID;
  business_entity_name?: string;
  business_entity_slug?: string;
  user: ID;
  user_name?: string;
  user_email?: string;
  username?: string;
  role: BusinessEntityRole;
  can_access_dashboard: boolean;
  can_scan: boolean;
  can_view_today_bookings: boolean;
  can_view_admissions: boolean;
  can_view_customer_contact: boolean;
  can_view_financials: boolean;
  can_view_settlements: boolean;
  can_record_payments: boolean;
  can_reverse_admissions: boolean;
  can_manage_users: boolean;
  is_active: boolean;
  last_access_at?: string | null;
  partner_login_url?: string;
  generated_password?: string;
  temporary_password?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BusinessEntityUserCreatePayload {
  business_entity_id: ID;
  create_login?: boolean;
  login_name: string;
  login_email: string;
  login_username?: string;
  login_password?: string;
  generate_password?: boolean;
  apply_role_defaults?: boolean;
  role: BusinessEntityRole;
  is_active?: boolean;
  can_access_dashboard?: boolean;
  can_scan?: boolean;
  can_view_today_bookings?: boolean;
  can_view_admissions?: boolean;
  can_view_customer_contact?: boolean;
  can_view_financials?: boolean;
  can_view_settlements?: boolean;
  can_record_payments?: boolean;
  can_reverse_admissions?: boolean;
  can_manage_users?: boolean;
}

export interface BusinessEntityPasswordResetResponse {
  detail: string;
  access_id: ID;
  user_id: ID;
  user_name?: string;
  user_email?: string;
  username?: string;
  business_entity?: { id: ID; name: string };
  partner_login_url?: string;
  temporary_password: string;
}

export interface ProductBusinessAgreement {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  business_entity: ID;
  business_entity_name?: string;
  product: ID;
  product_name?: string;
  name: string;
  version: number;
  agreement_type: AgreementType;
  settlement_basis: SettlementBasis;
  collection_mode: CollectionMode;
  partner_fixed_amount: Money;
  partner_percentage: Money;
  platform_fixed_amount: Money;
  platform_percentage: Money;
  seller_commission_included: boolean;
  settlement_cycle_days: number;
  payment_due_days: number;
  currency: string;
  effective_from: string;
  effective_until?: string | null;
  terms: string;
  extra_rules: Record<string, unknown>;
  is_active: boolean;
  created_by?: ID | null;
  created_by_email?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface BookingFinancialSnapshot {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  booking: ID;
  booking_code?: string;
  booking_item: ID;
  product_name?: string;
  business_entity?: ID | null;
  business_entity_name?: string | null;
  agreement?: ID | null;
  agreement_name?: string | null;
  agreement_version: number;
  settlement_basis: SettlementBasis;
  currency: string;
  quantity: number;
  gross_amount: Money;
  discount_amount: Money;
  tax_amount: Money;
  net_customer_amount: Money;
  partner_entitlement: Money;
  platform_entitlement: Money;
  seller_entitlement: Money;
  collected_by_platform: Money;
  collected_by_partner: Money;
  collected_by_seller: Money;
  customer_balance_due: Money;
  primary_collection_party: SettlementParty | "mixed" | "none";
  calculation_data: Record<string, unknown>;
  captured_at?: string;
  updated_at?: string;
}

export interface AdmissionToken {
  id: ID;
  organisation: ID;
  booking: ID;
  booking_code?: string;
  booking_item: ID;
  product_name?: string;
  business_entity?: ID | null;
  business_entity_name?: string | null;
  token: string;
  token_url_value?: string;
  status: AdmissionTokenStatus;
  valid_from?: string | null;
  valid_until?: string | null;
  total_admissions: number;
  admitted_quantity: number;
  remaining_admissions: number;
  is_currently_valid: boolean;
  is_primary: boolean;
  issued_at?: string;
  revoked_at?: string | null;
  revoked_by?: ID | null;
  revocation_reason: string;
  metadata: Record<string, unknown>;
}

export interface TicketScanAttempt {
  id: ID;
  organisation: ID;
  business_entity?: ID | null;
  business_entity_name?: string | null;
  scanned_by?: ID | null;
  scanned_by_email?: string | null;
  admission_token?: ID | null;
  booking?: ID | null;
  booking_code?: string | null;
  booking_item?: ID | null;
  product_name?: string | null;
  scanned_value: string;
  result: ScanResult;
  requested_quantity: number;
  admitted_quantity: number;
  failure_reason: string;
  scanner_device_id: string;
  scanner_name: string;
  location_name: string;
  ip_address?: string | null;
  user_agent: string;
  offline_event_id?: string | null;
  metadata: Record<string, unknown>;
  scanned_at?: string;
}

export interface TicketAdmission {
  id: ID;
  organisation: ID;
  business_entity?: ID | null;
  business_entity_name?: string | null;
  booking: ID;
  booking_code?: string;
  booking_item: ID;
  product_name?: string;
  admission_token: ID;
  scan_attempt?: ID | null;
  quantity_admitted: number;
  effective_quantity: number;
  status: AdmissionStatus;
  admitted_at?: string;
  admitted_by?: ID | null;
  admitted_by_email?: string | null;
  scanner_device_id: string;
  location_name: string;
  notes: string;
  metadata: Record<string, unknown>;
  reversed_at?: string | null;
  reversed_by?: ID | null;
  reversed_by_email?: string | null;
  reversal_reason: string;
}

export interface TicketingLedgerEntry {
  id: ID;
  organisation: ID;
  booking?: ID | null;
  booking_code?: string | null;
  booking_item?: ID | null;
  product_name?: string | null;
  booking_payment?: ID | null;
  seller?: ID | null;
  seller_name?: string | null;
  business_entity?: ID | null;
  business_entity_name?: string | null;
  entry_group: string;
  entry_type: LedgerEntryType;
  direction: LedgerDirection;
  party_type: SettlementParty;
  amount: Money;
  signed_amount: Money;
  currency: string;
  description: string;
  reference: string;
  effective_at: string;
  is_reversed: boolean;
  reverses_entry?: ID | null;
  metadata: Record<string, unknown>;
  created_by?: ID | null;
  created_by_email?: string | null;
  created_at?: string;
}

export interface PartnerSettlementLine {
  id: ID;
  settlement: ID;
  booking: ID;
  booking_code?: string;
  booking_item: ID;
  product_name?: string;
  financial_snapshot?: ID | null;
  service_date?: string | null;
  booked_quantity: number;
  admitted_quantity: number;
  settlement_quantity: number;
  gross_amount: Money;
  discount_amount: Money;
  refund_amount: Money;
  partner_entitlement: Money;
  platform_entitlement: Money;
  seller_entitlement: Money;
  collected_by_partner: Money;
  collected_by_platform: Money;
  collected_by_seller: Money;
  customer_balance_due: Money;
  partner_due_to_platform: Money;
  platform_due_to_partner: Money;
  net_amount: Money;
  calculation_data: Record<string, unknown>;
  created_at?: string;
}

export interface PartnerSettlementPayment {
  id: ID;
  settlement: ID;
  settlement_number?: string;
  payer_type: SettlementParty;
  payee_type: SettlementParty;
  amount: Money;
  currency: string;
  payment_method: string;
  status: "pending" | "confirmed" | "failed" | "cancelled";
  reference: string;
  paid_at: string;
  notes: string;
  attachment?: string | null;
  attachment_url?: string | null;
  recorded_by?: ID | null;
  recorded_by_email?: string | null;
  ledger_entry_group?: string | null;
  created_at?: string;
}

export interface PartnerSettlementPeriod {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  business_entity: ID;
  business_entity_name?: string;
  settlement_number: string;
  period_start: string;
  period_end: string;
  currency: string;
  status: SettlementStatus;
  total_bookings: number;
  total_guests_booked: number;
  total_guests_admitted: number;
  total_no_shows: number;
  gross_sales: Money;
  discounts: Money;
  refunds: Money;
  partner_entitlement: Money;
  platform_entitlement: Money;
  seller_entitlement: Money;
  collected_by_partner: Money;
  collected_by_platform: Money;
  collected_by_sellers: Money;
  customer_balance_due: Money;
  partner_owes_platform: Money;
  platform_owes_partner: Money;
  net_settlement_amount: Money;
  paid_amount: Money;
  outstanding_amount: Money;
  generated_at?: string;
  generated_by?: ID | null;
  generated_by_email?: string | null;
  approved_at?: string | null;
  approved_by?: ID | null;
  approved_by_email?: string | null;
  settled_at?: string | null;
  notes: string;
  calculation_data: Record<string, unknown>;
  lines: PartnerSettlementLine[];
  payments: PartnerSettlementPayment[];
  created_at?: string;
  updated_at?: string;
}

export interface AdmissionTokenIssuePayload {
  booking_item_id: ID;
  business_entity_id?: ID | null;
  total_admissions?: number;
  valid_from?: string | null;
  valid_until?: string | null;
  is_primary?: boolean;
  metadata?: Record<string, unknown>;
  replace_existing_primary?: boolean;
  base_url?: string;
}

export interface TicketScanResolvePayload {
  token: string;
  business_entity_id?: ID;
  requested_quantity?: number;
  scanner_device_id?: string;
  scanner_name?: string;
  location_name?: string;
  offline_event_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface TicketAdmissionCreatePayload extends TicketScanResolvePayload {
  notes?: string;
  confirm?: boolean;
}

export interface TicketAdmissionReversePayload {
  reason: string;
}

export interface TicketScanResolution {
  ok: boolean;
  result: ScanResult;
  message: string;
  token?: string | null;
  token_id?: ID | null;
  booking_id?: ID | null;
  booking_code?: string;
  booking_status?: BookingStatus | string;
  booking_item_id?: ID | null;
  product_name?: string;
  product_type?: ProductType | string;
  business_entity_id?: ID | null;
  business_entity_name?: string;
  service_date?: string | null;
  total_admissions?: number;
  admitted_quantity?: number;
  remaining_admissions?: number;
  requested_quantity?: number;
  scan_attempt_id?: ID | null;
  admission_id?: ID | null;
  already_processed?: boolean;
}

export interface OfflineScanEvent extends TicketAdmissionCreatePayload {
  offline_event_id: string;
  captured_at?: string;
}

export interface OfflineScanSyncResponse {
  processed: number;
  successful: number;
  failed: number;
  results: TicketScanResolution[];
}

export interface SettlementGeneratePayload {
  business_entity_id: ID;
  period_start: string;
  period_end: string;
  regenerate_draft?: boolean;
  notes?: string;
}

export interface SettlementApprovalPayload {
  notes?: string;
}

export interface SettlementPaymentCreatePayload {
  payer_type: SettlementParty;
  payee_type: SettlementParty;
  amount: Money;
  currency?: string;
  payment_method?: string;
  status?: PartnerSettlementPayment["status"];
  reference?: string;
  paid_at?: string;
  notes?: string;
  attachment?: File | null;
}

export interface SettlementPreviewLine extends Omit<PartnerSettlementLine, "id" | "settlement" | "financial_snapshot" | "created_at"> {}

export interface SettlementPreview {
  business_entity_id: ID;
  business_entity_name: string;
  period_start: string;
  period_end: string;
  currency: string;
  total_bookings: number;
  total_guests_booked: number;
  total_guests_admitted: number;
  total_no_shows: number;
  totals: Record<string, Money>;
  lines: Array<Record<string, unknown>>;
}

export interface BusinessEntityDashboard {
  business_entity: TicketingBusinessEntity;
  date_from: string;
  date_to: string;
  totals: {
    bookings: number;
    expected_guests: number;
    admitted_guests: number;
    remaining_guests: number;
    admission_events: number;
    gross_sales: Money;
    partner_entitlement: Money;
    platform_entitlement: Money;
    collected_by_partner: Money;
    collected_by_platform: Money;
    customer_balance_due: Money;
  };
  current_period: {
    period_start: string;
    period_end: string;
    settlement: PartnerSettlementPeriod | null;
  };
  latest_scans: TicketScanAttempt[];
}

export interface AdmissionsDashboard {
  date: string;
  guests_admitted: number;
  admission_events: number;
  by_business_entity: Array<{
    business_entity_id: ID;
    business_entity__name: string;
    guests: number;
    admissions: number;
  }>;
  scan_results: Array<{
    result: ScanResult;
    total: number;
  }>;
  latest_admissions: TicketAdmission[];
}

export interface LedgerSummary {
  platform: Money;
  partner: Money;
  seller: Money;
  customer: Money;
}

export interface ManualLedgerAdjustmentPayload {
  debit_party: SettlementParty;
  credit_party: SettlementParty;
  amount: Money;
  description: string;
  currency?: string;
  reference?: string;
  booking_id?: ID;
  business_entity_id?: ID;
  metadata?: Record<string, unknown>;
}

export interface SettlementReconciliation {
  settlement_id: ID;
  settlement_number: string;
  payment_total: Money;
  ledger_total: Money;
  difference: Money;
  is_reconciled: boolean;
}

