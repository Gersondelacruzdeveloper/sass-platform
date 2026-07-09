import { Search } from "lucide-react";
import {
  FormInput,
  FormSelect,
  FormTextarea,
  SectionCard,
  ToggleCard,
} from "./common/settings-common-components";

export type TicketingPublicSiteSeoSettings = {
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
};

type Props = {
  publicSite: TicketingPublicSiteSeoSettings;
  onChange: <K extends keyof TicketingPublicSiteSeoSettings>(
    field: K,
    value: TicketingPublicSiteSeoSettings[K]
  ) => void;
};

const PRODUCT_URL_PATTERN_OPTIONS = [
  { value: "/product/{slug}", label: "/product/{slug}" },
  { value: "/products/{slug}", label: "/products/{slug}" },
  { value: "/tour/{slug}", label: "/tour/{slug}" },
  { value: "/tours/{slug}", label: "/tours/{slug}" },
  { value: "/excursion/{slug}", label: "/excursion/{slug}" },
  { value: "/excursions/{slug}", label: "/excursions/{slug}" },
  { value: "/excursions/detail/{slug}", label: "/excursions/detail/{slug} - Legacy" },
  { value: "/activity/{slug}", label: "/activity/{slug}" },
  { value: "/activities/{slug}", label: "/activities/{slug}" },
  { value: "/experience/{slug}", label: "/experience/{slug}" },
  { value: "/experiences/{slug}", label: "/experiences/{slug}" },
  { value: "custom", label: "Custom pattern" },
];

function buildPreviewUrl(publicSite: TicketingPublicSiteSeoSettings) {
  const base = (publicSite.canonical_url || "https://your-domain.com").replace(/\/$/, "");
  const rawPattern =
    publicSite.product_url_pattern === "custom"
      ? publicSite.custom_product_url_pattern
      : publicSite.product_url_pattern;

  const pattern = rawPattern && rawPattern.includes("{slug}") ? rawPattern : "/product/{slug}";
  const path = pattern.startsWith("/") ? pattern : `/${pattern}`;

  return `${base}${path.replace("{slug}", "saona-island")}`;
}

export default function SeoSettings({ publicSite, onChange }: Props) {
  const productUrlPreview = buildPreviewUrl(publicSite);

  return (
    <SectionCard
      title="SEO and AI discoverability"
      description="Control Google indexing, AI crawler access, product URL structure, and migration-friendly redirects."
      icon={Search}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormInput
          label="SEO title"
          value={publicSite.seo_title}
          onChange={(value) => onChange("seo_title", value)}
          placeholder="Best Tours, Tickets and Transfers in Punta Cana"
        />

        <FormInput
          label="Canonical URL"
          value={publicSite.canonical_url}
          onChange={(value) => onChange("canonical_url", value)}
          placeholder="https://experiences.example.com"
        />

        <FormTextarea
          label="Meta description"
          value={publicSite.meta_description}
          onChange={(value) => onChange("meta_description", value)}
          placeholder="Book excursions, transfers, events and tickets..."
        />

        <FormTextarea
          label="Open Graph description"
          value={publicSite.og_description}
          onChange={(value) => onChange("og_description", value)}
          placeholder="Description used when the site is shared."
        />

        <FormInput
          label="Open Graph title"
          value={publicSite.og_title}
          onChange={(value) => onChange("og_title", value)}
          placeholder="PCD Experiences"
        />

        <div className="grid gap-3">
          <ToggleCard
            label="Allow public indexing"
            description="Allow public pages to appear in Google and other search engines."
            checked={publicSite.robots_allow_indexing}
            onChange={(value) => onChange("robots_allow_indexing", value)}
          />

          <ToggleCard
            label="Allow AI crawlers"
            description="Allow AI search/answer crawlers when the owner wants AI discoverability."
            checked={publicSite.robots_allow_ai_crawlers}
            onChange={(value) => onChange("robots_allow_ai_crawlers", value)}
          />

          <ToggleCard
            label="Allow GPTBot"
            description="Allow OpenAI GPTBot if AI crawlers are enabled."
            checked={publicSite.allow_gptbot}
            onChange={(value) => onChange("allow_gptbot", value)}
          />

          <ToggleCard
            label="Allow OAI-SearchBot"
            description="Allow OpenAI search crawler if AI crawlers are enabled."
            checked={publicSite.allow_oai_searchbot}
            onChange={(value) => onChange("allow_oai_searchbot", value)}
          />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-900">URL Structure & Migration</p>
        <p className="mt-1 text-sm text-slate-500">
          Use this to preserve existing Google rankings when customers migrate from another website.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <FormSelect
            label="Product URL pattern"
            value={publicSite.product_url_pattern || "/product/{slug}"}
            onChange={(value) => onChange("product_url_pattern", value)}
            options={PRODUCT_URL_PATTERN_OPTIONS}
          />

          {publicSite.product_url_pattern === "custom" && (
            <FormInput
              label="Custom product URL pattern"
              value={publicSite.custom_product_url_pattern}
              onChange={(value) => onChange("custom_product_url_pattern", value)}
              placeholder="/things-to-do/{slug}"
            />
          )}

          <ToggleCard
            label="Preserve imported product URLs"
            description="Keep old product URLs available during migrations."
            checked={publicSite.preserve_imported_product_urls}
            onChange={(value) => onChange("preserve_imported_product_urls", value)}
          />

          <ToggleCard
            label="Automatically create 301 redirects"
            description="When product URLs change, redirect old URLs to the new canonical URL."
            checked={publicSite.auto_create_product_redirects}
            onChange={(value) => onChange("auto_create_product_redirects", value)}
          />
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">
            Example product URL
          </p>
          <p className="mt-1 break-all text-sm font-bold text-slate-900">
            {productUrlPreview}
          </p>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-sm font-black text-emerald-900">SEO Preview</p>

        <p className="mt-3 text-lg font-bold text-blue-700">
          {publicSite.seo_title || publicSite.og_title || "Your Page Title"}
        </p>

        <p className="break-all text-xs text-emerald-700">
          {publicSite.canonical_url || "https://your-domain.com"}
        </p>

        <p className="mt-2 text-sm text-slate-700">
          {publicSite.meta_description ||
            publicSite.og_description ||
            "Your meta description will appear here."}
        </p>
      </div>
    </SectionCard>
  );
}