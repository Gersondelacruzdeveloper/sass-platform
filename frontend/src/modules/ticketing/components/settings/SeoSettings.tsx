import { Search } from "lucide-react";
import {
  FormInput,
  FormTextarea,
  SectionCard,
  ToggleCard,
} from "./common/settings-common-components";

export type TicketingPublicSiteSeoSettings = {
  seo_title: string;
  meta_description: string;
  canonical_url: string;
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

export default function SeoSettings({ publicSite, onChange }: Props) {
  return (
    <SectionCard
      title="SEO and AI discoverability"
      description="This controls the main public site. Individual products such as Saona, Catalina, transfers, events and tickets will have their own SEO fields in Products."
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
