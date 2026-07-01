// src/modules/ticketing/pages/TicketingDomainPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Home,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type TicketingPublicSiteSettings = {
  id?: number;
  organisation_name?: string;

  site_title?: string;
  display_title?: string;
  public_description?: string;
  public_email?: string | null;
  public_whatsapp?: string | null;

  subdomain?: string | null;
  custom_domain?: string | null;
  canonical_url?: string | null;

  robots_allow_indexing?: boolean;
  robots_allow_ai_crawlers?: boolean;
  is_published?: boolean;

  created_at?: string;
  updated_at?: string;
};

type DomainHealthStatus = "ready" | "needs_setup" | "missing" | "warning";

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

function getCurrentHost() {
  if (typeof window === "undefined") return "";

  return window.location.host;
}

function getCurrentOrigin() {
  if (typeof window === "undefined") return "";

  return window.location.origin;
}

function cleanSubdomain(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function cleanDomain(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function isValidDomain(value: string) {
  if (!value.trim()) return true;

  const domain = cleanDomain(value);

  return /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain);
}

function buildDefaultPublicUrl(organisationSlug: string) {
  return `${getCurrentOrigin()}/experiences/${organisationSlug}`;
}

function buildSubdomainUrl(subdomain: string) {
  if (!subdomain) return "";

  const host = getCurrentHost();

  if (!host) return `https://${subdomain}`;

  return `${window.location.protocol}//${subdomain}.${host.replace(/^www\./, "")}`;
}

function buildCustomDomainUrl(customDomain: string) {
  if (!customDomain) return "";

  return `https://${cleanDomain(customDomain)}`;
}

function getBestPublicUrl(
  organisationSlug: string,
  subdomain: string,
  customDomain: string,
  canonicalUrl: string
) {
  if (canonicalUrl.trim()) return canonicalUrl.trim();
  if (customDomain.trim()) return buildCustomDomainUrl(customDomain);
  if (subdomain.trim()) return buildSubdomainUrl(subdomain);

  return buildDefaultPublicUrl(organisationSlug);
}

function getDomainStatus(
  customDomain: string,
  subdomain: string,
  canonicalUrl: string,
  isPublished: boolean
): DomainHealthStatus {
  if (!customDomain && !subdomain) return "missing";
  if (!isPublished) return "warning";
  if (customDomain && !canonicalUrl) return "needs_setup";

  return "ready";
}

function getStatusConfig(status: DomainHealthStatus) {
  if (status === "ready") {
    return {
      label: "Ready",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    };
  }

  if (status === "needs_setup") {
    return {
      label: "Needs canonical URL",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }

  if (status === "warning") {
    return {
      label: "Site not published",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
    };
  }

  return {
    label: "No domain configured",
    className: "bg-red-50 text-red-700 ring-red-200",
  };
}

function getDnsTarget() {
  const host = getCurrentHost();

  if (!host || host.includes("localhost") || host.includes("127.0.0.1")) {
    return "app.puntacanadiscovery.com";
  }

  return host;
}

export default function TicketingDomainPage() {
  const organisationSlug =
    window.location.pathname.match(/\/ticketing\/([^/]+)/)?.[1] || "";

  const [settings, setSettings] = useState<TicketingPublicSiteSettings>({});
  const [subdomain, setSubdomain] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [robotsAllowIndexing, setRobotsAllowIndexing] = useState(true);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const publicUrl = useMemo(
    () =>
      getBestPublicUrl(
        organisationSlug,
        subdomain,
        customDomain,
        canonicalUrl
      ),
    [organisationSlug, subdomain, customDomain, canonicalUrl]
  );

  const defaultUrl = useMemo(
    () => buildDefaultPublicUrl(organisationSlug),
    [organisationSlug]
  );

  const subdomainUrl = useMemo(
    () => buildSubdomainUrl(subdomain),
    [subdomain]
  );

  const customDomainUrl = useMemo(
    () => buildCustomDomainUrl(customDomain),
    [customDomain]
  );

  const domainStatus = getDomainStatus(
    customDomain,
    subdomain,
    canonicalUrl,
    isPublished
  );

  const statusConfig = getStatusConfig(domainStatus);

  async function loadDomainSettings() {
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

      setSettings(data);
      setSubdomain(normalizeText(data.subdomain));
      setCustomDomain(normalizeText(data.custom_domain));
      setCanonicalUrl(normalizeText(data.canonical_url));
      setIsPublished(normalizeBoolean(data.is_published, false));
      setRobotsAllowIndexing(normalizeBoolean(data.robots_allow_indexing, true));
    } catch (err: any) {
      console.error("Could not load domain settings:", err);
      setError(getErrorMessage(err, "Could not load domain settings."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDomainSettings();
  }, [organisationSlug]);

  async function saveDomainSettings() {
    const cleanedCustomDomain = cleanDomain(customDomain);
    const cleanedSubdomain = cleanSubdomain(subdomain);

    if (cleanedCustomDomain && !isValidDomain(cleanedCustomDomain)) {
      setError("Custom domain is not valid. Example: bookings.example.com");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = {
        subdomain: cleanedSubdomain,
        custom_domain: cleanedCustomDomain,
        canonical_url:
          canonicalUrl.trim() ||
          (cleanedCustomDomain
            ? buildCustomDomainUrl(cleanedCustomDomain)
            : cleanedSubdomain
              ? buildSubdomainUrl(cleanedSubdomain)
              : defaultUrl),
        is_published: isPublished,
        robots_allow_indexing: robotsAllowIndexing,
      };

      const response = await api.patch<TicketingPublicSiteSettings>(
        "/ticketing/public-site-settings/mine/",
        payload,
        {
          params: requestParams,
        }
      );

      setSettings((current) => ({
        ...current,
        ...response.data,
      }));

      setSubdomain(normalizeText(response.data.subdomain));
      setCustomDomain(normalizeText(response.data.custom_domain));
      setCanonicalUrl(normalizeText(response.data.canonical_url));
      setIsPublished(normalizeBoolean(response.data.is_published, false));
      setRobotsAllowIndexing(
        normalizeBoolean(response.data.robots_allow_indexing, true)
      );

      setSavedMessage("Domain settings saved.");
    } catch (err: any) {
      console.error("Could not save domain settings:", err);
      setError(getErrorMessage(err, "Could not save domain settings."));
    } finally {
      setSaving(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setSavedMessage(`${label} copied.`);
    } catch {
      setError(`Could not copy ${label.toLowerCase()}.`);
    }
  }

  if (loading) {
    return (
      <TicketingPageShell
        title="Domain"
        subtitle="Configure custom domain and subdomain for the public booking website."
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          Loading domain settings...
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title="Domain"
      subtitle="Configure custom domain and subdomain for the public booking website."
    >
      <div className="space-y-5 pb-24">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-600">
                Public booking website
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                {settings.display_title ||
                  settings.site_title ||
                  settings.organisation_name ||
                  "PCD Experiences"}
              </h1>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                Configure the URL customers and sellers will use to open the
                public booking website.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadDomainSettings}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>

              <button
                type="button"
                onClick={saveDomainSettings}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save domain
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

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <Panel
            title="Domain settings"
            description="Set a tenant subdomain, custom domain and canonical URL."
            icon={<Globe2 className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Subdomain"
                value={subdomain}
                onChange={(value) => setSubdomain(cleanSubdomain(value))}
                placeholder="experiences"
                helper="Example: experiences.your-main-domain.com"
              />

              <Input
                label="Custom domain"
                value={customDomain}
                onChange={(value) => setCustomDomain(cleanDomain(value))}
                placeholder="bookings.example.com"
                helper="Do not include https:// or any slash."
              />

              <div className="md:col-span-2">
                <Input
                  label="Canonical URL"
                  value={canonicalUrl}
                  onChange={setCanonicalUrl}
                  placeholder={customDomainUrl || subdomainUrl || defaultUrl}
                  helper="This is the preferred public URL for SEO."
                />
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Toggle
                label="Publish public site"
                description="Customers can access the public booking website."
                checked={isPublished}
                onChange={setIsPublished}
              />

              <Toggle
                label="Allow indexing"
                description="Allow search engines to index this public site."
                checked={robotsAllowIndexing}
                onChange={setRobotsAllowIndexing}
              />
            </div>
          </Panel>

          <Panel
            title="Current domain status"
            description="Quick view of the public URL and setup state."
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-slate-950">
                  Domain status
                </p>
                <span
                  className={[
                    "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
                    statusConfig.className,
                  ].join(" ")}
                >
                  {statusConfig.label}
                </span>
              </div>

              <div className="mt-4 space-y-3">
                <DomainLine
                  label="Default URL"
                  value={defaultUrl}
                  onCopy={() => copy(defaultUrl, "Default URL")}
                />

                {subdomain && (
                  <DomainLine
                    label="Subdomain URL"
                    value={subdomainUrl}
                    onCopy={() => copy(subdomainUrl, "Subdomain URL")}
                  />
                )}

                {customDomain && (
                  <DomainLine
                    label="Custom domain URL"
                    value={customDomainUrl}
                    onCopy={() => copy(customDomainUrl, "Custom domain URL")}
                  />
                )}

                <DomainLine
                  label="Preferred public URL"
                  value={publicUrl}
                  onCopy={() => copy(publicUrl, "Preferred public URL")}
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
              >
                <ExternalLink className="h-4 w-4" />
                Open public site
              </a>

              <button
                type="button"
                onClick={() => copy(publicUrl, "Preferred public URL")}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <Copy className="h-4 w-4" />
                Copy URL
              </button>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="DNS instructions"
            description="Use this when connecting a real custom domain."
            icon={<Server className="h-5 w-5" />}
          >
            <div className="space-y-3">
              <DnsRow
                type="CNAME"
                name={customDomain || "bookings.example.com"}
                value={getDnsTarget()}
                onCopy={() => copy(getDnsTarget(), "DNS target")}
              />

              <DnsRow
                type="TXT"
                name={`_pcd-verify.${customDomain || "bookings.example.com"}`}
                value={`pcd-ticketing=${organisationSlug || "organisation-slug"}`}
                onCopy={() =>
                  copy(
                    `pcd-ticketing=${organisationSlug || "organisation-slug"}`,
                    "TXT verification value"
                  )
                }
              />
            </div>

            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-950">
                DNS note
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                After changing DNS, propagation can take minutes or several
                hours. SSL/HTTPS must also be configured on your hosting layer
                before the custom domain is fully ready.
              </p>
            </div>
          </Panel>

          <Panel
            title="Setup checklist"
            description="Recommended steps before giving the link to customers."
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <ChecklistItem
              complete={Boolean(subdomain || customDomain)}
              title="Choose a public URL"
              description="Use either a tenant subdomain or your own custom domain."
            />
            <ChecklistItem
              complete={!customDomain || isValidDomain(customDomain)}
              title="Validate custom domain"
              description="The custom domain should look like bookings.example.com."
            />
            <ChecklistItem
              complete={Boolean(canonicalUrl || publicUrl)}
              title="Set canonical URL"
              description="This helps Google and AI search systems understand the preferred public page."
            />
            <ChecklistItem
              complete={isPublished}
              title="Publish the public site"
              description="The public booking website should be published before sharing links."
            />
            <ChecklistItem
              complete={robotsAllowIndexing}
              title="Allow indexing"
              description="Enable indexing when you want Google and search engines to discover the site."
            />
          </Panel>
        </section>

        <Panel
          title="Public link examples"
          description="Links generated from this domain configuration."
          icon={<Link2 className="h-5 w-5" />}
        >
          <div className="grid gap-3 lg:grid-cols-3">
            <ExampleLink
              title="Public home"
              value={publicUrl}
              icon={<Home className="h-5 w-5" />}
              onCopy={() => copy(publicUrl, "Public home URL")}
            />

            <ExampleLink
              title="Product page pattern"
              value={`${publicUrl.replace(/\/$/, "")}/product/product-slug`}
              icon={<Globe2 className="h-5 w-5" />}
              onCopy={() =>
                copy(
                  `${publicUrl.replace(/\/$/, "")}/product/product-slug`,
                  "Product page URL pattern"
                )
              }
            />

            <ExampleLink
              title="Seller page pattern"
              value={`${publicUrl.replace(/\/$/, "")}/s/seller-slug`}
              icon={<Link2 className="h-5 w-5" />}
              onCopy={() =>
                copy(
                  `${publicUrl.replace(/\/$/, "")}/s/seller-slug`,
                  "Seller page URL pattern"
                )
              }
            />
          </div>
        </Panel>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveDomainSettings}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save domain
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
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />

      {helper && (
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
          {helper}
        </p>
      )}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
          {description}
        </span>
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-amber-500"
      />
    </label>
  );
}

function DomainLine({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="mt-1 break-all text-sm font-black text-slate-950">
            {value || "—"}
          </p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DnsRow({
  type,
  name,
  value,
  onCopy,
}: {
  type: string;
  name: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="grid gap-3 md:grid-cols-[90px_1fr_1fr_auto] md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Type
          </p>
          <p className="mt-1 font-black text-slate-950">{type}</p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Name / Host
          </p>
          <p className="mt-1 break-all font-black text-slate-950">{name}</p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Value / Target
          </p>
          <p className="mt-1 break-all font-black text-slate-950">{value}</p>
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
          Copy
        </button>
      </div>
    </div>
  );
}

function ChecklistItem({
  complete,
  title,
  description,
}: {
  complete: boolean;
  title: string;
  description: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 last:mb-0">
      <div
        className={[
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl",
          complete
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-700",
        ].join(" ")}
      >
        {complete ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}
      </div>

      <div>
        <p className="text-sm font-black text-slate-950">{title}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
          {description}
        </p>
      </div>
    </div>
  );
}

function ExampleLink({
  title,
  value,
  icon,
  onCopy,
}: {
  title: string;
  value: string;
  icon: ReactNode;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
      <p className="mt-2 break-all text-xs font-bold leading-5 text-slate-500">
        {value}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
          Copy
        </button>

        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          <ExternalLink className="h-4 w-4" />
          Open
        </a>
      </div>
    </div>
  );
}
