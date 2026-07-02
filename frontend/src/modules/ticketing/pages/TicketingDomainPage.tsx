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
  Zap,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";

type DomainDnsRecord = {
  purpose?: string;
  label?: string;
  type?: string;
  host?: string;
  godaddy_host?: string;
  value?: string;
  status?: string;
  instructions?: string;
};

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

  domain_status?: string;
  domain_verified_at?: string | null;
  domain_last_checked_at?: string | null;
  domain_error_message?: string;

  aws_acm_certificate_arn?: string;
  aws_acm_certificate_status?: string;
  aws_acm_requested_at?: string | null;
  aws_acm_validation_record_name?: string;
  aws_acm_validation_record_type?: string;
  aws_acm_validation_record_value?: string;

  cloudfront_distribution_id?: string;
  cloudfront_domain_name?: string;
  cloudfront_alias_added_at?: string | null;

  dns_records_payload?: DomainDnsRecord[];
  domain_dns_records?: DomainDnsRecord[];

  robots_allow_indexing?: boolean;
  robots_allow_ai_crawlers?: boolean;
  is_published?: boolean;

  created_at?: string;
  updated_at?: string;
};

type DomainApiResponse = {
  site?: TicketingPublicSiteSettings;
  dns_records?: DomainDnsRecord[];
  message?: string;
  detail?: string;
};

type DomainHealthStatus =
  | "active"
  | "pending_aws_setup"
  | "pending_dns"
  | "pending_ssl"
  | "pending_cloudfront"
  | "failed"
  | "not_configured";

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
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

function isValidDomain(value: string) {
  if (!value.trim()) return true;

  const domain = cleanDomain(value);

  return /^(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain);
}

function isSupportedCustomDomain(value: string) {
  const domain = cleanDomain(value);

  if (!domain) return true;

  return domain.split(".").length >= 3;
}

function buildDefaultPublicUrl(organisationSlug: string) {
  return `${getCurrentOrigin()}/experiences/${organisationSlug}`;
}

function buildCustomDomainUrl(customDomain: string) {
  const domain = cleanDomain(customDomain);

  if (!domain) return "";

  return `https://${domain}`;
}

function getBestPublicUrl(
  organisationSlug: string,
  customDomain: string,
  canonicalUrl: string
) {
  if (canonicalUrl.trim()) return canonicalUrl.trim();
  if (customDomain.trim()) return buildCustomDomainUrl(customDomain);

  return buildDefaultPublicUrl(organisationSlug);
}

function normalizeDomainStatus(value?: string): DomainHealthStatus {
  const status = String(value || "not_configured") as DomainHealthStatus;

  if (
    [
      "active",
      "pending_aws_setup",
      "pending_dns",
      "pending_ssl",
      "pending_cloudfront",
      "failed",
      "not_configured",
    ].includes(status)
  ) {
    return status;
  }

  return "not_configured";
}

function getStatusConfig(status: DomainHealthStatus, isPublished: boolean) {
  if (!isPublished) {
    return {
      label: "Site not published",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
      description: "Publish the public site before sharing the custom domain.",
    };
  }

  if (status === "active") {
    return {
      label: "Active",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
      description: "The custom domain is connected and ready.",
    };
  }

  if (status === "pending_dns") {
    return {
      label: "Waiting for GoDaddy DNS",
      className: "bg-amber-50 text-amber-700 ring-amber-200",
      description:
        "Add the DNS records below in GoDaddy, then click Check Domain.",
    };
  }

  if (status === "pending_ssl") {
    return {
      label: "Waiting for SSL",
      className: "bg-blue-50 text-blue-700 ring-blue-200",
      description: "AWS is waiting for the SSL certificate to be validated.",
    };
  }

  if (status === "pending_cloudfront") {
    return {
      label: "Updating CloudFront",
      className: "bg-blue-50 text-blue-700 ring-blue-200",
      description: "AWS is attaching the domain to CloudFront.",
    };
  }

  if (status === "pending_aws_setup") {
    return {
      label: "Preparing AWS",
      className: "bg-blue-50 text-blue-700 ring-blue-200",
      description: "AWS setup has started. DNS records will appear shortly.",
    };
  }

  if (status === "failed") {
    return {
      label: "Failed",
      className: "bg-red-50 text-red-700 ring-red-200",
      description: "The last domain setup attempt failed. Review the error.",
    };
  }

  return {
    label: "No domain configured",
    className: "bg-slate-100 text-slate-700 ring-slate-200",
    description: "Enter a custom domain and click Connect Domain.",
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function getRecords(settings: TicketingPublicSiteSettings) {
  return settings.domain_dns_records || settings.dns_records_payload || [];
}

function getRecordCopyValue(record: DomainDnsRecord, field: "host" | "godaddy_host" | "value") {
  return normalizeText(record[field]);
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
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(false);

  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const publicUrl = useMemo(
    () => getBestPublicUrl(organisationSlug, customDomain, canonicalUrl),
    [organisationSlug, customDomain, canonicalUrl]
  );

  const defaultUrl = useMemo(
    () => buildDefaultPublicUrl(organisationSlug),
    [organisationSlug]
  );

  const customDomainUrl = useMemo(
    () => buildCustomDomainUrl(customDomain),
    [customDomain]
  );

  const domainStatus = normalizeDomainStatus(settings.domain_status);
  const statusConfig = getStatusConfig(domainStatus, isPublished);
  const dnsRecords = getRecords(settings);

  function hydrateForm(data: TicketingPublicSiteSettings) {
    setSettings(data);
    setSubdomain(normalizeText(data.subdomain));
    setCustomDomain(normalizeText(data.custom_domain));
    setCanonicalUrl(normalizeText(data.canonical_url));
    setIsPublished(normalizeBoolean(data.is_published, false));
    setRobotsAllowIndexing(normalizeBoolean(data.robots_allow_indexing, true));
  }

  function hydrateDomainResponse(data: DomainApiResponse) {
    if (data.site) {
      hydrateForm(data.site);
      return;
    }

    loadDomainSettings();
  }

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

      hydrateForm(response.data);
    } catch (err: any) {
      console.error("Could not load domain settings:", err);
      setError(getErrorMessage(err, "Could not load domain settings."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDomainSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organisationSlug]);

  async function saveDomainSettings() {
    const cleanedCustomDomain = cleanDomain(customDomain);
    const cleanedSubdomain = cleanSubdomain(subdomain);

    if (cleanedCustomDomain && !isValidDomain(cleanedCustomDomain)) {
      setError("Custom domain is not valid. Example: www.example.com");
      return;
    }

    if (cleanedCustomDomain && !isSupportedCustomDomain(cleanedCustomDomain)) {
      setError("Use a subdomain like www.example.com. Root domains need a different DNS setup.");
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

      hydrateForm(response.data);
      setSavedMessage("Domain settings saved.");
    } catch (err: any) {
      console.error("Could not save domain settings:", err);
      setError(getErrorMessage(err, "Could not save domain settings."));
    } finally {
      setSaving(false);
    }
  }

  async function connectDomain() {
    const cleanedCustomDomain = cleanDomain(customDomain);

    if (!cleanedCustomDomain) {
      setError("Enter a custom domain first. Example: www.example.com");
      return;
    }

    if (!isValidDomain(cleanedCustomDomain)) {
      setError("Custom domain is not valid. Example: www.example.com");
      return;
    }

    if (!isSupportedCustomDomain(cleanedCustomDomain)) {
      setError("Use a subdomain like www.example.com. Root domains need a different DNS setup.");
      return;
    }

    try {
      setConnecting(true);
      setError("");
      setSavedMessage("");

      const response = await api.post<DomainApiResponse>(
        "/ticketing/public-site-settings/connect-domain/",
        {
          custom_domain: cleanedCustomDomain,
        },
        {
          params: requestParams,
        }
      );

      hydrateDomainResponse(response.data);
      setSavedMessage(
        response.data.message ||
          "Domain setup started. Add the DNS records in GoDaddy, then click Check Domain."
      );
    } catch (err: any) {
      console.error("Could not connect domain:", err);

      const data = err?.response?.data as DomainApiResponse | undefined;

      if (data?.site) {
        hydrateDomainResponse(data);
      }

      setError(getErrorMessage(err, "Could not connect domain."));
    } finally {
      setConnecting(false);
    }
  }

  async function checkDomain() {
    try {
      setChecking(true);
      setError("");
      setSavedMessage("");

      const response = await api.post<DomainApiResponse>(
        "/ticketing/public-site-settings/check-domain/",
        {},
        {
          params: requestParams,
        }
      );

      hydrateDomainResponse(response.data);
      setSavedMessage(response.data.message || "Domain status checked.");
    } catch (err: any) {
      console.error("Could not check domain:", err);

      const data = err?.response?.data as DomainApiResponse | undefined;

      if (data?.site) {
        hydrateDomainResponse(data);
      }

      setError(getErrorMessage(err, "Could not check domain."));
    } finally {
      setChecking(false);
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
        subtitle="Connect a custom domain for the public booking website."
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
      subtitle="Connect a custom domain and show the DNS records your customer must add in GoDaddy."
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
                AWS setup is handled by your application. The customer only
                copies the DNS records below into GoDaddy.
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
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </button>

              <button
                type="button"
                onClick={connectDomain}
                disabled={connecting}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Connect domain
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {settings.domain_error_message && (
          <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{settings.domain_error_message}</span>
          </div>
        )}

        {savedMessage && (
          <div className="flex items-start gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <span>{savedMessage}</span>
          </div>
        )}

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <Panel
            title="Custom domain"
            description="Enter the public domain that will open this tenant website."
            icon={<Globe2 className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="Custom domain"
                value={customDomain}
                onChange={(value) => setCustomDomain(cleanDomain(value))}
                placeholder="www.example.com"
                helper="Use a subdomain such as www.example.com. Do not include https://."
              />

              <Input
                label="Canonical URL"
                value={canonicalUrl}
                onChange={setCanonicalUrl}
                placeholder={customDomainUrl || defaultUrl}
                helper="This is the preferred public URL for SEO."
              />

              <Input
                label="Internal subdomain"
                value={subdomain}
                onChange={(value) => setSubdomain(cleanSubdomain(value))}
                placeholder="experiences"
                helper="Optional internal subdomain reference."
              />
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

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDomainSettings}
                disabled={saving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save settings
              </button>

              <button
                type="button"
                onClick={connectDomain}
                disabled={connecting}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {connecting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Zap className="h-4 w-4" />
                )}
                Start AWS setup
              </button>
            </div>
          </Panel>

          <Panel
            title="Current domain status"
            description={statusConfig.description}
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

            <div className="mt-4 grid gap-2 rounded-3xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">
              <InfoLine label="ACM status" value={settings.aws_acm_certificate_status || "—"} />
              <InfoLine label="Last checked" value={formatDateTime(settings.domain_last_checked_at)} />
              <InfoLine label="Verified at" value={formatDateTime(settings.domain_verified_at)} />
              <InfoLine label="CloudFront" value={settings.cloudfront_domain_name || "—"} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={checkDomain}
                disabled={checking}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Check Domain
              </button>

              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                Open public site
              </a>
            </div>
          </Panel>
        </section>

        <Panel
          title="DNS records for GoDaddy"
          description="Give these records to the customer. They should create them in GoDaddy exactly as shown."
          icon={<Server className="h-5 w-5" />}
        >
          {dnsRecords.length > 0 ? (
            <div className="space-y-3">
              {dnsRecords.map((record, index) => (
                <DnsRow
                  key={`${record.purpose || "dns"}-${index}`}
                  record={record}
                  onCopyHost={() =>
                    copy(getRecordCopyValue(record, "godaddy_host") || getRecordCopyValue(record, "host"), "GoDaddy host")
                  }
                  onCopyValue={() =>
                    copy(getRecordCopyValue(record, "value"), "DNS value")
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-950">
                DNS records are not ready yet.
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                Enter a custom domain and click Connect Domain. Your backend
                will create/read the AWS ACM validation record and return the
                DNS records here.
              </p>
            </div>
          )}

          <div className="mt-5 rounded-3xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-sm font-black text-blue-950">GoDaddy note</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-blue-800">
              In GoDaddy, use the <strong>GoDaddy Host</strong> value for the
              Host/Name field and the <strong>Value / Target</strong> value for
              the Points to/Value field. After adding DNS, click Check Domain.
            </p>
          </div>
        </Panel>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel
            title="Setup checklist"
            description="Recommended steps before giving the link to customers."
            icon={<CheckCircle2 className="h-5 w-5" />}
          >
            <ChecklistItem
              complete={Boolean(customDomain)}
              title="Enter custom domain"
              description="Use a subdomain such as www.example.com."
            />
            <ChecklistItem
              complete={Boolean(settings.aws_acm_certificate_arn)}
              title="AWS ACM certificate requested"
              description="Your backend creates or reuses the SSL certificate in AWS."
            />
            <ChecklistItem
              complete={dnsRecords.length > 0}
              title="DNS records generated"
              description="The customer can copy these DNS records into GoDaddy."
            />
            <ChecklistItem
              complete={settings.aws_acm_certificate_status === "ISSUED"}
              title="SSL validated"
              description="After DNS is added, AWS ACM changes to ISSUED."
            />
            <ChecklistItem
              complete={domainStatus === "active"}
              title="Domain active"
              description="CloudFront is connected and the public site is ready."
            />
          </Panel>

          <Panel
            title="Public link examples"
            description="Links generated from this domain configuration."
            icon={<Link2 className="h-5 w-5" />}
          >
            <div className="grid gap-3">
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
                title="Checkout page"
                value={`${publicUrl.replace(/\/$/, "")}/checkout`}
                icon={<Link2 className="h-5 w-5" />}
                onCopy={() =>
                  copy(
                    `${publicUrl.replace(/\/$/, "")}/checkout`,
                    "Checkout page URL"
                  )
                }
              />
            </div>
          </Panel>
        </section>
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

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-all text-right font-black text-slate-950">
        {value || "—"}
      </span>
    </div>
  );
}

function DnsRow({
  record,
  onCopyHost,
  onCopyValue,
}: {
  record: DomainDnsRecord;
  onCopyHost: () => void;
  onCopyValue: () => void;
}) {
  const godaddyHost = normalizeText(record.godaddy_host || record.host);
  const fullHost = normalizeText(record.host);
  const value = normalizeText(record.value);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-black text-slate-950">
            {record.label || record.purpose || "DNS Record"}
          </p>
          {record.instructions && (
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
              {record.instructions}
            </p>
          )}
        </div>

        {record.status && (
          <span className="inline-flex w-fit rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
            {record.status}
          </span>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-[90px_1fr_1fr_auto] md:items-start">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Type
          </p>
          <p className="mt-1 font-black text-slate-950">
            {record.type || "CNAME"}
          </p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            GoDaddy Host
          </p>
          <p className="mt-1 break-all font-black text-slate-950">
            {godaddyHost || "—"}
          </p>
          {fullHost && fullHost !== godaddyHost && (
            <p className="mt-1 break-all text-xs font-bold text-slate-500">
              Full host: {fullHost}
            </p>
          )}
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">
            Value / Target
          </p>
          <p className="mt-1 break-all font-black text-slate-950">
            {value || "—"}
          </p>
        </div>

        <div className="flex gap-2 md:flex-col">
          <button
            type="button"
            onClick={onCopyHost}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" />
            Host
          </button>

          <button
            type="button"
            onClick={onCopyValue}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            <Copy className="h-4 w-4" />
            Value
          </button>
        </div>
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
