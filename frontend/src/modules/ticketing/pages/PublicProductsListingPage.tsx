// src/modules/ticketing/pages/PublicProductsListingPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Plane,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Star,
  Ticket,
  X,
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

type SortKey =
  | "recommended"
  | "price_low"
  | "price_high"
  | "duration_low"
  | "duration_high"
  | "rating_high";

type DurationBucket = "all" | "short" | "half" | "full";

type ProductSegment =
  | "excursions"
  | "transfers"
  | "tickets"
  | "events"
  | "nightlife"
  | "custom"
  | "all";

type FilterChip = {
  label: string;
  onRemove: () => void;
};

const segmentToProductType: Record<ProductSegment, ProductType | "all"> = {
  all: "all",
  excursions: "excursion",
  transfers: "transfer",
  tickets: "ticket",
  events: "event",
  nightlife: "nightlife",
  custom: "custom",
};

const segmentLabels: Record<
  ProductSegment,
  {
    eyebrow: string;
    title: string;
    subtitle: string;
    emptyTitle: string;
    emptyText: string;
  }
> = {
  all: {
    eyebrow: "All experiences",
    title: "Experiences in Punta Cana",
    subtitle:
      "Discover excursions, transfers, tickets, events and custom experiences.",
    emptyTitle: "No products found",
    emptyText:
      "Try removing a filter, changing the category, or widening the price range.",
  },
  excursions: {
    eyebrow: "Curated excursions",
    title: "Excursions in Punta Cana",
    subtitle:
      "Choose islands, buggies, culture, nightlife and unforgettable local adventures.",
    emptyTitle: "No excursions found",
    emptyText:
      "Try removing a filter, changing the category, or widening the price range.",
  },
  transfers: {
    eyebrow: "Private transfers",
    title: "Transfers in Punta Cana",
    subtitle:
      "Airport transfers, hotel transfers and private rides with clear pricing.",
    emptyTitle: "No transfers found",
    emptyText:
      "Try changing your filters or checking another pickup/drop-off option.",
  },
  tickets: {
    eyebrow: "Tickets",
    title: "Tickets and attractions",
    subtitle:
      "Book entry tickets and attraction passes with secure reservation options.",
    emptyTitle: "No tickets found",
    emptyText: "Try removing filters or checking another date.",
  },
  events: {
    eyebrow: "Events",
    title: "Events in Punta Cana",
    subtitle:
      "Find local events, parties, shows and limited-date experiences.",
    emptyTitle: "No events found",
    emptyText: "Try removing filters or checking another event category.",
  },
  nightlife: {
    eyebrow: "Nightlife",
    title: "Nightlife experiences",
    subtitle:
      "Discover nightlife tickets, premium experiences and evening activities.",
    emptyTitle: "No nightlife experiences found",
    emptyText: "Try removing filters or checking another date.",
  },
  custom: {
    eyebrow: "Custom experiences",
    title: "Custom tours and private experiences",
    subtitle:
      "Private, custom and special experiences created for your trip.",
    emptyTitle: "No custom experiences found",
    emptyText: "Try removing filters or checking another category.",
  },
};

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

  if (Number.isNaN(number)) return `rgba(17, 24, 39, ${opacity})`;

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

function money(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function parseDuration(durationText?: string | null) {
  if (!durationText) return 0;

  const match = durationText.toString().match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getProductTypeIcon(type: ProductType | string) {
  if (type === "transfer") return Plane;
  if (type === "event") return CalendarDays;
  if (type === "ticket" || type === "nightlife") return Ticket;
  if (type === "custom") return Sparkles;
  return Package;
}

function getListingSegment(rawSegment?: string): ProductSegment {
  const segment = String(rawSegment || "all").toLowerCase();

  if (
    segment === "excursions" ||
    segment === "transfers" ||
    segment === "tickets" ||
    segment === "events" ||
    segment === "nightlife" ||
    segment === "custom" ||
    segment === "all"
  ) {
    return segment;
  }

  return "all";
}

function getImage(product: ExperienceProduct) {
  const mainImage = resolveAssetUrl(product.image_url || product.image);

  if (mainImage) return mainImage;

  const galleryImages = Array.isArray((product as any).gallery_images)
    ? (product as any).gallery_images
    : [];

  const cover = galleryImages.find((item: any) => item?.is_cover) || galleryImages[0];

  const galleryImage = resolveAssetUrl(
    cover?.image_url || cover?.image || cover?.url || cover?.src || ""
  );

  if (galleryImage) return galleryImage;

  if (Array.isArray((product as any).gallery)) {
    for (const item of (product as any).gallery) {
      if (typeof item === "string") {
        const url = resolveAssetUrl(item);
        if (url) return url;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        const url = resolveAssetUrl(
          String(
            record.image_url ||
              record.image ||
              record.url ||
              record.src ||
              record.file ||
              ""
          )
        );

        if (url) return url;
      }
    }
  }

  return "";
}

function getProductScore(product: ExperienceProduct) {
  let score = 0;

  if (product.is_best_seller) score += 50;
  if (product.is_featured) score += 40;
  if (product.is_recommended) score += 30;
  if (product.is_top_excursion || product.is_top_transfer) score += 20;

  score += Number((product as any).average_rating || 0) * 5;
  score += Math.min(Number((product as any).booking_count || 0), 100) / 5;

  return score;
}

function getCategoryName(product: ExperienceProduct) {
  return product.category_detail?.name || "";
}

function getTypeLabel(type: ProductType | string) {
  if (type === "excursion") return "Excursion";
  if (type === "transfer") return "Transfer";
  if (type === "ticket") return "Ticket";
  if (type === "event") return "Event";
  if (type === "nightlife") return "Nightlife";
  if (type === "custom") return "Custom";
  return String(type);
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

function getHighestPrice(products: ExperienceProduct[]) {
  const prices = products
    .map((product) => Number(product.base_price || 0))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!prices.length) return 0;

  return Math.max(...prices);
}

function BadgePill({
  children,
  tone = "gray",
  theme,
}: {
  children: ReactNode;
  tone?: "gray" | "accent" | "green" | "blue";
  theme: PublicTheme;
}) {
  const styles: Record<string, React.CSSProperties> = {
    gray: {
      backgroundColor: hexToRgba(theme.primary, 0.055),
      color: theme.text,
      borderColor: hexToRgba(theme.primary, 0.1),
    },
    accent: {
      backgroundColor: hexToRgba(theme.accent, 0.13),
      color: theme.accent,
      borderColor: hexToRgba(theme.accent, 0.2),
    },
    green: {
      backgroundColor: "rgba(16,185,129,0.1)",
      color: "#047857",
      borderColor: "rgba(16,185,129,0.18)",
    },
    blue: {
      backgroundColor: hexToRgba(theme.secondary, 0.12),
      color: theme.secondary,
      borderColor: hexToRgba(theme.secondary, 0.18),
    },
  };

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black"
      style={styles[tone]}
    >
      {children}
    </span>
  );
}

type FiltersPanelProps = {
  compact?: boolean;
  theme: PublicTheme;

  q: string;
  setQ: React.Dispatch<React.SetStateAction<string>>;

  categoryId: string;
  setCategoryId: React.Dispatch<React.SetStateAction<string>>;
  categories: ExperienceCategory[];

  onlyRecommended: boolean;
  setOnlyRecommended: React.Dispatch<React.SetStateAction<boolean>>;

  pickupIncludedOnly: boolean;
  setPickupIncludedOnly: React.Dispatch<React.SetStateAction<boolean>>;

  depositOnly: boolean;
  setDepositOnly: React.Dispatch<React.SetStateAction<boolean>>;

  location: string;
  setLocation: React.Dispatch<React.SetStateAction<string>>;
  locations: string[];

  minPrice: number | "";
  setMinPrice: React.Dispatch<React.SetStateAction<number | "">>;
  maxPrice: number | "";
  setMaxPrice: React.Dispatch<React.SetStateAction<number | "">>;
  priceStats: { min: number; max: number };

  durationBucket: DurationBucket;
  setDurationBucket: React.Dispatch<React.SetStateAction<DurationBucket>>;

  sort: SortKey;
  setSort: React.Dispatch<React.SetStateAction<SortKey>>;

  clearFilters: () => void;
  hasActiveFilters: boolean;
};

function inputStyle(theme: PublicTheme): React.CSSProperties {
  return {
    backgroundColor: hexToRgba(theme.primary, 0.035),
    borderColor: hexToRgba(theme.primary, 0.12),
    color: theme.text,
  };
}

function activeButtonStyle(theme: PublicTheme): React.CSSProperties {
  return {
    backgroundColor: theme.button,
    borderColor: theme.button,
    color: "#FFFFFF",
  };
}

function inactiveButtonStyle(theme: PublicTheme): React.CSSProperties {
  return {
    backgroundColor: theme.card,
    borderColor: hexToRgba(theme.primary, 0.12),
    color: theme.text,
  };
}

function FiltersPanel({
  compact = false,
  theme,

  q,
  setQ,

  categoryId,
  setCategoryId,
  categories,

  onlyRecommended,
  setOnlyRecommended,

  pickupIncludedOnly,
  setPickupIncludedOnly,

  depositOnly,
  setDepositOnly,

  location,
  setLocation,
  locations,

  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  priceStats,

  durationBucket,
  setDurationBucket,

  sort,
  setSort,

  clearFilters,
  hasActiveFilters,
}: FiltersPanelProps) {
  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      <div>
        <label className="block text-sm font-black" style={{ color: theme.text }}>
          Search
        </label>

        <div
          className="relative mt-2 rounded-2xl border"
          style={inputStyle(theme)}
        >
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: theme.muted }}
          />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Saona, buggy, airport, nightlife..."
            className="h-12 w-full bg-transparent py-3 pl-10 pr-4 text-sm font-bold outline-none"
            style={{ color: theme.text }}
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div>
          <label className="block text-sm font-black" style={{ color: theme.text }}>
            Category
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className="rounded-2xl border px-3 py-2 text-sm font-black transition hover:-translate-y-0.5"
              style={categoryId === "all" ? activeButtonStyle(theme) : inactiveButtonStyle(theme)}
            >
              All
            </button>

            {categories.slice(0, 9).map((category) => {
              const active = categoryId === String(category.id);

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => setCategoryId(String(category.id))}
                  className="rounded-2xl border px-3 py-2 text-sm font-black transition hover:-translate-y-0.5"
                  style={active ? activeButtonStyle(theme) : inactiveButtonStyle(theme)}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        className="rounded-3xl border p-4"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.035),
          borderColor: hexToRgba(theme.primary, 0.1),
        }}
      >
        <div className="text-sm font-black" style={{ color: theme.text }}>
          Quick picks
        </div>

        <div className="mt-3 space-y-2">
          <ToggleLine
            checked={onlyRecommended}
            onChange={setOnlyRecommended}
            label="Recommended / featured"
            theme={theme}
          />

          <ToggleLine
            checked={pickupIncludedOnly}
            onChange={setPickupIncludedOnly}
            label="Pickup available"
            theme={theme}
          />

          <ToggleLine
            checked={depositOnly}
            onChange={setDepositOnly}
            label="Deposit available"
            theme={theme}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-black" style={{ color: theme.text }}>
          Location
        </label>

        <select
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          className="mt-2 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none"
          style={inputStyle(theme)}
        >
          {locations.map((locationItem) => (
            <option key={locationItem} value={locationItem}>
              {locationItem === "all" ? "All locations" : locationItem}
            </option>
          ))}
        </select>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-black" style={{ color: theme.text }}>
            Price
          </label>

          <span className="text-xs font-bold" style={{ color: theme.muted }}>
            Range: ${priceStats.min}–${priceStats.max}
          </span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-3">
          <input
            type="number"
            value={minPrice}
            onChange={(event) =>
              setMinPrice(event.target.value === "" ? "" : Number(event.target.value))
            }
            placeholder="Min"
            className="h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none"
            style={inputStyle(theme)}
          />

          <input
            type="number"
            value={maxPrice}
            onChange={(event) =>
              setMaxPrice(event.target.value === "" ? "" : Number(event.target.value))
            }
            placeholder="Max"
            className="h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none"
            style={inputStyle(theme)}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              if (minPrice !== "" && maxPrice !== "" && minPrice > maxPrice) {
                setMinPrice(maxPrice);
              }

              if (minPrice !== "") setMinPrice(clamp(Number(minPrice), 0, 10000));
              if (maxPrice !== "") setMaxPrice(clamp(Number(maxPrice), 0, 10000));
            }}
            className="rounded-xl border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5"
            style={inactiveButtonStyle(theme)}
          >
            Apply
          </button>

          {[
            { label: "Under $50", min: "", max: 50 },
            { label: "$50–$90", min: 50, max: 90 },
            { label: "$90+", min: 90, max: "" },
          ].map((range) => (
            <button
              key={range.label}
              type="button"
              onClick={() => {
                setMinPrice(range.min === "" ? "" : Number(range.min));
                setMaxPrice(range.max === "" ? "" : Number(range.max));
              }}
              className="rounded-full border px-3 py-1.5 text-xs font-bold transition hover:-translate-y-0.5"
              style={inactiveButtonStyle(theme)}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-black" style={{ color: theme.text }}>
          Duration
        </label>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { key: "all", label: "All" },
            { key: "short", label: "Up to 4h" },
            { key: "half", label: "5–7h" },
            { key: "full", label: "8h+" },
          ].map((duration) => {
            const active = durationBucket === (duration.key as DurationBucket);

            return (
              <button
                key={duration.key}
                type="button"
                onClick={() =>
                  setDurationBucket(duration.key as DurationBucket)
                }
                className="rounded-2xl border px-3 py-2 text-sm font-black transition hover:-translate-y-0.5"
                style={active ? activeButtonStyle(theme) : inactiveButtonStyle(theme)}
              >
                {duration.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-black" style={{ color: theme.text }}>
          Sort by
        </label>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortKey)}
          className="mt-2 h-12 w-full rounded-2xl border px-4 text-sm font-bold outline-none"
          style={inputStyle(theme)}
        >
          <option value="recommended">Recommended</option>
          <option value="rating_high">Rating: high to low</option>
          <option value="price_low">Price: low to high</option>
          <option value="price_high">Price: high to low</option>
          <option value="duration_low">Duration: short to long</option>
          <option value="duration_high">Duration: long to short</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-xl border px-4 py-2 text-sm font-black transition hover:-translate-y-0.5"
          style={inactiveButtonStyle(theme)}
        >
          Clear filters
        </button>

        <span className="text-xs font-bold" style={{ color: theme.muted }}>
          {hasActiveFilters ? "Filters active" : "No filters"}
        </span>
      </div>
    </div>
  );
}

function usePublicTicketingOrganisation(organisationSlugFromUrl?: string) {
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
        setError("Organisation slug is missing.");
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
          throw new Error(data?.detail || "Unable to resolve this domain.");
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
              : "Unable to resolve this domain."
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
  }, [hostname, customDomain, organisationSlugFromUrl]);

  return {
    organisationSlug: organisationSlugFromUrl || resolvedDomain?.organisation_slug || "",
    resolvedDomain,
    loading,
    error,
    isCustomDomain: customDomain,
  };
}

export default function PublicProductsListingPage() {
  const params = useParams();

  const organisationSlugFromUrl = params.organisationSlug || params.slug || "";
  const {
    organisationSlug,
    loading: organisationLoading,
    error: organisationError,
    isCustomDomain,
  } = usePublicTicketingOrganisation(organisationSlugFromUrl);

  const publicPath = (path: string = "/") => {
    if (!organisationSlug) {
      return path || "/";
    }

    if (isCustomDomain) {
      return path || "/";
    }

    const cleanPath = path === "/" ? "" : path;
    return `/experiences/${organisationSlug}${cleanPath}`;
  };

  const listingSegment = getListingSegment(params.listingType);
  const targetProductType = segmentToProductType[listingSegment];
  const labels = segmentLabels[listingSegment];

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [categories, setCategories] = useState<ExperienceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [q, setQ] = useState("");
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState<SortKey>("recommended");
  const [minPrice, setMinPrice] = useState<number | "">("");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [durationBucket, setDurationBucket] = useState<DurationBucket>("all");
  const [onlyRecommended, setOnlyRecommended] = useState(false);
  const [pickupIncludedOnly, setPickupIncludedOnly] = useState(false);
  const [depositOnly, setDepositOnly] = useState(false);
  const [categoryId, setCategoryId] = useState("all");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  async function loadData() {
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
          }),
          ticketingApi.getPublicCategories(organisationSlug),
        ]);

      const publicProducts = productsResponse.filter((product) => {
        if (!product.public_enabled || product.status !== "active") return false;

        if (targetProductType === "all") return true;

        return product.product_type === targetProductType;
      });

      setBranding(brandingResponse);
      setProducts(publicProducts);
      setCategories(Array.isArray(categoriesResponse) ? categoriesResponse : []);
    } catch (err: any) {
      console.error("Could not load public listing:", err);

      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "We could not load this page."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!organisationSlug) return;
    loadData();
  }, [organisationSlug, listingSegment]);

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
  const whatsappUrl = getWhatsappUrl(
    publicSite?.public_whatsapp,
    `Hi, I want information about ${brandName}.`
  );

  useEffect(() => {
    document.title = `${labels.title} | ${brandName}`;
  }, [labels.title, brandName]);

  const locations = useMemo(() => {
    const set = new Set<string>();

    products.forEach((product) => {
      if (product.location?.trim()) set.add(product.location.trim());
    });

    return ["all", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const priceStats = useMemo(() => {
    if (!products.length) return { min: 0, max: 0 };

    return {
      min: Math.floor(getLowestPrice(products)),
      max: Math.ceil(getHighestPrice(products)),
    };
  }, [products]);

  const featured = useMemo(() => {
    return products
      .filter(
        (product) =>
          product.is_best_seller ||
          product.is_featured ||
          product.is_recommended ||
          Number((product as any).average_rating || 0) >= 4.7
      )
      .slice()
      .sort((a, b) => getProductScore(b) - getProductScore(a))
      .slice(0, 3);
  }, [products]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();

    const minP = minPrice === "" ? -Infinity : Number(minPrice);
    const maxP = maxPrice === "" ? Infinity : Number(maxPrice);

    const list = products
      .filter((product) => {
        if (query) {
          const blob =
            `${product.name} ${product.short_description} ${product.long_description} ${product.location} ${getCategoryName(product)}`.toLowerCase();

          if (!blob.includes(query)) return false;
        }

        if (categoryId !== "all" && String(product.category || "") !== categoryId) {
          return false;
        }

        if (location !== "all" && product.location?.trim() !== location) {
          return false;
        }

        const price = Number(product.base_price || 0);

        if (price < minP || price > maxP) return false;

        const duration = parseDuration(product.duration_text);

        if (durationBucket === "short" && !(duration > 0 && duration <= 4)) {
          return false;
        }

        if (durationBucket === "half" && !(duration > 4 && duration <= 7)) {
          return false;
        }

        if (durationBucket === "full" && !(duration > 7)) {
          return false;
        }

        if (
          onlyRecommended &&
          !(
            product.is_featured ||
            product.is_recommended ||
            product.is_best_seller ||
            product.is_top_excursion ||
            product.is_top_transfer
          )
        ) {
          return false;
        }

        if (
          pickupIncludedOnly &&
          !(product.supports_pickup || product.requires_pickup_location)
        ) {
          return false;
        }

        if (depositOnly && !product.allow_deposit_payment) {
          return false;
        }

        return true;
      })
      .slice();

    list.sort((a, b) => {
      const pa = Number(a.base_price || 0);
      const pb = Number(b.base_price || 0);
      const da = parseDuration(a.duration_text);
      const db = parseDuration(b.duration_text);
      const ra = Number((a as any).average_rating || 0);
      const rb = Number((b as any).average_rating || 0);

      switch (sort) {
        case "price_low":
          return pa - pb;
        case "price_high":
          return pb - pa;
        case "duration_low":
          return da - db;
        case "duration_high":
          return db - da;
        case "rating_high":
          return rb - ra;
        case "recommended":
        default:
          return getProductScore(b) - getProductScore(a);
      }
    });

    return list;
  }, [
    products,
    q,
    location,
    categoryId,
    minPrice,
    maxPrice,
    durationBucket,
    sort,
    onlyRecommended,
    pickupIncludedOnly,
    depositOnly,
  ]);

  const clearFilters = () => {
    setQ("");
    setLocation("all");
    setCategoryId("all");
    setSort("recommended");
    setMinPrice("");
    setMaxPrice("");
    setDurationBucket("all");
    setOnlyRecommended(false);
    setPickupIncludedOnly(false);
    setDepositOnly(false);
  };

  const hasActiveFilters =
    Boolean(q.trim()) ||
    location !== "all" ||
    categoryId !== "all" ||
    durationBucket !== "all" ||
    minPrice !== "" ||
    maxPrice !== "" ||
    sort !== "recommended" ||
    onlyRecommended ||
    pickupIncludedOnly ||
    depositOnly;

  const activeChips = useMemo<FilterChip[]>(() => {
    const chips: FilterChip[] = [];

    if (q.trim()) {
      chips.push({
        label: `Search: "${q.trim()}"`,
        onRemove: () => setQ(""),
      });
    }

    if (categoryId !== "all") {
      const category = categories.find((item) => String(item.id) === categoryId);

      chips.push({
        label: `Category: ${category?.name || categoryId}`,
        onRemove: () => setCategoryId("all"),
      });
    }

    if (location !== "all") {
      chips.push({
        label: `Location: ${location}`,
        onRemove: () => setLocation("all"),
      });
    }

    if (minPrice !== "" || maxPrice !== "") {
      const minLabel = minPrice === "" ? "Any" : `$${Number(minPrice)}`;
      const maxLabel = maxPrice === "" ? "Any" : `$${Number(maxPrice)}`;

      chips.push({
        label: `Price: ${minLabel} – ${maxLabel}`,
        onRemove: () => {
          setMinPrice("");
          setMaxPrice("");
        },
      });
    }

    if (durationBucket !== "all") {
      chips.push({
        label:
          durationBucket === "short"
            ? "Duration: up to 4h"
            : durationBucket === "half"
              ? "Duration: 5–7h"
              : "Duration: 8h+",
        onRemove: () => setDurationBucket("all"),
      });
    }

    if (onlyRecommended) {
      chips.push({
        label: "Recommended",
        onRemove: () => setOnlyRecommended(false),
      });
    }

    if (pickupIncludedOnly) {
      chips.push({
        label: "Pickup available",
        onRemove: () => setPickupIncludedOnly(false),
      });
    }

    if (depositOnly) {
      chips.push({
        label: "Deposit available",
        onRemove: () => setDepositOnly(false),
      });
    }

    if (sort !== "recommended") {
      chips.push({
        label:
          sort === "rating_high"
            ? "Sort: rating"
            : sort === "price_low"
              ? "Sort: price low"
              : sort === "price_high"
                ? "Sort: price high"
                : sort === "duration_low"
                  ? "Sort: duration short"
                  : "Sort: duration long",
        onRemove: () => setSort("recommended"),
      });
    }

    return chips;
  }, [
    q,
    categoryId,
    categories,
    location,
    minPrice,
    maxPrice,
    durationBucket,
    onlyRecommended,
    pickupIncludedOnly,
    depositOnly,
    sort,
  ]);

  if (organisationError) {
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
          className="relative max-w-lg overflow-hidden rounded-[2rem] border p-8 text-center shadow-2xl"
          style={{
            backgroundColor: hexToRgba(theme.card, 0.9),
            borderColor: hexToRgba(theme.primary, 0.1),
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
            Public site unavailable
          </h1>

          <p className="mt-3 text-sm font-bold leading-6" style={{ color: theme.muted }}>
            {organisationError}
          </p>
        </div>
      </div>
    );
  }

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
            backgroundColor: hexToRgba(theme.card, 0.9),
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
            Loading experiences...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen overflow-hidden pt-6"
      style={{
        background: `radial-gradient(circle at top left, ${hexToRgba(
          theme.secondary,
          0.14
        )}, transparent 32rem), radial-gradient(circle at top right, ${hexToRgba(
          theme.accent,
          0.13
        )}, transparent 28rem), ${theme.background}`,
        color: theme.text,
      }}
    >
      <style>{`
        @keyframes pcdFloat {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50% { transform: translate3d(0, -14px, 0) rotate(1deg); }
        }

        @keyframes pcdReveal {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes pcdShimmer {
          0% { transform: translateX(-110%); }
          100% { transform: translateX(110%); }
        }

        .pcd-floating {
          animation: pcdFloat 7s ease-in-out infinite;
        }

        .pcd-animate-reveal {
          animation: pcdReveal 640ms cubic-bezier(0.16, 1, 0.3, 1) both;
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
          opacity: 0.34;
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
          .pcd-animate-reveal {
            animation: none !important;
          }
        }
      `}</style>

      <PublicHeader
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
        whatsappUrl={whatsappUrl}
      />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="pcd-floating absolute -left-20 top-32 h-72 w-72 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(theme.secondary, 0.13) }}
        />
        <div
          className="pcd-floating absolute -right-24 top-96 h-96 w-96 rounded-full blur-3xl"
          style={{ backgroundColor: hexToRgba(theme.accent, 0.13) }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6">
        <div
          className="pcd-animate-reveal relative mb-8 overflow-hidden rounded-[2rem] border shadow-2xl"
          style={{
            backgroundColor: hexToRgba(theme.card, 0.9),
            borderColor: hexToRgba(theme.primary, 0.1),
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at top right, ${hexToRgba(
                theme.accent,
                0.18
              )}, transparent 40%), radial-gradient(circle at top left, ${hexToRgba(
                theme.secondary,
                0.14
              )}, transparent 38%)`,
            }}
          />

          <div className="relative p-5 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div
                  className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-black uppercase tracking-wide"
                  style={{
                    backgroundColor: hexToRgba(theme.accent, 0.12),
                    borderColor: hexToRgba(theme.accent, 0.2),
                    color: theme.accent,
                  }}
                >
                  <Sparkles className="h-4 w-4" />
                  {labels.eyebrow}
                </div>

                <h1
                  className="mt-4 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl"
                  style={{ color: theme.text }}
                >
                  {labels.title}
                </h1>

                <p
                  className="mt-3 max-w-2xl text-sm font-semibold leading-7 sm:text-base"
                  style={{ color: theme.muted }}
                >
                  {labels.subtitle}
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <BadgePill theme={theme} tone="accent">
                    <ShieldCheck className="h-4 w-4" />
                    Secure booking
                  </BadgePill>

                  <BadgePill theme={theme} tone="blue">
                    <MapPin className="h-4 w-4" />
                    Pickup options
                  </BadgePill>

                  <BadgePill theme={theme} tone="gray">
                    <Star className="h-4 w-4" />
                    Curated experiences
                  </BadgePill>
                </div>

                {!loading && featured.length > 0 && (
                  <div className="mt-7">
                    <div
                      className="mb-2 text-xs font-black uppercase tracking-wide"
                      style={{ color: theme.muted }}
                    >
                      Featured picks
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {featured.map((product) => (
                        <Link
                          key={product.id}
                          to={publicPath(`/product/${product.slug}`)}
                          className="group inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5 hover:shadow-sm"
                          style={{
                            backgroundColor: theme.card,
                            borderColor: hexToRgba(theme.primary, 0.1),
                            color: theme.text,
                          }}
                        >
                          <span className="max-w-[240px] truncate">
                            {product.name}
                          </span>

                          <span
                            className="rounded-full px-2 py-1 text-[11px] font-black text-white"
                            style={{ backgroundColor: theme.button }}
                          >
                            {money(product.base_price, currencySymbol)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black transition hover:-translate-y-0.5 lg:hidden"
                style={inactiveButtonStyle(theme)}
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </button>
            </div>
          </div>
        </div>

        {activeChips.length > 0 && (
          <div className="mb-5">
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={chip.onRemove}
                  title="Remove filter"
                  className="group inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5"
                  style={inactiveButtonStyle(theme)}
                >
                  {chip.label}

                  <span
                    className="rounded-full border p-1"
                    style={{ borderColor: hexToRgba(theme.primary, 0.16) }}
                  >
                    <X className="h-3 w-3" style={{ color: theme.text }} />
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black text-white transition hover:-translate-y-0.5"
                style={{ backgroundColor: theme.button }}
              >
                Clear all
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 mt-6 flex items-center justify-between gap-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(true)}
            className="flex-1 rounded-2xl px-4 py-3 text-sm font-black text-white"
            style={{ backgroundColor: theme.button }}
          >
            Filters
          </button>

          <div
            className="flex-1 rounded-2xl border px-4 py-3 text-center text-sm font-bold"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.1),
              color: theme.muted,
            }}
          >
            {filtered.length} results
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <aside className="hidden lg:col-span-4 lg:block">
            <div
              className="sticky top-24 rounded-[2rem] border p-6 shadow-xl backdrop-blur-xl"
              style={{
                backgroundColor: hexToRgba(theme.card, 0.92),
                borderColor: hexToRgba(theme.primary, 0.1),
              }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-black" style={{ color: theme.text }}>
                  Filters
                </h2>

                <span className="text-sm font-bold" style={{ color: theme.muted }}>
                  {filtered.length} results
                </span>
              </div>

              <FiltersPanel
                theme={theme}
                q={q}
                setQ={setQ}
                categoryId={categoryId}
                setCategoryId={setCategoryId}
                categories={categories}
                onlyRecommended={onlyRecommended}
                setOnlyRecommended={setOnlyRecommended}
                pickupIncludedOnly={pickupIncludedOnly}
                setPickupIncludedOnly={setPickupIncludedOnly}
                depositOnly={depositOnly}
                setDepositOnly={setDepositOnly}
                location={location}
                setLocation={setLocation}
                locations={locations}
                minPrice={minPrice}
                setMinPrice={setMinPrice}
                maxPrice={maxPrice}
                setMaxPrice={setMaxPrice}
                priceStats={priceStats}
                durationBucket={durationBucket}
                setDurationBucket={setDurationBucket}
                sort={sort}
                setSort={setSort}
                clearFilters={clearFilters}
                hasActiveFilters={Boolean(hasActiveFilters)}
              />
            </div>
          </aside>

          <section className="lg:col-span-8">
            <div
              className="mb-4 rounded-[2rem] border p-4 shadow-xl sm:p-5"
              style={{
                backgroundColor: hexToRgba(theme.card, 0.92),
                borderColor: hexToRgba(theme.primary, 0.1),
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-bold" style={{ color: theme.muted }}>
                    Showing{" "}
                    <span className="font-black" style={{ color: theme.text }}>
                      {filtered.length}
                    </span>{" "}
                    result{filtered.length === 1 ? "" : "s"}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <BadgePill theme={theme} tone="green">
                      <CheckCircle2 className="h-4 w-4" />
                      Deposit booking
                    </BadgePill>

                    <BadgePill theme={theme} tone="blue">
                      <Clock3 className="h-4 w-4" />
                      Easy reservation
                    </BadgePill>

                    <BadgePill theme={theme} tone="accent">
                      <BadgeDollarSign className="h-4 w-4" />
                      Local prices
                    </BadgePill>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label
                    className="text-xs font-black uppercase tracking-wide"
                    style={{ color: theme.muted }}
                  >
                    Sort
                  </label>

                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="rounded-2xl border px-4 py-2.5 text-sm font-black outline-none"
                    style={inputStyle(theme)}
                  >
                    <option value="recommended">Recommended</option>
                    <option value="rating_high">Rating</option>
                    <option value="price_low">Price low</option>
                    <option value="price_high">Price high</option>
                    <option value="duration_low">Duration short</option>
                    <option value="duration_high">Duration long</option>
                  </select>
                </div>
              </div>

              {categories.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryId("all")}
                    className="rounded-full border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5"
                    style={
                      categoryId === "all"
                        ? activeButtonStyle(theme)
                        : inactiveButtonStyle(theme)
                    }
                  >
                    All
                  </button>

                  {categories.slice(0, 8).map((category) => {
                    const active = categoryId === String(category.id);

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => setCategoryId(String(category.id))}
                        className="rounded-full border px-3 py-2 text-xs font-black transition hover:-translate-y-0.5"
                        style={
                          active
                            ? activeButtonStyle(theme)
                            : inactiveButtonStyle(theme)
                        }
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loading ? (
              <div
                className="rounded-[2rem] border p-10 text-center"
                style={{
                  backgroundColor: theme.card,
                  borderColor: hexToRgba(theme.primary, 0.1),
                  color: theme.muted,
                }}
              >
                <Loader2
                  className="mx-auto h-7 w-7 animate-spin"
                  style={{ color: theme.accent }}
                />
                <p className="mt-3 font-bold">Loading...</p>
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((product, index) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    publicPath={publicPath}
                    currencySymbol={currencySymbol}
                    theme={theme}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div
                className="rounded-[2rem] border p-10 text-center shadow-sm"
                style={{
                  backgroundColor: theme.card,
                  borderColor: hexToRgba(theme.primary, 0.12),
                }}
              >
                <div
                  className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl"
                  style={{
                    backgroundColor: hexToRgba(theme.accent, 0.14),
                    color: theme.accent,
                  }}
                >
                  <Flame className="h-7 w-7" />
                </div>

                <p className="mt-3 text-lg font-black" style={{ color: theme.text }}>
                  {labels.emptyTitle}
                </p>

                <p className="mt-2 font-semibold" style={{ color: theme.muted }}>
                  {labels.emptyText}
                </p>

                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-2xl px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5"
                    style={{ backgroundColor: theme.button }}
                  >
                    Clear filters
                  </button>

                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(true)}
                    className="rounded-2xl border px-6 py-3 text-sm font-black transition hover:-translate-y-0.5 lg:hidden"
                    style={inactiveButtonStyle(theme)}
                  >
                    Open filters
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        {mobileFiltersOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              aria-label="Close filters"
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileFiltersOpen(false)}
            />

            <div
              className="absolute right-0 top-0 h-full w-[92%] max-w-md shadow-2xl"
              style={{ backgroundColor: theme.card }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-4"
                style={{ borderColor: hexToRgba(theme.primary, 0.1) }}
              >
                <div>
                  <h2 className="text-lg font-black" style={{ color: theme.text }}>
                    Filters
                  </h2>
                  <p className="text-sm font-bold" style={{ color: theme.muted }}>
                    {filtered.length} results
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-xl border p-2"
                  style={inactiveButtonStyle(theme)}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="h-[calc(100%-64px)] overflow-y-auto p-5">
                <FiltersPanel
                  compact
                  theme={theme}
                  q={q}
                  setQ={setQ}
                  categoryId={categoryId}
                  setCategoryId={setCategoryId}
                  categories={categories}
                  onlyRecommended={onlyRecommended}
                  setOnlyRecommended={setOnlyRecommended}
                  pickupIncludedOnly={pickupIncludedOnly}
                  setPickupIncludedOnly={setPickupIncludedOnly}
                  depositOnly={depositOnly}
                  setDepositOnly={setDepositOnly}
                  location={location}
                  setLocation={setLocation}
                  locations={locations}
                  minPrice={minPrice}
                  setMinPrice={setMinPrice}
                  maxPrice={maxPrice}
                  setMaxPrice={setMaxPrice}
                  priceStats={priceStats}
                  durationBucket={durationBucket}
                  setDurationBucket={setDurationBucket}
                  sort={sort}
                  setSort={setSort}
                  clearFilters={clearFilters}
                  hasActiveFilters={Boolean(hasActiveFilters)}
                />

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(false)}
                    className="w-full rounded-2xl px-4 py-3 text-sm font-black text-white"
                    style={{ backgroundColor: theme.button }}
                  >
                    Show results ({filtered.length})
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleLine({
  checked,
  onChange,
  label,
  theme,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  theme: PublicTheme;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold" style={{ color: theme.muted }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded"
        style={{ accentColor: theme.accent }}
      />
      {label}
    </label>
  );
}

function PublicHeader({
  publicPath,
  brandName,
  logoUrl,
  theme,
  whatsappUrl,
}: {
  publicPath: (path: string) => string;
  brandName: string;
  logoUrl: string;
  theme: PublicTheme;
  whatsappUrl: string;
}) {
  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-2xl"
      style={{
        backgroundColor: hexToRgba(theme.card, 0.82),
        borderColor: hexToRgba(theme.primary, 0.1),
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to={publicPath("/")} className="group flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl ring-1 transition group-hover:scale-105"
            style={{
              backgroundColor: hexToRgba(theme.accent, 0.15),
              color: theme.accent,
              borderColor: hexToRgba(theme.accent, 0.15),
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

        <div className="flex items-center gap-2">
          <Link
            to={publicPath("/")}
            className="rounded-2xl border px-4 py-2 text-sm font-black transition hover:-translate-y-0.5"
            style={inactiveButtonStyle(theme)}
          >
            Home
          </Link>

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black text-white transition hover:-translate-y-0.5 sm:inline-flex"
              style={{ backgroundColor: theme.button }}
            >
              <MessageCircle className="h-4 w-4" />
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </header>
  );
}

function ProductCard({
  product,
  publicPath,
  currencySymbol,
  theme,
  index = 0,
}: {
  product: ExperienceProduct;
  publicPath: (path: string) => string;
  currencySymbol: string;
  theme: PublicTheme;
  index?: number;
}) {
  const imageUrl = getImage(product);
  const Icon = getProductTypeIcon(product.product_type);
  const isTop = product.is_best_seller || product.is_recommended || product.is_featured;

  return (
    <Link
      to={publicPath(`/product/${product.slug}`)}
      className="pcd-glow-card pcd-animate-reveal group rounded-[2rem] border p-[1px] shadow-sm transition hover:-translate-y-2 hover:shadow-2xl"
      style={{
        animationDelay: `${Math.min(index * 45, 280)}ms`,
        backgroundColor: hexToRgba(theme.primary, 0.08),
        borderColor: hexToRgba(theme.primary, 0.08),
      }}
    >
      <article
        className="h-full overflow-hidden rounded-[1.95rem]"
        style={{ backgroundColor: theme.card }}
      >
        <div className="relative aspect-[4/3] overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={product.image_alt_text || product.name}
              className="h-full w-full object-cover transition duration-700 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <div
              className="grid h-full place-items-center"
              style={{ backgroundColor: hexToRgba(theme.primary, 0.04) }}
            >
              <ImageIcon className="h-10 w-10" style={{ color: theme.muted }} />
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent" />

          <div className="absolute left-3 top-3 flex flex-wrap gap-2">
            {product.is_best_seller && (
              <span
                className="rounded-full px-3 py-1 text-xs font-black shadow backdrop-blur"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: theme.text,
                }}
              >
                Most booked
              </span>
            )}

            {product.is_recommended && !product.is_best_seller && (
              <span
                className="rounded-full px-3 py-1 text-xs font-black shadow backdrop-blur"
                style={{
                  backgroundColor: "rgba(255,255,255,0.9)",
                  color: theme.text,
                }}
              >
                Recommended
              </span>
            )}

            {isTop && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black shadow"
                style={{
                  backgroundColor: theme.accent,
                  color: theme.primary,
                }}
              >
                <Star className="h-3.5 w-3.5" />
                Top
              </span>
            )}
          </div>

          <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-white/70">
                From
              </p>
              <p className="text-2xl font-black text-white">
                {money(product.base_price, currencySymbol)}
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

        <div className="p-5">
          <div className="mb-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-black"
            style={{
              backgroundColor: hexToRgba(theme.accent, 0.12),
              color: theme.accent,
            }}
          >
            <Icon className="h-3.5 w-3.5" />
            {getTypeLabel(product.product_type)}
          </div>

          <h3
            className="line-clamp-2 text-lg font-black leading-snug"
            style={{ color: theme.text }}
          >
            {product.name}
          </h3>

          <p
            className="mt-2 line-clamp-2 text-sm font-semibold leading-6"
            style={{ color: theme.muted }}
          >
            {product.short_description || product.long_description || "Book this experience online."}
          </p>

          <div className="mt-4 space-y-2 text-sm font-bold" style={{ color: theme.muted }}>
            {product.duration_text && (
              <div className="flex items-center gap-2">
                <Clock3 className="h-4 w-4" style={{ color: theme.accent }} />
                {product.duration_text}
              </div>
            )}

            {product.location && (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" style={{ color: theme.accent }} />
                {product.location}
              </div>
            )}

            {(product.supports_pickup || product.requires_pickup_location) && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Pickup available
              </div>
            )}
          </div>

          <div className="mt-5 inline-flex items-center text-sm font-black" style={{ color: theme.text }}>
            Explore
            <span className="ml-2 transition group-hover:translate-x-1">→</span>
          </div>
        </div>
      </article>
    </Link>
  );
}
