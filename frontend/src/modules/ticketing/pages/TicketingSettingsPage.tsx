// src/modules/ticketing/pages/TicketingSettingsPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { useParams } from "react-router-dom";
import {
  AlertCircle,
  Banknote,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  Download,
  Globe2,
  Image,
  Info,
  Loader2,
  Palette,
  Percent,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  Upload,
  Video,
} from "lucide-react";

import api from "../../../api/axios";

type OrganisationBranding = {
  id?: number;
  organisation?: number;

  company_name: string;
  platform_name: string;

  logo?: string | null;
  logo_url?: string | null;

  favicon?: string | null;
  favicon_url?: string | null;
  app_icon_192?: string | null;
  app_icon_192_url?: string | null;
  app_icon_512?: string | null;
  app_icon_512_url?: string | null;
  maskable_icon?: string | null;
  maskable_icon_url?: string | null;

  app_short_name: string;
  app_description: string;

  primary_color: string;
  secondary_color: string;
  accent_color: string;
  theme_color: string;
  background_color: string;

  login_title: string;
  login_subtitle: string;
};

type TicketingSettings = {
  id?: number;
  organisation_name?: string;
  module_name: string;
  public_brand_name: string;
  currency_symbol: string;
  default_currency: string;
  supported_currencies: string[];
  tax_percentage: string;
  default_deposit_percentage: string;
  allow_public_bookings: boolean;
  allow_seller_bookings: boolean;
  allow_full_payment: boolean;
  allow_deposit_payment: boolean;
  allow_pending_payment: boolean;
  allow_cash_to_seller: boolean;
  allow_manual_bank_transfer: boolean;
  allow_mixed_payments: boolean;
  send_customer_email: boolean;
  send_customer_whatsapp: boolean;
  notify_owner_on_booking: boolean;
  require_supervisor_approval_for_unpaid_tickets: boolean;
  wellet_enabled?: boolean;
  is_active: boolean;
};

type TicketingPublicSiteSettings = {
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

const initialBranding: OrganisationBranding = {
  company_name: "",
  platform_name: "",

  logo: null,
  logo_url: null,

  favicon: null,
  favicon_url: null,
  app_icon_192: null,
  app_icon_192_url: null,
  app_icon_512: null,
  app_icon_512_url: null,
  maskable_icon: null,
  maskable_icon_url: null,

  app_short_name: "",
  app_description: "",

  primary_color: "#111827",
  secondary_color: "#6B7280",
  accent_color: "#F59E0B",
  theme_color: "#111827",
  background_color: "#ffffff",

  login_title: "",
  login_subtitle: "",
};

const initialSettings: TicketingSettings = {
  module_name: "Tours, Tickets & Transfers",
  public_brand_name: "PCD Experiences",
  currency_symbol: "US$",
  default_currency: "USD",
  supported_currencies: [],
  tax_percentage: "0.00",
  default_deposit_percentage: "0.00",
  allow_public_bookings: true,
  allow_seller_bookings: true,
  allow_full_payment: true,
  allow_deposit_payment: true,
  allow_pending_payment: true,
  allow_cash_to_seller: true,
  allow_manual_bank_transfer: true,
  allow_mixed_payments: true,
  send_customer_email: false,
  send_customer_whatsapp: false,
  notify_owner_on_booking: true,
  require_supervisor_approval_for_unpaid_tickets: false,
  wellet_enabled: false,
  is_active: true,
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
  hero_title: "Discover Punta Cana Experiences",
  hero_subtitle: "Book excursions, transfers, tickets, events and unforgettable local experiences.",
  hero_media_type: "image",
  hero_image: null,
  hero_image_url: null,
  hero_video: null,
  hero_video_file_url: null,
  hero_video_url: "",
  hero_video_poster: null,
  hero_video_poster_url: null,
  hero_overlay_opacity: "0.45",
  og_image: null,
  og_image_url: null,

  primary_color: "#111827",
  secondary_color: "#6B7280",
  accent_color: "#F59E0B",
  background_color: "#FFFFFF",
  button_color: "#111827",
  text_color: "#111827",
  muted_text_color: "#6B7280",
  card_background_color: "#FFFFFF",

  homepage_layout_style: "marketplace",
  trust_badges: [
    "Trusted local operators",
    "Hotel pickup available",
    "Secure reservation",
  ],

  show_category_grid: true,
  show_trust_badges: true,
  show_excursions_section: true,
  show_transfers_section: true,
  show_tickets_section: true,
  show_events_section: true,
  show_nightlife_section: true,
  show_packages_section: true,
  show_ai_assistant_section: true,
  show_final_cta_section: true,

  excursions_section_title: "Top Experiences in Punta Cana",
  excursions_section_subtitle: "Handpicked adventures you’ll never forget.",
  transfers_section_title: "Transfers",
  transfers_section_subtitle: "Private, reliable rides — airport, hotels and long distance.",
  tickets_section_title: "Tickets & Attractions",
  tickets_section_subtitle: "Book tickets and attractions with secure reservation options.",
  events_section_title: "Events",
  events_section_subtitle: "Discover local events, shows and limited-date experiences.",
  nightlife_section_title: "Nightlife",
  nightlife_section_subtitle: "Nightlife tickets, premium experiences and evening activities.",
  packages_section_title: "Packages & Deals",
  packages_section_subtitle: "Bundles with better prices — VIP, family and adventure packages.",
  ai_assistant_title: "Meet Your Travel Assistant 🌴",
  ai_assistant_subtitle: "Ask anything — best experiences, pickup from your hotel, or quick recommendations.",
  final_cta_title: "Ready to Start Your Adventure?",
  final_cta_subtitle: "Punta Cana Discovery makes booking simple, fast, and secure.",

  primary_cta_label: "Explore Experiences",
  secondary_cta_label: "Book Transfers",
  whatsapp_cta_label: "Chat via WhatsApp",

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

function normalizeText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function normalizeBoolean(value: unknown, fallback = false) {
  if (typeof value === "boolean") return value;
  return fallback;
}

function normalizeArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function parseSupportedCurrencies(value: string) {
  return value
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function parseTextLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isVideoFile(file: File) {
  return file.type.startsWith("video/");
}

function formatPercent(value: string) {
  const number = Number(value || 0);
  if (Number.isNaN(number)) return "0%";
  return `${number}%`;
}

function formatExampleAmount(symbol: string, amount: number) {
  return `${symbol || "US$"} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isImageFile(file: File) {
  return file.type.startsWith("image/");
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function compressImageFile(file: File, maxWidth = 1600, quality = 0.86) {
  if (!isImageFile(file)) return file;

  try {
    const imageBitmap = await createImageBitmap(file);

    const scale = Math.min(1, maxWidth / imageBitmap.width);
    const width = Math.round(imageBitmap.width * scale);
    const height = Math.round(imageBitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) return file;

    context.drawImage(imageBitmap, 0, 0, width, height);

    const outputType =
      file.type === "image/png" || file.type === "image/webp"
        ? file.type
        : "image/jpeg";

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, outputType, quality);
    });

    if (!blob) return file;

    const extension =
      outputType === "image/png"
        ? ".png"
        : outputType === "image/webp"
          ? ".webp"
          : ".jpg";

    const safeName = file.name.replace(/\.[^.]+$/, extension);

    return new File([blob], safeName, {
      type: outputType,
      lastModified: Date.now(),
    });
  } catch (error) {
    console.warn("Image compression failed, uploading original file.", error);
    return file;
  }
}

function appendText(formData: FormData, key: string, value: unknown) {
  formData.append(key, normalizeText(value));
}

function appendBoolean(formData: FormData, key: string, value: boolean) {
  formData.append(key, value ? "true" : "false");
}

function getApiBaseUrl() {
  return String(api.defaults.baseURL || "").replace(/\/$/, "");
}

function buildManifestUrl(organisationSlug?: string) {
  if (!organisationSlug) return "";
  return `${getApiBaseUrl()}/organisations/public-manifest/ticketing/${organisationSlug}/manifest.json`;
}

export default function TicketingSettingsPage() {
  const { organisationSlug } = useParams<{ organisationSlug: string }>();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [error, setError] = useState("");
  const [savedMessage, setSavedMessage] = useState("");

  const [branding, setBranding] = useState<OrganisationBranding>(initialBranding);
  const [settings, setSettings] = useState<TicketingSettings>(initialSettings);
  const [publicSite, setPublicSite] =
    useState<TicketingPublicSiteSettings>(initialPublicSite);

  const [supportedCurrenciesText, setSupportedCurrenciesText] = useState("");
  const [trustBadgesText, setTrustBadgesText] = useState(
    normalizeArray(initialPublicSite.trust_badges).join("\n")
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [heroImageFile, setHeroImageFile] = useState<File | null>(null);
  const [heroVideoFile, setHeroVideoFile] = useState<File | null>(null);
  const [heroVideoPosterFile, setHeroVideoPosterFile] = useState<File | null>(
    null
  );
  const [ogImageFile, setOgImageFile] = useState<File | null>(null);

  const requestParams = useMemo(
    () => ({
      organisation_slug: organisationSlug,
    }),
    [organisationSlug]
  );

  const manifestUrl = useMemo(
    () => buildManifestUrl(organisationSlug),
    [organisationSlug]
  );

  useEffect(() => {
    async function loadSettings() {
      try {
        setLoading(true);
        setError("");

        const [brandingResponse, settingsResponse, publicSiteResponse] =
          await Promise.all([
            api.get<OrganisationBranding>(
              `/organisations/branding/ticketing/${organisationSlug}/`
            ),
            api.get<TicketingSettings>("/ticketing/settings/mine/", {
              params: requestParams,
            }),
            api.get<TicketingPublicSiteSettings>(
              "/ticketing/public-site-settings/mine/",
              {
                params: requestParams,
              }
            ),
          ]);

        const brandingData = brandingResponse.data;
        const settingsData = settingsResponse.data;
        const publicSiteData = publicSiteResponse.data;

        setBranding({
          ...initialBranding,
          ...brandingData,
          company_name: normalizeText(brandingData.company_name),
          platform_name: normalizeText(brandingData.platform_name),
          app_short_name: normalizeText(brandingData.app_short_name),
          app_description: normalizeText(brandingData.app_description),
          primary_color: normalizeText(
            brandingData.primary_color,
            initialBranding.primary_color
          ),
          secondary_color: normalizeText(
            brandingData.secondary_color,
            initialBranding.secondary_color
          ),
          accent_color: normalizeText(
            brandingData.accent_color,
            initialBranding.accent_color
          ),
          theme_color: normalizeText(
            brandingData.theme_color,
            initialBranding.theme_color
          ),
          background_color: normalizeText(
            brandingData.background_color,
            initialBranding.background_color
          ),
          login_title: normalizeText(brandingData.login_title),
          login_subtitle: normalizeText(brandingData.login_subtitle),
        });

        setSettings({
          ...initialSettings,
          ...settingsData,
          module_name: normalizeText(
            settingsData.module_name,
            initialSettings.module_name
          ),
          public_brand_name: normalizeText(
            settingsData.public_brand_name,
            initialSettings.public_brand_name
          ),
          currency_symbol: normalizeText(
            settingsData.currency_symbol,
            initialSettings.currency_symbol
          ),
          default_currency: normalizeText(
            settingsData.default_currency,
            initialSettings.default_currency
          ),
          supported_currencies: normalizeArray(
            settingsData.supported_currencies
          ),
          tax_percentage: normalizeText(
            settingsData.tax_percentage,
            initialSettings.tax_percentage
          ),
          default_deposit_percentage: normalizeText(
            settingsData.default_deposit_percentage,
            initialSettings.default_deposit_percentage
          ),
          allow_public_bookings: normalizeBoolean(
            settingsData.allow_public_bookings,
            true
          ),
          allow_seller_bookings: normalizeBoolean(
            settingsData.allow_seller_bookings,
            true
          ),
          allow_full_payment: normalizeBoolean(
            settingsData.allow_full_payment,
            true
          ),
          allow_deposit_payment: normalizeBoolean(
            settingsData.allow_deposit_payment,
            true
          ),
          allow_pending_payment: normalizeBoolean(
            settingsData.allow_pending_payment,
            true
          ),
          allow_cash_to_seller: normalizeBoolean(
            settingsData.allow_cash_to_seller,
            true
          ),
          allow_manual_bank_transfer: normalizeBoolean(
            settingsData.allow_manual_bank_transfer,
            true
          ),
          allow_mixed_payments: normalizeBoolean(
            settingsData.allow_mixed_payments,
            true
          ),
          send_customer_email: normalizeBoolean(
            settingsData.send_customer_email,
            false
          ),
          send_customer_whatsapp: normalizeBoolean(
            settingsData.send_customer_whatsapp,
            false
          ),
          notify_owner_on_booking: normalizeBoolean(
            settingsData.notify_owner_on_booking,
            true
          ),
          require_supervisor_approval_for_unpaid_tickets: normalizeBoolean(
            settingsData.require_supervisor_approval_for_unpaid_tickets,
            false
          ),
          wellet_enabled: normalizeBoolean(settingsData.wellet_enabled, false),
          is_active: normalizeBoolean(settingsData.is_active, true),
        });

        setSupportedCurrenciesText(
          normalizeArray(settingsData.supported_currencies).join(", ")
        );

        const normalizedTrustBadges = normalizeArray(
          publicSiteData.trust_badges
        );

        setTrustBadgesText(
          normalizedTrustBadges.length
            ? normalizedTrustBadges.join("\n")
            : normalizeArray(initialPublicSite.trust_badges).join("\n")
        );

        setPublicSite({
          ...initialPublicSite,
          ...publicSiteData,
          site_title: normalizeText(publicSiteData.site_title),
          public_description: normalizeText(publicSiteData.public_description),
          public_email: normalizeText(publicSiteData.public_email),
          public_whatsapp: normalizeText(publicSiteData.public_whatsapp),
          subdomain: normalizeText(publicSiteData.subdomain),
          custom_domain: normalizeText(publicSiteData.custom_domain),
          hero_title: normalizeText(
            publicSiteData.hero_title,
            initialPublicSite.hero_title
          ),
          hero_subtitle: normalizeText(
            publicSiteData.hero_subtitle,
            initialPublicSite.hero_subtitle
          ),
          hero_media_type:
            publicSiteData.hero_media_type === "video" ? "video" : "image",
          hero_video_url: normalizeText(publicSiteData.hero_video_url),
          hero_overlay_opacity: normalizeText(
            publicSiteData.hero_overlay_opacity,
            initialPublicSite.hero_overlay_opacity
          ),
          primary_cta_label: normalizeText(
            publicSiteData.primary_cta_label,
            initialPublicSite.primary_cta_label
          ),
          secondary_cta_label: normalizeText(
            publicSiteData.secondary_cta_label,
            initialPublicSite.secondary_cta_label
          ),
          whatsapp_cta_label: normalizeText(
            publicSiteData.whatsapp_cta_label,
            initialPublicSite.whatsapp_cta_label
          ),
          primary_color: normalizeText(
            publicSiteData.primary_color,
            initialPublicSite.primary_color
          ),
          secondary_color: normalizeText(
            publicSiteData.secondary_color,
            initialPublicSite.secondary_color
          ),
          accent_color: normalizeText(
            publicSiteData.accent_color,
            initialPublicSite.accent_color
          ),
          background_color: normalizeText(
            publicSiteData.background_color,
            initialPublicSite.background_color
          ),
          button_color: normalizeText(
            publicSiteData.button_color,
            initialPublicSite.button_color
          ),
          text_color: normalizeText(
            publicSiteData.text_color,
            initialPublicSite.text_color
          ),
          muted_text_color: normalizeText(
            publicSiteData.muted_text_color,
            initialPublicSite.muted_text_color
          ),
          card_background_color: normalizeText(
            publicSiteData.card_background_color,
            initialPublicSite.card_background_color
          ),
          homepage_layout_style:
            publicSiteData.homepage_layout_style || initialPublicSite.homepage_layout_style,
          trust_badges: normalizeArray(publicSiteData.trust_badges),
          show_category_grid: normalizeBoolean(
            publicSiteData.show_category_grid,
            true
          ),
          show_trust_badges: normalizeBoolean(
            publicSiteData.show_trust_badges,
            true
          ),
          show_excursions_section: normalizeBoolean(
            publicSiteData.show_excursions_section,
            true
          ),
          show_transfers_section: normalizeBoolean(
            publicSiteData.show_transfers_section,
            true
          ),
          show_tickets_section: normalizeBoolean(
            publicSiteData.show_tickets_section,
            true
          ),
          show_events_section: normalizeBoolean(
            publicSiteData.show_events_section,
            true
          ),
          show_nightlife_section: normalizeBoolean(
            publicSiteData.show_nightlife_section,
            true
          ),
          show_packages_section: normalizeBoolean(
            publicSiteData.show_packages_section,
            true
          ),
          show_ai_assistant_section: normalizeBoolean(
            publicSiteData.show_ai_assistant_section,
            true
          ),
          show_final_cta_section: normalizeBoolean(
            publicSiteData.show_final_cta_section,
            true
          ),
          excursions_section_title: normalizeText(
            publicSiteData.excursions_section_title,
            initialPublicSite.excursions_section_title
          ),
          excursions_section_subtitle: normalizeText(
            publicSiteData.excursions_section_subtitle,
            initialPublicSite.excursions_section_subtitle
          ),
          transfers_section_title: normalizeText(
            publicSiteData.transfers_section_title,
            initialPublicSite.transfers_section_title
          ),
          transfers_section_subtitle: normalizeText(
            publicSiteData.transfers_section_subtitle,
            initialPublicSite.transfers_section_subtitle
          ),
          tickets_section_title: normalizeText(
            publicSiteData.tickets_section_title,
            initialPublicSite.tickets_section_title
          ),
          tickets_section_subtitle: normalizeText(
            publicSiteData.tickets_section_subtitle,
            initialPublicSite.tickets_section_subtitle
          ),
          events_section_title: normalizeText(
            publicSiteData.events_section_title,
            initialPublicSite.events_section_title
          ),
          events_section_subtitle: normalizeText(
            publicSiteData.events_section_subtitle,
            initialPublicSite.events_section_subtitle
          ),
          nightlife_section_title: normalizeText(
            publicSiteData.nightlife_section_title,
            initialPublicSite.nightlife_section_title
          ),
          nightlife_section_subtitle: normalizeText(
            publicSiteData.nightlife_section_subtitle,
            initialPublicSite.nightlife_section_subtitle
          ),
          packages_section_title: normalizeText(
            publicSiteData.packages_section_title,
            initialPublicSite.packages_section_title
          ),
          packages_section_subtitle: normalizeText(
            publicSiteData.packages_section_subtitle,
            initialPublicSite.packages_section_subtitle
          ),
          ai_assistant_title: normalizeText(
            publicSiteData.ai_assistant_title,
            initialPublicSite.ai_assistant_title
          ),
          ai_assistant_subtitle: normalizeText(
            publicSiteData.ai_assistant_subtitle,
            initialPublicSite.ai_assistant_subtitle
          ),
          final_cta_title: normalizeText(
            publicSiteData.final_cta_title,
            initialPublicSite.final_cta_title
          ),
          final_cta_subtitle: normalizeText(
            publicSiteData.final_cta_subtitle,
            initialPublicSite.final_cta_subtitle
          ),
          seo_title: normalizeText(publicSiteData.seo_title),
          meta_description: normalizeText(publicSiteData.meta_description),
          canonical_url: normalizeText(publicSiteData.canonical_url),
          og_title: normalizeText(publicSiteData.og_title),
          og_description: normalizeText(publicSiteData.og_description),
          robots_allow_indexing: normalizeBoolean(
            publicSiteData.robots_allow_indexing,
            true
          ),
          robots_allow_ai_crawlers: normalizeBoolean(
            publicSiteData.robots_allow_ai_crawlers,
            true
          ),
          allow_gptbot: normalizeBoolean(publicSiteData.allow_gptbot, true),
          allow_oai_searchbot: normalizeBoolean(
            publicSiteData.allow_oai_searchbot,
            true
          ),
          show_public_rankings: normalizeBoolean(
            publicSiteData.show_public_rankings,
            true
          ),
          show_seller_public_pages: normalizeBoolean(
            publicSiteData.show_seller_public_pages,
            true
          ),
          show_reviews: normalizeBoolean(publicSiteData.show_reviews, true),
          is_published: normalizeBoolean(publicSiteData.is_published, false),
        });
      } catch (err: any) {
        console.error("Could not load ticketing settings:", err);

        setError(
          err?.response?.data?.detail ||
            err?.response?.data?.error ||
            err?.response?.data?.message ||
            "No se pudo cargar la configuración de Ticketing."
        );
      } finally {
        setLoading(false);
      }
    }

    if (organisationSlug) {
      loadSettings();
    }
  }, [organisationSlug, requestParams]);

  function updateBrandingField<K extends keyof OrganisationBranding>(
    field: K,
    value: OrganisationBranding[K]
  ) {
    setBranding((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSettingsField<K extends keyof TicketingSettings>(
    field: K,
    value: TicketingSettings[K]
  ) {
    setSettings((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updatePublicSiteField<K extends keyof TicketingPublicSiteSettings>(
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
      setCompressing(false);
      setError("");
      setSavedMessage("");

      const brandingFormData = new FormData();

      appendText(brandingFormData, "company_name", branding.company_name);
      appendText(brandingFormData, "platform_name", branding.platform_name);
      appendText(brandingFormData, "app_short_name", branding.app_short_name);
      appendText(
        brandingFormData,
        "app_description",
        branding.app_description
      );

      appendText(brandingFormData, "primary_color", branding.primary_color);
      appendText(brandingFormData, "secondary_color", branding.secondary_color);
      appendText(brandingFormData, "accent_color", branding.accent_color);
      appendText(brandingFormData, "theme_color", branding.theme_color);
      appendText(
        brandingFormData,
        "background_color",
        branding.background_color
      );

      appendText(brandingFormData, "login_title", branding.login_title);
      appendText(brandingFormData, "login_subtitle", branding.login_subtitle);

      if (logoFile) {
        setCompressing(true);
        brandingFormData.append("logo", await compressImageFile(logoFile));
      }

      const settingsPayload = {
        module_name: settings.module_name,
        public_brand_name: settings.public_brand_name,
        currency_symbol: settings.currency_symbol,
        default_currency: settings.default_currency,
        supported_currencies: parseSupportedCurrencies(supportedCurrenciesText),
        tax_percentage: settings.tax_percentage || "0.00",
        default_deposit_percentage:
          settings.default_deposit_percentage || "0.00",
        allow_public_bookings: settings.allow_public_bookings,
        allow_seller_bookings: settings.allow_seller_bookings,
        allow_full_payment: settings.allow_full_payment,
        allow_deposit_payment: settings.allow_deposit_payment,
        allow_pending_payment: settings.allow_pending_payment,
        allow_cash_to_seller: settings.allow_cash_to_seller,
        allow_manual_bank_transfer: settings.allow_manual_bank_transfer,
        allow_mixed_payments: settings.allow_mixed_payments,
        send_customer_email: settings.send_customer_email,
        send_customer_whatsapp: settings.send_customer_whatsapp,
        notify_owner_on_booking: settings.notify_owner_on_booking,
        require_supervisor_approval_for_unpaid_tickets:
          settings.require_supervisor_approval_for_unpaid_tickets,
        is_active: settings.is_active,

        // Wellet/Coco Bongo is intentionally not sent here.
        // Platform admin controls it from backend/internal tools.
      };

      const publicSiteFormData = new FormData();

      appendText(publicSiteFormData, "site_title", publicSite.site_title);
      appendText(
        publicSiteFormData,
        "public_description",
        publicSite.public_description
      );
      appendText(publicSiteFormData, "public_email", publicSite.public_email);
      appendText(
        publicSiteFormData,
        "public_whatsapp",
        publicSite.public_whatsapp
      );
      appendText(publicSiteFormData, "subdomain", publicSite.subdomain);
      appendText(publicSiteFormData, "custom_domain", publicSite.custom_domain);

      appendText(publicSiteFormData, "hero_title", publicSite.hero_title);
      appendText(publicSiteFormData, "hero_subtitle", publicSite.hero_subtitle);
      appendText(publicSiteFormData, "hero_media_type", publicSite.hero_media_type);
      appendText(publicSiteFormData, "hero_video_url", publicSite.hero_video_url);
      appendText(
        publicSiteFormData,
        "hero_overlay_opacity",
        publicSite.hero_overlay_opacity || "0.45"
      );
      appendText(
        publicSiteFormData,
        "primary_cta_label",
        publicSite.primary_cta_label
      );
      appendText(
        publicSiteFormData,
        "secondary_cta_label",
        publicSite.secondary_cta_label
      );
      appendText(
        publicSiteFormData,
        "whatsapp_cta_label",
        publicSite.whatsapp_cta_label
      );

      appendText(
        publicSiteFormData,
        "primary_color",
        publicSite.primary_color
      );
      appendText(
        publicSiteFormData,
        "secondary_color",
        publicSite.secondary_color
      );
      appendText(publicSiteFormData, "accent_color", publicSite.accent_color);
      appendText(
        publicSiteFormData,
        "background_color",
        publicSite.background_color
      );
      appendText(publicSiteFormData, "button_color", publicSite.button_color);
      appendText(publicSiteFormData, "text_color", publicSite.text_color);
      appendText(
        publicSiteFormData,
        "muted_text_color",
        publicSite.muted_text_color
      );
      appendText(
        publicSiteFormData,
        "card_background_color",
        publicSite.card_background_color
      );
      appendText(
        publicSiteFormData,
        "homepage_layout_style",
        publicSite.homepage_layout_style
      );
      appendText(
        publicSiteFormData,
        "trust_badges",
        JSON.stringify(parseTextLines(trustBadgesText))
      );

      appendText(publicSiteFormData, "excursions_section_title", publicSite.excursions_section_title);
      appendText(publicSiteFormData, "excursions_section_subtitle", publicSite.excursions_section_subtitle);
      appendText(publicSiteFormData, "transfers_section_title", publicSite.transfers_section_title);
      appendText(publicSiteFormData, "transfers_section_subtitle", publicSite.transfers_section_subtitle);
      appendText(publicSiteFormData, "tickets_section_title", publicSite.tickets_section_title);
      appendText(publicSiteFormData, "tickets_section_subtitle", publicSite.tickets_section_subtitle);
      appendText(publicSiteFormData, "events_section_title", publicSite.events_section_title);
      appendText(publicSiteFormData, "events_section_subtitle", publicSite.events_section_subtitle);
      appendText(publicSiteFormData, "nightlife_section_title", publicSite.nightlife_section_title);
      appendText(publicSiteFormData, "nightlife_section_subtitle", publicSite.nightlife_section_subtitle);
      appendText(publicSiteFormData, "packages_section_title", publicSite.packages_section_title);
      appendText(publicSiteFormData, "packages_section_subtitle", publicSite.packages_section_subtitle);
      appendText(publicSiteFormData, "ai_assistant_title", publicSite.ai_assistant_title);
      appendText(publicSiteFormData, "ai_assistant_subtitle", publicSite.ai_assistant_subtitle);
      appendText(publicSiteFormData, "final_cta_title", publicSite.final_cta_title);
      appendText(publicSiteFormData, "final_cta_subtitle", publicSite.final_cta_subtitle);

      appendText(publicSiteFormData, "seo_title", publicSite.seo_title);
      appendText(
        publicSiteFormData,
        "meta_description",
        publicSite.meta_description
      );
      appendText(
        publicSiteFormData,
        "canonical_url",
        publicSite.canonical_url
      );
      appendText(publicSiteFormData, "og_title", publicSite.og_title);
      appendText(
        publicSiteFormData,
        "og_description",
        publicSite.og_description
      );

      appendBoolean(
        publicSiteFormData,
        "robots_allow_indexing",
        publicSite.robots_allow_indexing
      );
      appendBoolean(
        publicSiteFormData,
        "robots_allow_ai_crawlers",
        publicSite.robots_allow_ai_crawlers
      );
      appendBoolean(publicSiteFormData, "allow_gptbot", publicSite.allow_gptbot);
      appendBoolean(
        publicSiteFormData,
        "allow_oai_searchbot",
        publicSite.allow_oai_searchbot
      );
      appendBoolean(
        publicSiteFormData,
        "show_public_rankings",
        publicSite.show_public_rankings
      );
      appendBoolean(
        publicSiteFormData,
        "show_seller_public_pages",
        publicSite.show_seller_public_pages
      );
      appendBoolean(publicSiteFormData, "show_category_grid", publicSite.show_category_grid);
      appendBoolean(publicSiteFormData, "show_trust_badges", publicSite.show_trust_badges);
      appendBoolean(publicSiteFormData, "show_excursions_section", publicSite.show_excursions_section);
      appendBoolean(publicSiteFormData, "show_transfers_section", publicSite.show_transfers_section);
      appendBoolean(publicSiteFormData, "show_tickets_section", publicSite.show_tickets_section);
      appendBoolean(publicSiteFormData, "show_events_section", publicSite.show_events_section);
      appendBoolean(publicSiteFormData, "show_nightlife_section", publicSite.show_nightlife_section);
      appendBoolean(publicSiteFormData, "show_packages_section", publicSite.show_packages_section);
      appendBoolean(publicSiteFormData, "show_ai_assistant_section", publicSite.show_ai_assistant_section);
      appendBoolean(publicSiteFormData, "show_final_cta_section", publicSite.show_final_cta_section);
      appendBoolean(publicSiteFormData, "show_reviews", publicSite.show_reviews);
      appendBoolean(
        publicSiteFormData,
        "is_published",
        publicSite.is_published
      );

      if (heroImageFile) {
        setCompressing(true);
        publicSiteFormData.append(
          "hero_image",
          await compressImageFile(heroImageFile, 1800, 0.82)
        );
      }

      if (heroVideoFile) {
        publicSiteFormData.append("hero_video", heroVideoFile);
      }

      if (heroVideoPosterFile) {
        setCompressing(true);
        publicSiteFormData.append(
          "hero_video_poster",
          await compressImageFile(heroVideoPosterFile, 1800, 0.82)
        );
      }

      if (ogImageFile) {
        setCompressing(true);
        publicSiteFormData.append(
          "og_image",
          await compressImageFile(ogImageFile, 1200, 0.82)
        );
      }

      const [brandingResponse, settingsResponse, publicSiteResponse] =
        await Promise.all([
          api.patch<OrganisationBranding>(
            `/organisations/branding/ticketing/${organisationSlug}/`,
            brandingFormData
          ),
          api.patch<TicketingSettings>(
            "/ticketing/settings/mine/",
            settingsPayload,
            {
              params: requestParams,
            }
          ),
          api.patch<TicketingPublicSiteSettings>(
            "/ticketing/public-site-settings/mine/",
            publicSiteFormData,
            {
              params: requestParams,
            }
          ),
        ]);

      setBranding((current) => ({
        ...current,
        ...brandingResponse.data,
      }));

      setSettings((current) => ({
        ...current,
        ...settingsResponse.data,
        supported_currencies: normalizeArray(
          settingsResponse.data.supported_currencies
        ),
      }));

      setSupportedCurrenciesText(
        normalizeArray(settingsResponse.data.supported_currencies).join(", ")
      );

      setPublicSite((current) => ({
        ...current,
        ...publicSiteResponse.data,
      }));

      setLogoFile(null);
      setHeroImageFile(null);
      setHeroVideoFile(null);
      setHeroVideoPosterFile(null);
      setOgImageFile(null);

      setSavedMessage(
        "Configuración guardada. Si subiste un logo, el favicon y los app icons fueron regenerados desde ese logo."
      );
    } catch (err: any) {
      console.error("Could not save ticketing settings:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          "No se pudo guardar la configuración de Ticketing."
      );
    } finally {
      setSaving(false);
      setCompressing(false);
    }
  }

  const subtotalExample = 1000;
  const taxExample =
    subtotalExample * (Number(settings.tax_percentage || 0) / 100);
  const totalExample = subtotalExample + taxExample;

  const appIconsReady = Boolean(
    branding.favicon_url &&
      branding.app_icon_192_url &&
      branding.app_icon_512_url &&
      branding.maskable_icon_url
  );

  if (loading) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm font-bold text-slate-600">
        Loading Ticketing settings...
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
            <Settings className="h-7 w-7" />
          </div>

          <div>
            <p className="text-sm font-black uppercase tracking-wide text-amber-600">
              PCD Experiences
            </p>

            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              Ticketing Settings
            </h1>

            <p className="mt-1 max-w-3xl text-sm font-semibold leading-6 text-slate-500">
              Configure the owner workspace, public booking website, generated
              app icons, payment rules, taxes, deposits, notifications, SEO and
              AI discoverability. Products such as Saona, Catalina, transfers or
              events are created in Products, not here.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving
            ? compressing
              ? "Compressing images..."
              : "Saving..."
            : "Save Settings"}
        </button>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Organisation"
          value={settings.organisation_name || organisationSlug || "Active"}
          icon={Building2}
          helper="Owner workspace"
        />

        <StatCard
          title="Currency"
          value={settings.currency_symbol || "US$"}
          icon={Banknote}
          helper={settings.default_currency || "USD"}
        />

        <StatCard
          title="Tax"
          value={formatPercent(settings.tax_percentage)}
          icon={Percent}
          helper="Applied to bookings"
        />

        <StatCard
          title="App Icons"
          value={appIconsReady ? "Ready" : "Pending"}
          icon={Smartphone}
          helper={appIconsReady ? "Generated from logo" : "Upload logo first"}
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

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="App, login and dashboard branding"
          description="This controls the logo, generated favicon, installable app icons, login text and dashboard branding. Upload the logo only once; the backend generates the favicon and PWA icons."
          icon={Smartphone}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Input
              label="Company name"
              value={branding.company_name}
              onChange={(value) => updateBrandingField("company_name", value)}
              placeholder="Punta Cana Discovery"
            />

            <Input
              label="Platform name"
              value={branding.platform_name}
              onChange={(value) => updateBrandingField("platform_name", value)}
              placeholder="PCD Experiences"
            />

            <Input
              label="App short name"
              value={branding.app_short_name}
              onChange={(value) =>
                updateBrandingField("app_short_name", value)
              }
              placeholder="PCD"
            />

            <Textarea
              label="App description"
              value={branding.app_description}
              onChange={(value) =>
                updateBrandingField("app_description", value)
              }
              placeholder="Book and manage tours, tickets and transfers."
            />

            <Input
              label="Login title"
              value={branding.login_title}
              onChange={(value) => updateBrandingField("login_title", value)}
              placeholder="Welcome back"
            />

            <Textarea
              label="Login subtitle"
              value={branding.login_subtitle}
              onChange={(value) =>
                updateBrandingField("login_subtitle", value)
              }
              placeholder="Access your bookings, sellers, products and reports."
            />
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <ColorInput
              label="Primary color"
              value={branding.primary_color}
              onChange={(value) =>
                updateBrandingField("primary_color", value)
              }
            />

            <ColorInput
              label="Secondary color"
              value={branding.secondary_color}
              onChange={(value) =>
                updateBrandingField("secondary_color", value)
              }
            />

            <ColorInput
              label="Accent color"
              value={branding.accent_color}
              onChange={(value) =>
                updateBrandingField("accent_color", value)
              }
            />

            <ColorInput
              label="Theme color"
              value={branding.theme_color}
              onChange={(value) => updateBrandingField("theme_color", value)}
            />

            <ColorInput
              label="Background color"
              value={branding.background_color}
              onChange={(value) =>
                updateBrandingField("background_color", value)
              }
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <FileInput
              label="Main logo"
              description="Master image used to generate favicon, app icons, login logo and dashboard branding."
              currentUrl={branding.logo_url || branding.logo}
              selectedFile={logoFile}
              onChange={setLogoFile}
            />

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900">
              Do not upload favicon manually. This app uses the same working
              flow as Disco: upload the logo, then the backend creates favicon,
              192x192 icon, 512x512 icon and maskable icon automatically.
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <AssetPreview
              title="Logo"
              helper="Uploaded master image"
              url={branding.logo_url || branding.logo}
            />

            <AssetPreview
              title="Generated favicon"
              helper="Browser tab icon"
              url={branding.favicon_url || branding.favicon}
            />

            <AssetPreview
              title="App icon 192"
              helper="Small install icon"
              url={branding.app_icon_192_url || branding.app_icon_192}
            />

            <AssetPreview
              title="App icon 512"
              helper="Large install icon"
              url={branding.app_icon_512_url || branding.app_icon_512}
            />

            <AssetPreview
              title="Maskable icon"
              helper="Android adaptive icon"
              url={branding.maskable_icon_url || branding.maskable_icon}
            />
          </div>
        </Panel>

        <Panel
          title="Installable app / manifest"
          description="The backend manifest uses the generated branding icons and points to the Ticketing login URL for this organisation."
          icon={Download}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_0.7fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-900">
                Manifest URL
              </p>

              <p className="mt-2 break-all text-sm font-semibold text-slate-600">
                {manifestUrl || "Organisation slug missing"}
              </p>

              <p className="mt-3 text-xs font-semibold leading-5 text-slate-500">
                The browser install button only appears when the frontend layout
                links this manifest and the browser detects the PWA install
                requirements.
              </p>
            </div>

            <button
              type="button"
              disabled={!manifestUrl}
              onClick={() => window.open(manifestUrl, "_blank")}
              className="inline-flex min-h-20 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              Open Manifest
            </button>
          </div>
        </Panel>

        <Panel
          title="Company and module identity"
          description="This is the owner-level identity for the ticketing business. It is not where individual products or destination pages are created."
          icon={Ticket}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Module name"
              value={settings.module_name}
              onChange={(value) => updateSettingsField("module_name", value)}
              placeholder="Tours, Tickets & Transfers"
            />

            <Input
              label="Public brand name"
              value={settings.public_brand_name}
              onChange={(value) =>
                updateSettingsField("public_brand_name", value)
              }
              placeholder="PCD Experiences"
            />

            <Toggle
              label="Module active"
              description="Allow this organisation to use the Ticketing module."
              checked={settings.is_active}
              onChange={(value) => updateSettingsField("is_active", value)}
            />

            <Toggle
              label="Allow public bookings"
              description="Customers can create bookings from the public website."
              checked={settings.allow_public_bookings}
              onChange={(value) =>
                updateSettingsField("allow_public_bookings", value)
              }
            />

            <Toggle
              label="Allow seller bookings"
              description="Sellers can create bookings from their dashboard if their role permissions also allow it."
              checked={settings.allow_seller_bookings}
              onChange={(value) =>
                updateSettingsField("allow_seller_bookings", value)
              }
            />
          </div>
        </Panel>

        <Panel
          title="Financial defaults"
          description="These defaults apply to bookings, receipts, seller balances and owner reports."
          icon={Banknote}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Currency symbol"
              value={settings.currency_symbol}
              onChange={(value) =>
                updateSettingsField("currency_symbol", value)
              }
              placeholder="US$"
            />

            <Input
              label="Default currency code"
              value={settings.default_currency}
              onChange={(value) =>
                updateSettingsField("default_currency", value.toUpperCase())
              }
              placeholder="USD"
            />

            <Input
              label="Supported currency labels"
              value={supportedCurrenciesText}
              onChange={setSupportedCurrenciesText}
              placeholder="USD, DOP, EUR"
            />

            <Input
              label="Tax percentage (%)"
              type="number"
              min="0"
              step="0.01"
              value={settings.tax_percentage}
              onChange={(value) =>
                updateSettingsField("tax_percentage", value)
              }
              placeholder="18.00"
            />

            <Input
              label="Default deposit percentage (%)"
              type="number"
              min="0"
              step="0.01"
              value={settings.default_deposit_percentage}
              onChange={(value) =>
                updateSettingsField("default_deposit_percentage", value)
              }
              placeholder="20.00"
            />
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4 text-sm font-semibold leading-6 text-slate-600">
            Example: subtotal{" "}
            <strong>{formatExampleAmount(settings.currency_symbol, 1000)}</strong>{" "}
            + tax{" "}
            <strong>{formatExampleAmount(settings.currency_symbol, taxExample)}</strong>{" "}
            = total{" "}
            <strong>{formatExampleAmount(settings.currency_symbol, totalExample)}</strong>
          </div>
        </Panel>

        <Panel
          title="Booking and seller payment rules"
          description="These are global business rules. Specific seller permissions are configured later in the Sellers page."
          icon={CreditCard}
        >
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold leading-6 text-blue-800">
            A seller may only use these payment options if both this global
            setting and the seller role permission allow it.
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle
              label="Allow full payment"
              description="Customer or seller can pay the full booking amount."
              checked={settings.allow_full_payment}
              onChange={(value) =>
                updateSettingsField("allow_full_payment", value)
              }
            />

            <Toggle
              label="Allow deposit payment"
              description="Bookings can be created or confirmed with a deposit."
              checked={settings.allow_deposit_payment}
              onChange={(value) =>
                updateSettingsField("allow_deposit_payment", value)
              }
            />

            <Toggle
              label="Allow pending payment"
              description="Bookings can exist before the customer pays online."
              checked={settings.allow_pending_payment}
              onChange={(value) =>
                updateSettingsField("allow_pending_payment", value)
              }
            />

            <Toggle
              label="Allow cash to seller"
              description="Seller can collect cash from the customer and later owe the company balance."
              checked={settings.allow_cash_to_seller}
              onChange={(value) =>
                updateSettingsField("allow_cash_to_seller", value)
              }
            />

            <Toggle
              label="Allow bank transfer"
              description="Manual bank transfer can be used as a payment method."
              checked={settings.allow_manual_bank_transfer}
              onChange={(value) =>
                updateSettingsField("allow_manual_bank_transfer", value)
              }
            />

            <Toggle
              label="Allow mixed payments"
              description="Combine deposit, cash, card, online or balance payments."
              checked={settings.allow_mixed_payments}
              onChange={(value) =>
                updateSettingsField("allow_mixed_payments", value)
              }
            />

            <Toggle
              label="Supervisor approval for unpaid tickets"
              description="Require approval before a ticket/receipt is generated without customer payment."
              checked={settings.require_supervisor_approval_for_unpaid_tickets}
              onChange={(value) =>
                updateSettingsField(
                  "require_supervisor_approval_for_unpaid_tickets",
                  value
                )
              }
            />
          </div>
        </Panel>

        <Panel
          title="Notifications and confirmations"
          description="Control default communication behavior for customers and owners."
          icon={Bell}
        >
          <div className="grid gap-3">
            <Toggle
              label="Send customer email"
              description="Send booking confirmations or receipts by email when email delivery is connected."
              checked={settings.send_customer_email}
              onChange={(value) =>
                updateSettingsField("send_customer_email", value)
              }
            />

            <Toggle
              label="Send customer WhatsApp"
              description="Send booking confirmations or receipts by WhatsApp when WhatsApp delivery is connected."
              checked={settings.send_customer_whatsapp}
              onChange={(value) =>
                updateSettingsField("send_customer_whatsapp", value)
              }
            />

            <Toggle
              label="Notify owner on booking"
              description="Notify the owner/admin when a booking is created."
              checked={settings.notify_owner_on_booking}
              onChange={(value) =>
                updateSettingsField("notify_owner_on_booking", value)
              }
            />
          </div>
        </Panel>

        <Panel
          title="Public booking website"
          description="This is the customer-facing booking site. It controls the company page, not the individual product pages."
          icon={Globe2}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Input
              label="Public site title"
              value={publicSite.site_title}
              onChange={(value) =>
                updatePublicSiteField("site_title", value)
              }
              placeholder="Punta Cana Experiences"
            />

            <Input
              label="Public email"
              value={publicSite.public_email}
              onChange={(value) =>
                updatePublicSiteField("public_email", value)
              }
              placeholder="sales@example.com"
            />

            <Input
              label="Public WhatsApp"
              value={publicSite.public_whatsapp}
              onChange={(value) =>
                updatePublicSiteField("public_whatsapp", value)
              }
              placeholder="+1 829 000 0000"
            />

            <Input
              label="Subdomain"
              value={publicSite.subdomain}
              onChange={(value) =>
                updatePublicSiteField("subdomain", value)
              }
              placeholder="my-company"
            />

            <Input
              label="Custom domain"
              value={publicSite.custom_domain}
              onChange={(value) =>
                updatePublicSiteField("custom_domain", value)
              }
              placeholder="experiences.example.com"
            />

            <Textarea
              label="Public business description"
              value={publicSite.public_description}
              onChange={(value) =>
                updatePublicSiteField("public_description", value)
              }
              placeholder="Describe the company and the kind of experiences it sells..."
            />

            <Input
              label="Hero title"
              value={publicSite.hero_title}
              onChange={(value) => updatePublicSiteField("hero_title", value)}
              placeholder="Discover Punta Cana Experiences"
            />

            <Textarea
              label="Hero subtitle"
              value={publicSite.hero_subtitle}
              onChange={(value) => updatePublicSiteField("hero_subtitle", value)}
              placeholder="Book excursions, transfers, tickets and events..."
            />

            <Input
              label="Primary CTA label"
              value={publicSite.primary_cta_label}
              onChange={(value) =>
                updatePublicSiteField("primary_cta_label", value)
              }
              placeholder="Explore Experiences"
            />

            <Input
              label="Secondary CTA label"
              value={publicSite.secondary_cta_label}
              onChange={(value) =>
                updatePublicSiteField("secondary_cta_label", value)
              }
              placeholder="Book Transfers"
            />

            <Input
              label="WhatsApp CTA label"
              value={publicSite.whatsapp_cta_label}
              onChange={(value) =>
                updatePublicSiteField("whatsapp_cta_label", value)
              }
              placeholder="Chat via WhatsApp"
            />

            <Toggle
              label="Publish public site"
              description="Make the customer-facing booking website visible online."
              checked={publicSite.is_published}
              onChange={(value) =>
                updatePublicSiteField("is_published", value)
              }
            />

            <Toggle
              label="Show reviews"
              description="Show approved product reviews publicly."
              checked={publicSite.show_reviews}
              onChange={(value) =>
                updatePublicSiteField("show_reviews", value)
              }
            />

            <Toggle
              label="Show public rankings"
              description="Show featured, top excursions, best sellers or recommended experiences."
              checked={publicSite.show_public_rankings}
              onChange={(value) =>
                updatePublicSiteField("show_public_rankings", value)
              }
            />

            <Toggle
              label="Show seller public pages"
              description="Allow public seller links/pages when the seller module is configured."
              checked={publicSite.show_seller_public_pages}
              onChange={(value) =>
                updatePublicSiteField("show_seller_public_pages", value)
              }
            />
          </div>
        </Panel>

        <Panel
          title="Homepage video, layout and sections"
          description="Customize the public home page like a real travel marketplace: hero video/image, layout style, badges and visible sections."
          icon={Video}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Select
              label="Hero media"
              value={publicSite.hero_media_type}
              onChange={(value) =>
                updatePublicSiteField(
                  "hero_media_type",
                  value === "video" ? "video" : "image"
                )
              }
              options={[
                { value: "image", label: "Hero image" },
                { value: "video", label: "Hero video" },
              ]}
            />

            <Select
              label="Homepage layout"
              value={publicSite.homepage_layout_style}
              onChange={(value) =>
                updatePublicSiteField(
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

            <Input
              label="External hero video URL"
              value={publicSite.hero_video_url}
              onChange={(value) =>
                updatePublicSiteField("hero_video_url", value)
              }
              placeholder="https://cdn.example.com/hero.mp4"
            />

            <Input
              label="Hero overlay opacity"
              type="number"
              min="0"
              step="0.05"
              value={publicSite.hero_overlay_opacity}
              onChange={(value) =>
                updatePublicSiteField("hero_overlay_opacity", value)
              }
              placeholder="0.45"
            />

            <Textarea
              label="Trust badges"
              value={trustBadgesText}
              onChange={setTrustBadgesText}
              placeholder={"Trusted local operators\nHotel pickup available\nSecure reservations"}
            />

            <div className="grid gap-3">
              <VideoFileInput
                label="Hero video upload"
                description="Optional MP4/WebM video shown in the home hero."
                currentUrl={publicSite.hero_video_file_url || publicSite.hero_video}
                selectedFile={heroVideoFile}
                onChange={setHeroVideoFile}
              />

              <FileInput
                label="Hero video poster"
                description="Image shown before the video loads."
                currentUrl={
                  publicSite.hero_video_poster_url || publicSite.hero_video_poster
                }
                selectedFile={heroVideoPosterFile}
                onChange={setHeroVideoPosterFile}
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Toggle
              label="Category grid"
              checked={publicSite.show_category_grid}
              onChange={(value) =>
                updatePublicSiteField("show_category_grid", value)
              }
            />
            <Toggle
              label="Trust badges"
              checked={publicSite.show_trust_badges}
              onChange={(value) =>
                updatePublicSiteField("show_trust_badges", value)
              }
            />
            <Toggle
              label="Excursions section"
              checked={publicSite.show_excursions_section}
              onChange={(value) =>
                updatePublicSiteField("show_excursions_section", value)
              }
            />
            <Toggle
              label="Transfers section"
              checked={publicSite.show_transfers_section}
              onChange={(value) =>
                updatePublicSiteField("show_transfers_section", value)
              }
            />
            <Toggle
              label="Tickets section"
              checked={publicSite.show_tickets_section}
              onChange={(value) =>
                updatePublicSiteField("show_tickets_section", value)
              }
            />
            <Toggle
              label="Events section"
              checked={publicSite.show_events_section}
              onChange={(value) =>
                updatePublicSiteField("show_events_section", value)
              }
            />
            <Toggle
              label="Nightlife section"
              checked={publicSite.show_nightlife_section}
              onChange={(value) =>
                updatePublicSiteField("show_nightlife_section", value)
              }
            />
            <Toggle
              label="Packages section"
              checked={publicSite.show_packages_section}
              onChange={(value) =>
                updatePublicSiteField("show_packages_section", value)
              }
            />
            <Toggle
              label="AI assistant section"
              checked={publicSite.show_ai_assistant_section}
              onChange={(value) =>
                updatePublicSiteField("show_ai_assistant_section", value)
              }
            />
            <Toggle
              label="Final CTA section"
              checked={publicSite.show_final_cta_section}
              onChange={(value) =>
                updatePublicSiteField("show_final_cta_section", value)
              }
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Input
              label="Excursions title"
              value={publicSite.excursions_section_title}
              onChange={(value) =>
                updatePublicSiteField("excursions_section_title", value)
              }
            />
            <Input
              label="Excursions subtitle"
              value={publicSite.excursions_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("excursions_section_subtitle", value)
              }
            />
            <Input
              label="Transfers title"
              value={publicSite.transfers_section_title}
              onChange={(value) =>
                updatePublicSiteField("transfers_section_title", value)
              }
            />
            <Input
              label="Transfers subtitle"
              value={publicSite.transfers_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("transfers_section_subtitle", value)
              }
            />
            <Input
              label="Tickets title"
              value={publicSite.tickets_section_title}
              onChange={(value) =>
                updatePublicSiteField("tickets_section_title", value)
              }
            />
            <Input
              label="Tickets subtitle"
              value={publicSite.tickets_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("tickets_section_subtitle", value)
              }
            />
            <Input
              label="Events title"
              value={publicSite.events_section_title}
              onChange={(value) =>
                updatePublicSiteField("events_section_title", value)
              }
            />
            <Input
              label="Events subtitle"
              value={publicSite.events_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("events_section_subtitle", value)
              }
            />
            <Input
              label="Nightlife title"
              value={publicSite.nightlife_section_title}
              onChange={(value) =>
                updatePublicSiteField("nightlife_section_title", value)
              }
            />
            <Input
              label="Nightlife subtitle"
              value={publicSite.nightlife_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("nightlife_section_subtitle", value)
              }
            />
            <Input
              label="Packages title"
              value={publicSite.packages_section_title}
              onChange={(value) =>
                updatePublicSiteField("packages_section_title", value)
              }
            />
            <Input
              label="Packages subtitle"
              value={publicSite.packages_section_subtitle}
              onChange={(value) =>
                updatePublicSiteField("packages_section_subtitle", value)
              }
            />
            <Input
              label="AI assistant title"
              value={publicSite.ai_assistant_title}
              onChange={(value) =>
                updatePublicSiteField("ai_assistant_title", value)
              }
            />
            <Input
              label="AI assistant subtitle"
              value={publicSite.ai_assistant_subtitle}
              onChange={(value) =>
                updatePublicSiteField("ai_assistant_subtitle", value)
              }
            />
            <Input
              label="Final CTA title"
              value={publicSite.final_cta_title}
              onChange={(value) =>
                updatePublicSiteField("final_cta_title", value)
              }
            />
            <Input
              label="Final CTA subtitle"
              value={publicSite.final_cta_subtitle}
              onChange={(value) =>
                updatePublicSiteField("final_cta_subtitle", value)
              }
            />
          </div>
        </Panel>

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
              onChange={(value) =>
                updatePublicSiteField("primary_color", value)
              }
            />

            <ColorInput
              label="Site secondary color"
              value={publicSite.secondary_color}
              onChange={(value) =>
                updatePublicSiteField("secondary_color", value)
              }
            />

            <ColorInput
              label="Site accent color"
              value={publicSite.accent_color}
              onChange={(value) =>
                updatePublicSiteField("accent_color", value)
              }
            />

            <ColorInput
              label="Site background"
              value={publicSite.background_color}
              onChange={(value) =>
                updatePublicSiteField("background_color", value)
              }
            />

            <ColorInput
              label="Button color"
              value={publicSite.button_color}
              onChange={(value) =>
                updatePublicSiteField("button_color", value)
              }
            />

            <ColorInput
              label="Text color"
              value={publicSite.text_color}
              onChange={(value) => updatePublicSiteField("text_color", value)}
            />

            <ColorInput
              label="Muted text"
              value={publicSite.muted_text_color}
              onChange={(value) =>
                updatePublicSiteField("muted_text_color", value)
              }
            />

            <ColorInput
              label="Card background"
              value={publicSite.card_background_color}
              onChange={(value) =>
                updatePublicSiteField("card_background_color", value)
              }
            />
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <FileInput
              label="Hero image"
              description="Large image used on the public landing page."
              currentUrl={publicSite.hero_image_url || publicSite.hero_image}
              selectedFile={heroImageFile}
              onChange={setHeroImageFile}
            />

            <FileInput
              label="Open Graph image"
              description="Image used when sharing the public site on social media."
              currentUrl={publicSite.og_image_url || publicSite.og_image}
              selectedFile={ogImageFile}
              onChange={setOgImageFile}
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

        <Panel
          title="SEO and AI discoverability"
          description="This controls the main public site. Individual products such as Saona, Catalina, transfers, events and tickets will have their own SEO fields in Products."
          icon={Search}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <Input
              label="SEO title"
              value={publicSite.seo_title}
              onChange={(value) => updatePublicSiteField("seo_title", value)}
              placeholder="Best Tours, Tickets and Transfers in Punta Cana"
            />

            <Input
              label="Canonical URL"
              value={publicSite.canonical_url}
              onChange={(value) =>
                updatePublicSiteField("canonical_url", value)
              }
              placeholder="https://experiences.example.com"
            />

            <Textarea
              label="Meta description"
              value={publicSite.meta_description}
              onChange={(value) =>
                updatePublicSiteField("meta_description", value)
              }
              placeholder="Book excursions, transfers, events and tickets..."
            />

            <Textarea
              label="Open Graph description"
              value={publicSite.og_description}
              onChange={(value) =>
                updatePublicSiteField("og_description", value)
              }
              placeholder="Description used when the site is shared."
            />

            <Input
              label="Open Graph title"
              value={publicSite.og_title}
              onChange={(value) => updatePublicSiteField("og_title", value)}
              placeholder="PCD Experiences"
            />

            <div className="grid gap-3">
              <Toggle
                label="Allow public indexing"
                description="Allow public pages to appear in Google and other search engines."
                checked={publicSite.robots_allow_indexing}
                onChange={(value) =>
                  updatePublicSiteField("robots_allow_indexing", value)
                }
              />

              <Toggle
                label="Allow AI crawlers"
                description="Allow AI search/answer crawlers when the owner wants AI discoverability."
                checked={publicSite.robots_allow_ai_crawlers}
                onChange={(value) =>
                  updatePublicSiteField("robots_allow_ai_crawlers", value)
                }
              />

              <Toggle
                label="Allow GPTBot"
                description="Allow OpenAI GPTBot if AI crawlers are enabled."
                checked={publicSite.allow_gptbot}
                onChange={(value) =>
                  updatePublicSiteField("allow_gptbot", value)
                }
              />

              <Toggle
                label="Allow OAI-SearchBot"
                description="Allow OpenAI search crawler if AI crawlers are enabled."
                checked={publicSite.allow_oai_searchbot}
                onChange={(value) =>
                  updatePublicSiteField("allow_oai_searchbot", value)
                }
              />
            </div>
          </div>
        </Panel>

        <Panel
          title="Platform-controlled integrations"
          description="Wellet/Coco Bongo and other sensitive provider credentials are not configured by the customer from this settings page."
          icon={ShieldCheck}
          className="xl:col-span-2"
        >
          <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-slate-500" />

                <div>
                  <h3 className="text-sm font-black text-slate-900">
                    Hidden backend-only control
                  </h3>

                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
                    The platform owner decides which organisation can sell
                    Wellet/Coco Bongo products. The customer cannot paste API
                    keys or activate Wellet from here.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800">
              Seller access is handled in the Sellers page using role
              permissions such as selling excursions, transfers, events, custom
              tours, collecting cash, creating pending bookings and generating
              tickets without customer online payment.
            </div>
          </div>
        </Panel>

        <Panel
          title="What is created somewhere else?"
          description="These are not global settings. They are managed in their own pages so the owner can control each product or destination separately."
          icon={Sparkles}
          className="xl:col-span-2"
        >
          <div className="grid gap-3 md:grid-cols-3">
            <InfoCard
              title="Products"
              text="Saona, Catalina, Coco Bongo, transfers, events, tickets and custom tours are created in Products."
            />

            <InfoCard
              title="Pickup schedules"
              text="Hotel pickup times and pickup points are created in Pickup Schedules."
            />

            <InfoCard
              title="Sellers"
              text="Seller logins, permissions, commissions and public links are created in Sellers."
            />
          </div>
        </Panel>
      </section>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving
          ? compressing
            ? "Compressing images..."
            : "Saving..."
          : "Save Settings"}
      </button>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon: Icon,
  helper,
}: {
  title: string;
  value: string;
  icon: ElementType;
  helper: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-6 w-6 text-amber-600" />

      <p className="mt-4 text-sm font-bold text-slate-500">{title}</p>

      <h2 className="mt-1 truncate text-2xl font-black text-slate-950">
        {value}
      </h2>

      <p className="mt-1 text-xs font-semibold text-slate-400">{helper}</p>
    </div>
  );
}

function Panel({
  title,
  description,
  icon: Icon,
  className = "",
  children,
}: {
  title: string;
  description: string;
  icon: ElementType;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-3xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>

          <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5">{children}</div>
    </div>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">
        {text}
      </p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      <input
        type={type}
        min={min}
        step={step}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-amber-400 focus:bg-white"
      />
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
    <label className="block">
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

      <div className="mt-2 flex h-12 items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3">
        <input
          type="color"
          value={value || "#111827"}
          onChange={(event) => onChange(event.target.value)}
          className="h-8 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
        />

        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
        />
      </div>
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
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:bg-slate-100">
      <span>
        <span className="block text-sm font-black text-slate-800">{label}</span>

        {description && (
          <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">
            {description}
          </span>
        )}
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

function FileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: {
  label: string;
  description?: string;
  currentUrl?: string | null;
  selectedFile?: File | null;
  onChange: (file: File | null) => void;
}) {
  const previewUrl = selectedFile
    ? URL.createObjectURL(selectedFile)
    : currentUrl || null;

  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      {description && (
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {description}
        </p>
      )}

      <div className="mt-2 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 sm:flex-row sm:items-center">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={label}
            className="h-16 w-16 rounded-xl border border-slate-200 bg-white object-contain"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-white text-slate-400">
            <Upload className="h-5 w-5" />
          </div>
        )}

        <div className="flex-1">
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0] || null;

              if (file && !isImageFile(file)) {
                onChange(null);
                return;
              }

              onChange(file);
            }}
            className="w-full text-sm font-semibold text-slate-600"
          />

          {selectedFile && (
            <p className="mt-2 text-xs font-bold text-slate-500">
              Selected: {selectedFile.name} ·{" "}
              {formatFileSize(selectedFile.size)} · It will be compressed before
              upload.
            </p>
          )}
        </div>
      </div>
    </label>
  );
}

function VideoFileInput({
  label,
  description,
  currentUrl,
  selectedFile,
  onChange,
}: {
  label: string;
  description?: string;
  currentUrl?: string | null;
  selectedFile?: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700">{label}</span>

      {description && (
        <p className="mt-1 text-xs font-semibold text-slate-500">
          {description}
        </p>
      )}

      <div className="mt-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
        {currentUrl && !selectedFile && (
          <video
            src={currentUrl}
            controls
            muted
            className="mb-3 h-32 w-full rounded-xl bg-slate-950 object-cover"
          />
        )}

        <input
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          onChange={(event) => {
            const file = event.target.files?.[0] || null;

            if (file && !isVideoFile(file)) {
              onChange(null);
              return;
            }

            onChange(file);
          }}
          className="w-full text-sm font-semibold text-slate-600"
        />

        {selectedFile && (
          <p className="mt-2 text-xs font-bold text-slate-500">
            Selected: {selectedFile.name} · {formatFileSize(selectedFile.size)}
          </p>
        )}
      </div>
    </label>
  );
}

function AssetPreview({
  title,
  helper,
  url,
}: {
  title: string;
  helper: string;
  url?: string | null;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex h-20 items-center justify-center rounded-2xl bg-white">
        {url ? (
          <img src={url} alt={title} className="h-14 w-14 object-contain" />
        ) : (
          <Image className="h-6 w-6 text-slate-300" />
        )}
      </div>

      <p className="mt-3 text-sm font-black text-slate-950">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}
