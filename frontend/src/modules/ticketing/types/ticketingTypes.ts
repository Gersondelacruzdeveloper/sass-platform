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

export interface ExperienceProduct {
  id: ID;
  organisation: ID;
  organisation_name?: string;
  category?: ID | null;
  category_detail?: ExperienceCategory | null;
  name: string;
  slug: string;
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
  summary: {
    my_bookings: number;
    confirmed_bookings: number;
    pending_payments: number;
    tickets_generated: number;
    money_collected: Money;
    money_owed_to_company: Money;
    commission_generated: Money;
    commission_paid: Money;
  };
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
