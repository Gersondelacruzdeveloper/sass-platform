// src/modules/ticketing/pages/operations/TicketingSettlementDetailPage.tsx

import type { FormEvent } from "react";
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
  AlertTriangle,
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  FileWarning,
  HandCoins,
  Loader2,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  X,
  XCircle,
} from "lucide-react";

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  PartnerSettlementLine,
  PartnerSettlementPayment,
  PartnerSettlementPeriod,
  SettlementReconciliation,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type PaymentFormState = {
  payer_type: "platform" | "partner";
  payee_type: "platform" | "partner";
  amount: string;
  payment_method: string;
  status: "confirmed" | "cancelled" | "pending" | "failed";
  reference: string;
  paid_at: string;
  notes: string;
  attachment: File | null;
};

const initialPaymentForm: PaymentFormState = {
  payer_type: "partner",
  payee_type: "platform",
  amount: "",
  payment_method: "bank_transfer",
  status: "confirmed",
  reference: "",
  paid_at: "",
  notes: "",
  attachment: null,
};

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

function formatDateTime(
  value: string | null | undefined,
  language: "en" | "es" = "en",
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

function formatStatus(
  value: string | null | undefined,
  t: (
    key: string,
    values?: Record<string, string | number | boolean | null | undefined>,
    fallback?: string,
  ) => string,
): string {
  const normalized = String(value || "unknown");

  return t(
    `settlementDetail.statuses.${normalized}`,
    undefined,
    normalized
      .replaceAll("_", " ")
      .replace(/\b\w/g, (character) => character.toUpperCase()),
  );
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

export default function TicketingSettlementDetailPage() {
  const { language, t } = useTicketingAdminTranslation();
  const { slug } =
    useOutletContext<TicketingDashboardOutletContext>();

  const { settlementId } = useParams<{
    settlementId: string;
  }>();

  const id = Number(settlementId);

  const [settlement, setSettlement] =
    useState<PartnerSettlementPeriod | null>(null);
  const [payments, setPayments] = useState<
    PartnerSettlementPayment[]
  >([]);
  const [reconciliation, setReconciliation] =
    useState<SettlementReconciliation | null>(null);

  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const [actionLoading, setActionLoading] = useState("");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] =
    useState<PaymentFormState>(initialPaymentForm);
  const [submittingPayment, setSubmittingPayment] =
    useState(false);

  const loadData = useCallback(async () => {
    if (!slug || !id) return;

    setState({
      loading: true,
      error: "",
    });

    try {
      const [settlementData, paymentData] = await Promise.all([
        ticketingApi.getPartnerSettlement(id, slug),
        ticketingApi.getPartnerSettlementPayments(slug, {
          settlement: id,
        }),
      ]);

      setSettlement(settlementData);
      setPayments(paymentData);

      try {
        const reconcileData =
          await ticketingApi.reconcilePartnerSettlement(
            id,
            slug,
          );
        setReconciliation(reconcileData);
      } catch {
        setReconciliation(null);
      }

      setState({
        loading: false,
        error: "",
      });
    } catch (error) {
      setState({
        loading: false,
        error: getErrorMessage(error, t("settlementDetail.errors.process")),
      });
    }
  }, [id, slug, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const lines = useMemo<PartnerSettlementLine[]>(
    () => settlement?.lines || [],
    [settlement],
  );

  const expectedDirection = useMemo(() => {
    if (!settlement) {
      return {
        payer: "partner" as const,
        payee: "platform" as const,
      };
    }

    return toNumber(settlement.net_settlement_amount) >= 0
      ? {
          payer: "partner" as const,
          payee: "platform" as const,
        }
      : {
          payer: "platform" as const,
          payee: "partner" as const,
        };
  }, [settlement]);

  function openPaymentModal() {
    if (!settlement) return;

    setPaymentForm({
      ...initialPaymentForm,
      payer_type: expectedDirection.payer,
      payee_type: expectedDirection.payee,
      amount: String(
        Math.abs(
          toNumber(settlement.outstanding_amount),
        ).toFixed(2),
      ),
    });
    setPaymentModalOpen(true);
  }

  async function runAction(
    action:
      | "submit"
      | "approve"
      | "dispute"
      | "cancel",
  ) {
    if (!settlement) return;

    let notes = "";

    if (action === "dispute" || action === "cancel") {
      notes =
        window.prompt(
          action === "dispute"
            ? t("settlementDetail.prompts.disputeReason")
            : t("settlementDetail.prompts.cancellationReason"),
        )?.trim() || "";

      if (!notes) return;
    }

    setActionLoading(action);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      if (action === "submit") {
        await ticketingApi.submitPartnerSettlementForReview(
          settlement.id,
          {},
          slug,
        );
      }

      if (action === "approve") {
        await ticketingApi.approvePartnerSettlement(
          settlement.id,
          {},
          slug,
        );
      }

      if (action === "dispute") {
        await ticketingApi.disputePartnerSettlement(
          settlement.id,
          notes,
          slug,
        );
      }

      if (action === "cancel") {
        await ticketingApi.cancelPartnerSettlement(
          settlement.id,
          notes,
          slug,
        );
      }

      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error, t("settlementDetail.errors.process")),
      }));
    } finally {
      setActionLoading("");
    }
  }

  async function handlePaymentSubmit(event: FormEvent) {
    event.preventDefault();

    if (!settlement) return;

    setSubmittingPayment(true);
    setState((current) => ({
      ...current,
      error: "",
    }));

    try {
      await ticketingApi.recordPartnerSettlementPayment(
        settlement.id,
        {
          payer_type: paymentForm.payer_type,
          payee_type: paymentForm.payee_type,
          amount: paymentForm.amount,
          payment_method: paymentForm.payment_method,
          status: paymentForm.status,
          reference: paymentForm.reference,
          paid_at: paymentForm.paid_at || undefined,
          notes: paymentForm.notes,
          attachment: paymentForm.attachment || undefined,
        },
        slug,
      );

      setPaymentModalOpen(false);
      setPaymentForm(initialPaymentForm);
      await loadData();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: getErrorMessage(error, t("settlementDetail.errors.process")),
      }));
    } finally {
      setSubmittingPayment(false);
    }
  }

  if (state.loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-slate-700" />
          <span className="text-sm font-black text-slate-700">
            {t("settlementDetail.loading")}
          </span>
        </div>
      </div>
    );
  }

  if (!settlement) {
    return (
      <div className="rounded-[2rem] border border-rose-200 bg-rose-50 p-6 text-rose-800">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("settlementDetail.errors.loadTitle")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {state.error || t("settlementDetail.errors.notFound")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = settlement.status === "draft";
  const canApprove = ["draft", "review", "disputed"].includes(
    settlement.status,
  );
  const canRecordPayment = [
    "approved",
    "partially_paid",
  ].includes(settlement.status);
  const canDispute = ![
    "settled",
    "cancelled",
  ].includes(settlement.status);
  const canCancel =
    settlement.status !== "settled";

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] bg-slate-950 px-6 py-7 text-white shadow-xl sm:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Link
              to={`/ticketing/${slug}/operations/settlements`}
              className="mb-4 inline-flex items-center gap-2 text-sm font-black text-white/60 transition hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              {t("settlementDetail.navigation.center")}
            </Link>

            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-white/10">
                <WalletCards className="h-7 w-7" />
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-3xl font-black tracking-tight">
                    {settlement.settlement_number}
                  </h1>

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-black ${statusTone(
                      settlement.status,
                    )}`}
                  >
                    {formatStatus(settlement.status, t)}
                  </span>
                </div>

                <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-white/50">
                  <Building2 className="h-4 w-4" />
                  {settlement.business_entity_name}
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
            {t("settlementDetail.actions.refresh")}
          </button>
        </div>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("settlementDetail.errors.operationFailed")}
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
            {t("settlementDetail.stats.grossSales")}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {formatMoney(
              settlement.gross_sales,
              settlement.currency,
            )}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("settlementDetail.stats.partnerEntitlement")}
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {formatMoney(
              settlement.partner_entitlement,
              settlement.currency,
            )}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("settlementDetail.stats.netSettlement")}
          </p>
          <p className="mt-2 text-2xl font-black text-blue-700">
            {formatMoney(
              settlement.net_settlement_amount,
              settlement.currency,
            )}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("settlementDetail.stats.outstanding")}
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {formatMoney(
              settlement.outstanding_amount,
              settlement.currency,
            )}
          </p>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("settlementDetail.sections.period")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("settlementDetail.sections.financialSummary")}
              </h2>
            </div>

            <CalendarDays className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 rounded-3xl bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              {t("settlementDetail.labels.period")}
            </p>
            <p className="mt-2 text-lg font-black text-slate-950">
              {settlement.period_start} —{" "}
              {settlement.period_end}
            </p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              [
                t("settlementDetail.summary.bookings"),
                settlement.total_bookings,
              ],
              [
                t("settlementDetail.summary.guestsBooked"),
                settlement.total_guests_booked,
              ],
              [
                t("settlementDetail.summary.guestsAdmitted"),
                settlement.total_guests_admitted,
              ],
              [t("settlementDetail.summary.noShows"), settlement.total_no_shows],
              [
                t("settlementDetail.summary.platformEntitlement"),
                formatMoney(
                  settlement.platform_entitlement,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.sellerEntitlement"),
                formatMoney(
                  settlement.seller_entitlement,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.collectedByPartner"),
                formatMoney(
                  settlement.collected_by_partner,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.collectedByPlatform"),
                formatMoney(
                  settlement.collected_by_platform,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.collectedBySellers"),
                formatMoney(
                  settlement.collected_by_sellers,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.customerBalanceDue"),
                formatMoney(
                  settlement.customer_balance_due,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.partnerOwesPlatform"),
                formatMoney(
                  settlement.partner_owes_platform,
                  settlement.currency,
                  language,
                ),
              ],
              [
                t("settlementDetail.summary.platformOwesPartner"),
                formatMoney(
                  settlement.platform_owes_partner,
                  settlement.currency,
                  language,
                ),
              ],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border border-slate-100 bg-white p-4"
              >
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {label}
                </p>
                <p className="mt-2 font-black text-slate-900">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("settlementDetail.sections.workflow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("settlementDetail.sections.actions")}
              </h2>
            </div>

            <FileCheck2 className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 space-y-3">
            {canSubmit && (
              <button
                type="button"
                onClick={() => void runAction("submit")}
                disabled={Boolean(actionLoading)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 text-sm font-black text-white transition hover:bg-violet-800 disabled:opacity-50"
              >
                {actionLoading === "submit" && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {t("settlementDetail.actions.submitForReview")}
              </button>
            )}

            {canApprove && (
              <button
                type="button"
                onClick={() => void runAction("approve")}
                disabled={Boolean(actionLoading)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white transition hover:bg-blue-800 disabled:opacity-50"
              >
                {actionLoading === "approve" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                {t("settlementDetail.actions.approve")}
              </button>
            )}

            {canRecordPayment && (
              <button
                type="button"
                onClick={openPaymentModal}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800"
              >
                <HandCoins className="h-4 w-4" />
                {t("settlementDetail.actions.recordPayment")}
              </button>
            )}

            {canDispute && (
              <button
                type="button"
                onClick={() => void runAction("dispute")}
                disabled={Boolean(actionLoading)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 text-sm font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {actionLoading === "dispute" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileWarning className="h-4 w-4" />
                )}
                {t("settlementDetail.actions.markDisputed")}
              </button>
            )}

            {canCancel && (
              <button
                type="button"
                onClick={() => void runAction("cancel")}
                disabled={Boolean(actionLoading)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 text-sm font-black text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
              >
                {actionLoading === "cancel" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                {t("settlementDetail.actions.cancelSettlement")}
              </button>
            )}
          </div>

          <div className="mt-6 rounded-3xl bg-slate-50 p-5">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">
              {t("settlementDetail.labels.paymentProgress")}
            </p>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      toNumber(settlement.net_settlement_amount) === 0
                        ? 100
                        : (toNumber(settlement.paid_amount) /
                            Math.abs(
                              toNumber(
                                settlement.net_settlement_amount,
                              ),
                            )) *
                            100,
                    ),
                  )}%`,
                }}
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-4 text-sm">
              <span className="font-bold text-slate-500">
                {t("settlementDetail.labels.paid")}
              </span>
              <span className="font-black text-slate-900">
                {formatMoney(
                  settlement.paid_amount,
                  settlement.currency,
                  language,
                )}
              </span>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
              {t("settlementDetail.sections.reconciliation")}
            </p>
            <h2 className="mt-1 text-xl font-black text-slate-950">
              {t("settlementDetail.sections.ledgerComparison")}
            </h2>
          </div>

          {reconciliation?.is_reconciled ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-6 w-6 text-amber-600" />
          )}
        </div>

        {reconciliation ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("settlementDetail.labels.paymentTotal")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {formatMoney(
                  reconciliation.payment_total,
                  settlement.currency,
                  language,
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("settlementDetail.labels.ledgerTotal")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {formatMoney(
                  reconciliation.ledger_total,
                  settlement.currency,
                  language,
                )}
              </p>
            </div>

            <div
              className={`rounded-2xl p-4 ${
                reconciliation.is_reconciled
                  ? "bg-emerald-50"
                  : "bg-amber-50"
              }`}
            >
              <p
                className={`text-xs font-black uppercase tracking-wide ${
                  reconciliation.is_reconciled
                    ? "text-emerald-600"
                    : "text-amber-600"
                }`}
              >
                {t("settlementDetail.labels.difference")}
              </p>
              <p
                className={`mt-2 font-black ${
                  reconciliation.is_reconciled
                    ? "text-emerald-800"
                    : "text-amber-800"
                }`}
              >
                {formatMoney(
                  reconciliation.difference,
                  settlement.currency,
                  language,
                )}
              </p>
            </div>
          </div>
        ) : (
          <p className="mt-5 text-sm font-semibold text-slate-400">
            {t("settlementDetail.sections.reconciliation")} is not available for this settlement.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <ReceiptText className="h-5 w-5 text-slate-400" />
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {t("settlementDetail.lines.title")}
              </h2>
              <p className="mt-1 text-sm font-semibold text-slate-400">
                {t(
                  lines.length === 1
                    ? "settlementDetail.lines.oneItem"
                    : "settlementDetail.lines.items",
                  { count: lines.length },
                )}
              </p>
            </div>
          </div>
        </div>

        {lines.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <ReceiptText className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              {t("settlementDetail.lines.empty")}
            </p>
          </div>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    {[
                      t("settlementDetail.table.booking"),
                      t("settlementDetail.table.product"),
                      t("settlementDetail.table.serviceDate"),
                      t("settlementDetail.table.booked"),
                      t("settlementDetail.table.admitted"),
                      t("settlementDetail.stats.partnerEntitlement"),
                      t("settlementDetail.summary.collectedByPartner"),
                      t("settlementDetail.table.netAmount"),
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
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900">
                          {line.booking_code}
                        </p>
                      </td>

                      <td className="px-5 py-4">
                        <p className="max-w-xs font-bold text-slate-700">
                          {line.product_name}
                        </p>
                      </td>

                      <td className="px-5 py-4 text-sm font-bold text-slate-600">
                        {line.service_date || "—"}
                      </td>

                      <td className="px-5 py-4 font-black text-slate-900">
                        {line.booked_quantity}
                      </td>

                      <td className="px-5 py-4 font-black text-slate-900">
                        {line.admitted_quantity}
                      </td>

                      <td className="px-5 py-4 font-black text-emerald-700">
                        {formatMoney(
                          line.partner_entitlement,
                          settlement.currency,
                          language,
                        )}
                      </td>

                      <td className="px-5 py-4 font-black text-blue-700">
                        {formatMoney(
                          line.collected_by_partner,
                          settlement.currency,
                          language,
                        )}
                      </td>

                      <td className="px-5 py-4 font-black text-slate-950">
                        {formatMoney(
                          line.net_amount,
                          settlement.currency,
                          language,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="divide-y divide-slate-100 xl:hidden">
              {lines.map((line) => (
                <article key={line.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-black text-slate-950">
                        {line.booking_code}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-500">
                        {line.product_name}
                      </p>
                    </div>

                    <span className="rounded-xl bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
                      {line.service_date || t("settlementDetail.fallbacks.noDate")}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Booked / admitted
                      </p>
                      <p className="mt-2 font-black text-slate-900">
                        {line.booked_quantity} /{" "}
                        {line.admitted_quantity}
                      </p>
                    </div>

                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                        Net amount
                      </p>
                      <p className="mt-2 font-black text-slate-900">
                        {formatMoney(
                          line.net_amount,
                          settlement.currency,
                          language,
                        )}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <h2 className="text-xl font-black text-slate-950">
            {t("settlementDetail.payments.title")}
          </h2>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t(
              payments.length === 1
                ? "settlementDetail.payments.onePayment"
                : "settlementDetail.payments.payments",
              { count: payments.length },
            )}
          </p>
        </div>

        {payments.length === 0 ? (
          <div className="flex min-h-56 flex-col items-center justify-center px-6 text-center">
            <HandCoins className="h-10 w-10 text-slate-300" />
            <p className="mt-4 text-lg font-black text-slate-700">
              {t("settlementDetail.payments.empty")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.map((payment) => (
              <article
                key={payment.id}
                className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-black capitalize text-slate-950">
                    {t(
                      `settlementDetail.entities.${payment.payer_type}`,
                      undefined,
                      payment.payer_type,
                    )}{" "}
                    →{" "}
                    {t(
                      `settlementDetail.entities.${payment.payee_type}`,
                      undefined,
                      payment.payee_type,
                    )}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-400">
                    {t(
                      `settlementDetail.paymentMethods.${payment.payment_method}`,
                      undefined,
                      payment.payment_method.replaceAll("_", " "),
                    )}{" "}
                    · {formatDateTime(payment.paid_at, language)}
                  </p>
                </div>

                <div className="text-left sm:text-right">
                  <p className="text-lg font-black text-slate-950">
                    {formatMoney(
                      payment.amount,
                      payment.currency,
                      language,
                    )}
                  </p>
                  <span className="mt-1 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black capitalize text-slate-600">
                    {t(
                      `settlementDetail.paymentStatuses.${payment.status}`,
                      undefined,
                      payment.status,
                    )}
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {paymentModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-5">
              <div>
                <h2 className="text-xl font-black text-slate-950">
                  {t("settlementDetail.paymentModal.title")}
                </h2>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {t("settlementDetail.paymentModal.subtitle")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPaymentModalOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handlePaymentSubmit}
              className="space-y-5 p-6"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("settlementDetail.paymentModal.payer")}
                  </span>
                  <select
                    value={paymentForm.payer_type}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        payer_type: event.target.value as
                          | "platform"
                          | "partner",
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="partner">{t("settlementDetail.entities.partner")}</option>
                    <option value="platform">{t("settlementDetail.entities.platform")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("settlementDetail.paymentModal.payee")}
                  </span>
                  <select
                    value={paymentForm.payee_type}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        payee_type: event.target.value as
                          | "platform"
                          | "partner",
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="platform">{t("settlementDetail.entities.platform")}</option>
                    <option value="partner">{t("settlementDetail.entities.partner")}</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("settlementDetail.paymentModal.amount")}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={paymentForm.amount}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
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
                    {t("settlementDetail.paymentModal.paymentMethod")}
                  </span>
                  <select
                    value={paymentForm.payment_method}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        payment_method: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="bank_transfer">
                      {t("settlementDetail.paymentMethods.bank_transfer")}
                    </option>
                    <option value="cash">{t("settlementDetail.paymentMethods.cash")}</option>
                    <option value="card">{t("settlementDetail.paymentMethods.card")}</option>
                    <option value="online">{t("settlementDetail.paymentMethods.online")}</option>
                    <option value="other">{t("settlementDetail.paymentMethods.other")}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("settlementDetail.paymentModal.status")}
                  </span>
                  <select
                    value={paymentForm.status}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        status: event.target.value as PaymentFormState['status'],
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none"
                  >
                    <option value="confirmed">
                      {t("settlementDetail.paymentStatuses.confirmed")}
                    </option>
                    <option value="pending">{t("settlementDetail.paymentStatuses.pending")}</option>
                    <option value="failed">{t("settlementDetail.paymentStatuses.failed")}</option>
                    <option value="cancelled">
                      {t("settlementDetail.paymentStatuses.cancelled")}
                    </option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-black text-slate-700">
                    {t("settlementDetail.labels.paid")} at
                  </span>
                  <input
                    type="datetime-local"
                    value={paymentForm.paid_at}
                    onChange={(event) =>
                      setPaymentForm((current) => ({
                        ...current,
                        paid_at: event.target.value,
                      }))
                    }
                    className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-900 outline-none"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {t("settlementDetail.paymentModal.reference")}
                </span>
                <input
                  value={paymentForm.reference}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  className="h-12 w-full rounded-2xl border border-slate-200 px-4 text-sm font-semibold text-slate-900 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {t("settlementDetail.paymentModal.notes")}
                </span>
                <textarea
                  value={paymentForm.notes}
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full resize-none rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 outline-none"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">
                  {t("settlementDetail.paymentModal.attachment")}
                </span>
                <input
                  type="file"
                  onChange={(event) =>
                    setPaymentForm((current) => ({
                      ...current,
                      attachment:
                        event.target.files?.[0] || null,
                    }))
                  }
                  className="block w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
                >
                  {t("settlementDetail.actions.cancel")}
                </button>

                <button
                  type="submit"
                  disabled={
                    submittingPayment ||
                    !paymentForm.amount ||
                    toNumber(paymentForm.amount) <= 0
                  }
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submittingPayment && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {t("settlementDetail.actions.recordPayment")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
