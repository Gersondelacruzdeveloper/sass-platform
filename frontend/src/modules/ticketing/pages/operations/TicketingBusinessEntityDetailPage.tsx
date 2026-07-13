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

const PARTNER_PERMISSION_OPTIONS: Array<{ key: PartnerPermissionKey; label: string; description: string }> = [
  { key: "can_access_dashboard", label: "Access dashboard", description: "Open the restricted Partner Portal." },
  { key: "can_scan", label: "Scan tickets", description: "Validate QR codes and confirm entry." },
  { key: "can_view_today_bookings", label: "View today’s bookings", description: "See expected guests for this business entity." },
  { key: "can_view_admissions", label: "View admissions", description: "Review completed guest admissions." },
  { key: "can_view_customer_contact", label: "View customer contact", description: "Show customer phone and email details." },
  { key: "can_view_financials", label: "View financials", description: "See partner financial summaries." },
  { key: "can_view_settlements", label: "View settlements", description: "Review settlement periods and balances." },
  { key: "can_record_payments", label: "Record payments", description: "Record authorised settlement payments." },
  { key: "can_reverse_admissions", label: "Reverse admissions", description: "Undo an admission when authorised." },
  { key: "can_manage_users", label: "Manage partner users", description: "Create and maintain other partner accounts." },
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
      setPartnerError(getErrorMessage(error));
    } finally {
      setPartnerUsersLoading(false);
    }
  }, [entityId, slug]);

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
    if (!partnerForm.login_name.trim()) return setPartnerError("Full name is required.");
    if (!partnerForm.login_email.trim()) return setPartnerError("Email is required.");
    if (!partnerForm.generate_password && partnerForm.login_password.trim().length < 10) {
      return setPartnerError("Manual temporary password must contain at least 10 characters.");
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
        title: "Partner login created",
        email: created.user_email || partnerForm.login_email,
        username: created.username || partnerForm.login_username || partnerForm.login_email,
        password: created.generated_password || created.temporary_password || partnerForm.login_password,
        loginUrl: created.partner_login_url ? `${window.location.origin}${created.partner_login_url}` : partnerLoginUrl,
      });
      setPartnerForm(DEFAULT_PARTNER_FORM); setShowManualPassword(false); setShowCreateLogin(false);
      await loadPartnerUsers();
    } catch (error) { setPartnerError(getErrorMessage(error)); }
    finally { setPartnerActionLoading(null); }
  }

  async function handleResetPassword(access: BusinessEntityUserAccess) {
    if (!slug) return;
    setPartnerActionLoading(access.id); setPartnerError("");
    try {
      const result: BusinessEntityPasswordResetResponse = await ticketingApi.resetBusinessEntityUserPassword(access.id, { generate_password: true }, slug);
      setCredentials({ title: "Temporary password reset", email: result.user_email || access.user_email || "",
        username: result.username || access.username || access.user_email || "",
        password: result.temporary_password,
        loginUrl: result.partner_login_url ? `${window.location.origin}${result.partner_login_url}` : partnerLoginUrl });
    } catch (error) { setPartnerError(getErrorMessage(error)); }
    finally { setPartnerActionLoading(null); }
  }

  async function handleTogglePartnerUser(access: BusinessEntityUserAccess) {
    if (!slug) return;
    setPartnerActionLoading(access.id); setPartnerError("");
    try {
      if (access.is_active) await ticketingApi.deactivateBusinessEntityUser(access.id, slug);
      else await ticketingApi.activateBusinessEntityUser(access.id, slug);
      await loadPartnerUsers();
    } catch (error) { setPartnerError(getErrorMessage(error)); }
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

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Restricted access</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">Partner Portal Access</h2>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-500">Create secure logins for this partner. Each account is restricted by role and permissions.</p>
          </div>
          <button type="button" onClick={() => setShowCreateLogin((current) => !current)} className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
            {showCreateLogin ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {showCreateLogin ? "Close form" : "Create partner login"}
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Partner login URL</p><p className="mt-1 truncate text-sm font-black text-slate-800">{partnerLoginUrl}</p></div>
          <button type="button" onClick={() => void copyText(partnerLoginUrl, "login-url")} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-100">
            {copiedValue === "login-url" ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copiedValue === "login-url" ? "Copied" : "Copy URL"}
          </button>
        </div>

        {partnerError && <div className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-800"><CircleAlert className="mt-0.5 h-5 w-5 shrink-0" /><p className="text-sm font-bold">{partnerError}</p></div>}

        {showCreateLogin && (
          <div className="mt-6 rounded-[2rem] border border-slate-200 bg-slate-50 p-4 sm:p-6">
            <div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-sm"><KeyRound className="h-5 w-5 text-slate-700" /></div><div><h3 className="font-black text-slate-950">New partner account</h3><p className="text-sm font-semibold text-slate-500">The temporary password is shown once after creation.</p></div></div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <label className="block"><span className="text-sm font-black text-slate-700">Full name</span><input value={partnerForm.login_name} onChange={(e) => updatePartnerForm("login_name", e.target.value)} placeholder="John Smith" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">Email</span><input type="email" value={partnerForm.login_email} onChange={(e) => updatePartnerForm("login_email", e.target.value)} placeholder="doorstaff@example.com" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">Username</span><input value={partnerForm.login_username} onChange={(e) => updatePartnerForm("login_username", e.target.value)} placeholder="Optional — generated automatically" className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" /></label>
              <label className="block"><span className="text-sm font-black text-slate-700">Role</span><select value={partnerForm.role} onChange={(e) => applyLocalRoleDefaults(e.target.value as BusinessEntityRole)} className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-900 outline-none focus:border-slate-400"><option value="administrator">Administrator</option><option value="supervisor">Supervisor</option><option value="scanner">Scanner / Door Staff</option><option value="finance">Finance</option><option value="driver">Driver</option><option value="guide">Guide</option><option value="viewer">Viewer</option></select></label>
            </div>
            <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">Temporary password</p><p className="mt-1 text-sm font-semibold text-slate-500">Generate a secure password or enter one manually.</p></div><button type="button" onClick={() => { setShowManualPassword((c) => !c); updatePartnerForm("generate_password", showManualPassword); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50">{showManualPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{showManualPassword ? "Use generated password" : "Enter manually"}</button></div>{showManualPassword && <input type="text" value={partnerForm.login_password} onChange={(e) => updatePartnerForm("login_password", e.target.value)} placeholder="Minimum 10 characters" className="mt-4 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-900 outline-none focus:border-slate-400" />}</div>
            <div className="mt-5"><div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-black text-slate-900">Permissions</p><p className="mt-1 text-sm font-semibold text-slate-500">Role defaults are selected automatically and can be adjusted.</p></div><label className="inline-flex items-center gap-2 text-sm font-black text-slate-700"><input type="checkbox" checked={partnerForm.apply_role_defaults} onChange={(e) => updatePartnerForm("apply_role_defaults", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />Apply backend role defaults</label></div><div className="mt-4 grid gap-3 md:grid-cols-2">{PARTNER_PERMISSION_OPTIONS.map((permission) => <label key={permission.key} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 hover:border-slate-300"><input type="checkbox" checked={partnerForm[permission.key]} onChange={(e) => updatePartnerForm(permission.key, e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300" /><span><span className="block text-sm font-black text-slate-900">{permission.label}</span><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{permission.description}</span></span></label>)}</div></div>
            <div className="mt-6 flex justify-end"><button type="button" onClick={() => void handleCreatePartnerLogin()} disabled={partnerActionLoading === "create"} className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60">{partnerActionLoading === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Create login</button></div>
          </div>
        )}

        <div className="mt-6"><div className="flex items-center justify-between gap-4"><div><h3 className="font-black text-slate-950">Partner users</h3><p className="mt-1 text-sm font-semibold text-slate-500">{partnerUsers.length} account{partnerUsers.length === 1 ? "" : "s"} assigned to {entity.name}.</p></div><button type="button" onClick={() => void loadPartnerUsers()} disabled={partnerUsersLoading} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${partnerUsersLoading ? "animate-spin" : ""}`} />Refresh users</button></div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">{partnerUsersLoading && !partnerUsers.length ? <div className="col-span-full flex items-center justify-center rounded-3xl border border-slate-200 py-10"><Loader2 className="h-5 w-5 animate-spin text-slate-500" /></div> : partnerUsers.length ? partnerUsers.map((access) => <article key={access.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5"><div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="truncate font-black text-slate-950">{access.user_name || access.username || access.user_email || "Partner user"}</p><p className="mt-1 truncate text-sm font-semibold text-slate-500">{access.user_email || "No email returned"}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${access.is_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{access.is_active ? "Active" : "Disabled"}</span></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-2xl bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Role</p><p className="mt-1 text-sm font-black capitalize text-slate-800">{String(access.role).replaceAll("_", " ")}</p></div><div className="rounded-2xl bg-white p-3"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Last access</p><p className="mt-1 text-sm font-black text-slate-800">{formatDateTime(access.last_access_at)}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{PARTNER_PERMISSION_OPTIONS.filter(({ key }) => access[key]).slice(0, 5).map((permission) => <span key={permission.key} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-600 shadow-sm">{permission.label}</span>)}</div><div className="mt-5 flex flex-col gap-2 sm:flex-row"><button type="button" onClick={() => void handleResetPassword(access)} disabled={partnerActionLoading === access.id} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-100 disabled:opacity-60">{partnerActionLoading === access.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Reset password</button><button type="button" onClick={() => void handleTogglePartnerUser(access)} disabled={partnerActionLoading === access.id} className={`inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xs font-black transition disabled:opacity-60 ${access.is_active ? "bg-rose-100 text-rose-700 hover:bg-rose-200" : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"}`}><Power className="h-4 w-4" />{access.is_active ? "Deactivate" : "Activate"}</button></div></article>) : <div className="col-span-full rounded-3xl border border-dashed border-slate-200 py-10 text-center"><Users className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 font-black text-slate-700">No partner logins yet</p><p className="mt-1 text-sm font-semibold text-slate-400">Create the first restricted login for this business entity.</p></div>}</div>
        </div>
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

      {credentials && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] bg-white p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-600">Success</p><h2 className="mt-1 text-2xl font-black text-slate-950">{credentials.title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Copy these credentials now. The password will not be available after this window is closed.</p></div><button type="button" onClick={() => setCredentials(null)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200"><X className="h-5 w-5" /></button></div>
            <div className="mt-6 space-y-3">{[["Login URL", credentials.loginUrl, "credential-url"],["Email", credentials.email, "credential-email"],["Username", credentials.username, "credential-username"],["Temporary password", credentials.password, "credential-password"]].map(([label, value, copyKey]) => <div key={label} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="min-w-0"><p className="text-xs font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 break-all font-black text-slate-900">{value || "Not returned"}</p></div>{value && <button type="button" onClick={() => void copyText(value, copyKey)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm hover:bg-slate-100">{copiedValue === copyKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Clipboard className="h-4 w-4" />}</button>}</div>)}</div>
            <button type="button" onClick={() => setCredentials(null)} className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-950 text-sm font-black text-white hover:bg-slate-800">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}
