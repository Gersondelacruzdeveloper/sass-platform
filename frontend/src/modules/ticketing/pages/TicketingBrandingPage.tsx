// src/modules/ticketing/pages/TicketingBrandingPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Globe2,
  Image as ImageIcon,
  Loader2,
  Mail,
  MessageCircle,
  Palette,
  Save,
  Upload,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type TicketingPublicSiteSettings = {
  id?: number;
  organisation?: number;
  organisation_name?: string;

  site_title: string;
  display_title?: string;
  public_description: string;
  public_email?: string | null;
  public_whatsapp?: string | null;
  subdomain?: string | null;
  custom_domain?: string | null;

  logo?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  favicon_url?: string | null;
  hero_image?: string | null;
  hero_image_url?: string | null;
  og_image?: string | null;
  og_image_url?: string | null;

  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  button_color: string;

  seo_title?: string;
  meta_description?: string;
  canonical_url?: string;
  og_title?: string;
  og_description?: string;

  robots_allow_indexing?: boolean;
  robots_allow_ai_crawlers?: boolean;
  allow_gptbot?: boolean;
  allow_oai_searchbot?: boolean;

  show_public_rankings?: boolean;
  show_seller_public_pages?: boolean;
  show_reviews?: boolean;
  is_published: boolean;

  created_at?: string;
  updated_at?: string;
};

const initialPublicSite: TicketingPublicSiteSettings = {
  site_title: "",
  public_description: "",
  public_email: "",
  public_whatsapp: "",
  subdomain: "",
  custom_domain: "",

  logo: null,
  logo_url: null,
  favicon: null,
  favicon_url: null,
  hero_image: null,
  hero_image_url: null,
  og_image: null,
  og_image_url: null,

  primary_color: "#111827",
  secondary_color: "#6B7280",
  accent_color: "#F59E0B",
  background_color: "#FFFFFF",
  button_color: "#111827",

  seo_title: "",
  meta_description: "",
  canonical_url: "",
  og_title: "",
  og_description: "",

  robots_allow_indexing: true,
  robots_allow_ai_crawlers: true,
  allow_gptbot: true,
  allow_oai_searchbot: true,

  show_public_rankings: true,
  show_seller_public_pages: true,
  show_reviews: true,
  is_published: false,
};

function getRequestParams(organisationSlug?: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function normalizeText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;

  return String(value);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;

  if (value === "true") return true;
  if (value === "false") return false;

  return fallback;
}

function getErrorMessage(err: any, fallback: string) {
  const data = err?.response?.data;

  if (!data) return fallback;
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return fallback;
}

function getApiOrigin() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl.replace(/\/api\/?$/, "");
}

function resolveAssetUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiOrigin = getApiOrigin();

  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function appendText(formData: FormData, key: string, value?: string | null) {
  formData.append(key, value || "");
}

function appendBoolean(formData: FormData, key: string, value?: boolean | null) {
  formData.append(key, value ? "true" : "false");
}

function appendFile(formData: FormData, key: string, file: File | null) {
  if (file) {
    formData.append(key, file);
  }
}

function filePreview(file: File | null, existingUrl?: string | null) {
  if (file) return URL.createObjectURL(file);

  return resolveAssetUrl(existingUrl);
}

export default function TicketingBrandingPage() {
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [publicSite, setPublicSite] =
    useState<TicketingPublicSiteSettings>(initialPublicSite);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [faviconFile, setFaviconFile] = useState<File | null>(null);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const publicUrl = useMemo(() => {
    if (!organisationSlug) return "#";

    return `/experiences/${organisationSlug}`;
  }, [organisationSlug]);

  const logoPreview = filePreview(logoFile, publicSite.logo_url || publicSite.logo);
//   const faviconPreview = filePreview(
//     faviconFile,
//     publicSite.favicon_url || publicSite.favicon
//   );
  const heroPreview = filePreview(
    heroImageFile,
    publicSite.hero_image_url || publicSite.hero_image
  );
//   const ogPreview = filePreview(ogImageFile, publicSite.og_image_url || publicSite.og_image);

  async function loadBranding() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const response = await api.get<TicketingPublicSiteSettings>(
        "/ticketing/public-site-settings/mine/",
        {
          params: requestParams,
        }
      );

      const data = response.data;

      setPublicSite({
        ...initialPublicSite,
        ...data,
        site_title: normalizeText(data.site_title),
        public_description: normalizeText(data.public_description),
        public_email: normalizeText(data.public_email),
        public_whatsapp: normalizeText(data.public_whatsapp),
        subdomain: normalizeText(data.subdomain),
        custom_domain: normalizeText(data.custom_domain),

        primary_color: normalizeText(
          data.primary_color,
          initialPublicSite.primary_color
        ),
        secondary_color: normalizeText(
          data.secondary_color,
          initialPublicSite.secondary_color
        ),
        accent_color: normalizeText(
          data.accent_color,
          initialPublicSite.accent_color
        ),
        background_color: normalizeText(
          data.background_color,
          initialPublicSite.background_color
        ),
        button_color: normalizeText(
          data.button_color,
          initialPublicSite.button_color
        ),

        seo_title: normalizeText(data.seo_title),
        meta_description: normalizeText(data.meta_description),
        canonical_url: normalizeText(data.canonical_url),
        og_title: normalizeText(data.og_title),
        og_description: normalizeText(data.og_description),

        robots_allow_indexing: normalizeBoolean(
          data.robots_allow_indexing,
          true
        ),
        robots_allow_ai_crawlers: normalizeBoolean(
          data.robots_allow_ai_crawlers,
          true
        ),
        allow_gptbot: normalizeBoolean(data.allow_gptbot, true),
        allow_oai_searchbot: normalizeBoolean(data.allow_oai_searchbot, true),

        show_public_rankings: normalizeBoolean(data.show_public_rankings, true),
        show_seller_public_pages: normalizeBoolean(
          data.show_seller_public_pages,
          true
        ),
        show_reviews: normalizeBoolean(data.show_reviews, true),
        is_published: normalizeBoolean(data.is_published, false),
      });
    } catch (err: any) {
      console.error("Could not load ticketing branding:", err);
      setError(getErrorMessage(err, "No se pudo cargar el branding público."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBranding();
  }, [organisationSlug]);

  function updateField<K extends keyof TicketingPublicSiteSettings>(
    field: K,
    value: TicketingPublicSiteSettings[K]
  ) {
    setPublicSite((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const formData = new FormData();

      appendText(formData, "site_title", publicSite.site_title);
      appendText(formData, "public_description", publicSite.public_description);
      appendText(formData, "public_email", publicSite.public_email);
      appendText(formData, "public_whatsapp", publicSite.public_whatsapp);
      appendText(formData, "subdomain", publicSite.subdomain);
      appendText(formData, "custom_domain", publicSite.custom_domain);

      appendText(formData, "primary_color", publicSite.primary_color);
      appendText(formData, "secondary_color", publicSite.secondary_color);
      appendText(formData, "accent_color", publicSite.accent_color);
      appendText(formData, "background_color", publicSite.background_color);
      appendText(formData, "button_color", publicSite.button_color);

      appendText(formData, "seo_title", publicSite.seo_title);
      appendText(formData, "meta_description", publicSite.meta_description);
      appendText(formData, "canonical_url", publicSite.canonical_url);
      appendText(formData, "og_title", publicSite.og_title);
      appendText(formData, "og_description", publicSite.og_description);

      appendBoolean(
        formData,
        "robots_allow_indexing",
        publicSite.robots_allow_indexing
      );
      appendBoolean(
        formData,
        "robots_allow_ai_crawlers",
        publicSite.robots_allow_ai_crawlers
      );
      appendBoolean(formData, "allow_gptbot", publicSite.allow_gptbot);
      appendBoolean(formData, "allow_oai_searchbot", publicSite.allow_oai_searchbot);

      appendBoolean(
        formData,
        "show_public_rankings",
        publicSite.show_public_rankings
      );
      appendBoolean(
        formData,
        "show_seller_public_pages",
        publicSite.show_seller_public_pages
      );
      appendBoolean(formData, "show_reviews", publicSite.show_reviews);
      appendBoolean(formData, "is_published", publicSite.is_published);

      appendFile(formData, "logo", logoFile);
      appendFile(formData, "favicon", faviconFile);
      appendFile(formData, "hero_image", heroImageFile);
      appendFile(formData, "og_image", ogImageFile);

      const response = await api.patch<TicketingPublicSiteSettings>(
        "/ticketing/public-site-settings/mine/",
        formData,
        {
          params: requestParams,
        }
      );

      setPublicSite((current) => ({
        ...current,
        ...response.data,
      }));

      setLogoFile(null);
      setFaviconFile(null);
      setHeroImageFile(null);
      setOgImageFile(null);

      setSavedMessage("Branding saved successfully.");
    } catch (err: any) {
      console.error("Could not save ticketing branding:", err);
      setError(getErrorMessage(err, "Could not save branding."));
    } finally {
      setSaving(false);
    }
  }

  async function copyPublicUrl() {
    const absoluteUrl = `${window.location.origin}${publicUrl}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setSavedMessage("Public URL copied.");
    } catch {
      setError("Could not copy public URL.");
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Branding"
        subtitle="Configure public website logo, colors, hero image and contact details."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading branding...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Branding"
      subtitle="Configure public website logo, colors, hero image and contact details."
    >
      <div className="space-y-5 pb-24">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-600">
                Public website branding
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                {publicSite.display_title || publicSite.site_title || "PCD Experiences"}
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                This controls the public marketplace website: logo, hero image,
                colors, contact details, social sharing image and published state.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                to={publicUrl}
                target="_blank"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                View site
              </Link>

              <button
                type="button"
                onClick={copyPublicUrl}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy URL
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save branding
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </div>
        )}

        {savedMessage && (
          <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            {savedMessage}
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <Panel
            title="Website identity"
            description="Name, description, email, WhatsApp and published status."
            icon={<Globe2 className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Website title"
                value={publicSite.site_title}
                onChange={(value) => updateField("site_title", value)}
                placeholder="PCD Experiences"
              />

              <Input
                label="WhatsApp"
                value={publicSite.public_whatsapp || ""}
                onChange={(value) => updateField("public_whatsapp", value)}
                placeholder="+1 809 000 0000"
                icon={<MessageCircle className="h-4 w-4" />}
              />

              <Input
                label="Public email"
                type="email"
                value={publicSite.public_email || ""}
                onChange={(value) => updateField("public_email", value)}
                placeholder="reservations@example.com"
                icon={<Mail className="h-4 w-4" />}
              />

              <Input
                label="Subdomain"
                value={publicSite.subdomain || ""}
                onChange={(value) => updateField("subdomain", value)}
                placeholder="experiences"
              />

              <Input
                label="Custom domain"
                value={publicSite.custom_domain || ""}
                onChange={(value) => updateField("custom_domain", value)}
                placeholder="experiences.example.com"
              />

              <Toggle
                label="Publish public site"
                checked={publicSite.is_published}
                onChange={(value) => updateField("is_published", value)}
              />
            </div>

            <Textarea
              label="Public description"
              value={publicSite.public_description}
              onChange={(value) => updateField("public_description", value)}
              placeholder="Book tours, tickets, transfers and experiences in Punta Cana."
            />
          </Panel>

          <Panel
            title="Preview"
            description="Quick preview of your public website colors and images."
            icon={<Eye className="h-5 w-5" />}
          >
            <div
              className="overflow-hidden rounded-3xl border"
              style={{
                backgroundColor: publicSite.background_color,
                borderColor: publicSite.primary_color,
              }}
            >
              <div
                className="relative h-48 bg-slate-200"
                style={{
                  backgroundColor: publicSite.secondary_color,
                }}
              >
                {heroPreview ? (
                  <img
                    src={heroPreview}
                    alt="Hero preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm font-black text-white/80">
                    Hero image preview
                  </div>
                )}

                <div className="absolute inset-0 bg-black/35" />

                <div className="absolute bottom-4 left-4 right-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/30 bg-white"
                    >
                      {logoPreview ? (
                        <img
                          src={logoPreview}
                          alt="Logo preview"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <TicketIcon />
                      )}
                    </div>

                    <div>
                      <p className="text-lg font-black text-white">
                        {publicSite.site_title || "PCD Experiences"}
                      </p>
                      <p className="text-xs font-bold text-white/80">
                        Tours, Tickets & Transfers
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-4 rounded-2xl px-4 py-2 text-sm font-black text-white"
                    style={{ backgroundColor: publicSite.button_color }}
                  >
                    Book now
                  </button>
                </div>
              </div>

              <div className="p-4">
                <p
                  className="text-sm font-bold leading-6"
                  style={{ color: publicSite.primary_color }}
                >
                  {publicSite.public_description ||
                    "Your public website description will appear here."}
                </p>

                <div className="mt-3 flex gap-2">
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black"
                    style={{
                      backgroundColor: publicSite.accent_color,
                      color: publicSite.primary_color,
                    }}
                  >
                    Featured
                  </span>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black text-white"
                    style={{ backgroundColor: publicSite.primary_color }}
                  >
                    Secure booking
                  </span>
                </div>
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="Images"
            description="Upload public logo, favicon, hero image and social sharing image."
            icon={<ImageIcon className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <FileInput
                label="Logo"
                helper="Used in the public header."
                file={logoFile}
                existingUrl={publicSite.logo_url || publicSite.logo}
                onChange={setLogoFile}
              />

              <FileInput
                label="Favicon"
                helper="Browser icon. SVG/PNG/ICO recommended."
                file={faviconFile}
                existingUrl={publicSite.favicon_url || publicSite.favicon}
                onChange={setFaviconFile}
              />

              <FileInput
                label="Hero image"
                helper="Main public website hero image."
                file={heroImageFile}
                existingUrl={publicSite.hero_image_url || publicSite.hero_image}
                onChange={setHeroImageFile}
                wide
              />

              <FileInput
                label="OG / social image"
                helper="Used when sharing on social media."
                file={ogImageFile}
                existingUrl={publicSite.og_image_url || publicSite.og_image}
                onChange={setOgImageFile}
                wide
              />
            </div>
          </Panel>

          <Panel
            title="Colors"
            description="Customize the public booking website visual style."
            icon={<Palette className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <ColorInput
                label="Primary color"
                value={publicSite.primary_color}
                onChange={(value) => updateField("primary_color", value)}
              />

              <ColorInput
                label="Secondary color"
                value={publicSite.secondary_color}
                onChange={(value) => updateField("secondary_color", value)}
              />

              <ColorInput
                label="Accent color"
                value={publicSite.accent_color}
                onChange={(value) => updateField("accent_color", value)}
              />

              <ColorInput
                label="Background color"
                value={publicSite.background_color}
                onChange={(value) => updateField("background_color", value)}
              />

              <ColorInput
                label="Button color"
                value={publicSite.button_color}
                onChange={(value) => updateField("button_color", value)}
              />
            </div>
          </Panel>
        </section>

        <Panel
          title="SEO & sharing"
          description="Basic SEO and social preview settings for the public website."
          icon={<Globe2 className="h-5 w-5" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="SEO title"
              value={publicSite.seo_title || ""}
              onChange={(value) => updateField("seo_title", value)}
              placeholder="Book Punta Cana tours and transfers"
            />

            <Input
              label="Canonical URL"
              value={publicSite.canonical_url || ""}
              onChange={(value) => updateField("canonical_url", value)}
              placeholder="https://example.com"
            />

            <Input
              label="OG title"
              value={publicSite.og_title || ""}
              onChange={(value) => updateField("og_title", value)}
              placeholder="PCD Experiences"
            />

            <Textarea
              label="Meta description"
              value={publicSite.meta_description || ""}
              onChange={(value) => updateField("meta_description", value)}
              placeholder="Short search description..."
            />

            <Textarea
              label="OG description"
              value={publicSite.og_description || ""}
              onChange={(value) => updateField("og_description", value)}
              placeholder="Short social sharing description..."
            />
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Toggle
              label="Allow indexing"
              checked={Boolean(publicSite.robots_allow_indexing)}
              onChange={(value) => updateField("robots_allow_indexing", value)}
            />
            <Toggle
              label="Allow AI crawlers"
              checked={Boolean(publicSite.robots_allow_ai_crawlers)}
              onChange={(value) => updateField("robots_allow_ai_crawlers", value)}
            />
            <Toggle
              label="Allow GPTBot"
              checked={Boolean(publicSite.allow_gptbot)}
              onChange={(value) => updateField("allow_gptbot", value)}
            />
            <Toggle
              label="Allow OAI SearchBot"
              checked={Boolean(publicSite.allow_oai_searchbot)}
              onChange={(value) => updateField("allow_oai_searchbot", value)}
            />
          </div>
        </Panel>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save branding
          </button>
        </div>
      </div>
    </TicketingPageShell>
  );
}

function Panel({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
          {icon}
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  icon?: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 focus-within:border-amber-400 focus-within:bg-white">
        {icon && <div className="text-slate-400">{icon}</div>}

        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
      </div>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
    </label>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 focus-within:border-amber-400 focus-within:bg-white">
        <input
          type="color"
          value={value || "#111827"}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-10 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />

        <input
          type="text"
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-black uppercase outline-none"
        />
      </div>
    </label>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-black text-slate-800">{label}</span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-5 w-5 accent-amber-500"
      />
    </label>
  );
}

function FileInput({
  label,
  helper,
  file,
  existingUrl,
  onChange,
  wide = false,
}: {
  label: string;
  helper: string;
  file: File | null;
  existingUrl?: string | null;
  onChange: (file: File | null) => void;
  wide?: boolean;
}) {
  const preview = filePreview(file, existingUrl);

  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <p className="text-sm font-bold text-slate-700">{label}</p>

      <div className="mt-2 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
        <div className={wide ? "h-52" : "h-36"}>
          {preview ? (
            <img
              src={preview}
              alt={label}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
              No image selected
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 p-4">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800">
            <Upload className="h-4 w-4" />
            Upload
            <input
              type="file"
              accept="image/*,.ico,.svg"
              className="hidden"
              onChange={(event) => onChange(event.target.files?.[0] || null)}
            />
          </label>

          {file && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-2 h-11 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700"
            >
              Clear
            </button>
          )}

          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function TicketIcon() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-amber-100 text-amber-700">
      <Globe2 className="h-6 w-6" />
    </div>
  );
}
