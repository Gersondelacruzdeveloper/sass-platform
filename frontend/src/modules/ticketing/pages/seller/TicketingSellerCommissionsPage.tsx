// src/modules/ticketing/pages/seller/TicketingSellerCommissionsPage.tsx

import { useEffect, useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
} from "lucide-react";
import { useParams } from "react-router-dom";

import ticketingApi from "../../api/ticketingApi";
import type { SellerCommission } from "../../types/ticketingTypes";
import SellerStatCard from "../../components/seller/SellerStatCard";
import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function normalizeCommissionsResponse(response: unknown): SellerCommission[] {
  if (Array.isArray(response)) {
    return response as SellerCommission[];
  }

  if (
    response &&
    typeof response === "object" &&
    "results" in response &&
    Array.isArray((response as { results?: unknown }).results)
  ) {
    return (response as { results: SellerCommission[] }).results;
  }

  if (
    response &&
    typeof response === "object" &&
    "data" in response &&
    Array.isArray((response as { data?: unknown }).data)
  ) {
    return (response as { data: SellerCommission[] }).data;
  }

  return [];
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString();
}

function statusLabel(
  status: string | null | undefined,
  t: (key: string) => string
) {
  if (!status) return t("sellerCommissions.status.pending");

  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function TicketingSellerCommissionsPage() {
  const { t } = useTicketingAdminTranslation();
  const { organisationSlug } = useParams<{ organisationSlug: string }>();
  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");

  const slug = organisationSlug || "";

  async function loadCommissions(showRefreshing = false) {
    if (!slug) {
      setCommissions([]);
      setErrorMessage(t("sellerCommissions.errors.missingOrganisation"));
      setLoading(false);
      return;
    }

    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage("");

      const response = await ticketingApi.getSellerCommissions(slug);
      const normalized = normalizeCommissionsResponse(response);

      setCommissions(normalized);
    } catch (error) {
      console.error("Could not load seller commissions", error);
      setErrorMessage(t("sellerCommissions.errors.load"));
      setCommissions([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadCommissions(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const summary = useMemo(() => {
    return commissions.reduce(
      (acc, commission) => {
        const amount = Number(commission.amount || 0);
        const status = String(commission.status || "pending").toLowerCase();

        if (status !== "cancelled") {
          acc.lifetime += amount;
        }

        if (status === "pending" || status === "approved") {
          acc.pending += amount;
        }

        if (status === "paid") {
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
        commission.booking,
        commission.seller_name,
        commission.status,
        commission.note,
        commission.amount,
        commission.rate_used,
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
            {t("sellerCommissions.header.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-black text-slate-950">
            {t("sellerCommissions.header.title")}
          </h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">
              {t("sellerCommissions.header.description")}
          </p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:flex-row lg:max-w-xl">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("sellerCommissions.search.placeholder")}
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-bold outline-none transition focus:border-slate-400"
            />
          </div>

          <button
            type="button"
            onClick={() => loadCommissions(true)}
            disabled={refreshing || loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("sellerCommissions.actions.refresh")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <SellerStatCard label={t("sellerCommissions.stats.pending")} value={money(summary.pending)} icon={Clock3} />
        <SellerStatCard label={t("sellerCommissions.stats.paid")} value={money(summary.paid)} icon={CheckCircle2} />
        <SellerStatCard label={t("sellerCommissions.stats.lifetime")} value={money(summary.lifetime)} icon={BadgeDollarSign} />
      </div>

      {loading && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          {t("sellerCommissions.loading")}
        </div>
      )}

      {errorMessage && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-center font-bold text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && !errorMessage && commissions.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center">
          <BadgeDollarSign className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-4 text-lg font-black text-slate-950">
            {t("sellerCommissions.empty.title")}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            {t("sellerCommissions.empty.description")}
          </p>
        </div>
      )}

      {!loading && !errorMessage && commissions.length > 0 && filteredCommissions.length === 0 && (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center font-bold text-slate-500">
          {t("sellerCommissions.empty.search")}
        </div>
      )}

      {!loading && !errorMessage && filteredCommissions.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("sellerCommissions.table.booking")}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("sellerCommissions.table.amount")}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("sellerCommissions.table.rate")}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("sellerCommissions.table.status")}
                  </th>
                  <th className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                    {t("sellerCommissions.table.date")}
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filteredCommissions.map((commission) => (
                  <tr key={commission.id} className="transition hover:bg-slate-50">
                    <td className="px-5 py-4">
                      <div className="text-sm font-black text-slate-950">
                        {commission.booking_code || `#${commission.booking}`}
                      </div>
                      {commission.seller_name && (
                        <div className="mt-1 text-xs font-bold text-slate-400">
                          {commission.seller_name}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm font-black text-slate-950">
                      {money(commission.amount)}
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      {Number(commission.rate_used || 0).toFixed(2)}%
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                        {statusLabel(commission.status, t)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-semibold text-slate-600">
                      <span className="inline-flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        {formatDate(commission.created_at)}
                      </span>
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
