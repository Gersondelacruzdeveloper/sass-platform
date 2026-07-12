// src/modules/ticketing/pages/operations/TicketingSettlementsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type * as React from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CircleAlert,
  Eye,
  FileSearch2,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  WalletCards,
  X,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  PartnerSettlementPeriod,
  SettlementGeneratePayload,
  SettlementPreview,
  TicketingBusinessEntity,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type GenerateFormState = {
  business_entity_id: number | "";
  period_start: string;
  period_end: string;
  notes: string;
  regenerate_draft: boolean;
};


function getDefaultPeriod() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 9);

  return {
    period_start: start.toISOString().slice(0, 10),
    period_end: end.toISOString().slice(0, 10),
  };
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
      "Could not process settlements."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Could not process settlements.";
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

function formatStatus(value?: string | null): string {
  return String(value || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusTone(status?: string | null) {
  switch (status) {
    case "settled":
      return "bg-emerald-100 text-emerald-700";
    case "approved":
      return "bg-blue-100 text-blue-700";
    case "partially_paid":
      return "bg-amber-100 text-amber-700";
    case "review":
      return "bg-violet-100 text-violet-700";
    case "disputed":
      return "bg-rose-100 text-rose-700";
    case "cancelled":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function TicketingSettlementsPage() {
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const defaults = useMemo(() => getDefaultPeriod(), []);

  const [settlements, setSettlements] = useState<
    PartnerSettlementPeriod[]
  >([]);
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
  const [selectedStatus, setSelectedStatus] = useState("");
  const [search, setSearch] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<GenerateFormState>({
    business_entity_id: "",
    period_start: defaults.period_start,
    period_end: defaults.period_end,
    notes: "",
    regenerate_draft: false,
  });

  const [preview, setPreview] =
    useState<SettlementPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [settlementData, entityData] = await Promise.all([
        ticketingApi.getPartnerSettlements(slug, {
          business_entity: selectedEntityId || undefined,
          status: selectedStatus || undefined,
        }),
        ticketingApi.getBusinessEntities(slug, {
          is_active: true,
        }),
      ]);

      setSettlements(settlementData);
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
  }, [selectedEntityId, selectedStatus, slug]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredSettlements = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return settlements;

    return settlements.filter((settlement) => {
      const haystack = [
        settlement.settlement_number,
        settlement.business_entity_name,
        settlement.status,
        settlement.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [search, settlements]);

  const summary = useMemo(() => {
    return filteredSettlements.reduce(
      (accumulator, settlement) => {
        accumulator.total += 1;
        accumulator.outstanding += toNumber(
          settlement.outstanding_amount,
        );
        accumulator.net += toNumber(
          settlement.net_settlement_amount,
        );

        if (settlement.status === "settled") {
          accumulator.settled += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        settled: 0,
        outstanding: 0,
        net: 0,
      },
    );
  }, [filteredSettlements]);

  const summaryCurrency =
    filteredSettlements[0]?.currency || "USD";

  function openGenerateModal() {
    setPreview(null);
    setForm({
      business_entity_id: selectedEntityId || "",
      period_start: defaults.period_start,
      period_end: defaults.period_end,
      notes: "",
      regenerate_draft: false,
    });
    setModalOpen(true);
  }

  function buildPayload(): SettlementGeneratePayload | null {
    if (!form.business_entity_id) {
      setState((current) => ({
        ...current,
        error: "Select a business entity.",
      }));
      return null;
    }

    if (!form.period_start || !form.period_end) {
      setState((current) => ({
        ...current,
        error: "Select both the period start and end dates.",
      }));
      return null;
    }

    return {
      business_entity_id: Number(form.business_entity_id),
      period_start: form.period_start,
      period_end: form.period_end,
      regenerate_draft: form.regenerate_draft,
      notes: form.notes.trim(),
    };
  }

const handlePreview: React.FormEventHandler<HTMLFormElement> = async (
  event,
) => {
  event.preventDefault();

  const payload = buildPayload();
  if (!payload) return;

  setPreviewing(true);
  setState((current) => ({
    ...current,
    error: "",
  }));

  try {
    const data = await ticketingApi.previewPartnerSettlement(
      payload,
      slug,
    );
    setPreview(data);
  } catch (error) {
    setState((current) => ({
      ...current,
      error: getErrorMessage(error),
    }));
  } finally {
    setPreviewing(false);
  }
};

  async function handleGenerate() {
    const payload = buildPayload();
    if (!payload) return;

    setGenerating(true);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      await ticketingApi.generatePartnerSettlement(
        payload,
        slug,
      );

      setModalOpen(false);
      setPreview(null);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error),
      }));
    } finally {
      setGenerating(false);
    }
  }

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
              <WalletCards className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                Settlement Center
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                Generate, review and reconcile partner settlements.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={openGenerateModal}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
        >
          <Plus className="h-4 w-4" />
          Generate settlement
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              Settlement operation failed
            </p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {state.error}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Settlement records
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {summary.total}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Settled periods
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {summary.settled}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Outstanding total
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {formatMoney(
              summary.outstanding,
              summaryCurrency,
            )}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Net settlement value
          </p>
          <p className="mt-2 text-2xl font-black text-blue-700">
            {formatMoney(summary.net, summaryCurrency)}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto]">
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
                placeholder="Settlement number or partner"
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
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
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
              Status
            </span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">All statuses</option>
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="partially_paid">
                Partially paid
              </option>
              <option value="settled">Settled</option>
              <option value="disputed">Disputed</option>
              <option value="cancelled">Cancelled</option>
            </select>
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
          <h2 className="text-xl font-black text-slate-950">
            Settlement history
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {filteredSettlements.length} record
            {filteredSettlements.length === 1 ? "" : "s"}
          </p>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading settlements...
            </div>
          </div>
        ) : filteredSettlements.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <WalletCards className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              No settlements found
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              Generate a partner settlement for a selected period.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            {filteredSettlements.map((settlement) => (
              <article
                key={settlement.id}
                className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-black text-slate-950">
                      {settlement.settlement_number}
                    </p>
                    <p className="mt-1 flex items-center gap-2 text-sm font-bold text-slate-500">
                      <Building2 className="h-4 w-4 text-slate-400" />
                      {settlement.business_entity_name}
                    </p>
                  </div>

                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${statusTone(
                      settlement.status,
                    )}`}
                  >
                    {formatStatus(settlement.status)}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-2 text-sm font-bold text-slate-500">
                  <CalendarDays className="h-4 w-4 text-slate-400" />
                  {settlement.period_start} —{" "}
                  {settlement.period_end}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Net amount
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {formatMoney(
                        settlement.net_settlement_amount,
                        settlement.currency,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Outstanding
                    </p>
                    <p className="mt-2 text-lg font-black text-amber-700">
                      {formatMoney(
                        settlement.outstanding_amount,
                        settlement.currency,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      Guests admitted
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {settlement.total_guests_admitted}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                      No shows
                    </p>
                    <p className="mt-2 text-lg font-black text-slate-950">
                      {settlement.total_no_shows}
                    </p>
                  </div>
                </div>

                <Link
                  to={`/ticketing/${slug}/operations/settlements/${settlement.id}`}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900"
                >
                  Open settlement
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            ))}
          </div>
        )}
      </section>

      {modalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  Generate settlement
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Preview the period before creating the draft.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  setPreview(null);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handlePreview}
              className="space-y-6 p-6"
            >
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Business entity
                  </span>
                  <select
                    value={form.business_entity_id}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        business_entity_id:
                          Number(event.target.value) || "",
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  >
                    <option value="">Select entity</option>
                    {entities.map((entity) => (
                      <option key={entity.id} value={entity.id}>
                        {entity.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Period start
                  </span>
                  <input
                    type="date"
                    value={form.period_start}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        period_start: event.target.value,
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    Period end
                  </span>
                  <input
                    type="date"
                    value={form.period_end}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        period_end: event.target.value,
                      }))
                    }
                    required
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Optional settlement note..."
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-4">
                <span className="text-sm font-black text-slate-700">
                  Regenerate an existing draft
                </span>
                <input
                  type="checkbox"
                  checked={form.regenerate_draft}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      regenerate_draft:
                        event.target.checked,
                    }))
                  }
                  className="h-5 w-5 rounded border-slate-300"
                />
              </label>

              <button
                type="submit"
                disabled={
                  previewing ||
                  !form.business_entity_id ||
                  !form.period_start ||
                  !form.period_end
                }
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {previewing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                Preview settlement
              </button>

              {preview && (
                <div className="space-y-4 rounded-[1.75rem] bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                      <FileSearch2 className="h-5 w-5" />
                    </div>

                    <div>
                      <p className="font-black text-slate-950">
                        Settlement preview
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {preview.business_entity_name}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Bookings
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {preview.total_bookings}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Guests admitted
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {preview.total_guests_admitted}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        No shows
                      </p>
                      <p className="mt-2 text-lg font-black text-slate-950">
                        {preview.total_no_shows}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-white p-4 shadow-sm">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                        Net amount
                      </p>
                      <p className="mt-2 text-lg font-black text-blue-700">
                        {formatMoney(
                          preview.totals.net_settlement_amount,
                          preview.currency,
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleGenerate()}
                    disabled={generating}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generating && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    Generate draft settlement
                  </button>
                </div>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
