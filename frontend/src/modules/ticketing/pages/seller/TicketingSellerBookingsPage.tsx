// src/modules/ticketing/pages/seller/TicketingSellerBookingsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { Booking } from "../../types/ticketingTypes";
import SellerBookingCard from "../../components/seller/SellerBookingCard";

export default function TicketingSellerBookingsPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadBookings() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getBookings(slug);
        setBookings(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load seller bookings.");
      } finally {
        setLoading(false);
      }
    }

    loadBookings();
  }, [slug]);

  const filteredBookings = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return bookings;

    return bookings.filter((booking) => {
      const productName =
        booking.primary_product_detail?.name ||
        booking.items?.[0]?.product_name ||
        "";

      return [
        booking.booking_code,
        booking.customer_name,
        productName,
        booking.payment_status,
        booking.status,
        booking.service_date,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [bookings, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-600">
            Seller Bookings
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Your bookings
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Only bookings connected to your seller account are shown here.
          </p>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search bookings..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Loading bookings...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && filteredBookings.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          No seller bookings found.
        </div>
      )}

      {!loading && !errorMessage && filteredBookings.length > 0 && (
        <div className="space-y-3">
          {filteredBookings.map((booking) => (
            <SellerBookingCard key={booking.id} booking={booking} />
          ))}
        </div>
      )}
    </div>
  );
}
