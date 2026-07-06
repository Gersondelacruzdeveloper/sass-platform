// src/modules/ticketing/pages/seller/TicketingSellerDashboardPage.tsx

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  CalendarCheck,
  Clock,
  Package,
  Receipt,
  Wallet,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type { SellerDashboard } from "../../types/ticketingTypes";
import SellerStatCard from "../../components/seller/SellerStatCard";
import SellerBookingCard from "../../components/seller/SellerBookingCard";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function TicketingSellerDashboardPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug || "";
  const sellerBasePath = `/ticketing/${slug}/seller`;

  useEffect(() => {
    async function loadDashboard() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getSellerDashboard(slug);
        setDashboard(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load seller dashboard.");
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [slug]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
        Loading seller dashboard...
      </div>
    );
  }

  if (errorMessage || !dashboard) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
        {errorMessage || "Seller dashboard not available."}
      </div>
    );
  }

  const summary = dashboard.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-300">
            Seller Portal
          </p>
          <h1 className="mt-2 text-2xl font-black lg:text-3xl">
            Welcome, {dashboard.seller.full_name}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-white/60">
            View your products, create bookings, track payments, and monitor your commission.
          </p>
        </div>

        {permissions.can_create_bookings && (
          <Link
            to={`${sellerBasePath}/new-booking`}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-amber-400 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-300"
          >
            New Booking
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          label="Today Sales"
          value={money(summary.today_sales)}
          helper={`${summary.today_bookings} bookings today`}
          icon={Wallet}
        />
        <SellerStatCard
          label="Collected"
          value={money(summary.money_collected)}
          helper="Money collected by you"
          icon={Receipt}
        />
        <SellerStatCard
          label="Owed to Company"
          value={money(summary.money_owed_to_company)}
          helper="Amount to settle"
          icon={Clock}
        />
        <SellerStatCard
          label="Pending Commission"
          value={money(summary.commission_pending)}
          helper="Not paid yet"
          icon={BadgeDollarSign}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          label="Week Bookings"
          value={summary.week_bookings}
          icon={CalendarCheck}
        />
        <SellerStatCard
          label="Month Bookings"
          value={summary.month_bookings}
          icon={CalendarCheck}
        />
        <SellerStatCard
          label="Available Products"
          value={dashboard.available_products.length}
          icon={Package}
        />
        <SellerStatCard
          label="Lifetime Commission"
          value={money(summary.commission_lifetime)}
          icon={BadgeDollarSign}
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Recent bookings</h2>
            <p className="text-sm font-semibold text-slate-500">
              Your latest seller bookings.
            </p>
          </div>

          <Link
            to={`${sellerBasePath}/bookings`}
            className="text-sm font-black text-amber-600 hover:text-amber-700"
          >
            View all
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {dashboard.recent_bookings.length > 0 ? (
            dashboard.recent_bookings.map((booking) => (
              <SellerBookingCard key={booking.id} booking={booking} />
            ))
          ) : (
            <div className="rounded-3xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
              No bookings yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
