import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";
import {
  formatDateTime,
  getApiError,
  humanize,
  statusClasses,
} from "../seller-onboarding/sellerOnboardingUi";
import type {
  PublicSellerApplicationPayload,
  SellerApplication,
  SellerIdentificationType,
  SellerType,
} from "../types/ticketingTypes";

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:bg-slate-100";
const textareaClass =
  "min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10 disabled:bg-slate-100";

const SELLER_TYPES: SellerType[] = [
  "independent",
  "hotel_representative",
  "travel_agency",
  "tour_operator",
  "concierge",
  "taxi_transport",
  "influencer",
  "external_vendor",
  "other",
];

const IDENTIFICATION_TYPES: SellerIdentificationType[] = [
  "national_id",
  "passport",
  "driver_license",
  "other",
];

function Field({ label, children, helper }: { label: string; children: ReactNode; helper?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <div className="mt-2">{children}</div>
      {helper ? <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span> : null}
    </label>
  );
}

function statusIcon(status: SellerApplication["status"]) {
  if (status === "approved") return CheckCircle2;
  if (status === "needs_information") return AlertCircle;
  if (status === "rejected") return AlertCircle;
  return Clock3;
}

export default function SellerApplicationStatusPage() {
  const { organisationSlug = "" } = useParams<{ organisationSlug: string }>();
  const { language } = useTicketingAdminTranslation();
  const lang = language === "es" ? "es" : "en";

  const [application, setApplication] = useState<SellerApplication | null>(null);
  const [form, setForm] = useState<Partial<PublicSellerApplicationPayload>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function hydrateForm(value: SellerApplication) {
    setForm({
      display_name: value.display_name,
      phone: value.phone,
      whatsapp: value.whatsapp,
      country: value.country,
      city: value.city,
      address: value.address,
      preferred_language: value.preferred_language,
      seller_type: value.seller_type,
      business_name: value.business_name,
      experience_years: value.experience_years,
      biography: value.biography,
      languages: value.languages,
      product_interests: value.product_interests,
      website_url: value.website_url,
      instagram_url: value.instagram_url,
      facebook_url: value.facebook_url,
      identification_type: value.identification_type,
      identification_number: value.identification_number,
      applicant_message: value.applicant_message,
    });
  }

  async function loadApplication() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");
      const data = await ticketingApi.getMySellerApplication(organisationSlug);
      setApplication(data);
      hydrateForm(data);
    } catch (loadError) {
      setError(getApiError(loadError, "Could not load your seller application."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadApplication();
  }, [organisationSlug]);

  async function saveChanges(event: FormEvent) {
    event.preventDefault();

    try {
      setSaving(true);
      setError("");
      setMessage("");
      const updated = await ticketingApi.updateMySellerApplication(organisationSlug, form);
      setApplication(updated);
      hydrateForm(updated);
      setMessage("Your application information was updated.");
    } catch (saveError) {
      setError(getApiError(saveError, "Could not update your application."));
    } finally {
      setSaving(false);
    }
  }

  async function resubmit() {
    try {
      setResubmitting(true);
      setError("");
      const updated = await ticketingApi.resubmitMySellerApplication(organisationSlug);
      setApplication(updated);
      hydrateForm(updated);
      setMessage("Your application was resubmitted for review.");
    } catch (resubmitError) {
      setError(getApiError(resubmitError, "Could not resubmit your application."));
    } finally {
      setResubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
          <p className="mt-4 text-sm font-black text-slate-600">Loading application status…</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-7 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Application not found</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{error}</p>
        </section>
      </div>
    );
  }

  const editable = application.is_editable_by_applicant;
  const StatusIcon = statusIcon(application.status);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Seller application</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">{application.organisation_name}</h1>
          </div>
          <ShieldCheck className="h-7 w-7 text-slate-950" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className={`rounded-[2rem] border p-6 shadow-sm ${statusClasses(application.status)}`}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/70">
                <StatusIcon className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em]">Current status</p>
                <h2 className="mt-1 text-2xl font-black">{humanize(application.status)}</h2>
                <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
                  Submitted {formatDateTime(application.submitted_at, lang)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadApplication()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-current/20 bg-white/60 px-4 text-sm font-black"
            >
              <RefreshCw className="h-4 w-4" /> Refresh status
            </button>
          </div>
        </section>

        {application.status === "approved" ? (
          <section className="mt-5 rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-emerald-600" />
              <div>
                <h2 className="text-xl font-black text-slate-950">Your seller account is approved</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  You can now enter the seller portal, view assigned products, create bookings and request payouts according to your permissions.
                </p>
                <Link
                  to={`/ticketing/${organisationSlug}/seller/dashboard`}
                  className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
                >
                  Open seller portal <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </section>
        ) : null}

        {application.status === "needs_information" ? (
          <section className="mt-5 rounded-[2rem] border border-blue-200 bg-blue-50 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-1 h-6 w-6 shrink-0 text-blue-600" />
              <div>
                <h2 className="text-lg font-black text-blue-950">More information is required</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-blue-800">
                  {application.review_notes || "Review the fields below, add the missing information and resubmit your application."}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {application.status === "rejected" ? (
          <section className="mt-5 rounded-[2rem] border border-red-200 bg-red-50 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-1 h-6 w-6 shrink-0 text-red-600" />
              <div>
                <h2 className="text-lg font-black text-red-950">Application not approved</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-red-800">
                  {application.rejection_reason || application.review_notes || "Contact the organisation for more information."}
                </p>
              </div>
            </div>
          </section>
        ) : null}

        {error ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {message ? (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{message}</span>
          </div>
        ) : null}

        <form onSubmit={saveChanges} className="mt-5 space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <UserRound className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Profile information</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {editable ? "You can update this information while your application is pending." : "This application can no longer be edited."}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Display name"><input disabled={!editable} value={form.display_name || ""} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className={inputClass} /></Field>
              <Field label="Phone"><input disabled={!editable} value={form.phone || ""} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} /></Field>
              <Field label="WhatsApp"><input disabled={!editable} value={form.whatsapp || ""} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} className={inputClass} /></Field>
              <Field label="Preferred language">
                <select disabled={!editable} value={form.preferred_language || "en"} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} className={inputClass}>
                  <option value="en">English</option><option value="es">Spanish</option><option value="fr">French</option><option value="pt">Portuguese</option><option value="de">German</option>
                </select>
              </Field>
              <Field label="Country"><input disabled={!editable} value={form.country || ""} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className={inputClass} /></Field>
              <Field label="City"><input disabled={!editable} value={form.city || ""} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className={inputClass} /></Field>
            </div>

            <div className="mt-4"><Field label="Address"><input disabled={!editable} value={form.address || ""} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className={inputClass} /></Field></div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Seller and business information</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Seller type">
                <select disabled={!editable} value={form.seller_type || "independent"} onChange={(event) => setForm((current) => ({ ...current, seller_type: event.target.value as SellerType }))} className={inputClass}>
                  {SELLER_TYPES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                </select>
              </Field>
              <Field label="Business name"><input disabled={!editable} value={form.business_name || ""} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} className={inputClass} /></Field>
              <Field label="Years of experience"><input disabled={!editable} type="number" min="0" value={form.experience_years || 0} onChange={(event) => setForm((current) => ({ ...current, experience_years: Number(event.target.value || 0) }))} className={inputClass} /></Field>
              <Field label="Website"><input disabled={!editable} type="url" value={form.website_url || ""} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} className={inputClass} /></Field>
              <Field label="Instagram"><input disabled={!editable} type="url" value={form.instagram_url || ""} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} className={inputClass} /></Field>
              <Field label="Facebook"><input disabled={!editable} type="url" value={form.facebook_url || ""} onChange={(event) => setForm((current) => ({ ...current, facebook_url: event.target.value }))} className={inputClass} /></Field>
            </div>
            <div className="mt-4"><Field label="Biography"><textarea disabled={!editable} value={form.biography || ""} onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))} className={textareaClass} /></Field></div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-black text-slate-950">Identification</h2></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Identification type">
                <select disabled={!editable} value={form.identification_type || ""} onChange={(event) => setForm((current) => ({ ...current, identification_type: event.target.value as SellerIdentificationType | "" }))} className={inputClass}>
                  <option value="">Select identification</option>
                  {IDENTIFICATION_TYPES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
                </select>
              </Field>
              <Field label="Identification number"><input disabled={!editable} value={form.identification_number || ""} onChange={(event) => setForm((current) => ({ ...current, identification_number: event.target.value }))} className={inputClass} /></Field>
              <Field label="Replace profile photo"><input disabled={!editable} type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, profile_photo: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Replace ID front"><input disabled={!editable} type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_front: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Replace ID back"><input disabled={!editable} type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_back: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Verification selfie"><input disabled={!editable} type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, verification_selfie: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {application.identification_front_url ? <a href={application.identification_front_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Current ID front</a> : null}
              {application.identification_back_url ? <a href={application.identification_back_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Current ID back</a> : null}
              {application.verification_selfie_url ? <a href={application.verification_selfie_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Current selfie</a> : null}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <Field label="Message to reviewer"><textarea disabled={!editable} value={form.applicant_message || ""} onChange={(event) => setForm((current) => ({ ...current, applicant_message: event.target.value }))} className={textareaClass} /></Field>
          </section>

          {editable ? (
            <div className="flex flex-wrap justify-end gap-3">
              <button type="submit" disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save changes
              </button>
              {application.status === "needs_information" ? (
                <button type="button" onClick={() => void resubmit()} disabled={resubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-60">
                  {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Resubmit application
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
