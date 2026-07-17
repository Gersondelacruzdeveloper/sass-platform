// src/modules/ticketing/pages/operations/TicketingOperationsDashboardPage.tsx

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CircleAlert,
  Clock3,
  Loader2,
  QrCode,
  RefreshCw,
  ScanLine,
  Users,
  WalletCards,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  AdmissionsDashboard,
  PartnerSettlementPeriod,
  TicketingBusinessEntity,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

function toNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(
  value: string | number | null | undefined,
  currency = "USD",
  language: "en" | "es" = "en",
): string {
  return new Intl.NumberFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    },
  ).format(toNumber(value));
}

function formatTime(
  value?: string | null,
  language: "en" | "es" = "en",
): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(
    language === "es" ? "es-DO" : "en-US",
    {
      hour: "numeric",
      minute: "2-digit",
    },
  ).format(date);
}

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

export default function TicketingOperationsDashboardPage() {
  const { language, t } = useTicketingAdminTranslation();
  const {
    slug,
    companyName,
  } = useOutletContext<TicketingDashboardOutletContext>();

  const [dashboard, setDashboard] =
    useState<AdmissionsDashboard | null>(null);
  const [entities, setEntities] = useState<
    TicketingBusinessEntity[]
  >([]);
  const [settlements, setSettlements] = useState<
    PartnerSettlementPeriod[]
  >([]);
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const today = useMemo(() => getToday(), []);

  const loadDashboard = useCallback(async () => {
    if (!slug) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [
        dashboardData,
        entityData,
        settlementData,
      ] = await Promise.all([
        ticketingApi.getAdmissionsDashboard(slug, {
          date: today,
        }),
        ticketingApi.getBusinessEntities(slug, {
          is_active: true,
        }),
        ticketingApi.getPartnerSettlements(slug, {
          status: "approved",
        }),
      ]);

      setDashboard(dashboardData);
      setEntities(entityData);
      setSettlements(settlementData);
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error, t("operationsDashboard.errors.load")),
      });
      return;
    }

    setState({
      loading: false,
      error: "",
    });
  }, [slug, t, today]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const totalEntities = entities.length;
  const admittedGuests = dashboard?.guests_admitted ?? 0;
  const admissionEvents = dashboard?.admission_events ?? 0;

  const invalidScans = useMemo(() => {
    return (
      dashboard?.scan_results
        .filter((item) =>
          [
            "invalid",
            "not_found",
            "expired",
            "revoked",
            "wrong_partner",
            "wrong_date",
            "unauthorised",
          ].includes(String(item.result)),
        )
        .reduce((total, item) => total + item.total, 0) ?? 0
    );
  }, [dashboard]);

  const outstandingSettlementAmount = useMemo(() => {
    return settlements.reduce(
      (total, settlement) =>
        total + toNumber(settlement.outstanding_amount),
      0,
    );
  }, [settlements]);

  const settlementCurrency =
    settlements[0]?.currency || "USD";

  const numberLocale = language === "es" ? "es-DO" : "en-US";

  const statCards = [
    {
      label: t("operationsDashboard.stats.guestsAdmitted"),
      value: admittedGuests.toLocaleString(numberLocale),
      supporting: t(
        admissionEvents === 1
          ? "operationsDashboard.stats.oneAdmissionEvent"
          : "operationsDashboard.stats.admissionEvents",
        {
          count: admissionEvents.toLocaleString(numberLocale),
        },
      ),
      icon: Users,
      iconClass: "bg-emerald-100 text-emerald-700",
    },
    {
      label: t("operationsDashboard.stats.activeEntities"),
      value: totalEntities.toLocaleString(numberLocale),
      supporting: t("operationsDashboard.stats.entitiesHelp"),
      icon: Building2,
      iconClass: "bg-blue-100 text-blue-700",
    },
    {
      label: t("operationsDashboard.stats.invalidScans"),
      value: invalidScans.toLocaleString(numberLocale),
      supporting:
        invalidScans > 0
          ? t("operationsDashboard.stats.reviewScanHistory")
          : t("operationsDashboard.stats.noScanIssues"),
      icon: CircleAlert,
      iconClass:
        invalidScans > 0
          ? "bg-rose-100 text-rose-700"
          : "bg-slate-100 text-slate-600",
    },
    {
      label: t("operationsDashboard.stats.approvedSettlements"),
      value: formatMoney(
        outstandingSettlementAmount,
        settlementCurrency,
        language,
      ),
      supporting: t(
        settlements.length === 1
          ? "operationsDashboard.stats.oneOpenSettlement"
          : "operationsDashboard.stats.openSettlements",
        {
          count: settlements.length,
        },
      ),
      icon: WalletCards,
      iconClass: "bg-amber-100 text-amber-700",
    },
  ];

  if (state.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
          <span className="text-sm font-black text-slate-700">
            {t("operationsDashboard.loading")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-white/60">
              <Activity className="h-4 w-4" />
              {t("operationsDashboard.hero.eyebrow")}
            </div>

            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
              {t("operationsDashboard.hero.title")}
            </h1>

            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/60 sm:text-base">
              {t("operationsDashboard.hero.subtitle", { company: companyName })}
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadDashboard()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-black text-slate-950 transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" />
            {t("operationsDashboard.actions.refresh")}
          </button>
        </div>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("operationsDashboard.errors.title")}
            </p>
            <p className="mt-1 text-sm font-semibold text-rose-700">
              {state.error}
            </p>
          </div>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <article
              key={card.label}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-500">
                    {card.label}
                  </p>
                  <p className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {card.value}
                  </p>
                </div>

                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${card.iconClass}`}
                >
                  <Icon className="h-5 w-5" />
                </div>
              </div>

              <p className="mt-4 text-xs font-bold text-slate-400">
                {card.supporting}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("operationsDashboard.sections.today")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("operationsDashboard.sections.admissionsByEntity")}
              </h2>
            </div>

            <Link
              to={`/ticketing/${slug}/operations/admissions`}
              className="inline-flex items-center gap-2 text-sm font-black text-slate-700 transition hover:text-slate-950"
            >
              {t("operationsDashboard.actions.viewAdmissions")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-6 space-y-3">
            {dashboard?.by_business_entity?.length ? (
              dashboard.by_business_entity.map((item) => (
                <div
                  key={item.business_entity_id}
                  className="flex flex-col gap-4 rounded-3xl border border-slate-100 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm">
                      <Building2 className="h-5 w-5" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">
                        {item.business_entity__name ||
                          t("operationsDashboard.fallbacks.businessEntity")}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {t(
                          item.admissions === 1
                            ? "operationsDashboard.labels.oneAdmissionEvent"
                            : "operationsDashboard.labels.admissionEvents",
                          { count: item.admissions },
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-emerald-100 px-4 py-2 text-center">
                    <p className="text-lg font-black text-emerald-800">
                      {item.guests}
                    </p>
                    <p className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                      {t("operationsDashboard.labels.guests")}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-12 text-center">
                <CalendarCheck2 className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-black text-slate-700">
                  {t("operationsDashboard.empty.noAdmissionsToday")}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {t("operationsDashboard.empty.checkinsAppear")}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              {t("operationsDashboard.sections.quickActions")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {t("operationsDashboard.sections.runOperations")}
            </h2>
          </div>

          <div className="mt-6 space-y-3">
            <Link
              to={`/ticketing/${slug}/operations/scanner`}
              className="group flex items-center justify-between rounded-3xl bg-slate-950 p-4 text-white transition hover:bg-slate-900"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                  <ScanLine className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black">{t("operationsDashboard.actions.openScanner")}</p>
                  <p className="mt-1 text-xs font-semibold text-white/50">
                    {t("operationsDashboard.actions.openScannerHelp")}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
            </Link>

            <Link
              to={`/ticketing/${slug}/operations/business-entities`}
              className="group flex items-center justify-between rounded-3xl border border-slate-200 p-4 transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-slate-950">
                    {t("operationsDashboard.actions.managePartners")}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {t("operationsDashboard.actions.managePartnersHelp")}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1" />
            </Link>

            <Link
              to={`/ticketing/${slug}/operations/settlements`}
              className="group flex items-center justify-between rounded-3xl border border-slate-200 p-4 transition hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <WalletCards className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-black text-slate-950">
                    {t("operationsDashboard.actions.settlementCenter")}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-slate-400">
                    {t("operationsDashboard.actions.settlementCenterHelp")}
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1" />
            </Link>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("operationsDashboard.sections.recentActivity")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("operationsDashboard.sections.latestAdmissions")}
              </h2>
            </div>

            <CalendarCheck2 className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 divide-y divide-slate-100">
            {dashboard?.latest_admissions?.length ? (
              dashboard.latest_admissions
                .slice(0, 8)
                .map((admission) => (
                  <div
                    key={admission.id}
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-900">
                        {admission.product_name ||
                          admission.booking_code}
                      </p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                        {admission.business_entity_name ||
                          t("operationsDashboard.fallbacks.businessEntity")}{" "}
                        ·{" "}
                        {t(
                          admission.quantity_admitted === 1
                            ? "operationsDashboard.labels.oneGuest"
                            : "operationsDashboard.labels.guestsCount",
                          { count: admission.quantity_admitted },
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-xs font-black text-slate-400">
                      <Clock3 className="h-4 w-4" />
                      {formatTime(admission.admitted_at, language)}
                    </div>
                  </div>
                ))
            ) : (
              <div className="py-10 text-center">
                <p className="text-sm font-bold text-slate-400">
                  {t("operationsDashboard.empty.noRecentAdmissions")}
                </p>
              </div>
            )}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("operationsDashboard.sections.scannerHealth")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("operationsDashboard.sections.scanResultsToday")}
              </h2>
            </div>

            <QrCode className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 space-y-3">
            {dashboard?.scan_results?.length ? (
              dashboard.scan_results.map((item) => (
                <div
                  key={String(item.result)}
                  className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-black capitalize text-slate-700">
                    {t(
                      `operationsDashboard.scanResults.${String(item.result)}`,
                      undefined,
                      String(item.result).replaceAll("_", " "),
                    )}
                  </span>
                  <span className="rounded-xl bg-white px-3 py-1 text-sm font-black text-slate-950 shadow-sm">
                    {item.total}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-10 text-center">
                <ScanLine className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-400">
                  {t("operationsDashboard.empty.noScansToday")}
                </p>
              </div>
            )}
          </div>

          <Link
            to={`/ticketing/${slug}/operations/scan-attempts`}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700 transition hover:text-slate-950"
          >
            {t("operationsDashboard.actions.openScanHistory")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>
      </section>
    </div>
  );
}
