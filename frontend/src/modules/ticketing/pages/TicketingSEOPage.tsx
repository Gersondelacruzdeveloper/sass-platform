// src/modules/ticketing/pages/TicketingSEOPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FileCode2,
  Globe2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Network,
  Sparkles,
  Tags,
} from "lucide-react";

import api from "../../../api/axios";
import TicketingPageShell from "../components/TicketingPageShell";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type TicketingPublicSiteSettings = {
  id?: number;
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

  seo_title: string;
  meta_description: string;
  canonical_url: string;

  product_url_pattern: string;
  custom_product_url_pattern: string;
  preserve_imported_product_urls: boolean;
  auto_create_product_redirects: boolean;

  og_title: string;
  og_description: string;

  robots_allow_indexing: boolean;
  robots_allow_ai_crawlers: boolean;
  allow_gptbot: boolean;
  allow_oai_searchbot: boolean;

  json_ld_local_business: Record<string, unknown>;

  show_public_rankings: boolean;
  show_seller_public_pages: boolean;
  show_reviews: boolean;
  is_published: boolean;

  created_at?: string;
  updated_at?: string;
};

type ExperienceProduct = {
  id: number;
  name: string;
  slug: string;
  current_public_path?: string;
  primary_url?: string;
  imported_from_url?: string;
  imported_from_domain?: string;
  preserve_legacy_url?: boolean;
  url_aliases?: {
    id: number;
    path: string;
    is_primary: boolean;
    is_active: boolean;
    redirect_to_primary: boolean;
    redirect_type: number;
    source?: string;
    original_full_url?: string;
    hit_count?: number;
    last_hit_at?: string | null;
  }[];
  product_type?: string;
  status?: string;
  public_enabled?: boolean;
  is_active?: boolean;
  seo_title?: string;
  meta_description?: string;
  canonical_url?: string;
  og_title?: string;
  og_description?: string;
  twitter_title?: string;
  twitter_description?: string;
  image_alt_text?: string;
  keywords_tags?: string[] | string;
  json_ld_override?: Record<string, unknown>;
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

  product_url_pattern: "/product/{slug}",
  custom_product_url_pattern: "",
  preserve_imported_product_urls: true,
  auto_create_product_redirects: true,

  og_title: "",
  og_description: "",

  robots_allow_indexing: true,
  robots_allow_ai_crawlers: true,
  allow_gptbot: true,
  allow_oai_searchbot: true,

  json_ld_local_business: {},

  show_public_rankings: true,
  show_seller_public_pages: true,
  show_reviews: true,
  is_published: false,
};

const PRODUCT_URL_PATTERN_OPTIONS = [
  { value: "/product/{slug}", label: "/product/{slug}" },
  { value: "/products/{slug}", label: "/products/{slug}" },
  { value: "/tour/{slug}", label: "/tour/{slug}" },
  { value: "/tours/{slug}", label: "/tours/{slug}" },
  { value: "/activity/{slug}", label: "/activity/{slug}" },
  { value: "/activities/{slug}", label: "/activities/{slug}" },
  { value: "/experience/{slug}", label: "/experience/{slug}" },
  { value: "/experiences/{slug}", label: "/experiences/{slug}" },
  { value: "/excursions/detail/{slug}", label: "/excursions/detail/{slug} - legacy" },
  { value: "custom", label: "Custom pattern" },
];

function getEffectiveProductUrlPattern(site: TicketingPublicSiteSettings) {
  const rawPattern =
    site.product_url_pattern === "custom"
      ? site.custom_product_url_pattern
      : site.product_url_pattern;

  if (!rawPattern || !rawPattern.includes("{slug}")) {
    return "/product/{slug}";
  }

  return rawPattern.startsWith("/") ? rawPattern : `/${rawPattern}`;
}

function buildExampleProductUrl(site: TicketingPublicSiteSettings, organisationSlug?: string) {
  const baseUrl = (site.canonical_url || buildCanonicalFallback(organisationSlug)).replace(/\/$/, "");
  const pattern = getEffectiveProductUrlPattern(site);

  return `${baseUrl}${pattern.replace("{slug}", "saona-island")}`;
}

function buildProductPublicPath(product: ExperienceProduct, organisationSlug?: string) {
  const path = product.current_public_path || `/product/${product.slug}`;

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (!organisationSlug) {
    return path;
  }

  return `/experiences/${organisationSlug}${path.startsWith("/") ? path : `/${path}`}`;
}


function getProductAliasCount(product: ExperienceProduct) {
  return Array.isArray(product.url_aliases)
    ? product.url_aliases.filter((alias) => alias.is_active !== false).length
    : 0;
}

function getProductLegacyStatus(
  product: ExperienceProduct,
  t: (key: string) => string
) {
  if (product.imported_from_url) return t("seo.status.imported");
  if (getProductAliasCount(product) > 1) return t("seo.status.aliases");
  return t("seo.status.native");
}

function getRequestParams(organisationSlug?: string) {
  return {
    slug: organisationSlug,
    organisation_slug: organisationSlug,
  };
}

function normalizeList<T>(data: T[] | { results?: T[] } | unknown): T[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object" && Array.isArray((data as any).results)) {
    return (data as any).results;
  }

  return [];
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

function getApiBaseUrl() {
  return String(api.defaults.baseURL || "/api").replace(/\/$/, "");
}

function buildPublicSiteUrl(organisationSlug?: string) {
  if (!organisationSlug) return "";

  return `${window.location.origin}/experiences/${organisationSlug}`;
}

function buildCanonicalFallback(organisationSlug?: string) {
  return buildPublicSiteUrl(organisationSlug);
}

function buildPublicEndpoint(path: string, organisationSlug?: string) {
  const query = organisationSlug
    ? `?slug=${encodeURIComponent(organisationSlug)}&organisation_slug=${encodeURIComponent(
        organisationSlug
      )}`
    : "";

  return `${getApiBaseUrl()}${path}${query}`;
}

function buildSeoApiUrl(organisationSlug?: string) {
  return buildPublicEndpoint("/ticketing/public/seo/", organisationSlug);
}

function buildSitemapUrl(organisationSlug?: string) {
  return buildPublicEndpoint("/ticketing/public/sitemap.xml", organisationSlug);
}

function buildRobotsUrl(organisationSlug?: string) {
  return buildPublicEndpoint("/ticketing/public/robots.txt", organisationSlug);
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value || {}, null, 2);
  } catch {
    return "{}";
  }
}

function defaultLocalBusinessJsonLd(site: TicketingPublicSiteSettings, organisationSlug?: string) {
  const siteUrl = site.canonical_url || buildCanonicalFallback(organisationSlug);

  return {
    "@context": "https://schema.org",
    "@type": "TravelAgency",
    name: site.site_title || site.display_title || "PCD Experiences",
    description: site.public_description || "Tours, tickets, transfers and experiences.",
    url: siteUrl,
    email: site.public_email || undefined,
    telephone: site.public_whatsapp || undefined,
    image: site.og_image_url || site.hero_image_url || site.logo_url || undefined,
    areaServed: {
      "@type": "Place",
      name: "Punta Cana",
    },
  };
}

function getMetaLengthState(value: string, min: number, max: number) {
  const length = value.trim().length;

  if (!length) return "missing";
  if (length < min) return "short";
  if (length > max) return "long";

  return "good";
}

function getStatusClasses(status: "good" | "short" | "long" | "missing") {
  if (status === "good") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "missing") return "bg-red-50 text-red-700 ring-red-200";

  return "bg-amber-50 text-amber-700 ring-amber-200";
}

function getStatusText(
  status: "good" | "short" | "long" | "missing",
  t: (key: string) => string
) {
  if (status === "good") return t("seo.status.good");
  if (status === "short") return t("seo.status.tooShort");
  if (status === "long") return t("seo.status.tooLong");

  return t("seo.status.missing");
}

function productSeoScore(product: ExperienceProduct) {
  const checks = [
    Boolean(product.seo_title),
    Boolean(product.meta_description),
    Boolean(product.canonical_url),
    Boolean(product.og_title),
    Boolean(product.og_description),
    Boolean(product.image_alt_text),
    Array.isArray(product.keywords_tags)
      ? product.keywords_tags.length > 0
      : Boolean(product.keywords_tags),
    Boolean(product.json_ld_override && Object.keys(product.json_ld_override).length > 0),
  ];

  return {
    done: checks.filter(Boolean).length,
    total: checks.length,
  };
}

function copyToClipboard(value: string, onSuccess: () => void, onError: () => void) {
  navigator.clipboard
    .writeText(value)
    .then(onSuccess)
    .catch(onError);
}

export default function TicketingSEOPage() {
  const { t } = useTicketingAdminTranslation();
  const params = useParams();
  const organisationSlug = params.organisationSlug || params.slug || "";

  const [publicSite, setPublicSite] =
    useState<TicketingPublicSiteSettings>(initialPublicSite);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [jsonLdText, setJsonLdText] = useState("{}");
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [jsonError, setJsonError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const requestParams = useMemo(
    () => getRequestParams(organisationSlug),
    [organisationSlug]
  );

  const publicUrl = useMemo(
    () => buildPublicSiteUrl(organisationSlug),
    [organisationSlug]
  );
  const seoApiUrl = useMemo(
    () => buildSeoApiUrl(organisationSlug),
    [organisationSlug]
  );
  const sitemapUrl = useMemo(
    () => buildSitemapUrl(organisationSlug),
    [organisationSlug]
  );
  const robotsUrl = useMemo(
    () => buildRobotsUrl(organisationSlug),
    [organisationSlug]
  );

  const exampleProductUrl = useMemo(
    () => buildExampleProductUrl(publicSite, organisationSlug),
    [publicSite, organisationSlug]
  );

  async function loadPage() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");
      setJsonError("");

      const [publicSiteResponse, productsResponse] = await Promise.all([
        api.get<TicketingPublicSiteSettings>(
          "/ticketing/public-site-settings/mine/",
          {
            params: requestParams,
          }
        ),
        api.get("/ticketing/products/", {
          params: requestParams,
        }),
      ]);

      const siteData = {
        ...initialPublicSite,
        ...publicSiteResponse.data,
        site_title: normalizeText(publicSiteResponse.data.site_title),
        public_description: normalizeText(publicSiteResponse.data.public_description),
        public_email: normalizeText(publicSiteResponse.data.public_email),
        public_whatsapp: normalizeText(publicSiteResponse.data.public_whatsapp),
        subdomain: normalizeText(publicSiteResponse.data.subdomain),
        custom_domain: normalizeText(publicSiteResponse.data.custom_domain),
        seo_title: normalizeText(publicSiteResponse.data.seo_title),
        meta_description: normalizeText(publicSiteResponse.data.meta_description),
        canonical_url: normalizeText(publicSiteResponse.data.canonical_url),
        product_url_pattern: normalizeText(
          publicSiteResponse.data.product_url_pattern,
          initialPublicSite.product_url_pattern
        ),
        custom_product_url_pattern: normalizeText(
          publicSiteResponse.data.custom_product_url_pattern
        ),
        preserve_imported_product_urls: normalizeBoolean(
          publicSiteResponse.data.preserve_imported_product_urls,
          true
        ),
        auto_create_product_redirects: normalizeBoolean(
          publicSiteResponse.data.auto_create_product_redirects,
          true
        ),
        og_title: normalizeText(publicSiteResponse.data.og_title),
        og_description: normalizeText(publicSiteResponse.data.og_description),
        robots_allow_indexing: normalizeBoolean(
          publicSiteResponse.data.robots_allow_indexing,
          true
        ),
        robots_allow_ai_crawlers: normalizeBoolean(
          publicSiteResponse.data.robots_allow_ai_crawlers,
          true
        ),
        allow_gptbot: normalizeBoolean(publicSiteResponse.data.allow_gptbot, true),
        allow_oai_searchbot: normalizeBoolean(
          publicSiteResponse.data.allow_oai_searchbot,
          true
        ),
        show_public_rankings: normalizeBoolean(
          publicSiteResponse.data.show_public_rankings,
          true
        ),
        show_seller_public_pages: normalizeBoolean(
          publicSiteResponse.data.show_seller_public_pages,
          true
        ),
        show_reviews: normalizeBoolean(publicSiteResponse.data.show_reviews, true),
        is_published: normalizeBoolean(publicSiteResponse.data.is_published, false),
        json_ld_local_business:
          publicSiteResponse.data.json_ld_local_business || {},
      };

      setPublicSite(siteData);
      setJsonLdText(safeJsonStringify(siteData.json_ld_local_business));
      setProducts(normalizeList<ExperienceProduct>(productsResponse.data));
    } catch (err: any) {
      console.error("Could not load SEO settings:", err);
      setError(getErrorMessage(err, t("seo.errors.load")));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [organisationSlug]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const text = [
        product.name,
        product.slug,
        product.current_public_path,
        product.primary_url,
        product.imported_from_url,
        product.product_type,
        product.seo_title,
        product.meta_description,
        product.canonical_url,
      ]
        .join(" ")
        .toLowerCase();

      if (search.trim() && !text.includes(search.trim().toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [products, search]);

  const seoTitleState = getMetaLengthState(publicSite.seo_title, 30, 60);
  const metaDescriptionState = getMetaLengthState(
    publicSite.meta_description,
    120,
    160
  );

  const stats = useMemo(() => {
    const publishedProducts = products.filter(
      (product) => product.public_enabled && product.is_active && product.status === "active"
    );

    const titleComplete = products.filter((product) => product.seo_title).length;
    const metaComplete = products.filter((product) => product.meta_description).length;
    const canonicalComplete = products.filter(
      (product) => product.canonical_url || product.primary_url || product.current_public_path
    ).length;
    const productsWithAliases = products.filter(
      (product) => getProductAliasCount(product) > 0
    ).length;
    const importedProducts = products.filter((product) => product.imported_from_url).length;
    const jsonLdComplete = products.filter(
      (product) =>
        product.json_ld_override && Object.keys(product.json_ld_override).length > 0
    ).length;

    return {
      products: products.length,
      publishedProducts: publishedProducts.length,
      titleComplete,
      metaComplete,
      canonicalComplete,
      productsWithAliases,
      importedProducts,
      jsonLdComplete,
    };
  }, [products]);

  function updateField<K extends keyof TicketingPublicSiteSettings>(
    field: K,
    value: TicketingPublicSiteSettings[K]
  ) {
    setPublicSite((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyDefaultJsonLd() {
    const nextValue = defaultLocalBusinessJsonLd(publicSite, organisationSlug);
    setJsonLdText(safeJsonStringify(nextValue));
    setJsonError("");
  }

  function validateJsonLd() {
    try {
      const parsed = JSON.parse(jsonLdText || "{}");

      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        setJsonError(t("seo.errors.jsonObject"));
        return null;
      }

      setJsonError("");
      return parsed as Record<string, unknown>;
    } catch (err: any) {
      setJsonError(err?.message || t("seo.errors.invalidJson"));
      return null;
    }
  }

  async function saveSeoSettings() {
    const parsedJsonLd = validateJsonLd();

    if (!parsedJsonLd) return;

    try {
      setSaving(true);
      setError("");
      setSavedMessage("");

      const payload = {
        seo_title: publicSite.seo_title,
        meta_description: publicSite.meta_description,
        canonical_url: publicSite.canonical_url,
        product_url_pattern: publicSite.product_url_pattern,
        custom_product_url_pattern: publicSite.custom_product_url_pattern,
        preserve_imported_product_urls: publicSite.preserve_imported_product_urls,
        auto_create_product_redirects: publicSite.auto_create_product_redirects,
        og_title: publicSite.og_title,
        og_description: publicSite.og_description,
        robots_allow_indexing: publicSite.robots_allow_indexing,
        robots_allow_ai_crawlers: publicSite.robots_allow_ai_crawlers,
        allow_gptbot: publicSite.allow_gptbot,
        allow_oai_searchbot: publicSite.allow_oai_searchbot,
        json_ld_local_business: parsedJsonLd,
        show_public_rankings: publicSite.show_public_rankings,
        show_seller_public_pages: publicSite.show_seller_public_pages,
        show_reviews: publicSite.show_reviews,
        is_published: publicSite.is_published,
      };

      const response = await api.patch<TicketingPublicSiteSettings>(
        "/ticketing/public-site-settings/mine/",
        payload,
        {
          params: requestParams,
        }
      );

      setPublicSite((current) => ({
        ...current,
        ...response.data,
      }));

      setSavedMessage(t("seo.messages.saved"));
    } catch (err: any) {
      console.error("Could not save SEO settings:", err);
      setError(getErrorMessage(err, t("seo.errors.save")));
    } finally {
      setSaving(false);
    }
  }

  async function copy(value: string, label: string) {
    copyToClipboard(
      value,
      () => setSavedMessage(t("seo.messages.copied").replace("{label}", label)),
      () => setError(t("seo.errors.copy").replace("{label}", label.toLowerCase()))
    );
  }

  if (loading) {
    return (
      <TicketingPageShell
        title={t("seo.page.title")}
        subtitle={t("seo.page.subtitle")}
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600 shadow-sm">
          {t("seo.loading")}
        </div>
      </TicketingPageShell>
    );
  }

  return (
    <TicketingPageShell
      title={t("seo.page.title")}
      subtitle={t("seo.page.subtitle")}
    >
      <div className="space-y-5 pb-24">
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-8">
          <StatCard
            title={t("seo.stats.publicProducts.title")}
            value={`${stats.publishedProducts}/${stats.products}`}
            helper={t("seo.stats.publicProducts.helper")}
            icon={<Globe2 className="h-6 w-6 text-sky-600" />}
          />
          <StatCard
            title={t("seo.stats.seoTitles.title")}
            value={`${stats.titleComplete}/${stats.products}`}
            helper={t("seo.stats.seoTitles.helper")}
            icon={<Tags className="h-6 w-6 text-emerald-600" />}
          />
          <StatCard
            title={t("seo.stats.metaDescriptions.title")}
            value={`${stats.metaComplete}/${stats.products}`}
            helper={t("seo.stats.metaDescriptions.helper")}
            icon={<Search className="h-6 w-6 text-amber-600" />}
          />
          <StatCard
            title={t("seo.stats.canonicalUrls.title")}
            value={`${stats.canonicalComplete}/${stats.products}`}
            helper={t("seo.stats.canonicalUrls.helper")}
            icon={<ExternalLink className="h-6 w-6 text-slate-700" />}
          />
          <StatCard
            title={t("seo.stats.urlAliases.title")}
            value={`${stats.productsWithAliases}/${stats.products}`}
            helper={t("seo.stats.urlAliases.helper")}
            icon={<Network className="h-6 w-6 text-cyan-600" />}
          />
          <StatCard
            title={t("seo.stats.importedUrls.title")}
            value={`${stats.importedProducts}/${stats.products}`}
            helper={t("seo.stats.importedUrls.helper")}
            icon={<RefreshCw className="h-6 w-6 text-orange-600" />}
          />
          <StatCard
            title={t("seo.stats.jsonLd.title")}
            value={`${stats.jsonLdComplete}/${stats.products}`}
            helper={t("seo.stats.jsonLd.helper")}
            icon={<Code2 className="h-6 w-6 text-purple-600" />}
          />
          <StatCard
            title={t("seo.stats.aiCrawlers.title")}
            value={publicSite.robots_allow_ai_crawlers ? t("seo.status.allowed") : t("seo.status.blocked")}
            helper={t("seo.stats.aiCrawlers.helper")}
            icon={<Bot className="h-6 w-6 text-indigo-600" />}
          />
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

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-amber-600">
                {t("seo.foundation.eyebrow")}
              </p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                {publicSite.display_title || publicSite.site_title || "PCD Experiences"}
              </h2>
              <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
                {t("seo.foundation.description")}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={loadPage}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                {t("seo.actions.refresh")}
              </button>

              <button
                type="button"
                onClick={saveSeoSettings}
                disabled={saving}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t("seo.actions.save")}
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <Panel
            title={t("seo.urlMigration.title")}
            description={t("seo.urlMigration.description")}
            icon={<Network className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Select
                label={t("seo.urlMigration.pattern")}
                value={publicSite.product_url_pattern}
                onChange={(value) => updateField("product_url_pattern", value)}
                options={PRODUCT_URL_PATTERN_OPTIONS}
              />

              {publicSite.product_url_pattern === "custom" && (
                <Input
                  label={t("seo.urlMigration.customPattern")}
                  value={publicSite.custom_product_url_pattern}
                  onChange={(value) => updateField("custom_product_url_pattern", value)}
                  placeholder="/things-to-do/{slug}"
                />
              )}

              <Toggle
                label={t("seo.urlMigration.preserveImported")}
                description={t("seo.urlMigration.preserveImportedDescription")}
                checked={publicSite.preserve_imported_product_urls}
                onChange={(value) => updateField("preserve_imported_product_urls", value)}
              />

              <Toggle
                label={t("seo.urlMigration.autoRedirects")}
                description={t("seo.urlMigration.autoRedirectsDescription")}
                checked={publicSite.auto_create_product_redirects}
                onChange={(value) => updateField("auto_create_product_redirects", value)}
              />
            </div>
          </Panel>

          <Panel
            title={t("seo.urlPreview.title")}
            description={t("seo.urlPreview.description")}
            icon={<ExternalLink className="h-5 w-5" />}
          >
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                {t("seo.urlPreview.example")}
              </p>
              <p className="mt-2 break-all text-sm font-black text-slate-900">
                {exampleProductUrl}
              </p>
              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                {t("seo.urlPreview.helper")}
              </p>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_420px]">
          <Panel
            title={t("seo.metadata.title")}
            description={t("seo.metadata.description")}
            icon={<Search className="h-5 w-5" />}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label={t("seo.metadata.seoTitle")}
                value={publicSite.seo_title}
                onChange={(value) => updateField("seo_title", value)}
                placeholder="Book Punta Cana Tours, Tickets & Transfers"
                helper={`${publicSite.seo_title.length} ${t("seo.metadata.characters")}`}
                status={seoTitleState}
              />

              <Input
                label={t("seo.metadata.canonicalUrl")}
                value={publicSite.canonical_url}
                onChange={(value) => updateField("canonical_url", value)}
                placeholder={buildCanonicalFallback(organisationSlug)}
              />

              <Input
                label={t("seo.metadata.ogTitle")}
                value={publicSite.og_title}
                onChange={(value) => updateField("og_title", value)}
                placeholder="PCD Experiences"
              />

              <Textarea
                label={t("seo.metadata.metaDescription")}
                value={publicSite.meta_description}
                onChange={(value) => updateField("meta_description", value)}
                placeholder="Book trusted tours, tickets, transfers and experiences in Punta Cana."
                helper={`${publicSite.meta_description.length} ${t("seo.metadata.characters")}`}
                status={metaDescriptionState}
              />

              <Textarea
                label={t("seo.metadata.ogDescription")}
                value={publicSite.og_description}
                onChange={(value) => updateField("og_description", value)}
                placeholder="A short social sharing description."
              />
            </div>
          </Panel>

          <Panel
            title={t("seo.preview.title")}
            description={t("seo.preview.description")}
            icon={<Sparkles className="h-5 w-5" />}
          >
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <p className="truncate text-sm font-bold text-emerald-700">
                {publicSite.canonical_url || publicUrl || "https://example.com"}
              </p>
              <h3 className="mt-2 text-lg font-black leading-snug text-blue-700">
                {publicSite.seo_title ||
                  publicSite.og_title ||
                  publicSite.site_title ||
                  t("seo.preview.titleFallback")}
              </h3>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {publicSite.meta_description ||
                  publicSite.og_description ||
                  t("seo.preview.descriptionFallback")}
              </p>
            </div>

            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">
                {t("seo.preview.health")}
              </p>

              <div className="mt-3 space-y-2">
                <HealthRow
                  label={t("seo.preview.seoTitleLength")}
                  state={seoTitleState}
                  value={getStatusText(seoTitleState, t)}
                />
                <HealthRow
                  label={t("seo.preview.metaDescriptionLength")}
                  state={metaDescriptionState}
                  value={getStatusText(metaDescriptionState, t)}
                />
                <HealthRow
                  label={t("seo.metadata.canonicalUrl")}
                  state={publicSite.canonical_url ? "good" : "missing"}
                  value={publicSite.canonical_url ? t("seo.status.configured") : t("seo.status.missing")}
                />
                <HealthRow
                  label={t("seo.metadata.ogTitle")}
                  state={publicSite.og_title ? "good" : "missing"}
                  value={publicSite.og_title ? t("seo.status.configured") : t("seo.status.missing")}
                />
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <Panel
            title={t("seo.robots.title")}
            description={t("seo.robots.description")}
            icon={<ShieldCheck className="h-5 w-5" />}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <Toggle
                label={t("seo.robots.allowIndexing")}
                description={t("seo.robots.allowIndexingDescription")}
                checked={publicSite.robots_allow_indexing}
                onChange={(value) => updateField("robots_allow_indexing", value)}
              />

              <Toggle
                label={t("seo.robots.allowAi")}
                description={t("seo.robots.allowAiDescription")}
                checked={publicSite.robots_allow_ai_crawlers}
                onChange={(value) => updateField("robots_allow_ai_crawlers", value)}
              />

              <Toggle
                label={t("seo.robots.allowGptBot")}
                description={t("seo.robots.allowGptBotDescription")}
                checked={publicSite.allow_gptbot}
                onChange={(value) => updateField("allow_gptbot", value)}
              />

              <Toggle
                label={t("seo.robots.allowOai")}
                description={t("seo.robots.allowOaiDescription")}
                checked={publicSite.allow_oai_searchbot}
                onChange={(value) => updateField("allow_oai_searchbot", value)}
              />

              <Toggle
                label={t("seo.robots.showRankings")}
                description={t("seo.robots.showRankingsDescription")}
                checked={publicSite.show_public_rankings}
                onChange={(value) => updateField("show_public_rankings", value)}
              />

              <Toggle
                label={t("seo.robots.showSellerPages")}
                description={t("seo.robots.showSellerPagesDescription")}
                checked={publicSite.show_seller_public_pages}
                onChange={(value) => updateField("show_seller_public_pages", value)}
              />

              <Toggle
                label={t("seo.robots.showReviews")}
                description={t("seo.robots.showReviewsDescription")}
                checked={publicSite.show_reviews}
                onChange={(value) => updateField("show_reviews", value)}
              />

              <Toggle
                label={t("seo.robots.publishSite")}
                description={t("seo.robots.publishSiteDescription")}
                checked={publicSite.is_published}
                onChange={(value) => updateField("is_published", value)}
              />
            </div>
          </Panel>

          <Panel
            title={t("seo.endpoints.title")}
            description={t("seo.endpoints.description")}
            icon={<Network className="h-5 w-5" />}
          >
            <div className="space-y-3">
              <EndpointRow
                label={t("seo.endpoints.publicSite")}
                value={publicUrl}
                onCopy={() => copy(publicUrl, "Public site URL")}
              />
              <EndpointRow
                label={t("seo.endpoints.seoJson")}
                value={seoApiUrl}
                onCopy={() => copy(seoApiUrl, "SEO JSON URL")}
              />
              <EndpointRow
                label={t("seo.endpoints.sitemapXml")}
                value={sitemapUrl}
                onCopy={() => copy(sitemapUrl, "Sitemap URL")}
              />
              <EndpointRow
                label={t("seo.endpoints.robotsTxt")}
                value={robotsUrl}
                onCopy={() => copy(robotsUrl, "Robots URL")}
              />
              <EndpointRow
                label={t("seo.endpoints.exampleProduct")}
                value={exampleProductUrl}
                onCopy={() => copy(exampleProductUrl, "Example product URL")}
              />
            </div>

            <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-black text-amber-900">
                {t("seo.endpoints.important")}
              </p>
              <p className="mt-2 text-sm font-semibold leading-6 text-amber-800">
                {t("seo.endpoints.importantDescription")}
              </p>
            </div>
          </Panel>
        </section>

        <Panel
          title={t("seo.jsonLd.title")}
          description={t("seo.jsonLd.description")}
          icon={<FileCode2 className="h-5 w-5" />}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={applyDefaultJsonLd}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Sparkles className="h-4 w-4" />
              {t("seo.actions.generateTemplate")}
            </button>

            <button
              type="button"
              onClick={() => copy(jsonLdText, "JSON-LD")}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <Copy className="h-4 w-4" />
              {t("seo.actions.copyJsonLd")}
            </button>
          </div>

          <textarea
            value={jsonLdText}
            onChange={(event) => {
              setJsonLdText(event.target.value);
              setJsonError("");
            }}
            className="mt-4 min-h-80 w-full rounded-3xl border border-slate-200 bg-slate-950 px-4 py-4 font-mono text-sm font-semibold leading-6 text-slate-100 outline-none focus:border-amber-400"
            spellCheck={false}
          />

          {jsonError && (
            <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700">
              {jsonError}
            </p>
          )}
        </Panel>

        <Panel
          title={t("seo.audit.title")}
          description={t("seo.audit.description")}
          icon={<Tags className="h-5 w-5" />}
        >
          <div className="mb-4 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("seo.audit.searchPlaceholder")}
              className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
            />
          </div>

          <div className="overflow-hidden rounded-3xl border border-slate-200">
            {filteredProducts.length === 0 ? (
              <EmptyState text={t("seo.audit.empty")} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>{t("seo.audit.product")}</Th>
                      <Th>{t("seo.audit.status")}</Th>
                      <Th>{t("seo.audit.score")}</Th>
                      <Th>{t("seo.audit.titleColumn")}</Th>
                      <Th>{t("seo.audit.meta")}</Th>
                      <Th>{t("seo.audit.canonical")}</Th>
                      <Th>{t("seo.audit.aliases")}</Th>
                      <Th>{t("seo.audit.migration")}</Th>
                      <Th>{t("seo.audit.publicLink")}</Th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100 bg-white">
                    {filteredProducts.map((product) => {
                      const score = productSeoScore(product);

                      return (
                        <tr key={product.id}>
                          <Td>
                            <div>
                              <p className="font-black text-slate-950">
                                {product.name}
                              </p>
                              <p className="mt-1 text-xs font-bold text-slate-500">
                                {product.current_public_path || `/product/${product.slug}`}
                              </p>
                            </div>
                          </Td>

                          <Td>
                            <div className="space-y-1">
                              <StatusPill
                                good={Boolean(product.public_enabled)}
                                goodText={t("seo.status.public")}
                                badText={t("seo.status.hidden")}
                              />
                              <StatusPill
                                good={product.status === "active" && Boolean(product.is_active)}
                                goodText={t("seo.status.active")}
                                badText={product.status || t("seo.status.inactive")}
                              />
                            </div>
                          </Td>

                          <Td>
                            <span
                              className={[
                                "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
                                score.done === score.total
                                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                  : score.done >= 4
                                    ? "bg-amber-50 text-amber-700 ring-amber-200"
                                    : "bg-red-50 text-red-700 ring-red-200",
                              ].join(" ")}
                            >
                              {score.done}/{score.total}
                            </span>
                          </Td>

                          <Td>
                            <StatusPill
                              good={Boolean(product.seo_title)}
                              goodText={t("seo.status.set")}
                              badText={t("seo.status.missing")}
                            />
                          </Td>

                          <Td>
                            <StatusPill
                              good={Boolean(product.meta_description)}
                              goodText={t("seo.status.set")}
                              badText={t("seo.status.missing")}
                            />
                          </Td>

                          <Td>
                            <StatusPill
                              good={Boolean(product.canonical_url || product.primary_url || product.current_public_path)}
                              goodText={t("seo.status.set")}
                              badText={t("seo.status.missing")}
                            />
                          </Td>

                          <Td>
                            <span className="inline-flex rounded-full bg-slate-50 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200">
                              {getProductAliasCount(product)}
                            </span>
                          </Td>

                          <Td>
                            <StatusPill
                              good={Boolean(product.imported_from_url || getProductAliasCount(product) > 1)}
                              goodText={getProductLegacyStatus(product, t)}
                              badText={t("seo.status.native")}
                            />
                          </Td>

                          <Td>
                            <Link
                              to={buildProductPublicPath(product, organisationSlug)}
                              target="_blank"
                              className="inline-flex items-center gap-2 text-xs font-black text-amber-700"
                            >
                              <ExternalLink className="h-4 w-4" />
                              {t("seo.actions.open")}
                            </Link>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Panel>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveSeoSettings}
            disabled={saving}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t("seo.actions.save")}
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
  status,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  status?: "good" | "short" | "long" | "missing";
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        {status && <StatusLabel status={status} />}
      </div>

      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />

      {helper && (
        <p className="mt-2 text-xs font-bold text-slate-500">{helper}</p>
      )}
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  helper,
  status,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  status?: "good" | "short" | "long" | "missing";
}) {
  return (
    <label className="block md:col-span-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        {status && <StatusLabel status={status} />}
      </div>

      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />

      {helper && (
        <p className="mt-2 text-xs font-bold text-slate-500">{helper}</p>
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

function EndpointRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  const { t } = useTicketingAdminTranslation();
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </p>

      <p className="mt-2 break-all text-sm font-bold leading-6 text-slate-700">
        {value || "—"}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
        >
          <Copy className="h-4 w-4" />
          {t("seo.actions.copy")}
        </button>

        {value && (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 transition hover:bg-slate-50"
          >
            <ExternalLink className="h-4 w-4" />
            {t("seo.actions.open")}
          </a>
        )}
      </div>
    </div>
  );
}

function HealthRow({
  label,
  state,
  value,
}: {
  label: string;
  state: "good" | "short" | "long" | "missing";
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3">
      <span className="text-sm font-bold text-slate-600">{label}</span>
      <span
        className={[
          "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
          getStatusClasses(state),
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function StatusLabel({
  status,
}: {
  status: "good" | "short" | "long" | "missing";
}) {
  const { t } = useTicketingAdminTranslation();
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
        getStatusClasses(status),
      ].join(" ")}
    >
      {getStatusText(status, t)}
    </span>
  );
}

function StatusPill({
  good,
  goodText,
  badText,
}: {
  good: boolean;
  goodText: string;
  badText: string;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-3 py-1 text-xs font-black ring-1",
        good
          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
          : "bg-red-50 text-red-700 ring-red-200",
      ].join(" ")}
    >
      {good ? goodText : badText}
    </span>
  );
}

function StatCard({
  title,
  value,
  helper,
  icon,
}: {
  title: string;
  value: string;
  helper: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      {icon}
      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>
      <h2 className="mt-1 text-2xl font-black text-slate-950">{value}</h2>
      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-bold text-slate-500">
      {text}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-500">
      {children}
    </th>
  );
}

function Td({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-slate-600">
      {children}
    </td>
  );
}
