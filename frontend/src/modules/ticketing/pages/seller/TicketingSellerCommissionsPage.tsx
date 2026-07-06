// src/modules/ticketing/pages/seller/TicketingSellerCommissionsPage.tsx

import { useEffect, useMemo, useState } from "react";
import { BadgeDollarSign, Search } from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { SellerCommission } from "../../types/ticketingTypes";
import SellerStatCard from "../../components/seller/SellerStatCard";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

export default function TicketingSellerCommissionsPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const slug = organisationSlug || "";

  useEffect(() => {
    async function loadCommissions() {
      try {
        setLoading(true);
        setErrorMessage("");

        const data = await ticketingApi.getCommissions(slug);
        setCommissions(data);
      } catch (error) {
        console.error(error);
        setErrorMessage("Could not load seller commissions.");
      } finally {
        setLoading(false);
      }
    }

    loadCommissions();
  }, [slug]);

  const summary = useMemo(() => {
    return commissions.reduce(
      (acc, commission) => {
        const amount = Number(commission.amount || 0);

        acc.lifetime += amount;

        if (commission.status === "pending" || commission.status === "approved") {
          acc.pending += amount;
        }

        if (commission.status === "paid") {
          acc.paid += amount;
        }

        return acc;
      },
      {
        lifetime: 0,
        pending: 0,
        paid: 0,
      }
    );
  }, [commissions]);

  const filteredCommissions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) return commissions;

    return commissions.filter((commission) => {
      return [
        commission.booking_code,
        commission.status,
        commission.note,
        commission.created_at,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [commissions, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 lg:flex-row lg:items-center">
        <div>
          <p className="text-sm font-black uppercase tracking-wide text-amber-600">
            Seller Commissions
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            Your commission
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
            Only your own commission records are shown.
          </p>
        </div>

        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search commissions..."
            className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-slate-400"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SellerStatCard
          label="Pending"
          value={money(summary.pending)}
          icon={BadgeDollarSign}
        />
        <SellerStatCard
          label="Paid"
          value={money(summary.paid)}
          icon={BadgeDollarSign}
        />
        <SellerStatCard
          label="Lifetime"
          value={money(summary.lifetime)}
          icon={BadgeDollarSign}
        />
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          Loading commissions...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && filteredCommissions.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          No seller commissions found.
        </div>
      )}

      {!loading && !errorMessage && filteredCommissions.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Booking
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Amount
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Rate
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    Date
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCommissions.map((commission) => (
                  <tr key={commission.id}>
                    <td className="px-5 py-4 text-sm font-black text-slate-950">
                      {commission.booking_code || `#${commission.booking}`}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-slate-950">
                      {money(commission.amount)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {commission.rate_used}%
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                        {commission.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {commission.created_at
                        ? new Date(commission.created_at).toLocaleDateString()
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
