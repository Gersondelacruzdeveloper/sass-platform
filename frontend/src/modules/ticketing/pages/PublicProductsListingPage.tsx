// src/modules/ticketing/pages/PublicProductsListingPage.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  BadgeDollarSign,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  Image as ImageIcon,
  Loader2,
  MapPin,
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

  if (Array.isArray(product.gallery)) {
    for (const item of product.gallery) {
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

  score += Number(product.average_rating || 0) * 5;
  score += Math.min(Number(product.booking_count || 0), 100) / 5;

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

function BadgePill({
  children,
  tone = "gray",
}: {
  children: React.ReactNode;
  tone?: "gray" | "orange" | "green" | "blue";
}) {
  const tones: Record<string, string> = {
    gray: "bg-white ring-1 ring-gray-200 text-gray-800",
    orange: "bg-orange-50 ring-1 ring-orange-100 text-orange-800",
    green: "bg-emerald-50 ring-1 ring-emerald-100 text-emerald-800",
    blue: "bg-sky-50 ring-1 ring-sky-100 text-sky-800",
  };

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold",
        tones[tone],
      ].join(" ")}
    >
      {children}
    </span>
  );
}

type FiltersPanelProps = {
  compact?: boolean;

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

function FiltersPanel({
  compact = false,

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
        <label className="block text-sm font-medium text-gray-700">
          Search
        </label>

        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Saona, buggy, airport, nightlife..."
            className="w-full rounded-2xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
          />
        </div>
      </div>

      {categories.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Category
          </label>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setCategoryId("all")}
              className={[
                "rounded-2xl border px-3 py-2 text-sm font-extrabold",
                categoryId === "all"
                  ? "border-gray-900 bg-gray-900 text-white"
                  : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
              ].join(" ")}
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
                  className={[
                    "rounded-2xl border px-3 py-2 text-sm font-extrabold",
                    active
                      ? "border-gray-900 bg-gray-900 text-white"
                      : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="text-sm font-extrabold text-gray-900">
          Quick picks
        </div>

        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={onlyRecommended}
              onChange={(event) => setOnlyRecommended(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Recommended / featured
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={pickupIncludedOnly}
              onChange={(event) => setPickupIncludedOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Pickup available
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={depositOnly}
              onChange={(event) => setDepositOnly(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Deposit available
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Location
        </label>

        <div className="mt-2">
          <select
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
          >
            {locations.map((locationItem) => (
              <option key={locationItem} value={locationItem}>
                {locationItem === "all" ? "All locations" : locationItem}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">
            Price
          </label>

          <span className="text-xs text-gray-500">
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
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
          />

          <input
            type="number"
            value={maxPrice}
            onChange={(event) =>
              setMaxPrice(event.target.value === "" ? "" : Number(event.target.value))
            }
            placeholder="Max"
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
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
            className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50"
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
              className="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
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
                className={[
                  "rounded-2xl border px-3 py-2 text-sm font-extrabold",
                  active
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
                ].join(" ")}
              >
                {duration.label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Sort by
        </label>

        <div className="mt-2">
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as SortKey)}
            className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-300 focus:ring-2 focus:ring-gray-100"
          >
            <option value="recommended">Recommended</option>
            <option value="rating_high">Rating: high to low</option>
            <option value="price_low">Price: low to high</option>
            <option value="price_high">Price: high to low</option>
            <option value="duration_low">Duration: short to long</option>
            <option value="duration_high">Duration: long to short</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Clear filters
        </button>

        <span className="text-xs text-gray-500">
          {hasActiveFilters ? "Filters active" : "No filters"}
        </span>
      </div>
    </div>
  );
}

export default function PublicProductsListingPage() {
  const params = useParams();

  const organisationSlug = params.organisationSlug || params.slug || "";
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
      setCategories(categoriesResponse);
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
    loadData();
  }, [organisationSlug, listingSegment]);

  const publicSite = branding?.public_site;
  const ticketingSettings = branding?.ticketing_settings;
  const organisation = branding?.organisation;

  const brandName =
    publicSite?.site_title ||
    publicSite?.display_title ||
    ticketingSettings?.public_brand_name ||
    organisation?.name ||
    "PCD Experiences";

  const currencySymbol = ticketingSettings?.currency_symbol || "US$";
  const logoUrl = resolveAssetUrl(publicSite?.logo_url || publicSite?.logo);

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

    const prices = products.map((product) => Number(product.base_price || 0));

    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    };
  }, [products]);

  const featured = useMemo(() => {
    return products
      .filter(
        (product) =>
          product.is_best_seller ||
          product.is_featured ||
          product.is_recommended ||
          Number(product.average_rating || 0) >= 4.7
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
      const ra = Number(a.average_rating || 0);
      const rb = Number(b.average_rating || 0);

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-white to-white pt-6">
      <PublicHeader
        organisationSlug={organisationSlug}
        brandName={brandName}
        logoUrl={logoUrl}
      />

      <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6">
        <div className="relative mb-8 overflow-hidden rounded-3xl border-2 border-gray-100 bg-white shadow-sm">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(249,115,22,0.18),transparent_55%)]" />

          <div className="relative p-5 sm:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800 ring-1 ring-orange-100">
                  <Sparkles className="h-4 w-4" />
                  {labels.eyebrow}
                </div>

                <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-gray-900 sm:text-4xl">
                  {labels.title}
                </h1>

                <p className="mt-2 max-w-2xl text-gray-600">
                  {labels.subtitle}
                </p>

                <div className="mt-5 flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-gray-800 ring-1 ring-gray-200">
                    <ShieldCheck className="h-4 w-4 text-orange-700" />
                    Secure booking
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-gray-800 ring-1 ring-gray-200">
                    <MapPin className="h-4 w-4 text-orange-700" />
                    Pickup options
                  </span>

                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-gray-800 ring-1 ring-gray-200">
                    <Star className="h-4 w-4 text-orange-700" />
                    Curated experiences
                  </span>
                </div>

                {!loading && featured.length > 0 && (
                  <div className="mt-6">
                    <div className="mb-2 text-xs font-extrabold text-gray-800">
                      Featured picks
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {featured.map((product) => (
                        <Link
                          key={product.id}
                          to={`/experiences/${organisationSlug}/product/${product.slug}`}
                          className="group inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:shadow-sm"
                        >
                          <span className="max-w-[240px] truncate">
                            {product.name}
                          </span>

                          <span className="rounded-full bg-gray-900 px-2 py-1 text-[11px] text-white">
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
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-extrabold text-gray-900 transition hover:shadow lg:hidden"
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
                  className="group inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-800 hover:bg-gray-50"
                >
                  {chip.label}

                  <span className="rounded-full border border-gray-200 p-1 group-hover:border-gray-300">
                    <X className="h-3 w-3 text-gray-700" />
                  </span>
                </button>
              ))}

              <button
                type="button"
                onClick={clearFilters}
                className="ml-1 inline-flex items-center gap-2 rounded-full bg-gray-900 px-3 py-2 text-xs font-extrabold text-white hover:bg-black"
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
            className="flex-1 rounded-2xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white"
          >
            Filters
          </button>

          <div className="flex-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-center text-sm text-gray-700">
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
            <div className="sticky top-24 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-extrabold text-gray-900">
                  Filters
                </h2>

                <span className="text-sm text-gray-500">
                  {filtered.length} results
                </span>
              </div>

              <FiltersPanel
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
            <div className="mb-4 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm text-gray-600">
                    Showing{" "}
                    <span className="font-extrabold text-gray-900">
                      {filtered.length}
                    </span>{" "}
                    result{filtered.length === 1 ? "" : "s"}
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <BadgePill tone="green">
                      <CheckCircle2 className="h-4 w-4" />
                      Deposit booking
                    </BadgePill>

                    <BadgePill tone="blue">
                      <Clock3 className="h-4 w-4" />
                      Easy reservation
                    </BadgePill>

                    <BadgePill tone="orange">
                      <BadgeDollarSign className="h-4 w-4" />
                      Local prices
                    </BadgePill>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-600">
                    Sort
                  </label>

                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as SortKey)}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-bold text-gray-900 outline-none focus:ring-2 focus:ring-gray-100"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="rating_high">Rating</option>
                    <option value="price_low">Price (low)</option>
                    <option value="price_high">Price (high)</option>
                    <option value="duration_low">Duration (short)</option>
                    <option value="duration_high">Duration (long)</option>
                  </select>
                </div>
              </div>

              {categories.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryId("all")}
                    className={[
                      "rounded-full border px-3 py-2 text-xs font-extrabold transition",
                      categoryId === "all"
                        ? "border-gray-900 bg-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
                    ].join(" ")}
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
                        className={[
                          "rounded-full border px-3 py-2 text-xs font-extrabold transition",
                          active
                            ? "border-gray-900 bg-gray-900 text-white"
                            : "border-gray-200 bg-white text-gray-800 hover:bg-gray-50",
                        ].join(" ")}
                      >
                        {category.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {loading ? (
              <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center text-gray-600">
                <Loader2 className="mx-auto h-7 w-7 animate-spin text-orange-500" />
                <p className="mt-3 font-bold">Loading...</p>
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {filtered.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    organisationSlug={organisationSlug}
                    currencySymbol={currencySymbol}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-3xl border border-gray-200 bg-white p-10 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50">
                  <Flame className="h-6 w-6 text-orange-700" />
                </div>

                <p className="mt-3 font-extrabold text-gray-900">
                  {labels.emptyTitle}
                </p>

                <p className="mt-2 text-gray-600">{labels.emptyText}</p>

                <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-2xl bg-gray-900 px-6 py-3 text-sm font-extrabold text-white hover:bg-black"
                  >
                    Clear filters
                  </button>

                  <button
                    type="button"
                    onClick={() => setMobileFiltersOpen(true)}
                    className="rounded-2xl border border-gray-200 bg-white px-6 py-3 text-sm font-extrabold text-gray-900 hover:bg-gray-50 lg:hidden"
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
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileFiltersOpen(false)}
            />

            <div className="absolute right-0 top-0 h-full w-[92%] max-w-md bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                <div>
                  <h2 className="text-lg font-extrabold text-gray-900">
                    Filters
                  </h2>
                  <p className="text-sm text-gray-500">
                    {filtered.length} results
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-xl border border-gray-200 p-2"
                  aria-label="Close"
                >
                  <X className="h-5 w-5 text-gray-700" />
                </button>
              </div>

              <div className="h-[calc(100%-64px)] overflow-y-auto p-5">
                <FiltersPanel
                  compact
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
                    className="w-full rounded-2xl bg-gray-900 px-4 py-3 text-sm font-extrabold text-white"
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

function PublicHeader({
  organisationSlug,
  brandName,
  logoUrl,
}: {
  organisationSlug: string;
  brandName: string;
  logoUrl: string;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to={`/experiences/${organisationSlug}`} className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-orange-50 text-orange-700 ring-1 ring-orange-100">
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
            <p className="text-sm font-black text-gray-950">{brandName}</p>
            <p className="text-xs font-bold text-gray-500">
              Tours, Tickets & Transfers
            </p>
          </div>
        </Link>

        <Link
          to={`/experiences/${organisationSlug}`}
          className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-extrabold text-gray-900 hover:bg-gray-50"
        >
          Home
        </Link>
      </div>
    </header>
  );
}

function ProductCard({
  product,
  organisationSlug,
  currencySymbol,
}: {
  product: ExperienceProduct;
  organisationSlug: string;
  currencySymbol: string;
}) {
  const imageUrl = getImage(product);
  const Icon = getProductTypeIcon(product.product_type);

  return (
    <Link
      to={`/experiences/${organisationSlug}/product/${product.slug}`}
      className="group overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-gray-100">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.image_alt_text || product.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <ImageIcon className="h-10 w-10 text-gray-300" />
          </div>
        )}

        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          {product.is_best_seller && (
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-900 shadow">
              Most booked
            </span>
          )}

          {product.is_recommended && !product.is_best_seller && (
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-gray-900 shadow">
              Recommended
            </span>
          )}
        </div>
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-[11px] font-extrabold text-orange-800">
              <Icon className="h-3.5 w-3.5" />
              {getTypeLabel(product.product_type)}
            </div>

            <h3 className="line-clamp-2 text-lg font-bold leading-snug text-gray-900">
              {product.name}
            </h3>

            <p className="mt-1 line-clamp-2 text-sm text-gray-600">
              {product.short_description || product.long_description}
            </p>
          </div>

          <div className="shrink-0 text-right text-sm font-bold text-orange-600">
            {money(product.base_price, currencySymbol)}
          </div>
        </div>

        <div className="mt-4 space-y-2 text-sm text-gray-600">
          {product.duration_text && (
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-orange-700" />
              {product.duration_text}
            </div>
          )}

          {product.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-orange-700" />
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

        <div className="mt-4 inline-flex items-center text-sm font-semibold text-gray-900">
          Explore
          <span className="ml-2 transition group-hover:translate-x-1">→</span>
        </div>
      </div>
    </Link>
  );
}
