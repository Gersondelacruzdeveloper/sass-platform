// src/modules/ticketing/pages/PublicExperienceHomePage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Package,
  Plane,
  Search,
  Sparkles,
  Star,
  Ticket,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import type {
  ExperienceCategory,
  ExperienceProduct,
  ProductType,
  PublicBrandingResponse,
} from "../types/ticketingTypes";

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

function getApiOrigin() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl.replace(/\/api\/?$/, "");
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
    primary: publicSite?.primary_color || "#111827",
    secondary: publicSite?.secondary_color || "#3092B5",
    accent: publicSite?.accent_color || "#F59E0B",
    background: publicSite?.background_color || "#F8FAFC",
    button: publicSite?.button_color || publicSite?.primary_color || "#111827",
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

function getProductTypeLabel(type: ProductType | string) {
  return productTypeLabels[type as ProductType] || type;
}

function getBestDescription(product: ExperienceProduct) {
  return (
    product.short_description ||
    product.long_description ||
    "Book this experience online."
  );
}

function getGalleryImage(product: ExperienceProduct) {
  const galleryImages = Array.isArray((product as any).gallery_images)
    ? (product as any).gallery_images
    : [];

  const cover = galleryImages.find((item: any) => item?.is_cover) || galleryImages[0];

  return resolveAssetUrl(
    cover?.image_url ||
      cover?.image ||
      product.image_url ||
      product.image ||
      ""
  );
}

export default function PublicExperienceHomePage() {
  const params = useParams();
  const slug = params.organisationSlug || params.slug || "";

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<ProductType | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  async function loadPublicData() {
    if (!slug) return;

    try {
      setLoading(true);
      setError("");

      const [brandingResponse, productsResponse, categoriesResponse] =
        await Promise.all([
          ticketingApi.getPublicBranding(slug),
          ticketingApi.getPublicProducts(slug, {
            public_enabled: true,
            status: "active",
          }),
          ticketingApi.getPublicCategories(slug),
        ]);

      setBranding(brandingResponse);
      setProducts(productsResponse);
      setCategories(categoriesResponse);
    } catch (err: any) {
      console.error("Could not load public experience website:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "We could not load the public booking site."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPublicData();
  }, [slug]);

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
  const heroImageUrl = resolveAssetUrl(publicSite?.hero_image_url || publicSite?.hero_image);
  const heroVideoUrl = resolveAssetUrl(
    publicSite?.hero_video_file_url ||
      publicSite?.hero_video ||
      publicSite?.hero_video_url
  );
  const heroPosterUrl = resolveAssetUrl(
    publicSite?.hero_video_poster_url || publicSite?.hero_video_poster || heroImageUrl
  );

  const heroMediaType = publicSite?.hero_media_type || "image";
  const heroOverlayOpacity = Math.max(
    0,
    Math.min(0.9, Number(publicSite?.hero_overlay_opacity ?? 0.45))
  );

  const heroTitle = publicSite?.hero_title || publicSite?.seo_title || brandName;
  const heroSubtitle =
    publicSite?.hero_subtitle ||
    publicSite?.public_description ||
    "Book excursions, airport transfers, events and tickets online.";

  const primaryCtaLabel = publicSite?.primary_cta_label || "View experiences";
  const secondaryCtaLabel = publicSite?.whatsapp_cta_label || "Ask by WhatsApp";

  const trustBadges = Array.isArray(publicSite?.trust_badges)
    ? publicSite.trust_badges
    : [
        "Local support",
        "Hotel pickup available",
        "Secure reservation",
        "Fast confirmation",
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
  }, [brandName, publicSite]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const searchText = `${product.name} ${product.short_description} ${product.location} ${product.category_detail?.name || ""}`.toLowerCase();

      const matchesSearch = search.trim()
        ? searchText.includes(search.trim().toLowerCase())
        : true;

      const matchesType =
        typeFilter === "all" ? true : product.product_type === typeFilter;

      const matchesCategory =
        categoryFilter === "all"
          ? true
          : String(product.category || "") === categoryFilter;

      return (
        matchesSearch &&
        matchesType &&
        matchesCategory &&
        product.public_enabled &&
        product.status === "active"
      );
    });
  }, [products, search, typeFilter, categoryFilter]);

  const featuredProducts = useMemo(() => {
    return filteredProducts.filter(
      (product) =>
        product.is_featured ||
        product.is_recommended ||
        product.is_best_seller ||
        product.is_top_excursion ||
        product.is_top_transfer
    );
  }, [filteredProducts]);

  const productsByType = useMemo(() => {
    return {
      excursion: products.filter((product) => product.product_type === "excursion"),
      transfer: products.filter((product) => product.product_type === "transfer"),
      ticket: products.filter((product) => product.product_type === "ticket"),
      event: products.filter((product) => product.product_type === "event"),
      nightlife: products.filter((product) => product.product_type === "nightlife"),
      custom: products.filter((product) => product.product_type === "custom"),
    };
  }, [products]);

  if (loading) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4"
        style={{ backgroundColor: theme.background, color: theme.text }}
      >
        <div
          className="rounded-3xl border p-6 text-center shadow-sm"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <Loader2
            className="mx-auto h-8 w-8 animate-spin"
            style={{ color: theme.accent }}
          />
          <p className="mt-3 text-sm font-black" style={{ color: theme.muted }}>
            Loading experiences...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="grid min-h-screen place-items-center px-4"
        style={{ backgroundColor: theme.background, color: theme.text }}
      >
        <div
          className="max-w-lg rounded-3xl border p-6 text-center shadow-sm"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <h1 className="text-xl font-black" style={{ color: theme.text }}>
            Public site unavailable
          </h1>
          <p className="mt-2 text-sm font-semibold leading-6" style={{ color: theme.muted }}>
            {error}
          </p>

          <button
            type="button"
            onClick={loadPublicData}
            className="mt-5 rounded-2xl px-5 py-3 text-sm font-black text-white"
            style={{ backgroundColor: theme.button }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const showCategoryGrid = publicSite?.show_category_grid !== false;
  const showTrustBadges = publicSite?.show_trust_badges !== false;

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      <header
        className="sticky top-0 z-30 border-b backdrop-blur-xl"
        style={{
          backgroundColor: hexToRgba(theme.card, 0.92),
          borderColor: hexToRgba(theme.primary, 0.12),
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <Link to={`/experiences/${slug}`} className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl"
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
                <Ticket className="h-6 w-6" />
              )}
            </div>

            <div>
              <p className="text-sm font-black" style={{ color: theme.text }}>
                {brandName}
              </p>
              <p className="text-xs font-bold" style={{ color: theme.muted }}>
                Tours, Tickets & Transfers
              </p>
            </div>
          </Link>

          <div className="hidden items-center gap-2 text-sm font-bold sm:flex">
            <Link
              to={`/experiences/${slug}/all`}
              className="rounded-2xl px-4 py-2"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.08),
                color: theme.text,
              }}
            >
              All experiences
            </Link>

            {publicSite?.public_whatsapp && (
              <a
                href={`https://wa.me/${String(publicSite.public_whatsapp).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl px-4 py-2 text-white"
                style={{ backgroundColor: theme.button }}
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </header>

      <section
        className="relative overflow-hidden"
        style={{ backgroundColor: theme.primary }}
      >
        {heroMediaType === "video" && heroVideoUrl ? (
          <video
            className="absolute inset-0 h-full w-full object-cover"
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
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}

        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${hexToRgba(
              theme.primary,
              heroOverlayOpacity
            )}, ${hexToRgba(theme.primary, Math.min(heroOverlayOpacity + 0.18, 0.92))}, ${hexToRgba(
              theme.secondary,
              Math.min(heroOverlayOpacity + 0.08, 0.85)
            )})`,
          }}
        />

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p
              className="inline-flex rounded-full px-4 py-2 text-xs font-black uppercase tracking-wide"
              style={{
                backgroundColor: theme.accent,
                color: theme.primary,
              }}
            >
              {ticketingSettings?.public_brand_name || "Punta Cana Experiences"}
            </p>

            <h1 className="mt-5 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              {heroTitle}
            </h1>

            <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-white/85 sm:text-lg">
              {heroSubtitle}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href="#products"
                className="inline-flex h-13 items-center justify-center rounded-2xl px-6 py-4 text-sm font-black transition"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.primary,
                }}
              >
                {primaryCtaLabel}
              </a>

              {publicSite?.public_whatsapp && (
                <a
                  href={`https://wa.me/${String(publicSite.public_whatsapp).replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-13 items-center justify-center rounded-2xl border px-6 py-4 text-sm font-black text-white backdrop-blur transition hover:bg-white/20"
                  style={{
                    borderColor: "rgba(255,255,255,0.25)",
                    backgroundColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  {secondaryCtaLabel}
                </a>
              )}
            </div>

            {showTrustBadges && trustBadges.length > 0 && (
              <div className="mt-8 flex flex-wrap gap-2">
                {trustBadges.slice(0, 6).map((badge: string, index: number) => (
                  <span
                    key={`${badge}-${index}`}
                    className="rounded-full border px-3 py-1.5 text-xs font-extrabold text-white backdrop-blur"
                    style={{
                      borderColor: "rgba(255,255,255,0.2)",
                      backgroundColor: "rgba(255,255,255,0.12)",
                    }}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <main id="products" className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section
          className="-mt-16 rounded-3xl border p-4 shadow-xl"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px]">
            <div
              className="flex h-12 items-center gap-3 rounded-2xl border px-4"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <Search className="h-4 w-4" style={{ color: theme.muted }} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search excursions, transfers, events..."
                className="h-full flex-1 bg-transparent text-sm font-bold outline-none"
                style={{ color: theme.text }}
              />
            </div>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value as ProductType | "all")
              }
              className="h-12 rounded-2xl border px-4 text-sm font-black outline-none"
              style={{
                color: theme.text,
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <option value="all">All types</option>
              <option value="excursion">Excursions</option>
              <option value="transfer">Transfers</option>
              <option value="ticket">Tickets</option>
              <option value="event">Events</option>
              <option value="nightlife">Nightlife</option>
              <option value="custom">Custom</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="h-12 rounded-2xl border px-4 text-sm font-black outline-none"
              style={{
                color: theme.text,
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category.id} value={String(category.id)}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>
        </section>

        {showCategoryGrid && (
          <section className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-sm font-black uppercase tracking-wide"
                  style={{ color: theme.accent }}
                >
                  Explore by type
                </p>
                <h2 className="mt-1 text-2xl font-black" style={{ color: theme.text }}>
                  Find what you need
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
              {(Object.keys(productTypeLabels) as ProductType[]).map((type) => {
                const Icon = getProductTypeIcon(type);
                const count = productsByType[type]?.length || 0;

                return (
                  <Link
                    key={type}
                    to={`/experiences/${slug}/${listingPathByType[type]}`}
                    className="rounded-3xl border p-4 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
                    style={{
                      backgroundColor: theme.card,
                      borderColor: hexToRgba(theme.primary, 0.12),
                    }}
                  >
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-2xl"
                      style={{
                        backgroundColor: hexToRgba(theme.accent, 0.14),
                        color: theme.accent,
                      }}
                    >
                      <Icon className="h-6 w-6" />
                    </div>

                    <p className="mt-4 text-sm font-black" style={{ color: theme.text }}>
                      {productTypeLabels[type]}
                    </p>
                    <p className="mt-1 text-xs font-bold" style={{ color: theme.muted }}>
                      {count} available
                    </p>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {featuredProducts.length > 0 && (
          <section className="mt-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-sm font-black uppercase tracking-wide"
                  style={{ color: theme.accent }}
                >
                  Featured
                </p>
                <h2 className="mt-1 text-2xl font-black" style={{ color: theme.text }}>
                  Recommended experiences
                </h2>
              </div>
            </div>

            <div className="mt-4 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {featuredProducts.slice(0, 6).map((product) => (
                <PublicProductCard
                  key={`featured-${product.id}`}
                  product={product}
                  slug={slug}
                  currencySymbol={currencySymbol}
                  theme={theme}
                  featured
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p
                className="text-sm font-black uppercase tracking-wide"
                style={{ color: theme.accent }}
              >
                Available now
              </p>
              <h2 className="mt-1 text-2xl font-black" style={{ color: theme.text }}>
                Book your experience
              </h2>
            </div>

            <p className="text-sm font-bold" style={{ color: theme.muted }}>
              {filteredProducts.length} product
              {filteredProducts.length === 1 ? "" : "s"} found
            </p>
          </div>

          {filteredProducts.length === 0 ? (
            <div
              className="mt-5 rounded-3xl border border-dashed p-10 text-center"
              style={{
                backgroundColor: theme.card,
                borderColor: hexToRgba(theme.primary, 0.2),
              }}
            >
              <Package className="mx-auto h-10 w-10" style={{ color: theme.muted }} />
              <h3 className="mt-3 text-lg font-black" style={{ color: theme.text }}>
                No public products found
              </h3>
              <p className="mt-2 text-sm font-semibold" style={{ color: theme.muted }}>
                Make sure the product status is Active and Public enabled is ON.
              </p>
            </div>
          ) : (
            <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <PublicProductCard
                  key={product.id}
                  product={product}
                  slug={slug}
                  currencySymbol={currencySymbol}
                  theme={theme}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer
        className="mt-8 border-t"
        style={{
          backgroundColor: theme.card,
          borderColor: hexToRgba(theme.primary, 0.12),
        }}
      >
        <div
          className="mx-auto flex max-w-7xl flex-col justify-between gap-3 px-4 py-6 text-sm font-semibold sm:flex-row sm:px-6 lg:px-8"
          style={{ color: theme.muted }}
        >
          <p>© {new Date().getFullYear()} {brandName}</p>
          <p>Powered by PCD Experiences</p>
        </div>
      </footer>
    </div>
  );
}

function PublicProductCard({
  product,
  slug,
  currencySymbol,
  theme,
  featured = false,
}: {
  product: ExperienceProduct;
  slug: string;
  currencySymbol: string;
  theme: PublicTheme;
  featured?: boolean;
}) {
  const Icon = getProductTypeIcon(product.product_type);
  const imageUrl = getGalleryImage(product);
  const detailPath = `/experiences/${slug}/product/${product.slug}`;

  return (
    <article
      className="group overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
      style={{
        backgroundColor: theme.card,
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <Link to={detailPath} className="block">
        <div
          className="relative h-56 overflow-hidden"
          style={{ backgroundColor: hexToRgba(theme.primary, 0.06) }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.image_alt_text || product.name}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="grid h-full place-items-center">
              <Package className="h-10 w-10" style={{ color: theme.muted }} />
            </div>
          )}

          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <span
              className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-sm"
              style={{
                backgroundColor: hexToRgba(theme.card, 0.95),
                color: theme.text,
              }}
            >
              <Icon className="h-3.5 w-3.5" />
              {getProductTypeLabel(product.product_type)}
            </span>

            {featured && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow-sm"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.primary,
                }}
              >
                <Star className="h-3.5 w-3.5" />
                Featured
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="p-5">
        <Link to={detailPath}>
          <h3
            className="line-clamp-2 text-xl font-black transition"
            style={{ color: theme.text }}
          >
            {product.name}
          </h3>
        </Link>

        <p
          className="mt-2 line-clamp-3 text-sm font-semibold leading-6"
          style={{ color: theme.muted }}
        >
          {getBestDescription(product)}
        </p>

        <div className="mt-4 space-y-2 text-sm font-bold" style={{ color: theme.muted }}>
          {product.location && (
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" style={{ color: theme.accent }} />
              {product.location}
            </p>
          )}

          {product.duration_text && (
            <p className="flex items-center gap-2">
              <Clock className="h-4 w-4" style={{ color: theme.accent }} />
              {product.duration_text}
            </p>
          )}

          {(product.supports_pickup || product.requires_pickup_location) && (
            <p className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Hotel pickup available
            </p>
          )}
        </div>

        <div className="mt-5 flex items-end justify-between gap-4">
          <div>
            <p
              className="text-xs font-bold uppercase tracking-wide"
              style={{ color: theme.muted }}
            >
              From
            </p>
            <p className="text-2xl font-black" style={{ color: theme.text }}>
              {formatMoney(product.base_price, currencySymbol)}
            </p>

            {Number(product.deposit_amount || 0) > 0 && (
              <p className="mt-1 text-xs font-bold" style={{ color: theme.muted }}>
                Deposit {formatMoney(product.deposit_amount, currencySymbol)}
              </p>
            )}
          </div>

          <Link
            to={detailPath}
            className="rounded-2xl px-4 py-3 text-sm font-black text-white transition"
            style={{ backgroundColor: theme.button }}
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}
