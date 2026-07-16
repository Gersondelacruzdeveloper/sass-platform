// src/modules/ticketing/pages/PublicExperienceHomePage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock,
  Compass,
  Filter,
  Flame,
  HeartHandshake,
  Languages,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Plane,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Waves,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import {
  ticketingLanguageOptions,
  useTicketingTranslation,
  type TicketingLanguage,
} from "../i18n";
import type {
  ExperienceCategory,
  ExperienceProduct,
  ProductType,
  PublicBrandingResponse,
} from "../types/ticketingTypes";

type Translate = (key: string, fallback?: string) => string;

type PublicTheme = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  button: string;
  text: string;
  muted: string;
  card: string;
};

type PublicTicketingDomainResolution = {
  organisation_id: number;
  organisation_slug: string;
  organisation_name: string;
  business_type?: string;
  public_domain: string;
  public_base_url: string;
  is_published: boolean;
  domain_status?: string;
};

const PLATFORM_HOSTS = [
  "localhost",
  "127.0.0.1",
  "app.puntacanadiscovery.com",
];

const productTypeLabels: Record<ProductType, string> = {
  excursion: "Excursion",
  transfer: "Transfer",
  ticket: "Ticket",
  event: "Event",
  nightlife: "Nightlife",
  custom: "Custom",
};

const listingPathByType: Record<ProductType, string> = {
  excursion: "excursions",
  transfer: "transfers",
  ticket: "tickets",
  event: "events",
  nightlife: "nightlife",
  custom: "custom",
};

const typeOrder: ProductType[] = [
  "excursion",
  "ticket",
  "nightlife",
  "transfer",
  "event",
  "custom",
];

function getApiBaseUrl() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl;
}

function getApiOrigin() {
  return getApiBaseUrl().replace(/\/api\/?$/, "");
}

function getCurrentHostname() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.location.hostname.toLowerCase();
}

function isPlatformHost(hostname = getCurrentHostname()) {
  return PLATFORM_HOSTS.includes(hostname);
}

function isCustomTicketingDomain(hostname = getCurrentHostname()) {
  return Boolean(hostname) && !isPlatformHost(hostname);
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

function hexToRgba(hex: string, opacity: number) {
  const cleanHex = String(hex || "#111827").replace("#", "");

  const normalized =
    cleanHex.length === 3
      ? cleanHex
          .split("")
          .map((char) => char + char)
          .join("")
      : cleanHex.padEnd(6, "0").slice(0, 6);

  const number = parseInt(normalized, 16);

  if (Number.isNaN(number)) {
    return `rgba(17, 24, 39, ${opacity})`;
  }

  const red = (number >> 16) & 255;
  const green = (number >> 8) & 255;
  const blue = number & 255;

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function getPublicTheme(publicSite: any): PublicTheme {
  return {
    primary: publicSite?.primary_color || "#0F172A",
    secondary: publicSite?.secondary_color || "#0EA5E9",
    accent: publicSite?.accent_color || "#F59E0B",
    background: publicSite?.background_color || "#F8FAFC",
    button: publicSite?.button_color || publicSite?.primary_color || "#0F172A",
    text: publicSite?.text_color || "#111827",
    muted: publicSite?.muted_text_color || "#64748B",
    card: publicSite?.card_background_color || "#FFFFFF",
  };
}

function formatMoney(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getProductTypeIcon(type: ProductType | string) {
  if (type === "transfer") return Plane;
  if (type === "event") return CalendarClock;
  if (type === "ticket" || type === "nightlife") return Ticket;
  if (type === "custom") return Sparkles;
  return Package;
}

function getProductTypeLabel(
  type: ProductType | string,
  t: Translate
) {
  const keyByType: Partial<Record<ProductType, string>> = {
    excursion: "public.type.excursion",
    transfer: "public.type.transfer",
    ticket: "public.type.ticket",
    event: "public.type.event",
    nightlife: "public.type.nightlife",
    custom: "public.type.custom",
  };

  const fallback = productTypeLabels[type as ProductType] || String(type);
  const key = keyByType[type as ProductType];

  return key ? t(key, fallback) : fallback;
}

function getBestDescription(product: ExperienceProduct, t: Translate) {
  return (
    product.short_description ||
    product.long_description ||
    t(
      "public.product_default_description",
      "Book this experience online with fast confirmation and local support."
    )
  );
}

function getGalleryImage(product: ExperienceProduct) {
  const galleryImages = Array.isArray((product as any).gallery_images)
    ? (product as any).gallery_images
    : [];

  const cover =
    galleryImages.find((item: any) => item?.is_cover) || galleryImages[0];

  return resolveAssetUrl(
    cover?.image_url ||
      cover?.image ||
      product.image_url ||
      product.image ||
      ""
  );
}

function getWhatsappUrl(value?: string | null, message?: string) {
  if (!value) return "";

  const phone = String(value).replace(/\D/g, "");
  if (!phone) return "";

  const text = message ? `?text=${encodeURIComponent(message)}` : "";

  return `https://wa.me/${phone}${text}`;
}

function getLowestPrice(products: ExperienceProduct[]) {
  const prices = products
    .map((product) => Number(product.base_price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!prices.length) return 0;

  return Math.min(...prices);
}

function getFeaturedRank(product: ExperienceProduct) {
  let score = 0;

  if (product.is_featured) score += 20;
  if (product.is_best_seller) score += 18;
  if (product.is_recommended) score += 14;
  if (product.is_top_excursion) score += 10;
  if (product.is_top_transfer) score += 10;

  return score;
}

function usePublicTicketingOrganisation(
  organisationSlugFromUrl: string | undefined,
  t: Translate
) {
  const hostname = useMemo(() => getCurrentHostname(), []);
  const customDomain = useMemo(() => isCustomTicketingDomain(hostname), [hostname]);

  const [resolvedDomain, setResolvedDomain] =
    useState<PublicTicketingDomainResolution | null>(null);
  const [loading, setLoading] = useState<boolean>(
    !organisationSlugFromUrl && customDomain
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolveDomain() {
      if (organisationSlugFromUrl) {
        setLoading(false);
        setError("");
        return;
      }

      if (!customDomain || !hostname) {
        setLoading(false);
        setError(t("public.organisation_missing", "Organisation slug is missing."));
        return;
      }

      try {
        setLoading(true);
        setError("");

        const response = await fetch(
          `${getApiBaseUrl()}/ticketing/public/resolve-domain/?domain=${encodeURIComponent(
            hostname
          )}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.detail || t("public.domain_resolve_error", "Unable to resolve this domain."));
        }

        if (!cancelled) {
          setResolvedDomain(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setResolvedDomain(null);
          setError(
            err instanceof Error
              ? err.message
              : t("public.domain_resolve_error", "Unable to resolve this domain.")
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    resolveDomain();

    return () => {
      cancelled = true;
    };
  }, [hostname, customDomain, organisationSlugFromUrl, t]);

  return {
    organisationSlug: organisationSlugFromUrl || resolvedDomain?.organisation_slug || "",
    resolvedDomain,
    loading,
    error,
    isCustomDomain: customDomain,
  };
}

export default function PublicExperienceHomePage() {
  const { language, setLanguage, t } = useTicketingTranslation();

  const params = useParams<{
    organisationSlug?: string;
    slug?: string;
    sellerCode?: string;
  }>();

  const slugFromUrl = params.organisationSlug || params.slug || "";
  const sellerCodeFromUrl = String(params.sellerCode || "").trim();

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const {
    organisationSlug,
    loading: organisationLoading,
    error: organisationError,
    isCustomDomain,
  } = usePublicTicketingOrganisation(slugFromUrl, t);

  const sellerStorageKey = organisationSlug
    ? `ticketing_seller_slug:${organisationSlug}`
    : "";

  const [storedSellerCode, setStoredSellerCode] = useState(() => {
    if (sellerCodeFromUrl) return sellerCodeFromUrl;
    if (typeof window === "undefined" || !slugFromUrl) return "";

    return (
      window.sessionStorage.getItem(
        `ticketing_seller_slug:${slugFromUrl}`
      ) || ""
    );
  });

  useEffect(() => {
    if (!sellerStorageKey || typeof window === "undefined") return;

    if (sellerCodeFromUrl) {
      window.sessionStorage.setItem(sellerStorageKey, sellerCodeFromUrl);
      setStoredSellerCode(sellerCodeFromUrl);
      return;
    }

    const savedSellerCode =
      window.sessionStorage.getItem(sellerStorageKey) || "";

    setStoredSellerCode(savedSellerCode);
  }, [sellerCodeFromUrl, sellerStorageKey]);

  const activeSellerCode = sellerCodeFromUrl || storedSellerCode;

  const publicPath = (path: string = "/") => {
    if (!organisationSlug) {
      return path || "/";
    }

    const cleanPath = path === "/" ? "" : path;

    if (isCustomDomain) {
      if (activeSellerCode) {
        return `/s/${activeSellerCode}${cleanPath}`;
      }

      return path || "/";
    }

    if (activeSellerCode) {
      return `/experiences/${organisationSlug}/s/${activeSellerCode}${cleanPath}`;
    }

    return `/experiences/${organisationSlug}${cleanPath}`;
  };

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [loading, setLoading] = useState(!organisationSlug);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  async function loadPublicData() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [brandingResponse, productsResponse, categoriesResponse] =
        await Promise.all([
          ticketingApi.getPublicBranding(organisationSlug),
          ticketingApi.getPublicProducts(organisationSlug, {
            public_enabled: true,
            status: "active",
            language,
          }),
          ticketingApi.getPublicCategories(organisationSlug),
        ]);

      setBranding(brandingResponse);
      setProducts(Array.isArray(productsResponse) ? productsResponse : []);
      setCategories(Array.isArray(categoriesResponse) ? categoriesResponse : []);
    } catch (err: any) {
      console.error("Could not load public experience website:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("public.load_error", "We could not load the public booking site.")
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!organisationSlug) return;
    loadPublicData();
  }, [organisationSlug, language]);

  const publicSite = branding?.public_site as any;
  const ticketingSettings = branding?.ticketing_settings;
  const organisation = branding?.organisation;

  const theme = useMemo(() => getPublicTheme(publicSite), [publicSite]);

  const brandName =
    publicSite?.site_title ||
    publicSite?.display_title ||
    ticketingSettings?.public_brand_name ||
    organisation?.name ||
    "PCD Experiences";

  const currencySymbol = ticketingSettings?.currency_symbol || "US$";

  const logoUrl = resolveAssetUrl(publicSite?.logo_url || publicSite?.logo);
  const heroImageUrl = resolveAssetUrl(
    publicSite?.hero_image_url || publicSite?.hero_image
  );
  const heroVideoUrl = resolveAssetUrl(
    publicSite?.hero_video_file_url ||
      publicSite?.hero_video ||
      publicSite?.hero_video_url
  );
  const heroPosterUrl = resolveAssetUrl(
    publicSite?.hero_video_poster_url ||
      publicSite?.hero_video_poster ||
      heroImageUrl
  );

  const heroMediaType = publicSite?.hero_media_type || "image";
  const heroOverlayOpacity = Math.max(
    0,
    Math.min(0.9, Number(publicSite?.hero_overlay_opacity ?? 0.5))
  );

  const heroTitle =
    publicSite?.hero_title ||
    publicSite?.seo_title ||
    `${t("public.discover", "Discover")} ${brandName}`;

  const heroSubtitle =
    publicSite?.hero_subtitle ||
    publicSite?.public_description ||
    t("public.hero_default_subtitle", "Book excursions, airport transfers, events, nightlife and tickets with fast confirmation and local support.");

  const primaryCtaLabel = publicSite?.primary_cta_label || t("public.explore_experiences", "Explore experiences");
  const secondaryCtaLabel = publicSite?.whatsapp_cta_label || t("public.ask_whatsapp", "Ask by WhatsApp");

  const whatsappUrl = getWhatsappUrl(
    publicSite?.public_whatsapp,
    `${t("public.whatsapp_message", "Hi, I want information about")} ${brandName}.`
  );

  const trustBadges = Array.isArray(publicSite?.trust_badges)
    ? publicSite.trust_badges
    : [
        t("public.local_support", "Local support"),
        t("public.hotel_pickup_available", "Hotel pickup available"),
        t("public.secure_reservation", "Secure reservation"),
        t("public.fast_confirmation", "Fast confirmation"),
      ];

  useEffect(() => {
    if (brandName) {
      document.title = brandName;
    }

    const metaDescription =
      publicSite?.meta_description || publicSite?.public_description || "";

    if (metaDescription) {
      let meta = document.querySelector(
        'meta[name="description"]'
      ) as HTMLMetaElement | null;

      if (!meta) {
        meta = document.createElement("meta");
        meta.name = "description";
        document.head.appendChild(meta);
      }

      meta.content = metaDescription;
    }

    const faviconUrl = resolveAssetUrl(
      publicSite?.favicon_url ||
        publicSite?.favicon ||
        publicSite?.logo_url ||
        publicSite?.logo
    );

    if (faviconUrl) {
      let favicon = document.getElementById(
        "app-favicon"
      ) as HTMLLinkElement | null;

      if (!favicon) {
        favicon = document.createElement("link");
        favicon.id = "app-favicon";
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }

      favicon.href = faviconUrl;
      favicon.type = faviconUrl.toLowerCase().includes(".ico")
        ? "image/x-icon"
        : "image/png";

      let shortcutIcon = document.getElementById(
        "app-shortcut-icon"
      ) as HTMLLinkElement | null;

      if (!shortcutIcon) {
        shortcutIcon = document.createElement("link");
        shortcutIcon.id = "app-shortcut-icon";
        shortcutIcon.rel = "shortcut icon";
        document.head.appendChild(shortcutIcon);
      }

      shortcutIcon.href = faviconUrl;
      shortcutIcon.type = favicon.type;

      let appleTouchIcon = document.getElementById(
        "apple-touch-icon"
      ) as HTMLLinkElement | null;

      if (!appleTouchIcon) {
        appleTouchIcon = document.createElement("link");
        appleTouchIcon.id = "apple-touch-icon";
        appleTouchIcon.rel = "apple-touch-icon";
        document.head.appendChild(appleTouchIcon);
      }

      appleTouchIcon.href = faviconUrl;
    }

    if (organisationSlug) {
      const manifestUrl = `${getApiBaseUrl()}/organisations/public-manifest/ticketing/${organisationSlug}/manifest.json`;

      let manifest = document.getElementById(
        "app-manifest"
      ) as HTMLLinkElement | null;

      if (!manifest) {
        manifest = document.createElement("link");
        manifest.id = "app-manifest";
        manifest.rel = "manifest";
        document.head.appendChild(manifest);
      }

      manifest.href = manifestUrl;
    }

    let themeColorMeta = document.getElementById(
      "app-theme-color"
    ) as HTMLMetaElement | null;

    if (!themeColorMeta) {
      themeColorMeta = document.createElement("meta");
      themeColorMeta.id = "app-theme-color";
      themeColorMeta.name = "theme-color";
      document.head.appendChild(themeColorMeta);
    }

    themeColorMeta.content =
      publicSite?.primary_color ||
      publicSite?.theme_color ||
      "#0F172A";
  }, [brandName, organisationSlug, publicSite]);

  const publicProducts = useMemo(() => {
    return products.filter(
      (product) => product.public_enabled && product.status === "active"
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    return publicProducts.filter((product) => {
      const searchText = `${product.name} ${product.short_description} ${
        product.long_description
      } ${product.location} ${product.category_detail?.name || ""}`.toLowerCase();

      const matchesSearch = search.trim()
        ? searchText.includes(search.trim().toLowerCase())
        : true;

      const matchesType =
        typeFilter === "all" ? true : product.product_type === typeFilter;

      const matchesCategory =
        categoryFilter === "all"
          ? true
          : String(product.category || "") === categoryFilter;

      return matchesSearch && matchesType && matchesCategory;
    });
  }, [publicProducts, search, typeFilter, categoryFilter]);

  const featuredProducts = useMemo(() => {
    const featured = filteredProducts
      .filter(
        (product) =>
          product.is_featured ||
          product.is_recommended ||
          product.is_best_seller ||
          product.is_top_excursion ||
          product.is_top_transfer
      )
      .sort((a, b) => getFeaturedRank(b) - getFeaturedRank(a));

    return featured.length ? featured : filteredProducts.slice(0, 3);
  }, [filteredProducts]);

  const heroProduct = featuredProducts[0] || filteredProducts[0] || null;
  const heroProductImage = heroProduct ? getGalleryImage(heroProduct) : "";
  const heroProductPath = heroProduct
    ? publicPath(`/product/${heroProduct.slug}`)
    : "#products";

  const productsByType = useMemo(() => {
    return typeOrder.reduce(
      (acc, type) => {
        acc[type] = publicProducts.filter(
          (product) => product.product_type === type
        );
        return acc;
      },
      {} as Record<ProductType, ExperienceProduct[]>
    );
  }, [publicProducts]);

  const showCategoryGrid = publicSite?.show_category_grid !== false;
  const showTrustBadges = publicSite?.show_trust_badges !== false;

  const stats = useMemo(() => {
    const pickupCount = publicProducts.filter(
      (product) => product.supports_pickup || product.requires_pickup_location
    ).length;

    return {
      products: publicProducts.length,
      categories: categories.length,
      pickup: pickupCount,
      fromPrice: getLowestPrice(publicProducts),
    };
  }, [publicProducts, categories]);

  if (organisationLoading || loading) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4"
        style={{
          background: `radial-gradient(circle at top left, ${hexToRgba(
            theme.secondary,
            0.18
          )}, transparent 32rem), ${theme.background}`,
          color: theme.text,
        }}
      >
        <div
          className="relative overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl"
          style={{
            backgroundColor: hexToRgba(theme.card, 0.86),
            borderColor: hexToRgba(theme.primary, 0.1),
          }}
        >
          <div
            className="absolute inset-x-0 top-0 h-1 animate-pulse"
            style={{ backgroundColor: theme.accent }}
          />
          <Loader2
            className="mx-auto h-9 w-9 animate-spin"
            style={{ color: theme.accent }}
          />
          <p className="mt-4 text-sm font-black" style={{ color: theme.muted }}>
            {t("public.preparing_site", "Preparing your experience site...")}
          </p>
        </div>
      </div>
    );
  }

  if (organisationError || error) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4"
        style={{
          background: `radial-gradient(circle at top left, ${hexToRgba(
            theme.secondary,
            0.16
          )}, transparent 30rem), ${theme.background}`,
          color: theme.text,
        }}
      >
        <div
          className="max-w-lg rounded-[2rem] border p-7 text-center shadow-2xl"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{
              backgroundColor: hexToRgba(theme.accent, 0.14),
              color: theme.accent,
            }}
          >
            <ShieldCheck className="h-7 w-7" />
          </div>

          <h1 className="mt-5 text-2xl font-black" style={{ color: theme.text }}>
            {t("public.site_unavailable", "Public site unavailable")}
          </h1>
          <p
            className="mt-2 text-sm font-semibold leading-6"
            style={{ color: theme.muted }}
          >
            {organisationError || error}
          </p>

          <button
            type="button"
            onClick={loadPublicData}
            className="mt-6 rounded-2xl px-5 py-3 text-sm font-black text-white"
            style={{ backgroundColor: theme.button }}
          >
            {t("common.retry", "Try again")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-x-hidden"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      <style>{`
        @keyframes pcdFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -16px, 0) rotate(1deg); }
        }

        @keyframes pcdSlowSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes pcdMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }

        @keyframes pcdShimmer {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }

        @keyframes pcdReveal {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .pcd-animate-reveal {
          animation: pcdReveal 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        .pcd-floating {
          animation: pcdFloat 6s ease-in-out infinite;
        }

        .pcd-floating-slow {
          animation: pcdFloat 8s ease-in-out infinite;
        }

        .pcd-spin-slow {
          animation: pcdSlowSpin 18s linear infinite;
        }

        .pcd-marquee-track {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        .pcd-glow-card {
          position: relative;
          isolation: isolate;
        }

        .pcd-glow-card::before {
          content: "";
          position: absolute;
          inset: -1px;
          z-index: -1;
          border-radius: inherit;
          opacity: 0;
          transition: opacity 260ms ease;
          background: linear-gradient(135deg, ${theme.accent}, ${theme.secondary}, ${theme.primary});
        }

        .pcd-glow-card:hover::before {
          opacity: 0.38;
        }

        .pcd-shine {
          position: relative;
          overflow: hidden;
        }

        .pcd-shine::after {
          content: "";
          position: absolute;
          inset: 0;
          transform: translateX(-110%);
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
        }

        .pcd-shine:hover::after {
          animation: pcdShimmer 900ms ease;
        }

        @media (prefers-reduced-motion: reduce) {
          .pcd-floating,
          .pcd-floating-slow,
          .pcd-spin-slow,
          .pcd-marquee-track,
          .pcd-animate-reveal {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="pcd-floating absolute -left-24 top-28 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(theme.secondary, 0.16) }}
        />
        <div
          className="pcd-floating-slow absolute -right-24 top-96 h-96 w-96 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(theme.accent, 0.16) }}
        />
        <div
          className="absolute bottom-20 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(theme.primary, 0.08) }}
        />
      </div>

      <header
        className="sticky top-0 z-40 border-b backdrop-blur-2xl"
        style={{
          backgroundColor: hexToRgba(theme.card, 0.78),
          borderColor: hexToRgba(theme.primary, 0.1),
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link to={publicPath("/")} className="group flex items-center gap-3">
            <div
              className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl shadow-sm transition group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${hexToRgba(
                  theme.accent,
                  0.2
                )}, ${hexToRgba(theme.secondary, 0.16)})`,
                color: theme.accent,
              }}
            >
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={brandName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <Ticket className="h-6 w-6" />
              )}
            </div>

            <div>
              <p className="text-sm font-black" style={{ color: theme.text }}>
                {brandName}
              </p>
              <p className="text-xs font-bold" style={{ color: theme.muted }}>
                {t("public.brand_tagline", "Tours · Tickets · Transfers")}
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <a
              href="#products"
              className="rounded-2xl px-4 py-2 text-sm font-black transition hover:scale-105"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.06),
                color: theme.text,
              }}
            >
              {t("public.explore", "Explore")}
            </a>

            <Link
              to={publicPath("/all")}
              className="rounded-2xl px-4 py-2 text-sm font-black transition hover:scale-105"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.06),
                color: theme.text,
              }}
            >
              {t("public.all_experiences", "All experiences")}
            </Link>

            <label
              className="inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-black"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.06),
                color: theme.text,
              }}
            >
              <Languages className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">
                {t("common.language", "Language")}
              </span>
              <select
                value={language}
                onChange={(event) =>
                  setLanguage(event.target.value as TicketingLanguage)
                }
                aria-label={t("common.language", "Language")}
                className="cursor-pointer bg-transparent text-sm font-black outline-none"
                style={{ color: theme.text }}
              >
                {ticketingLanguageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5"
                style={{ backgroundColor: theme.button }}
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            )}
          </nav>
        </div>
      </header>

      <section
        className="relative z-10 min-h-[700px] overflow-hidden sm:min-h-[760px] lg:min-h-[780px]"
        style={{
          backgroundColor: theme.primary,
        }}
      >
        {heroMediaType === "video" && heroVideoUrl ? (
          <video
            className="absolute inset-0 h-full w-full object-cover object-center sm:scale-105"
            src={heroVideoUrl}
            poster={heroPosterUrl || undefined}
            autoPlay
            muted
            loop
            playsInline
          />
        ) : heroImageUrl ? (
          <img
            src={heroImageUrl}
            alt={brandName}
            className="absolute inset-0 h-full w-full object-cover object-center sm:scale-105"
          />
        ) : null}

        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(120deg, ${hexToRgba(
              theme.primary,
              Math.min(heroOverlayOpacity + 0.2, 0.95)
            )} 0%, ${hexToRgba(
              theme.primary,
              heroOverlayOpacity
            )} 44%, ${hexToRgba(theme.secondary, 0.42)} 100%)`,
          }}
        />

        <div
          className="absolute -right-32 top-20 h-80 w-80 rounded-full border opacity-30 pcd-spin-slow"
          style={{ borderColor: "rgba(255,255,255,0.22)" }}
        />
        <div
          className="absolute -bottom-24 left-10 h-56 w-56 rounded-full border opacity-20 pcd-spin-slow"
          style={{ borderColor: "rgba(255,255,255,0.2)" }}
        />

        <div className="relative mx-auto grid min-h-[700px] max-w-7xl gap-10 px-4 py-12 sm:min-h-[760px] sm:px-6 sm:py-16 lg:min-h-[780px] lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
          <div className="pcd-animate-reveal flex min-w-0 flex-col justify-center">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl"
                style={{
                  borderColor: "rgba(255,255,255,0.2)",
                  backgroundColor: "rgba(255,255,255,0.13)",
                }}
              >
                <Sparkles className="h-3.5 w-3.5" />
                {ticketingSettings?.public_brand_name ||
                  "Punta Cana Experiences"}
              </span>

              <span
                className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide text-white backdrop-blur-xl"
                style={{
                  borderColor: "rgba(255,255,255,0.2)",
                  backgroundColor: "rgba(255,255,255,0.1)",
                }}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("public.secure_booking", "Secure booking")}
              </span>
            </div>

            <h1 className="mt-6 max-w-full break-words text-4xl font-black leading-[1.05] tracking-tight text-white sm:max-w-4xl sm:text-6xl lg:text-7xl">
              {heroTitle}
            </h1>

            <p className="mt-5 max-w-full text-sm font-semibold leading-7 text-white/90 sm:mt-6 sm:max-w-2xl sm:text-lg sm:leading-8">
              {heroSubtitle}
            </p>

            <div className="mt-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <a
                href="#products"
                className="pcd-shine inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl px-6 text-center text-sm font-black shadow-2xl transition hover:-translate-y-0.5 sm:w-auto"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.primary,
                }}
              >
                {primaryCtaLabel}
                <ArrowRight className="h-4 w-4" />
              </a>

              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl border px-6 text-center text-sm font-black text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-white/20 sm:w-auto"
                  style={{
                    borderColor: "rgba(255,255,255,0.24)",
                    backgroundColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <MessageCircle className="h-4 w-4" />
                  {secondaryCtaLabel}
                </a>
              )}
            </div>

            {showTrustBadges && trustBadges.length > 0 && (
              <div
                className="mt-8 max-w-full overflow-hidden rounded-2xl border p-3 backdrop-blur-xl lg:mt-9 lg:py-3"
                style={{
                  borderColor: "rgba(255,255,255,0.16)",
                  backgroundColor: "rgba(255,255,255,0.08)",
                }}
              >
                <div className="pcd-marquee-track">
                  {trustBadges.map(
                    (badge: string, index: number) => (
                      <span
                        key={`${badge}-${index}`}
                        className="inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold text-white"
                      >
                        <BadgeCheck className="h-3.5 w-3.5" />
                        {badge}
                      </span>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pcd-animate-reveal relative hidden lg:block">
            <div
              className="pcd-floating absolute left-0 top-16 z-20 rounded-3xl border p-4 shadow-2xl backdrop-blur-xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.16)",
                borderColor: "rgba(255,255,255,0.22)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 place-items-center rounded-2xl"
                  style={{ backgroundColor: theme.accent, color: theme.primary }}
                >
                  <Star className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{t("public.top_picks", "Top picks")}</p>
                  <p className="text-xs font-bold text-white/70">
                    {featuredProducts.length} {t("public.recommended", "recommended")}
                  </p>
                </div>
              </div>
            </div>

            <div
              className="pcd-floating-slow absolute -right-3 bottom-16 z-20 rounded-3xl border p-4 shadow-2xl backdrop-blur-xl"
              style={{
                backgroundColor: "rgba(255,255,255,0.14)",
                borderColor: "rgba(255,255,255,0.22)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="grid h-11 w-11 place-items-center rounded-2xl"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.16)",
                    color: "white",
                  }}
                >
                  <HeartHandshake className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-black text-white">{t("public.local_support", "Local support")}</p>
                  <p className="text-xs font-bold text-white/70">
                    {t("public.fast_confirmation", "Fast confirmation")}
                  </p>
                </div>
              </div>
            </div>

            <Link
              to={heroProductPath}
              className="group ml-auto block max-w-md rounded-[2.2rem] border p-3 shadow-2xl backdrop-blur-xl transition hover:-translate-y-2"
              style={{
                borderColor: "rgba(255,255,255,0.18)",
                backgroundColor: "rgba(255,255,255,0.12)",
              }}
            >
              <div className="relative h-[30rem] overflow-hidden rounded-[1.7rem] bg-black/20">
                {heroProductImage || heroImageUrl ? (
                  <img
                    src={heroProductImage || heroImageUrl}
                    alt={heroProduct?.name || brandName}
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <Compass className="h-16 w-16 text-white/60" />
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />

                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="mb-3 flex flex-wrap gap-2">
                    <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black text-white backdrop-blur">
                      {t("public.featured_experience", "Featured experience")}
                    </span>
                    {heroProduct?.location && (
                      <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-black text-white backdrop-blur">
                        {heroProduct.location}
                      </span>
                    )}
                  </div>

                  <h3 className="text-2xl font-black text-white">
                    {heroProduct?.name || "Experience Punta Cana"}
                  </h3>

                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wide text-white/60">
                        {t("public.from", "From")}
                      </p>
                      <p className="text-2xl font-black text-white">
                        {formatMoney(
                          heroProduct?.base_price || stats.fromPrice,
                          currencySymbol
                        )}
                      </p>
                    </div>

                    <span
                      className="grid h-12 w-12 place-items-center rounded-2xl transition group-hover:translate-x-1"
                      style={{ backgroundColor: theme.accent, color: theme.primary }}
                    >
                      <ArrowRight className="h-5 w-5" />
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <main
        id="products"
        className="relative z-10 mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8"
      >
        <section
          className="pcd-animate-reveal -mt-10 grid gap-3 rounded-[2rem] border p-4 shadow-2xl backdrop-blur-xl md:grid-cols-4"
          style={{
            backgroundColor: hexToRgba(theme.card, 0.9),
            borderColor: hexToRgba(theme.primary, 0.1),
          }}
        >
          <MetricCard
            label={t("public.experiences", "Experiences")}
            value={String(stats.products)}
            helper={t("public.ready_to_book", "Ready to book")}
            icon={<Compass className="h-5 w-5" />}
            theme={theme}
          />
          <MetricCard
            label={t("public.categories", "Categories")}
            value={String(stats.categories || typeOrder.length)}
            helper={t("public.easy_discovery", "Easy discovery")}
            icon={<Filter className="h-5 w-5" />}
            theme={theme}
          />
          <MetricCard
            label={t("public.pickup", "Pickup")}
            value={String(stats.pickup)}
            helper={t("public.hotel_pickup_options", "Hotel pickup options")}
            icon={<MapPin className="h-5 w-5" />}
            theme={theme}
          />
          <MetricCard
            label={t("public.starting_at", "Starting at")}
            value={stats.fromPrice ? formatMoney(stats.fromPrice, currencySymbol) : t("public.ask", "Ask")}
            helper={t("public.best_available_price", "Best available price")}
            icon={<Flame className="h-5 w-5" />}
            theme={theme}
          />
        </section>

        <section
          className="sticky top-[77px] z-30 mt-6 rounded-[2rem] border p-3 shadow-xl backdrop-blur-2xl"
          style={{
            backgroundColor: hexToRgba(theme.card, 0.88),
            borderColor: hexToRgba(theme.primary, 0.1),
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_190px_230px]">
            <div
              className="flex h-14 items-center gap-3 rounded-2xl border px-4"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <Search className="h-4 w-4" style={{ color: theme.muted }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("public.search_placeholder", "Search excursions, Coco Bongo, transfers, events...")}
                className="h-full flex-1 bg-transparent text-sm font-bold outline-none"
                style={{ color: theme.text }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as ProductType | "all")
              }
              className="h-14 rounded-2xl border px-4 text-sm font-black outline-none"
              style={{
                color: theme.text,
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <option value="all">{t("public.all_types", "All types")}</option>
              <option value="excursion">{t("public.excursions", "Excursions")}</option>
              <option value="transfer">{t("public.transfers", "Transfers")}</option>
              <option value="ticket">{t("public.tickets", "Tickets")}</option>
              <option value="event">{t("public.events", "Events")}</option>
              <option value="nightlife">{t("public.nightlife", "Nightlife")}</option>
              <option value="custom">{t("public.custom", "Custom")}</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-14 rounded-2xl border px-4 text-sm font-black outline-none"
              style={{
                color: theme.text,
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <option value="all">{t("public.all_categories", "All categories")}</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {showCategoryGrid && (
          <section className="mt-10">
            <SectionTitle
              eyebrow={t("public.explore_by_type", "Explore by type")}
              title={t("public.choose_experience_type", "Choose your kind of experience")}
              description={t("public.choose_experience_description", "Jump straight into excursions, tickets, nightlife, transfers or private experiences.")}
              theme={theme}
            />

            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {typeOrder.map((type, index) => {
                const Icon = getProductTypeIcon(type);
                const count = productsByType[type]?.length || 0;

                return (
                  <Link
                    key={type}
                    to={publicPath(`/${listingPathByType[type]}`)}
                    className="pcd-glow-card group rounded-[1.7rem] border p-4 text-left shadow-sm transition hover:-translate-y-1 hover:shadow-2xl"
                    style={{
                      animationDelay: `${index * 70}ms`,
                      backgroundColor: theme.card,
                      borderColor: hexToRgba(theme.primary, 0.1),
                    }}
                  >
                    <div
                      className="grid h-14 w-14 place-items-center rounded-2xl transition group-hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, ${hexToRgba(
                          theme.accent,
                          0.18
                        )}, ${hexToRgba(theme.secondary, 0.14)})`,
                        color: theme.accent,
                      }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    <p
                      className="mt-4 text-sm font-black"
                      style={{ color: theme.text }}
                    >
                      {getProductTypeLabel(type, t)}
                    </p>
                    <p
                      className="mt-1 text-xs font-bold"
                      style={{ color: theme.muted }}
                    >
                      {count} {t("public.available", "available")}
                    </p>

                    <div
                      className="mt-4 inline-flex items-center gap-2 text-xs font-black transition group-hover:translate-x-1"
                      style={{ color: theme.accent }}
                    >
                      View {getProductTypeLabel(type, t)}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {featuredProducts.length > 0 && (
          <section className="mt-12">
            <SectionTitle
              eyebrow={t("public.featured", "Featured")}
              title={t("public.recommended_experiences", "Recommended experiences")}
              description={t("public.recommended_description", "Premium picks selected for an unforgettable experience.")}
              theme={theme}
            />

            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featuredProducts.slice(0, 6).map((product, index) => (
                <PublicProductCard
                  key={`featured-${product.id}`}
                  product={product}
                  publicPath={publicPath}
                  currencySymbol={currencySymbol}
                  theme={theme}
                  featured
                  index={index}
                  t={t}
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <SectionTitle
              eyebrow={t("public.available_now", "Available now")}
              title={t("public.book_your_experience", "Book your experience")}
              description={t("public.search_compare_reserve", "Search, compare and reserve directly online.")}
              theme={theme}
            />

            <div
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.06),
                color: theme.muted,
              }}
            >
              <Waves className="h-4 w-4" style={{ color: theme.accent }} />
              {filteredProducts.length} {
                filteredProducts.length === 1
                  ? t("public.product", "product")
                  : t("public.products", "products")
              } {t("public.found", "found")}
            </div>
          </div>

          {filteredProducts.length === 0 ? (
            <div
              className="mt-6 rounded-[2rem] border border-dashed p-12 text-center shadow-sm"
              style={{
                backgroundColor: theme.card,
                borderColor: hexToRgba(theme.primary, 0.18),
              }}
            >
              <Package
                className="mx-auto h-12 w-12"
                style={{ color: theme.muted }}
              />
              <h3 className="mt-4 text-xl font-black" style={{ color: theme.text }}>
                {t("public.no_products_found", "No public products found")}
              </h3>
              <p
                className="mt-2 text-sm font-semibold"
                style={{ color: theme.muted }}
              >
                {t("public.no_products_help", "Try changing the filters or search for another experience.")}
              </p>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product, index) => (
                <PublicProductCard
                  key={product.id}
                  product={product}
                  publicPath={publicPath}
                  currencySymbol={currencySymbol}
                  theme={theme}
                  index={index}
                  t={t}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer
        className="relative z-10 mt-14 border-t"
        style={{
          backgroundColor: theme.card,
          borderColor: hexToRgba(theme.primary, 0.1),
        }}
      >
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1fr_auto] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="grid h-11 w-11 place-items-center overflow-hidden rounded-2xl"
                style={{
                  backgroundColor: hexToRgba(theme.accent, 0.15),
                  color: theme.accent,
                }}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={brandName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Ticket className="h-5 w-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-black" style={{ color: theme.text }}>
                  {brandName}
                </p>
                <p className="text-xs font-bold" style={{ color: theme.muted }}>
                  {t("public.powered_by", "Powered by PCD Experiences")}
                </p>
              </div>
            </div>
          </div>

          <div
            className="text-sm font-semibold lg:text-right"
            style={{ color: theme.muted }}
          >
            <p>© {new Date().getFullYear()} {brandName}</p>
            <p className="mt-1">{t("public.footer_tagline", "Tours, tickets, transfers and experiences.")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  theme,
}: {
  eyebrow: string;
  title: string;
  description: string;
  theme: PublicTheme;
}) {
  return (
    <div>
      <p
        className="text-sm font-black uppercase tracking-[0.22em]"
        style={{ color: theme.accent }}
      >
        {eyebrow}
      </p>
      <h2
        className="mt-2 text-3xl font-black tracking-tight sm:text-4xl"
        style={{ color: theme.text }}
      >
        {title}
      </h2>
      <p
        className="mt-2 max-w-2xl text-sm font-semibold leading-6"
        style={{ color: theme.muted }}
      >
        {description}
      </p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon,
  theme,
}: {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  theme: PublicTheme;
}) {
  return (
    <div
      className="rounded-3xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.035),
        borderColor: hexToRgba(theme.primary, 0.08),
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
          style={{
            backgroundColor: hexToRgba(theme.accent, 0.15),
            color: theme.accent,
          }}
        >
          {icon}
        </div>
        <div>
          <p
            className="text-xs font-black uppercase tracking-wide"
            style={{ color: theme.muted }}
          >
            {label}
          </p>
          <p className="mt-1 text-xl font-black" style={{ color: theme.text }}>
            {value}
          </p>
          <p className="mt-0.5 text-xs font-bold" style={{ color: theme.muted }}>
            {helper}
          </p>
        </div>
      </div>
    </div>
  );
}

function PublicProductCard({
  product,
  publicPath,
  currencySymbol,
  theme,
  featured = false,
  index = 0,
  t,
}: {
  product: ExperienceProduct;
  publicPath: (path: string) => string;
  currencySymbol: string;
  theme: PublicTheme;
  featured?: boolean;
  index?: number;
  t: Translate;
}) {
  const Icon = getProductTypeIcon(product.product_type);
  const imageUrl = getGalleryImage(product);
  const detailPath = publicPath(`/product/${product.slug}`);
  const description = getBestDescription(product, t);
  const isTop =
    product.is_best_seller ||
    product.is_recommended ||
    product.is_featured ||
    product.is_top_excursion ||
    product.is_top_transfer;

  return (
    <article
      className="pcd-glow-card pcd-animate-reveal group rounded-[2rem] border p-[1px] shadow-sm transition duration-300 hover:-translate-y-2 hover:shadow-2xl"
      style={{
        animationDelay: `${Math.min(index * 55, 300)}ms`,
        backgroundColor: hexToRgba(theme.primary, 0.1),
        borderColor: hexToRgba(theme.primary, 0.08),
      }}
    >
      <div
        className="h-full overflow-hidden rounded-[1.95rem]"
        style={{ backgroundColor: theme.card }}
      >
        <Link to={detailPath} className="block">
          <div
            className="relative h-64 overflow-hidden"
            style={{ backgroundColor: hexToRgba(theme.primary, 0.06) }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.image_alt_text || product.name}
                className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              />
            ) : (
              <div className="grid h-full place-items-center">
                <Package className="h-12 w-12" style={{ color: theme.muted }} />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent opacity-90" />

            <div className="absolute left-4 top-4 flex flex-wrap gap-2">
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black shadow-sm backdrop-blur-xl"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: theme.text,
                }}
              >
                <Icon className="h-3.5 w-3.5" />
                {getProductTypeLabel(product.product_type, t)}
              </span>

              {(featured || isTop) && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-black shadow-sm"
                  style={{
                    backgroundColor: theme.accent,
                    color: theme.primary,
                  }}
                >
                  <Star className="h-3.5 w-3.5" />
                  {t("public.featured", "Featured")}
                </span>
              )}
            </div>

            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-4">
              <div>
                {product.location && (
                  <p className="mb-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-black text-white backdrop-blur">
                    <MapPin className="h-3.5 w-3.5" />
                    {product.location}
                  </p>
                )}

                <p className="text-xs font-black uppercase tracking-wide text-white/70">
                  {t("public.from", "From")}
                </p>
                <p className="text-2xl font-black text-white">
                  {formatMoney(product.base_price, currencySymbol)}
                </p>
              </div>

              <span
                className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl shadow-lg transition group-hover:translate-x-1"
                style={{ backgroundColor: theme.accent, color: theme.primary }}
              >
                <ArrowRight className="h-5 w-5" />
              </span>
            </div>
          </div>
        </Link>

        <div className="p-5">
          <Link to={detailPath}>
            <h3
              className="line-clamp-2 text-xl font-black tracking-tight transition"
              style={{ color: theme.text }}
            >
              {product.name}
            </h3>
          </Link>

          <p
            className="mt-2 line-clamp-3 text-sm font-semibold leading-6"
            style={{ color: theme.muted }}
          >
            {description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {product.duration_text && (
              <InfoPill
                icon={<Clock className="h-3.5 w-3.5" />}
                label={product.duration_text}
                theme={theme}
              />
            )}

            {(product.supports_pickup || product.requires_pickup_location) && (
              <InfoPill
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                label={t("public.pickup", "Pickup")}
                theme={theme}
              />
            )}

            {Number(product.deposit_amount || 0) > 0 && (
              <InfoPill
                icon={<ShieldCheck className="h-3.5 w-3.5" />}
                label={`Deposit ${formatMoney(product.deposit_amount, currencySymbol)}`}
                theme={theme}
              />
            )}
          </div>

          <div className="mt-5 flex items-center justify-between gap-4">
            <div>
              <p
                className="text-xs font-black uppercase tracking-wide"
                style={{ color: theme.muted }}
              >
                {t("public.ready_to_book", "Ready to book")}
              </p>
              <p className="text-sm font-black" style={{ color: theme.text }}>
                {t("public.instant_request", "Instant request")}
              </p>
            </div>

            <Link
              to={detailPath}
              className="pcd-shine inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5"
              style={{ backgroundColor: theme.button }}
            >
              {t("public.view_details", "View details")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function InfoPill({
  icon,
  label,
  theme,
}: {
  icon: ReactNode;
  label: string;
  theme: PublicTheme;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-black"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.06),
        color: theme.text,
      }}
    >
      <span style={{ color: theme.accent }}>{icon}</span>
      {label}
    </span>
  );
}
