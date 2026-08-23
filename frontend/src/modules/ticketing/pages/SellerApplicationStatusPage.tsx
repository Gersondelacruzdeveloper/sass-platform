import { useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  const navigate = useNavigate();
  const lang = "es";

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
      setApplication(null);
      setError(getApiError(loadError, "No se pudo cargar tu solicitud de vendedor."));
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
      setMessage("La información de tu solicitud fue actualizada.");
    } catch (saveError) {
      setError(getApiError(saveError, "No se pudo actualizar tu solicitud."));
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
      setMessage("Tu solicitud fue reenviada para revisión.");
    } catch (resubmitError) {
      setError(getApiError(resubmitError, "No se pudo reenviar tu solicitud."));
    } finally {
      setResubmitting(false);
    }
  }

  const canAccessSellerDashboard =
    application?.status === "approved" &&
    Boolean(application.permissions?.can_access_dashboard);

  useEffect(() => {
    if (!canAccessSellerDashboard || !organisationSlug) return;

    const timer = window.setTimeout(() => {
      navigate(`/ticketing/${organisationSlug}/seller/dashboard`, {
        replace: true,
      });
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [canAccessSellerDashboard, navigate, organisationSlug]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-500" />
          <p className="mt-4 text-sm font-black text-slate-600">Cargando estado de la solicitud…</p>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-7 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Solicitud no encontrada</h1>
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
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Solicitud de vendedor</p>
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
                <p className="text-xs font-black uppercase tracking-[0.18em]">Estado actual</p>
                <h2 className="mt-1 text-2xl font-black">
                  {{
                    pending: "Pendiente",
                    needs_information: "Se necesita información",
                    approved: "Aprobada",
                    rejected: "Rechazada",
                    withdrawn: "Retirada",
                  }[application.status] || humanize(application.status)}
                </h2>
                <p className="mt-2 text-sm font-semibold leading-6 opacity-80">
                  Enviada {formatDateTime(application.submitted_at, lang)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void loadApplication()}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-current/20 bg-white/60 px-4 text-sm font-black"
            >
              <RefreshCw className="h-4 w-4" /> Actualizar estado
            </button>
          </div>
        </section>

        {application.status === "approved" ? (
          <section className="mt-5 rounded-[2rem] border border-emerald-200 bg-white p-6 shadow-sm">
            <div className="flex items-start gap-4">
              <CheckCircle2 className="mt-1 h-7 w-7 shrink-0 text-emerald-600" />
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-black text-slate-950">
                  Tu cuenta de vendedor fue aprobada
                </h2>

                {canAccessSellerDashboard ? (
                  <>
                    <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                      Tu acceso al portal de vendedores está listo. Serás redirigido automáticamente en unos segundos.
                    </p>
                    <Link
                      to={`/ticketing/${organisationSlug}/seller/dashboard`}
                      className="mt-5 inline-flex h-11 items-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white"
                    >
                      Abrir portal de vendedores <ArrowRight className="h-4 w-4" />
                    </Link>
                  </>
                ) : (
                  <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                    Tu solicitud fue aprobada, pero el acceso al portal de vendedores todavía no está habilitado. Comunícate con el administrador si entiendes que ya deberías tener acceso.
                  </p>
                )}
              </div>
            </div>
          </section>
        ) : null}

        {application.status === "needs_information" ? (
          <section className="mt-5 rounded-[2rem] border border-blue-200 bg-blue-50 p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="mt-1 h-6 w-6 shrink-0 text-blue-600" />
              <div>
                <h2 className="text-lg font-black text-blue-950">Se necesita más información</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-blue-800">
                  {application.review_notes || "Revisa los campos de abajo, agrega la información que falta y vuelve a enviar tu solicitud."}
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
                <h2 className="text-lg font-black text-red-950">Solicitud no aprobada</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm font-semibold leading-6 text-red-800">
                  {application.rejection_reason || application.review_notes || "Comunícate con la empresa para obtener más información."}
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
                <h2 className="text-lg font-black text-slate-950">Información del perfil</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {editable ? "Puedes actualizar esta información mientras tu solicitud esté pendiente." : "Esta solicitud ya no se puede editar."}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Nombre para mostrar"><input disabled={!editable} value={form.display_name || ""} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className={inputClass} /></Field>
              <Field label="Teléfono"><input disabled={!editable} value={form.phone || ""} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} /></Field>
              <Field label="WhatsApp"><input disabled={!editable} value={form.whatsapp || ""} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} className={inputClass} /></Field>
              <Field label="Idioma preferido">
                <select disabled={!editable} value={form.preferred_language || "es"} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} className={inputClass}>
                  <option value="en">Inglés</option><option value="es">Español</option><option value="fr">Francés</option><option value="pt">Portugués</option><option value="de">Alemán</option>
                </select>
              </Field>
              <Field label="País"><input disabled={!editable} value={form.country || ""} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className={inputClass} /></Field>
              <Field label="Ciudad"><input disabled={!editable} value={form.city || ""} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className={inputClass} /></Field>
            </div>

            <div className="mt-4"><Field label="Dirección"><input disabled={!editable} value={form.address || ""} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className={inputClass} /></Field></div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-950">Información del vendedor y del negocio</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Tipo de vendedor">
                <select disabled={!editable} value={form.seller_type || "independent"} onChange={(event) => setForm((current) => ({ ...current, seller_type: event.target.value as SellerType }))} className={inputClass}>
                  {SELLER_TYPES.map((value) => {
                    const labels: Record<SellerType, string> = {
                      independent: "Vendedor independiente",
                      hotel_representative: "Representante de hotel",
                      travel_agency: "Agencia de viajes",
                      tour_operator: "Turoperador",
                      concierge: "Concierge",
                      taxi_transport: "Taxi o transporte",
                      influencer: "Influencer o creador de contenido",
                      external_vendor: "Vendedor externo",
                      other: "Otro",
                    };
                    return <option key={value} value={value}>{labels[value]}</option>;
                  })}
                </select>
              </Field>
              <Field label="Nombre del negocio"><input disabled={!editable} value={form.business_name || ""} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} className={inputClass} /></Field>
              <Field label="Años de experiencia"><input disabled={!editable} type="number" min="0" value={form.experience_years || 0} onChange={(event) => setForm((current) => ({ ...current, experience_years: Number(event.target.value || 0) }))} className={inputClass} /></Field>
              <Field label="Website"><input disabled={!editable} type="url" value={form.website_url || ""} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} className={inputClass} /></Field>
              <Field label="Instagram"><input disabled={!editable} type="url" value={form.instagram_url || ""} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} className={inputClass} /></Field>
              <Field label="Facebook"><input disabled={!editable} type="url" value={form.facebook_url || ""} onChange={(event) => setForm((current) => ({ ...current, facebook_url: event.target.value }))} className={inputClass} /></Field>
            </div>
            <div className="mt-4"><Field label="Biografía"><textarea disabled={!editable} value={form.biography || ""} onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))} className={textareaClass} /></Field></div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3"><FileText className="h-5 w-5 text-slate-500" /><h2 className="text-lg font-black text-slate-950">Identificación</h2></div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Tipo de identificación">
                <select disabled={!editable} value={form.identification_type || ""} onChange={(event) => setForm((current) => ({ ...current, identification_type: event.target.value as SellerIdentificationType | "" }))} className={inputClass}>
                  <option value="">Selecciona una identificación</option>
                  {IDENTIFICATION_TYPES.map((value) => {
                    const labels: Record<SellerIdentificationType, string> = {
                      national_id: "Cédula de identidad",
                      passport: "Pasaporte",
                      driver_license: "Licencia de conducir",
                      other: "Otro",
                    };
                    return <option key={value} value={value}>{labels[value]}</option>;
                  })}
                </select>
              </Field>
              <Field label="Número de identificación"><input disabled={!editable} value={form.identification_number || ""} onChange={(event) => setForm((current) => ({ ...current, identification_number: event.target.value }))} className={inputClass} /></Field>
              <Field label="Reemplazar foto de perfil"><input disabled={!editable} type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, profile_photo: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Reemplazar frente de la identificación"><input disabled={!editable} type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_front: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Reemplazar reverso de la identificación"><input disabled={!editable} type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_back: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
              <Field label="Selfie de verificación"><input disabled={!editable} type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, verification_selfie: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} /></Field>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {application.identification_front_url ? <a href={application.identification_front_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Ver frente actual</a> : null}
              {application.identification_back_url ? <a href={application.identification_back_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Ver reverso actual</a> : null}
              {application.verification_selfie_url ? <a href={application.verification_selfie_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-700">Ver selfie actual</a> : null}
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
            <Field label="Mensaje para el revisor"><textarea disabled={!editable} value={form.applicant_message || ""} onChange={(event) => setForm((current) => ({ ...current, applicant_message: event.target.value }))} className={textareaClass} /></Field>
          </section>

          {editable ? (
            <div className="flex flex-wrap justify-end gap-3">
              <button type="submit" disabled={saving} className="inline-flex h-12 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 text-sm font-black text-slate-700 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar cambios
              </button>
              {application.status === "needs_information" ? (
                <button type="button" onClick={() => void resubmit()} disabled={resubmitting} className="inline-flex h-12 items-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white disabled:opacity-60">
                  {resubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Reenviar solicitud
                </button>
              ) : null}
            </div>
          ) : null}
        </form>
      </main>
    </div>
  );
}
