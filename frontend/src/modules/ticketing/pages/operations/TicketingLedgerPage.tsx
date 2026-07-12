// src/modules/ticketing/pages/operations/TicketingLedgerPage.tsx

import type { FormEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  BookOpenCheck,
  Building2,
  CircleAlert,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  WalletCards,
  X,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  LedgerSummary,
  ManualLedgerAdjustmentPayload,
  TicketingBusinessEntity,
  TicketingLedgerEntry,
  SettlementParty,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type AdjustmentFormState = {
  debit_party: SettlementParty;
  credit_party: SettlementParty;
  amount: string;
  description: string;
  currency: string;
  reference: string;
  business_entity_id: number | "";
  booking_id: string;
};

const initialAdjustmentForm: AdjustmentFormState = {
  debit_party: "partner",
  credit_party: "platform",
  amount: "",
  description: "",
  currency: "USD",
  reference: "",
  business_entity_id: "",
  booking_id: "",
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getMonthStart(): string {
  const date = new Date();
  date.setDate(1);
  return date.toISOString().slice(0, 10);
}

function getErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            detail?: string;
            message?: string;
          };
        };
      }
    ).response;

    return (
      response?.data?.detail ||
      response?.data?.message ||
      "Could not process the ledger request."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Could not process the ledger request.";
}

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(
  value: string | number | null | undefined,
  currency = "USD",
): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(toNumber(value));
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value?: string | null): string {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export default function TicketingLedgerPage() {
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const [entries, setEntries] = useState<TicketingLedgerEntry[]>(
    [],
  );
  const [summary, setSummary] = useState<LedgerSummary | null>(
    null,
  );
  const [entities, setEntities] = useState<
    TicketingBusinessEntity[]
  >([]);
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const [selectedEntityId, setSelectedEntityId] = useState<
    number | ""
  >("");
  const [selectedParty, setSelectedParty] = useState("");
  const [selectedEntryType, setSelectedEntryType] =
    useState("");
  const [dateFrom, setDateFrom] = useState(getMonthStart());
  const [dateTo, setDateTo] = useState(getToday());
  const [search, setSearch] = useState("");

  const [adjustmentModalOpen, setAdjustmentModalOpen] =
    useState(false);
  const [adjustmentForm, setAdjustmentForm] =
    useState<AdjustmentFormState>(initialAdjustmentForm);
  const [savingAdjustment, setSavingAdjustment] =
    useState(false);
  const [reversingGroup, setReversingGroup] =
    useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const params = {
        business_entity: selectedEntityId || undefined,
        party_type: selectedParty || undefined,
        entry_type: selectedEntryType || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      };

      const [entryData, summaryData, entityData] =
        await Promise.all([
          ticketingApi.getLedgerEntries(slug, params),
          ticketingApi.getLedgerSummary(slug, params),
          ticketingApi.getBusinessEntities(slug, {
            is_active: true,
          }),
        ]);

      setEntries(entryData);
      setSummary(summaryData);
      setEntities(entityData);
      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error),
      });
    }
  }, [
    dateFrom,
    dateTo,
    selectedEntityId,
    selectedEntryType,
    selectedParty,
    slug,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredEntries = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return entries;

    return entries.filter((entry) => {
      const haystack = [
        entry.reference,
        entry.description,
        entry.booking_code,
        entry.business_entity_name,
        entry.seller_name,
        entry.party_type,
        entry.entry_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [entries, search]);

  const summaryCurrency =
    filteredEntries[0]?.currency || "USD";

  async function handleAdjustmentSubmit(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (
      !adjustmentForm.amount ||
      toNumber(adjustmentForm.amount) <= 0 ||
      !adjustmentForm.description.trim()
    ) {
      setState((current) => ({
        ...current,
        error:
          "Enter a valid amount and description for the adjustment.",
      }));
      return;
    }

    const payload: ManualLedgerAdjustmentPayload = {
      debit_party: adjustmentForm.debit_party,
      credit_party: adjustmentForm.credit_party,
      amount: adjustmentForm.amount,
      description: adjustmentForm.description.trim(),
      currency:
        adjustmentForm.currency.trim().toUpperCase() || "USD",
      reference: adjustmentForm.reference.trim(),
      business_entity_id:
        adjustmentForm.business_entity_id || undefined,
      booking_id: adjustmentForm.booking_id
        ? Number(adjustmentForm.booking_id)
        : undefined,
    };

    setSavingAdjustment(true);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      await ticketingApi.createManualLedgerAdjustment(
        payload,
        slug,
      );

      setAdjustmentModalOpen(false);
      setAdjustmentForm(initialAdjustmentForm);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function handleReverseGroup(entryGroup: string) {
    const reason = window.prompt(
      "Enter the reason for reversing this ledger group:",
    )?.trim();

    if (!reason) return;

    setReversingGroup(entryGroup);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      await ticketingApi.reverseLedgerGroup(
        entryGroup,
        reason,
        slug,
      );
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    } finally {
      setReversingGroup(null);
    }
  }

  const groupedByEntryGroup = useMemo(() => {
    const groups = new Map<string, TicketingLedgerEntry[]>();

    filteredEntries.forEach((entry) => {
      const key = entry.entry_group || `entry-${entry.id}`;
      const group = groups.get(key) || [];
      group.push(entry);
      groups.set(key, group);
    });

    return groups;
  }, [filteredEntries]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to={`/ticketing/${slug}/operations/dashboard`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Operations dashboard
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <BookOpenCheck className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                Ticketing Ledger
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                Review append-only financial movements and balances.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setAdjustmentModalOpen(true)}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
          Manual adjustment
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              Ledger operation failed
            </p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {state.error}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Platform", summary?.platform],
          ["Partner", summary?.partner],
          ["Seller", summary?.seller],
          ["Customer", summary?.customer],
        ].map(([label, value]) => (
          <article
            key={String(label)}
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm font-bold text-slate-500">
              {label} balance
            </p>
            <p className="mt-2 text-2xl font-black text-slate-950">
              {formatMoney(value, summaryCurrency)}
            </p>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr_1fr_1fr_1fr_auto]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Search
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Reference, booking or description"
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Business entity
            </span>
            <select
              value={selectedEntityId}
              onChange={(event) =>
                setSelectedEntityId(
                  event.target.value
                    ? Number(event.target.value)
                    : "",
                )
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
            >
              <option value="">All entities</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Party
            </span>
            <select
              value={selectedParty}
              onChange={(event) =>
                setSelectedParty(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
            >
              <option value="">All parties</option>
              <option value="platform">Platform</option>
              <option value="partner">Partner</option>
              <option value="seller">Seller</option>
              <option value="customer">Customer</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              Entry type
            </span>
            <select
              value={selectedEntryType}
              onChange={(event) =>
                setSelectedEntryType(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
            >
              <option value="">All types</option>
              <option value="booking">Booking</option>
              <option value="payment">Payment</option>
              <option value="commission">Commission</option>
              <option value="settlement">Settlement</option>
              <option value="refund">Refund</option>
              <option value="adjustment">Adjustment</option>
              <option value="reversal">Reversal</option>
              <option value="admission">Admission</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              From
            </span>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) =>
                setDateFrom(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              To
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(event) =>
                setDateTo(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => void loadData()}
            className="mt-auto inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                Ledger entries
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {filteredEntries.length} entry
                {filteredEntries.length === 1 ? "" : "ies"}
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm font-black text-slate-500">
              <WalletCards className="h-4 w-4" />
              {groupedByEntryGroup.size} entry group
              {groupedByEntryGroup.size === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading ledger...
            </div>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <BookOpenCheck className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              No ledger entries found
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              Change your filters or create a manual adjustment.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      "Date",
                      "Type",
                      "Party",
                      "Direction",
                      "Amount",
                      "Reference",
                      "Business entity",
                      "Description",
                      "Action",
                    ].map((heading) => (
                      <th
                        key={heading}
                        className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-400"
                      >
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {filteredEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-5 py-4 text-sm font-bold text-slate-600">
                        {formatDateTime(entry.effective_at)}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
                          {formatLabel(entry.entry_type)}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-black capitalize text-slate-800">
                        {entry.party_type}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black capitalize ${
                            entry.direction === "credit"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {entry.direction}
                        </span>
                      </td>

                      <td className="px-5 py-4 font-black text-slate-950">
                        {formatMoney(
                          entry.amount,
                          entry.currency,
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <p className="max-w-[12rem] truncate font-bold text-slate-700">
                          {entry.reference || "—"}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          {entry.booking_code || ""}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span className="max-w-[12rem] truncate font-bold text-slate-700">
                            {entry.business_entity_name || "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="max-w-sm text-sm font-semibold leading-5 text-slate-500">
                          {entry.description}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        {!entry.is_reversed &&
                        entry.entry_type !== "reversal" ? (
                          <button
                            type="button"
                            onClick={() =>
                              void handleReverseGroup(
                                entry.entry_group,
                              )
                            }
                            disabled={
                              reversingGroup === entry.entry_group
                            }
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                          >
                            {reversingGroup ===
                            entry.entry_group ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RotateCcw className="h-4 w-4" />
                            )}
                            Reverse group
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">
                            {entry.is_reversed
                              ? "Reversed"
                              : "Reversal entry"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 xl:hidden">
              {filteredEntries.map((entry) => (
                <article key={entry.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">
                        {entry.description}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {formatDateTime(entry.effective_at)}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-black capitalize ${
                        entry.direction === "credit"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.direction}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Amount
                      </p>
                      <p className="mt-2 font-black text-slate-900">
                        {formatMoney(
                          entry.amount,
                          entry.currency,
                        )}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Party
                      </p>
                      <p className="mt-2 font-black capitalize text-slate-900">
                        {entry.party_type}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Type
                      </p>
                      <p className="mt-2 font-black text-slate-900">
                        {formatLabel(entry.entry_type)}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Reference
                      </p>
                      <p className="mt-2 truncate font-black text-slate-900">
                        {entry.reference || "—"}
                      </p>
                    </div>
                  </div>

                  {!entry.is_reversed &&
                    entry.entry_type !== "reversal" && (
                      <button
                        type="button"
                        onClick={() =>
                          void handleReverseGroup(
                            entry.entry_group,
                          )
                        }
                        disabled={
                          reversingGroup === entry.entry_group
                        }
                        className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700"
                      >
                        {reversingGroup ===
                        entry.entry_group ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Reverse entry group
                      </button>
                    )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {adjustmentModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Manual ledger adjustment
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Post a balanced debit and credit entry.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAdjustmentModalOpen(false)
                }
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleAdjustmentSubmit}
              className="space-y-5 p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Debit party
                  </span>
                  <select
                    value={adjustmentForm.debit_party}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        debit_party: event.target.value as SettlementParty,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="platform">Platform</option>
                    <option value="partner">Partner</option>
                    <option value="seller">Seller</option>
                    <option value="customer">Customer</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Credit party
                  </span>
                  <select
                    value={adjustmentForm.credit_party}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        credit_party: event.target.value as SettlementParty,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="platform">Platform</option>
                    <option value="partner">Partner</option>
                    <option value="seller">Seller</option>
                    <option value="customer">Customer</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Amount
                  </span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={adjustmentForm.amount}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        amount: event.target.value,
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black text-slate-900 outline-none"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Currency
                  </span>
                  <input
                    value={adjustmentForm.currency}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        currency:
                          event.target.value.toUpperCase(),
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-black uppercase text-slate-900 outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Description
                </span>
                <textarea
                  value={adjustmentForm.description}
                  onChange={(event) =>
                    setAdjustmentForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={3}
                  required
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Business entity
                  </span>
                  <select
                    value={adjustmentForm.business_entity_id}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        business_entity_id:
                          Number(event.target.value) || "",
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="">No entity</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Booking ID
                  </span>
                  <input
                    type="number"
                    min="1"
                    value={adjustmentForm.booking_id}
                    onChange={(event) =>
                      setAdjustmentForm((current) => ({
                        ...current,
                        booking_id: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Reference
                </span>
                <input
                  value={adjustmentForm.reference}
                  onChange={(event) =>
                    setAdjustmentForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() =>
                    setAdjustmentModalOpen(false)
                  }
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={
                    savingAdjustment ||
                    adjustmentForm.debit_party ===
                      adjustmentForm.credit_party ||
                    toNumber(adjustmentForm.amount) <= 0 ||
                    !adjustmentForm.description.trim()
                  }
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingAdjustment && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  Post adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
