// src/modules/ticketing/pages/TicketingBookingsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
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
  label: string;
};

const bookingStatusOptions: StatusOption[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "pending_payment", label: "Pending payment" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
];

const paymentStatusOptions: StatusOption[] = [
  { value: "", label: "All payments" },
  { value: "unpaid", label: "Unpaid" },
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "paid", label: "Paid" },
  { value: "refunded", label: "Refunded" },
  { value: "cancelled", label: "Cancelled" },
];

const productTypeOptions: StatusOption[] = [
  { value: "", label: "All products" },
  { value: "transfer", label: "Transfers" },
  { value: "excursion", label: "Excursions" },
  { value: "ticket", label: "Tickets" },
  { value: "event", label: "Events" },
  { value: "nightlife", label: "Nightlife" },
  { value: "custom", label: "Custom" },
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

function formatMoney(value?: string | number | null, symbol = "US$") {
  const number = Number(value || 0);

  return `${symbol} ${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function statusLabel(value?: string | null) {
  if (!value) return "Unknown";

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusClasses(status?: string | null) {
  const value = String(status || "").toLowerCase();

  if (["confirmed", "completed", "paid"].includes(value)) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["pending", "pending_payment", "partial"].includes(value)) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (["cancelled", "no_show", "refunded"].includes(value)) {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function getProductName(booking: Booking) {
  return (
    booking.primary_product_detail?.name ||
    booking.product_name ||
    booking.items?.[0]?.product_name ||
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

function getTransferOrigin(booking: Booking) {
  return booking.transfer_origin || getInstructionValue(booking, "Route from") || "Pickup";
}

function getTransferDestination(booking: Booking) {
  return booking.transfer_destination || getInstructionValue(booking, "Route to") || "Drop-off";
}

function getTransferRouteLabel(booking: Booking) {
  return `${getTransferOrigin(booking)} → ${getTransferDestination(booking)}`;
}

function getTransferVehicle(booking: Booking) {
  return booking.transfer_vehicle_type || getInstructionValue(booking, "Vehicle") || "Vehicle not assigned";
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

function getTransferDropoff(booking: Booking) {
  return getInstructionValue(booking, "Drop-off") || getTransferDestination(booking);
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
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

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
      setError(getErrorMessage(err, "No se pudieron cargar las reservas."));
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
        getProductName(booking),
        getPickupHotel(booking),
        getTransferRouteLabel(booking),
        getTransferVehicle(booking),
        getTransferDropoff(booking),
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
    payload: Partial<Pick<Booking, "status" | "payment_status">>
  ) {
    try {
      setSavingId(booking.id);
      setError("");
      setSavedMessage("");

      const response = await api.patch(`/ticketing/bookings/${booking.id}/`, payload, {
        params: requestParams,
      });

      const updatedBooking = response.data as Booking;

      setBookings((current) =>
        current.map((item) => (item.id === booking.id ? updatedBooking : item))
      );

      setSelectedBooking((current) =>
        current?.id === booking.id ? updatedBooking : current
      );

      setSavedMessage("Booking updated.");
    } catch (err: any) {
      console.error("Could not update booking:", err);
      setError(getErrorMessage(err, "Could not update booking."));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Bookings"
        subtitle="Manage customer bookings, tickets, transfers, events and payment status."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading bookings...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Bookings"
      subtitle="Manage customer bookings, tickets, transfers, events and payment status."
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <StatCard
            title="Total bookings"
            value={String(stats.total)}
            helper="All public and seller bookings"
            icon={<Ticket className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Pending"
            value={String(stats.pending)}
            helper="Need review or payment"
            icon={<Clock3 className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title="Confirmed"
            value={String(stats.confirmed)}
            helper="Ready / completed"
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Paid"
            value={String(stats.paid)}
            helper="Payment completed"
            icon={<CreditCard className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title="Transfers"
            value={String(stats.transfers)}
            helper="Private transport bookings"
            icon={<Plane className="h-6 w-6 text-blue-600" />}
          />
          <StatCard
            title="Balance due"
            value={formatMoney(stats.balanceDue)}
            helper="Pending to collect"
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
                Booking list
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Review customers, pickup details, totals and payment status.
              </p>
            </div>

            <button
              type="button"
              onClick={loadBookings}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_190px_190px_170px_170px]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search code, customer, hotel, product..."
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
                  {option.label}
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
                  {option.label}
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
                  {option.label}
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
              <EmptyState text="No bookings found." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Booking</Th>
                      <Th>Customer</Th>
                      <Th>Product / Date</Th>
                      <Th>Pickup / Route</Th>
                      <Th>Total</Th>
                      <Th>Status</Th>
                      <Th>Payment</Th>
                      <Th>Actions</Th>
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
                              {booking.customer_name || "No name"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {booking.customer_whatsapp || booking.customer_email || "No contact"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {getProductName(booking)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {formatDate(booking.service_date)} · {getTotalGuests(booking)} {isTransferBooking(booking) ? "passengers" : "guests"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            {isTransferBooking(booking) ? (
                              <>
                                <p className="font-black text-slate-900">
                                  {getTransferRouteLabel(booking)}
                                </p>
                                <p className="mt-1 text-xs font-bold text-slate-500">
                                  Pickup: {getTransferPickup(booking)} · {formatTime(getPickupTime(booking))}
                                </p>
                                <p className="mt-1 text-xs font-bold text-blue-600">
                                  {getTransferVehicle(booking)}
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
                              {formatMoney(booking.total_amount)}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              Balance: {formatMoney(booking.balance_due)}
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
                                  {option.label}
                                </option>
                              ))}
                          </select>
                        </Td>

                        <Td>
                          <select
                            value={booking.payment_status || ""}
                            disabled={savingId === booking.id}
                            onChange={(event) =>
                              updateBooking(booking, {
                                payment_status: event.target.value,
                              })
                            }
                            className={`h-10 rounded-2xl px-3 text-xs font-black ring-1 outline-none ${getStatusClasses(booking.payment_status)}`}
                          >
                            {paymentStatusOptions
                              .filter((option) => option.value)
                              .map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                          </select>
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedBooking(booking)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </button>

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
          saving={savingId === selectedBooking.id}
        />
      )}
    </TicketingPageShell>
  );
}

function BookingDetailModal({
  booking,
  onClose,
  onUpdate,
  saving,
}: {
  booking: Booking;
  onClose: () => void;
  onUpdate: (
    booking: Booking,
    payload: Partial<Pick<Booking, "status" | "payment_status">>
  ) => void;
  saving: boolean;
}) {
  const transferBooking = isTransferBooking(booking);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              Booking detail
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {booking.booking_code || `#${booking.id}`}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {getProductName(booking)}
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
              label="Customer"
              value={booking.customer_name || "—"}
              helper={booking.customer_whatsapp || booking.customer_email || "No contact"}
            />
            <InfoCard
              icon={<CalendarDays className="h-5 w-5" />}
              label="Service date"
              value={formatDate(booking.service_date)}
              helper={formatTime(booking.service_time)}
            />
            <InfoCard
              icon={<Users className="h-5 w-5" />}
              label={transferBooking ? "Passengers" : "Guests"}
              value={`${getTotalGuests(booking)} total`}
              helper={`${booking.adults || 0} adults · ${booking.children || 0} children · ${booking.infants || 0} infants`}
            />
            {transferBooking ? (
              <>
                <InfoCard
                  icon={<Navigation className="h-5 w-5" />}
                  label="Transfer route"
                  value={getTransferRouteLabel(booking)}
                  helper={booking.transfer_round_trip ? "Round trip" : "One way"}
                />
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label="Pickup"
                  value={getTransferPickup(booking)}
                  helper={getTransferPickupAddress(booking) || "Pickup address not provided"}
                />
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label="Drop-off"
                  value={getTransferDropoff(booking)}
                  helper={getTransferDropoffAddress(booking) || "Drop-off address not provided"}
                />
                <InfoCard
                  icon={<Plane className="h-5 w-5" />}
                  label="Vehicle"
                  value={getTransferVehicle(booking)}
                  helper={statusLabel(booking.transfer_status || "advance booking")}
                />
              </>
            ) : (
              <>
                <InfoCard
                  icon={<MapPin className="h-5 w-5" />}
                  label="Pickup hotel"
                  value={getPickupHotel(booking)}
                  helper={booking.pickup_info?.pickup_point || "Pickup point not set"}
                />
                <InfoCard
                  icon={<Clock3 className="h-5 w-5" />}
                  label="Pickup time"
                  value={formatTime(getPickupTime(booking))}
                  helper={booking.pickup_info?.instructions || "Automatic pickup"}
                />
              </>
            )}
            <InfoCard
              icon={<CreditCard className="h-5 w-5" />}
              label="Total / balance"
              value={formatMoney(booking.total_amount)}
              helper={`Balance: ${formatMoney(booking.balance_due)}`}
            />
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Booking status
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-bold text-slate-700">
                    Status
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
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  <span className="text-sm font-bold text-slate-700">
                    Payment status
                  </span>
                  <select
                    value={booking.payment_status || ""}
                    disabled={saving}
                    onChange={(event) =>
                      onUpdate(booking, {
                        payment_status: event.target.value,
                      })
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {paymentStatusOptions
                      .filter((option) => option.value)
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Payment summary
              </h3>

              <div className="mt-3 space-y-2 text-sm">
                <SummaryLine label="Subtotal" value={formatMoney(booking.subtotal_amount)} />
                <SummaryLine label="Total" value={formatMoney(booking.total_amount)} />
                <SummaryLine label="Deposit required" value={formatMoney(booking.deposit_required)} />
                <SummaryLine label="Deposit paid" value={formatMoney(booking.deposit_paid)} />
                <SummaryLine label="Balance due" value={formatMoney(booking.balance_due)} />
                <SummaryLine label="Payment mode" value={statusLabel(booking.payment_mode)} />
              </div>
            </div>
          </section>

          {transferBooking && (
            <section className="mt-5 rounded-3xl border border-blue-100 bg-blue-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-blue-700">
                Transfer details
              </h3>

              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <TransferDetail label="Route" value={getTransferRouteLabel(booking)} />
                <TransferDetail label="Preferred time" value={formatTime(getPickupTime(booking))} />
                <TransferDetail label="Pickup" value={getTransferPickup(booking)} helper={getTransferPickupAddress(booking)} mapLink={getTransferPickupMap(booking)} />
                <TransferDetail label="Drop-off" value={getTransferDropoff(booking)} helper={getTransferDropoffAddress(booking)} mapLink={getTransferDropoffMap(booking)} />
                <TransferDetail label="Vehicle" value={getTransferVehicle(booking)} />
                <TransferDetail label="Passengers" value={`${getTotalGuests(booking)} total`} />
              </div>
            </section>
          )}

          {booking.customer_notes && (
            <section className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Customer notes
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-700">
                {booking.customer_notes}
              </p>
            </section>
          )}

          {booking.items && booking.items.length > 0 && (
            <section className="mt-5 rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Items
              </h3>
              <div className="mt-3 space-y-2">
                {booking.items.map((item, index) => (
                  <div
                    key={item.id || index}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 text-sm"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        {item.product_name || `Item ${index + 1}`}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        Qty: {item.quantity || 0} · {formatDate(item.service_date)}
                      </p>
                    </div>
                    <p className="font-black text-slate-950">
                      {formatMoney(item.line_total)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {booking.payments && booking.payments.length > 0 && (
            <section className="mt-5 rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                Payments
              </h3>
              <div className="mt-3 space-y-2">
                {booking.payments.map((payment, index) => (
                  <div
                    key={payment.id || index}
                    className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 p-3 text-sm"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        {statusLabel(payment.payment_type)} · {statusLabel(payment.method)}
                      </p>
                      <p className="text-xs font-bold text-slate-500">
                        {statusLabel(payment.status)}
                      </p>
                    </div>
                    <p className="font-black text-slate-950">
                      {formatMoney(payment.amount)}
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
          Open map
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
