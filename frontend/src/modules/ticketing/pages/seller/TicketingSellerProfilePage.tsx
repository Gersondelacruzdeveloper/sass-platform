// src/modules/ticketing/pages/seller/TicketingSellerProfilePage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CheckCircle2,
  Mail,
  Phone,
  ShieldCheck,
  UserCircle,
  Wallet,
} from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { Seller } from "../../types/ticketingTypes";
import SellerStatCard from "../../components/seller/SellerStatCard";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function hasPermission(seller: Seller | null, key: string) {
  if (!seller) return false;

  const permissions = seller.permissions || {};
  const fromPermissions = (permissions as Record<string, unknown>)[key];
  const fromSeller = (seller as unknown as Record<string, unknown>)[key];

  if (typeof fromPermissions === "boolean") return fromPermissions;
  if (typeof fromSeller === "boolean") return fromSeller;

  return false;
}

export default function TicketingSellerProfilePage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadSeller() {
      if (!slug) {
        setErrorMessage("Organisation slug is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getSellerMe(slug);
        setSeller(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load seller profile.");
      } finally {
        setLoading(false);
      }
    }

    loadSeller();
  }, [slug]);

  const sellerCapabilities = useMemo(() => {
    if (!seller) return [];

    return [
      {
        label: "Create bookings",
        enabled: hasPermission(seller, "can_create_bookings"),
      },
      {
        label: "View own bookings",
        enabled:
          hasPermission(seller, "can_view_own_sales") ||
          hasPermission(seller, "can_view_own_bookings"),
      },
      {
        label: "View commissions",
        enabled: hasPermission(seller, "can_view_own_commissions"),
      },
      {
        label: "Apply discounts",
        enabled: hasPermission(seller, "can_apply_discounts"),
      },
      {
        label: "Collect cash",
        enabled: hasPermission(seller, "can_collect_cash_payment"),
      },
      {
        label: "Generate tickets",
        enabled: hasPermission(
          seller,
          "can_generate_ticket_without_customer_online_payment"
        ),
      },
    ].filter((item) => item.enabled);
  }, [seller]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
        Loading seller profile...
      </div>
    );
  }

  if (errorMessage || !seller) {
    return (
      <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
        {errorMessage || "Seller profile not available."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-slate-100 text-xl font-black text-slate-500">
            {seller.photo_url ? (
              <img
                src={seller.photo_url}
                alt={seller.full_name || "Seller"}
                className="h-full w-full object-cover"
              />
            ) : (
              seller.full_name?.charAt(0) || <UserCircle className="h-9 w-9" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              Seller Profile
            </p>
            <h1 className="mt-1 truncate text-2xl font-black text-slate-950">
              {seller.full_name || "Seller"}
            </h1>
            <p className="mt-1 text-sm font-semibold capitalize text-slate-500">
              {seller.role || "Seller"} account
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {(seller.email || seller.user_email) && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  <Mail className="h-4 w-4" />
                  {seller.email || seller.user_email}
                </span>
              )}
              {seller.whatsapp && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">
                  <Phone className="h-4 w-4" />
                  {seller.whatsapp}
                </span>
              )}
              {seller.is_active !== false && (
                <span className="inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Active
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SellerStatCard
          label="Total Sales"
          value={money(seller.total_sales_amount)}
          icon={Wallet}
        />
        <SellerStatCard
          label="Commission"
          value={money(seller.total_commission_amount)}
          icon={BadgeDollarSign}
        />
        <SellerStatCard
          label="Collected"
          value={money(seller.total_collected_amount)}
          icon={Wallet}
        />
        <SellerStatCard
          label="Owed to Company"
          value={money(seller.total_owed_to_company)}
          icon={Wallet}
        />
      </div>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-950">
              What you can do
            </h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              This is a simple summary of the actions enabled for your seller account.
            </p>
          </div>
        </div>

        {sellerCapabilities.length > 0 ? (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sellerCapabilities.map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3"
              >
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="text-sm font-black text-slate-700">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm font-bold text-slate-500">
            No seller actions are currently enabled. Please contact the company owner.
          </div>
        )}
      </section>
    </div>
  );
}
