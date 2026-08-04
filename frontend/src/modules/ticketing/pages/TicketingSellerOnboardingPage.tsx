import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  BadgeDollarSign,
  CheckCircle2,
  ClipboardCopy,
  FileText,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserRoundPlus,
  Users,
  WalletCards,
  X,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import TicketingPageShell from "../components/TicketingPageShell";
import SellerPermissionGrid from "../components/seller-onboarding/SellerPermissionGrid";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import {
  DEFAULT_SELLER_PERMISSIONS,
  formatDateTime,
  formatMoney,
  getApiError,
  humanize,
  statusClasses,
} from "../seller-onboarding/sellerOnboardingUi";
import type {
  ExperienceProduct,
  SellerApplication,
  SellerApplicationDecisionPayload,
  SellerCommissionType,
  SellerPayoutDecisionPayload,
  SellerPayoutRequest,
  SellerPermissions,
  SellerRole,
  SellerSignupInvite,
  SellerSignupInvitePayload,
} from "../types/ticketingTypes";

type TabKey = "invites" | "applications" | "payouts";

type InviteFormState = SellerSignupInvitePayload;

type ApprovalFormState = {
  role: SellerRole;
  commission_type: SellerCommissionType;
  commission_rate: string;
  fixed_commission_amount: string;
  default_margin_percent: string;
  max_customer_discount_percent: string;
  permissions: Partial<SellerPermissions>;
  product_ids: number[];
  review_notes: string;
};

const PRODUCT_TYPES = [
  "excursion",
  "transfer",
  "ticket",
  "event",
  "nightlife",
  "custom",
] as const;

const ROLE_OPTIONS: SellerRole[] = [
  "seller",
  "external_vendor",
  "supervisor",
  "manager",
  "driver",
  "viewer",
];

const APPLICATION_STATUSES = [
  "pending",
  "needs_information",
  "approved",
  "rejected",
  "withdrawn",
];

const PAYOUT_STATUSES = [
  "requested",
  "under_review",
  "approved",
  "processing",
  "paid",
  "rejected",
  "cancelled",
];

function newInvite(): InviteFormState {
  return {
    name: "Independent sellers",
    description: "Apply to become an approved seller for this organisation.",
    default_role: "seller",
    default_commission_type: "percentage",
    default_commission_rate: "10.00",
    default_fixed_commission_amount: "0.00",
    default_margin_percent: "0.00",
    default_max_customer_discount_percent: "0.00",
    default_permissions: { ...DEFAULT_SELLER_PERMISSIONS },
    allowed_products: [],
    allowed_product_types: ["excursion", "transfer", "event", "ticket"],
    require_profile_photo: true,
    require_identification: true,
    show_commission_offer: true,
    terms_version: "seller-terms-v1",
    expires_at: null,
    max_uses: 0,
    is_active: true,
  };
}

function applicationToApproval(application: SellerApplication): ApprovalFormState {
  return {
    role:
      (application.invitation_snapshot?.default_role as SellerRole | undefined) ||
      "seller",
    commission_type: application.commission_type || "percentage",
    commission_rate: String(application.proposed_commission_rate || "0.00"),
    fixed_commission_amount: String(
      application.proposed_fixed_commission_amount || "0.00",
    ),
    default_margin_percent: String(application.proposed_margin_percent || "0.00"),
    max_customer_discount_percent: String(
      application.proposed_max_customer_discount_percent || "0.00",
    ),
    permissions: {
      ...DEFAULT_SELLER_PERMISSIONS,
      ...(application.permissions || {}),
    },
    product_ids: application.assigned_products.map((product) => product.id),
    review_notes: application.review_notes || "",
  };
}

function SectionCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusClasses(
        status,
      )}`}
    >
      {humanize(status)}
    </span>
  );
}

function Modal({
  open,
  title,
  onClose,
  children,
  width = "max-w-5xl",
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <div className={`max-h-[92vh] w-full ${width} overflow-hidden rounded-[2rem] bg-white shadow-2xl`}>
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <h2 className="text-xl font-black text-slate-950">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[calc(92vh-80px)] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  helper,
}: {
  label: string;
  children: ReactNode;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
      {helper ? <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span> : null}
    </label>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";
const textareaClass =
  "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";

export default function TicketingSellerOnboardingPage() {
  const { language } = useTicketingAdminTranslation();
  const { organisationSlug = "" } = useParams<{ organisationSlug: string }>();
  const lang = language === "es" ? "es" : "en";

  const [tab, setTab] = useState<TabKey>("invites");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [invites, setInvites] = useState<SellerSignupInvite[]>([]);
  const [applications, setApplications] = useState<SellerApplication[]>([]);
  const [payouts, setPayouts] = useState<SellerPayoutRequest[]>([]);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingInvite, setEditingInvite] = useState<SellerSignupInvite | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(newInvite());

  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationStatus, setApplicationStatus] = useState("");
  const [selectedApplication, setSelectedApplication] = useState<SellerApplication | null>(null);
  const [approvalForm, setApprovalForm] = useState<ApprovalFormState | null>(null);
  const [decisionNote, setDecisionNote] = useState("");

  const [payoutStatus, setPayoutStatus] = useState("");
  const [selectedPayout, setSelectedPayout] = useState<SellerPayoutRequest | null>(null);
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutReason, setPayoutReason] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  const filteredApplications = useMemo(() => {
    const query = applicationSearch.trim().toLowerCase();

    return applications.filter((application) => {
      if (applicationStatus && application.status !== applicationStatus) return false;
      if (!query) return true;

      return [
        application.legal_name,
        application.display_name,
        application.email,
        application.phone,
        application.business_name,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [applications, applicationSearch, applicationStatus]);

  const filteredPayouts = useMemo(
    () => payouts.filter((payout) => !payoutStatus || payout.status === payoutStatus),
    [payouts, payoutStatus],
  );

  async function loadAll(showRefresh = false) {
    if (!organisationSlug) return;

    try {
      showRefresh ? setRefreshing(true) : setLoading(true);
      setError("");

      const [productData, inviteData, applicationData, payoutData] = await Promise.all([
        ticketingApi.getProducts(organisationSlug, { is_active: true }),
        ticketingApi.getSellerSignupInvites(organisationSlug),
        ticketingApi.getSellerApplications(organisationSlug),
        ticketingApi.getOwnerSellerPayoutRequests(organisationSlug),
      ]);

      setProducts(productData);
      setInvites(inviteData);
      setApplications(applicationData);
      setPayouts(payoutData);
    } catch (loadError) {
      setError(getApiError(loadError, "Could not load seller onboarding information."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, [organisationSlug]);

  function openNewInvite() {
    setEditingInvite(null);
    setInviteForm(newInvite());
    setInviteModalOpen(true);
  }

  function openEditInvite(invite: SellerSignupInvite) {
    setEditingInvite(invite);
    setInviteForm({
      name: invite.name,
      description: invite.description || "",
      default_role: invite.default_role,
      default_commission_type: invite.default_commission_type,
      default_commission_rate: invite.default_commission_rate,
      default_fixed_commission_amount: invite.default_fixed_commission_amount,
      default_margin_percent: invite.default_margin_percent,
      default_max_customer_discount_percent:
        invite.default_max_customer_discount_percent,
      default_permissions: { ...invite.default_permissions },
      allowed_products: [...invite.allowed_products],
      allowed_product_types: [...invite.allowed_product_types],
      require_profile_photo: invite.require_profile_photo,
      require_identification: invite.require_identification,
      show_commission_offer: invite.show_commission_offer,
      terms_version: invite.terms_version,
      expires_at: invite.expires_at || null,
      max_uses: invite.max_uses,
      is_active: invite.is_active,
    });
    setInviteModalOpen(true);
  }

  async function saveInvite(event: FormEvent) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");

      if (editingInvite) {
        await ticketingApi.updateSellerSignupInvite(
          organisationSlug,
          editingInvite.id,
          inviteForm,
        );
        setMessage("Seller signup link updated.");
      } else {
        await ticketingApi.createSellerSignupInvite(organisationSlug, inviteForm);
        setMessage("Seller signup link created.");
      }

      setInviteModalOpen(false);
      await loadAll(true);
    } catch (saveError) {
      setError(getApiError(saveError, "Could not save the seller signup link."));
    } finally {
      setSaving(false);
    }
  }

  async function removeInvite(invite: SellerSignupInvite) {
    if (!window.confirm(`Delete “${invite.name}”?`)) return;

    try {
      setSaving(true);
      await ticketingApi.deleteSellerSignupInvite(organisationSlug, invite.id);
      setMessage("Seller signup link deleted.");
      await loadAll(true);
    } catch (deleteError) {
      setError(getApiError(deleteError, "Could not delete the signup link."));
    } finally {
      setSaving(false);
    }
  }

  async function rotateInvite(invite: SellerSignupInvite) {
    if (!window.confirm("Rotate this token? The previous signup URL will stop working.")) return;

    try {
      setSaving(true);
      const updated = await ticketingApi.rotateSellerSignupInviteToken(
        organisationSlug,
        invite.id,
      );
      setInvites((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Signup token rotated.");
    } catch (rotateError) {
      setError(getApiError(rotateError, "Could not rotate the signup token."));
    } finally {
      setSaving(false);
    }
  }

  async function copyInvite(invite: SellerSignupInvite) {
    const url = invite.signup_url.startsWith("http")
      ? invite.signup_url
      : `${window.location.origin}${invite.signup_url}`;
    await navigator.clipboard.writeText(url);
    setMessage("Signup URL copied.");
  }

  function openApplication(application: SellerApplication) {
    setSelectedApplication(application);
    setApprovalForm(applicationToApproval(application));
    setDecisionNote(application.review_notes || "");
  }

  async function approveApplication() {
    if (!selectedApplication || !approvalForm) return;

    try {
      setSaving(true);
      setError("");

      const payload: SellerApplicationDecisionPayload = {
        ...approvalForm,
        commission_rate: Number(approvalForm.commission_rate || 0),
        fixed_commission_amount: Number(approvalForm.fixed_commission_amount || 0),
        default_margin_percent: Number(approvalForm.default_margin_percent || 0),
        max_customer_discount_percent: Number(
          approvalForm.max_customer_discount_percent || 0,
        ),
      };

      const updated = await ticketingApi.approveSellerApplication(
        organisationSlug,
        selectedApplication.id,
        payload,
      );
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedApplication(updated);
      setMessage("Seller application approved.");
    } catch (approveError) {
      setError(getApiError(approveError, "Could not approve the application."));
    } finally {
      setSaving(false);
    }
  }

  async function requestInformation() {
    if (!selectedApplication || !decisionNote.trim()) {
      setError("Enter the information the applicant must provide.");
      return;
    }

    try {
      setSaving(true);
      const updated = await ticketingApi.requestSellerApplicationInformation(
        organisationSlug,
        selectedApplication.id,
        decisionNote.trim(),
      );
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedApplication(updated);
      setMessage("More information requested.");
    } catch (requestError) {
      setError(getApiError(requestError, "Could not request more information."));
    } finally {
      setSaving(false);
    }
  }

  async function rejectApplication() {
    if (!selectedApplication || !decisionNote.trim()) {
      setError("Enter a rejection reason.");
      return;
    }

    try {
      setSaving(true);
      const updated = await ticketingApi.rejectSellerApplication(
        organisationSlug,
        selectedApplication.id,
        decisionNote.trim(),
      );
      setApplications((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedApplication(updated);
      setMessage("Seller application rejected.");
    } catch (rejectError) {
      setError(getApiError(rejectError, "Could not reject the application."));
    } finally {
      setSaving(false);
    }
  }

  async function runPayoutAction(
    action: "approve" | "reject" | "processing" | "paid",
  ) {
    if (!selectedPayout) return;

    try {
      setSaving(true);
      setError("");
      let updated: SellerPayoutRequest;

      if (action === "approve") {
        updated = await ticketingApi.approveSellerPayoutRequest(
          organisationSlug,
          selectedPayout.id,
          { owner_note: payoutNote },
        );
      } else if (action === "reject") {
        if (!payoutReason.trim()) {
          setError("Enter a rejection reason.");
          return;
        }
        updated = await ticketingApi.rejectSellerPayoutRequest(
          organisationSlug,
          selectedPayout.id,
          { rejection_reason: payoutReason, owner_note: payoutNote },
        );
      } else if (action === "processing") {
        updated = await ticketingApi.markSellerPayoutProcessing(
          organisationSlug,
          selectedPayout.id,
        );
      } else {
        if (!paymentReference.trim()) {
          setError("Enter a payment reference.");
          return;
        }
        const payload: SellerPayoutDecisionPayload = {
          payment_reference: paymentReference.trim(),
          owner_note: payoutNote,
          payment_receipt: receiptFile,
        };
        updated = await ticketingApi.markSellerPayoutPaid(
          organisationSlug,
          selectedPayout.id,
          payload,
        );
      }

      setPayouts((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedPayout(updated);
      setMessage(`Payout marked ${humanize(updated.status).toLowerCase()}.`);
    } catch (actionError) {
      setError(getApiError(actionError, "Could not update the payout request."));
    } finally {
      setSaving(false);
    }
  }

  const tabs = [
    { key: "invites" as const, label: "Signup links", icon: Link2, count: invites.length },
    {
      key: "applications" as const,
      label: "Applications",
      icon: UserCheck,
      count: applications.filter((item) => item.status === "pending").length,
    },
    {
      key: "payouts" as const,
      label: "Payout requests",
      icon: WalletCards,
      count: payouts.filter((item) => ["requested", "under_review"].includes(item.status)).length,
    },
  ];

  return (
    <TicketingPageShell title="Seller onboarding">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void loadAll(true)}
          disabled={refreshing}
          className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 shadow-sm disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {message ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <span>{message}</span>
        </div>
      ) : null}

      <div className="mb-5 grid gap-3 md:grid-cols-3">
        {tabs.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`flex items-center justify-between rounded-3xl border p-4 text-left transition ${
                active
                  ? "border-slate-950 bg-slate-950 text-white shadow-lg"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? "bg-white/10" : "bg-slate-100"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-black">{item.label}</span>
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${active ? "bg-white/10" : "bg-slate-100"}`}>
                {item.count}
              </span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center rounded-[2rem] border border-slate-200 bg-white">
          <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
        </div>
      ) : null}

      {!loading && tab === "invites" ? (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-950">Seller signup links</h2>
              <p className="text-sm font-semibold text-slate-500">
                Every link can have its own default commission, permissions and product access.
              </p>
            </div>
            <button
              type="button"
              onClick={openNewInvite}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
            >
              <Plus className="h-4 w-4" /> Create signup link
            </button>
          </div>

          {invites.length === 0 ? (
            <SectionCard className="py-12 text-center">
              <UserRoundPlus className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-black text-slate-900">No signup links yet</h3>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                Create a link and share it with people who want to become sellers.
              </p>
            </SectionCard>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {invites.map((invite) => (
                <SectionCard key={invite.id}>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black text-slate-950">{invite.name}</h3>
                        <StatusBadge status={invite.is_available ? "approved" : "cancelled"} />
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
                        {invite.description || "No description."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditInvite(invite)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Commission</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {invite.default_commission_type === "percentage"
                          ? `${Number(invite.default_commission_rate || 0).toFixed(2)}%`
                          : formatMoney(invite.default_fixed_commission_amount, "USD", lang)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Uses</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {invite.use_count} / {invite.max_uses || "Unlimited"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase tracking-wide text-slate-400">Expires</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {invite.expires_at ? formatDateTime(invite.expires_at, lang) : "Never"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="truncate text-xs font-bold text-slate-600">{invite.signup_url}</p>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void copyInvite(invite)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white"
                    >
                      <ClipboardCopy className="h-4 w-4" /> Copy link
                    </button>
                    <button
                      type="button"
                      onClick={() => void rotateInvite(invite)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700"
                    >
                      <RotateCcw className="h-4 w-4" /> Rotate token
                    </button>
                    <button
                      type="button"
                      onClick={() => void removeInvite(invite)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                </SectionCard>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "applications" ? (
        <div className="space-y-4">
          <SectionCard>
            <div className="grid gap-3 md:grid-cols-[1fr_220px]">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={applicationSearch}
                  onChange={(event) => setApplicationSearch(event.target.value)}
                  placeholder="Search applicant, email, phone or business"
                  className={`${inputClass} pl-11`}
                />
              </div>
              <select
                value={applicationStatus}
                onChange={(event) => setApplicationStatus(event.target.value)}
                className={inputClass}
              >
                <option value="">All statuses</option>
                {APPLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>{humanize(status)}</option>
                ))}
              </select>
            </div>
          </SectionCard>

          {filteredApplications.length === 0 ? (
            <SectionCard className="py-12 text-center">
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-black text-slate-900">No applications found</h3>
            </SectionCard>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredApplications.map((application) => (
                <button
                  key={application.id}
                  type="button"
                  onClick={() => openApplication(application)}
                  className="rounded-[2rem] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                      {application.profile_photo_url ? (
                        <img src={application.profile_photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <UserRoundPlus className="h-6 w-6 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="truncate text-lg font-black text-slate-950">
                          {application.display_name || application.legal_name}
                        </h3>
                        <StatusBadge status={application.status} />
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-500">{application.email}</p>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        {humanize(application.seller_type)} · Submitted {formatDateTime(application.submitted_at, lang)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-slate-400">Commission</p>
                      <p className="mt-1 text-sm font-black text-slate-900">
                        {application.commission_type === "percentage"
                          ? `${Number(application.proposed_commission_rate || 0).toFixed(2)}%`
                          : formatMoney(application.proposed_fixed_commission_amount, "USD", lang)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-slate-400">Experience</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{application.experience_years} years</p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-xs font-black uppercase text-slate-400">Products</p>
                      <p className="mt-1 text-sm font-black text-slate-900">{application.assigned_products.length || "All allowed"}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {!loading && tab === "payouts" ? (
        <div className="space-y-4">
          <SectionCard>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-black text-slate-950">Seller payout requests</h2>
                <p className="text-sm font-semibold text-slate-500">Approve, process and record commission payments.</p>
              </div>
              <select
                value={payoutStatus}
                onChange={(event) => setPayoutStatus(event.target.value)}
                className={`${inputClass} sm:w-56`}
              >
                <option value="">All statuses</option>
                {PAYOUT_STATUSES.map((status) => (
                  <option key={status} value={status}>{humanize(status)}</option>
                ))}
              </select>
            </div>
          </SectionCard>

          {filteredPayouts.length === 0 ? (
            <SectionCard className="py-12 text-center">
              <BadgeDollarSign className="mx-auto h-10 w-10 text-slate-300" />
              <h3 className="mt-4 text-lg font-black text-slate-900">No payout requests found</h3>
            </SectionCard>
          ) : (
            <SectionCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Seller', 'Amount', 'Destination', 'Requested', 'Status', ''].map((label) => (
                        <th key={label} className="px-5 py-4 text-left text-xs font-black uppercase tracking-wide text-slate-500">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredPayouts.map((payout) => (
                      <tr key={payout.id}>
                        <td className="px-5 py-4 text-sm font-black text-slate-900">{payout.seller_name}</td>
                        <td className="px-5 py-4 text-sm font-black text-slate-900">{formatMoney(payout.amount, payout.currency, lang)}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-600">{payout.payout_destination}</td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-500">{formatDateTime(payout.requested_at, lang)}</td>
                        <td className="px-5 py-4"><StatusBadge status={payout.status} /></td>
                        <td className="px-5 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPayout(payout);
                              setPayoutNote(payout.owner_note || "");
                              setPayoutReason(payout.rejection_reason || "");
                              setPaymentReference(payout.payment_reference || "");
                              setReceiptFile(null);
                            }}
                            className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white"
                          >
                            Review
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>
      ) : null}

      <Modal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        title={editingInvite ? "Edit seller signup link" : "Create seller signup link"}
      >
        <form onSubmit={saveInvite} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Invitation name">
              <input
                value={inviteForm.name}
                onChange={(event) => setInviteForm((current) => ({ ...current, name: event.target.value }))}
                className={inputClass}
                required
              />
            </Field>
            <Field label="Default role">
              <select
                value={inviteForm.default_role}
                onChange={(event) => setInviteForm((current) => ({ ...current, default_role: event.target.value as SellerRole }))}
                className={inputClass}
              >
                {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <textarea
              value={inviteForm.description}
              onChange={(event) => setInviteForm((current) => ({ ...current, description: event.target.value }))}
              className={textareaClass}
            />
          </Field>

          <SectionCard className="bg-slate-50 shadow-none">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Commission type">
                <select
                  value={inviteForm.default_commission_type}
                  onChange={(event) => setInviteForm((current) => ({ ...current, default_commission_type: event.target.value as SellerCommissionType }))}
                  className={inputClass}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed_amount">Fixed amount</option>
                </select>
              </Field>
              {inviteForm.default_commission_type === "percentage" ? (
                <Field label="Commission percentage">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={String(inviteForm.default_commission_rate)}
                    onChange={(event) => setInviteForm((current) => ({ ...current, default_commission_rate: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
              ) : (
                <Field label="Fixed commission amount">
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={String(inviteForm.default_fixed_commission_amount)}
                    onChange={(event) => setInviteForm((current) => ({ ...current, default_fixed_commission_amount: event.target.value }))}
                    className={inputClass}
                  />
                </Field>
              )}
              <Field label="Default margin %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={String(inviteForm.default_margin_percent)}
                  onChange={(event) => setInviteForm((current) => ({ ...current, default_margin_percent: event.target.value }))}
                  className={inputClass}
                />
              </Field>
              <Field label="Maximum customer discount %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={String(inviteForm.default_max_customer_discount_percent)}
                  onChange={(event) => setInviteForm((current) => ({ ...current, default_max_customer_discount_percent: event.target.value }))}
                  className={inputClass}
                />
              </Field>
            </div>
          </SectionCard>

          <div>
            <h3 className="text-sm font-black text-slate-900">Allowed product types</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {PRODUCT_TYPES.map((productType) => {
                const checked = inviteForm.allowed_product_types.includes(productType);
                return (
                  <label key={productType} className={`cursor-pointer rounded-2xl border px-4 py-2 text-sm font-black ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => setInviteForm((current) => ({
                        ...current,
                        allowed_product_types: checked
                          ? current.allowed_product_types.filter((item) => item !== productType)
                          : [...current.allowed_product_types, productType],
                      }))}
                    />
                    {humanize(productType)}
                  </label>
                );
              })}
            </div>
          </div>

          <Field label="Exact products" helper="Leave all unchecked to rely on product-type permissions.">
            <div className="grid max-h-60 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 md:grid-cols-2">
              {products.map((product) => {
                const checked = inviteForm.allowed_products.includes(product.id);
                return (
                  <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => setInviteForm((current) => ({
                        ...current,
                        allowed_products: checked
                          ? current.allowed_products.filter((id) => id !== product.id)
                          : [...current.allowed_products, product.id],
                      }))}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-800">{product.name}</span>
                      <span className="text-xs font-semibold text-slate-400">{humanize(product.product_type)}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Field>

          <div>
            <h3 className="mb-3 text-sm font-black text-slate-900">Default permissions</h3>
            <SellerPermissionGrid
              value={inviteForm.default_permissions}
              onChange={(permissions) => setInviteForm((current) => ({ ...current, default_permissions: permissions }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Terms version">
              <input
                value={inviteForm.terms_version}
                onChange={(event) => setInviteForm((current) => ({ ...current, terms_version: event.target.value }))}
                className={inputClass}
              />
            </Field>
            <Field label="Maximum uses" helper="0 means unlimited">
              <input
                type="number"
                min="0"
                value={inviteForm.max_uses}
                onChange={(event) => setInviteForm((current) => ({ ...current, max_uses: Number(event.target.value || 0) }))}
                className={inputClass}
              />
            </Field>
            <Field label="Expires at">
              <input
                type="datetime-local"
                value={inviteForm.expires_at ? String(inviteForm.expires_at).slice(0, 16) : ""}
                onChange={(event) => setInviteForm((current) => ({ ...current, expires_at: event.target.value || null }))}
                className={inputClass}
              />
            </Field>
            <div className="space-y-2 pt-7">
              {[
                ["Active", "is_active"],
                ["Require profile photo", "require_profile_photo"],
                ["Require identification", "require_identification"],
                ["Show commission offer", "show_commission_offer"],
              ].map(([label, field]) => (
                <label key={field} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={Boolean(inviteForm[field as keyof InviteFormState])}
                    onChange={(event) => setInviteForm((current) => ({ ...current, [field]: event.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-200 pt-5">
            <button type="button" onClick={() => setInviteModalOpen(false)} className="h-11 rounded-2xl border border-slate-200 px-5 text-sm font-black text-slate-700">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save signup link
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(selectedApplication)}
        onClose={() => setSelectedApplication(null)}
        title="Review seller application"
      >
        {selectedApplication && approvalForm ? (
          <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <SectionCard className="bg-slate-50 shadow-none">
                <div className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-[2rem] bg-white">
                  {selectedApplication.profile_photo_url ? (
                    <img src={selectedApplication.profile_photo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <UserRoundPlus className="h-10 w-10 text-slate-300" />
                  )}
                </div>
                <h3 className="mt-4 text-center text-xl font-black text-slate-950">
                  {selectedApplication.display_name || selectedApplication.legal_name}
                </h3>
                <div className="mt-3 text-center"><StatusBadge status={selectedApplication.status} /></div>
                <div className="mt-5 space-y-2 text-sm font-semibold text-slate-600">
                  <p>{selectedApplication.email}</p>
                  <p>{selectedApplication.phone}</p>
                  <p>{selectedApplication.whatsapp || "No WhatsApp"}</p>
                  <p>{[selectedApplication.city, selectedApplication.country].filter(Boolean).join(", ") || "Location not provided"}</p>
                </div>
              </SectionCard>

              <div className="space-y-4">
                <SectionCard>
                  <h3 className="text-sm font-black text-slate-900">Applicant details</h3>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div><p className="text-xs font-black uppercase text-slate-400">Legal name</p><p className="mt-1 font-bold text-slate-800">{selectedApplication.legal_name}</p></div>
                    <div><p className="text-xs font-black uppercase text-slate-400">Seller type</p><p className="mt-1 font-bold text-slate-800">{humanize(selectedApplication.seller_type)}</p></div>
                    <div><p className="text-xs font-black uppercase text-slate-400">Business</p><p className="mt-1 font-bold text-slate-800">{selectedApplication.business_name || "—"}</p></div>
                    <div><p className="text-xs font-black uppercase text-slate-400">Experience</p><p className="mt-1 font-bold text-slate-800">{selectedApplication.experience_years} years</p></div>
                  </div>
                  {selectedApplication.biography ? <p className="mt-4 text-sm font-semibold leading-6 text-slate-600">{selectedApplication.biography}</p> : null}
                </SectionCard>

                <SectionCard>
                  <h3 className="text-sm font-black text-slate-900">Identity documents</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {selectedApplication.identification_front_url ? <a href={selectedApplication.identification_front_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700"><FileText className="h-4 w-4" /> Front</a> : null}
                    {selectedApplication.identification_back_url ? <a href={selectedApplication.identification_back_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700"><FileText className="h-4 w-4" /> Back</a> : null}
                    {selectedApplication.verification_selfie_url ? <a href={selectedApplication.verification_selfie_url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-700"><FileText className="h-4 w-4" /> Selfie</a> : null}
                  </div>
                  <p className="mt-3 text-sm font-semibold text-slate-600">
                    {humanize(selectedApplication.identification_type)} · {selectedApplication.identification_number || "No number"}
                  </p>
                </SectionCard>
              </div>
            </div>

            <SectionCard className="bg-slate-50 shadow-none">
              <h3 className="text-base font-black text-slate-950">Approval configuration</h3>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <Field label="Role">
                  <select value={approvalForm.role} onChange={(event) => setApprovalForm((current) => current ? ({ ...current, role: event.target.value as SellerRole }) : current)} className={inputClass}>
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{humanize(role)}</option>)}
                  </select>
                </Field>
                <Field label="Commission type">
                  <select value={approvalForm.commission_type} onChange={(event) => setApprovalForm((current) => current ? ({ ...current, commission_type: event.target.value as SellerCommissionType }) : current)} className={inputClass}>
                    <option value="percentage">Percentage</option>
                    <option value="fixed_amount">Fixed amount</option>
                  </select>
                </Field>
                <Field label={approvalForm.commission_type === "percentage" ? "Commission %" : "Fixed amount"}>
                  <input type="number" min="0" step="0.01" value={approvalForm.commission_type === "percentage" ? approvalForm.commission_rate : approvalForm.fixed_commission_amount} onChange={(event) => setApprovalForm((current) => current ? ({ ...current, [current.commission_type === "percentage" ? "commission_rate" : "fixed_commission_amount"]: event.target.value }) : current)} className={inputClass} />
                </Field>
                <Field label="Margin %"><input type="number" min="0" max="100" step="0.01" value={approvalForm.default_margin_percent} onChange={(event) => setApprovalForm((current) => current ? ({ ...current, default_margin_percent: event.target.value }) : current)} className={inputClass} /></Field>
                <Field label="Max discount %"><input type="number" min="0" max="100" step="0.01" value={approvalForm.max_customer_discount_percent} onChange={(event) => setApprovalForm((current) => current ? ({ ...current, max_customer_discount_percent: event.target.value }) : current)} className={inputClass} /></Field>
              </div>
            </SectionCard>

            <Field label="Assigned products" helper="No selection means all products permitted by seller permissions.">
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-2xl border border-slate-200 p-3 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => {
                  const checked = approvalForm.product_ids.includes(product.id);
                  return (
                    <label key={product.id} className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                      <input type="checkbox" checked={checked} onChange={() => setApprovalForm((current) => current ? ({ ...current, product_ids: checked ? current.product_ids.filter((id) => id !== product.id) : [...current.product_ids, product.id] }) : current)} className="h-4 w-4 rounded" />
                      <span className="truncate text-sm font-bold text-slate-700">{product.name}</span>
                    </label>
                  );
                })}
              </div>
            </Field>

            <SellerPermissionGrid value={approvalForm.permissions} onChange={(permissions) => setApprovalForm((current) => current ? ({ ...current, permissions }) : current)} disabled={selectedApplication.status === "approved"} />

            <Field label="Review notes / reason">
              <textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className={textareaClass} placeholder="Notes visible in the application record" />
            </Field>

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
              {selectedApplication.status !== "approved" ? (
                <>
                  <button type="button" onClick={() => void rejectApplication()} disabled={saving} className="h-11 rounded-2xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700">Reject</button>
                  <button type="button" onClick={() => void requestInformation()} disabled={saving} className="h-11 rounded-2xl border border-blue-200 bg-blue-50 px-5 text-sm font-black text-blue-700">Request information</button>
                  <button type="button" onClick={() => void approveApplication()} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />} Approve seller
                  </button>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm font-black text-emerald-700"><CheckCircle2 className="h-5 w-5" /> Seller approved</div>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal open={Boolean(selectedPayout)} onClose={() => setSelectedPayout(null)} title="Review payout request" width="max-w-3xl">
        {selectedPayout ? (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <SectionCard className="bg-slate-50 shadow-none"><p className="text-xs font-black uppercase text-slate-400">Seller</p><p className="mt-2 text-lg font-black text-slate-950">{selectedPayout.seller_name}</p><p className="mt-1 text-sm font-semibold text-slate-500">{selectedPayout.payout_destination}</p></SectionCard>
              <SectionCard className="bg-slate-50 shadow-none"><p className="text-xs font-black uppercase text-slate-400">Amount requested</p><p className="mt-2 text-2xl font-black text-slate-950">{formatMoney(selectedPayout.amount, selectedPayout.currency, lang)}</p><div className="mt-2"><StatusBadge status={selectedPayout.status} /></div></SectionCard>
            </div>

            <Field label="Owner note"><textarea value={payoutNote} onChange={(event) => setPayoutNote(event.target.value)} className={textareaClass} /></Field>

            {selectedPayout.status === "requested" || selectedPayout.status === "under_review" ? (
              <Field label="Rejection reason"><textarea value={payoutReason} onChange={(event) => setPayoutReason(event.target.value)} className={textareaClass} /></Field>
            ) : null}

            {selectedPayout.status === "approved" || selectedPayout.status === "processing" ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Payment reference"><input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} className={inputClass} /></Field>
                <Field label="Payment receipt"><input type="file" accept="image/*,.pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} className={`${inputClass} py-2`} /></Field>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 pt-5">
              {selectedPayout.status === "requested" || selectedPayout.status === "under_review" ? (
                <>
                  <button type="button" onClick={() => void runPayoutAction("reject")} disabled={saving} className="h-11 rounded-2xl border border-red-200 bg-red-50 px-5 text-sm font-black text-red-700">Reject</button>
                  <button type="button" onClick={() => void runPayoutAction("approve")} disabled={saving} className="h-11 rounded-2xl bg-emerald-600 px-5 text-sm font-black text-white">Approve</button>
                </>
              ) : null}
              {selectedPayout.status === "approved" ? <button type="button" onClick={() => void runPayoutAction("processing")} disabled={saving} className="h-11 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white">Mark processing</button> : null}
              {selectedPayout.status === "approved" || selectedPayout.status === "processing" ? <button type="button" onClick={() => void runPayoutAction("paid")} disabled={saving} className="inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeDollarSign className="h-4 w-4" />} Mark paid</button> : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </TicketingPageShell>
  );
}
