// src/modules/ticketing/pages/operations/TicketingBusinessEntityDetailPage.tsx

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Link,
  useOutletContext,
  useParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CircleAlert,
  Clock3,
  Handshake,
  Loader2,
  Mail,
  MapPin,
  Phone,
  QrCode,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import ticketingApi from "../../api/ticketingApi";
import type {
  BusinessEntityDashboard,
  ProductBusinessAgreement,
  TicketScanAttempt,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
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
      "Could not load the business entity."
    );
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Could not load the business entity.";
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

function scanTone(result?: string | null) {
  const value = String(result || "");

  if (["valid", "admitted", "partially_used"].includes(value)) {
    return "bg-emerald-100 text-emerald-700";
  }

  if (["already_used", "wrong_date"].includes(value)) {
    return "bg-amber-100 text-amber-700";
  }

  return "bg-rose-100 text-rose-700";
}

export default function TicketingBusinessEntityDetailPage() {
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const { businessEntityId } = useParams<{
    businessEntityId: string;
  }>();

  const entityId = Number(businessEntityId);

  const [dashboard, setDashboard] =
    useState<BusinessEntityDashboard | null>(null);
  const [agreements, setAgreements] = useState<
    ProductBusinessAgreement[]
  >([]);
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const today = useMemo(() => getToday(), []);

  const loadData = useCallback(async () => {
    if (!slug || !entityId) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [dashboardData, agreementData] = await Promise.all([
        ticketingApi.getBusinessEntityDashboard(
          entityId,
          slug,
          {
            date_from: today,
            date_to: today,
          },
        ),
        ticketingApi.getBusinessAgreements(slug, {
          business_entity: entityId,
          is_active: true,
        }),
      ]);

      setDashboard(dashboardData);
      setAgreements(agreementData);
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
  }, [entityId, slug, today]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const entity = dashboard?.business_entity;
  const currency = entity?.currency || "USD";
  const currentSettlement =
    dashboard?.current_period?.settlement || null;

  const recentScans = useMemo<TicketScanAttempt[]>(
    () => dashboard?.latest_scans?.slice(0, 8) || [],
    [dashboard],
  );

  if (state.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
          <span className="text-sm font-black text-slate-700">
            Loading business entity...
          </span>
        </div>
      </div>
    );
  }

  if (!dashboard || !entity) {
    return (
      <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              Business entity could not be loaded
            </p>
            <p className="mt-1 text-sm font-semibold">
              {state.error || "Entity not found."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to={`/ticketing/${slug}/operations/business-entities`}
              className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Business entities
            </Link>

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10">
                <Building2 className="h-7 w-7" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black tracking-tight">
                    {entity.name}
                  </h1>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${
                      entity.is_active
                        ? "bg-emerald-400/20 text-emerald-200"
                        : "bg-white/10 text-white/50"
                    }`}
                  >
                    {entity.is_active ? "Active" : "Inactive"}
                  </span>
                </div>

                <p className="mt-2 text-sm font-semibold capitalize text-white/50">
                  {String(entity.entity_type || "partner").replaceAll(
                    "_",
                    " ",
                  )}
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
            Refresh
          </button>
        </div>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              Some entity information could not be loaded
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
            Expected guests today
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {dashboard.totals.expected_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Guests admitted
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {dashboard.totals.admitted_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Remaining guests
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {dashboard.totals.remaining_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            Customer balance due
          </p>
          <p className="mt-2 text-2xl font-black text-rose-700">
            {formatMoney(
              dashboard.totals.customer_balance_due,
              currency,
            )}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Operations
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Entity configuration
              </h2>
            </div>

            <ShieldCheck className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Can scan tickets
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.can_scan_tickets ? "Yes" : "No"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Partial admission
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.allow_partial_admission ? "Allowed" : "Disabled"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Offline scanning
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.allow_offline_scanning ? "Allowed" : "Disabled"}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                Settlement cycle
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.settlement_cycle_days || 10} days
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <Mail className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Email
                </p>
                <p className="mt-1 font-bold text-slate-800">
                  {entity.contact_email || "Not provided"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <Phone className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Phone
                </p>
                <p className="mt-1 font-bold text-slate-800">
                  {entity.contact_phone ||
                    entity.contact_whatsapp ||
                    "Not provided"}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <MapPin className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  Address
                </p>
                <p className="mt-1 font-bold leading-6 text-slate-800">
                  {entity.address || "Not provided"}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Finance
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Current settlement period
              </h2>
            </div>

            <WalletCards className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">
              Period
            </p>
            <p className="mt-2 text-lg font-black">
              {dashboard.current_period.period_start} —{" "}
              {dashboard.current_period.period_end}
            </p>

            {currentSettlement ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">
                      Net settlement
                    </p>
                    <p className="mt-2 text-lg font-black">
                      {formatMoney(
                        currentSettlement.net_settlement_amount,
                        currentSettlement.currency,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">
                      Outstanding
                    </p>
                    <p className="mt-2 text-lg font-black">
                      {formatMoney(
                        currentSettlement.outstanding_amount,
                        currentSettlement.currency,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm font-bold text-white/50">
                    Status
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black capitalize">
                    {String(currentSettlement.status).replaceAll(
                      "_",
                      " ",
                    )}
                  </span>
                </div>

                <Link
                  to={`/ticketing/${slug}/operations/settlements/${currentSettlement.id}`}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  Open settlement
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/20 px-4 py-8 text-center">
                <p className="font-black">
                  No settlement generated
                </p>
                <p className="mt-2 text-sm font-semibold text-white/50">
                  Generate this period from the Settlement Center.
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
                Partner entitlement
              </p>
              <p className="mt-2 text-lg font-black text-emerald-800">
                {formatMoney(
                  dashboard.totals.partner_entitlement,
                  currency,
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                Platform entitlement
              </p>
              <p className="mt-2 text-lg font-black text-blue-800">
                {formatMoney(
                  dashboard.totals.platform_entitlement,
                  currency,
                )}
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Commercial rules
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Active agreements
              </h2>
            </div>

            <Handshake className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 space-y-3">
            {agreements.length ? (
              agreements.slice(0, 6).map((agreement) => (
                <div
                  key={agreement.id}
                  className="rounded-3xl border border-slate-100 bg-slate-50 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-black text-slate-950">
                        {agreement.product_name ||
                          agreement.name}
                      </p>
                      <p className="mt-1 text-xs font-bold capitalize text-slate-400">
                        {String(
                          agreement.agreement_type,
                        ).replaceAll("_", " ")}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                      v{agreement.version}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                      {String(
                        agreement.settlement_basis,
                      ).replaceAll("_", " ")}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-700">
                      {agreement.currency}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-3xl border border-dashed border-slate-200 px-5 py-10 text-center">
                <Handshake className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 font-black text-slate-700">
                  No active agreements
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  Link products and commercial rules to this entity.
                </p>
              </div>
            )}
          </div>

          <Link
            to={`/ticketing/${slug}/operations/agreements`}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700 transition hover:text-slate-950"
          >
            Manage agreements
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                Scanner activity
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                Recent scans
              </h2>
            </div>

            <QrCode className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 divide-y divide-slate-100">
            {recentScans.length ? (
              recentScans.map((scan) => (
                <div
                  key={scan.id}
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-black text-slate-900">
                      {scan.booking_code ||
                        "Unresolved ticket"}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                      {scan.product_name ||
                        scan.failure_reason ||
                        scan.scanner_name ||
                        "Scan attempt"}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black capitalize ${scanTone(
                        scan.result,
                      )}`}
                    >
                      {String(scan.result).replaceAll("_", " ")}
                    </span>
                    <p className="mt-2 flex items-center justify-end gap-1 text-xs font-bold text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateTime(scan.scanned_at)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center">
                <ScanLine className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-400">
                  No recent scans.
                </p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Link
          to={`/ticketing/${slug}/operations/scanner`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <ScanLine className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            Open scanner
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            Validate and admit guests.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/admissions?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <CalendarCheck2 className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            Admissions
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            Review guest check-ins.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/settlements?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <WalletCards className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            Settlements
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            Review amounts owed and paid.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/scan-attempts?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Users className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            Scan audit
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            Inspect successful and blocked scans.
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>
      </section>
    </div>
  );
}
