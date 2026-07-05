import { Image, Palette, Upload } from "lucide-react";

export type TicketingPublicSiteSettings = {
  id?: number;
  organisation_name?: string;
  site_title: string;
  display_title?: string;
  public_description: string;
  public_email: string;
  public_whatsapp: string;
  subdomain: string;
  custom_domain: string;

  logo?: string | null;
  logo_url?: string | null;
  favicon?: string | null;
  favicon_url?: string | null;
  hero_title: string;
  hero_subtitle: string;
  hero_media_type: "image" | "video";
  hero_image?: string | null;
  hero_image_url?: string | null;
  hero_video?: string | null;
  hero_video_file_url?: string | null;
  hero_video_url: string;
  hero_video_poster?: string | null;
  hero_video_poster_url?: string | null;
  hero_overlay_opacity: string;
  og_image?: string | null;
  og_image_url?: string | null;

  primary_color: string;
  secondary_color: string;
  accent_color: string;
  background_color: string;
  button_color: string;
  text_color: string;
  muted_text_color: string;
  card_background_color: string;

  homepage_layout_style: "marketplace" | "luxury" | "minimal" | "adventure";
  trust_badges: string[];

  show_category_grid: boolean;
  show_trust_badges: boolean;
  show_excursions_section: boolean;
  show_transfers_section: boolean;
  show_tickets_section: boolean;
  show_events_section: boolean;
  show_nightlife_section: boolean;
  show_packages_section: boolean;
  show_ai_assistant_section: boolean;
  show_final_cta_section: boolean;

  excursions_section_title: string;
  excursions_section_subtitle: string;
  transfers_section_title: string;
  transfers_section_subtitle: string;
  tickets_section_title: string;
  tickets_section_subtitle: string;
  events_section_title: string;
  events_section_subtitle: string;
  nightlife_section_title: string;
  nightlife_section_subtitle: string;
  packages_section_title: string;
  packages_section_subtitle: string;
  ai_assistant_title: string;
  ai_assistant_subtitle: string;
  final_cta_title: string;
  final_cta_subtitle: string;

  primary_cta_label: string;
  secondary_cta_label: string;
  whatsapp_cta_label: string;

  seo_title: string;
  meta_description: string;
  canonical_url: string;
  og_title: string;
  og_description: string;

  robots_allow_indexing: boolean;
  robots_allow_ai_crawlers: boolean;
  allow_gptbot: boolean;
  allow_oai_searchbot: boolean;

  show_public_rankings: boolean;
  show_seller_public_pages: boolean;
  show_reviews: boolean;
  is_published: boolean;
};

type Props = {
  publicSite: TicketingPublicSiteSettings;
  heroImageFile: File | null;
  ogImageFile: File | null;
  onChange: <K extends keyof TicketingPublicSiteSettings>(
    field: K,
    value: TicketingPublicSiteSettings[K]
  ) => void;
  onHeroImageFileChange: (file: File | null) => void;
  onOgImageFileChange: (file: File | null) => void;
};

export default function PublicSiteThemeSettings({
  publicSite,
  heroImageFile,
  ogImageFile,
  onChange,
  onHeroImageFileChange,
  onOgImageFileChange,
}: Props) {
  return (
    <Panel
      title="Public site images and theme"
      description="These are for the public booking website. The main logo and favicon stay in App Branding above."
      icon={Palette}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <ColorInput
          label="Site primary color"
          value={publicSite.primary_color}
          onChange={(value) => onChange("primary_color", value)}
        />

        <ColorInput
          label="Site secondary color"
          value={publicSite.secondary_color}
          onChange={(value) => onChange("secondary_color", value)}
        />

        <ColorInput
          label="Site accent color"
          value={publicSite.accent_color}
          onChange={(value) => onChange("accent_color", value)}
        />

        <ColorInput
          label="Site background"
          value={publicSite.background_color}
          onChange={(value) => onChange("background_color", value)}
        />

        <ColorInput
          label="Button color"
          value={publicSite.button_color}
          onChange={(value) => onChange("button_color", value)}
        />

        <ColorInput
          label="Text color"
          value={publicSite.text_color}
          onChange={(value) => onChange("text_color", value)}
        />

        <ColorInput
          label="Muted text"
          value={publicSite.muted_text_color}
          onChange={(value) => onChange("muted_text_color", value)}
        />

        <ColorInput
          label="Card background"
          value={publicSite.card_background_color}
          onChange={(value) => onChange("card_background_color", value)}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FileInput
          label="Hero image"
          description="Large image used on the public landing page."
          currentUrl={publicSite.hero_image_url || publicSite.hero_image}
          selectedFile={heroImageFile}
          onChange={onHeroImageFileChange}
        />

        <FileInput
          label="Open Graph image"
          description="Image used when sharing the public site on social media."
          currentUrl={publicSite.og_image_url || publicSite.og_image}
          selectedFile={ogImageFile}
          onChange={onOgImageFileChange}
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <AssetPreview
          title="Hero"
          helper="Landing page image"
          url={publicSite.hero_image_url || publicSite.hero_image}
        />

        <AssetPreview
          title="Social image"
          helper="Open Graph preview"
          url={publicSite.og_image_url || publicSite.og_image}
        />
      </div>
    </Panel>
  );
}

type PanelProps = {
  title: string;
  description?: string;
  icon: typeof Palette;
  className?: string;
  children: React.ReactNode;
};

function Panel({ title, description, icon: Icon, className = "", children }: PanelProps) {
  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          {description && (
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              {description}
            </p>
          )}
        </div>
      </div>

      {children}
    </section>
  );
}

type ColorInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

function ColorInput({ label, value, onChange }: ColorInputProps) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-wide text-slate-500">
        {label}
      </span>

      <div className="mt-2 flex h-12 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(event) => onChange(event.target.value)}
          className="h-full w-14 cursor-pointer border-0 bg-transparent p-1"
        />

        <input
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 border-0 px-3 text-sm font-bold text-slate-700 outline-none"
          placeholder="#111827"
        />
      </div>
    </label>
  );
}

type FileInputProps = {
  label: string;
  description?: string;
  currentUrl?: string | null;
  selectedFile: File | null;
  onChange: (file: File | null) => void;
};

function FileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: FileInputProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-slate-900">{label}</p>
          {description && (
            <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
              {description}
            </p>
          )}
        </div>

        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-500">
          <Upload className="h-4 w-4" />
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm font-black text-slate-600 transition hover:bg-slate-50">
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
        />
        Choose image
      </label>

      {selectedFile && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
          Selected: {selectedFile.name}
        </div>
      )}

      {!selectedFile && currentUrl && (
        <div className="mt-3 break-all rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
          Current image saved.
        </div>
      )}
    </div>
  );
}

type AssetPreviewProps = {
  title: string;
  helper: string;
  url?: string | null;
};

function AssetPreview({ title, helper, url }: AssetPreviewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <p className="text-sm font-black text-slate-900">{title}</p>
          <p className="text-xs font-semibold text-slate-500">{helper}</p>
        </div>

        <Image className="h-4 w-4 text-slate-400" />
      </div>

      {url ? (
        <img
          src={url}
          alt={title}
          className="h-56 w-full object-cover"
        />
      ) : (
        <div className="flex h-56 items-center justify-center px-6 text-center text-sm font-bold text-slate-400">
          No image uploaded yet.
        </div>
      )}
    </div>
  );
}
