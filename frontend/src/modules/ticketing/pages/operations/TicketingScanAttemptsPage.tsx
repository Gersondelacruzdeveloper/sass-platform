// src/modules/ticketing/pages/operations/TicketingScanAttemptsPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  CircleAlert,
  Clock3,
  Loader2,
  QrCode,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  TicketScanAttempt,
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

function getErrorMessage(error: unknown, fallback: string): string {
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

function formatDateTime(
  value: string | null | undefined,
  language: "en" | "es",
): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(
    language === "es" ? "es-DO" : "en-US",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(date);
}

function formatResultLabel(
  value: string | null | undefined,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  const normalized = String(value || "unknown");
  return t(`scanAttempts.results.${normalized}`);
}

function resultTone(result?: string | null) {
  const value = String(result || "");

  if (["valid", "admitted", "partially_used"].includes(value)) {
    return {
      badge: "bg-emerald-100 text-emerald-700",
      icon: ShieldCheck,
      iconWrap: "bg-emerald-100 text-emerald-700",
    };
  }

  if (["already_used", "wrong_date"].includes(value)) {
    return {
      badge: "bg-amber-100 text-amber-700",
      icon: ShieldAlert,
      iconWrap: "bg-amber-100 text-amber-700",
    };
  }

  return {
    badge: "bg-rose-100 text-rose-700",
    icon: ShieldAlert,
    iconWrap: "bg-rose-100 text-rose-700",
  };
}

export default function TicketingScanAttemptsPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const [scanAttempts, setScanAttempts] = useState<
    TicketScanAttempt[]
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
  const [selectedResult, setSelectedResult] = useState("");
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [attemptData, entityData] = await Promise.all([
        ticketingApi.getScanAttempts(slug, {
          business_entity: selectedEntityId || undefined,
          result: selectedResult || undefined,
          date: selectedDate || undefined,
        }),
        ticketingApi.getBusinessEntities(slug, {
          is_active: true,
        }),
      ]);

      setScanAttempts(attemptData);
      setEntities(entityData);
      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error, t("scanAttempts.errors.load")),
      });
    }
  }, [
    selectedDate,
    selectedEntityId,
    selectedResult,
    slug,
    t,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filteredAttempts = useMemo(() => {
    const needle = search.trim().toLowerCase();

    if (!needle) return scanAttempts;

    return scanAttempts.filter((attempt) => {
      const haystack = [
        attempt.booking_code,
        attempt.product_name,
        attempt.business_entity_name,
        attempt.scanned_by_email,
        attempt.scanner_device_id,
        attempt.scanner_name,
        attempt.location_name,
        attempt.failure_reason,
        attempt.scanned_value,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(needle);
    });
  }, [scanAttempts, search]);

  const summary = useMemo(() => {
    return filteredAttempts.reduce(
      (accumulator, attempt) => {
        accumulator.total += 1;

        if (
          ["valid", "admitted", "partially_used"].includes(
            String(attempt.result),
          )
        ) {
          accumulator.successful += 1;
        } else {
          accumulator.failed += 1;
        }

        if (attempt.offline_event_id) {
          accumulator.offline += 1;
        }

        return accumulator;
      },
      {
        total: 0,
        successful: 0,
        failed: 0,
        offline: 0,
      },
    );
  }, [filteredAttempts]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <Link
            to={`/ticketing/${slug}/operations/dashboard`}
            className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("scanAttempts.navigation.operationsDashboard")}
          </Link>

          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
              <QrCode className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {t("scanAttempts.title")}
              </h1>
              <p className="mt-1 text-sm font-semibold text-white/50">
                {t("scanAttempts.subtitle")}
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
        >
          <RefreshCw className="h-4 w-4" />
          {t("scanAttempts.actions.refresh")}
        </button>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("scanAttempts.errors.title")}
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
            {t("scanAttempts.stats.total")}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {summary.total}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("scanAttempts.stats.successful")}
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {summary.successful}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("scanAttempts.stats.failed")}
          </p>
          <p className="mt-2 text-2xl font-black text-rose-700">
            {summary.failed}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("scanAttempts.stats.offline")}
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {summary.offline}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr]">
          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("scanAttempts.filters.businessEntity")}
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
              <option value="">{t("scanAttempts.filters.allEntities")}</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("scanAttempts.filters.result")}
            </span>
            <select
              value={selectedResult}
              onChange={(event) =>
                setSelectedResult(event.target.value)
              }
              className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
            >
              <option value="">{t("scanAttempts.filters.allResults")}</option>
              <option value="valid">{t("scanAttempts.results.valid")}</option>
              <option value="admitted">{t("scanAttempts.results.admitted")}</option>
              <option value="partially_used">
                {t("scanAttempts.results.partially_used")}
              </option>
              <option value="already_used">
                {t("scanAttempts.results.already_used")}
              </option>
              <option value="invalid">{t("scanAttempts.results.invalid")}</option>
              <option value="not_found">{t("scanAttempts.results.not_found")}</option>
              <option value="expired">{t("scanAttempts.results.expired")}</option>
              <option value="revoked">{t("scanAttempts.results.revoked")}</option>
              <option value="wrong_partner">
                {t("scanAttempts.results.wrong_partner")}
              </option>
              <option value="wrong_date">{t("scanAttempts.results.wrong_date")}</option>
              <option value="unauthorised">
                {t("scanAttempts.results.unauthorised")}
              </option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-black text-slate-700">
              {t("scanAttempts.filters.date")}
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
              {t("scanAttempts.filters.search")}
            </span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder={t("scanAttempts.filters.searchPlaceholder")}
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
                {t("scanAttempts.directory.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {t(
                  filteredAttempts.length === 1
                    ? "scanAttempts.directory.oneRecord"
                    : "scanAttempts.directory.records",
                  { count: filteredAttempts.length },
                )}
              </p>
            </div>

            <Link
              to={`/ticketing/${slug}/operations/scanner`}
              className="inline-flex h-11 items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-900"
            >
              {t("scanAttempts.actions.openScanner")}
            </Link>
          </div>
        </div>

        {state.loading ? (
          <div className="flex min-h-72 items-center justify-center">
            <div className="flex items-center gap-3 text-sm font-black text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("scanAttempts.loading")}
            </div>
          </div>
        ) : filteredAttempts.length === 0 ? (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center">
            <QrCode className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              {t("scanAttempts.empty.title")}
            </p>
            <p className="mt-2 max-w-md text-sm font-semibold text-slate-400">
              {t("scanAttempts.empty.description")}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      t("scanAttempts.table.result"),
                      t("scanAttempts.table.booking"),
                      t("scanAttempts.table.businessEntity"),
                      t("scanAttempts.table.quantity"),
                      t("scanAttempts.table.scanner"),
                      t("scanAttempts.table.scannedAt"),
                      t("scanAttempts.table.details"),
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
                  {filteredAttempts.map((attempt) => {
                    const tone = resultTone(attempt.result);
                    const ResultIcon = tone.icon;

                    return (
                      <tr key={attempt.id}>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-2xl ${tone.iconWrap}`}
                            >
                              <ResultIcon className="h-5 w-5" />
                            </div>

                            <span
                              className={`rounded-full px-3 py-1 text-xs font-black ${tone.badge}`}
                            >
                              {formatResultLabel(
                                attempt.result,
                                t,
                              )}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900">
                            {attempt.booking_code || "—"}
                          </p>
                          <p className="mt-1 max-w-xs truncate text-xs font-semibold text-slate-400">
                            {attempt.product_name || t("scanAttempts.labels.noProduct")}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            <span className="font-bold text-slate-700">
                              {attempt.business_entity_name ||
                                "—"}
                            </span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="font-black text-slate-900">
                            {attempt.admitted_quantity}/
                            {attempt.requested_quantity}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-slate-400">
                            {t("scanAttempts.labels.admittedRequested")}
                          </p>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-start gap-2">
                            <Smartphone className="mt-0.5 h-4 w-4 text-slate-400" />
                            <div>
                              <p className="font-bold text-slate-700">
                                {attempt.scanner_name ||
                                  t("scanAttempts.labels.unknownScanner")}
                              </p>
                              <p className="mt-1 max-w-[14rem] truncate text-xs font-semibold text-slate-400">
                                {attempt.scanner_device_id ||
                                  attempt.scanned_by_email ||
                                  "—"}
                              </p>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm font-bold text-slate-600">
                            <Clock3 className="h-4 w-4 text-slate-400" />
                            {formatDateTime(
                              attempt.scanned_at,
                              language,
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <p className="max-w-sm text-sm font-semibold leading-5 text-slate-500">
                            {attempt.failure_reason ||
                              attempt.location_name ||
                              t("scanAttempts.labels.scanCompleted")}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 xl:hidden">
              {filteredAttempts.map((attempt) => {
                const tone = resultTone(attempt.result);
                const ResultIcon = tone.icon;

                return (
                  <article key={attempt.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tone.iconWrap}`}
                        >
                          <ResultIcon className="h-5 w-5" />
                        </div>

                        <div className="min-w-0">
                          <p className="truncate font-black text-slate-950">
                            {attempt.booking_code ||
                              t("scanAttempts.labels.unresolvedTicket")}
                          </p>
                          <p className="mt-1 truncate text-sm font-bold text-slate-500">
                            {attempt.product_name ||
                              formatResultLabel(
                                attempt.result,
                                t,
                              )}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${tone.badge}`}
                      >
                        {formatResultLabel(attempt.result, t)}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm">
                      <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-400">
                          {t("scanAttempts.table.entity")}
                        </span>
                        <span className="text-right font-black text-slate-800">
                          {attempt.business_entity_name || "—"}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-400">
                          {t("scanAttempts.table.quantity")}
                        </span>
                        <span className="font-black text-slate-800">
                          {attempt.admitted_quantity}/
                          {attempt.requested_quantity}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-400">
                          {t("scanAttempts.table.scanner")}
                        </span>
                        <span className="max-w-[60%] truncate text-right font-black text-slate-800">
                          {attempt.scanner_name ||
                            attempt.scanner_device_id ||
                            "—"}
                        </span>
                      </div>

                      <div className="flex justify-between gap-4">
                        <span className="font-bold text-slate-400">
                          {t("scanAttempts.table.time")}
                        </span>
                        <span className="text-right font-black text-slate-800">
                          {formatDateTime(attempt.scanned_at, language)}
                        </span>
                      </div>
                    </div>

                    {(attempt.failure_reason ||
                      attempt.location_name) && (
                      <p className="mt-4 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-sm font-semibold leading-5 text-slate-500">
                        {attempt.failure_reason ||
                          attempt.location_name}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
