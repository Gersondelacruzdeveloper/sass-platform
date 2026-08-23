import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BadgeDollarSign,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  ImagePlus,
  Loader2,
  MapPin,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import { formatMoney, getApiError, humanize } from "../seller-onboarding/sellerOnboardingUi";
import type {
  PublicSellerApplicationPayload,
  PublicSellerSignupInvite,
  SellerIdentificationType,
  SellerType,
} from "../types/ticketingTypes";

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

const LANGUAGE_OPTIONS = ["Inglés", "Español", "Francés", "Portugués", "Alemán"];

const initialForm: PublicSellerApplicationPayload = {
  legal_name: "",
  display_name: "",
  email: "",
  phone: "",
  whatsapp: "",
  profile_photo: null,
  country: "Dominican Republic",
  city: "",
  address: "",
  preferred_language: "es",
  seller_type: "independent",
  business_name: "",
  experience_years: 0,
  biography: "",
  languages: [],
  product_interests: [],
  website_url: "",
  instagram_url: "",
  facebook_url: "",
  identification_type: "",
  identification_number: "",
  identification_front: null,
  identification_back: null,
  verification_selfie: null,
  applicant_message: "",
  terms_accepted: false,
  password: "",
  password_confirm: "",
};

const inputClass =
  "h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";
const textareaClass =
  "min-h-32 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none transition focus:border-slate-950 focus:ring-2 focus:ring-slate-950/10";

function Field({
  label,
  children,
  required,
  helper,
}: {
  label: string;
  children: ReactNode;
  required?: boolean;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">
        {label} {required ? <span className="text-red-500">*</span> : null}
      </span>
      <div className="mt-2">{children}</div>
      {helper ? <span className="mt-1 block text-xs font-semibold text-slate-500">{helper}</span> : null}
    </label>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="mt-6">{children}</div>
    </section>
  );
}

export default function PublicSellerApplicationPage() {
  const { token = "" } = useParams<{ token: string }>();
  const lang = "es";

  const [invite, setInvite] = useState<PublicSellerSignupInvite | null>(null);
  const [form, setForm] = useState<PublicSellerApplicationPayload>(initialForm);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{
    id: number;
    status: string;
    organisation: string;
    organisation_slug?: string;
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      try {
        setLoading(true);
        setError("");
        const data = await ticketingApi.getPublicSellerSignupInvite(token);
        if (active) setInvite(data);
      } catch (loadError) {
        if (active) {
          setError(getApiError(loadError, "Este enlace para solicitar acceso como vendedor no está disponible."));
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    if (token) void loadInvite();

    return () => {
      active = false;
    };
  }, [token]);

  const commissionText = useMemo(() => {
    if (!invite || !invite.show_commission_offer) return "";

    return invite.default_commission_type === "percentage"
      ? `${Number(invite.default_commission_rate || 0).toFixed(2)}% de comisión`
      : `${formatMoney(invite.default_fixed_commission_amount, "USD", lang)} de comisión fija`;
  }, [invite, lang]);

  function toggleLanguage(value: string) {
    setForm((current) => {
      const languages = current.languages || [];
      return {
        ...current,
        languages: languages.includes(value)
          ? languages.filter((item) => item !== value)
          : [...languages, value],
      };
    });
  }

  function toggleProductInterest(value: string) {
    setForm((current) => {
      const interests = current.product_interests || [];
      return {
        ...current,
        product_interests: interests.includes(value)
          ? interests.filter((item) => item !== value)
          : [...interests, value],
      };
    });
  }

  async function submitApplication(event: FormEvent) {
    event.preventDefault();

    if (form.password !== form.password_confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setSubmitting(true);
      setError("");
      const response = await ticketingApi.submitPublicSellerApplication(token, form);
      setSubmitted(response);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (submitError) {
      setError(getApiError(submitError, "No se pudo enviar tu solicitud de vendedor."));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-slate-500" />
          <p className="mt-4 text-sm font-black text-slate-600">Cargando solicitud de vendedor…</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const loginPath = submitted.organisation_slug
      ? `/ticketing/${submitted.organisation_slug}/login`
      : "/ticketing";

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
        <section className="w-full max-w-xl rounded-[2rem] border border-emerald-200 bg-white p-7 text-center shadow-xl">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Solicitud enviada</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Gracias por solicitar ser vendedor</h1>
          <p className="mx-auto mt-4 max-w-md text-sm font-semibold leading-7 text-slate-600">
            Tu solicitud para {submitted.organisation} está pendiente de revisión. Tu cuenta fue creada con el correo electrónico y la contraseña que ingresaste.
          </p>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-left">
            <p className="text-xs font-black uppercase tracking-wide text-slate-400">Número de solicitud</p>
            <p className="mt-1 text-lg font-black text-slate-900">#{submitted.id}</p>
          </div>
          <Link
            to={loginPath}
            className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white"
          >
            Iniciar sesión para ver el estado <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </div>
    );
  }

  if (!invite || !invite.is_available) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <section className="w-full max-w-lg rounded-[2rem] border border-red-200 bg-white p-7 text-center shadow-sm">
          <AlertCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-2xl font-black text-slate-950">Enlace de solicitud no disponible</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-500">
            {error || "Este enlace para solicitar ser vendedor ha vencido o alcanzó el número máximo de usos."}
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-600">Oportunidad para vendedores</p>
            <h1 className="mt-1 text-xl font-black text-slate-950">{invite.organisation_name}</h1>
          </div>
          <ShieldCheck className="h-7 w-7 text-slate-950" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl sm:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-amber-300">{invite.name}</p>
            <h2 className="mt-3 text-3xl font-black sm:text-5xl">Solicita ser vendedor autorizado</h2>
            <p className="mt-5 max-w-2xl text-sm font-semibold leading-7 text-white/70 sm:text-base">
              {invite.description || "Crea tu cuenta de vendedor y envía tus datos para que sean revisados y aprobados."}
            </p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {commissionText ? (
              <div className="rounded-3xl bg-white/10 p-4">
                <BadgeDollarSign className="h-5 w-5 text-amber-300" />
                <p className="mt-3 text-sm font-black">{commissionText}</p>
              </div>
            ) : null}
            <div className="rounded-3xl bg-white/10 p-4">
              <ShieldCheck className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-black">Requiere aprobación</p>
            </div>
            <div className="rounded-3xl bg-white/10 p-4">
              <BriefcaseBusiness className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-black">Acceso al portal de vendedores después de ser aprobado</p>
            </div>
          </div>
        </section>

        {error ? (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <form onSubmit={submitApplication} className="mt-6 space-y-5">
          <Section
            icon={UserRoundPlus}
            title="Cuenta e información personal"
            description="Usa tus datos reales para que la empresa pueda verificar tu solicitud."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Nombre completo" required>
                <input value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} className={inputClass} required />
              </Field>
              <Field label="Nombre para mostrar">
                <input value={form.display_name || ""} onChange={(event) => setForm((current) => ({ ...current, display_name: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Email" required>
                <input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className={inputClass} required />
              </Field>
              <Field label="Número de teléfono" required>
                <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className={inputClass} required />
              </Field>
              <Field label="Número de WhatsApp">
                <input value={form.whatsapp || ""} onChange={(event) => setForm((current) => ({ ...current, whatsapp: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Idioma preferido">
                <select value={form.preferred_language || "en"} onChange={(event) => setForm((current) => ({ ...current, preferred_language: event.target.value }))} className={inputClass}>
                  <option value="en">Inglés</option>
                  <option value="es">Español</option>
                  <option value="fr">Francés</option>
                  <option value="pt">Portugués</option>
                  <option value="de">Alemán</option>
                </select>
              </Field>
              <Field label="Crear contraseña" required>
                <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} className={inputClass} required minLength={8} />
              </Field>
              <Field label="Confirmar contraseña" required>
                <input type="password" value={form.password_confirm} onChange={(event) => setForm((current) => ({ ...current, password_confirm: event.target.value }))} className={inputClass} required minLength={8} />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <Field label="País"><input value={form.country || ""} onChange={(event) => setForm((current) => ({ ...current, country: event.target.value }))} className={inputClass} /></Field>
              <Field label="Ciudad"><input value={form.city || ""} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className={inputClass} /></Field>
              <Field label="Dirección"><input value={form.address || ""} onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))} className={inputClass} /></Field>
            </div>

            <div className="mt-4">
              <Field label="Foto de perfil" required={invite.require_profile_photo} helper="Sube una foto clara para que la empresa pueda identificar tu perfil de vendedor.">
                <input type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, profile_photo: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} required={invite.require_profile_photo} />
              </Field>
            </div>
          </Section>

          <Section
            icon={BriefcaseBusiness}
            title="Experiencia como vendedor"
            description="Cuéntanos cómo y dónde piensas vender los productos de la empresa."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tipo de vendedor" required>
                <select value={form.seller_type} onChange={(event) => setForm((current) => ({ ...current, seller_type: event.target.value as SellerType }))} className={inputClass}>
                  {SELLER_TYPES.map((sellerType) => {
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
                    return <option key={sellerType} value={sellerType}>{labels[sellerType]}</option>;
                  })}
                </select>
              </Field>
              <Field label="Nombre del negocio o agencia">
                <input value={form.business_name || ""} onChange={(event) => setForm((current) => ({ ...current, business_name: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Años de experiencia en ventas">
                <input type="number" min="0" max="80" value={form.experience_years || 0} onChange={(event) => setForm((current) => ({ ...current, experience_years: Number(event.target.value || 0) }))} className={inputClass} />
              </Field>
              <Field label="Website">
                <input type="url" value={form.website_url || ""} onChange={(event) => setForm((current) => ({ ...current, website_url: event.target.value }))} className={inputClass} />
              </Field>
              <Field label="Instagram URL"><input type="url" value={form.instagram_url || ""} onChange={(event) => setForm((current) => ({ ...current, instagram_url: event.target.value }))} className={inputClass} /></Field>
              <Field label="Facebook URL"><input type="url" value={form.facebook_url || ""} onChange={(event) => setForm((current) => ({ ...current, facebook_url: event.target.value }))} className={inputClass} /></Field>
            </div>

            <div className="mt-4">
              <Field label="Sobre ti y tu experiencia en ventas">
                <textarea value={form.biography || ""} onChange={(event) => setForm((current) => ({ ...current, biography: event.target.value }))} className={textareaClass} />
              </Field>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <div>
                <p className="text-sm font-black text-slate-700">Idiomas que hablas</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((item) => {
                    const checked = (form.languages || []).includes(item);
                    return (
                      <button key={item} type="button" onClick={() => toggleLanguage(item)} className={`rounded-2xl border px-4 py-2 text-sm font-black ${checked ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-600"}`}>{item}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-sm font-black text-slate-700">Productos que te interesa vender</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(invite.allowed_products.length ? invite.allowed_products.map((item) => item.name) : invite.allowed_product_types.map(humanize)).map((item) => {
                    const checked = (form.product_interests || []).includes(item);
                    return (
                      <button key={item} type="button" onClick={() => toggleProductInterest(item)} className={`rounded-2xl border px-4 py-2 text-sm font-black ${checked ? "border-amber-500 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}>{item}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          <Section
            icon={FileText}
            title="Verificación de identidad"
            description="Los documentos de identidad se utilizan para verificar tu solicitud y se mantienen de forma privada en la plataforma."
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Tipo de identificación" required={invite.require_identification}>
                <select value={form.identification_type || ""} onChange={(event) => setForm((current) => ({ ...current, identification_type: event.target.value as SellerIdentificationType | "" }))} className={inputClass} required={invite.require_identification}>
                  <option value="">Selecciona una identificación</option>
                  {IDENTIFICATION_TYPES.map((item) => {
                    const labels: Record<SellerIdentificationType, string> = {
                      national_id: "Cédula de identidad",
                      passport: "Pasaporte",
                      driver_license: "Licencia de conducir",
                      other: "Otro",
                    };
                    return <option key={item} value={item}>{labels[item]}</option>;
                  })}
                </select>
              </Field>
              <Field label="Número de identificación" required={invite.require_identification}>
                <input value={form.identification_number || ""} onChange={(event) => setForm((current) => ({ ...current, identification_number: event.target.value }))} className={inputClass} required={invite.require_identification} />
              </Field>
              <Field label="Foto frontal de la identificación" required={invite.require_identification}>
                <input type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_front: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} required={invite.require_identification} />
              </Field>
              <Field label="Foto trasera de la identificación">
                <input type="file" accept="image/*,.pdf" onChange={(event) => setForm((current) => ({ ...current, identification_back: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} />
              </Field>
              <Field label="Selfie de verificación">
                <input type="file" accept="image/*" onChange={(event) => setForm((current) => ({ ...current, verification_selfie: event.target.files?.[0] || null }))} className={`${inputClass} py-2`} />
              </Field>
            </div>
          </Section>

          <Section
            icon={MapPin}
            title="Mensaje final y aceptación"
            description="Agrega cualquier información que consideres importante antes de enviar tu solicitud."
          >
            <Field label="Mensaje para la empresa">
              <textarea value={form.applicant_message || ""} onChange={(event) => setForm((current) => ({ ...current, applicant_message: event.target.value }))} className={textareaClass} />
            </Field>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input type="checkbox" checked={form.terms_accepted} onChange={(event) => setForm((current) => ({ ...current, terms_accepted: event.target.checked }))} className="mt-1 h-5 w-5 rounded border-slate-300" required />
              <span className="text-sm font-semibold leading-6 text-slate-600">
                Confirmo que la información proporcionada es correcta y acepto los términos para vendedores ({invite.terms_version}). Entiendo que debo ser aprobado antes de poder crear reservaciones o solicitar pagos.
              </span>
            </label>
          </Section>

          <div className="flex justify-end">
            <button type="submit" disabled={submitting} className="inline-flex h-14 items-center justify-center gap-3 rounded-2xl bg-slate-950 px-8 text-base font-black text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
              Enviar solicitud de vendedor
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
