// src/modules/ticketing/pages/TicketingBookingsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  CreditCard,
  Eye,
  Loader2,
  MapPin,
  Navigation,
  Plane,
  RefreshCw,
  Search,
  Ticket,
  User,
  Users,
  X,
} from "lucide-react";

import api from "../../../api/axios";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import TicketingPageShell from "../components/TicketingPageShell";

type BookingStatus =
  | "draft"
  | "pending"
  | "pending_payment"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show"
  | string;

type PaymentStatus =
  | "unpaid"
  | "pending"
  | "partial"
  | "deposit_paid"
  | "partially_paid"
  | "paid"
  | "refunded"
  | "cancelled"
  | string;

type BookingProductDetail = {
  id?: number;
  name?: string;
  slug?: string;
  product_type?: string;
};

type BookingPickupInfo = {
  id?: number;
  hotel_or_location_name?: string;
  pickup_location_name?: string;
  pickup_point?: string;
  pickup_time?: string;
  instructions?: string;
};

type BookingItem = {
  id?: number;
  product_name?: string;
  service_date?: string;
  service_time?: string;
  quantity?: number;
  unit_price?: string | number;
  line_total?: string | number;
  total?: string | number;
  instructions?: string | null;
};

type BookingPayment = {
  id?: number;
  amount?: string | number;
  payment_type?: string;
  payer_type?: string;
  method?: string;
  status?: string;
  reference?: string;
  paid_at?: string | null;
};

type Booking = {
  id: number;
  booking_code?: string;
  status?: BookingStatus;
  payment_status?: PaymentStatus;
  payment_mode?: string;
  payment_method?: string;
  source?: string;
  transfer_origin?: string | null;
  transfer_destination?: string | null;
  transfer_vehicle_type?: string | null;
  transfer_round_trip?: boolean | null;
  transfer_status?: string | null;
  service_date?: string | null;
  service_time?: string | null;

  customer_name?: string;
  customer_whatsapp?: string;
  customer_email?: string | null;
  customer_hotel?: string | null;
  customer_notes?: string | null;

  adults?: number;
  children?: number;
  infants?: number;
  total_guests?: number;

  subtotal_amount?: string | number;
  discount_amount?: string | number;
  tax_amount?: string | number;
  total_amount?: string | number;
  deposit_required?: string | number;
  deposit_paid?: string | number;
  balance_due?: string | number;

  primary_product?: number;
  primary_product_detail?: BookingProductDetail | null;
  product_name?: string;

  seller?: number | null;
  seller_name?: string | null;
  created_by_name?: string | null;

  pickup_info?: BookingPickupInfo | null;
  items?: BookingItem[];
  payments?: BookingPayment[];

  created_at?: string;
  updated_at?: string;
};

type StatusOption = {
  value: string;
  labelKey: string;
};

type Translate = (
  key: string,
  values?: Record<string, string | number | boolean | null | undefined>,
  fallback?: string,
) => string;

type PaymentMethod =
  | "cash"
  | "card"
  | "bank_transfer"
  | "stripe"
  | "paypal"
  | "other";

type CollectedByParty = "owner" | "seller";

type ReceivePaymentForm = {
  amount: string;
  method: PaymentMethod;
  collected_by_party: CollectedByParty;
  reference: string;
  note: string;
};

const bookingStatusOptions: StatusOption[] = [
  { value: "", labelKey: "bookings.filters.allStatuses" },
  { value: "pending", labelKey: "bookings.statuses.pending" },
  { value: "pending_payment", labelKey: "bookings.statuses.pending_payment" },
  { value: "confirmed", labelKey: "bookings.statuses.confirmed" },
  { value: "completed", labelKey: "bookings.statuses.completed" },
  { value: "cancelled", labelKey: "bookings.statuses.cancelled" },
  { value: "no_show", labelKey: "bookings.statuses.no_show" },
];

const paymentStatusOptions: StatusOption[] = [
  { value: "", labelKey: "bookings.filters.allPayments" },
  { value: "unpaid", labelKey: "bookings.paymentStatuses.unpaid" },
  { value: "pending", labelKey: "bookings.paymentStatuses.pending" },
  { value: "deposit_paid", labelKey: "bookings.paymentStatuses.deposit_paid" },
  { value: "partially_paid", labelKey: "bookings.paymentStatuses.partially_paid" },
  { value: "partial", labelKey: "bookings.paymentStatuses.partial" },
  { value: "paid", labelKey: "bookings.paymentStatuses.paid" },
  { value: "refunded", labelKey: "bookings.paymentStatuses.refunded" },
  { value: "cancelled", labelKey: "bookings.paymentStatuses.cancelled" },
];

const productTypeOptions: StatusOption[] = [
  { value: "", labelKey: "bookings.filters.allProducts" },
  { value: "transfer", labelKey: "bookings.productTypes.transfer" },
  { value: "excursion", labelKey: "bookings.productTypes.excursion" },
  { value: "ticket", labelKey: "bookings.productTypes.ticket" },
  { value: "event", labelKey: "bookings.productTypes.event" },
  { value: "nightlife", labelKey: "bookings.productTypes.nightlife" },
  { value: "custom", labelKey: "bookings.productTypes.custom" },
];

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

function formatDate(
  value?: string | null,
  language: "en" | "es" = "en",
) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(
    language === "es" ? "es-DO" : "en-US",
    {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    },
  );
}

function formatTime(value?: string | null) {
  if (!value) return "—";

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);

  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesRaw || "00"} ${suffix}`;
}

function statusLabel(
  value: string | null | undefined,
  t: Translate,
) {
  if (!value) return t("bookings.statuses.unknown");

  const normalized = String(value).toLowerCase();

  return t(
    `bookings.statuses.${normalized}`,
    undefined,
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

function getStatusClasses(status?: string | null) {
  const value = String(status || "").toLowerCase();

  if (["confirmed", "completed", "paid"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["pending", "pending_payment", "partial", "deposit_paid", "partially_paid"].includes(value)) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (["cancelled", "no_show", "refunded"].includes(value)) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function getProductName(booking: Booking, t?: Translate) {
  return (
    booking.primary_product_detail?.name ||
    booking.product_name ||
    booking.items?.[0]?.product_name ||
    t?.("bookings.fallbacks.experience") ||
    "Experience"
  );
}

function getProductType(booking: Booking) {
  return String(booking.primary_product_detail?.product_type || "").toLowerCase();
}

function isTransferBooking(booking: Booking) {
  return getProductType(booking) === "transfer" || Boolean(booking.transfer_origin || booking.transfer_destination);
}

function getBookingInstructions(booking: Booking) {
  return booking.items?.map((item) => item.instructions || "").filter(Boolean).join("\n") || "";
}

function getInstructionValue(booking: Booking, label: string) {
  const instructions = getBookingInstructions(booking);
  const line = instructions
    .split("\n")
    .find((item) => item.toLowerCase().startsWith(label.toLowerCase() + ":"));

  return line ? line.split(":").slice(1).join(":").trim() : "";
}

function getTransferOrigin(booking: Booking, t?: Translate) {
  return (
    booking.transfer_origin ||
    getInstructionValue(booking, "Route from") ||
    t?.("bookings.fallbacks.pickup") ||
    "Pickup"
  );
}

function getTransferDestination(booking: Booking, t?: Translate) {
  return (
    booking.transfer_destination ||
    getInstructionValue(booking, "Route to") ||
    t?.("bookings.fallbacks.dropoff") ||
    "Drop-off"
  );
}

function getTransferRouteLabel(booking: Booking, t?: Translate) {
  return `${getTransferOrigin(booking, t)} → ${getTransferDestination(booking, t)}`;
}

function getTransferVehicle(booking: Booking, t?: Translate) {
  return (
    booking.transfer_vehicle_type ||
    getInstructionValue(booking, "Vehicle") ||
    t?.("bookings.fallbacks.vehicleNotAssigned") ||
    "Vehicle not assigned"
  );
}

function getTransferPickup(booking: Booking) {
  return getInstructionValue(booking, "Pickup") || booking.customer_hotel || "—";
}

function getTransferPickupAddress(booking: Booking) {
  return getInstructionValue(booking, "Pickup address");
}

function getTransferPickupMap(booking: Booking) {
  return getInstructionValue(booking, "Pickup map");
}

function getTransferDropoff(booking: Booking, t?: Translate) {
  return (
    getInstructionValue(booking, "Drop-off") ||
    getTransferDestination(booking, t)
  );
}

function getTransferDropoffAddress(booking: Booking) {
  return getInstructionValue(booking, "Drop-off address");
}

function getTransferDropoffMap(booking: Booking) {
  return getInstructionValue(booking, "Drop-off map");
}

function getPickupHotel(booking: Booking) {
  if (isTransferBooking(booking)) {
    return getTransferPickup(booking);
  }

  return (
    booking.pickup_info?.hotel_or_location_name ||
    booking.pickup_info?.pickup_location_name ||
    booking.customer_hotel ||
    "—"
  );
}

function getPickupTime(booking: Booking) {
  return booking.pickup_info?.pickup_time || booking.service_time || null;
}

function getTotalGuests(booking: Booking) {
  if (typeof booking.total_guests === "number") return booking.total_guests;

  return Number(booking.adults || 0) + Number(booking.children || 0) + Number(booking.infants || 0);
}

export default function TicketingBookingsPage() {
  const { language, t } = useTicketingAdminTranslation();
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [paymentBooking, setPaymentBooking] = useState<Booking | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentForm, setPaymentForm] = useState<ReceivePaymentForm>({
    amount: "",
    method: "cash",
    collected_by_party: "owner",
    reference: "",
    note: "",
  });

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadBookings() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const response = await api.get("/ticketing/bookings/", {
        params: requestParams,
      });

      setBookings(normalizeList<Booking>(response.data));
    } catch (err: any) {
      console.error("Could not load bookings:", err);
      setError(getErrorMessage(err, t("bookings.errors.load")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
  }, [organisationSlug]);

  const stats = useMemo(() => {
    const pending = bookings.filter((booking) =>
      ["pending", "pending_payment"].includes(String(booking.status || ""))
    ).length;

    const confirmed = bookings.filter((booking) =>
      ["confirmed", "completed"].includes(String(booking.status || ""))
    ).length;

    const paid = bookings.filter((booking) => booking.payment_status === "paid").length;

    const balanceDue = bookings.reduce(
      (sum, booking) => sum + Number(booking.balance_due || 0),
      0
    );

    const transfers = bookings.filter(isTransferBooking).length;

    return {
      total: bookings.length,
      pending,
      confirmed,
      paid,
      transfers,
      balanceDue,
    };
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((booking) => {
      const searchText = [
        booking.booking_code,
        booking.customer_name,
        booking.customer_whatsapp,
        booking.customer_email,
        booking.customer_hotel,
        getProductName(booking, t),
        getPickupHotel(booking),
        getTransferRouteLabel(booking, t),
        getTransferVehicle(booking, t),
        getTransferDropoff(booking, t),
        booking.seller_name,
        booking.status,
        booking.payment_status,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (statusFilter && booking.status !== statusFilter) {
        return false;
      }

      if (paymentFilter && booking.payment_status !== paymentFilter) {
        return false;
      }

      if (typeFilter && getProductType(booking) !== typeFilter) {
        return false;
      }

      if (dateFilter && booking.service_date !== dateFilter) {
        return false;
      }

      return true;
    });
  }, [bookings, search, statusFilter, paymentFilter, typeFilter, dateFilter]);

  async function updateBooking(
    booking: Booking,
    payload: Partial<Pick<Booking, "status">>
  ) {
    try {
      setSavingId(booking.id);
      setError("");
      setSavedMessage("");

      /*
        Payment status is calculated by the backend finance engine from real
        payments. Do not PATCH payment_status from this page, because values
        like "paid" will be recalculated back to "deposit_paid" when only a
        deposit exists.

        For booking status changes, do not replace local state with the full
        backend serializer response. That response can be very large. We only
        merge the small payload we just changed.
      */
      await api.patch(`/ticketing/bookings/${booking.id}/`, payload, {
        params: requestParams,
      });

      const updatedBooking = {
        ...booking,
        ...payload,
        updated_at: new Date().toISOString(),
      } as Booking;

      setBookings((current) =>
        current.map((item) => (item.id === booking.id ? { ...item, ...updatedBooking } : item))
      );

      setSelectedBooking((current) =>
        current?.id === booking.id ? { ...current, ...updatedBooking } : current
      );

      setSavedMessage(t("bookings.messages.statusUpdated"));
    } catch (err: any) {
      console.error("Could not update booking:", err);
      setError(getErrorMessage(err, t("bookings.errors.update")));
    } finally {
      setSavingId(null);
    }
  }

  function openReceivePayment(booking: Booking) {
    const balance = Math.max(Number(booking.balance_due || 0), 0);

    setError("");
    setSavedMessage("");
    setPaymentBooking(booking);
    setPaymentForm({
      amount: balance.toFixed(2),
      method: "cash",
      collected_by_party: booking.seller ? "seller" : "owner",
      reference: "",
      note: t("bookings.payment.defaultFullNote"),
    });
  }

  function closeReceivePayment() {
    if (paymentSaving) return;

    setPaymentBooking(null);
    setPaymentForm({
      amount: "",
      method: "cash",
      collected_by_party: "owner",
      reference: "",
      note: "",
    });
  }

  async function receivePayment() {
    if (!paymentBooking) return;

    const amount = Number(paymentForm.amount);
    const balanceDue = Number(paymentBooking.balance_due || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t("bookings.errors.invalidPaymentAmount"));
      return;
    }

    if (amount > balanceDue + 0.01) {
      setError(
        t("bookings.errors.paymentExceedsBalance", { amount: formatMoney(balanceDue, language) }),
      );
      return;
    }

    if (
      paymentForm.collected_by_party === "seller" &&
      !paymentBooking.seller
    ) {
      setError(t("bookings.errors.noSellerAssigned"));
      return;
    }

    const isFullBalance = Math.abs(amount - balanceDue) < 0.01;

    try {
      setPaymentSaving(true);
      setSavingId(paymentBooking.id);
      setError("");
      setSavedMessage("");

      const payload: Record<string, unknown> = {
        amount: amount.toFixed(2),
        payment_type: isFullBalance ? "full" : "partial",
        payer_type: "customer",
        method: paymentForm.method,
        status: "confirmed",
        collected_by_party: paymentForm.collected_by_party,
        reference: paymentForm.reference.trim(),
        note:
          paymentForm.note.trim() ||
          (isFullBalance
            ? t("bookings.payment.defaultFullNote")
            : t("bookings.payment.defaultPartialNote")),
      };

      if (
        paymentForm.collected_by_party === "seller" &&
        paymentBooking.seller
      ) {
        payload.seller_id = paymentBooking.seller;
      }

      const response = await api.post(
        `/ticketing/bookings/${paymentBooking.id}/add-payment/`,
        payload,
        { params: requestParams },
      );

      const responseBooking =
        response.data?.booking ||
        response.data?.data?.booking ||
        response.data;

      let updatedBooking: Booking;

      if (
        responseBooking &&
        typeof responseBooking === "object" &&
        Number(responseBooking.id) === paymentBooking.id
      ) {
        updatedBooking = responseBooking as Booking;
      } else {
        const refreshed = await api.get(
          `/ticketing/bookings/${paymentBooking.id}/`,
          { params: requestParams },
        );
        updatedBooking = refreshed.data as Booking;
      }

      setBookings((current) =>
        current.map((item) =>
          item.id === updatedBooking.id ? updatedBooking : item,
        ),
      );

      setSelectedBooking((current) =>
        current?.id === updatedBooking.id ? updatedBooking : current,
      );

      setSavedMessage(
        Number(updatedBooking.balance_due || 0) <= 0
          ? t("bookings.messages.paymentFullyReceived")
          : t("bookings.messages.paymentReceivedBalance", {
              amount: formatMoney(updatedBooking.balance_due, language),
            }),
      );

      closeReceivePayment();
    } catch (err: any) {
      console.error("Could not receive payment:", err);
      setError(getErrorMessage(err, t("bookings.errors.recordPayment")));
    } finally {
      setPaymentSaving(false);
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("bookings.title")}
        subtitle={t("bookings.subtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("bookings.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("bookings.title")}
      subtitle={t("bookings.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            title={t("bookings.stats.total")}
            value={String(stats.total)}
            helper={t("bookings.stats.allBookings")}
            icon={<Ticket className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("bookings.stats.pending")}
            value={String(stats.pending)}
            helper={t("bookings.stats.needReview")}
            icon={<Clock3 className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("bookings.stats.confirmed")}
            value={String(stats.confirmed)}
            helper={t("bookings.stats.readyCompleted")}
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("bookings.stats.paid")}
            value={String(stats.paid)}
            helper={t("bookings.stats.paymentCompleted")}
            icon={<CreditCard className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("bookings.stats.transfers")}
            value={String(stats.transfers)}
            helper={t("bookings.stats.privateTransport")}
            icon={<Plane className="h-6 w-6 text-blue-600" />}
          />
          <StatCard
            title={t("bookings.stats.balanceDue")}
            value={formatMoney(stats.balanceDue, language)}
            helper={t("bookings.stats.pendingCollection")}
            icon={<CreditCard className="h-6 w-6 text-red-600" />}
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
                {t("bookings.list.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {t("bookings.list.subtitle")}
              </p>
            </div>

            <button
              type="button"
              onClick={loadBookings}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              {t("bookings.actions.refresh")}
            </button>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_190px_190px_170px_170px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("bookings.filters.searchPlaceholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              {bookingStatusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>

            <select
              value={paymentFilter}
              onChange={(event) => setPaymentFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              {paymentStatusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              {productTypeOptions.map((option) => (
                <option key={option.value || "all-types"} value={option.value}>
                  {t(option.labelKey)}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            />
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredBookings.length === 0 ? (
              <EmptyState text={t("bookings.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("bookings.table.booking")}</Th>
                      <Th>{t("bookings.table.customer")}</Th>
                      <Th>{t("bookings.table.productDate")}</Th>
                      <Th>{t("bookings.table.pickupRoute")}</Th>
                      <Th>{t("bookings.table.total")}</Th>
                      <Th>{t("bookings.table.status")}</Th>
                      <Th>{t("bookings.table.payment")}</Th>
                      <Th>{t("bookings.table.actions")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredBookings.map((booking) => (
                      <tr key={booking.id}>
                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {booking.booking_code || `#${booking.id}`}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {booking.source || "booking"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {booking.customer_name || t("bookings.fallbacks.noName")}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {booking.customer_whatsapp || booking.customer_email || t("bookings.fallbacks.noContact")}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {getProductName(booking, t)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {formatDate(booking.service_date, language)} · {getTotalGuests(booking)} {isTransferBooking(booking) ? t("bookings.guests.passengers") : t("bookings.guests.guests")}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            {isTransferBooking(booking) ? (
                              <>
                                <p className="font-black text-slate-900">
                                  {getTransferRouteLabel(booking, t)}
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                  {t("bookings.labels.pickup")}: {getTransferPickup(booking)} · {formatTime(getPickupTime(booking))}
                                </p>
                                <p className="mt-1 text-xs font-bold text-blue-600">
                                  {getTransferVehicle(booking, t)}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-black text-slate-900">
                                  {getPickupHotel(booking)}
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                  {formatTime(getPickupTime(booking))}
                                </p>
                              </>
                            )}
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {formatMoney(booking.total_amount, language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-emerald-600">
                              {t("bookings.labels.paid")}: {formatMoney(booking.deposit_paid, language)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("bookings.labels.balance")}: {formatMoney(booking.balance_due, language)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <select
                            value={booking.status || ""}
                            disabled={savingId === booking.id}
                            onChange={(event) =>
                              updateBooking(booking, { status: event.target.value })
                            }
                            className={`h-10 rounded-2xl px-3 text-xs font-black ring-1 outline-none ${getStatusClasses(booking.status)}`}
                          >
                            {bookingStatusOptions
                              .filter((option) => option.value)
                              .map((option) => (
                                <option key={option.value} value={option.value}>
                                  {t(option.labelKey)}
                                </option>
                              ))}
                          </select>
                        </Td>

                        <Td>
                          <span
                            className={`inline-flex h-10 items-center rounded-2xl px-3 text-xs font-black ring-1 ${getStatusClasses(booking.payment_status)}`}
                            title={t("bookings.tooltips.paymentStatusControlled")}
                          >
                            {statusLabel(booking.payment_status, t)}
                          </span>
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBooking(booking)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              {t("bookings.actions.view")}
                            </button>

                            {Number(booking.balance_due || 0) > 0 ? (
                              <button
                                type="button"
                                onClick={() => openReceivePayment(booking)}
                                disabled={savingId === booking.id}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Banknote className="h-4 w-4" />
                                {t("bookings.actions.receivePayment")}
                              </button>
                            ) : (
                              <span className="inline-flex h-10 items-center gap-2 rounded-2xl bg-emerald-50 px-3 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                                <CheckCircle2 className="h-4 w-4" />
                                {t("bookings.payment.fullyPaid")}
                              </span>
                            )}

                            {savingId === booking.id && (
                              <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                            )}
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

      {selectedBooking && (
        <BookingDetailModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onUpdate={updateBooking}
          onReceivePayment={openReceivePayment}
          saving={savingId === selectedBooking.id}
        />
      )}

      {paymentBooking && (
        <ReceivePaymentModal
          booking={paymentBooking}
          form={paymentForm}
          saving={paymentSaving}
          onChange={setPaymentForm}
          onClose={closeReceivePayment}
          onSubmit={receivePayment}
        />
      )}
    </TicketingPageShell>
  );
}

function BookingDetailModal({
  booking,
  onClose,
  onUpdate,
  onReceivePayment,
  saving,
}: {
  booking: Booking;
  onClose: () => void;
  onUpdate: (
    booking: Booking,
    payload: Partial<Pick<Booking, "status">>
  ) => void;
  onReceivePayment: (booking: Booking) => void;
  saving: boolean;
}) {
  const { language, t } = useTicketingAdminTranslation();
  const transferBooking = isTransferBooking(booking);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {t("bookings.detail.title")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {booking.booking_code || `#${booking.id}`}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {getProductName(booking, t)}
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
          <div className="grid gap-4 lg:grid-cols-3">
            <InfoCard
              icon={<User className="h-5 w-5" />}
              label={t("bookings.detail.customer")}
              value={booking.customer_name || "—"}
              helper={booking.customer_whatsapp || booking.customer_email || t("bookings.fallbacks.noContact")}
            />
            <InfoCard
              icon={<CalendarDays className="h-5 w-5" />}
              label={t("bookings.detail.serviceDate")}
              value={formatDate(booking.service_date, language)}
              helper={formatTime(booking.service_time)}
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label={transferBooking ? t("bookings.guests.passengers") : t("bookings.guests.guests")}
              value={t("bookings.guests.total", { count: getTotalGuests(booking) })}
              helper={t("bookings.guests.breakdown", { adults: booking.adults || 0, children: booking.children || 0, infants: booking.infants || 0 })}
            />
            {transferBooking ? (
              <>
                <InfoCard
                  icon={<Navigation className="h-5 w-5" />}
                  label={t("bookings.detail.transferRoute")}
                  value={getTransferRouteLabel(booking, t)}
                  helper={booking.transfer_round_trip ? t("bookings.transfer.roundTrip") : t("bookings.transfer.oneWay")}
                />
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label={t("bookings.labels.pickup")}
                  value={getTransferPickup(booking)}
                  helper={getTransferPickupAddress(booking) || t("bookings.fallbacks.pickupAddressMissing")}
                />
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label={t("bookings.labels.dropoff")}
                  value={getTransferDropoff(booking, t)}
                  helper={getTransferDropoffAddress(booking) || t("bookings.fallbacks.dropoffAddressMissing")}
                />
                <InfoCard
                  icon={<Plane className="h-5 w-5" />}
                  label={t("bookings.detail.vehicle")}
                  value={getTransferVehicle(booking, t)}
                  helper={statusLabel(booking.transfer_status || "advance_booking", t)}
                />
              </>
            ) : (
              <>
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label={t("bookings.detail.pickupHotel")}
                  value={getPickupHotel(booking)}
                  helper={booking.pickup_info?.pickup_point || t("bookings.fallbacks.pickupPointMissing")}
                />
                <InfoCard
                  icon={<Clock3 className="h-5 w-5" />}
                  label={t("bookings.detail.pickupTime")}
                  value={formatTime(getPickupTime(booking))}
                  helper={booking.pickup_info?.instructions || t("bookings.fallbacks.automaticPickup")}
                />
              </>
            )}
            <InfoCard
              icon={<CreditCard className="h-5 w-5" />}
              label={t("bookings.detail.totalBalance")}
              value={formatMoney(booking.total_amount, language)}
              helper={`${t("bookings.labels.balance")}: ${formatMoney(booking.balance_due, language)}`}
            />
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("bookings.detail.bookingStatus")}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-bold text-slate-700">
                    {t("bookings.table.status")}
                  </span>
                  <select
                    value={booking.status || ""}
                    disabled={saving}
                    onChange={(event) =>
                      onUpdate(booking, { status: event.target.value })
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {bookingStatusOptions
                      .filter((option) => option.value)
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold text-slate-700">
                    {t("bookings.detail.paymentStatus")}
                  </span>
                  <div
                    className={`mt-2 flex h-12 w-full items-center rounded-2xl px-4 text-sm font-black ring-1 ${getStatusClasses(booking.payment_status)}`}
                    title={t("bookings.tooltips.paymentStatusControlled")}
                  >
                    {statusLabel(booking.payment_status, t)}
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-500">
                    {t("bookings.tooltips.paymentStatusControlled")}
                  </p>
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("bookings.detail.paymentSummary")}
              </h3>

              <div className="mt-3 space-y-2 text-sm">
                <SummaryLine label={t("bookings.payment.subtotal")} value={formatMoney(booking.subtotal_amount, language)} />
                <SummaryLine label={t("bookings.table.total")} value={formatMoney(booking.total_amount, language)} />
                <SummaryLine label={t("bookings.payment.depositRequired")} value={formatMoney(booking.deposit_required, language)} />
                <SummaryLine label={t("bookings.labels.paid")} value={formatMoney(booking.deposit_paid, language)} />
                <SummaryLine label={t("bookings.stats.balanceDue")} value={formatMoney(booking.balance_due, language)} />
                <SummaryLine label={t("bookings.payment.mode")} value={statusLabel(booking.payment_mode, t)} />
              </div>

              {Number(booking.balance_due || 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => onReceivePayment(booking)}
                  disabled={saving}
                  className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Banknote className="h-5 w-5" />
                  {t("bookings.actions.receivePayment")}
                </button>
              ) : (
                <div className="mt-4 flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 text-sm font-black text-emerald-700 ring-1 ring-emerald-200">
                  <CheckCircle2 className="h-5 w-5" />
                  {t("bookings.payment.fullyPaid")}
                </div>
              )}
            </div>
          </section>

          {transferBooking && (
            <section className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-blue-700">
                {t("bookings.transfer.details")}
              </h3>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <TransferDetail label={t("bookings.transfer.route")} value={getTransferRouteLabel(booking, t)} />
                <TransferDetail label={t("bookings.transfer.preferredTime")} value={formatTime(getPickupTime(booking))} />
                <TransferDetail label={t("bookings.labels.pickup")} value={getTransferPickup(booking)} helper={getTransferPickupAddress(booking)} mapLink={getTransferPickupMap(booking)} />
                <TransferDetail label={t("bookings.labels.dropoff")} value={getTransferDropoff(booking, t)} helper={getTransferDropoffAddress(booking)} mapLink={getTransferDropoffMap(booking)} />
                <TransferDetail label={t("bookings.detail.vehicle")} value={getTransferVehicle(booking, t)} />
                <TransferDetail label={t("bookings.guests.passengers")} value={t("bookings.guests.total", { count: getTotalGuests(booking) })} />
              </div>
            </section>
          )}

          {booking.customer_notes && (
            <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("bookings.detail.customerNotes")}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                {booking.customer_notes}
              </p>
            </section>
          )}

          {booking.items && booking.items.length > 0 && (
            <section className="mt-5 rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("bookings.detail.items")}
              </h3>
              <div className="mt-3 space-y-2">
                {booking.items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 text-sm"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        {item.product_name || t("bookings.detail.itemNumber", { number: index + 1 })}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {t("bookings.detail.quantity")}: {item.quantity || 0} · {formatDate(item.service_date, language)}
                      </p>
                    </div>
                    <p className="font-black text-slate-950">
                      {formatMoney(item.line_total ?? item.total, language)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {booking.payments && booking.payments.length > 0 && (
            <section className="mt-5 rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("bookings.detail.payments")}
              </h3>
              <div className="mt-3 space-y-2">
                {booking.payments.map((payment, index) => (
                  <div
                    key={payment.id || index}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 text-sm"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        {statusLabel(payment.payment_type, t)} · {statusLabel(payment.method, t)}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {statusLabel(payment.status, t)}
                      </p>
                    </div>
                    <p className="font-black text-slate-950">
                      {formatMoney(payment.amount, language)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function ReceivePaymentModal({
  booking,
  form,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  booking: Booking;
  form: ReceivePaymentForm;
  saving: boolean;
  onChange: (form: ReceivePaymentForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { language, t } = useTicketingAdminTranslation();
  const balanceDue = Number(booking.balance_due || 0);
  const hasSeller = Boolean(booking.seller);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
              {t("bookings.payment.recordConfirmed")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {t("bookings.actions.receivePayment")}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {booking.booking_code || `#${booking.id}`} ·{" "}
              {booking.customer_name || t("bookings.detail.customer")}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 disabled:opacity-60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-3xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-wide text-slate-300">
              {t("bookings.payment.outstandingBalance")}
            </p>
            <p className="mt-2 text-3xl font-black">
              {formatMoney(balanceDue, language)}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-300">
              {t("bookings.payment.prefillHelp")}
            </p>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t("bookings.payment.amountReceived")}
            </span>
            <input
              type="number"
              min="0.01"
              max={balanceDue}
              step="0.01"
              value={form.amount}
              onChange={(event) =>
                onChange({ ...form, amount: event.target.value })
              }
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t("bookings.payment.method")}
            </span>
            <select
              value={form.method}
              onChange={(event) =>
                onChange({
                  ...form,
                  method: event.target.value as PaymentMethod,
                })
              }
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none focus:border-emerald-400 focus:bg-white"
            >
              <option value="cash">{t("bookings.paymentMethods.cash")}</option>
              <option value="card">{t("bookings.paymentMethods.card")}</option>
              <option value="bank_transfer">{t("bookings.paymentMethods.bank_transfer")}</option>
              <option value="stripe">Stripe</option>
              <option value="paypal">PayPal</option>
              <option value="other">{t("bookings.paymentMethods.other")}</option>
            </select>
          </label>

          <div>
            <span className="text-sm font-bold text-slate-700">
              {t("bookings.payment.collectedBy")}
            </span>

            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  onChange({ ...form, collected_by_party: "owner" })
                }
                className={`rounded-2xl border p-4 text-left transition ${
                  form.collected_by_party === "owner"
                    ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-black text-slate-950">{t("bookings.payment.company")}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {t("bookings.payment.companyHelp")}
                </p>
              </button>

              <button
                type="button"
                disabled={!hasSeller}
                onClick={() =>
                  onChange({ ...form, collected_by_party: "seller" })
                }
                className={`rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  form.collected_by_party === "seller"
                    ? "border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <p className="text-sm font-black text-slate-950">{t("bookings.payment.seller")}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">
                  {hasSeller
                    ? booking.seller_name || t("bookings.payment.assignedSellerCollected")
                    : t("bookings.errors.noSellerAssigned")}
                </p>
              </button>
            </div>
          </div>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">
              {t("bookings.payment.reference")}
            </span>
            <input
              value={form.reference}
              onChange={(event) =>
                onChange({ ...form, reference: event.target.value })
              }
              placeholder={t("bookings.payment.referencePlaceholder")}
              className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <label className="block">
            <span className="text-sm font-bold text-slate-700">{t("bookings.payment.note")}</span>
            <textarea
              value={form.note}
              onChange={(event) =>
                onChange({ ...form, note: event.target.value })
              }
              placeholder={t("bookings.payment.notePlaceholder")}
              className="mt-2 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-400 focus:bg-white"
            />
          </label>

          <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm font-bold leading-6 text-blue-800">
            {t("bookings.payment.backendHelp")}
          </div>
        </div>

        <div className="flex flex-col justify-end gap-3 border-t border-slate-200 p-5 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {t("bookings.actions.cancel")}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Banknote className="h-5 w-5" />
            )}
            {saving ? t("bookings.payment.recording") : t("bookings.actions.receivePayment")}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransferDetail({
  label,
  value,
  helper,
  mapLink,
}: {
  label: string;
  value?: string | null;
  helper?: string | null;
  mapLink?: string | null;
}) {
  const { t } = useTicketingAdminTranslation();

  return (
    <div className="rounded-2xl border border-blue-100 bg-white p-3 text-sm">
      <p className="text-xs font-black uppercase tracking-wide text-blue-600">
        {label}
      </p>
      <p className="mt-1 font-black text-slate-950">{value || "—"}</p>
      {helper && (
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
      {mapLink && (
        <a
          href={mapLink}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex text-xs font-black text-blue-700 underline"
        >
          {t("bookings.actions.openMap")}
        </a>
      )}
    </div>
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
  icon: React.ReactNode;
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
  icon: React.ReactNode;
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

function SummaryLine({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-black text-slate-950">{value || "—"}</span>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
