import type {
  SellerPermissions,
  SellerApplicationStatus,
  SellerPayoutStatus,
} from "../types/ticketingTypes";

export type PermissionKey = keyof SellerPermissions;

export type PermissionGroup = {
  title: string;
  description: string;
  keys: PermissionKey[];
};

export const SELLER_PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: "Sales access",
    description: "Products, bookings and seller dashboard access.",
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
    title: "Payments and discounts",
    description: "Payment collection, deposits, discounts and payout requests.",
    keys: [
      "can_send_payment_links",
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
      "can_apply_discounts",
      "can_apply_customer_discount",
      "can_keep_commission_first",
      "can_mark_cash_collected",
      "can_request_payouts",
    ],
  },
  {
    title: "Visibility and communication",
    description: "Own sales, commissions and customer communication.",
    keys: [
      "can_view_own_sales",
      "can_view_own_commissions",
      "can_send_whatsapp",
      "can_send_email",
      "can_cancel_bookings",
      "can_override_pickup_time",
    ],
  },
  {
    title: "Management",
    description: "Administrative permissions for trusted staff.",
    keys: [
      "can_view_reports",
      "can_manage_products",
      "can_manage_sellers",
      "can_manage_settings",
      "can_manage_integrations",
    ],
  },
];

export const SELLER_PERMISSION_LABELS: Record<PermissionKey, string> = {
  can_access_dashboard: "Access seller dashboard",
  can_sell_cocobongo: "Sell Coco Bongo / Wellet",
  can_sell_excursions: "Sell excursions",
  can_sell_transfers: "Sell transfers",
  can_sell_events: "Sell events",
  can_sell_custom_tours: "Sell custom tours",
  can_create_bookings: "Create bookings",
  can_send_payment_links: "Send payment links",
  can_take_deposits: "Take deposits",
  can_take_full_payments: "Take full payments",
  can_collect_cash_payment: "Collect cash payments",
  can_generate_ticket_without_customer_online_payment:
    "Generate ticket without online payment",
  can_mark_customer_deposit_paid: "Mark customer deposit paid",
  can_mark_customer_full_paid: "Mark customer fully paid",
  can_pay_full_amount_as_seller: "Pay full amount as seller",
  can_pay_deposit_as_seller: "Pay deposit as seller",
  can_pay_commission_only: "Pay commission only",
  can_create_pending_payment_booking: "Create pending-payment bookings",
  can_request_supervisor_approval: "Request supervisor approval",
  can_send_receipt_before_full_payment: "Send receipt before full payment",
  can_view_own_sales: "View own sales",
  can_view_own_commissions: "View own commissions",
  can_apply_discounts: "Apply discounts",
  can_apply_customer_discount: "Apply customer discount",
  can_keep_commission_first: "Keep commission first",
  can_mark_cash_collected: "Mark cash collected",
  can_request_payouts: "Request commission payouts",
  can_cancel_bookings: "Cancel bookings",
  can_send_whatsapp: "Send WhatsApp messages",
  can_send_email: "Send emails",
  can_override_pickup_time: "Override pickup time",
  can_view_reports: "View reports",
  can_manage_products: "Manage products",
  can_manage_sellers: "Manage sellers",
  can_manage_settings: "Manage settings",
  can_manage_integrations: "Manage integrations",
};

export const DEFAULT_SELLER_PERMISSIONS: SellerPermissions = {
  can_access_dashboard: true,
  can_sell_cocobongo: false,
  can_sell_excursions: true,
  can_sell_transfers: true,
  can_sell_events: true,
  can_sell_custom_tours: true,
  can_create_bookings: true,
  can_send_payment_links: true,
  can_take_deposits: true,
  can_take_full_payments: true,
  can_collect_cash_payment: true,
  can_generate_ticket_without_customer_online_payment: false,
  can_mark_customer_deposit_paid: true,
  can_mark_customer_full_paid: false,
  can_pay_full_amount_as_seller: false,
  can_pay_deposit_as_seller: true,
  can_pay_commission_only: false,
  can_create_pending_payment_booking: true,
  can_request_supervisor_approval: true,
  can_send_receipt_before_full_payment: false,
  can_view_own_sales: true,
  can_view_own_commissions: true,
  can_apply_discounts: false,
  can_apply_customer_discount: false,
  can_keep_commission_first: false,
  can_mark_cash_collected: false,
  can_request_payouts: true,
  can_cancel_bookings: false,
  can_send_whatsapp: true,
  can_send_email: true,
  can_override_pickup_time: false,
  can_view_reports: false,
  can_manage_products: false,
  can_manage_sellers: false,
  can_manage_settings: false,
  can_manage_integrations: false,
};

export function normalizeList<T>(value: T[] | { results?: T[] } | unknown): T[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as { results?: T[] }).results)) {
    return (value as { results: T[] }).results;
  }
  return [];
}

export function getApiError(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;

  if (!data) {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  if (typeof data === "string") return data;

  if (typeof data === "object" && data !== null) {
    const record = data as Record<string, unknown>;

    for (const key of ["detail", "message", "error"]) {
      if (record[key]) return String(record[key]);
    }

    const firstEntry = Object.entries(record)[0];
    if (firstEntry) {
      const [key, value] = firstEntry;
      if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
      if (typeof value === "object" && value !== null) {
        return `${key}: ${JSON.stringify(value)}`;
      }
      return `${key}: ${String(value)}`;
    }
  }

  return fallback;
}

export function formatMoney(
  value: string | number | null | undefined,
  currency = "USD",
  language: "en" | "es" = "en",
): string {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(language === "es" ? "es-DO" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatDateTime(
  value: string | null | undefined,
  language: "en" | "es" = "en",
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "es" ? "es-DO" : "en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function humanize(value: string | null | undefined): string {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function statusClasses(
  status: SellerApplicationStatus | SellerPayoutStatus | string,
): string {
  switch (status) {
    case "approved":
    case "paid":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending":
    case "requested":
    case "under_review":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "needs_information":
    case "processing":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "rejected":
    case "cancelled":
    case "withdrawn":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-slate-200 bg-slate-50 text-slate-700";
  }
}
