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
  Upload,
  UserRound,
  Users,
  Wallet,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

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
  is_active: boolean;
  create_login: boolean;
  login_username: string;
  login_email: string;
  login_password: string;
  apply_role_defaults: boolean;
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
  is_active: true,
  create_login: false,
  login_username: "",
  login_email: "",
  login_password: "",
  apply_role_defaults: true,

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

function formatMoney(value?: string | number | null, symbol = "US$") {
  const number = Number(value || 0);

  return `${symbol} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value?: string | number | null) {
  const number = Number(value || 0);

  return `${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
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

function roleLabel(value?: string | null) {
  const option = roleOptions.find((item) => item.value === value);

  if (option) return option.label;

  return String(value || "Seller")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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
    is_active: Boolean(seller.is_active),
    create_login: false,
    login_username: "",
    login_email: seller.user_email || seller.email || "",
    login_password: "",
    apply_role_defaults: false,
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

  if (photoFile) {
    formData.append("photo", photoFile);
  }

  return formData;
}

export default function TicketingSellersPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [sellers, setSellers] = useState<Seller[]>([]);
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

      const response = await api.get("/ticketing/sellers/", {
        params: requestParams,
      });

      setSellers(normalizeList<Seller>(response.data));
    } catch (err: any) {
      console.error("Could not load sellers:", err);
      setError(getErrorMessage(err, "Could not load sellers."));
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

      return next;
    });
  }

  async function saveSeller() {
    if (!form.full_name.trim()) {
      setError("Seller name is required.");
      return;
    }

    if (form.email.trim() && !isValidEmail(form.email)) {
      setError("Email is optional, but if you enter one it must be valid. Example: seller@email.com");
      return;
    }

    if (form.create_login) {
      const loginEmail = form.login_email.trim() || form.email.trim();

      if (!loginEmail) {
        setError("Login email is required when creating seller login.");
        return;
      }

      if (!isValidEmail(loginEmail)) {
        setError("Login email must be valid. Example: seller@email.com");
        return;
      }

      if (!form.login_password.trim() && !editingSeller) {
        setError("Login password is required when creating seller login.");
        return;
      }
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const formData = formToFormData(form, photoFile);

      const response = editingSeller
        ? await api.patch(`/ticketing/sellers/${editingSeller.id}/`, formData, {
            params: requestParams,
          })
        : await api.post("/ticketing/sellers/", formData, {
            params: requestParams,
          });

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
      setSavedMessage(editingSeller ? "Seller updated." : "Seller created.");
    } catch (err: any) {
      console.error("Could not save seller:", err);
      setError(getErrorMessage(err, "Could not save seller."));
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
        updatedSeller.is_active ? "Seller activated." : "Seller deactivated."
      );
    } catch (err: any) {
      console.error("Could not update seller status:", err);
      setError(getErrorMessage(err, "Could not update seller status."));
    } finally {
      setSaving(false);
    }
  }

  async function copySellerLink(seller: Seller) {
    try {
      await navigator.clipboard.writeText(getSellerPublicUrl(organisationSlug, seller));
      setSavedMessage("Seller public link copied.");
    } catch {
      setError("Could not copy seller link.");
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Sellers"
        subtitle="Create sellers, manage seller margins, permissions, settlement balances and sales access."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading sellers...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Sellers"
      subtitle="Create sellers, manage seller margins, permissions, settlement balances and sales access."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <StatCard
            title="Total sellers"
            value={String(stats.total)}
            helper="All seller profiles"
            icon={<Users className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title="Active"
            value={String(stats.active)}
            helper="Can sell or access"
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Dashboard access"
            value={String(stats.withDashboard)}
            helper="Seller portal users"
            icon={<ShieldCheck className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Gross sales"
            value={formatMoney(stats.totalSales)}
            helper="Tracked seller sales"
            icon={<BadgeDollarSign className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title="Seller earned"
            value={formatMoney(stats.totalCommission)}
            helper="Commission generated"
            icon={<Wallet className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Owed to company"
            value={formatMoney(stats.owedToCompany)}
            helper="Pending settlement"
            icon={<BadgeDollarSign className="h-6 w-6 text-red-600" />}
          />
          <StatCard
            title="Owner pending"
            value={formatMoney(stats.ownerPending)}
            helper="Still not received by company"
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
                Seller management
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Create sellers, configure seller margin, login access, payment permissions and settlement control.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadSellers}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>

              <button
                type="button"
                onClick={openCreateForm}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                New seller
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_220px_180px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search seller, email, phone, slug..."
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All roles</option>
              {roleOptions.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredSellers.length === 0 ? (
              <EmptyState text="No sellers found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Seller</Th>
                      <Th>Access</Th>
                      <Th>Gross sales</Th>
                      <Th>Seller earned</Th>
                      <Th>Owed to company</Th>
                      <Th>Owner pending</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
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
                                {seller.email || seller.whatsapp || seller.phone || "No contact"}
                              </p>
                            </div>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {roleLabel(seller.role)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {seller.can_access_dashboard
                                ? "Seller portal access"
                                : "No seller portal access"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(seller.total_sales_amount)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Collected: {formatMoney(getSellerCollectedAmount(seller))}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(seller.total_commission_amount)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Margin allowance: {formatPercent(getSellerMarginPercent(seller))}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className={[
                              "font-black",
                              getSellerOwedToCompany(seller) > 0 ? "text-red-700" : "text-slate-950",
                            ].join(" ")}>
                              {formatMoney(getSellerOwedToCompany(seller))}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Pending settlement
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
                              {formatMoney(getSellerOwnerPending(seller))}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Still not received
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
                              View
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditForm(seller)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Edit3 className="h-4 w-4" />
                              Edit
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
                              {seller.is_active ? "Deactivate" : "Activate"}
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

function SellerFormModal({
  form,
  editingSeller,
  organisationSlug,
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
              {editingSeller ? "Edit seller" : "New seller"}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {form.full_name || "Seller profile"}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              Configure sales access, commission and payment permissions.
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
                  Basic information
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label="Full name"
                    value={form.full_name}
                    onChange={(value) => onChange("full_name", value)}
                    placeholder="Seller name"
                    required
                  />

                  <Input
                    label="Seller slug"
                    value={form.seller_slug}
                    onChange={(value) => onChange("seller_slug", slugify(value))}
                    placeholder="seller-public-slug"
                  />

                  <label className="block">
                    <span className="text-sm font-bold text-slate-700">
                      Role
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
                          {role.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
                      {roleOptions.find((role) => role.value === form.role)?.helper}
                    </p>
                  </label>

                  <Toggle
                    label="Active seller"
                    checked={form.is_active}
                    onChange={(value) => onChange("is_active", value)}
                  />

                  <Input
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(value) => onChange("email", value)}
                    placeholder="seller@email.com"
                    icon={<Mail className="h-4 w-4" />}
                  />

                  <Input
                    label="Phone"
                    value={form.phone}
                    onChange={(value) => onChange("phone", value)}
                    placeholder="+1 809 000 0000"
                    icon={<Phone className="h-4 w-4" />}
                  />

                  <Input
                    label="WhatsApp"
                    value={form.whatsapp}
                    onChange={(value) => onChange("whatsapp", value)}
                    placeholder="+1 829 000 0000"
                    icon={<Phone className="h-4 w-4" />}
                  />

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-black text-slate-800">
                      Public seller link
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
                  Seller margin / commission
                </h3>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Input
                    label="Seller margin allowance (%)"
                    type="number"
                    value={form.commission_rate}
                    onChange={(value) => onChange("commission_rate", value)}
                    placeholder="15.00"
                    icon={<BadgeDollarSign className="h-4 w-4" />}
                  />

                  <Input
                    label="Fixed commission override"
                    type="number"
                    value={form.fixed_commission_amount}
                    onChange={(value) => onChange("fixed_commission_amount", value)}
                    placeholder="0.00"
                    icon={<Wallet className="h-4 w-4" />}
                  />
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                  Use the percentage as the seller margin allowance. The seller can give part of this allowance as a customer discount and keep the rest as commission. The backend finance engine remains the source of truth.
                </p>
              </section>

              <section className="rounded-3xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                      Login access
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Create a user login so the seller can access the seller dashboard.
                    </p>
                  </div>

                  <Toggle
                    label="Create login"
                    checked={form.create_login}
                    onChange={(value) => onChange("create_login", value)}
                  />
                </div>

                {form.create_login && (
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <Input
                      label="Username"
                      value={form.login_username}
                      onChange={(value) => onChange("login_username", value)}
                      placeholder="seller.username"
                      icon={<UserRound className="h-4 w-4" />}
                    />

                    <Input
                      label="Login email"
                      type="email"
                      value={form.login_email}
                      onChange={(value) => onChange("login_email", value)}
                      placeholder="seller@email.com"
                      icon={<Mail className="h-4 w-4" />}
                    />

                    <Input
                      label="Password"
                      type="password"
                      value={form.login_password}
                      onChange={(value) => onChange("login_password", value)}
                      placeholder={editingSeller ? "Leave blank to keep" : "Temporary password"}
                      icon={<KeyRound className="h-4 w-4" />}
                    />
                  </div>
                )}
              </section>

              <section className="rounded-3xl border border-slate-200 p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                      Permissions
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500">
                      Use role defaults or customize each permission manually.
                    </p>
                  </div>

                  <Toggle
                    label="Apply role defaults on save"
                    checked={form.apply_role_defaults}
                    onChange={(value) => onChange("apply_role_defaults", value)}
                  />
                </div>

                <div className="mt-5 space-y-5">
                  {permissionGroups.map((group) => (
                    <PermissionGroupCard
                      key={group.title}
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
                  Seller photo
                </h3>

                <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
                  <div className="flex h-56 items-center justify-center">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Seller"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="text-center text-slate-400">
                        <ImageIcon className="mx-auto h-10 w-10" />
                        <p className="mt-2 text-sm font-bold">No photo</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 p-4">
                    <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
                      <Upload className="h-4 w-4" />
                      Upload photo
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
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-black text-amber-900">
                  Important payment permission
                </h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                  Enable “Generate ticket without online customer payment” only
                  for trusted sellers. This lets them create a booking or ticket
                  without forcing the customer to pay online at checkout.
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
                {editingSeller ? "Save seller" : "Create seller"}
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
                Seller detail
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {seller.full_name}
              </h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {roleLabel(seller.role)} · {seller.email || seller.whatsapp || seller.phone || "No contact"}
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
              Edit
            </button>

            <button
              type="button"
              onClick={onCopyLink}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <Copy className="h-4 w-4" />
              Copy public link
            </button>

            <Link
              to={`/experiences/${organisationSlug}${seller.public_path || `/s/${seller.seller_slug}`}`}
              target="_blank"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              <ExternalLink className="h-4 w-4" />
              Open public link
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
              {seller.is_active ? "Deactivate" : "Activate"}
            </button>
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-5">
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label="Gross sales"
              value={formatMoney(seller.total_sales_amount)}
              helper="Total seller sales"
            />
            <InfoCard
              icon={<Wallet className="h-5 w-5" />}
              label="Seller earned"
              value={formatMoney(seller.total_commission_amount)}
              helper={`${formatPercent(getSellerMarginPercent(seller))} margin allowance`}
            />
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label="Collected"
              value={formatMoney(getSellerCollectedAmount(seller))}
              helper="Money collected by seller"
            />
            <InfoCard
              icon={<BadgeDollarSign className="h-5 w-5" />}
              label="Owed to company"
              value={formatMoney(getSellerOwedToCompany(seller))}
              helper="Pending settlement balance"
            />
            <InfoCard
              icon={<CreditCard className="h-5 w-5" />}
              label="Owner pending"
              value={formatMoney(getSellerOwnerPending(seller))}
              helper="Still not received by company"
            />
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Public and login access
            </h3>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <InfoLine label="Seller slug" value={seller.seller_slug} />
              <InfoLine label="Public path" value={seller.public_path || `/s/${seller.seller_slug}`} />
              <InfoLine label="Login user" value={seller.username || seller.user_email || "No login user"} />
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
              Settlement summary
            </h3>

            <div className="mt-4 grid gap-3 lg:grid-cols-5">
              <InfoLine label="Gross sales" value={formatMoney(seller.total_sales_amount)} />
              <InfoLine label="Seller collected" value={formatMoney(getSellerCollectedAmount(seller))} />
              <InfoLine label="Seller earned" value={formatMoney(seller.total_commission_amount)} />
              <InfoLine label="Owed to company" value={formatMoney(getSellerOwedToCompany(seller))} />
              <InfoLine label="Owner pending" value={formatMoney(getSellerOwnerPending(seller))} />
            </div>

            <p className="mt-3 text-sm font-semibold leading-6 text-amber-800">
              If the seller collected cash or offline payments, this balance shows what still needs to be settled with the company.
            </p>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              Active permissions
            </h3>

            {activePermissions.length === 0 ? (
              <EmptyState text="No active permissions." />
            ) : (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activePermissions.map((key) => (
                  <div
                    key={key}
                    className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700"
                  >
                    {permissionLabels[key]}
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
  const enabledCount = group.keys.filter((key) => form[key]).length;

  function setAll(value: boolean) {
    group.keys.forEach((key) => onChange(key, value));
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
        <div>
          <h4 className="text-sm font-black text-slate-950">{group.title}</h4>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
            {group.description}
          </p>
          <p className="mt-1 text-xs font-black text-amber-700">
            {enabledCount}/{group.keys.length} enabled
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            Enable all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700"
          >
            Disable all
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {group.keys.map((key) => (
          <Toggle
            key={key}
            label={permissionLabels[key]}
            checked={Boolean(form[key])}
            onChange={(value) => onChange(key, value)}
          />
        ))}
      </div>
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
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
        active
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-red-50 text-red-700 ring-red-200",
      ].join(" ")}
    >
      {active ? "Active" : "Inactive"}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-amber-400 focus-within:bg-white">
        {icon && <div className="text-slate-400">{icon}</div>}

        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
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
