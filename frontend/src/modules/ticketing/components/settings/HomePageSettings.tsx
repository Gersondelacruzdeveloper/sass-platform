import { Video } from "lucide-react";
import {
  FormInput,
  FormSelect,
  FormTextarea,
  SectionCard,
  ToggleCard,
} from "./common/settings-common-components";

export type TicketingPublicSiteSettings = {
  hero_media_type: "image" | "video";
  hero_video?: string | null;
  hero_video_file_url?: string | null;
  hero_video_url: string;
  hero_video_poster?: string | null;
  hero_video_poster_url?: string | null;
  hero_overlay_opacity: string;

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
};

type Props = {
  publicSite: TicketingPublicSiteSettings;
  trustBadgesText: string;
  heroVideoFile: File | null;
  heroVideoPosterFile: File | null;
  onChange: <K extends keyof TicketingPublicSiteSettings>(
    field: K,
    value: TicketingPublicSiteSettings[K]
  ) => void;
  onTrustBadgesTextChange: (value: string) => void;
  onHeroVideoFileChange: (file: File | null) => void;
  onHeroVideoPosterFileChange: (file: File | null) => void;
};

export default function HomePageSettings({
  publicSite,
  trustBadgesText,
  heroVideoFile,
  heroVideoPosterFile,
  onChange,
  onTrustBadgesTextChange,
  onHeroVideoFileChange,
  onHeroVideoPosterFileChange,
}: Props) {
  return (
    <SectionCard
      title="Homepage video, layout and sections"
      description="Customize the public home page like a real travel marketplace: hero video/image, layout style, badges and visible sections."
      icon={Video}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormSelect
          label="Hero media"
          value={publicSite.hero_media_type}
          onChange={(value) =>
            onChange("hero_media_type", value === "video" ? "video" : "image")
          }
          options={[
            { value: "image", label: "Hero image" },
            { value: "video", label: "Hero video" },
          ]}
        />

        <FormSelect
          label="Homepage layout"
          value={publicSite.homepage_layout_style}
          onChange={(value) =>
            onChange(
              "homepage_layout_style",
              value as TicketingPublicSiteSettings["homepage_layout_style"]
            )
          }
          options={[
            { value: "marketplace", label: "Marketplace" },
            { value: "luxury", label: "Luxury" },
            { value: "minimal", label: "Minimal" },
            { value: "adventure", label: "Adventure" },
          ]}
        />

        <FormInput
          label="External hero video URL"
          value={publicSite.hero_video_url}
          onChange={(value) => onChange("hero_video_url", value)}
          placeholder="https://cdn.example.com/hero.mp4"
        />

        <FormInput
          label="Hero overlay opacity"
          type="number"
          min="0"
          step="0.05"
          value={publicSite.hero_overlay_opacity}
          onChange={(value) => onChange("hero_overlay_opacity", value)}
          placeholder="0.45"
        />

        <FormTextarea
          label="Trust badges"
          value={trustBadgesText}
          onChange={onTrustBadgesTextChange}
          placeholder={"Trusted local operators\nHotel pickup available\nSecure reservations"}
        />

        <div className="grid gap-3">
          <VideoFileInput
            label="Hero video upload"
            description="Optional MP4/WebM video shown in the home hero."
            currentUrl={publicSite.hero_video_file_url || publicSite.hero_video}
            selectedFile={heroVideoFile}
            onChange={onHeroVideoFileChange}
          />

          <ImageFileInput
            label="Hero video poster"
            description="Image shown before the video loads."
            currentUrl={
              publicSite.hero_video_poster_url || publicSite.hero_video_poster
            }
            selectedFile={heroVideoPosterFile}
            onChange={onHeroVideoPosterFileChange}
          />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <ToggleCard
          label="Category grid"
          checked={publicSite.show_category_grid}
          onChange={(value) => onChange("show_category_grid", value)}
        />

        <ToggleCard
          label="Trust badges"
          checked={publicSite.show_trust_badges}
          onChange={(value) => onChange("show_trust_badges", value)}
        />

        <ToggleCard
          label="Excursions section"
          checked={publicSite.show_excursions_section}
          onChange={(value) => onChange("show_excursions_section", value)}
        />

        <ToggleCard
          label="Transfers section"
          checked={publicSite.show_transfers_section}
          onChange={(value) => onChange("show_transfers_section", value)}
        />

        <ToggleCard
          label="Tickets section"
          checked={publicSite.show_tickets_section}
          onChange={(value) => onChange("show_tickets_section", value)}
        />

        <ToggleCard
          label="Events section"
          checked={publicSite.show_events_section}
          onChange={(value) => onChange("show_events_section", value)}
        />

        <ToggleCard
          label="Nightlife section"
          checked={publicSite.show_nightlife_section}
          onChange={(value) => onChange("show_nightlife_section", value)}
        />

        <ToggleCard
          label="Packages section"
          checked={publicSite.show_packages_section}
          onChange={(value) => onChange("show_packages_section", value)}
        />

        <ToggleCard
          label="AI assistant section"
          checked={publicSite.show_ai_assistant_section}
          onChange={(value) => onChange("show_ai_assistant_section", value)}
        />

        <ToggleCard
          label="Final CTA section"
          checked={publicSite.show_final_cta_section}
          onChange={(value) => onChange("show_final_cta_section", value)}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <FormInput
          label="Excursions title"
          value={publicSite.excursions_section_title}
          onChange={(value) => onChange("excursions_section_title", value)}
        />

        <FormInput
          label="Excursions subtitle"
          value={publicSite.excursions_section_subtitle}
          onChange={(value) => onChange("excursions_section_subtitle", value)}
        />

        <FormInput
          label="Transfers title"
          value={publicSite.transfers_section_title}
          onChange={(value) => onChange("transfers_section_title", value)}
        />

        <FormInput
          label="Transfers subtitle"
          value={publicSite.transfers_section_subtitle}
          onChange={(value) => onChange("transfers_section_subtitle", value)}
        />

        <FormInput
          label="Tickets title"
          value={publicSite.tickets_section_title}
          onChange={(value) => onChange("tickets_section_title", value)}
        />

        <FormInput
          label="Tickets subtitle"
          value={publicSite.tickets_section_subtitle}
          onChange={(value) => onChange("tickets_section_subtitle", value)}
        />

        <FormInput
          label="Events title"
          value={publicSite.events_section_title}
          onChange={(value) => onChange("events_section_title", value)}
        />

        <FormInput
          label="Events subtitle"
          value={publicSite.events_section_subtitle}
          onChange={(value) => onChange("events_section_subtitle", value)}
        />

        <FormInput
          label="Nightlife title"
          value={publicSite.nightlife_section_title}
          onChange={(value) => onChange("nightlife_section_title", value)}
        />

        <FormInput
          label="Nightlife subtitle"
          value={publicSite.nightlife_section_subtitle}
          onChange={(value) => onChange("nightlife_section_subtitle", value)}
        />

        <FormInput
          label="Packages title"
          value={publicSite.packages_section_title}
          onChange={(value) => onChange("packages_section_title", value)}
        />

        <FormInput
          label="Packages subtitle"
          value={publicSite.packages_section_subtitle}
          onChange={(value) => onChange("packages_section_subtitle", value)}
        />

        <FormInput
          label="AI assistant title"
          value={publicSite.ai_assistant_title}
          onChange={(value) => onChange("ai_assistant_title", value)}
        />

        <FormInput
          label="AI assistant subtitle"
          value={publicSite.ai_assistant_subtitle}
          onChange={(value) => onChange("ai_assistant_subtitle", value)}
        />

        <FormInput
          label="Final CTA title"
          value={publicSite.final_cta_title}
          onChange={(value) => onChange("final_cta_title", value)}
        />

        <FormInput
          label="Final CTA subtitle"
          value={publicSite.final_cta_subtitle}
          onChange={(value) => onChange("final_cta_subtitle", value)}
        />
      </div>
    </SectionCard>
  );
}

type FileInputProps = {
  label: string;
  description?: string;
  currentUrl?: string | null;
  selectedFile: File | null;
  onChange: (file: File | null) => void;
};

function ImageFileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: FileInputProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-900">{label}</p>

      {description && (
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          {description}
        </p>
      )}

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
          Current file saved.
        </div>
      )}
    </div>
  );
}

function VideoFileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: FileInputProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-900">{label}</p>

      {description && (
        <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
          {description}
        </p>
      )}

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center text-sm font-black text-slate-600 transition hover:bg-slate-50">
        <input
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(event) => onChange(event.target.files?.[0] || null)}
        />
        Choose video
      </label>

      {selectedFile && (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
          Selected: {selectedFile.name}
        </div>
      )}

      {!selectedFile && currentUrl && (
        <div className="mt-3 break-all rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-500">
          Current file saved.
        </div>
      )}
    </div>
  );
}
