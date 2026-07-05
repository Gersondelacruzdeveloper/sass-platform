import { Globe2 } from "lucide-react";

import {
  FormInput,
  FormTextarea,
  SectionCard,
  ToggleCard,
} from "./common/settings-common-components";

export type TicketingPublicWebsiteSettings = {
  site_title: string;
  public_description: string;
  public_email: string;
  public_whatsapp: string;
  subdomain: string;
  custom_domain: string;

  hero_title: string;
  hero_subtitle: string;

  primary_cta_label: string;
  secondary_cta_label: string;
  whatsapp_cta_label: string;

  show_reviews: boolean;
  show_public_rankings: boolean;
  show_seller_public_pages: boolean;
  is_published: boolean;
};

type PublicWebsiteSettingsProps = {
  publicSite: TicketingPublicWebsiteSettings;
  onChange: <K extends keyof TicketingPublicWebsiteSettings>(
    field: K,
    value: TicketingPublicWebsiteSettings[K]
  ) => void;
};

export default function PublicWebsiteSettings({
  publicSite,
  onChange,
}: PublicWebsiteSettingsProps) {
  return (
    <SectionCard
      title="Public booking website"
      description="This is the customer-facing booking site. It controls the company page, not the individual product pages."
      icon={Globe2}
      className="xl:col-span-2"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <FormInput
          label="Public site title"
          value={publicSite.site_title || ""}
          onChange={(value) => onChange("site_title", value)}
          placeholder="Punta Cana Experiences"
        />

        <FormInput
          label="Public email"
          value={publicSite.public_email || ""}
          onChange={(value) => onChange("public_email", value)}
          placeholder="sales@example.com"
        />

        <FormInput
          label="Public WhatsApp"
          value={publicSite.public_whatsapp || ""}
          onChange={(value) => onChange("public_whatsapp", value)}
          placeholder="+1 829 000 0000"
        />

        <FormInput
          label="Subdomain"
          value={publicSite.subdomain || ""}
          onChange={(value) => onChange("subdomain", value)}
          placeholder="my-company"
        />

        <FormInput
          label="Custom domain"
          value={publicSite.custom_domain || ""}
          onChange={(value) => onChange("custom_domain", value)}
          placeholder="experiences.example.com"
        />

        <FormTextarea
          label="Public business description"
          value={publicSite.public_description || ""}
          onChange={(value) => onChange("public_description", value)}
          placeholder="Describe the company and the kind of experiences it sells..."
        />

        <FormInput
          label="Hero title"
          value={publicSite.hero_title || ""}
          onChange={(value) => onChange("hero_title", value)}
          placeholder="Discover Punta Cana Experiences"
        />

        <FormTextarea
          label="Hero subtitle"
          value={publicSite.hero_subtitle || ""}
          onChange={(value) => onChange("hero_subtitle", value)}
          placeholder="Book excursions, transfers, tickets and events..."
        />

        <FormInput
          label="Primary CTA label"
          value={publicSite.primary_cta_label || ""}
          onChange={(value) => onChange("primary_cta_label", value)}
          placeholder="Explore Experiences"
        />

        <FormInput
          label="Secondary CTA label"
          value={publicSite.secondary_cta_label || ""}
          onChange={(value) => onChange("secondary_cta_label", value)}
          placeholder="Book Transfers"
        />

        <FormInput
          label="WhatsApp CTA label"
          value={publicSite.whatsapp_cta_label || ""}
          onChange={(value) => onChange("whatsapp_cta_label", value)}
          placeholder="Chat via WhatsApp"
        />

        <ToggleCard
          label="Publish public site"
          description="Make the customer-facing booking website visible online."
          checked={Boolean(publicSite.is_published)}
          onChange={(value) => onChange("is_published", value)}
        />

        <ToggleCard
          label="Show reviews"
          description="Show approved product reviews publicly."
          checked={Boolean(publicSite.show_reviews)}
          onChange={(value) => onChange("show_reviews", value)}
        />

        <ToggleCard
          label="Show public rankings"
          description="Show featured, top excursions, best sellers or recommended experiences."
          checked={Boolean(publicSite.show_public_rankings)}
          onChange={(value) => onChange("show_public_rankings", value)}
        />

        <ToggleCard
          label="Show seller public pages"
          description="Allow public seller links/pages when the seller module is configured."
          checked={Boolean(publicSite.show_seller_public_pages)}
          onChange={(value) => onChange("show_seller_public_pages", value)}
        />
      </div>
    </SectionCard>
  );
}
