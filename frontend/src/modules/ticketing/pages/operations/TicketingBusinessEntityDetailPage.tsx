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
  Check,
  Clipboard,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Power,
  UserPlus,
  X,
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

import { useTicketingAdminTranslation } from "../../admin-i18n/useTicketingAdminTranslation";
import ticketingApi from "../../api/ticketingApi";
import type {
  BusinessEntityDashboard,
  BusinessEntityPasswordResetResponse,
  BusinessEntityRole,
  BusinessEntityUserAccess,
  BusinessEntityUserCreatePayload,
  ProductBusinessAgreement,
  TicketScanAttempt,
} from "../../types/ticketingTypes";
import type { TicketingDashboardOutletContext } from "../../layouts/TicketingDashboardLayout";

type LoadState = {
  loading: boolean;
  error: string;
};

type PartnerPermissionKey =
  | "can_access_dashboard"
  | "can_scan"
  | "can_view_today_bookings"
  | "can_view_admissions"
  | "can_view_customer_contact"
  | "can_view_financials"
  | "can_view_settlements"
  | "can_record_payments"
  | "can_reverse_admissions"
  | "can_manage_users";

type PartnerLoginForm = {
  login_name: string;
  login_email: string;
  login_username: string;
  login_password: string;
  generate_password: boolean;
  role: BusinessEntityRole;
  apply_role_defaults: boolean;
  is_active: boolean;
} & Record<PartnerPermissionKey, boolean>;

type CredentialResult = {
  title: string;
  email: string;
  username: string;
  password: string;
  loginUrl: string;
};

const PARTNER_PERMISSION_OPTIONS: Array<{
  key: PartnerPermissionKey;
  labelKey: string;
  descriptionKey: string;
}> = [
  {
    key: "can_access_dashboard",
    labelKey: "businessEntityDetail.permissions.canAccessDashboard",
    descriptionKey: "businessEntityDetail.permissions.canAccessDashboardHelp",
  },
  {
    key: "can_scan",
    labelKey: "businessEntityDetail.permissions.canScan",
    descriptionKey: "businessEntityDetail.permissions.canScanHelp",
  },
  {
    key: "can_view_today_bookings",
    labelKey: "businessEntityDetail.permissions.canViewTodayBookings",
    descriptionKey: "businessEntityDetail.permissions.canViewTodayBookingsHelp",
  },
  {
    key: "can_view_admissions",
    labelKey: "businessEntityDetail.permissions.canViewAdmissions",
    descriptionKey: "businessEntityDetail.permissions.canViewAdmissionsHelp",
  },
  {
    key: "can_view_customer_contact",
    labelKey: "businessEntityDetail.permissions.canViewCustomerContact",
    descriptionKey: "businessEntityDetail.permissions.canViewCustomerContactHelp",
  },
  {
    key: "can_view_financials",
    labelKey: "businessEntityDetail.permissions.canViewFinancials",
    descriptionKey: "businessEntityDetail.permissions.canViewFinancialsHelp",
  },
  {
    key: "can_view_settlements",
    labelKey: "businessEntityDetail.permissions.canViewSettlements",
    descriptionKey: "businessEntityDetail.permissions.canViewSettlementsHelp",
  },
  {
    key: "can_record_payments",
    labelKey: "businessEntityDetail.permissions.canRecordPayments",
    descriptionKey: "businessEntityDetail.permissions.canRecordPaymentsHelp",
  },
  {
    key: "can_reverse_admissions",
    labelKey: "businessEntityDetail.permissions.canReverseAdmissions",
    descriptionKey: "businessEntityDetail.permissions.canReverseAdmissionsHelp",
  },
  {
    key: "can_manage_users",
    labelKey: "businessEntityDetail.permissions.canManageUsers",
    descriptionKey: "businessEntityDetail.permissions.canManageUsersHelp",
  },
];

const DEFAULT_PARTNER_FORM: PartnerLoginForm = {
  login_name: "", login_email: "", login_username: "", login_password: "",
  generate_password: true, role: "scanner", apply_role_defaults: true, is_active: true,
  can_access_dashboard: true, can_scan: true, can_view_today_bookings: true,
  can_view_admissions: true, can_view_customer_contact: false, can_view_financials: false,
  can_view_settlements: false, can_record_payments: false,
  can_reverse_admissions: false, can_manage_users: false,
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
  value?: string | null,
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
  const { language, t } = useTicketingAdminTranslation();
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
  const [partnerUsers, setPartnerUsers] = useState<BusinessEntityUserAccess[]>([]);
  const [partnerUsersLoading, setPartnerUsersLoading] = useState(false);
  const [partnerActionLoading, setPartnerActionLoading] = useState<number | "create" | null>(null);
  const [partnerError, setPartnerError] = useState("");
  const [showCreateLogin, setShowCreateLogin] = useState(false);
  const [showManualPassword, setShowManualPassword] = useState(false);
  const [partnerForm, setPartnerForm] = useState<PartnerLoginForm>(DEFAULT_PARTNER_FORM);
  const [credentials, setCredentials] = useState<CredentialResult | null>(null);
  const [copiedValue, setCopiedValue] = useState("");
  const [state, setState] = useState<LoadState>({
    loading: true,
    error: "",
  });

  const today = useMemo(() => getToday(), []);

  const loadPartnerUsers = useCallback(async () => {
    if (!slug || !entityId) return;
    setPartnerUsersLoading(true);
    setPartnerError("");
    try {
      const users = await ticketingApi.getBusinessEntityUsers(slug, { business_entity: entityId });
      setPartnerUsers(users);
    } catch (error) {
      setPartnerError(getErrorMessage(error, t("businessEntityDetail.errors.load")));
    } finally {
      setPartnerUsersLoading(false);
    }
  }, [entityId, slug, t]);

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
        error: getErrorMessage(error, t("businessEntityDetail.errors.load")),
      });
    }
  }, [entityId, slug, t, today]);

  useEffect(() => {
    void loadData();
    void loadPartnerUsers();
  }, [loadData, loadPartnerUsers]);

  const partnerLoginUrl = `${window.location.origin}/ticketing/${slug}/partner/login`;

  function updatePartnerForm<K extends keyof PartnerLoginForm>(key: K, value: PartnerLoginForm[K]) {
    setPartnerForm((current) => ({ ...current, [key]: value }));
  }

  function applyLocalRoleDefaults(role: BusinessEntityRole) {
    const base = { can_access_dashboard: true, can_scan: false, can_view_today_bookings: false,
      can_view_admissions: false, can_view_customer_contact: false, can_view_financials: false,
      can_view_settlements: false, can_record_payments: false, can_reverse_admissions: false,
      can_manage_users: false };
    const defaults: Record<BusinessEntityRole, Partial<PartnerLoginForm>> = {
      administrator: { ...base, can_scan: true, can_view_today_bookings: true, can_view_admissions: true, can_view_customer_contact: true, can_view_financials: true, can_view_settlements: true, can_record_payments: true, can_reverse_admissions: true, can_manage_users: true },
      finance: { ...base, can_view_financials: true, can_view_settlements: true, can_record_payments: true },
      supervisor: { ...base, can_scan: true, can_view_today_bookings: true, can_view_admissions: true, can_view_customer_contact: true, can_reverse_admissions: true },
      scanner: { ...base, can_scan: true, can_view_today_bookings: true, can_view_admissions: true },
      driver: { ...base, can_view_today_bookings: true, can_view_customer_contact: true },
      guide: { ...base, can_scan: true, can_view_today_bookings: true, can_view_admissions: true, can_view_customer_contact: true },
      viewer: { ...base, can_view_today_bookings: true, can_view_admissions: true },
    };
    setPartnerForm((current) => ({ ...current, role, ...defaults[role] }));
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setCopiedValue(label);
    window.setTimeout(() => setCopiedValue(""), 1800);
  }

  async function handleCreatePartnerLogin() {
    if (!slug || !entityId) return;
    if (!partnerForm.login_name.trim()) return setPartnerError(t("businessEntityDetail.errors.fullNameRequired"));
    if (!partnerForm.login_email.trim()) return setPartnerError(t("businessEntityDetail.errors.emailRequired"));
    if (!partnerForm.generate_password && partnerForm.login_password.trim().length < 10) {
      return setPartnerError(t("businessEntityDetail.errors.passwordLength"));
    }
    setPartnerActionLoading("create"); setPartnerError("");
    const payload: BusinessEntityUserCreatePayload = {
      business_entity_id: entityId, create_login: true,
      login_name: partnerForm.login_name.trim(), login_email: partnerForm.login_email.trim(),
      login_username: partnerForm.login_username.trim() || undefined,
      login_password: partnerForm.generate_password ? undefined : partnerForm.login_password,
      generate_password: partnerForm.generate_password,
      apply_role_defaults: partnerForm.apply_role_defaults,
      role: partnerForm.role, is_active: partnerForm.is_active,
      can_access_dashboard: partnerForm.can_access_dashboard, can_scan: partnerForm.can_scan,
      can_view_today_bookings: partnerForm.can_view_today_bookings,
      can_view_admissions: partnerForm.can_view_admissions,
      can_view_customer_contact: partnerForm.can_view_customer_contact,
      can_view_financials: partnerForm.can_view_financials,
      can_view_settlements: partnerForm.can_view_settlements,
      can_record_payments: partnerForm.can_record_payments,
      can_reverse_admissions: partnerForm.can_reverse_admissions,
      can_manage_users: partnerForm.can_manage_users,
    };
    try {
      const created = await ticketingApi.createBusinessEntityUser(payload, slug);
      setCredentials({
        title: t("businessEntityDetail.credentials.createdTitle"),
        email: created.user_email || partnerForm.login_email,
        username: created.username || partnerForm.login_username || partnerForm.login_email,
        password: created.generated_password || created.temporary_password || partnerForm.login_password,
        loginUrl: created.partner_login_url ? `${window.location.origin}${created.partner_login_url}` : partnerLoginUrl,
      });
      setPartnerForm(DEFAULT_PARTNER_FORM); setShowManualPassword(false); setShowCreateLogin(false);
      await loadPartnerUsers();
    } catch (error) { setPartnerError(getErrorMessage(error, t("businessEntityDetail.errors.load"))); }
    finally { setPartnerActionLoading(null); }
  }

  async function handleResetPassword(access: BusinessEntityUserAccess) {
    if (!slug) return;
    setPartnerActionLoading(access.id); setPartnerError("");
    try {
      const result: BusinessEntityPasswordResetResponse = await ticketingApi.resetBusinessEntityUserPassword(access.id, { generate_password: true }, slug);
      setCredentials({ title: t("businessEntityDetail.credentials.resetTitle"), email: result.user_email || access.user_email || "",
        username: result.username || access.username || access.user_email || "",
        password: result.temporary_password,
        loginUrl: result.partner_login_url ? `${window.location.origin}${result.partner_login_url}` : partnerLoginUrl });
    } catch (error) { setPartnerError(getErrorMessage(error, t("businessEntityDetail.errors.load"))); }
    finally { setPartnerActionLoading(null); }
  }

  async function handleTogglePartnerUser(access: BusinessEntityUserAccess) {
    if (!slug) return;
    setPartnerActionLoading(access.id); setPartnerError("");
    try {
      if (access.is_active) await ticketingApi.deactivateBusinessEntityUser(access.id, slug);
      else await ticketingApi.activateBusinessEntityUser(access.id, slug);
      await loadPartnerUsers();
    } catch (error) { setPartnerError(getErrorMessage(error, t("businessEntityDetail.errors.load"))); }
    finally { setPartnerActionLoading(null); }
  }

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
            {t("businessEntityDetail.loading")}
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
              {t("businessEntityDetail.errors.loadTitle")}
            </p>
            <p className="mt-1 text-sm font-semibold">
              {state.error || t("businessEntityDetail.errors.notFound")}
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
              {t("businessEntityDetail.navigation.entities")}
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
                    {entity.is_active ? t("businessEntityDetail.statuses.active") : t("businessEntityDetail.statuses.inactive")}
                  </span>
                </div>

                <p className="mt-2 text-sm font-semibold capitalize text-white/50">
                  {t(
                    `businessEntityDetail.entityTypes.${String(
                      entity.entity_type || "partner",
                    )}`,
                    undefined,
                    String(entity.entity_type || "partner").replaceAll(
                      "_",
                      " ",
                    ),
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
            {t("businessEntityDetail.actions.refresh")}
          </button>
        </div>
      </section>

      {state.error && (
        <div className="flex items-start gap-3 rounded-3xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <CircleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-black">
              {t("businessEntityDetail.errors.partialLoad")}
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
            {t("businessEntityDetail.stats.expectedGuests")}
          </p>
          <p className="mt-2 text-2xl font-black text-slate-950">
            {dashboard.totals.expected_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessEntityDetail.stats.guestsAdmitted")}
          </p>
          <p className="mt-2 text-2xl font-black text-emerald-700">
            {dashboard.totals.admitted_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessEntityDetail.stats.remainingGuests")}
          </p>
          <p className="mt-2 text-2xl font-black text-amber-700">
            {dashboard.totals.remaining_guests}
          </p>
        </article>

        <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-slate-500">
            {t("businessEntityDetail.stats.customerBalanceDue")}
          </p>
          <p className="mt-2 text-2xl font-black text-rose-700">
            {formatMoney(
              dashboard.totals.customer_balance_due,
              currency,
              language,
            )}
          </p>
        </article>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">{t("businessEntityDetail.partnerAccess.eyebrow")}</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{t("businessEntityDetail.partnerAccess.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">{t("businessEntityDetail.partnerAccess.subtitle")}</p>
          </div>
          <button type="button" onClick={() => setShowCreateLogin((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
            {showCreateLogin ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showCreateLogin ? t("businessEntityDetail.actions.closeForm") : t("businessEntityDetail.actions.createPartnerLogin")}
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{t("businessEntityDetail.partnerAccess.loginUrl")}</p><p className="mt-1 truncate text-sm font-black text-slate-800">{partnerLoginUrl}</p></div>
          <button type="button" onClick={() => void copyText(partnerLoginUrl, "login-url")} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100">
            {copiedValue === "login-url" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copiedValue === "login-url" ? t("businessEntityDetail.actions.copied") : t("businessEntityDetail.actions.copyUrl")}
          </button>
        </div>

        {partnerError && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-bold">{partnerError}</p></div>}

        {showCreateLogin && (
          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm"><KeyRound className="h-5 w-5 text-slate-700" /></div><div><h3 className="font-black text-slate-950">{t("businessEntityDetail.partnerAccess.newAccount")}</h3><p className="text-sm font-semibold text-slate-500">{t("businessEntityDetail.partnerAccess.passwordShownOnce")}</p></div></div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block"><span className="text-sm font-black text-slate-700">{t("businessEntityDetail.form.fullName")}</span><input value={partnerForm.login_name} onChange={(e) => updatePartnerForm("login_name", e.target.value)} placeholder={t("businessEntityDetail.form.fullNamePlaceholder")} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">{t("businessEntityDetail.form.email")}</span><input type="email" value={partnerForm.login_email} onChange={(e) => updatePartnerForm("login_email", e.target.value)} placeholder={t("businessEntityDetail.form.emailPlaceholder")} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">{t("businessEntityDetail.form.username")}</span><input value={partnerForm.login_username} onChange={(e) => updatePartnerForm("login_username", e.target.value)} placeholder={t("businessEntityDetail.form.usernamePlaceholder")} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">{t("businessEntityDetail.form.role")}</span><select value={partnerForm.role} onChange={(e) => applyLocalRoleDefaults(e.target.value as BusinessEntityRole)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400"><option value="administrator">{t("businessEntityDetail.roles.administrator")}</option><option value="supervisor">{t("businessEntityDetail.roles.supervisor")}</option><option value="scanner">{t("businessEntityDetail.roles.scanner")}</option><option value="finance">{t("businessEntityDetail.roles.finance")}</option><option value="driver">{t("businessEntityDetail.roles.driver")}</option><option value="guide">{t("businessEntityDetail.roles.guide")}</option><option value="viewer">{t("businessEntityDetail.roles.viewer")}</option></select></label>
            </div>
            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{t("businessEntityDetail.form.temporaryPassword")}</p><p className="mt-1 text-sm font-semibold text-slate-500">{t("businessEntityDetail.form.passwordHelp")}</p></div><button type="button" onClick={() => { setShowManualPassword((c) => !c); updatePartnerForm("generate_password", showManualPassword); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">{showManualPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showManualPassword ? t("businessEntityDetail.actions.useGeneratedPassword") : t("businessEntityDetail.actions.enterManually")}</button></div>{showManualPassword && <input type="text" value={partnerForm.login_password} onChange={(e) => updatePartnerForm("login_password", e.target.value)} placeholder={t("businessEntityDetail.form.passwordPlaceholder")} className="mt-4 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" />}</div>
            <div className="mt-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">{t("businessEntityDetail.form.permissions")}</p><p className="mt-1 text-sm font-semibold text-slate-500">{t("businessEntityDetail.form.permissionsHelp")}</p></div><label className="inline-flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={partnerForm.apply_role_defaults} onChange={(e) => updatePartnerForm("apply_role_defaults", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />{t("businessEntityDetail.form.applyRoleDefaults")}</label></div><div className="mt-4 grid gap-3 md:grid-cols-2">{PARTNER_PERMISSION_OPTIONS.map((permission) => <label key={permission.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"><input type="checkbox" checked={partnerForm[permission.key]} onChange={(e) => updatePartnerForm(permission.key, e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300" /><span><span className="block text-sm font-black text-slate-900">{t(permission.labelKey)}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{t(permission.descriptionKey)}</span></span></label>)}</div></div>
            <div className="mt-6 flex justify-end"><button type="button" onClick={() => void handleCreatePartnerLogin()} disabled={partnerActionLoading === "create"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">{partnerActionLoading === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}{t("businessEntityDetail.actions.createLogin")}</button></div>
          </div>
        )}

        <div className="mt-6"><div className="flex items-center justify-between gap-4"><div><h3 className="font-black text-slate-950">{t("businessEntityDetail.partnerUsers.title")}</h3><p className="mt-1 text-sm font-semibold text-slate-500">{t(
              partnerUsers.length === 1
                ? "businessEntityDetail.partnerUsers.oneAccount"
                : "businessEntityDetail.partnerUsers.accounts",
              {
                count: partnerUsers.length,
                entity: entity.name,
              },
            )}</p></div><button type="button" onClick={() => void loadPartnerUsers()} disabled={partnerUsersLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${partnerUsersLoading ? "animate-spin" : ""}`} />{t("businessEntityDetail.actions.refreshUsers")}</button></div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">{partnerUsersLoading && !partnerUsers.length ? <div className="col-span-full flex items-center justify-center rounded-3xl border border-slate-200 py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div> : partnerUsers.length ? partnerUsers.map((access) => <article key={access.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-black text-slate-950">{access.user_name || access.username || access.user_email || t("businessEntityDetail.partnerUsers.fallbackUser")}</p><p className="mt-1 truncate text-sm font-semibold text-slate-500">{access.user_email || t("businessEntityDetail.partnerUsers.noEmail")}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${access.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{access.is_active ? t("businessEntityDetail.statuses.active") : t("businessEntityDetail.common.disabled")}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{t("businessEntityDetail.form.role")}</p><p className="mt-1 text-sm font-black capitalize text-slate-800">{t(`businessEntityDetail.roles.${String(access.role)}`, undefined, String(access.role).replaceAll("_", " "))}</p></div><div className="rounded-2xl bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{t("businessEntityDetail.partnerUsers.lastAccess")}</p><p className="mt-1 text-sm font-black text-slate-800">{formatDateTime(access.last_access_at, language)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{PARTNER_PERMISSION_OPTIONS.filter(({ key }) => access[key]).slice(0, 5).map((permission) => <span key={permission.key} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{t(permission.labelKey)}</span>)}</div><div className="mt-5 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void handleResetPassword(access)} disabled={partnerActionLoading === access.id} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-60">{partnerActionLoading === access.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}{t("businessEntityDetail.actions.resetPassword")}</button><button type="button" onClick={() => void handleTogglePartnerUser(access)} disabled={partnerActionLoading === access.id} className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition disabled:opacity-60 ${access.is_active ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}><Power className="h-4 w-4" />{access.is_active ? t("businessEntityDetail.actions.deactivate") : t("businessEntityDetail.actions.activate")}</button></div></article>) : <div className="col-span-full rounded-3xl border border-dashed border-slate-200 py-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-black text-slate-700">{t("businessEntityDetail.partnerUsers.emptyTitle")}</p><p className="mt-1 text-sm font-semibold text-slate-400">{t("businessEntityDetail.partnerUsers.emptyDescription")}</p></div>}</div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("businessEntityDetail.configuration.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("businessEntityDetail.configuration.title")}
              </h2>
            </div>

            <ShieldCheck className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("businessEntityDetail.configuration.canScanTickets")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.can_scan_tickets ? t("businessEntityDetail.common.yes") : t("businessEntityDetail.common.no")}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("businessEntityDetail.configuration.partialAdmission")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.allow_partial_admission ? t("businessEntityDetail.common.allowed") : t("businessEntityDetail.common.disabled")}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("businessEntityDetail.configuration.offlineScanning")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {entity.allow_offline_scanning ? t("businessEntityDetail.common.allowed") : t("businessEntityDetail.common.disabled")}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                {t("businessEntityDetail.configuration.settlementCycle")}
              </p>
              <p className="mt-2 font-black text-slate-900">
                {t("businessEntityDetail.configuration.days", { count: entity.settlement_cycle_days || 10 })}
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <Mail className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {t("businessEntityDetail.form.email")}
                </p>
                <p className="mt-1 font-bold text-slate-800">
                  {entity.contact_email || t("businessEntityDetail.common.notProvided")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <Phone className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {t("businessEntityDetail.contact.phone")}
                </p>
                <p className="mt-1 font-bold text-slate-800">
                  {entity.contact_phone ||
                    entity.contact_whatsapp ||
                    t("businessEntityDetail.common.notProvided")}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4">
              <MapPin className="mt-0.5 h-5 w-5 text-slate-400" />
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                  {t("businessEntityDetail.contact.address")}
                </p>
                <p className="mt-1 font-bold leading-6 text-slate-800">
                  {entity.address || t("businessEntityDetail.common.notProvided")}
                </p>
              </div>
            </div>
          </div>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("businessEntityDetail.finance.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("businessEntityDetail.finance.title")}
              </h2>
            </div>

            <WalletCards className="h-6 w-6 text-slate-300" />
          </div>

          <div className="mt-6 rounded-3xl bg-slate-950 p-5 text-white">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-white/40">
              {t("businessEntityDetail.finance.period")}
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
                      {t("businessEntityDetail.finance.netSettlement")}
                    </p>
                    <p className="mt-2 text-lg font-black">
                      {formatMoney(
                        currentSettlement.net_settlement_amount,
                        currentSettlement.currency,
                        language,
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl bg-white/5 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-white/40">
                      {t("businessEntityDetail.finance.outstanding")}
                    </p>
                    <p className="mt-2 text-lg font-black">
                      {formatMoney(
                        currentSettlement.outstanding_amount,
                        currentSettlement.currency,
                        language,
                      )}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between rounded-2xl bg-white/5 px-4 py-3">
                  <span className="text-sm font-bold text-white/50">
                    {t("businessEntityDetail.finance.status")}
                  </span>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black capitalize">
                    {t(
                      `businessEntityDetail.settlementStatuses.${String(
                        currentSettlement.status,
                      )}`,
                      undefined,
                      String(currentSettlement.status).replaceAll("_", " "),
                    )}
                  </span>
                </div>

                <Link
                  to={`/ticketing/${slug}/operations/settlements/${currentSettlement.id}`}
                  className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-white text-sm font-black text-slate-950 transition hover:bg-slate-100"
                >
                  {t("businessEntityDetail.actions.openSettlement")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-white/20 px-4 py-8 text-center">
                <p className="font-black">
                  {t("businessEntityDetail.finance.noSettlement")}
                </p>
                <p className="mt-2 text-sm font-semibold text-white/50">
                  {t("businessEntityDetail.finance.noSettlementHelp")}
                </p>
              </div>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-emerald-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-600">
                {t("businessEntityDetail.finance.partnerEntitlement")}
              </p>
              <p className="mt-2 text-lg font-black text-emerald-800">
                {formatMoney(
                  dashboard.totals.partner_entitlement,
                  currency,
                  language,
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-blue-600">
                {t("businessEntityDetail.finance.platformEntitlement")}
              </p>
              <p className="mt-2 text-lg font-black text-blue-800">
                {formatMoney(
                  dashboard.totals.platform_entitlement,
                  currency,
                  language,
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
                {t("businessEntityDetail.agreements.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("businessEntityDetail.agreements.title")}
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
                        {t(
                          `businessEntityDetail.agreementTypes.${String(
                            agreement.agreement_type,
                          )}`,
                          undefined,
                          String(agreement.agreement_type).replaceAll("_", " "),
                        )}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">
                      v{agreement.version}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                      {t(
                        `businessEntityDetail.settlementBasis.${String(
                          agreement.settlement_basis,
                        )}`,
                        undefined,
                        String(agreement.settlement_basis).replaceAll("_", " "),
                      )}
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
                  {t("businessEntityDetail.agreements.emptyTitle")}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-400">
                  {t("businessEntityDetail.agreements.emptyDescription")}
                </p>
              </div>
            )}
          </div>

          <Link
            to={`/ticketing/${slug}/operations/agreements`}
            className="mt-5 inline-flex items-center gap-2 text-sm font-black text-slate-700 transition hover:text-slate-950"
          >
            {t("businessEntityDetail.actions.manageAgreements")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </article>

        <article className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                {t("businessEntityDetail.scans.eyebrow")}
              </p>
              <h2 className="mt-1 text-xl font-black text-slate-950">
                {t("businessEntityDetail.scans.title")}
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
                        t("businessEntityDetail.scans.unresolvedTicket")}
                    </p>
                    <p className="mt-1 truncate text-xs font-semibold text-slate-400">
                      {scan.product_name ||
                        scan.failure_reason ||
                        scan.scanner_name ||
                        t("businessEntityDetail.scans.scanAttempt")}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black capitalize ${scanTone(
                        scan.result,
                      )}`}
                    >
                      {t(`businessEntityDetail.scanResults.${String(scan.result)}`, undefined, String(scan.result).replaceAll("_", " "))}
                    </span>
                    <p className="mt-2 flex items-center justify-end gap-1 text-xs font-bold text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDateTime(scan.scanned_at, language)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-10 text-center">
                <ScanLine className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-bold text-slate-400">
                  {t("businessEntityDetail.scans.empty")}
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
            {t("businessEntityDetail.quickActions.openScanner")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t("businessEntityDetail.quickActions.openScannerHelp")}
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/admissions?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <CalendarCheck2 className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            {t("businessEntityDetail.quickActions.admissions")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t("businessEntityDetail.quickActions.admissionsHelp")}
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/settlements?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <WalletCards className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            {t("businessEntityDetail.quickActions.settlements")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t("businessEntityDetail.quickActions.settlementsHelp")}
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>

        <Link
          to={`/ticketing/${slug}/operations/scan-attempts?business_entity=${entity.id}`}
          className="group rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Users className="h-6 w-6 text-slate-500" />
          <p className="mt-4 font-black text-slate-950">
            {t("businessEntityDetail.quickActions.scanAudit")}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-400">
            {t("businessEntityDetail.quickActions.scanAuditHelp")}
          </p>
          <ArrowRight className="mt-4 h-4 w-4 text-slate-400 transition group-hover:translate-x-1" />
        </Link>
      </section>

      {credentials && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">{t("businessEntityDetail.credentials.success")}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{credentials.title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{t("businessEntityDetail.credentials.copyNow")}</p></div><button type="button" onClick={() => setCredentials(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button></div>
            <div className="mt-6 space-y-3">{[[t("businessEntityDetail.credentials.loginUrl"), credentials.loginUrl, "credential-url"],[t("businessEntityDetail.credentials.email"), credentials.email, "credential-email"],[t("businessEntityDetail.credentials.username"), credentials.username, "credential-username"],[t("businessEntityDetail.credentials.temporaryPassword"), credentials.password, "credential-password"]].map(([label, value, copyKey]) => <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-all font-black text-slate-900">{value || t("businessEntityDetail.credentials.notReturned")}</p></div>{value && <button type="button" onClick={() => void copyText(value, copyKey)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm hover:bg-slate-100">{copiedValue === copyKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}</button>}</div>)}</div>
            <button type="button" onClick={() => setCredentials(null)} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800">{t("businessEntityDetail.actions.done")}</button>
          </div>
        </div>
      )}
    </div>
  );
}
