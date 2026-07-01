// src/modules/ticketing/pages/PublicConfirmationPage.tsx

import { Link, useLocation, useParams } from "react-router-dom";
import {
  CheckCircle2,
  Clock3,
  Home,
  MapPin,
  Ticket,
  Users,
} from "lucide-react";

import type { Booking, ExperienceProduct } from "../types/ticketingTypes";

type LocationState = {
  booking?: Booking;
  product?: ExperienceProduct;
  currencySymbol?: string;
  brandName?: string;
};

function money(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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

export default function PublicConfirmationPage() {
  const { organisationSlug = "", bookingCode = "" } = useParams<{
    organisationSlug: string;
    bookingCode: string;
  }>();

  const location = useLocation();
  const state = (location.state || {}) as LocationState;
  const booking = state.booking;
  const product = state.product;
  const currencySymbol = state.currencySymbol || "US$";
  const brandName = state.brandName || "PCD Experiences";

  const pickup = booking?.pickup_info;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            to={`/experiences/${organisationSlug}`}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Ticket className="h-6 w-6" />
            </div>

            <div>
              <p className="text-sm font-black">{brandName}</p>
              <p className="text-xs font-bold text-slate-500">
                Booking confirmation
              </p>
            </div>
          </Link>

          <Link
            to={`/experiences/${organisationSlug}`}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
          >
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />

          <h1 className="mt-4 text-2xl font-black text-emerald-950">
            Booking received
          </h1>

          <p className="mt-2 text-sm font-bold leading-6 text-emerald-800">
            Your booking request has been created. Save this booking code.
          </p>

          <div className="mx-auto mt-5 inline-flex rounded-2xl bg-white px-5 py-3 text-xl font-black text-emerald-950 shadow-sm">
            {booking?.booking_code || bookingCode}
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Booking details</h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Info label="Product" value={product?.name || booking?.primary_product_detail?.name || "Experience"} icon={<Ticket className="h-4 w-4" />} />
              <Info label="Date" value={formatDate(booking?.service_date)} icon={<Clock3 className="h-4 w-4" />} />
              <Info label="Guests" value={`${booking?.total_guests || 0} total`} icon={<Users className="h-4 w-4" />} />
              <Info label="Customer" value={booking?.customer_name || "—"} icon={<Users className="h-4 w-4" />} />
              <Info label="Hotel" value={pickup?.hotel_or_location_name || booking?.customer_hotel || "—"} icon={<MapPin className="h-4 w-4" />} />
              <Info label="Pickup time" value={formatTime(pickup?.pickup_time || booking?.service_time)} icon={<Clock3 className="h-4 w-4" />} />
            </div>

            {pickup?.pickup_point && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                  Pickup point
                </p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {pickup.pickup_point}
                </p>
                {pickup.instructions && (
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    {pickup.instructions}
                  </p>
                )}
              </div>
            )}
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">Payment summary</h2>

            <div className="mt-4 space-y-3">
              <PaymentLine label="Total" value={money(booking?.total_amount, currencySymbol)} />
              <PaymentLine label="Deposit required" value={money(booking?.deposit_required, currencySymbol)} />
              <PaymentLine label="Paid" value={money(booking?.deposit_paid, currencySymbol)} />
              <PaymentLine label="Balance due" value={money(booking?.balance_due, currencySymbol)} />
              <PaymentLine label="Payment status" value={booking?.payment_status || "pending"} />
            </div>

            <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
              You may receive a confirmation by WhatsApp or email when the booking is reviewed or payment is completed.
            </p>
          </aside>
        </section>
      </main>
    </div>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-sm font-black text-slate-950">{value || "—"}</p>
      </div>
    </div>
  );
}

function PaymentLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-black text-slate-950">{value || "—"}</span>
    </div>
  );
}
