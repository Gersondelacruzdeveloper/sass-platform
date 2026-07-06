// src/modules/ticketing/pages/seller/TicketingSellerProfilePage.tsx

import { useEffect, useState } from "react";
import { BadgeDollarSign, Wallet } from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { Seller } from "../../types/ticketingTypes";
import SellerStatCard from "../../components/seller/SellerStatCard";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function TicketingSellerProfilePage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadSeller() {
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

  const permissionEntries = Object.entries(seller.permissions || seller).filter(
    ([key, value]) => key.startsWith("can_") && typeof value === "boolean"
  );

  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl bg-slate-100 text-xl font-black text-slate-500">
            {seller.photo_url ? (
              <img
                src={seller.photo_url}
                alt={seller.full_name}
                className="h-full w-full object-cover"
              />
            ) : (
              seller.full_name?.charAt(0) || "S"
            )}
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              Seller Profile
            </p>
            <h1 className="mt-1 text-2xl font-black text-slate-950">
              {seller.full_name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              {seller.email || seller.user_email || "No email"} · {seller.role}
            </p>
            {seller.whatsapp && (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                WhatsApp: {seller.whatsapp}
              </p>
            )}
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
        <h2 className="text-lg font-black text-slate-950">Your permissions</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          These permissions control what actions you can perform.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {permissionEntries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
            >
              <span className="text-sm font-bold text-slate-600">
                {key.replaceAll("_", " ")}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-black ${
                  value
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-200 text-slate-500"
                }`}
              >
                {value ? "Allowed" : "No"}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
