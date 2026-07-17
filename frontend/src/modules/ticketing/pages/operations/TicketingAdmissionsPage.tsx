// src/modules/ticketing/pages/operations/TicketingAdmissionsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CalendarCheck2,
  CircleAlert,
  Clock3,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  Users,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  TicketAdmission,
  TicketingBusinessEntity,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateTime(
  value: string | null | undefined,
  language: "en" | "es",
): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      dateStyle: "medium",
      timeStyle: "short",
    },
  ).format(date);
}

function getErrorMessage(
  error: unknown,
  fallback: string,
): string {
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
      fallback
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default function TicketingAdmissionsPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const [admissions, setAdmissions] = useState<TicketAdmission[]>(
    [],
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
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [selectedStatus, setSelectedStatus] = useState("");
  const [search, setSearch] = useState("");

  const [reversingAdmission, setReversingAdmission] =
    useState<TicketAdmission | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [submittingReversal, setSubmittingReversal] =
    useState(false);

  const loadAdmissions = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [admissionData, entityData] = await Promise.all([
        ticketingApi.getAdmissions(slug, {
          business_entity: selectedEntityId || undefined,
          service_date: selectedDate || undefined,
          status: selectedStatus || undefined,
        }),
        ticketingApi.getBusinessEntities(slug, {
          is_active: true,
        }),
      ]);

      setAdmissions(admissionData);
      setEntities(entityData);
      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(
          error,
          t("admissions.errors.load"),
        ),
      });
    }
  }, [
    selectedDate,
    selectedEntityId,
    selectedStatus,
    slug,
    t,
  ]);

  useEffect(() => {
    void loadAdmissions();
  }, [loadAdmissions]);

  const filteredAdmissions = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return admissions;

    return admissions.filter((admission) => {
      const haystack = [
        admission.booking_code,
        admission.product_name,
        admission.business_entity_name,
        admission.admitted_by_email,
        admission.location_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [admissions, search]);

  const totals = useMemo(() => {
    return filteredAdmissions.reduce(
      (accumulator, admission) => {
        if (admission.status === "admitted") {
          accumulator.activeAdmissions += 1;
          accumulator.guests += admission.quantity_admitted;
        } else if (admission.status === "reversed") {
          accumulator.reversed += 1;
        }

        return accumulator;
      },
      {
        activeAdmissions: 0,
        guests: 0,
        reversed: 0,
      },
    );
  }, [filteredAdmissions]);

  async function handleReverseAdmission(event: FormEvent) {
    event.preventDefault();

    if (!reversingAdmission) return;

    const reason = reversalReason.trim();
    if (!reason) return;

    setSubmittingReversal(true);

    try {
      await ticketingApi.reverseAdmission(
        reversingAdmission.id,
        {
          reason,
        },
        slug,
      );

      setReversingAdmission(null);
      setReversalReason("");
      await loadAdmissions();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(
          error,
          t("admissions.errors.reverse"),
        ),
      }));
    } finally {
      setSubmittingReversal(false);
    }
  }

  const numberLocale = language === "es" ? "es-DO" : "en-US";

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to={`/ticketing/${slug}/operations/dashboard`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("admissions.navigation.operationsDashboard")}
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <CalendarCheck2 className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {t("admissions.title")}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                {t("admissions.subtitle")}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadAdmissions()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
        >
          <RefreshCw className="h-4 w-4" />
          {t("admissions.actions.refresh")}
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("admissions.errors.title")}
            </p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {state.error}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                {t("admissions.stats.activeEvents")}
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {totals.activeAdmissions.toLocaleString(numberLocale)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
              <CalendarCheck2 className="h-5 w-5" />
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                {t("admissions.stats.guestsAdmitted")}
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {totals.guests.toLocaleString(numberLocale)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Users className="h-5 w-5" />
            </div>
          </div>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-slate-500">
                {t("admissions.stats.reversedAdmissions")}
              </p>
              <p className="mt-2 text-2xl font-black text-slate-950">
                {totals.reversed.toLocaleString(numberLocale)}
              </p>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <RotateCcw className="h-5 w-5" />
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("admissions.filters.businessEntity")}
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
              <option value="">
                {t("admissions.filters.allEntities")}
              </option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("admissions.filters.admissionDate")}
            </span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("admissions.filters.status")}
            </span>
            <select
              value={selectedStatus}
              onChange={(event) =>
                setSelectedStatus(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">
                {t("admissions.filters.allStatuses")}
              </option>
              <option value="admitted">
                {t("admissions.statuses.admitted")}
              </option>
              <option value="reversed">
                {t("admissions.statuses.reversed")}
              </option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("admissions.filters.search")}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={t("admissions.filters.searchPlaceholder")}
                className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
              />
            </div>
          </label>
        </div>
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {t("admissions.history.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {t(
                  filteredAdmissions.length === 1
                    ? "admissions.history.oneRecord"
                    : "admissions.history.records",
                  {
                    count: filteredAdmissions.length,
                  },
                )}
              </p>
            </div>

            <Link
              to={`/ticketing/${slug}/operations/scanner`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900"
            >
              {t("admissions.actions.openScanner")}
            </Link>
          </div>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("admissions.loading")}
            </div>
          </div>
        ) : filteredAdmissions.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <CalendarCheck2 className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              {t("admissions.empty.title")}
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              {t("admissions.empty.description")}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      t("admissions.table.booking"),
                      t("admissions.table.product"),
                      t("admissions.table.businessEntity"),
                      t("admissions.table.guests"),
                      t("admissions.table.admittedAt"),
                      t("admissions.table.status"),
                      t("admissions.table.action"),
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
                  {filteredAdmissions.map((admission) => (
                    <tr key={admission.id}>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900">
                          {admission.booking_code}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-slate-400">
                          #{admission.id}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="max-w-xs font-bold text-slate-800">
                          {admission.product_name || "—"}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-400" />
                          <span className="font-bold text-slate-700">
                            {admission.business_entity_name ||
                              "—"}
                          </span>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex min-w-10 items-center justify-center rounded-xl bg-slate-100 px-3 py-1 text-sm font-black text-slate-800">
                          {admission.quantity_admitted}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                          <Clock3 className="h-4 w-4 text-slate-400" />
                          {formatDateTime(
                            admission.admitted_at,
                            language,
                          )}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-black capitalize ${
                            admission.status === "admitted"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {t(
                            `admissions.statuses.${admission.status}`,
                            undefined,
                            admission.status,
                          )}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {admission.status === "admitted" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setReversingAdmission(admission);
                              setReversalReason("");
                            }}
                            className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 transition hover:bg-rose-100"
                          >
                            <RotateCcw className="h-4 w-4" />
                            {t("admissions.actions.reverse")}
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">
                            {t("admissions.statuses.reversed")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 lg:hidden">
              {filteredAdmissions.map((admission) => (
                <article key={admission.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black text-slate-950">
                        {admission.booking_code}
                      </p>
                      <p className="mt-1 truncate text-sm font-bold text-slate-600">
                        {admission.product_name || "—"}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black capitalize ${
                        admission.status === "admitted"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {t(
                        `admissions.statuses.${admission.status}`,
                        undefined,
                        admission.status,
                      )}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold text-slate-400">
                        {t("admissions.mobile.entity")}
                      </span>
                      <span className="text-right font-black text-slate-800">
                        {admission.business_entity_name || "—"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold text-slate-400">
                        {t("admissions.mobile.guests")}
                      </span>
                      <span className="font-black text-slate-800">
                        {admission.quantity_admitted}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <span className="font-bold text-slate-400">
                        {t("admissions.mobile.time")}
                      </span>
                      <span className="text-right font-black text-slate-800">
                        {formatDateTime(
                          admission.admitted_at,
                          language,
                        )}
                      </span>
                    </div>
                  </div>

                  {admission.status === "admitted" && (
                    <button
                      type="button"
                      onClick={() => {
                        setReversingAdmission(admission);
                        setReversalReason("");
                      }}
                      className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t("admissions.actions.reverseAdmission")}
                    </button>
                  )}
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      {reversingAdmission && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[2rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700">
                <RotateCcw className="h-5 w-5" />
              </div>

              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {t("admissions.reversal.title")}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {t("admissions.reversal.description", {
                    code: reversingAdmission.booking_code,
                  })}
                </p>
              </div>
            </div>

            <form
              onSubmit={handleReverseAdmission}
              className="mt-6 space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {t("admissions.reversal.reason")}
                </span>
                <textarea
                  value={reversalReason}
                  onChange={(event) =>
                    setReversalReason(event.target.value)
                  }
                  rows={4}
                  placeholder={t(
                    "admissions.reversal.placeholder",
                  )}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setReversingAdmission(null);
                    setReversalReason("");
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
                >
                  {t("admissions.actions.cancel")}
                </button>

                <button
                  type="submit"
                  disabled={
                    submittingReversal ||
                    !reversalReason.trim()
                  }
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-rose-700 px-4 text-sm font-black text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingReversal && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t("admissions.actions.confirmReversal")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
