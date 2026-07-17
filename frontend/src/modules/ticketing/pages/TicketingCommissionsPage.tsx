// src/modules/ticketing/pages/TicketingCommissionsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Ticket,
  UserRound,
  X,
  XCircle,
} from "lucide-react";

import api from "../../../api/axios";
import ticketingApi from "../api/ticketingApi";
import TicketingPageShell from "../components/TicketingPageShell";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type CommissionStatus = "pending" | "approved" | "paid" | "cancelled" | string;

type Seller = {
  id: number;
  full_name: string;
  seller_slug?: string;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  commission_rate?: string | number;
  fixed_commission_amount?: string | number;
  is_active?: boolean;
};

type SellerCommission = {
  id: number;
  organisation?: number;
  seller: number;
  seller_name?: string;
  booking: number;
  booking_code?: string;
  amount: string | number;
  rate_used: string | number;
  status: CommissionStatus;
  paid_at?: string | null;
  paid_by?: number | null;
  paid_by_email?: string;
  note?: string;
  created_at?: string;
};

type StatusOption = {
  value: CommissionStatus | "";
  label: string;
};

function getStatusOptions(t: (key: string) => string): StatusOption[] {
  return [
    { value: "", label: t("commissions.status.all") },
    { value: "pending", label: t("commissions.status.pending") },
    { value: "approved", label: t("commissions.status.approved") },
    { value: "paid", label: t("commissions.status.paid") },
    { value: "cancelled", label: t("commissions.status.cancelled") },
  ];
}

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

function formatPercent(value?: string | number | null) {
  const number = Number(value || 0);

  return `${number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(value: string | null | undefined, t: (key: string) => string) {
  if (!value) return t("commissions.status.unknown");

  const knownStatusKey = `commissions.status.${String(value).toLowerCase()}`;
  const translatedStatus = t(knownStatusKey);

  if (translatedStatus !== knownStatusKey) return translatedStatus;

  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getStatusClasses(status?: string | null) {
  const value = String(status || "").toLowerCase();

  if (value === "paid") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (value === "approved") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (value === "pending") {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  if (value === "cancelled") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");

  if (text.includes(",") || text.includes("\n") || text.includes('"')) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

function downloadCsv(rows: SellerCommission[], t: (key: string) => string) {
  const headers = [
    t("commissions.csv.id"),
    t("commissions.csv.bookingCode"),
    t("commissions.csv.seller"),
    t("commissions.csv.amount"),
    t("commissions.csv.rateUsed"),
    t("commissions.csv.status"),
    t("commissions.csv.paidAt"),
    t("commissions.csv.paidBy"),
    t("commissions.csv.createdAt"),
    t("commissions.csv.note"),
  ];

  const body = rows.map((commission) => [
    commission.id,
    commission.booking_code || "",
    commission.seller_name || "",
    commission.amount,
    commission.rate_used,
    commission.status,
    commission.paid_at || "",
    commission.paid_by_email || "",
    commission.created_at || "",
    commission.note || "",
  ]);

  const csv = [headers, ...body]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "ticketing-commissions.csv";
  anchor.click();

  URL.revokeObjectURL(url);
}

export default function TicketingCommissionsPage() {
  const { t } = useTicketingAdminTranslation();
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [commissions, setCommissions] = useState<SellerCommission[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [selectedCommission, setSelectedCommission] =
    useState<SellerCommission | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");

  const statusOptions = useMemo(() => getStatusOptions(t), [t]);

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  async function loadPage() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [commissionsData, sellersData] = await Promise.all([
        ticketingApi.getCommissions(organisationSlug),
        ticketingApi.getSellers(organisationSlug),
      ]);

      setCommissions(normalizeList<SellerCommission>(commissionsData));
      setSellers(normalizeList<Seller>(sellersData));
    } catch (err: any) {
      console.error("Could not load commissions:", err);
      setError(getErrorMessage(err, t("commissions.errors.load")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [organisationSlug]);

  const filteredCommissions = useMemo(() => {
    return commissions.filter((commission) => {
      const searchText = [
        commission.booking_code,
        commission.seller_name,
        commission.status,
        commission.amount,
        commission.rate_used,
        commission.note,
        commission.paid_by_email,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !searchText.includes(search.trim().toLowerCase())) {
        return false;
      }

      if (statusFilter && commission.status !== statusFilter) {
        return false;
      }

      if (sellerFilter && String(commission.seller) !== sellerFilter) {
        return false;
      }

      if (createdFrom && commission.created_at) {
        const createdDate = commission.created_at.slice(0, 10);

        if (createdDate < createdFrom) return false;
      }

      if (createdTo && commission.created_at) {
        const createdDate = commission.created_at.slice(0, 10);

        if (createdDate > createdTo) return false;
      }

      return true;
    });
  }, [commissions, search, statusFilter, sellerFilter, createdFrom, createdTo]);

  const stats = useMemo(() => {
    const totalGenerated = commissions.reduce(
      (sum, commission) => sum + Number(commission.amount || 0),
      0
    );

    const pendingAmount = commissions
      .filter((commission) => commission.status === "pending")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    const approvedAmount = commissions
      .filter((commission) => commission.status === "approved")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    const paidAmount = commissions
      .filter((commission) => commission.status === "paid")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    const cancelledAmount = commissions
      .filter((commission) => commission.status === "cancelled")
      .reduce((sum, commission) => sum + Number(commission.amount || 0), 0);

    return {
      totalCount: commissions.length,
      totalGenerated,
      pendingAmount,
      approvedAmount,
      paidAmount,
      cancelledAmount,
      pendingCount: commissions.filter((commission) => commission.status === "pending").length,
      approvedCount: commissions.filter((commission) => commission.status === "approved").length,
      paidCount: commissions.filter((commission) => commission.status === "paid").length,
      cancelledCount: commissions.filter((commission) => commission.status === "cancelled").length,
    };
  }, [commissions]);

  async function updateCommission(
    commission: SellerCommission,
    payload: Partial<Pick<SellerCommission, "status" | "note">>
  ) {
    try {
      setSavingId(commission.id);
      setError("");
      setSavedMessage("");

      const response = await api.patch(
        `/ticketing/commissions/${commission.id}/`,
        payload,
        {
          params: requestParams,
        }
      );

      const updatedCommission = response.data as SellerCommission;

      setCommissions((current) =>
        current.map((item) =>
          item.id === commission.id ? updatedCommission : item
        )
      );

      setSelectedCommission((current) =>
        current?.id === commission.id ? updatedCommission : current
      );

      setSavedMessage(t("commissions.messages.updated"));
    } catch (err: any) {
      console.error("Could not update commission:", err);
      setError(getErrorMessage(err, t("commissions.errors.update")));
    } finally {
      setSavingId(null);
    }
  }

  async function markPaid(commission: SellerCommission) {
    try {
      setSavingId(commission.id);
      setError("");
      setSavedMessage("");

      const updatedCommission = (await ticketingApi.markCommissionPaid(
        commission.id,
        organisationSlug
      )) as SellerCommission;

      setCommissions((current) =>
        current.map((item) =>
          item.id === commission.id ? updatedCommission : item
        )
      );

      setSelectedCommission((current) =>
        current?.id === commission.id ? updatedCommission : current
      );

      setSavedMessage(t("commissions.messages.markedPaid"));
    } catch (err: any) {
      console.error("Could not mark commission as paid:", err);
      setError(getErrorMessage(err, t("commissions.errors.markPaid")));
    } finally {
      setSavingId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setSellerFilter("");
    setCreatedFrom("");
    setCreatedTo("");
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("commissions.page.title")}
        subtitle={t("commissions.page.subtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("commissions.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("commissions.page.title")}
      subtitle={t("commissions.page.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title={t("commissions.stats.generated")}
            value={formatMoney(stats.totalGenerated)}
            helper={`${stats.totalCount} ${t("commissions.stats.records")}`}
            icon={<Banknote className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title={t("commissions.status.pending")}
            value={formatMoney(stats.pendingAmount)}
            helper={`${stats.pendingCount} ${t("commissions.stats.pending")}`}
            icon={<Clock3 className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("commissions.status.approved")}
            value={formatMoney(stats.approvedAmount)}
            helper={`${stats.approvedCount} ${t("commissions.stats.approved")}`}
            icon={<CheckCircle2 className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title={t("commissions.status.paid")}
            value={formatMoney(stats.paidAmount)}
            helper={`${stats.paidCount} ${t("commissions.stats.paid")}`}
            icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("commissions.status.cancelled")}
            value={formatMoney(stats.cancelledAmount)}
            helper={`${stats.cancelledCount} ${t("commissions.stats.cancelled")}`}
            icon={<XCircle className="h-6 w-6 text-red-600" />}
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
                {t("commissions.section.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {t("commissions.section.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => downloadCsv(filteredCommissions, t)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Download className="h-4 w-4" />
                {t("commissions.actions.exportCsv")}
              </button>

              <button
                type="button"
                onClick={loadPage}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                {t("commissions.actions.refresh")}
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-3 xl:grid-cols-[1fr_210px_230px_170px_170px_auto]">
            <div className="flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("commissions.filters.searchPlaceholder")}
                className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              {statusOptions.map((option) => (
                <option key={option.value || "all"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select
              value={sellerFilter}
              onChange={(event) => setSellerFilter(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            >
              <option value="">{t("commissions.filters.allSellers")}</option>
              {sellers.map((seller) => (
                <option key={seller.id} value={String(seller.id)}>
                  {seller.full_name}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={createdFrom}
              onChange={(event) => setCreatedFrom(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            />

            <input
              type="date"
              value={createdTo}
              onChange={(event) => setCreatedTo(event.target.value)}
              className="h-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold outline-none"
            />

            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Filter className="h-4 w-4" />
              {t("commissions.actions.reset")}
            </button>
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
            {filteredCommissions.length === 0 ? (
              <EmptyState text={t("commissions.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("commissions.table.booking")}</Th>
                      <Th>{t("commissions.table.seller")}</Th>
                      <Th>{t("commissions.table.amount")}</Th>
                      <Th>{t("commissions.table.rate")}</Th>
                      <Th>{t("commissions.table.status")}</Th>
                      <Th>{t("commissions.table.paid")}</Th>
                      <Th>{t("commissions.table.actions")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredCommissions.map((commission) => (
                      <tr key={commission.id}>
                        <Td>
                          <div>
                            <p className="font-black text-slate-950">
                              {commission.booking_code || `${t("commissions.labels.bookingNumber")} ${commission.booking}`}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-400">
                              {t("commissions.labels.created")} {formatDateTime(commission.created_at)}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {commission.seller_name || `${t("commissions.labels.sellerNumber")} ${commission.seller}`}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {t("commissions.labels.sellerId")}: {commission.seller}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {formatMoney(commission.amount)}
                          </p>
                        </Td>

                        <Td>
                          <p className="font-black text-slate-950">
                            {formatPercent(commission.rate_used)}
                          </p>
                        </Td>

                        <Td>
                          <select
                            value={commission.status || ""}
                            disabled={savingId === commission.id || commission.status === "paid"}
                            onChange={(event) =>
                              updateCommission(commission, {
                                status: event.target.value,
                              })
                            }
                            className={`h-10 rounded-2xl px-3 text-xs font-black ring-1 outline-none ${getStatusClasses(commission.status)}`}
                          >
                            {statusOptions
                              .filter((option) => option.value)
                              .map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                          </select>
                        </Td>

                        <Td>
                          <div>
                            <p className="font-black text-slate-900">
                              {commission.paid_at ? formatDateTime(commission.paid_at) : t("commissions.labels.notPaid")}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {commission.paid_by_email || "—"}
                            </p>
                          </div>
                        </Td>

                        <Td>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedCommission(commission)}
                              className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
                            >
                              <Eye className="h-4 w-4" />
                              {t("commissions.actions.view")}
                            </button>

                            {commission.status !== "paid" && (
                              <button
                                type="button"
                                disabled={savingId === commission.id}
                                onClick={() => markPaid(commission)}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-3 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                              >
                                {savingId === commission.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4" />
                                )}
                                {t("commissions.actions.markPaid")}
                              </button>
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

      {selectedCommission && (
        <CommissionDetailModal
          commission={selectedCommission}
          saving={savingId === selectedCommission.id}
          onClose={() => setSelectedCommission(null)}
          onUpdate={updateCommission}
          onMarkPaid={markPaid}
        />
      )}
    </TicketingPageShell>
  );
}

function CommissionDetailModal({
  commission,
  saving,
  onClose,
  onUpdate,
  onMarkPaid,
}: {
  commission: SellerCommission;
  saving: boolean;
  onClose: () => void;
  onUpdate: (
    commission: SellerCommission,
    payload: Partial<Pick<SellerCommission, "status" | "note">>
  ) => void;
  onMarkPaid: (commission: SellerCommission) => void;
}) {
  const { t } = useTicketingAdminTranslation();
  const statusOptions = useMemo(() => getStatusOptions(t), [t]);
  const [note, setNote] = useState(commission.note || "");

  useEffect(() => {
    setNote(commission.note || "");
  }, [commission.id, commission.note]);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {t("commissions.modal.eyebrow")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {commission.booking_code || `${t("commissions.labels.bookingNumber")} ${commission.booking}`}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {commission.seller_name || `${t("commissions.labels.sellerNumber")} ${commission.seller}`}
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
          <div className="grid gap-4 lg:grid-cols-4">
            <InfoCard
              icon={<Banknote className="h-5 w-5" />}
              label={t("commissions.table.amount")}
              value={formatMoney(commission.amount)}
              helper={t("commissions.modal.commissionAmount")}
            />
            <InfoCard
              icon={<UserRound className="h-5 w-5" />}
              label={t("commissions.table.seller")}
              value={commission.seller_name || `${t("commissions.labels.sellerNumber")} ${commission.seller}`}
              helper={`${t("commissions.labels.sellerId")}: ${commission.seller}`}
            />
            <InfoCard
              icon={<Ticket className="h-5 w-5" />}
              label={t("commissions.table.booking")}
              value={commission.booking_code || `#${commission.booking}`}
              helper={`${t("commissions.labels.bookingId")}: ${commission.booking}`}
            />
            <InfoCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label={t("commissions.table.status")}
              value={statusLabel(commission.status, t)}
              helper={commission.paid_at ? `${t("commissions.status.paid")} ${formatDateTime(commission.paid_at)}` : t("commissions.labels.notPaidYet")}
            />
          </div>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("commissions.table.status")}
              </h3>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="text-sm font-bold text-slate-700">
                    {t("commissions.modal.commissionStatus")}
                  </span>
                  <select
                    value={commission.status || ""}
                    disabled={saving || commission.status === "paid"}
                    onChange={(event) =>
                      onUpdate(commission, { status: event.target.value })
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black outline-none"
                  >
                    {statusOptions
                      .filter((option) => option.value)
                      .map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                  </select>
                </label>

                <div>
                  <span className="text-sm font-bold text-slate-700">
                    {t("commissions.labels.paidBy")}
                  </span>
                  <div className="mt-2 flex h-12 items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-black text-slate-700">
                    {commission.paid_by_email || "—"}
                  </div>
                </div>
              </div>

              {commission.status !== "paid" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => onMarkPaid(commission)}
                  className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {t("commissions.actions.markSellerPayoutPaid")}
                </button>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 p-4">
              <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
                {t("commissions.modal.details")}
              </h3>

              <div className="mt-3 space-y-2 text-sm">
                <SummaryLine label={t("commissions.table.amount")} value={formatMoney(commission.amount)} />
                <SummaryLine label={t("commissions.labels.rateUsed")} value={formatPercent(commission.rate_used)} />
                <SummaryLine label={t("commissions.labels.created")} value={formatDateTime(commission.created_at)} />
                <SummaryLine label={t("commissions.labels.paidAt")} value={formatDateTime(commission.paid_at)} />
              </div>
            </div>
          </section>

          <section className="mt-5 rounded-3xl border border-slate-200 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-slate-500">
              {t("commissions.modal.internalNote")}
            </h3>

            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t("commissions.modal.notePlaceholder")}
              className="mt-3 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
            />

            <button
              type="button"
              disabled={saving}
              onClick={() => onUpdate(commission, { note })}
              className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t("commissions.actions.saveNote")}
            </button>
          </section>
        </div>
      </div>
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
  icon: ReactNode;
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
  icon: ReactNode;
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

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
