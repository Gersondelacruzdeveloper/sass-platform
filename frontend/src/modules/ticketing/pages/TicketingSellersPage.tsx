// src/modules/ticketing/pages/TicketingSellersPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  Image as ImageIcon,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Upload,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import TicketingPageShell from "../components/TicketingPageShell";
import SellerPermissionHelpModal from "../components/SellerPermissionHelpModal";
import { getSellerPermissionHelp } from "../seller-permissions/sellerPermissionHelp";

type SellerRole =
  | "owner"
  | "manager"
  | "supervisor"
  | "seller"
  | "external_vendor"
  | "driver"
  | "viewer"
  | string;

type PermissionKey =
  | "can_access_dashboard"
  | "can_sell_cocobongo"
  | "can_sell_excursions"
  | "can_sell_transfers"
  | "can_sell_events"
  | "can_sell_custom_tours"
  | "can_create_bookings"
  | "can_take_deposits"
  | "can_take_full_payments"
  | "can_collect_cash_payment"
  | "can_generate_ticket_without_customer_online_payment"
  | "can_mark_customer_deposit_paid"
  | "can_mark_customer_full_paid"
  | "can_pay_full_amount_as_seller"
  | "can_pay_deposit_as_seller"
  | "can_pay_commission_only"
  | "can_create_pending_payment_booking"
  | "can_request_supervisor_approval"
  | "can_send_receipt_before_full_payment"
  | "can_view_own_sales"
  | "can_view_own_commissions"
  | "can_apply_discounts"
  | "can_cancel_bookings"
  | "can_send_whatsapp"
  | "can_send_email"
  | "can_send_payment_links"
  | "can_override_pickup_time"
  | "can_view_reports"
  | "can_manage_products"
  | "can_manage_sellers"
  | "can_manage_settings"
  | "can_manage_integrations";

type Seller = {
  id: number;
  organisation?: number;
  organisation_name?: string;
  user?: number | null;
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
  commission_rate?: string | number;
  fixed_commission_amount?: string | number;
  seller_margin_percent?: string | number;
  seller_allowed_discount_percent?: string | number;
  max_customer_discount_percent?: string | number;
  assigned_products?: number[];
  default_margin_percent?: string | number;
  owner_net_amount?: string | number;
  owner_received_amount?: string | number;
  owner_remaining_amount?: string | number;
  seller_collected_amount?: string | number;
  seller_due_to_company?: string | number;
  total_owner_net_amount?: string | number;
  total_owner_received_amount?: string | number;
  total_owner_remaining_amount?: string | number;
  owner_pending_amount?: string | number;
  total_owner_pending_amount?: string | number;
  company_pending_amount?: string | number;
  total_seller_collected_amount?: string | number;
  pending_settlement_amount?: string | number;
  permissions?: Partial<Record<PermissionKey, boolean>>;
  is_active: boolean;
  total_sales_amount?: string | number;
  total_commission_amount?: string | number;
  total_collected_amount?: string | number;
  total_owed_to_company?: string | number;
  total_seller_due_to_company?: string | number;
  created_at?: string;
  updated_at?: string;
} & Partial<Record<PermissionKey, boolean>>;


type CommissionRuleType = "fixed_amount" | "percentage";

type CommissionRuleTargetType =
  | "product"
  | "package"
  | "event_ticket_type"
  | "external_option";

type CommissionProductPackage = {
  id: number;
  name: string;
  product?: number;
  price?: string | number;
  is_active?: boolean;
};

type CommissionEventTicketType = {
  id: number;
  name: string;
  product?: number;
  price?: string | number;
  is_active?: boolean;
};

type CommissionProduct = {
  id: number;
  name: string;
  slug?: string;
  product_type?: string;
  external_provider?: string;
  external_product_id?: string | null;
  is_cocobongo_product?: boolean;
  is_active?: boolean;
  seller_enabled?: boolean;
  packages?: CommissionProductPackage[];
  event_ticket_types?: CommissionEventTicketType[];
};

type CommissionLiveOption = {
  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  name?: string;
  option_name?: string;
  price?: string | number;
  currency?: string;
  available?: boolean;
  sold_out?: boolean;
};

type SellerProductCommissionRule = {
  id: number;
  organisation?: number;
  seller: number;
  seller_name?: string;
  product: number;
  product_name?: string;
  package?: number | null;
  package_name?: string;
  event_ticket_type?: number | null;
  event_ticket_type_name?: string;
  external_option_id?: string;
  external_option_name?: string;
  target_type?: CommissionRuleTargetType;
  target_name?: string;
  rule_type: CommissionRuleType;
  fixed_amount: string | number;
  percentage: string | number;
  currency: string;
  is_per_unit: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
};

type CommissionRuleFormState = {
  id: number | null;
  product_id: string;
  target_type: CommissionRuleTargetType;
  package_id: string;
  event_ticket_type_id: string;
  external_option_id: string;
  external_option_name: string;
  service_date: string;
  rule_type: CommissionRuleType;
  fixed_amount: string;
  percentage: string;
  currency: string;
  is_per_unit: boolean;
  is_active: boolean;
};

type SellerFormState = {
  id?: number | null;
  full_name: string;
  seller_slug: string;
  role: SellerRole;
  email: string;
  phone: string;
  whatsapp: string;
  commission_rate: string;
  fixed_commission_amount: string;
  max_customer_discount_percent: string;
  is_active: boolean;
  create_login: boolean;
  login_username: string;
  login_email: string;
  login_password: string;
  apply_role_defaults: boolean;
  assigned_products: number[];
} & Record<PermissionKey, boolean>;

type RoleOption = {
  value: SellerRole;
  label: string;
  helper: string;
};

type PermissionGroup = {
  title: string;
  description: string;
  keys: PermissionKey[];
};

type Translate = (
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>,
  fallback?: string,
) => string;

const roleOptions: RoleOption[] = [
  {
    value: "owner",
    label: "Owner",
    helper: "Full access to seller tools and management.",
  },
  {
    value: "manager",
    label: "Manager",
    helper: "Can manage bookings, sellers, reports and most operations.",
  },
  {
    value: "supervisor",
    label: "Supervisor",
    helper: "Can support approvals, sales and operational checks.",
  },
  {
    value: "seller",
    label: "Seller",
    helper: "Normal seller with booking and commission access.",
  },
  {
    value: "external_vendor",
    label: "External vendor",
    helper: "External partner with limited booking permissions.",
  },
  {
    value: "driver",
    label: "Driver",
    helper: "Driver or pickup support profile.",
  },
  {
    value: "viewer",
    label: "Viewer",
    helper: "Read-only or very limited access.",
  },
];

const permissionLabels: Record<PermissionKey, string> = {
  can_access_dashboard: "Access seller dashboard",
  can_sell_cocobongo: "Sell Coco Bongo / Wellet",
  can_sell_excursions: "Sell excursions",
  can_sell_transfers: "Sell transfers",
  can_sell_events: "Sell events",
  can_sell_custom_tours: "Sell custom tours",
  can_create_bookings: "Create bookings",
  can_take_deposits: "Take deposits",
  can_take_full_payments: "Take full payments",
  can_collect_cash_payment: "Collect cash payment",
  can_generate_ticket_without_customer_online_payment:
    "Generate ticket without online customer payment",
  can_mark_customer_deposit_paid: "Mark customer deposit paid",
  can_mark_customer_full_paid: "Mark customer full paid",
  can_pay_full_amount_as_seller: "Seller can pay full amount",
  can_pay_deposit_as_seller: "Seller can pay deposit",
  can_pay_commission_only: "Seller can pay commission only",
  can_create_pending_payment_booking: "Create pending payment booking",
  can_request_supervisor_approval: "Request supervisor approval",
  can_send_receipt_before_full_payment: "Send receipt before full payment",
  can_view_own_sales: "View own sales",
  can_view_own_commissions: "View own commissions",
  can_apply_discounts: "Apply discounts",
  can_cancel_bookings: "Cancel bookings",
  can_send_whatsapp: "Send WhatsApp",
  can_send_email: "Send email",
  can_send_payment_links: "Generate customer offer links",
  can_override_pickup_time: "Override pickup time",
  can_view_reports: "View reports",
  can_manage_products: "Manage products",
  can_manage_sellers: "Manage sellers",
  can_manage_settings: "Manage settings",
  can_manage_integrations: "Manage integrations",
};

const permissionGroups: PermissionGroup[] = [
  {
    title: "Sales access",
    description: "What this seller can sell and access.",
    keys: [
      "can_access_dashboard",
      "can_sell_excursions",
      "can_sell_transfers",
      "can_sell_events",
      "can_sell_custom_tours",
      "can_sell_cocobongo",
      "can_create_bookings",
    ],
  },
  {
    title: "Payment flexibility",
    description: "Controls how this seller can generate bookings and collect money.",
    keys: [
      "can_take_deposits",
      "can_take_full_payments",
      "can_collect_cash_payment",
      "can_generate_ticket_without_customer_online_payment",
      "can_mark_customer_deposit_paid",
      "can_mark_customer_full_paid",
      "can_pay_full_amount_as_seller",
      "can_pay_deposit_as_seller",
      "can_pay_commission_only",
      "can_create_pending_payment_booking",
      "can_request_supervisor_approval",
      "can_send_receipt_before_full_payment",
    ],
  },
  {
    title: "Visibility & communication",
    description: "Sales visibility, commission visibility and customer contact tools.",
    keys: [
      "can_view_own_sales",
      "can_view_own_commissions",
      "can_send_whatsapp",
      "can_send_email",
      "can_send_payment_links",
      "can_apply_discounts",
      "can_cancel_bookings",
      "can_override_pickup_time",
    ],
  },
  {
    title: "Management",
    description: "Administrative access for trusted managers.",
    keys: [
      "can_view_reports",
      "can_manage_products",
      "can_manage_sellers",
      "can_manage_settings",
      "can_manage_integrations",
    ],
  },
];

const permissionKeys = permissionGroups.flatMap((group) => group.keys);


function localDateInputValue(date = new Date()) {
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 10);
}

const blankCommissionRuleForm: CommissionRuleFormState = {
  id: null,
  product_id: "",
  target_type: "product",
  package_id: "",
  event_ticket_type_id: "",
  external_option_id: "",
  external_option_name: "",
  service_date: localDateInputValue(),
  rule_type: "fixed_amount",
  fixed_amount: "0.00",
  percentage: "0.00",
  currency: "USD",
  is_per_unit: true,
  is_active: true,
};

function getCommissionExternalOptionId(option: CommissionLiveOption) {
  return String(
    option.external_product_id ||
      option.external_variant_id ||
      option.external_availability_id ||
      ""
  ).trim();
}

function getCommissionExternalOptionName(option: CommissionLiveOption) {
  return String(option.option_name || option.name || getCommissionExternalOptionId(option)).trim();
}

const blankForm: SellerFormState = {
  id: null,
  full_name: "",
  seller_slug: "",
  role: "seller",
  email: "",
  phone: "",
  whatsapp: "",
  commission_rate: "0.00",
  fixed_commission_amount: "0.00",
  max_customer_discount_percent: "0.00",
  is_active: true,
  create_login: false,
  login_username: "",
  login_email: "",
  login_password: "",
  apply_role_defaults: true,
  assigned_products: [],

  can_access_dashboard: true,
  can_sell_cocobongo: false,
  can_sell_excursions: true,
  can_sell_transfers: true,
  can_sell_events: true,
  can_sell_custom_tours: true,
  can_create_bookings: true,
  can_take_deposits: true,
  can_take_full_payments: false,
  can_collect_cash_payment: true,
  can_generate_ticket_without_customer_online_payment: false,
  can_mark_customer_deposit_paid: false,
  can_mark_customer_full_paid: false,
  can_pay_full_amount_as_seller: false,
  can_pay_deposit_as_seller: false,
  can_pay_commission_only: false,
  can_create_pending_payment_booking: true,
  can_request_supervisor_approval: true,
  can_send_receipt_before_full_payment: false,
  can_view_own_sales: true,
  can_view_own_commissions: true,
  can_apply_discounts: false,
  can_cancel_bookings: false,
  can_send_whatsapp: true,
  can_send_email: false,
  can_send_payment_links: false,
  can_override_pickup_time: false,
  can_view_reports: false,
  can_manage_products: false,
  can_manage_sellers: false,
  can_manage_settings: false,
  can_manage_integrations: false,
};

function getRequestParams(organisationSlug?: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function normalizeList<T>(data: T[] | { results?: T[] } | unknown): T[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }

  return [];
}

function getErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;

  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return fallback;
}

function formatMoney(
  value?: string | number | null,
  language: "en" | "es" = "en",
  symbol = "US$",
) {
  const number = Number(value || 0);

  return `${symbol} ${number.toLocaleString(
    language === "es" ? "es-DO" : "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

function formatPercent(
  value?: string | number | null,
  language: "en" | "es" = "en",
) {
  const number = Number(value || 0);

  return `${number.toLocaleString(
    language === "es" ? "es-DO" : "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}%`;
}


function numberValue(value?: string | number | null) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function firstMoneyValue(...values: Array<string | number | null | undefined>) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value) !== "") {
      return numberValue(value);
    }
  }

  return 0;
}

function getSellerMarginPercent(seller: Seller) {
  return firstMoneyValue(
    seller.seller_margin_percent,
    seller.seller_allowed_discount_percent,
    seller.max_customer_discount_percent,
    seller.default_margin_percent,
    seller.commission_rate
  );
}

function getSellerCollectedAmount(seller: Seller) {
  return firstMoneyValue(
    seller.total_seller_collected_amount,
    seller.seller_collected_amount,
    seller.total_collected_amount
  );
}

function getSellerOwedToCompany(seller: Seller) {
  /*
   * Seller list responses can contain both booking-level compatibility fields
   * and seller-level aggregate totals. A present "0.00" compatibility field
   * must not hide a positive aggregate balance.
   */
  const values = [
    seller.total_owed_to_company,
    seller.total_seller_due_to_company,
    seller.pending_settlement_amount,
    seller.seller_due_to_company,
  ]
    .map(numberValue)
    .filter((value) => Number.isFinite(value));

  return values.length ? Math.max(...values, 0) : 0;
}

function readNumber(
  source: Record<string, unknown>,
  keys: string[]
) {
  for (const key of keys) {
    const amount = numberValue(
      source[key] as string | number | null | undefined
    );

    if (amount !== 0) {
      return amount;
    }
  }

  return 0;
}

function getSellerOwnerNet(seller: Seller) {
  return readNumber(seller as Record<string, unknown>, [
    "owner_net_amount",
    "owner_net",
    "total_owner_net_amount",
  ]);
}

function getSellerOwnerReceived(seller: Seller) {
  return readNumber(seller as Record<string, unknown>, [
    "owner_received_amount",
    "owner_received",
    "total_owner_received_amount",
  ]);
}

function getSellerOwnerPending(seller: Seller) {
  const sellerRecord = seller as Record<string, unknown>;

  return (
    readNumber(sellerRecord, [
      "owner_remaining_amount",
      "owner_pending",
      "owner_pending_amount",
      "total_owner_remaining_amount",
      "total_owner_pending_amount",
      "company_pending_amount",
    ]) ||
    Math.max(
      getSellerOwnerNet(seller) - getSellerOwnerReceived(seller),
      0
    )
  );
}

function roleLabel(
  value: string | null | undefined,
  t: Translate,
) {
  const normalized = String(value || "seller").toLowerCase();

  return t(
    `sellers.roles.${normalized}`,
    undefined,
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function isValidEmail(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function getApiOrigin() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl.replace(/\/api\/?$/, "");
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiOrigin();

  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function getSellerPhotoUrl(seller: Seller) {
  return resolveAssetUrl(seller.photo_url || seller.photo);
}

function getSellerPublicUrl(organisationSlug: string, seller: Seller) {
  const path = seller.public_path || `/s/${seller.seller_slug}`;

  return `${window.location.origin}/experiences/${organisationSlug}${path.startsWith("/") ? path : `/${path}`}`;
}

function appendText(
  formData: FormData,
  key: string,
  value?: string | number | null,
  options?: { omitEmpty?: boolean }
) {
  const normalized = value === undefined || value === null ? "" : String(value).trim();

  if (options?.omitEmpty && !normalized) return;

  formData.append(key, normalized);
}

function appendBoolean(formData: FormData, key: string, value: boolean) {
  formData.append(key, value ? "true" : "false");
}

function sellerToForm(seller: Seller): SellerFormState {
  const nextForm: SellerFormState = {
    ...blankForm,
    id: seller.id,
    full_name: seller.full_name || "",
    seller_slug: seller.seller_slug || "",
    role: seller.role || "seller",
    email: seller.email || "",
    phone: seller.phone || "",
    whatsapp: seller.whatsapp || "",
    commission_rate: String(seller.commission_rate ?? "0.00"),
    fixed_commission_amount: String(seller.fixed_commission_amount ?? "0.00"),
    max_customer_discount_percent: String(
      seller.max_customer_discount_percent ??
        seller.seller_allowed_discount_percent ??
        "0.00"
    ),
    is_active: Boolean(seller.is_active),
    create_login: false,
    login_username: "",
    login_email: seller.user_email || seller.email || "",
    login_password: "",
    apply_role_defaults: false,
    assigned_products: Array.isArray(seller.assigned_products)
      ? seller.assigned_products.map(Number).filter(Number.isFinite)
      : [],
  };

  permissionKeys.forEach((key) => {
    nextForm[key] = Boolean(seller[key] ?? seller.permissions?.[key] ?? false);
  });

  return nextForm;
}

function formToFormData(form: SellerFormState, photoFile: File | null) {
  const formData = new FormData();

  appendText(formData, "full_name", form.full_name);
  appendText(formData, "seller_slug", form.seller_slug || slugify(form.full_name) || "seller");
  appendText(formData, "role", form.role);
  appendText(formData, "email", form.email, { omitEmpty: true });
  appendText(formData, "phone", form.phone, { omitEmpty: true });
  appendText(formData, "whatsapp", form.whatsapp, { omitEmpty: true });
  appendText(formData, "commission_rate", form.commission_rate || "0.00");
  appendText(formData, "fixed_commission_amount", form.fixed_commission_amount || "0.00");
  appendText(
    formData,
    "max_customer_discount_percent",
    form.can_apply_discounts
      ? form.max_customer_discount_percent || "0.00"
      : "0.00"
  );

  appendBoolean(formData, "is_active", form.is_active);
  appendBoolean(formData, "create_login", form.create_login);
  appendBoolean(formData, "apply_role_defaults", form.apply_role_defaults);

  if (form.create_login) {
    appendText(formData, "login_username", form.login_username, { omitEmpty: true });
    appendText(formData, "login_email", form.login_email || form.email);
    appendText(formData, "login_password", form.login_password);
  }

  permissionKeys.forEach((key) => {
    appendBoolean(formData, key, Boolean(form[key]));
  });

  form.assigned_products.forEach((productId) => {
    formData.append("assigned_products", String(productId));
  });

  if (photoFile) {
    formData.append("photo", photoFile);
  }

  return formData;
}

export default function TicketingSellersPage() {
  const { language, t } = useTicketingAdminTranslation();
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [sellerProducts, setSellerProducts] = useState<CommissionProduct[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SellerFormState>(blankForm);
  const [photoFile, setPhotoFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadSellers() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [response, productsResponse] = await Promise.all([
        api.get("/ticketing/sellers/", { params: requestParams }),
        api.get("/ticketing/products/", {
          params: { ...requestParams, is_active: true, page_size: 1000 },
        }),
      ]);

      setSellers(normalizeList<Seller>(response.data));
      setSellerProducts(
        normalizeList<CommissionProduct>(productsResponse.data)
          .filter(
            (product) =>
              product.is_active !== false && product.seller_enabled !== false
          )
          .sort((left, right) => left.name.localeCompare(right.name))
      );
    } catch (err: any) {
      console.error("Could not load sellers:", err);
      setError(getErrorMessage(err, t("sellers.errors.load")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSellers();
  }, [organisationSlug]);

  const stats = useMemo(() => {
    return {
      total: sellers.length,
      active: sellers.filter((seller) => seller.is_active).length,
      withDashboard: sellers.filter((seller) => seller.can_access_dashboard).length,
      totalSales: sellers.reduce(
        (sum, seller) => sum + Number(seller.total_sales_amount || 0),
        0
      ),
      totalCommission: sellers.reduce(
        (sum, seller) => sum + Number(seller.total_commission_amount || 0),
        0
      ),
      sellerCollected: sellers.reduce(
        (sum, seller) => sum + getSellerCollectedAmount(seller),
        0
      ),
      ownerNet: sellers.reduce(
        (sum, seller) => sum + getSellerOwnerNet(seller),
        0
      ),
      ownerReceived: sellers.reduce(
        (sum, seller) => sum + getSellerOwnerReceived(seller),
        0
      ),
      ownerPending: sellers.reduce(
        (sum, seller) => sum + getSellerOwnerPending(seller),
        0
      ),
      owedToCompany: sellers.reduce(
        (sum, seller) => sum + getSellerOwedToCompany(seller),
        0
      ),
    };
  }, [sellers]);

  const filteredSellers = useMemo(() => {
    return sellers.filter((seller) => {
      const searchText = [
        seller.full_name,
        seller.seller_slug,
        seller.public_path,
        seller.role,
        seller.email,
        seller.phone,
        seller.whatsapp,
        seller.username,
        seller.user_email,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (roleFilter && seller.role !== roleFilter) {
        return false;
      }

      if (statusFilter === "active" && !seller.is_active) {
        return false;
      }

      if (statusFilter === "inactive" && seller.is_active) {
        return false;
      }

      return true;
    });
  }, [sellers, search, roleFilter, statusFilter]);

  function openCreateForm() {
    setEditingSeller(null);
    setSelectedSeller(null);
    setForm({
      ...blankForm,
      seller_slug: "",
      apply_role_defaults: true,
    });
    setPhotoFile(null);
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function openEditForm(seller: Seller) {
    setEditingSeller(seller);
    setSelectedSeller(null);
    setForm(sellerToForm(seller));
    setPhotoFile(null);
    setShowForm(true);
    setError("");
    setSavedMessage("");
  }

  function updateForm<K extends keyof SellerFormState>(
    field: K,
    value: SellerFormState[K]
  ) {
    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "full_name" && !current.id && !current.seller_slug.trim()) {
        next.seller_slug = slugify(String(value));
      }

      if (field === "email" && !current.id && !current.login_email.trim()) {
        next.login_email = String(value);
      }

      if (field === "can_apply_discounts" && value === false) {
        next.max_customer_discount_percent = "0.00";
      }

      return next;
    });
  }

  async function saveSeller() {
    if (!form.full_name.trim()) {
      setError(t("sellers.errors.nameRequired"));
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email)) {
      setError(t("sellers.errors.invalidOptionalEmail"));
      return;
    }

    const maximumDiscountPercent = Number(
      form.max_customer_discount_percent || 0
    );

    if (
      form.can_apply_discounts &&
      (!Number.isFinite(maximumDiscountPercent) ||
        maximumDiscountPercent < 0 ||
        maximumDiscountPercent > 100)
    ) {
      setError(
        t(
          "sellers.errors.invalidMaximumDiscount",
          undefined,
          "Maximum customer discount must be between 0 and 100%."
        )
      );
      return;
    }

    if (form.create_login) {
      const loginEmail = form.login_email.trim() || form.email.trim();

      if (!loginEmail) {
        setError(t("sellers.errors.loginEmailRequired"));
        return;
      }

      if (!isValidEmail(loginEmail)) {
        setError(t("sellers.errors.invalidLoginEmail"));
        return;
      }

      if (!form.login_password.trim() && !editingSeller) {
        setError(t("sellers.errors.loginPasswordRequired"));
        return;
      }
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const formData = formToFormData(form, photoFile);
      const requestBody = photoFile
        ? formData
        : {
            ...Object.fromEntries(formData.entries()),
            assigned_products: form.assigned_products,
          };

      let response = editingSeller
        ? await api.patch(`/ticketing/sellers/${editingSeller.id}/`, requestBody, {
            params: requestParams,
          })
        : await api.post("/ticketing/sellers/", requestBody, {
            params: requestParams,
          });

      // An empty many-to-many field cannot be represented by multipart data.
      // Confirm the clear with JSON when the same edit also uploads a photo.
      if (
        editingSeller &&
        photoFile &&
        form.assigned_products.length === 0
      ) {
        response = await api.patch(
          `/ticketing/sellers/${editingSeller.id}/`,
          { assigned_products: [] },
          { params: requestParams }
        );
      }

      const savedSeller = response.data as Seller;

      setSellers((current) => {
        if (editingSeller) {
          return current.map((seller) =>
            seller.id === savedSeller.id ? savedSeller : seller
          );
        }

        return [savedSeller, ...current];
      });

      setShowForm(false);
      setEditingSeller(null);
      setPhotoFile(null);
      setSavedMessage(editingSeller ? t("sellers.messages.updated") : t("sellers.messages.created"));
    } catch (err: any) {
      console.error("Could not save seller:", err);
      setError(getErrorMessage(err, t("sellers.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function toggleSellerStatus(seller: Seller) {
    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const response = await api.patch(
        `/ticketing/sellers/${seller.id}/`,
        { is_active: !seller.is_active },
        {
          params: requestParams,
        }
      );

      const updatedSeller = response.data as Seller;

      setSellers((current) =>
        current.map((item) => (item.id === seller.id ? updatedSeller : item))
      );

      setSelectedSeller((current) =>
        current?.id === seller.id ? updatedSeller : current
      );

      setSavedMessage(
        updatedSeller.is_active ? t("sellers.messages.activated") : t("sellers.messages.deactivated")
      );
    } catch (err: any) {
      console.error("Could not update seller status:", err);
      setError(getErrorMessage(err, t("sellers.errors.statusUpdate")));
    } finally {
      setSaving(false);
    }
  }

  async function copySellerLink(seller: Seller) {
    try {
      await navigator.clipboard.writeText(getSellerPublicUrl(organisationSlug, seller));
      setSavedMessage(t("sellers.messages.linkCopied"));
    } catch {
      setError(t("sellers.errors.copyLink"));
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("sellers.title")}
        subtitle={t("sellers.subtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("sellers.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("sellers.title")}
      subtitle={t("sellers.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <StatCard
            title={t("sellers.stats.total")}
            value={String(stats.total)}
            helper={t("sellers.stats.allProfiles")}
            icon={<Users className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title={t("sellers.stats.active")}
            value={String(stats.active)}
            helper={t("sellers.stats.canSell")}
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("sellers.stats.dashboardAccess")}
            value={String(stats.withDashboard)}
            helper={t("sellers.stats.portalUsers")}
            icon={<ShieldCheck className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("sellers.stats.grossSales")}
            value={formatMoney(stats.totalSales, language)}
            helper={t("sellers.stats.trackedSales")}
            icon={<BadgeDollarSign className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title={t("sellers.stats.sellerEarned")}
            value={formatMoney(stats.totalCommission, language)}
            helper={t("sellers.stats.commissionGenerated")}
            icon={<Wallet className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("sellers.stats.owedToCompany")}
            value={formatMoney(stats.owedToCompany, language)}
            helper={t("sellers.stats.pendingSettlement")}
            icon={<BadgeDollarSign className="h-6 w-6 text-red-600" />}
          />
          <StatCard
            title={t("sellers.stats.ownerPending")}
            value={formatMoney(stats.ownerPending, language)}
            helper={t("sellers.stats.notReceived")}
            icon={<CreditCard className="h-6 w-6 text-amber-600" />}
          />
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {savedMessage && (
          <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            {savedMessage}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <h2 className="text-lg font-black text-slate-950">
                {t("sellers.management.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {t("sellers.management.subtitle")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSellers}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                {t("sellers.actions.refresh")}
              </button>

              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                {t("sellers.actions.new")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("sellers.filters.searchPlaceholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">{t("sellers.filters.allRoles")}</option>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {t(`sellers.roles.${String(role.value).toLowerCase()}`)}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">{t("sellers.filters.allStatuses")}</option>
              <option value="active">{t("sellers.status.active")}</option>
              <option value="inactive">{t("sellers.status.inactive")}</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredSellers.length === 0 ? (
              <EmptyState text={t("sellers.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("sellers.table.seller")}</Th>
                      <Th>{t("sellers.table.access")}</Th>
                      <Th>{t("sellers.table.grossSales")}</Th>
                      <Th>{t("sellers.table.sellerEarned")}</Th>
                      <Th>{t("sellers.table.owedToCompany")}</Th>
                      <Th>{t("sellers.table.ownerPending")}</Th>
                      <Th>{t("sellers.table.status")}</Th>
                      <Th>{t("sellers.table.actions")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredSellers.map((seller) => (
                      <tr key={seller.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <SellerAvatar seller={seller} />
                            <div>
                              <p className="font-black text-slate-950">
                                {seller.full_name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                {seller.email || seller.whatsapp || seller.phone || t("sellers.fallbacks.noContact")}
                              </p>
                            </div>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {roleLabel(seller.role, t)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {seller.can_access_dashboard
                                ? t("sellers.access.portal")
                                : t("sellers.access.noPortal")}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(seller.total_sales_amount, language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("sellers.labels.collected")}: {formatMoney(getSellerCollectedAmount(seller), language)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(seller.total_commission_amount, language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("sellers.labels.marginAllowance")}: {formatPercent(getSellerMarginPercent(seller), language)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className={[
                              "font-black",
                              getSellerOwedToCompany(seller) > 0 ? "text-red-700" : "text-slate-950",
                            ].join(" ")}>
                              {formatMoney(getSellerOwedToCompany(seller), language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("sellers.stats.pendingSettlement")}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className={[
                              "font-black",
                              getSellerOwnerPending(seller) > 0
                                ? "text-amber-700"
                                : "text-slate-950",
                            ].join(" ")}>
                              {formatMoney(getSellerOwnerPending(seller), language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("sellers.stats.stillNotReceived")}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <StatusBadge active={seller.is_active} />
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedSeller(seller)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              {t("sellers.actions.view")}
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditForm(seller)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              {t("sellers.actions.edit")}
                            </button>

                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => toggleSellerStatus(seller)}
                              className={[
                                "inline-flex h-10 items-center justify-center gap-2 rounded-2xl px-3 text-xs font-black text-white transition disabled:opacity-60",
                                seller.is_active
                                  ? "bg-red-600 hover:bg-red-700"
                                  : "bg-emerald-600 hover:bg-emerald-700",
                              ].join(" ")}
                            >
                              {seller.is_active ? (
                                <ToggleLeft className="h-4 w-4" />
                              ) : (
                                <ToggleRight className="h-4 w-4" />
                              )}
                              {seller.is_active ? t("sellers.actions.deactivate") : t("sellers.actions.activate")}
                            </button>
                          </div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>

      {showForm && (
        <SellerFormModal
          form={form}
          editingSeller={editingSeller}
          organisationSlug={organisationSlug}
          products={sellerProducts}
          photoFile={photoFile}
          saving={saving}
          onClose={() => {
            setShowForm(false);
            setEditingSeller(null);
            setPhotoFile(null);
          }}
          onPhotoChange={setPhotoFile}
          onChange={updateForm}
          onSave={saveSeller}
        />
      )}

      {selectedSeller && (
        <SellerDetailModal
          seller={selectedSeller}
          organisationSlug={organisationSlug}
          onClose={() => setSelectedSeller(null)}
          onEdit={() => openEditForm(selectedSeller)}
          onCopyLink={() => copySellerLink(selectedSeller)}
          onToggleStatus={() => toggleSellerStatus(selectedSeller)}
          saving={saving}
        />
      )}
    </TicketingPageShell>
  );
}


function SellerCommissionRulesSection({
  seller,
  organisationSlug,
}: {
  seller: Seller;
  organisationSlug: string;
}) {
  const { language, t } = useTicketingAdminTranslation();

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const [rules, setRules] = useState<SellerProductCommissionRule[]>([]);
  const [products, setProducts] = useState<CommissionProduct[]>([]);
  const [liveOptions, setLiveOptions] = useState<CommissionLiveOption[]>([]);
  const [ruleForm, setRuleForm] = useState<CommissionRuleFormState>({
    ...blankCommissionRuleForm,
  });

  const [loadingRules, setLoadingRules] = useState(true);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [ruleError, setRuleError] = useState("");
  const [ruleMessage, setRuleMessage] = useState("");

  const selectedProduct = useMemo(
    () =>
      products.find(
        (product) => String(product.id) === String(ruleForm.product_id)
      ) || null,
    [products, ruleForm.product_id]
  );

  const productPackages = useMemo(
    () =>
      (selectedProduct?.packages || []).filter(
        (item) => item.is_active !== false
      ),
    [selectedProduct]
  );

  const productEventTicketTypes = useMemo(
    () =>
      (selectedProduct?.event_ticket_types || []).filter(
        (item) => item.is_active !== false
      ),
    [selectedProduct]
  );

  const isExternalProduct = Boolean(
    selectedProduct &&
      (selectedProduct.is_cocobongo_product ||
        selectedProduct.external_provider === "wellet")
  );

  async function loadCommissionRules() {
    try {
      setLoadingRules(true);
      setRuleError("");

      const [rulesResponse, productsResponse] = await Promise.all([
        api.get("/ticketing/seller-commission-rules/", {
          params: {
            ...requestParams,
            seller: seller.id,
          },
        }),
        api.get("/ticketing/products/", {
          params: {
            ...requestParams,
            status: "active",
          },
        }),
      ]);

      setRules(
        normalizeList<SellerProductCommissionRule>(rulesResponse.data)
      );
      setProducts(normalizeList<CommissionProduct>(productsResponse.data));
    } catch (err: any) {
      console.error("Could not load seller commission rules:", err);
      setRuleError(
        getErrorMessage(
          err,
          t(
            "sellers.commissionRules.errors.load",
            undefined,
            "Could not load product commission rules."
          )
        )
      );
    } finally {
      setLoadingRules(false);
    }
  }

  useEffect(() => {
    void loadCommissionRules();
  }, [organisationSlug, seller.id]);

  function resetRuleForm(options?: { keepProduct?: boolean }) {
    setRuleForm((current) => ({
      ...blankCommissionRuleForm,
      product_id: options?.keepProduct ? current.product_id : "",
      service_date: current.service_date || localDateInputValue(),
    }));
    setLiveOptions([]);
  }

  function setRuleField<K extends keyof CommissionRuleFormState>(
    field: K,
    value: CommissionRuleFormState[K]
  ) {
    setRuleForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "product_id") {
        next.target_type = "product";
        next.package_id = "";
        next.event_ticket_type_id = "";
        next.external_option_id = "";
        next.external_option_name = "";
      }

      if (field === "target_type") {
        next.package_id = "";
        next.event_ticket_type_id = "";
        next.external_option_id = "";
        next.external_option_name = "";
      }

      if (field === "rule_type") {
        if (value === "fixed_amount") {
          next.percentage = "0.00";
        } else {
          next.fixed_amount = "0.00";
          next.is_per_unit = false;
        }
      }

      return next;
    });

    if (field === "product_id" || field === "target_type") {
      setLiveOptions([]);
    }
  }

  async function loadLiveOptions() {
    if (!ruleForm.product_id) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.selectProduct",
          undefined,
          "Select a product first."
        )
      );
      return;
    }

    try {
      setLoadingOptions(true);
      setRuleError("");
      setRuleMessage("");

      const response = await api.get("/ticketing/live-availability/", {
        params: {
          ...requestParams,
          product: ruleForm.product_id,
          service_date: ruleForm.service_date || undefined,
          include_raw: false,
        },
      });

      const optionMap = new Map<string, CommissionLiveOption>();

      normalizeList<CommissionLiveOption>(response.data?.options)
        .filter((option) => Boolean(getCommissionExternalOptionId(option)))
        .forEach((option) => {
          optionMap.set(getCommissionExternalOptionId(option), option);
        });

      const options = Array.from(optionMap.values());

      setLiveOptions(options);

      if (options.length === 0) {
        setRuleMessage(
          t(
            "sellers.commissionRules.messages.noExternalOptions",
            undefined,
            "No external options were returned for this date."
          )
        );
      }
    } catch (err: any) {
      console.error("Could not load live commission options:", err);
      setRuleError(
        getErrorMessage(
          err,
          t(
            "sellers.commissionRules.errors.loadOptions",
            undefined,
            "Could not load Coco Bongo options."
          )
        )
      );
    } finally {
      setLoadingOptions(false);
    }
  }

  function beginEditRule(rule: SellerProductCommissionRule) {
    const targetType: CommissionRuleTargetType =
      rule.target_type ||
      (rule.external_option_id
        ? "external_option"
        : rule.package
          ? "package"
          : rule.event_ticket_type
            ? "event_ticket_type"
            : "product");

    setRuleForm({
      id: rule.id,
      product_id: String(rule.product),
      target_type: targetType,
      package_id: rule.package ? String(rule.package) : "",
      event_ticket_type_id: rule.event_ticket_type
        ? String(rule.event_ticket_type)
        : "",
      external_option_id: String(rule.external_option_id || ""),
      external_option_name: String(rule.external_option_name || ""),
      service_date: localDateInputValue(),
      rule_type: rule.rule_type,
      fixed_amount: String(rule.fixed_amount ?? "0.00"),
      percentage: String(rule.percentage ?? "0.00"),
      currency: String(rule.currency || "USD").toUpperCase(),
      is_per_unit: Boolean(rule.is_per_unit),
      is_active: Boolean(rule.is_active),
    });

    setLiveOptions([]);
    setRuleError("");
    setRuleMessage("");
  }

  async function saveCommissionRule() {
    const productId = Number(ruleForm.product_id);

    if (!productId) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.selectProduct",
          undefined,
          "Select a product."
        )
      );
      return;
    }

    if (ruleForm.target_type === "package" && !ruleForm.package_id) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.selectPackage",
          undefined,
          "Select a package."
        )
      );
      return;
    }

    if (
      ruleForm.target_type === "event_ticket_type" &&
      !ruleForm.event_ticket_type_id
    ) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.selectEventTicket",
          undefined,
          "Select an event ticket type."
        )
      );
      return;
    }

    if (
      ruleForm.target_type === "external_option" &&
      !ruleForm.external_option_id.trim()
    ) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.selectExternalOption",
          undefined,
          "Load and select an external option."
        )
      );
      return;
    }

    const fixedAmount = Number(ruleForm.fixed_amount || 0);
    const percentage = Number(ruleForm.percentage || 0);

    if (
      ruleForm.rule_type === "fixed_amount" &&
      (!Number.isFinite(fixedAmount) || fixedAmount <= 0)
    ) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.invalidFixed",
          undefined,
          "Fixed amount must be greater than zero."
        )
      );
      return;
    }

    if (
      ruleForm.rule_type === "percentage" &&
      (!Number.isFinite(percentage) ||
        percentage <= 0 ||
        percentage > 100)
    ) {
      setRuleError(
        t(
          "sellers.commissionRules.errors.invalidPercentage",
          undefined,
          "Percentage must be greater than zero and no more than 100."
        )
      );
      return;
    }

    const payload = {
      seller: seller.id,
      product: productId,
      package:
        ruleForm.target_type === "package"
          ? Number(ruleForm.package_id)
          : null,
      event_ticket_type:
        ruleForm.target_type === "event_ticket_type"
          ? Number(ruleForm.event_ticket_type_id)
          : null,
      external_option_id:
        ruleForm.target_type === "external_option"
          ? ruleForm.external_option_id.trim()
          : "",
      external_option_name:
        ruleForm.target_type === "external_option"
          ? ruleForm.external_option_name.trim()
          : "",
      rule_type: ruleForm.rule_type,
      fixed_amount:
        ruleForm.rule_type === "fixed_amount"
          ? ruleForm.fixed_amount
          : "0.00",
      percentage:
        ruleForm.rule_type === "percentage"
          ? ruleForm.percentage
          : "0.00",
      currency: (ruleForm.currency || "USD").trim().toUpperCase(),
      is_per_unit:
        ruleForm.rule_type === "fixed_amount"
          ? ruleForm.is_per_unit
          : false,
      is_active: ruleForm.is_active,
    };

    try {
      setSavingRule(true);
      setRuleError("");
      setRuleMessage("");

      const response = ruleForm.id
        ? await api.patch(
            `/ticketing/seller-commission-rules/${ruleForm.id}/`,
            payload,
            { params: requestParams }
          )
        : await api.post(
            "/ticketing/seller-commission-rules/",
            payload,
            { params: requestParams }
          );

      const savedRule = response.data as SellerProductCommissionRule;

      setRules((current) => {
        const alreadyExists = current.some(
          (rule) => rule.id === savedRule.id
        );

        if (alreadyExists) {
          return current.map((rule) =>
            rule.id === savedRule.id ? savedRule : rule
          );
        }

        return [savedRule, ...current];
      });

      setRuleMessage(
        ruleForm.id
          ? t(
              "sellers.commissionRules.messages.updated",
              undefined,
              "Commission rule updated."
            )
          : t(
              "sellers.commissionRules.messages.created",
              undefined,
              "Commission rule created."
            )
      );

      resetRuleForm({ keepProduct: true });
    } catch (err: any) {
      console.error("Could not save seller commission rule:", err);
      setRuleError(
        getErrorMessage(
          err,
          t(
            "sellers.commissionRules.errors.save",
            undefined,
            "Could not save the commission rule."
          )
        )
      );
    } finally {
      setSavingRule(false);
    }
  }

  async function deleteCommissionRule(rule: SellerProductCommissionRule) {
    const confirmed = window.confirm(
      t(
        "sellers.commissionRules.confirmDelete",
        undefined,
        `Delete the commission rule for ${rule.target_name || rule.product_name || "this product"}?`
      )
    );

    if (!confirmed) return;

    try {
      setSavingRule(true);
      setRuleError("");
      setRuleMessage("");

      await api.delete(
        `/ticketing/seller-commission-rules/${rule.id}/`,
        { params: requestParams }
      );

      setRules((current) =>
        current.filter((item) => item.id !== rule.id)
      );

      if (ruleForm.id === rule.id) {
        resetRuleForm();
      }

      setRuleMessage(
        t(
          "sellers.commissionRules.messages.deleted",
          undefined,
          "Commission rule deleted."
        )
      );
    } catch (err: any) {
      console.error("Could not delete seller commission rule:", err);
      setRuleError(
        getErrorMessage(
          err,
          t(
            "sellers.commissionRules.errors.delete",
            undefined,
            "Could not delete the commission rule."
          )
        )
      );
    } finally {
      setSavingRule(false);
    }
  }

  const selectedExternalOptionIsMissing =
    Boolean(ruleForm.external_option_id) &&
    !liveOptions.some(
      (option) =>
        getCommissionExternalOptionId(option) ===
        ruleForm.external_option_id
    );

  return (
    <section className="rounded-3xl border border-slate-200 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
            {t(
              "sellers.commissionRules.title",
              undefined,
              "Product & package commissions"
            )}
          </h3>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {t(
              "sellers.commissionRules.subtitle",
              undefined,
              "Override the seller default for an entire product or an exact package, event ticket, or external Coco Bongo option."
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={loadCommissionRules}
          disabled={loadingRules || savingRule}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-60"
        >
          <RefreshCw
            className={[
              "h-4 w-4",
              loadingRules ? "animate-spin" : "",
            ].join(" ")}
          />
          {t("sellers.actions.refresh")}
        </button>
      </div>

      {ruleError && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {ruleError}
        </div>
      )}

      {ruleMessage && (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {ruleMessage}
        </div>
      )}

      <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t(
                "sellers.commissionRules.product",
                undefined,
                "Product"
              )}
            </span>
            <select
              value={ruleForm.product_id}
              onChange={(event) =>
                setRuleField("product_id", event.target.value)
              }
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none"
            >
              <option value="">
                {t(
                  "sellers.commissionRules.selectProduct",
                  undefined,
                  "Select a product"
                )}
              </option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t(
                "sellers.commissionRules.applyTo",
                undefined,
                "Apply rule to"
              )}
            </span>
            <select
              value={ruleForm.target_type}
              onChange={(event) =>
                setRuleField(
                  "target_type",
                  event.target.value as CommissionRuleTargetType
                )
              }
              disabled={!selectedProduct}
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none disabled:bg-slate-100 disabled:text-slate-400"
            >
              <option value="product">
                {t(
                  "sellers.commissionRules.entireProduct",
                  undefined,
                  "Entire product"
                )}
              </option>
              {productPackages.length > 0 && (
                <option value="package">
                  {t(
                    "sellers.commissionRules.localPackage",
                    undefined,
                    "Local package"
                  )}
                </option>
              )}
              {productEventTicketTypes.length > 0 && (
                <option value="event_ticket_type">
                  {t(
                    "sellers.commissionRules.eventTicketType",
                    undefined,
                    "Event ticket type"
                  )}
                </option>
              )}
              {isExternalProduct && (
                <option value="external_option">
                  {t(
                    "sellers.commissionRules.externalOption",
                    undefined,
                    "Coco Bongo / external option"
                  )}
                </option>
              )}
            </select>
          </label>

          {ruleForm.target_type === "package" && (
            <label className="block md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t(
                  "sellers.commissionRules.package",
                  undefined,
                  "Package"
                )}
              </span>
              <select
                value={ruleForm.package_id}
                onChange={(event) =>
                  setRuleField("package_id", event.target.value)
                }
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none"
              >
                <option value="">
                  {t(
                    "sellers.commissionRules.selectPackage",
                    undefined,
                    "Select a package"
                  )}
                </option>
                {productPackages.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {ruleForm.target_type === "event_ticket_type" && (
            <label className="block md:col-span-2">
              <span className="text-sm font-bold text-slate-700">
                {t(
                  "sellers.commissionRules.eventTicket",
                  undefined,
                  "Event ticket type"
                )}
              </span>
              <select
                value={ruleForm.event_ticket_type_id}
                onChange={(event) =>
                  setRuleField(
                    "event_ticket_type_id",
                    event.target.value
                  )
                }
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none"
              >
                <option value="">
                  {t(
                    "sellers.commissionRules.selectEventTicket",
                    undefined,
                    "Select an event ticket type"
                  )}
                </option>
                {productEventTicketTypes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {ruleForm.target_type === "external_option" && (
            <>
              <Input
                label={t(
                  "sellers.commissionRules.serviceDate",
                  undefined,
                  "Option date"
                )}
                type="date"
                value={ruleForm.service_date}
                onChange={(value) =>
                  setRuleField("service_date", value)
                }
              />

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={loadLiveOptions}
                  disabled={
                    !ruleForm.product_id ||
                    loadingOptions ||
                    savingRule
                  }
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
                >
                  {loadingOptions ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  {t(
                    "sellers.commissionRules.loadOptions",
                    undefined,
                    "Load external options"
                  )}
                </button>
              </div>

              <label className="block md:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  {t(
                    "sellers.commissionRules.externalOption",
                    undefined,
                    "Coco Bongo / external option"
                  )}
                </span>
                <select
                  value={ruleForm.external_option_id}
                  onChange={(event) => {
                    const optionId = event.target.value;
                    const option = liveOptions.find(
                      (item) =>
                        getCommissionExternalOptionId(item) === optionId
                    );

                    setRuleForm((current) => ({
                      ...current,
                      external_option_id: optionId,
                      external_option_name: option
                        ? getCommissionExternalOptionName(option)
                        : current.external_option_name,
                    }));
                  }}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none"
                >
                  <option value="">
                    {t(
                      "sellers.commissionRules.selectExternalOption",
                      undefined,
                      "Load and select an option"
                    )}
                  </option>

                  {selectedExternalOptionIsMissing && (
                    <option value={ruleForm.external_option_id}>
                      {ruleForm.external_option_name ||
                        ruleForm.external_option_id}{" "}
                      ({t(
                        "sellers.commissionRules.savedOption",
                        undefined,
                        "saved"
                      )})
                    </option>
                  )}

                  {liveOptions.map((option) => {
                    const optionId =
                      getCommissionExternalOptionId(option);
                    const optionName =
                      getCommissionExternalOptionName(option);
                    const price =
                      option.price !== undefined &&
                      option.price !== null &&
                      String(option.price) !== ""
                        ? ` · ${formatMoney(
                            option.price,
                            language,
                            option.currency === "USD"
                              ? "US$"
                              : option.currency || "US$"
                          )}`
                        : "";

                    return (
                      <option key={optionId} value={optionId}>
                        {optionName}
                        {price}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  {t(
                    "sellers.commissionRules.externalIdHelp",
                    undefined,
                    "The stable external option ID is saved; the customer never sees this commission rule."
                  )}
                </p>
              </label>
            </>
          )}

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t(
                "sellers.commissionRules.ruleType",
                undefined,
                "Commission type"
              )}
            </span>
            <select
              value={ruleForm.rule_type}
              onChange={(event) =>
                setRuleField(
                  "rule_type",
                  event.target.value as CommissionRuleType
                )
              }
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black outline-none"
            >
              <option value="fixed_amount">
                {t(
                  "sellers.commissionRules.fixedAmount",
                  undefined,
                  "Fixed amount"
                )}
              </option>
              <option value="percentage">
                {t(
                  "sellers.commissionRules.percentage",
                  undefined,
                  "Percentage"
                )}
              </option>
            </select>
          </label>

          {ruleForm.rule_type === "fixed_amount" ? (
            <Input
              label={t(
                "sellers.commissionRules.amount",
                undefined,
                "Fixed seller allowance"
              )}
              type="number"
              min={0}
              step="0.01"
              value={ruleForm.fixed_amount}
              onChange={(value) =>
                setRuleField("fixed_amount", value)
              }
              placeholder="20.00"
              icon={<Wallet className="h-4 w-4" />}
            />
          ) : (
            <Input
              label={t(
                "sellers.commissionRules.percentage",
                undefined,
                "Percentage"
              )}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={ruleForm.percentage}
              onChange={(value) =>
                setRuleField("percentage", value)
              }
              placeholder="15.00"
              icon={<BadgeDollarSign className="h-4 w-4" />}
            />
          )}

          <Input
            label={t(
              "sellers.commissionRules.currency",
              undefined,
              "Currency"
            )}
            value={ruleForm.currency}
            onChange={(value) =>
              setRuleField("currency", value.toUpperCase())
            }
            placeholder="USD"
          />

          {ruleForm.rule_type === "fixed_amount" && (
            <Toggle
              label={t(
                "sellers.commissionRules.perUnit",
                undefined,
                "Apply fixed amount per ticket/unit"
              )}
              checked={ruleForm.is_per_unit}
              onChange={(value) =>
                setRuleField("is_per_unit", value)
              }
            />
          )}

          <Toggle
            label={t(
              "sellers.commissionRules.active",
              undefined,
              "Active rule"
            )}
            checked={ruleForm.is_active}
            onChange={(value) =>
              setRuleField("is_active", value)
            }
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={saveCommissionRule}
            disabled={savingRule || loadingRules}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white disabled:opacity-60"
          >
            {savingRule ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            {ruleForm.id
              ? t(
                  "sellers.commissionRules.updateRule",
                  undefined,
                  "Update rule"
                )
              : t(
                  "sellers.commissionRules.addRule",
                  undefined,
                  "Add commission rule"
                )}
          </button>

          {ruleForm.id && (
            <button
              type="button"
              onClick={() => resetRuleForm()}
              disabled={savingRule}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 disabled:opacity-60"
            >
              <X className="h-4 w-4" />
              {t("sellers.actions.cancel")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-black text-slate-950">
            {t(
              "sellers.commissionRules.currentRules",
              undefined,
              "Current rules"
            )}
          </h4>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
            {rules.length}
          </span>
        </div>

        {loadingRules ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t(
              "sellers.commissionRules.loading",
              undefined,
              "Loading commission rules..."
            )}
          </div>
        ) : rules.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              text={t(
                "sellers.commissionRules.empty",
                undefined,
                "No product-specific rules have been configured. The seller default remains active."
              )}
            />
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            {rules.map((rule) => {
              const isFixed = rule.rule_type === "fixed_amount";
              const target =
                rule.target_name ||
                rule.external_option_name ||
                rule.package_name ||
                rule.event_ticket_type_name ||
                rule.product_name ||
                "Product";

              return (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950">
                      {rule.product_name || "Product"} · {target}
                    </p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {isFixed
                        ? `${formatMoney(
                            rule.fixed_amount,
                            language,
                            rule.currency === "USD"
                              ? "US$"
                              : rule.currency || "US$"
                          )}${
                            rule.is_per_unit
                              ? ` ${t(
                                  "sellers.commissionRules.perTicketShort",
                                  undefined,
                                  "per ticket"
                                )}`
                              : ""
                          }`
                        : formatPercent(rule.percentage, language)}
                      {" · "}
                      {rule.is_active
                        ? t(
                            "sellers.status.active",
                            undefined,
                            "Active"
                          )
                        : t(
                            "sellers.status.inactive",
                            undefined,
                            "Inactive"
                          )}
                    </p>
                    {rule.external_option_id && (
                      <p className="mt-1 break-all text-[11px] font-semibold text-slate-400">
                        ID: {rule.external_option_id}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => beginEditRule(rule)}
                      disabled={savingRule}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 disabled:opacity-60"
                    >
                      <Edit3 className="h-4 w-4" />
                      {t("sellers.actions.edit")}
                    </button>

                    <button
                      type="button"
                      onClick={() => deleteCommissionRule(rule)}
                      disabled={savingRule}
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-red-600 px-3 text-xs font-black text-white disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t(
                        "sellers.actions.delete",
                        undefined,
                        "Delete"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function SellerFormModal({
  form,
  editingSeller,
  organisationSlug,
  products,
  photoFile,
  saving,
  onClose,
  onPhotoChange,
  onChange,
  onSave,
}: {
  form: SellerFormState;
  editingSeller: Seller | null;
  organisationSlug: string;
  products: CommissionProduct[];
  photoFile: File | null;
  saving: boolean;
  onClose: () => void;
  onPhotoChange: (file: File | null) => void;
  onChange: <K extends keyof SellerFormState>(
    field: K,
    value: SellerFormState[K]
  ) => void;
  onSave: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const photoPreview = photoFile
    ? URL.createObjectURL(photoFile)
    : editingSeller
      ? getSellerPhotoUrl(editingSeller)
      : "";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {editingSeller ? t("sellers.actions.editSeller") : t("sellers.actions.new")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {form.full_name || t("sellers.form.profile")}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {t("sellers.form.subtitle")}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {t("sellers.form.basicInformation")}
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label={t("sellers.form.fullName")}
                    value={form.full_name}
                    onChange={(value) => onChange("full_name", value)}
                    placeholder={t("sellers.form.sellerNamePlaceholder")}
                    required
                  />

                  <Input
                    label={t("sellers.form.sellerSlug")}
                    value={form.seller_slug}
                    onChange={(value) => onChange("seller_slug", slugify(value))}
                    placeholder="seller-public-slug"
                  />

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      {t("sellers.form.role")}
                    </span>
                    <select
                      value={form.role}
                      onChange={(event) =>
                        onChange("role", event.target.value as SellerRole)
                      }
                      className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                    >
                      {roleOptions.map((role) => (
                        <option key={role.value} value={role.value}>
                          {t(`sellers.roles.${String(role.value).toLowerCase()}`)}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      {t(`sellers.roles.${String(form.role).toLowerCase()}Help`, undefined, roleOptions.find((role) => role.value === form.role)?.helper)}
                    </p>
                  </label>

                  <Toggle
                    label={t("sellers.form.activeSeller")}
                    checked={form.is_active}
                    onChange={(value) => onChange("is_active", value)}
                  />

                  <Input
                    label={t("sellers.form.email")}
                    type="email"
                    value={form.email}
                    onChange={(value) => onChange("email", value)}
                    placeholder="seller@email.com"
                    icon={<Mail className="h-4 w-4" />}
                  />

                  <Input
                    label={t("sellers.form.phone")}
                    value={form.phone}
                    onChange={(value) => onChange("phone", value)}
                    placeholder="+1 809 000 0000"
                    icon={<Phone className="h-4 w-4" />}
                  />

                  <Input
                    label={t("sellers.form.whatsapp")}
                    value={form.whatsapp}
                    onChange={(value) => onChange("whatsapp", value)}
                    placeholder="+1 829 000 0000"
                    icon={<Phone className="h-4 w-4" />}
                  />

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-800">
                      {t("sellers.form.publicLink")}
                    </p>
                    <p className="mt-2 break-all text-xs font-bold leading-5 text-slate-500">
                      {`${window.location.origin}/experiences/${organisationSlug}/s/${
                        form.seller_slug || "seller-slug"
                      }`}
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {t("sellers.form.marginCommission")}
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label={t("sellers.form.marginAllowance")}
                    type="number"
                    value={form.commission_rate}
                    onChange={(value) => onChange("commission_rate", value)}
                    placeholder="15.00"
                    icon={<BadgeDollarSign className="h-4 w-4" />}
                  />

                  <Input
                    label={t("sellers.form.fixedCommission")}
                    type="number"
                    value={form.fixed_commission_amount}
                    onChange={(value) => onChange("fixed_commission_amount", value)}
                    placeholder="0.00"
                    icon={<Wallet className="h-4 w-4" />}
                  />

                  <div className="md:col-span-2">
                    <Input
                      label={t(
                        "sellers.form.maximumCustomerDiscount",
                        undefined,
                        "Maximum customer discount (%)"
                      )}
                      type="number"
                      value={form.max_customer_discount_percent}
                      onChange={(value) =>
                        onChange("max_customer_discount_percent", value)
                      }
                      placeholder="10.00"
                      icon={<BadgeDollarSign className="h-4 w-4" />}
                      min={0}
                      max={100}
                      step="0.01"
                      disabled={!form.can_apply_discounts}
                    />
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      {form.can_apply_discounts
                        ? t(
                            "sellers.form.maximumCustomerDiscountHelp",
                            undefined,
                            "The seller cannot discount a booking above this percentage. The product limit may reduce it further."
                          )
                        : t(
                            "sellers.form.enableDiscountPermissionHelp",
                            undefined,
                            "Enable Apply discounts in Permissions to configure this limit."
                          )}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                  {t("sellers.form.marginHelp")}
                </p>
              </section>

              <section className="rounded-3xl border border-slate-200 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {t(
                    "sellers.form.assignedProducts",
                    undefined,
                    "Assigned products"
                  )}
                </h3>
                <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                  {t(
                    "sellers.form.assignedProductsHelp",
                    undefined,
                    "No selection means all products permitted by the seller's sales permissions."
                  )}
                </p>

                <div className="mt-4 grid max-h-64 gap-2 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 md:grid-cols-2 xl:grid-cols-3">
                  {products.map((product) => {
                    const checked = form.assigned_products.includes(product.id);

                    return (
                      <label
                        key={product.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-3 py-3 text-sm font-bold text-slate-700 shadow-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            onChange(
                              "assigned_products",
                              checked
                                ? form.assigned_products.filter(
                                    (productId) => productId !== product.id
                                  )
                                : [...form.assigned_products, product.id]
                            )
                          }
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="min-w-0 truncate">{product.name}</span>
                      </label>
                    );
                  })}

                  {products.length === 0 && (
                    <p className="px-2 py-3 text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">
                      {t(
                        "sellers.form.noAssignableProducts",
                        undefined,
                        "No active seller products are available."
                      )}
                    </p>
                  )}
                </div>
              </section>

              {editingSeller ? (
                <SellerCommissionRulesSection
                  seller={editingSeller}
                  organisationSlug={organisationSlug}
                />
              ) : (
                <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <h3 className="text-sm font-black uppercase tracking-wide text-amber-800">
                    {t(
                      "sellers.commissionRules.title",
                      undefined,
                      "Product & package commissions"
                    )}
                  </h3>
                  <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                    {t(
                      "sellers.commissionRules.saveSellerFirst",
                      undefined,
                      "Create this seller first. Then open Edit to assign exact product, package, event-ticket, or Coco Bongo option commissions."
                    )}
                  </p>
                </section>
              )}

              <section className="rounded-3xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                      {t("sellers.form.loginAccess")}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      {t("sellers.form.loginHelp")}
                    </p>
                  </div>

                  <Toggle
                    label={t("sellers.form.createLogin")}
                    checked={form.create_login}
                    onChange={(value) => onChange("create_login", value)}
                  />
                </div>

                {form.create_login && (
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Input
                      label={t("sellers.form.username")}
                      value={form.login_username}
                      onChange={(value) => onChange("login_username", value)}
                      placeholder="seller.username"
                      icon={<UserRound className="h-4 w-4" />}
                    />

                    <Input
                      label={t("sellers.form.loginEmail")}
                      type="email"
                      value={form.login_email}
                      onChange={(value) => onChange("login_email", value)}
                      placeholder="seller@email.com"
                      icon={<Mail className="h-4 w-4" />}
                    />

                    <Input
                      label={t("sellers.form.password")}
                      type="password"
                      value={form.login_password}
                      onChange={(value) => onChange("login_password", value)}
                      placeholder={editingSeller ? t("sellers.form.leaveBlank") : t("sellers.form.temporaryPassword")}
                      icon={<KeyRound className="h-4 w-4" />}
                    />
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                      {t("sellers.form.permissions")}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Configura exactamente lo que este vendedor podrá hacer.
                      Pulsa el botón <span className="font-black text-amber-700">?</span>{" "}
                      de cualquier permiso para ver una explicación en español,
                      un ejemplo real, sus límites y el nivel de riesgo.
                    </p>
                  </div>

                  <Toggle
                    label={t("sellers.form.applyRoleDefaults")}
                    checked={form.apply_role_defaults}
                    onChange={(value) => onChange("apply_role_defaults", value)}
                  />
                </div>

                <div className="mt-5 space-y-5">
                  {permissionGroups.map((group) => (
                    <PermissionGroupCard
                      key={t(`sellers.permissionGroups.${group.title.toLowerCase().replaceAll(" & ", "_").replaceAll(" ", "_")}.title`, undefined, group.title)}
                      group={group}
                      form={form}
                      onChange={onChange}
                    />
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-3xl border border-slate-200 p-4">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                  {t("sellers.form.photo")}
                </h3>

                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  <div className="flex h-56 items-center justify-center">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt={t("sellers.form.photoAlt")}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-slate-400">
                        <ImageIcon className="mx-auto h-10 w-10" />
                        <p className="mt-2 text-sm font-bold">{t("sellers.form.noPhoto")}</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 p-4">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                      <Upload className="h-4 w-4" />
                      {t("sellers.form.uploadPhoto")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                          onPhotoChange(event.target.files?.[0] || null)
                        }
                      />
                    </label>

                    {photoFile && (
                      <button
                        type="button"
                        onClick={() => onPhotoChange(null)}
                        className="ml-2 h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                      >
                        {t("sellers.actions.clear")}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-black text-amber-900">
                  {t("sellers.form.importantPermission")}
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                  {t("sellers.form.importantPermissionHelp")}
                </p>
              </section>

              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                className="inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {editingSeller ? t("sellers.actions.save") : t("sellers.actions.create")}
              </button>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function SellerDetailModal({
  seller,
  organisationSlug,
  onClose,
  onEdit,
  onCopyLink,
  onToggleStatus,
  saving,
}: {
  seller: Seller;
  organisationSlug: string;
  onClose: () => void;
  onEdit: () => void;
  onCopyLink: () => void;
  onToggleStatus: () => void;
  saving: boolean;
}) {
  const { language, t } = useTicketingAdminTranslation();
  const activePermissions = permissionKeys.filter(
    (key) => Boolean(seller[key] ?? seller.permissions?.[key])
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div className="flex items-center gap-4">
            <SellerAvatar seller={seller} large />
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                {t("sellers.detail.title")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {seller.full_name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {roleLabel(seller.role, t)} · {seller.email || seller.whatsapp || seller.phone || t("sellers.fallbacks.noContact")}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-[calc(92vh-92px)] overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white"
            >
              <Edit3 className="h-4 w-4" />
              {t("sellers.actions.edit")}
            </button>

            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <Copy className="h-4 w-4" />
              {t("sellers.actions.copyPublicLink")}
            </button>

            <Link
              to={`/experiences/${organisationSlug}${seller.public_path || `/s/${seller.seller_slug}`}`}
              target="_blank"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              {t("sellers.actions.openPublicLink")}
            </Link>

            <button
              type="button"
              disabled={saving}
              onClick={onToggleStatus}
              className={[
                "inline-flex h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-black text-white disabled:opacity-60",
                seller.is_active ? "bg-red-600" : "bg-emerald-600",
              ].join(" ")}
            >
              {seller.is_active ? (
                <ToggleLeft className="h-4 w-4" />
              ) : (
                <ToggleRight className="h-4 w-4" />
              )}
              {seller.is_active ? t("sellers.actions.deactivate") : t("sellers.actions.activate")}
            </button>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-5">
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label={t("sellers.stats.grossSales")}
              value={formatMoney(seller.total_sales_amount, language)}
              helper={t("sellers.detail.totalSellerSales")}
            />
            <InfoCard
              icon={<Wallet className="h-5 w-5" />}
              label={t("sellers.stats.sellerEarned")}
              value={formatMoney(seller.total_commission_amount, language)}
              helper={`${formatPercent(getSellerMarginPercent(seller), language)} margin allowance`}
            />
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label={t("sellers.labels.collected")}
              value={formatMoney(getSellerCollectedAmount(seller), language)}
              helper={t("sellers.detail.moneyCollected")}
            />
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label={t("sellers.stats.owedToCompany")}
              value={formatMoney(getSellerOwedToCompany(seller), language)}
              helper={t("sellers.stats.pendingSettlement")}
            />
            <InfoCard
              icon={<CreditCard className="h-5 w-5" />}
              label={t("sellers.stats.ownerPending")}
              value={formatMoney(getSellerOwnerPending(seller), language)}
              helper={t("sellers.stats.notReceived")}
            />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("sellers.detail.publicLoginAccess")}
            </h3>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <InfoLine label={t("sellers.form.sellerSlug")} value={seller.seller_slug} />
              <InfoLine label={t("sellers.detail.publicPath")} value={seller.public_path || `/s/${seller.seller_slug}`} />
              <InfoLine label={t("sellers.detail.loginUser")} value={seller.username || seller.user_email || t("sellers.detail.noLoginUser")} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="break-all text-sm font-bold leading-6 text-slate-600">
                  {getSellerPublicUrl(organisationSlug, seller)}
                </p>
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-amber-800">
              {t("sellers.detail.settlementSummary")}
            </h3>

            <div className="mt-4 grid gap-3 lg:grid-cols-5">
              <InfoLine label={t("sellers.stats.grossSales")} value={formatMoney(seller.total_sales_amount, language)} />
              <InfoLine label={t("sellers.detail.sellerCollected")} value={formatMoney(getSellerCollectedAmount(seller), language)} />
              <InfoLine label={t("sellers.stats.sellerEarned")} value={formatMoney(seller.total_commission_amount, language)} />
              <InfoLine label={t("sellers.stats.owedToCompany")} value={formatMoney(getSellerOwedToCompany(seller), language)} />
              <InfoLine label={t("sellers.stats.ownerPending")} value={formatMoney(getSellerOwnerPending(seller), language)} />
            </div>

            <p className="mt-3 text-sm font-semibold leading-6 text-amber-800">
              {t("sellers.detail.settlementHelp")}
            </p>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("sellers.detail.activePermissions")}
            </h3>

            {activePermissions.length === 0 ? (
              <EmptyState text={t("sellers.detail.noActivePermissions")} />
            ) : (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activePermissions.map((key) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"
                  >
                    {t(`sellers.permissions.${key}`, undefined, permissionLabels[key])}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function PermissionGroupCard({
  group,
  form,
  onChange,
}: {
  group: PermissionGroup;
  form: SellerFormState;
  onChange: <K extends keyof SellerFormState>(
    field: K,
    value: SellerFormState[K]
  ) => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const [helpPermissionKey, setHelpPermissionKey] =
    useState<PermissionKey | null>(null);
  const enabledCount = group.keys.filter((key) => form[key]).length;

  const activeHelp = helpPermissionKey
    ? getSellerPermissionHelp(helpPermissionKey)
    : null;

  function setAll(value: boolean) {
    group.keys.forEach((key) => onChange(key, value));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h4 className="text-sm font-black text-slate-950">{t(`sellers.permissionGroups.${group.title.toLowerCase().replaceAll(" & ", "_").replaceAll(" ", "_")}.title`, undefined, group.title)}</h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {t(`sellers.permissionGroups.${group.title.toLowerCase().replaceAll(" & ", "_").replaceAll(" ", "_")}.description`, undefined, group.description)}
          </p>
          <p className="mt-1 text-xs font-black text-amber-700">
            {t("sellers.permissions.enabledCount", { enabled: enabledCount, total: group.keys.length })}
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            {t("sellers.permissions.enableAll")}
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            {t("sellers.permissions.disableAll")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {group.keys.map((key) => (
          <div
            key={key}
            className="grid grid-cols-[minmax(0,1fr)_48px] gap-2"
          >
            <Toggle
              label={t(
                `sellers.permissions.${key}`,
                undefined,
                permissionLabels[key]
              )}
              checked={Boolean(form[key])}
              onChange={(value) => onChange(key, value)}
            />

            <button
              type="button"
              onClick={() => setHelpPermissionKey(key)}
              className="flex min-h-12 items-center justify-center rounded-2xl border border-amber-200 bg-amber-50 text-lg font-black text-amber-800 transition hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              aria-label={`Explicar permiso: ${t(
                `sellers.permissions.${key}`,
                undefined,
                permissionLabels[key]
              )}`}
              title="Ver explicación y ejemplo real"
            >
              ?
            </button>
          </div>
        ))}
      </div>

      {activeHelp && (
        <SellerPermissionHelpModal
          permission={activeHelp}
          onClose={() => setHelpPermissionKey(null)}
        />
      )}
    </div>
  );
}

function SellerAvatar({
  seller,
  large = false,
}: {
  seller: Seller;
  large?: boolean;
}) {
  const photoUrl = getSellerPhotoUrl(seller);

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-amber-100 text-amber-700",
        large ? "h-16 w-16" : "h-11 w-11",
      ].join(" ")}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={seller.full_name}
          className="h-full w-full object-cover"
        />
      ) : (
        <UserRound className={large ? "h-8 w-8" : "h-5 w-5"} />
      )}
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useTicketingAdminTranslation();

  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-red-50 text-red-700 ring-red-200",
      ].join(" ")}
    >
      {active ? t("sellers.status.active") : t("sellers.status.inactive")}
    </span>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {icon}
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function InfoCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      {helper && (
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </div>
  );
}

function InfoLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 break-all text-sm font-black text-slate-950">
        {value || "—"}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
  required = false,
  min,
  max,
  step,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
  required?: boolean;
  min?: number;
  max?: number;
  step?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>

      <div
        className={[
          "mt-2 flex h-12 items-center gap-3 rounded-2xl border px-4",
          disabled
            ? "border-slate-200 bg-slate-100"
            : "border-slate-200 bg-slate-50 focus-within:border-amber-400 focus-within:bg-white",
        ].join(" ")}
      >
        {icon && <div className="text-slate-400">{icon}</div>}

        <input
          type={type}
          value={value}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none disabled:cursor-not-allowed disabled:text-slate-400"
        />
      </div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <span className="text-sm font-black text-slate-800">{label}</span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-amber-500"
      />
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
