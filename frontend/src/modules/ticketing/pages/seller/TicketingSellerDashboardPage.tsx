// src/modules/ticketing/pages/seller/TicketingSellerDashboardPage.tsx

import { useEffect, useMemo, useState } from "react";
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
  return `$${Number.isFinite(amount) ? amount.toFixed(2) : "0.00"}`;
}

function numberValue(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function readNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    const amount = numberValue(value as string | number | null | undefined);

    if (amount !== 0) return amount;
  }

  return 0;
}

function readAnyNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      return numberValue(source[key] as string | number);
    }
  }

  return 0;
}

export default function TicketingSellerDashboardPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [dashboard, setDashboard] = useState<SellerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug || "";
  const sellerBasePath = `/ticketing/${slug}/seller`;

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      if (!slug) {
        setErrorMessage("Organisation slug is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getSellerDashboard(slug);

        if (mounted) {
          setDashboard(data);
        }
      } catch (error) {
        console.error("Could not load seller dashboard:", error);

        if (mounted) {
          setErrorMessage("Could not load seller dashboard.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, [slug]);

  const permissions = useMemo(() => {
    return {
      ...(dashboard?.seller || {}),
      ...(dashboard?.seller?.permissions || {}),
      ...(dashboard?.permissions || {}),
    } as Record<string, unknown>;
  }, [dashboard]);

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

  const summary = (dashboard.summary || {}) as Record<string, unknown>;

  const totalBookings = readAnyNumber(summary, ["total_bookings", "bookings_count"]);
  const todayBookings = readAnyNumber(summary, ["today_bookings"]);
  const weekBookings = readAnyNumber(summary, ["week_bookings"]);
  const monthBookings = readAnyNumber(summary, ["month_bookings"]);

  const grossSales = readNumber(summary, [
    "gross_sales",
    "total_sales",
    "sales_total",
    "revenue_total",
    "today_sales",
  ]);

  const sellerCollected = readNumber(summary, [
    "seller_collected_amount",
    "seller_collected",
    "money_collected",
    "collected_amount",
  ]);

  const sellerDueToCompany = readNumber(summary, [
    "seller_due_to_company",
    "seller_due_to_company_amount",
    "money_owed_to_company",
    "owed_to_company",
  ]);

  const sellerCommissions = readNumber(summary, [
    "seller_commission_amount",
    "seller_commissions",
    "commission_lifetime",
    "commission_total",
  ]);

  const commissionPending = readAnyNumber(summary, [
    "commission_pending",
    "pending_commission",
    "seller_commission_pending",
  ]);

  const commissionPaid = readAnyNumber(summary, [
    "commission_paid",
    "paid_commission",
    "seller_commission_paid",
  ]);

  const ownerNet = readNumber(summary, ["owner_net_amount", "owner_net"]);
  const ownerReceived = readNumber(summary, [
    "owner_received_amount",
    "owner_received",
  ]);
  const ownerPending =
    readNumber(summary, ["owner_remaining_amount", "owner_pending"]) ||
    Math.max(ownerNet - ownerReceived, 0);

  const todaySales = readAnyNumber(summary, ["today_sales"]);
  const availableProducts = dashboard.available_products || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-slate-950 p-6 text-white shadow-sm lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-300">
            Seller Portal
          </p>
          <h1 className="mt-2 text-2xl font-black lg:text-3xl">
            Welcome, {dashboard.seller?.full_name || "Seller"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-white/60">
            Seller-only dashboard. Track your bookings, payments, commissions,
            collected cash, and settlement balance.
          </p>
        </div>

        {Boolean(permissions.can_create_bookings) && (
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
          label="Gross Sales"
          value={money(grossSales)}
          helper={`${totalBookings} total bookings`}
          icon={Wallet}
        />
        <SellerStatCard
          label="Seller Collected"
          value={money(sellerCollected)}
          helper="Cash/payment collected by seller"
          icon={Receipt}
        />
        <SellerStatCard
          label="Owed to Company"
          value={money(sellerDueToCompany)}
          helper="Pending settlement balance"
          icon={Clock}
        />
        <SellerStatCard
          label="Commission"
          value={money(sellerCommissions)}
          helper={`${money(commissionPending)} pending`}
          icon={BadgeDollarSign}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          label="Owner Net"
          value={money(ownerNet)}
          helper="Expected company revenue"
          icon={Wallet}
        />
        <SellerStatCard
          label="Owner Received"
          value={money(ownerReceived)}
          helper="Money company already received"
          icon={Receipt}
        />
        <SellerStatCard
          label="Owner Pending"
          value={money(ownerPending)}
          helper="Still not received by company"
          icon={Clock}
        />
        <SellerStatCard
          label="Available Products"
          value={availableProducts.length}
          icon={Package}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          label="Today Sales"
          value={money(todaySales)}
          helper={`${todayBookings} bookings today`}
          icon={Wallet}
        />
        <SellerStatCard
          label="Week Bookings"
          value={weekBookings}
          icon={CalendarCheck}
        />
        <SellerStatCard
          label="Month Bookings"
          value={monthBookings}
          icon={CalendarCheck}
        />
        <SellerStatCard
          label="Paid Commission"
          value={money(commissionPaid)}
          icon={BadgeDollarSign}
        />
      </div>

      {sellerDueToCompany > 0 && (
        <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-700">
                Settlement pending
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {money(sellerDueToCompany)} owed to company
              </h2>
              <p className="mt-1 text-sm font-semibold text-amber-800">
                This means the seller collected money that the company has not received yet.
              </p>
            </div>
            <Link
              to={`${sellerBasePath}/bookings?owed_only=true`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            >
              View owed bookings
            </Link>
          </div>
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-950">Recent bookings</h2>
            <p className="text-sm font-semibold text-slate-500">
              Your latest seller bookings only.
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
          {dashboard.recent_bookings?.length > 0 ? (
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
