// src/modules/ticketing/pages/PublicProductDetailPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ElementType, ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MapPin,
  Minus,
  Package,
  Plane,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Users,
  X,
  XCircle,
  Zap,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import { ticketingLanguageOptions, useTicketingTranslation } from "../i18n";
import type {
  ExperienceProduct,
  ProductAvailability,
  PickupLocation,
  PickupResolveResponse,
  ProductPickupSchedule,
  ProductType,
  PublicBrandingResponse,
  SupportedProductLanguage,
} from "../types/ticketingTypes";

type QtyKey = "adult" | "child" | "infant";
type BookingQty = Record<QtyKey, number>;
type PaymentChoice = "deposit" | "full" | "pending" | "cash";

type Notice = {
  type: "share" | "checkout";
  title: string;
  subtitle?: string;
};

type GalleryImage = {
  image: string;
  caption: string;
};

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

type PickupScheduleRule = ProductPickupSchedule & {
  pickup_location?: number | string | null;
  pickup_location_id?: number | string | null;
  pickup_location_name?: string;
  day_of_week?: number | string | null;
  specific_date?: string | null;
  pickup_time?: string | null;
  pickup_point?: string | null;
  resolved_pickup_point?: string | null;
  instructions?: string | null;
  is_active?: boolean;
};

type PickupAvailabilitySummary = {
  hasSchedules: boolean;
  dayLabels: string[];
  specificDateLabels: string[];
  timeLabels: string[];
  selectedLocationHasSchedules: boolean;
  message: string;
};

type TransferPriceBand = {
  id: number;
  route?: number | string | null;
  route_id?: number | string | null;
  route_name?: string;
  name?: string;
  min_passengers: number | string;
  max_passengers: number | string;
  vehicle_type?: string | null;
  one_way_price: number | string;
  round_trip_price?: number | string | null;
  is_active?: boolean;
  sort_order?: number;
};

type TransferRouteOption = {
  id: number;
  product?: number | string | null;
  origin?: string | null;
  destination?: string | null;
  from_location?: string | null;
  to_location?: string | null;
  airport?: string | null;
  vehicle_type?: string | null;
  is_round_trip?: boolean;
  base_passengers?: number | string | null;
  max_passengers?: number | string | null;
  price?: number | string | null;
  round_trip_price?: number | string | null;
  is_active?: boolean;
  price_bands?: TransferPriceBand[];
};

type AdvancedAvailabilityRecord = ProductAvailability & {
  date: string;
  available_capacity?: number | string | null;
  booked_quantity?: number | string | null;
  remaining_capacity?: number | string | null;
  price_override?: number | string | null;
  deposit_override?: number | string | null;
  is_available?: boolean;
  note?: string;
};

type LiveTicketOption = {
  provider: "wellet" | "local" | string;
  external_product_id?: string;
  external_variant_id?: string;
  external_availability_id?: string;
  name?: string;
  option_name?: string;
  price?: number | string;
  currency?: string;
  available?: boolean;
  available_quantity?: number | null;
  sold_out?: boolean;
  service_date?: string;
  start_time?: string;
  end_time?: string;
  checkin_time?: string;
  performance_id?: string;
  description?: string;
  features?: string[];
  high_demand?: boolean;
  raw?: unknown;
};

type LiveAvailabilityResponse = {
  ok: boolean;
  provider: "wellet" | "local" | string;
  product?: {
    id: number;
    name: string;
    slug: string;
    external_product_id?: string;
  };
  service_date?: string;
  options: LiveTicketOption[];
  error?: string;
};

const productTypeLabels: Record<ProductType, string> = {
  excursion: "Excursion",
  transfer: "Transfer",
  ticket: "Ticket",
  event: "Event",
  nightlife: "Nightlife",
  custom: "Custom",
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

function money(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function money2(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(value?: string | null) {
  if (!value) return "";

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);

  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesRaw || "00"} ${suffix}`;
}

function formatLiveTime(value?: string | null) {
  if (!value) return "";

  const cleanValue = String(value).trim();

  if (/\b(am|pm)\b/i.test(cleanValue)) {
    return cleanValue.toUpperCase();
  }

  return formatTime(cleanValue);
}

const pickupWeekdayLabels = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function getBackendDayFromDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return null;

  const jsDay = date.getDay();

  return (jsDay + 6) % 7;
}

function formatDateLabel(value?: string | null) {
  if (!value) return "";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function getPickupLocationIdFromSchedule(schedule: PickupScheduleRule) {
  return String(
    schedule.pickup_location ||
      schedule.pickup_location_id ||
      (schedule as any).location ||
      ""
  );
}

function getProductPickupSchedules(
  product: ExperienceProduct | null
): PickupScheduleRule[] {
  if (!product) return [];

  const schedules = Array.isArray((product as any).pickup_schedules)
    ? ((product as any).pickup_schedules as PickupScheduleRule[])
    : [];

  return schedules.filter((schedule) => schedule.is_active !== false);
}

function getSchedulesForPickupLocation(
  schedules: PickupScheduleRule[],
  pickupLocationId?: string
) {
  if (!pickupLocationId) return schedules;

  return schedules.filter((schedule) => {
    const scheduleLocationId = getPickupLocationIdFromSchedule(schedule);

    return !scheduleLocationId || scheduleLocationId === pickupLocationId;
  });
}

function uniqueSortedTimes(schedules: PickupScheduleRule[]) {
  return Array.from(
    new Set(
      schedules
        .map((schedule) => schedule.pickup_time || "")
        .filter(Boolean)
        .sort()
    )
  ).map(formatTime);
}

function summarizePickupAvailability(
  product: ExperienceProduct | null,
  pickupLocationId?: string
): PickupAvailabilitySummary {
  const allSchedules = getProductPickupSchedules(product);
  const locationSchedules = getSchedulesForPickupLocation(
    allSchedules,
    pickupLocationId
  );

  const schedulesToDisplay = pickupLocationId ? locationSchedules : allSchedules;

  if (!allSchedules.length) {
    return {
      hasSchedules: false,
      dayLabels: [],
      specificDateLabels: [],
      timeLabels: [],
      selectedLocationHasSchedules: false,
      message:
        "Pickup schedules have not been published for this product yet.",
    };
  }

  if (pickupLocationId && !locationSchedules.length) {
    return {
      hasSchedules: true,
      dayLabels: [],
      specificDateLabels: [],
      timeLabels: [],
      selectedLocationHasSchedules: false,
      message:
        "This hotel does not have a pickup schedule for this product yet.",
    };
  }

  const hasDailyFallback = schedulesToDisplay.some(
    (schedule) =>
      (schedule.day_of_week === null ||
        schedule.day_of_week === undefined) &&
      !schedule.specific_date
  );

  const dayLabels = hasDailyFallback
    ? ["Every day"]
    : Array.from(
        new Set(
          schedulesToDisplay
            .filter((schedule) => !schedule.specific_date)
            .map((schedule) => Number(schedule.day_of_week))
            .filter((day) => !Number.isNaN(day) && day >= 0 && day <= 6)
            .sort((a, b) => a - b)
            .map((day) => pickupWeekdayLabels[day])
        )
      );

  const specificDateLabels = Array.from(
    new Set(
      schedulesToDisplay
        .map((schedule) => schedule.specific_date || "")
        .filter(Boolean)
        .sort()
        .map(formatDateLabel)
    )
  );

  const timeLabels = uniqueSortedTimes(schedulesToDisplay);

  return {
    hasSchedules: true,
    dayLabels,
    specificDateLabels,
    timeLabels,
    selectedLocationHasSchedules: true,
    message: pickupLocationId
      ? "These are the available pickup rules for the selected hotel."
      : "Select a hotel to see the exact pickup time for that location.",
  };
}

function isPickupDateAllowed(
  product: ExperienceProduct | null,
  date: string,
  pickupLocationId?: string
) {
  if (!product || !date) return true;

  const allSchedules = getProductPickupSchedules(product);

  if (!allSchedules.length) return true;

  const schedules = getSchedulesForPickupLocation(allSchedules, pickupLocationId);

  if (pickupLocationId && !schedules.length) return false;

  const backendDay = getBackendDayFromDate(date);

  if (backendDay === null) return false;

  return schedules.some((schedule) => {
    if (schedule.specific_date) {
      return schedule.specific_date === date;
    }

    if (schedule.day_of_week === null || schedule.day_of_week === undefined) {
      return true;
    }

    return Number(schedule.day_of_week) === backendDay;
  });
}

function getProductAvailabilityRecords(
  product: ExperienceProduct | null
): AdvancedAvailabilityRecord[] {
  if (!product) return [];

  const records = Array.isArray((product as any).availability)
    ? ((product as any).availability as AdvancedAvailabilityRecord[])
    : [];

  return records
    .filter((record) => Boolean(record.date))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

function getAvailabilityForDate(
  product: ExperienceProduct | null,
  date: string
): AdvancedAvailabilityRecord | null {
  if (!product || !date) return null;

  return (
    getProductAvailabilityRecords(product).find((record) => record.date === date) ||
    null
  );
}

function getRemainingCapacity(record: AdvancedAvailabilityRecord | null) {
  if (!record) return null;

  if (record.remaining_capacity !== undefined && record.remaining_capacity !== null) {
    const value = Number(record.remaining_capacity);
    return Number.isNaN(value) ? null : value;
  }

  const capacity = Number(record.available_capacity || 0);
  const booked = Number(record.booked_quantity || 0);

  if (Number.isNaN(capacity) || Number.isNaN(booked)) return null;

  return Math.max(0, capacity - booked);
}

function isAdvancedAvailabilityDateAllowed(
  product: ExperienceProduct | null,
  date: string
) {
  if (!product || !date) return true;

  const records = getProductAvailabilityRecords(product);

  // Advanced Availability is optional. If the owner has not created availability
  // records, the public page falls back to Pickup Times / product rules.
  if (!records.length) return true;

  const selectedRecord = getAvailabilityForDate(product, date);

  if (!selectedRecord) return false;
  if (selectedRecord.is_available === false) return false;

  const remaining = getRemainingCapacity(selectedRecord);

  if (remaining !== null && remaining <= 0) return false;

  return true;
}

function getPassengerBasePrice(product: ExperienceProduct, key: QtyKey) {
  const productAny = product as any;

  if (key === "adult") {
    return Number(productAny.adult_price ?? product.base_price ?? 0);
  }

  if (key === "child") {
    return Number(productAny.child_price ?? 0);
  }

  return Number(productAny.infant_price ?? 0);
}

function getEffectivePassengerPrice(
  product: ExperienceProduct,
  selectedAvailability: AdvancedAvailabilityRecord | null,
  key: QtyKey
) {
  const override = selectedAvailability?.price_override;

  // Availability price override is treated as the adult/general price for that date.
  // Child and infant prices still come from the product passenger pricing fields.
  if (
    key === "adult" &&
    override !== undefined &&
    override !== null &&
    override !== ""
  ) {
    return Number(override || 0);
  }

  return getPassengerBasePrice(product, key);
}

function getEffectiveAdultPrice(
  product: ExperienceProduct,
  selectedAvailability: AdvancedAvailabilityRecord | null
) {
  return getEffectivePassengerPrice(product, selectedAvailability, "adult");
}

function getPassengerSubtotal(
  product: ExperienceProduct,
  selectedAvailability: AdvancedAvailabilityRecord | null,
  qty: BookingQty
) {
  return (
    qty.adult * getEffectivePassengerPrice(product, selectedAvailability, "adult") +
    qty.child * getEffectivePassengerPrice(product, selectedAvailability, "child") +
    qty.infant * getEffectivePassengerPrice(product, selectedAvailability, "infant")
  );
}

function getEffectiveDepositAmount(
  product: ExperienceProduct,
  selectedAvailability: AdvancedAvailabilityRecord | null
) {
  const override = selectedAvailability?.deposit_override;

  if (override !== undefined && override !== null && override !== "") {
    return Number(override || 0);
  }

  return Number(product.deposit_amount || 0);
}

function isExternalLiveProduct(product: ExperienceProduct | null) {
  if (!product) return false;

  const provider = String((product as any).external_provider || "").toLowerCase();
  const slug = String((product as any).slug || "").toLowerCase();
  const name = String((product as any).name || "").toLowerCase();
  const externalProductId = String((product as any).external_product_id || "").toLowerCase();

  return (
    provider === "wellet" ||
    Boolean((product as any).is_cocobongo_product) ||
    slug.includes("coco-bongo") ||
    name.includes("coco bongo") ||
    externalProductId.includes("coco-bongo")
  );
}

function getLiveOptionKey(option: LiveTicketOption) {
  return String(
    option.external_availability_id ||
      option.external_variant_id ||
      option.external_product_id ||
      option.option_name ||
      option.name ||
      ""
  );
}

function getLiveOptionLabel(option: LiveTicketOption) {
  return option.option_name || option.name || "Ticket option";
}

function getLiveOptionPrice(option: LiveTicketOption | null) {
  if (!option) return 0;

  return Number(option.price || 0);
}

function isTransferProduct(product: ExperienceProduct | null) {
  return String(product?.product_type || "").toLowerCase() === "transfer";
}

function getTransferRoutes(product: ExperienceProduct | null): TransferRouteOption[] {
  if (!product) return [];

  const routes = Array.isArray((product as any).transfer_routes)
    ? ((product as any).transfer_routes as TransferRouteOption[])
    : [];

  return routes.filter((route) => route.is_active !== false);
}

function getTransferRouteLabel(route: TransferRouteOption | null) {
  if (!route) return "Select route";

  const origin = route.from_location || route.origin || "Origin";
  const destination = route.to_location || route.destination || "Destination";

  return `${origin} → ${destination}`;
}

function getTransferPriceBands(route: TransferRouteOption | null): TransferPriceBand[] {
  if (!route || !Array.isArray(route.price_bands)) return [];

  return route.price_bands
    .filter((band) => band.is_active !== false)
    .sort((a, b) => {
      const sortA = Number(a.sort_order || 0);
      const sortB = Number(b.sort_order || 0);

      if (sortA !== sortB) return sortA - sortB;

      return Number(a.min_passengers || 0) - Number(b.min_passengers || 0);
    });
}

function getTransferPriceBandForPassengers(
  route: TransferRouteOption | null,
  passengers: number
) {
  return (
    getTransferPriceBands(route).find((band) => {
      const min = Number(band.min_passengers || 0);
      const max = Number(band.max_passengers || 0);

      return passengers >= min && passengers <= max;
    }) || null
  );
}

function getTransferRouteLegacyPrice(
  route: TransferRouteOption | null,
  roundTrip: boolean
) {
  if (!route) return 0;

  if (roundTrip && route.round_trip_price !== null && route.round_trip_price !== undefined) {
    return Number(route.round_trip_price || 0);
  }

  return Number(route.price || 0);
}

function getTransferBandPrice(
  band: TransferPriceBand | null,
  roundTrip: boolean
) {
  if (!band) return 0;

  if (roundTrip && band.round_trip_price !== null && band.round_trip_price !== undefined) {
    return Number(band.round_trip_price || 0);
  }

  const oneWay = Number(band.one_way_price || 0);

  return roundTrip ? oneWay * 2 : oneWay;
}

function cleanLiveText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function getRawPrice(product: Record<string, any>) {
  const prices = Array.isArray(product.prices) ? product.prices : [];
  const firstPrice = asObject(prices[0]) || {};

  const amount =
    firstPrice.amount ??
    firstPrice.amountWithoutDiscount ??
    product.amount ??
    product.price ??
    0;

  const currency =
    firstPrice.currencyCode ||
    firstPrice.currency ||
    product.currencyCode ||
    product.currency ||
    "USD";

  return {
    amount: Number(amount || 0),
    currency: String(currency || "USD"),
    raw: firstPrice,
  };
}

function getRawAvailableQuantity(product: Record<string, any>) {
  const value = product.itemsAvailable ?? product.stock ?? product.available_quantity;

  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function flattenRawWelletProducts(option: LiveTicketOption): LiveTicketOption[] {
  const raw = asObject(option.raw);

  if (!raw) return [option];

  const performance = asObject(raw.performance) || {};
  const products = Array.isArray(raw.products)
    ? raw.products
    : raw.product && typeof raw.product === "object"
      ? [raw.product]
      : [];

  if (!products.length) return [option];

  const performanceId = cleanLiveText(performance.id);
  const startTime = cleanLiveText(
    performance.timeStart || performance.time || performance.startTime
  );
  const endTime = cleanLiveText(performance.timeEnd || performance.endTime);
  const checkinTime = cleanLiveText(performance.timeCheckIn);

  return products
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const productItem = item as Record<string, any>;
      const price = getRawPrice(productItem);
      const productId = cleanLiveText(productItem.id);
      const availableQuantity = getRawAvailableQuantity(productItem);

      const soldOut =
        productItem.isSoldOut === true ||
        productItem.isSoldOut === "true" ||
        productItem.isUnavailable === true ||
        productItem.isUnavailable === "true";

      const hasQuantity = availableQuantity === null || availableQuantity > 0;

      const available =
        option.available !== false &&
        option.sold_out !== true &&
        performance.isActive !== false &&
        !soldOut &&
        hasQuantity;

      return {
        ...option,
        provider: "wellet",
        external_product_id: productId,
        external_variant_id: productId,
        external_availability_id:
          performanceId && productId ? `${performanceId}:${productId}` : productId,
        performance_id: performanceId,
        option_name:
          cleanLiveText(productItem.name) ||
          cleanLiveText(productItem.description) ||
          getLiveOptionLabel(option),
        description: cleanLiveText(productItem.description),
        features: Array.isArray(productItem.features)
          ? productItem.features.map(cleanLiveText).filter(Boolean)
          : [],
        price: price.amount,
        currency: price.currency,
        available,
        available_quantity: availableQuantity,
        sold_out: !available,
        service_date: option.service_date,
        start_time: startTime || option.start_time,
        end_time: endTime || option.end_time,
        checkin_time: checkinTime,
        high_demand: Boolean(productItem.highDemand),
        raw: {
          performance,
          product: productItem,
          price: price.raw,
        },
      };
    });
}

function normalizeLiveTicketOptions(options: LiveTicketOption[]) {
  const flattened = options.flatMap((option) => flattenRawWelletProducts(option));
  const seen = new Set<string>();

  return flattened.filter((option, index) => {
    const key = getLiveOptionKey(option) || `live-option-${index}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getFirstAvailableLiveOption(options: LiveTicketOption[]) {
  return (
    options.find(
      (option) => option.available !== false && option.sold_out !== true
    ) || null
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function getProductTypeLabel(type: ProductType | string) {
  return productTypeLabels[type as ProductType] || String(type);
}

function getProductTypeIcon(type: ProductType | string) {
  if (type === "transfer") return Plane;
  if (type === "event") return CalendarDays;
  if (type === "ticket" || type === "nightlife") return Ticket;
  if (type === "custom") return Sparkles;
  return Package;
}

function getBestDescription(product: ExperienceProduct) {
  return (
    product.long_description ||
    product.short_description ||
    "Book this experience online."
  );
}

function toDisplayItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") return item;

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;

        return String(
          record.label ||
            record.title ||
            record.name ||
            record.text ||
            record.description ||
            ""
        );
      }

      return "";
    })
    .filter(Boolean);
}

function getGallery(product: ExperienceProduct | null): GalleryImage[] {
  if (!product) return [];

  const images: GalleryImage[] = [];

  const galleryImages = Array.isArray((product as any).gallery_images)
    ? (product as any).gallery_images
    : [];

  const sortedGalleryImages = [...galleryImages].sort((a: any, b: any) => {
    if (a?.is_cover && !b?.is_cover) return -1;
    if (!a?.is_cover && b?.is_cover) return 1;

    return Number(a?.sort_order || 0) - Number(b?.sort_order || 0);
  });

  sortedGalleryImages.forEach((item: any, index: number) => {
    const image = resolveAssetUrl(item?.image_url || item?.image || "");

    if (image && !images.some((entry) => entry.image === image)) {
      images.push({
        image,
        caption:
          item?.caption ||
          item?.alt_text ||
          product.image_alt_text ||
          `${product.name} ${index + 1}`,
      });
    }
  });

  const mainImage = resolveAssetUrl(product.image_url || product.image);

  if (mainImage && !images.some((entry) => entry.image === mainImage)) {
    images.unshift({
      image: mainImage,
      caption: product.image_alt_text || product.name,
    });
  }

  if (Array.isArray(product.gallery)) {
    product.gallery.forEach((item, index) => {
      let rawImage = "";
      let caption = `${product.name} ${index + 1}`;

      if (typeof item === "string") {
        rawImage = item;
      }

      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;

        rawImage = String(
          record.image_url ||
            record.image ||
            record.url ||
            record.src ||
            record.file ||
            ""
        );

        caption = String(record.caption || record.alt || record.title || caption);
      }

      const image = resolveAssetUrl(rawImage);

      if (image && !images.some((entry) => entry.image === image)) {
        images.push({ image, caption });
      }
    });
  }

  return images;
}

function getHighlights(product: ExperienceProduct) {
  const items: string[] = [];

  if (product.is_best_seller) items.push("One of our most booked experiences");
  if (product.is_recommended) items.push("Recommended by our local team");
  if (product.duration_text) items.push(`${product.duration_text} experience`);
  if (product.location) items.push(`Located in ${product.location}`);
  if (product.supports_pickup || product.requires_pickup_location) {
    items.push("Hotel pickup available");
  }
  if (product.allow_deposit_payment) {
    items.push("Reserve with deposit");
  }

  if (items.length < 4) {
    items.push("Fast and simple online reservation");
    items.push("Great option for couples, friends and families");
  }

  return items.slice(0, 6);
}

function getWhatToBring(product: ExperienceProduct) {
  const fromInstructions = String(product.instructions || "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  if (fromInstructions.length) return fromInstructions;

  if (product.product_type === "excursion") {
    return [
      "Comfortable clothes",
      "Sunscreen",
      "Towel or beachwear if needed",
      "Cash for optional purchases",
    ];
  }

  if (product.product_type === "transfer") {
    return [
      "Flight number or arrival information",
      "Hotel or destination name",
      "Valid contact number",
    ];
  }

  return ["Valid ID if required", "Booking confirmation", "Comfortable clothes"];
}

function getPolicyItems(product: ExperienceProduct) {
  return [
    {
      icon: MapPin,
      label: "Pickup available",
      ok: product.supports_pickup || product.requires_pickup_location,
    },
    {
      icon: Zap,
      label: "Easy reservation",
      ok: true,
    },
    {
      icon: ShieldCheck,
      label: "Secure booking",
      ok: true,
    },
  ];
}

function getPaymentChoices(product: ExperienceProduct) {
  const options: {
    value: PaymentChoice;
    label: string;
    helper: string;
  }[] = [];

  // Important:
  // Use === true only. If the backend does not send the field, or if the
  // owner unticked it, the payment option must NOT appear on the public page.
  if (product.allow_deposit_payment === true) {
    options.push({
      value: "deposit",
      label: "Pay deposit",
      helper:
        Number(product.deposit_amount || 0) > 0
          ? `Pay a deposit now and the rest later.`
          : "Reserve now with the required deposit.",
    });
  }

  if (product.allow_full_payment === true) {
    options.push({
      value: "full",
      label: "Pay total amount",
      helper: "Complete your payment and secure your booking.",
    });
  }

  if (product.allow_pending_payment === true) {
    options.push({
      value: "pending",
      label: "Reserve now, pay later",
      helper: "Send the request and complete payment after confirmation.",
    });
  }

  if (product.allow_cash_payment === true) {
    options.push({
      value: "cash",
      label: "Pay in person",
      helper: "Reserve now and pay in person when confirmed.",
    });
  }

  return options;
}

function getDefaultPayment(product: ExperienceProduct): PaymentChoice {
  return getPaymentChoices(product)[0]?.value || "full";
}

function hasSelectedPaymentOption(
  paymentOptions: { value: PaymentChoice; label: string; helper: string }[],
  paymentChoice: PaymentChoice
) {
  return paymentOptions.some((option) => option.value === paymentChoice);
}

function buildCheckoutUrl({
  publicPath,
  sellerSlug,
  product,
  date,
  qty,
  pickupLocation,
  resolvedPickup,
  paymentChoice,
  selectedAvailability,
  selectedLiveOption,
  selectedTransferRoute,
  selectedTransferPriceBand,
  transferRoundTrip,
  preferredPickupTime,
  transferTotalPrice,
}: {
  publicPath: (path: string) => string;
  sellerSlug?: string;
  product: ExperienceProduct;
  date: string;
  qty: BookingQty;
  pickupLocation: PickupLocation | null;
  resolvedPickup: PickupResolveResponse | null;
  paymentChoice: PaymentChoice;
  selectedAvailability?: AdvancedAvailabilityRecord | null;
  selectedLiveOption?: LiveTicketOption | null;
  selectedTransferRoute?: TransferRouteOption | null;
  selectedTransferPriceBand?: TransferPriceBand | null;
  transferRoundTrip?: boolean;
  preferredPickupTime?: string;
  transferTotalPrice?: number;
}) {
  const params = new URLSearchParams();

  if (sellerSlug) {
    params.set("seller", sellerSlug);
  }

  params.set("product", product.slug);
  params.set("product_id", String(product.id));
  params.set("service_date", date);
  params.set("adults", String(qty.adult));
  params.set("children", String(qty.child));
  params.set("infants", String(qty.infant));
  params.set("payment", paymentChoice);

  if (!selectedLiveOption && !selectedTransferRoute) {
    params.set("adult_price", String(getEffectivePassengerPrice(product, selectedAvailability || null, "adult")));
    params.set("child_price", String(getEffectivePassengerPrice(product, selectedAvailability || null, "child")));
    params.set("infant_price", String(getEffectivePassengerPrice(product, selectedAvailability || null, "infant")));
  }

  if (selectedAvailability) {
    params.set("availability_id", String(selectedAvailability.id));

    if (selectedAvailability.price_override !== undefined && selectedAvailability.price_override !== null && selectedAvailability.price_override !== "") {
      params.set("unit_price", String(selectedAvailability.price_override));
    }

    if (selectedAvailability.deposit_override !== undefined && selectedAvailability.deposit_override !== null && selectedAvailability.deposit_override !== "") {
      params.set("deposit_amount", String(selectedAvailability.deposit_override));
    }
  }

  if (selectedTransferRoute) {
    params.set("transfer_route_id", String(selectedTransferRoute.id));
    params.set("transfer_origin", selectedTransferRoute.origin || selectedTransferRoute.from_location || "");
    params.set("transfer_destination", selectedTransferRoute.destination || selectedTransferRoute.to_location || "");
    params.set("transfer_round_trip", transferRoundTrip ? "true" : "false");
  }

  if (selectedTransferPriceBand) {
    params.set("transfer_price_band_id", String(selectedTransferPriceBand.id));
    params.set("transfer_vehicle_type", selectedTransferPriceBand.vehicle_type || selectedTransferRoute?.vehicle_type || "");
  }

  if (preferredPickupTime) {
    params.set("service_time", preferredPickupTime);
    params.set("pickup_time", preferredPickupTime);
  }

  if (transferTotalPrice !== undefined && transferTotalPrice !== null && transferTotalPrice > 0) {
    params.set("transfer_total_price", String(transferTotalPrice));
    params.set("unit_price", String(transferTotalPrice));
  }

  if (selectedLiveOption) {
    const selectedExternalProductId = getLiveOptionKey(selectedLiveOption);
    const optionFeatures = Array.isArray(selectedLiveOption.features)
      ? selectedLiveOption.features.filter(Boolean)
      : [];

    params.set("selected_external_product_id", selectedExternalProductId);
    params.set("external_product_id", selectedLiveOption.external_product_id || "");
    params.set("external_variant_id", selectedLiveOption.external_variant_id || "");
    params.set("external_availability_id", selectedLiveOption.external_availability_id || "");
    params.set("external_option_name", getLiveOptionLabel(selectedLiveOption));
    params.set("external_option_description", selectedLiveOption.description || "");
    params.set("external_option_features", JSON.stringify(optionFeatures));
    params.set("external_currency", selectedLiveOption.currency || "USD");
    params.set("external_checkin_time", selectedLiveOption.checkin_time || "");
    params.set("external_start_time", selectedLiveOption.start_time || "");
    params.set("external_end_time", selectedLiveOption.end_time || "");
    params.set("external_performance_id", selectedLiveOption.performance_id || "");
    params.set("external_high_demand", selectedLiveOption.high_demand ? "true" : "false");
    params.set("unit_price", String(selectedLiveOption.price || "0"));
    params.set("external_provider", selectedLiveOption.provider || "wellet");
  }

  if (pickupLocation) {
    params.set("pickup_location_id", String(pickupLocation.id));
    params.set("hotel", pickupLocation.name);
  }

  const schedule = resolvedPickup?.schedule;

  if (resolvedPickup?.found && schedule) {
    params.set("pickup_schedule_id", String(schedule.id));
    params.set("pickup_time", schedule.pickup_time);
    params.set(
      "pickup_point",
      schedule.resolved_pickup_point || schedule.pickup_point
    );
  }

  return `${publicPath("/checkout")}?${params.toString()}`;
}

function listingPath(productType: ProductType) {
  if (productType === "excursion") return "excursions";
  if (productType === "transfer") return "transfers";
  if (productType === "ticket") return "tickets";
  if (productType === "event") return "events";

  return productType;
}

function normalizePublicPath(path?: string | null) {
  const raw = String(path || "/").trim();
  const withoutQuery = raw.split("?")[0] || "/";
  const withSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;

  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

function getCurrentProductResolvePath(
  organisationSlug: string,
  isCustomDomain: boolean,
  sellerCode?: string
) {
  if (typeof window === "undefined") return "/";

  let currentPath = normalizePublicPath(window.location.pathname);

  if (!isCustomDomain && organisationSlug) {
    const organisationPrefix = normalizePublicPath(
      `/experiences/${organisationSlug}`
    );

    if (currentPath === organisationPrefix) {
      currentPath = "/";
    } else if (currentPath.startsWith(`${organisationPrefix}/`)) {
      currentPath = normalizePublicPath(
        currentPath.slice(organisationPrefix.length)
      );
    }
  }

  // Seller referral URLs add /s/:sellerCode before the real public path.
  // The backend product resolver should receive /product/:slug, not the
  // referral wrapper /s/:sellerCode/product/:slug.
  if (sellerCode) {
    const sellerPrefix = normalizePublicPath(`/s/${sellerCode}`);

    if (currentPath === sellerPrefix) {
      return "/";
    }

    if (currentPath.startsWith(`${sellerPrefix}/`)) {
      return normalizePublicPath(currentPath.slice(sellerPrefix.length));
    }
  }

  return currentPath;
}

function getProductPublicPath(product: ExperienceProduct | null) {
  if (!product) return "/";

  const currentPublicPath = String((product as any).current_public_path || "").trim();

  if (currentPublicPath) {
    return normalizePublicPath(currentPublicPath);
  }

  return normalizePublicPath(`/product/${product.slug}`);
}

function setCanonicalLink(url: string) {
  if (typeof document === "undefined" || !url) return;

  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

  if (!link) {
    link = document.createElement("link");
    link.rel = "canonical";
    document.head.appendChild(link);
  }

  link.href = url;
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

export default function PublicProductDetailPage() {
  const {
    organisationSlug: organisationSlugFromUrl = "",
    productSlug = "",
    sellerCode = "",
  } = useParams<{
    organisationSlug?: string;
    productSlug?: string;
    sellerCode?: string;
  }>();

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

    const cleanPath = path === "/" ? "" : path;

    if (isCustomDomain) {
      if (sellerCode) {
        return `/s/${sellerCode}${cleanPath}`;
      }

      return path || "/";
    }

    if (sellerCode) {
      return `/experiences/${organisationSlug}/s/${sellerCode}${cleanPath}`;
    }

    return `/experiences/${organisationSlug}${cleanPath}`;
  };

  const navigate = useNavigate();
  const { language } = useTicketingTranslation();

  const productLanguage = (
    ["en", "es", "fr", "pt", "de"].includes(language)
      ? language
      : "en"
  ) as SupportedProductLanguage;

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [product, setProduct] = useState<ExperienceProduct | null>(null);
  const [canonicalUrl, setCanonicalUrl] = useState("");
  const [relatedProducts, setRelatedProducts] = useState<ExperienceProduct[]>([]);
  const [pickupLocations, setPickupLocations] = useState<PickupLocation[]>([]);
  const [resolvedPickup, setResolvedPickup] =
    useState<PickupResolveResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [resolvingPickup, setResolvingPickup] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);

  const [galleryOpen, setGalleryOpen] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  const [date, setDate] = useState("");
  const [qty, setQty] = useState<BookingQty>({
    adult: 1,
    child: 0,
    infant: 0,
  });
  const [pickupLocationId, setPickupLocationId] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<PaymentChoice>("deposit");
  const [liveAvailability, setLiveAvailability] =
    useState<LiveAvailabilityResponse | null>(null);
  const [loadingLiveAvailability, setLoadingLiveAvailability] = useState(false);
  const [liveAvailabilityError, setLiveAvailabilityError] = useState("");
  const [selectedLiveOptionId, setSelectedLiveOptionId] = useState("");
  const [selectedTransferRouteId, setSelectedTransferRouteId] = useState("");
  const [transferRoundTrip, setTransferRoundTrip] = useState(false);
  const [preferredPickupTime, setPreferredPickupTime] = useState("");

  async function loadPage() {
    if (!organisationSlug) return;

    const resolvePath = getCurrentProductResolvePath(
      organisationSlug,
      isCustomDomain,
      sellerCode
    );

    try {
      setLoading(true);
      setError("");

      const [brandingResponse, resolveResponse, productsResponse] = await Promise.all([
        ticketingApi.getPublicBranding(organisationSlug),
        ticketingApi.getPublicProductResolve(
          organisationSlug,
          resolvePath,
          productLanguage
        ),
        ticketingApi.getPublicProducts(organisationSlug, {
          public_enabled: true,
          status: "active",
          language: productLanguage,
        }),
      ]);

      const foundProduct = resolveResponse.product || null;

      if (!foundProduct) {
        setBranding(brandingResponse);
        setProduct(null);
        setCanonicalUrl("");
        setPickupLocations([]);
        setError("This product is not available or is no longer public.");
        return;
      }

      setBranding(brandingResponse);
      setProduct(foundProduct);
      setCanonicalUrl(
        resolveResponse.canonical_url ||
          String((foundProduct as any).primary_url || "") ||
          ""
      );

      const redirectPath = normalizePublicPath(
        resolveResponse.current_public_path || getProductPublicPath(foundProduct)
      );
      const currentResolvePath = normalizePublicPath(resolvePath);

      if (
        resolveResponse.should_redirect &&
        redirectPath &&
        redirectPath !== currentResolvePath
      ) {
        const targetPath = publicPath(redirectPath);
        const currentPath = normalizePublicPath(window.location.pathname);

        if (normalizePublicPath(targetPath) !== currentPath) {
          navigate(`${targetPath}${window.location.search || ""}`, {
            replace: true,
          });
        }
      }

      console.log("PUBLIC PRODUCT PAYMENT FLAGS", {
        name: foundProduct.name,
        allow_deposit_payment: foundProduct.allow_deposit_payment,
        allow_full_payment: foundProduct.allow_full_payment,
        allow_pending_payment: foundProduct.allow_pending_payment,
        allow_cash_payment: foundProduct.allow_cash_payment,
      });

      setPaymentChoice(getDefaultPayment(foundProduct));

      setRelatedProducts(
        productsResponse
          .filter(
            (item) =>
              item.id !== foundProduct.id &&
              (item.product_type === foundProduct.product_type ||
                item.category === foundProduct.category)
          )
          .slice(0, 3)
      );

      const productSchedules = getProductPickupSchedules(foundProduct);
      const inferredPickupEnabled =
        Boolean(foundProduct.supports_pickup) ||
        Boolean(foundProduct.requires_pickup_location) ||
        productSchedules.length > 0;

      if (!inferredPickupEnabled) {
        setPickupLocations([]);
        return;
      }

      try {
        const locations = await ticketingApi.getPublicPickupLocations(
          organisationSlug,
          { is_active: true }
        );

        const scheduledLocationIds = new Set(
          productSchedules.map(getPickupLocationIdFromSchedule).filter(Boolean)
        );

        const visibleLocations = scheduledLocationIds.size
          ? locations.filter((location) =>
              scheduledLocationIds.has(String(location.id))
            )
          : locations;

        setPickupLocations(visibleLocations);
      } catch (pickupError) {
        console.error("Could not load public pickup locations:", pickupError);

        // Do not hide the product just because pickup locations failed.
        // The customer can still view the experience.
        setPickupLocations([]);
      }
    } catch (err: any) {
      console.error("Could not load public product detail:", err);

      setProduct(null);
      setCanonicalUrl("");
      setPickupLocations([]);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "We could not load this product."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [
    organisationSlug,
    productSlug,
    isCustomDomain,
    sellerCode,
    productLanguage,
  ]);

  useEffect(() => {
    async function loadLiveAvailability() {
      if (!organisationSlug || !product || !date || !isExternalLiveProduct(product)) {
        setLiveAvailability(null);
        setSelectedLiveOptionId("");
        setLiveAvailabilityError("");
        return;
      }

      try {
        setLoadingLiveAvailability(true);
        setLiveAvailabilityError("");

        const response = await (ticketingApi as any).getPublicProductAvailability(
          organisationSlug,
          product.slug,
          { date }
        );

        setLiveAvailability(response);

        const normalizedOptions = normalizeLiveTicketOptions(
          response.options || []
        );

        const firstAvailableOption = getFirstAvailableLiveOption(
          normalizedOptions
        );

        setSelectedLiveOptionId(
          firstAvailableOption ? getLiveOptionKey(firstAvailableOption) : ""
        );
      } catch (err: any) {
        console.error("Could not load live ticket availability:", err);

        setLiveAvailability(null);
        setSelectedLiveOptionId("");
        setLiveAvailabilityError(
          err?.response?.data?.detail ||
            err?.response?.data?.error ||
            "Live ticket options are not available for this date."
        );
      } finally {
        setLoadingLiveAvailability(false);
      }
    }

    loadLiveAvailability();
  }, [organisationSlug, product?.id, product?.slug, date]);

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

  const images = useMemo(() => getGallery(product), [product]);
  const heroImg = images[0]?.image || "";

  const includesList = useMemo(() => toDisplayItems(product?.includes), [product]);
  const excludesList = useMemo(() => toDisplayItems(product?.excludes), [product]);
  const itineraryList = useMemo(() => toDisplayItems(product?.itinerary), [product]);
  const faqList = useMemo(() => toDisplayItems(product?.faqs), [product]);

  const selectedPickupLocation = useMemo(() => {
    if (!pickupLocationId) return null;

    return (
      pickupLocations.find(
        (location) => String(location.id) === pickupLocationId
      ) || null
    );
  }, [pickupLocationId, pickupLocations]);

  const pickupAvailability = useMemo(
    () => summarizePickupAvailability(product, pickupLocationId),
    [product, pickupLocationId]
  );

  const productAvailabilityRecords = useMemo(
    () => getProductAvailabilityRecords(product),
    [product]
  );

  const selectedAvailability = useMemo(
    () => getAvailabilityForDate(product, date),
    [product, date]
  );

  const isWelletProduct = useMemo(
    () => isExternalLiveProduct(product),
    [product]
  );

  const liveAvailabilityOptions = useMemo(
    () => normalizeLiveTicketOptions(liveAvailability?.options || []),
    [liveAvailability]
  );

  const selectedLiveOption = useMemo(() => {
    if (!selectedLiveOptionId) return null;

    return (
      liveAvailabilityOptions.find(
        (option) => getLiveOptionKey(option) === selectedLiveOptionId
      ) || null
    );
  }, [selectedLiveOptionId, liveAvailabilityOptions]);

  const isTransfer = isTransferProduct(product);

  const transferRoutes = useMemo(
    () => getTransferRoutes(product),
    [product]
  );

  useEffect(() => {
    if (!isTransfer) {
      setSelectedTransferRouteId("");
      setTransferRoundTrip(false);
      setPreferredPickupTime("");
      return;
    }

    if (!selectedTransferRouteId && transferRoutes.length === 1) {
      setSelectedTransferRouteId(String(transferRoutes[0].id));
    }
  }, [isTransfer, selectedTransferRouteId, transferRoutes]);

  const selectedTransferRoute = useMemo(() => {
    if (!selectedTransferRouteId) return null;

    return (
      transferRoutes.find((route) => String(route.id) === selectedTransferRouteId) ||
      null
    );
  }, [selectedTransferRouteId, transferRoutes]);

  const pax = qty.adult + qty.child + qty.infant;

  const selectedTransferPriceBand = useMemo(
    () => getTransferPriceBandForPassengers(selectedTransferRoute, pax),
    [selectedTransferRoute, pax]
  );

  const transferTotalPrice = useMemo(() => {
    if (!isTransfer || !selectedTransferRoute) return 0;

    const bandPrice = getTransferBandPrice(
      selectedTransferPriceBand,
      transferRoundTrip
    );

    if (bandPrice > 0) return bandPrice;

    return getTransferRouteLegacyPrice(selectedTransferRoute, transferRoundTrip);
  }, [isTransfer, selectedTransferRoute, selectedTransferPriceBand, transferRoundTrip]);

  const transferPriceMissing =
    isTransfer && Boolean(selectedTransferRoute) && transferTotalPrice <= 0;

  const liveOptionAvailable =
    !isWelletProduct ||
    Boolean(
      selectedLiveOption &&
        selectedLiveOption.available !== false &&
        selectedLiveOption.sold_out !== true
    );

  const hasAdvancedAvailability = productAvailabilityRecords.length > 0;

  const availabilityDateAllowed = useMemo(
    () => isAdvancedAvailabilityDateAllowed(product, date),
    [product, date]
  );

  const pickupDateAllowed = useMemo(
    () => isTransfer ? true : isPickupDateAllowed(product, date, pickupLocationId),
    [isTransfer, product, date, pickupLocationId]
  );

  const dateAllowed = availabilityDateAllowed && pickupDateAllowed;

  const productHasPickupSchedules = useMemo(
    () => getProductPickupSchedules(product).length > 0,
    [product]
  );

  const showPickup =
    !isTransfer &&
    (Boolean(product?.supports_pickup) ||
      Boolean(product?.requires_pickup_location) ||
      productHasPickupSchedules);

  const policies = useMemo(() => {
    if (!product) return [];
    return getPolicyItems(product);
  }, [product]);

  const highlights = useMemo(() => {
    if (!product) return [];
    return getHighlights(product);
  }, [product]);

  const whatToBring = useMemo(() => {
    if (!product) return [];
    return getWhatToBring(product);
  }, [product]);

  const paymentOptions = useMemo(() => {
    if (!product) return [];
    return getPaymentChoices(product);
  }, [product]);

  useEffect(() => {
    if (!product) return;
    if (!paymentOptions.length) return;

    if (!hasSelectedPaymentOption(paymentOptions, paymentChoice)) {
      setPaymentChoice(paymentOptions[0].value);
    }
  }, [product?.id, paymentOptions, paymentChoice]);

  const totals = useMemo(() => {
    if (!product) {
      return {
        totalFull: 0,
        totalDeposit: 0,
        dueLater: 0,
      };
    }

    const fullTotal = isTransfer
      ? transferTotalPrice
      : isExternalLiveProduct(product)
        ? getLiveOptionPrice(selectedLiveOption) * pax
        : getPassengerSubtotal(product, selectedAvailability, qty);

    const depositBase = getEffectiveDepositAmount(product, selectedAvailability);
    const depositFixed = isTransfer ? depositBase : depositBase * pax;
    const depositFromPercent =
      Number(product.deposit_percentage || 0) > 0
        ? fullTotal * (Number(product.deposit_percentage || 0) / 100)
        : 0;

    const depositTotal =
      paymentChoice === "full"
        ? fullTotal
        : paymentChoice === "deposit"
          ? depositFixed > 0
            ? depositFixed
            : depositFromPercent
          : 0;

    const safeDeposit = Math.min(fullTotal, Math.max(0, depositTotal));

    return {
      totalFull: fullTotal,
      totalDeposit: safeDeposit,
      dueLater: Math.max(0, fullTotal - safeDeposit),
    };
  }, [
    product,
    isTransfer,
    transferTotalPrice,
    pax,
    qty,
    paymentChoice,
    selectedAvailability,
    selectedLiveOption,
  ]);

  useEffect(() => {
    async function resolvePickup() {
      if (!product || !showPickup) {
        setResolvedPickup(null);
        return;
      }

      if (!date || !pickupLocationId) {
        setResolvedPickup(null);
        return;
      }

      try {
        setResolvingPickup(true);

        const response = await ticketingApi.resolvePublicPickupSchedule(
          organisationSlug,
          product.id,
          Number(pickupLocationId),
          date
        );

        setResolvedPickup(response);
      } catch (err) {
        console.error("Could not resolve pickup schedule:", err);

        setResolvedPickup({
          found: false,
          message:
            "Pickup time is not available yet for this date and hotel/location.",
        });
      } finally {
        setResolvingPickup(false);
      }
    }

    resolvePickup();
  }, [organisationSlug, product?.id, showPickup, date, pickupLocationId]);

  useEffect(() => {
    if (!product) return;

    document.title = product.seo_title || `${product.name} | ${brandName}`;

    const metaDescription =
      product.meta_description ||
      product.short_description ||
      publicSite?.meta_description ||
      "";

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

    const backendCanonical =
      canonicalUrl ||
      String((product as any).primary_url || "") ||
      String(product.canonical_url || "");

    const productPath = getProductPublicPath(product);
    const fallbackCanonical =
      typeof window !== "undefined"
        ? `${window.location.origin}${publicPath(productPath)}`
        : publicPath(productPath);

    setCanonicalLink(backendCanonical || fallbackCanonical);
  }, [product, brandName, publicSite, canonicalUrl, organisationSlug, isCustomDomain]);

  useEffect(() => {
    if (!notice || notice.type !== "share") return;

    const timeout = window.setTimeout(() => setNotice(null), 1800);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openGalleryAt(index: number) {
    if (!images.length) return;

    setActiveImg(Math.max(0, Math.min(index, images.length - 1)));
    setGalleryOpen(true);
  }

  function prevImg() {
    setActiveImg((current) => (current - 1 + images.length) % images.length);
  }

  function nextImg() {
    setActiveImg((current) => (current + 1) % images.length);
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);

      setNotice({
        type: "share",
        title: "Link copied ✔",
      });
    } catch {
      setNotice({
        type: "share",
        title: "Could not copy link",
      });
    }
  }

  function updateQty(key: QtyKey, direction: "up" | "down") {
    setQty((current) => {
      const next = {
        ...current,
        [key]:
          direction === "up"
            ? clamp(current[key] + 1, 0, 99)
            : clamp(current[key] - 1, 0, 99),
      };

      if (next.adult < 1) next.adult = 1;

      return next;
    });
  }

  const canCheckout = useMemo(() => {
    if (!product) return false;
    if (!paymentOptions.length) return false;
    if (!hasSelectedPaymentOption(paymentOptions, paymentChoice)) return false;
    if (!date) return false;
    if (qty.adult < 1) return false;
    if (pax < 1) return false;

    if (isTransfer) {
      if (!selectedTransferRoute) return false;
      if (!preferredPickupTime) return false;
      if (transferPriceMissing) return false;
    }

    if (!availabilityDateAllowed) return false;
    if (showPickup && !pickupDateAllowed) return false;

    if (!isTransfer && product.requires_pickup_location) {
      if (!pickupLocationId) return false;
      if (!resolvedPickup?.found) return false;
    }

    if (isExternalLiveProduct(product)) {
      if (loadingLiveAvailability) return false;
      if (liveAvailabilityError) return false;
      if (!selectedLiveOption) return false;
      if (!liveOptionAvailable) return false;
    }

    return true;
  }, [
    product,
    paymentOptions,
    paymentChoice,
    date,
    qty.adult,
    pax,
    isTransfer,
    selectedTransferRoute,
    preferredPickupTime,
    transferPriceMissing,
    showPickup,
    availabilityDateAllowed,
    pickupDateAllowed,
    pickupLocationId,
    resolvedPickup,
    loadingLiveAvailability,
    liveAvailabilityError,
    selectedLiveOption,
    liveOptionAvailable,
  ]);

  const checkoutUrl = useMemo(() => {
    if (!product || !canCheckout) return "#";

    const baseUrl = buildCheckoutUrl({
      publicPath,
      sellerSlug: sellerCode,
      product,
      date,
      qty,
      pickupLocation: selectedPickupLocation,
      resolvedPickup,
      paymentChoice,
      selectedAvailability,
      selectedLiveOption,
      selectedTransferRoute,
      selectedTransferPriceBand,
      transferRoundTrip,
      preferredPickupTime,
      transferTotalPrice,
    });

    const separator = baseUrl.includes("?") ? "&" : "?";

    return `${baseUrl}${separator}language=${encodeURIComponent(
      productLanguage
    )}`;
  }, [
    product,
    canCheckout,
    sellerCode,
    date,
    qty,
    selectedPickupLocation,
    resolvedPickup,
    paymentChoice,
    selectedAvailability,
    selectedLiveOption,
    selectedTransferRoute,
    selectedTransferPriceBand,
    transferRoundTrip,
    preferredPickupTime,
    transferTotalPrice,
    productLanguage,
  ]);

  function goToCheckout() {
    if (!product) return;

    if (!canCheckout) {
      if (!paymentOptions.length) {
        setNotice({
          type: "checkout",
          title: "No payment option is available.",
          subtitle:
            "This product is not open for checkout until the owner enables at least one payment option.",
        });
        return;
      }

      if (!hasSelectedPaymentOption(paymentOptions, paymentChoice)) {
        setNotice({
          type: "checkout",
          title: "Please select an available payment option.",
        });
        return;
      }

      if (isTransfer && !selectedTransferRoute) {
        setNotice({
          type: "checkout",
          title: "Please select your transfer route.",
        });
        return;
      }

      if (isTransfer && !preferredPickupTime) {
        setNotice({
          type: "checkout",
          title: "Please select your preferred pickup time.",
        });
        return;
      }

      if (isTransfer && transferPriceMissing) {
        setNotice({
          type: "checkout",
          title: "This passenger count has no transfer price yet.",
          subtitle: "Please choose a different passenger count or contact us.",
        });
        return;
      }

      if (date && !availabilityDateAllowed) {
        setNotice({
          type: "checkout",
          title: "This date is not available.",
          subtitle:
            hasAdvancedAvailability
              ? "Choose one of the available dates configured in Availability."
              : "Choose another service date.",
        });
        return;
      }

      if (showPickup && date && !pickupDateAllowed) {
        setNotice({
          type: "checkout",
          title: "This date is not available for pickup.",
          subtitle:
            "Choose one of the available pickup days shown in the booking box.",
        });
        return;
      }

      if (isExternalLiveProduct(product) && date && loadingLiveAvailability) {
        setNotice({
          type: "checkout",
          title: "Checking live ticket availability.",
          subtitle: "Please wait a moment and try again.",
        });
        return;
      }

      if (isExternalLiveProduct(product) && date && liveAvailabilityError) {
        setNotice({
          type: "checkout",
          title: "Live ticket options are not available.",
          subtitle: liveAvailabilityError,
        });
        return;
      }

      if (isExternalLiveProduct(product) && date && !selectedLiveOption) {
        setNotice({
          type: "checkout",
          title: "Please select a ticket option.",
          subtitle: "Choose one of the available live ticket options for this date.",
        });
        return;
      }

      setNotice({
        type: "checkout",
        title: product.requires_pickup_location
          ? "Please select date, guests and pickup location."
          : "Please select date and guests.",
        subtitle:
          product.requires_pickup_location && pickupLocationId && !resolvedPickup?.found
            ? "A matching pickup schedule is required before checkout."
            : undefined,
      });

      return;
    }

    navigate(checkoutUrl);
  }

  if (organisationError) {
    return (
      <PublicShell
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
      >
        <div
          className="rounded-3xl border p-10 text-center shadow-sm"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        >
          <p className="font-extrabold">Website not available</p>

          <p
            className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6"
            style={{ color: theme.muted }}
          >
            {organisationError}
          </p>
        </div>
      </PublicShell>
    );
  }

  if (organisationLoading || loading) {
    return (
      <PublicShell
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
      >
        <div
          className="rounded-3xl border p-10 text-center shadow-sm"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        >
          <Loader2
            className="mx-auto h-8 w-8 animate-spin"
            style={{ color: theme.accent }}
          />
          <p className="mt-3 font-bold" style={{ color: theme.muted }}>
            Loading experience details...
          </p>
        </div>
      </PublicShell>
    );
  }

  if (error || !product) {
    return (
      <PublicShell
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
      >
        <div
          className="rounded-3xl border p-10 text-center shadow-sm"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        >
          <p className="font-extrabold">Experience not found</p>

          <p
            className="mx-auto mt-2 max-w-lg text-sm font-semibold leading-6"
            style={{ color: theme.muted }}
          >
            {error || "This experience is not available."}
          </p>

          <Link
            to={publicPath("/")}
            className="mt-4 inline-flex items-center gap-2 text-sm font-bold underline"
            style={{ color: theme.text }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to experiences
          </Link>
        </div>
      </PublicShell>
    );
  }

  const TypeIcon = getProductTypeIcon(product.product_type);

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      <PublicHeader
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
      />

      {notice?.type === "checkout" && (
        <div className="fixed bottom-5 left-1/2 z-[90] -translate-x-1/2">
          <div
            className="rounded-2xl px-4 py-3 text-sm font-extrabold shadow-lg"
            style={{
              backgroundColor: theme.primary,
              color: "#FFFFFF",
            }}
          >
            {notice.title}
            {notice.subtitle && (
              <div className="mt-1 text-xs font-bold text-white/80">
                {notice.subtitle}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 pb-6 pt-8 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-extrabold transition"
            style={{
              borderColor: hexToRgba(theme.primary, 0.12),
              backgroundColor: theme.card,
              color: theme.text,
            }}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-extrabold transition"
              style={{
                borderColor: hexToRgba(theme.primary, 0.12),
                backgroundColor: theme.card,
                color: theme.text,
              }}
            >
              <Share2 className="h-4 w-4" />
              Share
            </button>

            <Link
              to={publicPath(`/${listingPath(product.product_type)}`)}
              className="hidden items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-extrabold text-white transition sm:inline-flex"
              style={{ backgroundColor: theme.button }}
            >
              Browse more
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-4 pb-12 sm:px-6">
        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="grid gap-3 md:grid-cols-3" id="gallery">
              <div className="md:col-span-2">
                <button
                  type="button"
                  onClick={() => openGalleryAt(0)}
                  className="relative w-full overflow-hidden rounded-3xl border shadow-sm"
                  style={{
                    backgroundColor: hexToRgba(theme.primary, 0.05),
                    borderColor: hexToRgba(theme.primary, 0.12),
                  }}
                  aria-label="Open gallery"
                >
                  {heroImg ? (
                    <img
                      src={heroImg}
                      alt={product.image_alt_text || product.name}
                      className="h-[320px] w-full object-cover sm:h-[420px]"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-[320px] w-full items-center justify-center sm:h-[420px]"
                      style={{ color: theme.muted }}
                    >
                      No image
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

                  <div className="absolute left-4 top-4 flex flex-wrap gap-2">
                    {(product.is_best_seller || product.is_featured) && (
                      <span
                        className="rounded-full px-3 py-1 text-xs font-extrabold shadow-sm"
                        style={{
                          backgroundColor: theme.accent,
                          color: theme.primary,
                        }}
                      >
                        {product.is_best_seller ? "Top seller" : "Featured"}
                      </span>
                    )}

                    <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gray-900 ring-1 ring-white/60">
                      <TypeIcon className="h-4 w-4" style={{ color: theme.accent }} />
                      {getProductTypeLabel(product.product_type)}
                    </span>

                    {product.location && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gray-900 ring-1 ring-white/60">
                        <MapPin className="h-4 w-4" style={{ color: theme.accent }} />
                        {product.location}
                      </span>
                    )}

                    {product.duration_text && (
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-gray-900 ring-1 ring-white/60">
                        <Clock3 className="h-4 w-4" style={{ color: theme.accent }} />
                        {product.duration_text}
                      </span>
                    )}
                  </div>

                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between gap-3">
                    <div className="rounded-2xl bg-black/55 px-3 py-2 text-sm font-extrabold text-white ring-1 ring-white/10 backdrop-blur">
                      {Number(product.average_rating || 0) > 0 ? (
                        <span className="inline-flex items-center gap-2">
                          <Star className="h-4 w-4" style={{ color: theme.accent }} />
                          {Number(product.average_rating || 0).toFixed(1)}
                          {Number(product.review_count || 0) > 0 && (
                            <span className="text-xs text-white/80">
                              ({product.review_count})
                            </span>
                          )}
                        </span>
                      ) : (
                        "Top rated"
                      )}
                    </div>

                    <div className="inline-flex items-center gap-2 rounded-2xl bg-white/95 px-3 py-2 text-xs font-extrabold text-gray-900 ring-1 ring-gray-200">
                      <ImageIcon className="h-4 w-4" />
                      View photos
                    </div>
                  </div>
                </button>
              </div>

              <div className="grid grid-rows-3 gap-3">
                {images.slice(1, 4).map((image, index) => (
                  <button
                    key={`${image.image}-${index}`}
                    type="button"
                    onClick={() => openGalleryAt(index + 1)}
                    className="relative overflow-hidden rounded-3xl border shadow-sm transition hover:shadow-md"
                    style={{
                      backgroundColor: hexToRgba(theme.primary, 0.05),
                      borderColor: hexToRgba(theme.primary, 0.12),
                    }}
                  >
                    <img
                      src={image.image}
                      alt={image.caption || `${product.name} ${index + 2}`}
                      className="h-[102px] w-full object-cover sm:h-[132px]"
                      loading="lazy"
                    />
                  </button>
                ))}

                <button
                  type="button"
                  onClick={() => openGalleryAt(0)}
                  className="rounded-3xl border px-4 py-3 text-sm font-extrabold shadow-sm transition hover:shadow"
                  style={{
                    backgroundColor: theme.card,
                    borderColor: hexToRgba(theme.primary, 0.12),
                    color: theme.text,
                  }}
                >
                  View all images
                </button>
              </div>
            </div>

            <div className="mt-6">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                {product.name}
              </h1>

              <p
                className="mt-2 text-sm font-semibold leading-7 sm:text-base"
                style={{ color: theme.muted }}
              >
                {product.short_description}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {policies.map((policy) => (
                  <span
                    key={policy.label}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1"
                    style={{
                      backgroundColor: policy.ok
                        ? theme.card
                        : hexToRgba(theme.primary, 0.04),
                      color: policy.ok ? theme.text : theme.muted,
                      borderColor: hexToRgba(theme.primary, 0.12),
                    }}
                  >
                    <policy.icon className="h-4 w-4" style={{ color: theme.accent }} />
                    {policy.label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 lg:hidden" id="booking-mobile">
              <BookingCard
                product={product}
                isTransfer={isTransfer}
                transferRoutes={transferRoutes}
                selectedTransferRouteId={selectedTransferRouteId}
                setSelectedTransferRouteId={setSelectedTransferRouteId}
                selectedTransferRoute={selectedTransferRoute}
                selectedTransferPriceBand={selectedTransferPriceBand}
                transferRoundTrip={transferRoundTrip}
                setTransferRoundTrip={setTransferRoundTrip}
                preferredPickupTime={preferredPickupTime}
                setPreferredPickupTime={setPreferredPickupTime}
                transferTotalPrice={transferTotalPrice}
                transferPriceMissing={transferPriceMissing}
                currencySymbol={currencySymbol}
                date={date}
                setDate={setDate}
                qty={qty}
                updateQty={updateQty}
                pickupLocations={pickupLocations}
                pickupLocationId={pickupLocationId}
                setPickupLocationId={setPickupLocationId}
                showPickup={showPickup}
                resolvingPickup={resolvingPickup}
                resolvedPickup={resolvedPickup}
                selectedPickupLocation={selectedPickupLocation}
                productAvailabilityRecords={productAvailabilityRecords}
                selectedAvailability={selectedAvailability}
                liveAvailabilityOptions={liveAvailabilityOptions}
                selectedLiveOptionId={selectedLiveOptionId}
                selectedLiveOption={selectedLiveOption}
                setSelectedLiveOptionId={setSelectedLiveOptionId}
                      loadingLiveAvailability={loadingLiveAvailability}
                liveAvailabilityError={liveAvailabilityError}
                isWelletProduct={isWelletProduct}
                hasAdvancedAvailability={hasAdvancedAvailability}
                availabilityDateAllowed={availabilityDateAllowed}
                pickupDateAllowed={pickupDateAllowed}
                pickupAvailability={pickupAvailability}
                dateAllowed={dateAllowed}
                paymentChoice={paymentChoice}
                setPaymentChoice={setPaymentChoice}
                paymentOptions={paymentOptions}
                totals={totals}
                canCheckout={canCheckout}
                goToCheckout={goToCheckout}
                onViewPhotos={() => openGalleryAt(0)}
                theme={theme}
              />
            </div>

            <div className="mt-8 space-y-6">
              <ContentCard title="Highlights" theme={theme}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {highlights.map((highlight, index) => (
                    <IconTextCard
                      key={`${highlight}-${index}`}
                      icon={CheckCircle2}
                      text={highlight}
                      theme={theme}
                    />
                  ))}
                </div>
              </ContentCard>

              <ContentCard
                title={`About this ${getProductTypeLabel(product.product_type).toLowerCase()}`}
                theme={theme}
              >
                <p
                  className="whitespace-pre-line leading-relaxed"
                  style={{ color: theme.muted }}
                >
                  {getBestDescription(product).trim()}
                </p>
              </ContentCard>

              {itineraryList.length > 0 && (
                <ContentCard title="Experience plan" theme={theme}>
                  <div className="space-y-3">
                    {itineraryList.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="flex gap-3 rounded-2xl border p-4"
                        style={{
                          backgroundColor: hexToRgba(theme.primary, 0.04),
                          borderColor: hexToRgba(theme.primary, 0.12),
                        }}
                      >
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ring-1"
                          style={{
                            backgroundColor: theme.card,
                            color: theme.accent,
                            borderColor: hexToRgba(theme.primary, 0.12),
                          }}
                        >
                          {index + 1}
                        </span>
                        <p className="text-sm font-semibold" style={{ color: theme.text }}>
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </ContentCard>
              )}

              {includesList.length > 0 && (
                <ContentCard title="What’s included" theme={theme}>
                  <PillList
                    items={includesList}
                    icon={CheckCircle2}
                    theme={theme}
                    positive
                  />
                </ContentCard>
              )}

              {excludesList.length > 0 && (
                <ContentCard title="Not included" theme={theme}>
                  <PillList items={excludesList} icon={XCircle} theme={theme} />
                </ContentCard>
              )}

              <ContentCard title="What to bring" theme={theme}>
                <div className="grid gap-3 sm:grid-cols-2">
                  {whatToBring.map((item, index) => (
                    <IconTextCard
                      key={`${item}-${index}`}
                      icon={Ticket}
                      text={item}
                      theme={theme}
                    />
                  ))}
                </div>
              </ContentCard>

              <ContentCard title={showPickup ? "Pickup information" : "Meeting point"} theme={theme}>
                <div
                  className="flex items-start gap-3 rounded-2xl border p-4"
                  style={{
                    backgroundColor: hexToRgba(theme.primary, 0.04),
                    borderColor: hexToRgba(theme.primary, 0.12),
                  }}
                >
                  <div
                    className="rounded-xl p-2 ring-1"
                    style={{
                      backgroundColor: theme.card,
                      borderColor: hexToRgba(theme.primary, 0.12),
                    }}
                  >
                    <MapPin className="h-4 w-4" style={{ color: theme.accent }} />
                  </div>

                  <div className="text-sm font-semibold" style={{ color: theme.text }}>
                    {showPickup
                      ? product.pickup_instructions ||
                        "Select your date and hotel/pickup location. The pickup time and pickup point will appear automatically when configured."
                      : product.address ||
                        product.location ||
                        "Meeting point will be shared after booking."}
                  </div>
                </div>
              </ContentCard>

              {product.cancellation_policy && (
                <ContentCard title="Cancellation policy" theme={theme}>
                  <p
                    className="whitespace-pre-line text-sm font-semibold leading-7"
                    style={{ color: theme.muted }}
                  >
                    {product.cancellation_policy}
                  </p>
                </ContentCard>
              )}

              {faqList.length > 0 && (
                <ContentCard title="Frequently asked questions" theme={theme}>
                  <div className="space-y-3">
                    {faqList.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        className="rounded-2xl border p-4"
                        style={{
                          backgroundColor: hexToRgba(theme.primary, 0.04),
                          borderColor: hexToRgba(theme.primary, 0.12),
                        }}
                      >
                        <p className="font-extrabold" style={{ color: theme.text }}>
                          Question {index + 1}
                        </p>
                        <p
                          className="mt-1 text-sm font-semibold leading-6"
                          style={{ color: theme.muted }}
                        >
                          {item}
                        </p>
                      </div>
                    ))}
                  </div>
                </ContentCard>
              )}

              {relatedProducts.length > 0 && (
                <ContentCard title="More experiences" theme={theme}>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {relatedProducts.map((relatedProduct) => (
                      <RelatedProductCard
                        key={relatedProduct.id}
                        product={relatedProduct}
                        publicPath={publicPath}
                        currencySymbol={currencySymbol}
                        theme={theme}
                      />
                    ))}
                  </div>
                </ContentCard>
              )}
            </div>
          </div>

          <aside className="hidden lg:col-span-4 lg:block">
            <div className="sticky top-24">
              <BookingCard
                product={product}
                isTransfer={isTransfer}
                transferRoutes={transferRoutes}
                selectedTransferRouteId={selectedTransferRouteId}
                setSelectedTransferRouteId={setSelectedTransferRouteId}
                selectedTransferRoute={selectedTransferRoute}
                selectedTransferPriceBand={selectedTransferPriceBand}
                transferRoundTrip={transferRoundTrip}
                setTransferRoundTrip={setTransferRoundTrip}
                preferredPickupTime={preferredPickupTime}
                setPreferredPickupTime={setPreferredPickupTime}
                transferTotalPrice={transferTotalPrice}
                transferPriceMissing={transferPriceMissing}
                currencySymbol={currencySymbol}
                date={date}
                setDate={setDate}
                qty={qty}
                updateQty={updateQty}
                pickupLocations={pickupLocations}
                pickupLocationId={pickupLocationId}
                setPickupLocationId={setPickupLocationId}
                showPickup={showPickup}
                resolvingPickup={resolvingPickup}
                resolvedPickup={resolvedPickup}
                selectedPickupLocation={selectedPickupLocation}
                productAvailabilityRecords={productAvailabilityRecords}
                selectedAvailability={selectedAvailability}
                liveAvailabilityOptions={liveAvailabilityOptions}
                selectedLiveOptionId={selectedLiveOptionId}
                selectedLiveOption={selectedLiveOption}
                setSelectedLiveOptionId={setSelectedLiveOptionId}
                      loadingLiveAvailability={loadingLiveAvailability}
                liveAvailabilityError={liveAvailabilityError}
                isWelletProduct={isWelletProduct}
                hasAdvancedAvailability={hasAdvancedAvailability}
                availabilityDateAllowed={availabilityDateAllowed}
                pickupDateAllowed={pickupDateAllowed}
                pickupAvailability={pickupAvailability}
                dateAllowed={dateAllowed}
                paymentChoice={paymentChoice}
                setPaymentChoice={setPaymentChoice}
                paymentOptions={paymentOptions}
                totals={totals}
                canCheckout={canCheckout}
                goToCheckout={goToCheckout}
                onViewPhotos={() => openGalleryAt(0)}
                theme={theme}
              />
            </div>
          </aside>
        </div>
      </main>

      {notice?.type === "share" && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
          <div
            className="rounded-2xl px-4 py-3 text-sm font-extrabold shadow-lg"
            style={{
              backgroundColor: theme.primary,
              color: "#FFFFFF",
            }}
          >
            {notice.title}
          </div>
        </div>
      )}

      {galleryOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setGalleryOpen(false)}
        >
          <div
            className="relative w-full max-w-5xl overflow-hidden rounded-3xl bg-black"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="absolute right-3 top-3 z-10">
              <button
                type="button"
                onClick={() => setGalleryOpen(false)}
                className="rounded-2xl bg-white/95 p-2 ring-1 ring-gray-200"
                aria-label="Close gallery"
              >
                <X className="h-5 w-5 text-gray-900" />
              </button>
            </div>

            <div className="relative">
              <div className="aspect-[16/9] w-full bg-black">
                {images[activeImg]?.image ? (
                  <img
                    src={images[activeImg].image}
                    alt={images[activeImg].caption || "Photo"}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="grid h-full place-items-center">
                    <ImageIcon className="h-12 w-12 text-white/40" />
                  </div>
                )}
              </div>

              {images[activeImg]?.caption && (
                <div className="absolute inset-x-0 bottom-0 bg-black/70 px-4 py-3 text-sm font-bold text-white">
                  {images[activeImg].caption}
                </div>
              )}

              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={prevImg}
                    className="absolute left-3 top-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-2 ring-1 ring-gray-200"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-6 w-6 text-gray-900" />
                  </button>

                  <button
                    type="button"
                    onClick={nextImg}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-2xl bg-white/95 p-2 ring-1 ring-gray-200"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-6 w-6 text-gray-900" />
                  </button>
                </>
              )}
            </div>

            {images.length > 1 && (
              <div className="bg-gray-950 p-3">
                <div className="flex gap-2 overflow-x-auto">
                  {images.map((image, index) => {
                    const active = index === activeImg;

                    return (
                      <button
                        key={`${image.image}-${index}`}
                        type="button"
                        onClick={() => setActiveImg(index)}
                        className={[
                          "relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border",
                          active ? "border-white" : "border-white/20",
                        ].join(" ")}
                      >
                        <img
                          src={image.image}
                          alt={image.caption || `Thumb ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicShell({
  publicPath,
  brandName,
  logoUrl,
  theme,
  children,
}: {
  publicPath: (path: string) => string;
  brandName: string;
  logoUrl: string;
  theme: PublicTheme;
  children: ReactNode;
}) {
  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: theme.background,
        color: theme.text,
      }}
    >
      <PublicHeader
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
      />

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-10 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function PublicHeader({
  publicPath,
  brandName,
  logoUrl,
  theme,
}: {
  publicPath: (path: string) => string;
  brandName: string;
  logoUrl: string;
  theme: PublicTheme;
}) {
  const { language, setLanguage } = useTicketingTranslation();

  return (
    <header
      className="sticky top-0 z-30 border-b backdrop-blur-xl"
      style={{
        backgroundColor: hexToRgba(theme.card, 0.92),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link to={publicPath("/")} className="flex items-center gap-3">
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

        <div className="flex items-center gap-2">
          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value as typeof language, true)
            }
            aria-label="Language"
            className="h-10 rounded-2xl border px-3 text-sm font-extrabold outline-none"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
              color: theme.text,
            }}
          >
            {ticketingLanguageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.shortLabel}
              </option>
            ))}
          </select>

          <Link
            to={publicPath("/")}
            className="rounded-2xl border px-4 py-2 text-sm font-extrabold transition"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
              color: theme.text,
            }}
          >
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}

function BookingCard({
  product,
  isTransfer,
  transferRoutes,
  selectedTransferRouteId,
  setSelectedTransferRouteId,
  selectedTransferRoute,
  selectedTransferPriceBand,
  transferRoundTrip,
  setTransferRoundTrip,
  preferredPickupTime,
  setPreferredPickupTime,
  transferTotalPrice,
  transferPriceMissing,
  currencySymbol,
  date,
  setDate,
  qty,
  updateQty,
  pickupLocations,
  pickupLocationId,
  setPickupLocationId,
  showPickup,
  resolvingPickup,
  resolvedPickup,
  selectedPickupLocation,
  productAvailabilityRecords,
  selectedAvailability,
  liveAvailabilityOptions,
  selectedLiveOptionId,
  setSelectedLiveOptionId,
  selectedLiveOption,
  loadingLiveAvailability,
  liveAvailabilityError,
  isWelletProduct,
  hasAdvancedAvailability,
  availabilityDateAllowed,
  pickupDateAllowed,
  pickupAvailability,
  dateAllowed,
  paymentChoice,
  setPaymentChoice,
  paymentOptions,
  totals,
  canCheckout,
  goToCheckout,
  onViewPhotos,
  theme,
}: {
  product: ExperienceProduct;
  isTransfer: boolean;
  transferRoutes: TransferRouteOption[];
  selectedTransferRouteId: string;
  setSelectedTransferRouteId: (id: string) => void;
  selectedTransferRoute: TransferRouteOption | null;
  selectedTransferPriceBand: TransferPriceBand | null;
  transferRoundTrip: boolean;
  setTransferRoundTrip: (value: boolean) => void;
  preferredPickupTime: string;
  setPreferredPickupTime: (value: string) => void;
  transferTotalPrice: number;
  transferPriceMissing: boolean;
  currencySymbol: string;
  date: string;
  setDate: (date: string) => void;
  qty: BookingQty;
  updateQty: (key: QtyKey, direction: "up" | "down") => void;
  pickupLocations: PickupLocation[];
  pickupLocationId: string;
  setPickupLocationId: (id: string) => void;
  showPickup: boolean;
  resolvingPickup: boolean;
  resolvedPickup: PickupResolveResponse | null;
  selectedPickupLocation: PickupLocation | null;
  productAvailabilityRecords: AdvancedAvailabilityRecord[];
  selectedAvailability: AdvancedAvailabilityRecord | null;
  liveAvailabilityOptions: LiveTicketOption[];
  selectedLiveOptionId: string;
  selectedLiveOption: LiveTicketOption | null;
  setSelectedLiveOptionId: (id: string) => void;
  loadingLiveAvailability: boolean;
  liveAvailabilityError: string;
  isWelletProduct: boolean;
  hasAdvancedAvailability: boolean;
  availabilityDateAllowed: boolean;
  pickupDateAllowed: boolean;
  pickupAvailability: PickupAvailabilitySummary;
  dateAllowed: boolean;
  paymentChoice: PaymentChoice;
  setPaymentChoice: (choice: PaymentChoice) => void;
  paymentOptions: {
    value: PaymentChoice;
    label: string;
    helper: string;
  }[];
  totals: {
    totalFull: number;
    totalDeposit: number;
    dueLater: number;
  };
  canCheckout: boolean;
  goToCheckout: () => void;
  onViewPhotos: () => void;
  theme: PublicTheme;
}) {
  const pax = qty.adult + qty.child + qty.infant;
  const displayUnitPrice = isTransfer
    ? transferTotalPrice
    : isWelletProduct
      ? getLiveOptionPrice(selectedLiveOption)
      : getEffectiveAdultPrice(product, selectedAvailability);
  const displayDeposit = isTransfer
    ? getEffectiveDepositAmount(product, selectedAvailability)
    : getEffectiveDepositAmount(product, selectedAvailability);

  return (
    <div
      className="overflow-hidden rounded-3xl border shadow-sm"
      id="booking"
      style={{
        backgroundColor: theme.card,
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div
        className="border-b p-5 sm:p-6"
        style={{ borderColor: hexToRgba(theme.primary, 0.12) }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold" style={{ color: theme.muted }}>
              From
            </div>
            <div className="mt-1 text-3xl font-extrabold" style={{ color: theme.text }}>
              {money(displayUnitPrice, currencySymbol)}
            </div>
            <div className="text-sm font-semibold" style={{ color: theme.muted }}>
              {isTransfer
                ? selectedTransferRoute
                  ? "per vehicle / group"
                  : "choose route"
                : selectedAvailability?.price_override
                  ? "adult price · selected date price"
                  : "adult price"}
            </div>
          </div>

          {displayDeposit > 0 && (
            <div className="text-right">
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-extrabold ring-1"
                style={{
                  backgroundColor: hexToRgba(theme.accent, 0.14),
                  color: theme.text,
                  borderColor: hexToRgba(theme.accent, 0.2),
                }}
              >
                <ShieldCheck className="h-4 w-4" style={{ color: theme.accent }} />
                Deposit
              </div>
              <div className="mt-2 text-sm font-semibold" style={{ color: theme.muted }}>
                Pay now:{" "}
                <span className="font-extrabold" style={{ color: theme.text }}>
                  {money(displayDeposit, currencySymbol)}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onViewPhotos}
            className="inline-flex items-center justify-center rounded-2xl border px-4 py-3 text-sm font-extrabold transition"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
              color: theme.text,
            }}
          >
            View photos
          </button>

          <button
            type="button"
            onClick={goToCheckout}
            disabled={!canCheckout}
            aria-disabled={!canCheckout}
            className="inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: canCheckout ? theme.button : theme.muted }}
          >
            {paymentOptions.length ? `Checkout • ${money2(totals.totalDeposit, currencySymbol)}` : "Checkout unavailable"}
          </button>
        </div>

        <div className="mt-3 text-xs font-semibold" style={{ color: theme.muted }}>
          Secure checkout • Local support • Fast confirmation
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {isTransfer && (
          <TransferRouteBookingSection
            routes={transferRoutes}
            selectedRouteId={selectedTransferRouteId}
            setSelectedRouteId={setSelectedTransferRouteId}
            selectedRoute={selectedTransferRoute}
            selectedPriceBand={selectedTransferPriceBand}
            roundTrip={transferRoundTrip}
            setRoundTrip={setTransferRoundTrip}
            preferredPickupTime={preferredPickupTime}
            setPreferredPickupTime={setPreferredPickupTime}
            passengerCount={pax}
            totalPrice={transferTotalPrice}
            priceMissing={transferPriceMissing}
            currencySymbol={currencySymbol}
            theme={theme}
          />
        )}

        {showPickup && (
          <div>
            <div className="text-sm font-extrabold" style={{ color: theme.text }}>
              Hotel / pickup location
            </div>

            <select
              value={pickupLocationId}
              onChange={(event) => {
                setPickupLocationId(event.target.value);
                setDate("");
              }}
              className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
                color: theme.text,
              }}
            >
              <option value="">Select hotel/location</option>

              {pickupLocations.map((location) => (
                <option key={location.id} value={String(location.id)}>
                  {location.name}
                </option>
              ))}
            </select>

            {pickupLocations.length === 0 && (
              <p className="mt-2 text-xs font-bold" style={{ color: theme.accent }}>
                No hotels are configured for pickup yet.
              </p>
            )}
          </div>
        )}

        <FilteredDatePicker
          product={product}
          value={date}
          onChange={setDate}
          showPickup={showPickup}
          pickupLocationId={pickupLocationId}
          selectedPickupLocation={selectedPickupLocation}
          hasAdvancedAvailability={hasAdvancedAvailability}
          availabilityDateAllowed={availabilityDateAllowed}
          pickupDateAllowed={pickupDateAllowed}
          dateAllowed={dateAllowed}
          theme={theme}
        />

        {isWelletProduct && (
          <LiveTicketOptionsCard
            options={liveAvailabilityOptions}
            selectedOptionId={selectedLiveOptionId}
            setSelectedOptionId={setSelectedLiveOptionId}
            loading={loadingLiveAvailability}
            error={liveAvailabilityError}
            date={date}
            currencySymbol={currencySymbol}
            theme={theme}
          />
        )}

        {hasAdvancedAvailability && (
          <DateAvailabilityCard
            records={productAvailabilityRecords}
            selectedRecord={selectedAvailability}
            date={date}
            dateAllowed={availabilityDateAllowed}
            currencySymbol={currencySymbol}
            theme={theme}
          />
        )}

        <GuestSelector
          product={product}
          selectedAvailability={selectedAvailability}
          isTransfer={isTransfer}
          isWelletProduct={isWelletProduct}
          qty={qty}
          updateQty={updateQty}
          totals={totals}
          pax={pax}
          currencySymbol={currencySymbol}
          theme={theme}
        />

        {showPickup && (
          <>
            {!resolvedPickup?.found && (
              <PickupAvailabilityCard
                summary={pickupAvailability}
                selectedLocation={selectedPickupLocation}
                date={date}
                dateAllowed={dateAllowed}
                theme={theme}
              />
            )}

            <PickupResult
              resolvingPickup={resolvingPickup}
              resolvedPickup={resolvedPickup}
              pickupLocationId={pickupLocationId}
              selectedPickupLocation={selectedPickupLocation}
              date={date}
              theme={theme}
            />
          </>
        )}

        <div>
          <div className="text-sm font-extrabold" style={{ color: theme.text }}>
            Payment option
          </div>

          {paymentOptions.length > 0 ? (
            <div className="mt-2 space-y-2">
              {paymentOptions.map((option) => (
                <label
                  key={option.value}
                  className="block cursor-pointer rounded-2xl border p-3 transition"
                  style={{
                    borderColor:
                      paymentChoice === option.value
                        ? hexToRgba(theme.accent, 0.55)
                        : hexToRgba(theme.primary, 0.12),
                    backgroundColor:
                      paymentChoice === option.value
                        ? hexToRgba(theme.accent, 0.12)
                        : theme.card,
                  }}
                >
                  <div className="flex gap-3">
                    <input
                      type="radio"
                      name="payment_choice"
                      value={option.value}
                      checked={paymentChoice === option.value}
                      onChange={() => setPaymentChoice(option.value)}
                      className="mt-1"
                      style={{ accentColor: theme.accent }}
                    />

                    <div>
                      <div className="text-sm font-extrabold" style={{ color: theme.text }}>
                        {option.label}
                      </div>
                      <div
                        className="mt-1 text-xs font-semibold leading-5"
                        style={{ color: theme.muted }}
                      >
                        {option.helper}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          ) : (
            <div
              className="mt-2 rounded-2xl border p-4 text-sm font-bold leading-6"
              style={{
                backgroundColor: hexToRgba(theme.accent, 0.1),
                borderColor: hexToRgba(theme.accent, 0.25),
                color: theme.text,
              }}
            >
              No payment option is available for this product yet. Please contact the
              seller or administrator.
            </div>
          )}
        </div>

        <div
          className="rounded-2xl border p-4"
          style={{
            backgroundColor: hexToRgba(theme.primary, 0.04),
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <div className="flex items-center justify-between text-sm font-extrabold">
            <span style={{ color: theme.text }}>Total</span>
            <span style={{ color: theme.text }}>
              {money2(totals.totalFull, currencySymbol)}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between text-sm font-bold">
            <span style={{ color: theme.muted }}>Pay now</span>
            <span style={{ color: theme.text }}>
              {money2(totals.totalDeposit, currencySymbol)}
            </span>
          </div>

          <div className="mt-1 flex items-center justify-between text-xs font-bold">
            <span style={{ color: theme.muted }}>Pay later</span>
            <span style={{ color: theme.muted }}>
              {money2(totals.dueLater, currencySymbol)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={goToCheckout}
          disabled={!canCheckout}
          aria-disabled={!canCheckout}
          className="inline-flex w-full items-center justify-center rounded-2xl px-4 py-3 text-sm font-extrabold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: canCheckout ? theme.button : theme.muted }}
        >
          {paymentOptions.length ? `Checkout • ${money2(totals.totalDeposit, currencySymbol)}` : "Checkout unavailable"}
        </button>

        <div className="text-xs font-semibold" style={{ color: theme.muted }}>
          {isTransfer
            ? "Choose your preferred pickup time. We confirm driver details after booking."
            : "Pickup time is calculated automatically when a matching hotel/date schedule exists."}
        </div>
      </div>
    </div>
  );
}


function TransferRouteBookingSection({
  routes,
  selectedRouteId,
  setSelectedRouteId,
  selectedRoute,
  selectedPriceBand,
  roundTrip,
  setRoundTrip,
  preferredPickupTime,
  setPreferredPickupTime,
  passengerCount,
  totalPrice,
  priceMissing,
  currencySymbol,
  theme,
}: {
  routes: TransferRouteOption[];
  selectedRouteId: string;
  setSelectedRouteId: (id: string) => void;
  selectedRoute: TransferRouteOption | null;
  selectedPriceBand: TransferPriceBand | null;
  roundTrip: boolean;
  setRoundTrip: (value: boolean) => void;
  preferredPickupTime: string;
  setPreferredPickupTime: (value: string) => void;
  passengerCount: number;
  totalPrice: number;
  priceMissing: boolean;
  currencySymbol: string;
  theme: PublicTheme;
}) {
  return (
    <div
      className="rounded-3xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.035),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div>
        <div className="text-sm font-extrabold" style={{ color: theme.text }}>
          Transfer route
        </div>

        <select
          value={selectedRouteId}
          onChange={(event) => setSelectedRouteId(event.target.value)}
          className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        >
          <option value="">Select pickup and destination route</option>

          {routes.map((route) => (
            <option key={route.id} value={String(route.id)}>
              {getTransferRouteLabel(route)}
            </option>
          ))}
        </select>

        {!routes.length && (
          <p className="mt-2 text-xs font-bold" style={{ color: theme.accent }}>
            Transfer routes are not configured for this product yet.
          </p>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label
          className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3"
          style={{
            backgroundColor: !roundTrip ? hexToRgba(theme.accent, 0.1) : theme.card,
            borderColor: !roundTrip
              ? hexToRgba(theme.accent, 0.55)
              : hexToRgba(theme.primary, 0.12),
          }}
        >
          <input
            type="radio"
            checked={!roundTrip}
            onChange={() => setRoundTrip(false)}
            className="mt-1"
            style={{ accentColor: theme.accent }}
          />
          <span>
            <span className="block text-sm font-black" style={{ color: theme.text }}>
              One way
            </span>
            <span className="mt-1 block text-xs font-bold" style={{ color: theme.muted }}>
              Pickup to destination
            </span>
          </span>
        </label>

        <label
          className="flex cursor-pointer items-start gap-3 rounded-2xl border p-3"
          style={{
            backgroundColor: roundTrip ? hexToRgba(theme.accent, 0.1) : theme.card,
            borderColor: roundTrip
              ? hexToRgba(theme.accent, 0.55)
              : hexToRgba(theme.primary, 0.12),
          }}
        >
          <input
            type="radio"
            checked={roundTrip}
            onChange={() => setRoundTrip(true)}
            className="mt-1"
            style={{ accentColor: theme.accent }}
          />
          <span>
            <span className="block text-sm font-black" style={{ color: theme.text }}>
              Round trip
            </span>
            <span className="mt-1 block text-xs font-bold" style={{ color: theme.muted }}>
              Return included
            </span>
          </span>
        </label>
      </div>

      <div className="mt-4">
        <div className="text-sm font-extrabold" style={{ color: theme.text }}>
          Preferred pickup time
        </div>
        <input
          type="time"
          value={preferredPickupTime}
          onChange={(event) => setPreferredPickupTime(event.target.value)}
          className="mt-2 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        />
        <p className="mt-2 text-xs font-bold" style={{ color: theme.muted }}>
          This is your preferred time. We confirm final driver details after booking.
        </p>
      </div>

      {selectedRoute && (
        <div
          className="mt-4 rounded-2xl border p-4"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <div className="text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
            Price for {passengerCount} passenger{passengerCount === 1 ? "" : "s"}
          </div>

          {priceMissing ? (
            <div className="mt-2 text-sm font-black" style={{ color: theme.accent }}>
              No price band is configured for this passenger count.
            </div>
          ) : (
            <div className="mt-1 text-2xl font-black" style={{ color: theme.text }}>
              {money2(totalPrice, currencySymbol)}
            </div>
          )}

          {selectedPriceBand && (
            <div className="mt-2 text-xs font-bold" style={{ color: theme.muted }}>
              {selectedPriceBand.name || `${selectedPriceBand.min_passengers}-${selectedPriceBand.max_passengers} passengers`}
              {selectedPriceBand.vehicle_type ? ` · ${selectedPriceBand.vehicle_type}` : ""}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LiveTicketOptionsCard({
  options,
  selectedOptionId,
  setSelectedOptionId,
  loading,
  error,
  date,
  currencySymbol,
  theme,
}: {
  options: LiveTicketOption[];
  selectedOptionId: string;
  setSelectedOptionId: (id: string) => void;
  loading: boolean;
  error: string;
  date: string;
  currencySymbol: string;
  theme: PublicTheme;
}) {
  if (!date) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm font-bold"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
          color: theme.muted,
        }}
      >
        Select a date to see Coco Bongo ticket options.
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 rounded-2xl border p-4 text-sm font-extrabold"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
          color: theme.text,
        }}
      >
        <Loader2 className="h-4 w-4 animate-spin" style={{ color: theme.accent }} />
        Loading live Coco Bongo tickets...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm font-bold"
        style={{
          backgroundColor: hexToRgba(theme.accent, 0.1),
          borderColor: hexToRgba(theme.accent, 0.25),
          color: theme.text,
        }}
      >
        {error}
      </div>
    );
  }

  if (!options.length) {
    return (
      <div
        className="rounded-2xl border p-4 text-sm font-bold"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
          color: theme.muted,
        }}
      >
        No Coco Bongo tickets were found for this date.
      </div>
    );
  }

  return (
    <div
      className="rounded-3xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.035),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black" style={{ color: theme.text }}>
            Coco Bongo tickets
          </div>
          <p className="mt-1 text-xs font-bold" style={{ color: theme.muted }}>
            Choose one option. Prices and availability are live.
          </p>
        </div>

        <span
          className="rounded-full px-3 py-1 text-xs font-black"
          style={{
            backgroundColor: hexToRgba(theme.accent, 0.14),
            color: theme.accent,
          }}
        >
          Live
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        {options.map((option, index) => {
          const optionId = getLiveOptionKey(option) || `option-${index}`;
          const disabled = option.available === false || option.sold_out === true;
          const selected = selectedOptionId === optionId;
          const availableQuantity = option.available_quantity;
          const features = Array.isArray(option.features)
            ? option.features.filter(Boolean).slice(0, 2)
            : [];

          return (
            <label
              key={optionId}
              className={[
                "block rounded-2xl border p-4 transition",
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:shadow-sm",
              ].join(" ")}
              style={{
                borderColor: selected
                  ? hexToRgba(theme.accent, 0.7)
                  : hexToRgba(theme.primary, 0.12),
                backgroundColor: selected
                  ? hexToRgba(theme.accent, 0.1)
                  : theme.card,
              }}
            >
              <div className="flex gap-3">
                <input
                  type="radio"
                  name="live_ticket_option"
                  value={optionId}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => setSelectedOptionId(optionId)}
                  className="mt-1 shrink-0"
                  style={{ accentColor: theme.accent }}
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div
                        className="text-sm font-black leading-5"
                        style={{ color: theme.text }}
                      >
                        {getLiveOptionLabel(option)}
                      </div>

                      {option.description && (
                        <div
                          className="mt-1 text-xs font-bold leading-5"
                          style={{ color: theme.muted }}
                        >
                          {option.description}
                        </div>
                      )}
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-lg font-black" style={{ color: theme.text }}>
                        {money2(option.price || 0, currencySymbol)}
                      </div>
                      <div className="text-[11px] font-black" style={{ color: theme.muted }}>
                        per person
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {(option.start_time || option.end_time) && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-black"
                        style={{
                          backgroundColor: hexToRgba(theme.primary, 0.06),
                          color: theme.text,
                        }}
                      >
                        {option.start_time ? formatLiveTime(option.start_time) : ""}
                        {option.end_time ? ` - ${formatLiveTime(option.end_time)}` : ""}
                      </span>
                    )}

                    {option.checkin_time && (
                      <span
                        className="rounded-full px-2.5 py-1 text-[11px] font-black"
                        style={{
                          backgroundColor: hexToRgba(theme.primary, 0.06),
                          color: theme.text,
                        }}
                      >
                        Check-in {formatLiveTime(option.checkin_time)}
                      </span>
                    )}

                    {availableQuantity !== null &&
                      availableQuantity !== undefined && (
                        <span
                          className="rounded-full px-2.5 py-1 text-[11px] font-black"
                          style={{
                            backgroundColor: hexToRgba(theme.primary, 0.06),
                            color: theme.text,
                          }}
                        >
                          {availableQuantity} available
                        </span>
                      )}

                    {features.map((feature) => (
                      <span
                        key={feature}
                        className="rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                        style={{
                          backgroundColor: hexToRgba(theme.primary, 0.05),
                          color: theme.muted,
                        }}
                      >
                        {feature}
                      </span>
                    ))}
                  </div>

                  {disabled && (
                    <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-black text-red-600">
                      Sold out
                    </div>
                  )}
                </div>
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function addMonths(date: Date, amount: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + amount);
  return next;
}

function getMonthStart(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function toIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getCalendarDays(monthDate: Date) {
  const monthStart = getMonthStart(monthDate);
  const start = new Date(monthStart);

  // Calendar starts Monday. JS Sunday=0, Monday=1.
  const offset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function getMonthTitle(monthDate: Date) {
  return monthDate.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function FilteredDatePicker({
  product,
  value,
  onChange,
  showPickup,
  pickupLocationId,
  selectedPickupLocation,
  hasAdvancedAvailability,
  availabilityDateAllowed,
  pickupDateAllowed,
  dateAllowed,
  theme,
}: {
  product: ExperienceProduct;
  value: string;
  onChange: (value: string) => void;
  showPickup: boolean;
  pickupLocationId: string;
  selectedPickupLocation: PickupLocation | null;
  hasAdvancedAvailability: boolean;
  availabilityDateAllowed: boolean;
  pickupDateAllowed: boolean;
  dateAllowed: boolean;
  theme: PublicTheme;
}) {
  const initialMonth = value
    ? new Date(`${value}T00:00:00`)
    : new Date(`${getToday()}T00:00:00`);

  const [monthDate, setMonthDate] = useState(() => getMonthStart(initialMonth));

  useEffect(() => {
    if (!value) return;

    const selected = new Date(`${value}T00:00:00`);

    if (!Number.isNaN(selected.getTime())) {
      setMonthDate(getMonthStart(selected));
    }
  }, [value]);

  const today = getToday();
  const days = getCalendarDays(monthDate);
  const monthNumber = monthDate.getMonth();
  const productHasSchedules = getProductPickupSchedules(product).length > 0;
  const requiresHotelFirst = showPickup && productHasSchedules && !pickupLocationId;

  function isDateEnabled(iso: string) {
    if (iso < today) return false;

    if (requiresHotelFirst) return false;

    if (!isAdvancedAvailabilityDateAllowed(product, iso)) return false;

    if (showPickup && productHasSchedules) {
      return isPickupDateAllowed(product, iso, pickupLocationId);
    }

    return true;
  }

  const selectableDatesInMonth = days
    .map(toIsoDate)
    .filter((iso) => iso.slice(0, 7) === toIsoDate(monthDate).slice(0, 7))
    .filter(isDateEnabled);

  return (
    <div>
      <div className="text-sm font-extrabold" style={{ color: theme.text }}>
        Date
      </div>

      <div
        className="mt-2 rounded-2xl border p-3"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor:
            value && !dateAllowed
              ? hexToRgba(theme.accent, 0.65)
              : hexToRgba(theme.primary, 0.12),
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setMonthDate((current) => addMonths(current, -1))}
            className="rounded-xl border px-3 py-2 text-xs font-black"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
              color: theme.text,
            }}
          >
            Prev
          </button>

          <div className="text-sm font-black" style={{ color: theme.text }}>
            {getMonthTitle(monthDate)}
          </div>

          <button
            type="button"
            onClick={() => setMonthDate((current) => addMonths(current, 1))}
            className="rounded-xl border px-3 py-2 text-xs font-black"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
              color: theme.text,
            }}
          >
            Next
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
            <div
              key={`${day}-${index}`}
              className="py-1 text-[11px] font-black uppercase"
              style={{ color: theme.muted }}
            >
              {day}
            </div>
          ))}

          {days.map((day) => {
            const iso = toIsoDate(day);
            const inCurrentMonth = day.getMonth() === monthNumber;
            const enabled = isDateEnabled(iso);
            const selected = value === iso;

            return (
              <button
                key={iso}
                type="button"
                disabled={!enabled}
                onClick={() => enabled && onChange(iso)}
                className={[
                  "aspect-square rounded-xl text-xs font-black transition",
                  selected ? "text-white" : "",
                  !enabled ? "cursor-not-allowed opacity-30" : "hover:scale-[1.03]",
                  !inCurrentMonth ? "opacity-20" : "",
                ].join(" ")}
                style={{
                  backgroundColor: selected
                    ? theme.button
                    : enabled
                      ? theme.card
                      : "transparent",
                  color: selected
                    ? "#FFFFFF"
                    : enabled
                      ? theme.text
                      : theme.muted,
                  border: enabled
                    ? `1px solid ${hexToRgba(theme.primary, 0.12)}`
                    : "1px solid transparent",
                }}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        {requiresHotelFirst && (
          <p className="mt-3 text-xs font-bold leading-5" style={{ color: theme.muted }}>
            Select your hotel first. Then this calendar will show only the
            available pickup dates for that hotel.
          </p>
        )}

        {!requiresHotelFirst && selectableDatesInMonth.length === 0 && (
          <p className="mt-3 text-xs font-bold leading-5" style={{ color: theme.accent }}>
            No available dates in this month. Try the next month or check the
            product pickup schedule.
          </p>
        )}

        {value && !dateAllowed && (
          <p className="mt-3 text-xs font-black" style={{ color: theme.accent }}>
            {!availabilityDateAllowed
              ? "This date is closed or sold out."
              : !pickupDateAllowed
                ? "This date is not available for pickup."
                : "This date is not available."}
          </p>
        )}

        {value && dateAllowed && (
          <p className="mt-3 text-xs font-black text-emerald-700">
            Selected date: {formatDateLabel(value)}
            {selectedPickupLocation ? ` · ${selectedPickupLocation.name}` : ""}
          </p>
        )}
      </div>

      {hasAdvancedAvailability && (
        <p className="mt-2 text-xs font-semibold" style={{ color: theme.muted }}>
          Advanced availability is active. Closed, sold-out and unavailable dates
          are automatically disabled.
        </p>
      )}
    </div>
  );
}

function DateAvailabilityCard({
  records,
  selectedRecord,
  date,
  dateAllowed,
  currencySymbol,
  theme,
}: {
  records: AdvancedAvailabilityRecord[];
  selectedRecord: AdvancedAvailabilityRecord | null;
  date: string;
  dateAllowed: boolean;
  currencySymbol: string;
  theme: PublicTheme;
}) {
  const upcomingRecords = records
    .filter((record) => record.date >= getToday())
    .slice(0, 8);

  const remaining = getRemainingCapacity(selectedRecord);

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.04),
        borderColor:
          date && !dateAllowed
            ? hexToRgba(theme.accent, 0.65)
            : hexToRgba(theme.primary, 0.12),
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-xl p-2 ring-1"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: theme.accent }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold" style={{ color: theme.text }}>
            Available dates & capacity
          </div>

          <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
            These dates are controlled by Availability. Use it for capacity, sold-out dates,
            date price overrides, deposit overrides and manual blocking.
          </p>

          {date && selectedRecord && dateAllowed && (
            <div className="mt-3 rounded-xl bg-white/70 p-3">
              <div className="text-xs font-black uppercase tracking-wide text-emerald-700">
                Selected date available
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-bold text-emerald-700">Remaining capacity</p>
                  <p className="text-lg font-black text-emerald-950">
                    {remaining === null ? "Available" : remaining}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-bold text-emerald-700">Price</p>
                  <p className="text-lg font-black text-emerald-950">
                    {selectedRecord.price_override
                      ? money2(selectedRecord.price_override, currencySymbol)
                      : "Default price"}
                  </p>
                </div>
              </div>

              {selectedRecord.deposit_override && (
                <p className="mt-2 text-xs font-semibold text-emerald-800">
                  Deposit override: {money2(selectedRecord.deposit_override, currencySymbol)}
                </p>
              )}

              {selectedRecord.note && (
                <p className="mt-2 text-xs font-semibold leading-5 text-emerald-800">
                  {selectedRecord.note}
                </p>
              )}
            </div>
          )}

          {date && !selectedRecord && (
            <p className="mt-3 text-xs font-black" style={{ color: theme.accent }}>
              This date has not been opened in Availability.
            </p>
          )}

          {date && selectedRecord && !dateAllowed && (
            <p className="mt-3 text-xs font-black" style={{ color: theme.accent }}>
              This date is closed or sold out.
            </p>
          )}

          {upcomingRecords.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
                Upcoming available dates
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {upcomingRecords.map((record) => {
                  const recordRemaining = getRemainingCapacity(record);
                  const disabled = record.is_available === false || (recordRemaining !== null && recordRemaining <= 0);

                  return (
                    <span
                      key={record.id || record.date}
                      className="rounded-full px-3 py-1 text-xs font-black"
                      style={{
                        backgroundColor: disabled
                          ? hexToRgba(theme.primary, 0.08)
                          : hexToRgba(theme.accent, 0.14),
                        color: disabled ? theme.muted : theme.text,
                      }}
                    >
                      {formatDateLabel(record.date)}
                      {disabled ? " · closed" : recordRemaining !== null ? ` · ${recordRemaining} left` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PickupAvailabilityCard({
  summary,
  selectedLocation,
  date,
  dateAllowed,
  theme,
}: {
  summary: PickupAvailabilitySummary;
  selectedLocation: PickupLocation | null;
  date: string;
  dateAllowed: boolean;
  theme: PublicTheme;
}) {
  if (!selectedLocation) {
    return (
      <div
        className="rounded-2xl border border-dashed p-4"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.14),
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className="rounded-xl p-2 ring-1"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
            }}
          >
            <MapPin className="h-4 w-4" style={{ color: theme.accent }} />
          </div>

          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold" style={{ color: theme.text }}>
              Select your hotel first
            </div>
            <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
              The pickup days and pickup time will appear after you choose your
              hotel or pickup location.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const hasVisibleRules =
    summary.dayLabels.length > 0 ||
    summary.specificDateLabels.length > 0 ||
    summary.timeLabels.length > 0;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.04),
        borderColor:
          date && !dateAllowed
            ? hexToRgba(theme.accent, 0.65)
            : hexToRgba(theme.primary, 0.12),
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="rounded-xl p-2 ring-1"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <CalendarDays className="h-4 w-4" style={{ color: theme.accent }} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold" style={{ color: theme.text }}>
            Pickup availability
          </div>

          <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
            Showing pickup rules for {selectedLocation.name}.
          </p>

          {!summary.hasSchedules && (
            <p className="mt-3 text-xs font-black" style={{ color: theme.accent }}>
              No pickup schedules are configured for this product yet.
            </p>
          )}

          {summary.hasSchedules && !summary.selectedLocationHasSchedules && (
            <p className="mt-3 text-xs font-black" style={{ color: theme.accent }}>
              This hotel does not have pickup time configured for this product.
            </p>
          )}

          {hasVisibleRules && (
            <div className="mt-3 space-y-3">
              {summary.dayLabels.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
                    Available pickup days
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.dayLabels.map((day) => (
                      <span
                        key={day}
                        className="rounded-full px-3 py-1 text-xs font-black"
                        style={{
                          backgroundColor: hexToRgba(theme.accent, 0.14),
                          color: theme.text,
                        }}
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.specificDateLabels.length > 0 && (
                <div>
                  <p className="text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
                    Specific pickup dates
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.specificDateLabels.slice(0, 8).map((specificDate) => (
                      <span
                        key={specificDate}
                        className="rounded-full px-3 py-1 text-xs font-black"
                        style={{
                          backgroundColor: theme.card,
                          color: theme.text,
                          border: `1px solid ${hexToRgba(theme.primary, 0.12)}`,
                        }}
                      >
                        {specificDate}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {summary.timeLabels.length > 0 && (
                <p className="text-xs font-semibold leading-5" style={{ color: theme.muted }}>
                  The exact pickup time will appear after you select a valid date.
                </p>
              )}
            </div>
          )}

          {date && dateAllowed && summary.selectedLocationHasSchedules && (
            <p className="mt-3 text-xs font-black text-emerald-700">
              This service date is available. The exact pickup assignment appears below.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function GuestSelector({
  product,
  selectedAvailability,
  isTransfer,
  isWelletProduct,
  qty,
  updateQty,
  totals,
  pax,
  currencySymbol,
  theme,
}: {
  product: ExperienceProduct;
  selectedAvailability: AdvancedAvailabilityRecord | null;
  isTransfer: boolean;
  isWelletProduct: boolean;
  qty: BookingQty;
  updateQty: (key: QtyKey, direction: "up" | "down") => void;
  totals: {
    totalFull: number;
    totalDeposit: number;
    dueLater: number;
  };
  pax: number;
  currencySymbol: string;
  theme: PublicTheme;
}) {
  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.04),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div
            className="rounded-xl p-2 ring-1"
            style={{
              backgroundColor: theme.card,
              borderColor: hexToRgba(theme.primary, 0.12),
            }}
          >
            <Users className="h-4 w-4" style={{ color: theme.accent }} />
          </div>

          <div>
            <div className="text-sm font-extrabold" style={{ color: theme.text }}>
              Guests
            </div>
            <div className="text-xs font-semibold" style={{ color: theme.muted }}>
              At least 1 adult
            </div>
          </div>
        </div>

        <div className="text-right">
          <div className="text-sm font-extrabold" style={{ color: theme.text }}>
            {pax} total
          </div>
          <div className="text-xs font-semibold" style={{ color: theme.muted }}>
            Pay now: {money2(totals.totalDeposit, currencySymbol)}
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {(["adult", "child", "infant"] as QtyKey[]).map((key) => {
          const label =
            key === "adult" ? "Adults" : key === "child" ? "Children" : "Infants";

          const unitPrice =
            isTransfer || isWelletProduct
              ? null
              : getEffectivePassengerPrice(product, selectedAvailability, key);

          return (
            <div key={key} className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-extrabold" style={{ color: theme.text }}>
                  {label}
                </div>
                {unitPrice !== null && (
                  <div className="mt-0.5 text-xs font-bold" style={{ color: theme.muted }}>
                    {money2(unitPrice, currencySymbol)} each
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateQty(key, "down")}
                  className="rounded-xl border p-2 transition"
                  style={{
                    backgroundColor: theme.card,
                    borderColor: hexToRgba(theme.primary, 0.12),
                    color: theme.text,
                  }}
                  aria-label={`Decrease ${label}`}
                >
                  <Minus className="h-4 w-4" />
                </button>

                <div className="w-10 text-center text-sm font-extrabold" style={{ color: theme.text }}>
                  {qty[key]}
                </div>

                <button
                  type="button"
                  onClick={() => updateQty(key, "up")}
                  className="rounded-xl border p-2 transition"
                  style={{
                    backgroundColor: theme.card,
                    borderColor: hexToRgba(theme.primary, 0.12),
                    color: theme.text,
                  }}
                  aria-label={`Increase ${label}`}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PickupResult({
  resolvingPickup,
  resolvedPickup,
  pickupLocationId,
  selectedPickupLocation,
  date,
  theme,
}: {
  resolvingPickup: boolean;
  resolvedPickup: PickupResolveResponse | null;
  pickupLocationId: string;
  selectedPickupLocation: PickupLocation | null;
  date: string;
  theme: PublicTheme;
}) {
  if (!pickupLocationId) {
    return (
      <div
        className="rounded-2xl border border-dashed p-4 text-xs font-semibold leading-5"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.14),
          color: theme.muted,
        }}
      >
        Select a hotel/location to calculate the pickup time.
      </div>
    );
  }

  if (!date) {
    return (
      <div
        className="rounded-2xl border border-dashed p-4 text-xs font-semibold leading-5"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.14),
          color: theme.muted,
        }}
      >
        Select a service date to calculate the pickup time.
      </div>
    );
  }

  if (resolvingPickup) {
    return (
      <div
        className="flex items-center gap-3 rounded-2xl border p-4"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
        }}
      >
        <Loader2 className="h-5 w-5 animate-spin" style={{ color: theme.accent }} />
        <div className="text-sm font-extrabold" style={{ color: theme.text }}>
          Calculating pickup time...
        </div>
      </div>
    );
  }

  if (!resolvedPickup?.found) {
    return (
      <div
        className="rounded-2xl border p-4"
        style={{
          backgroundColor: hexToRgba(theme.accent, 0.1),
          borderColor: hexToRgba(theme.accent, 0.28),
        }}
      >
        <div className="text-sm font-extrabold" style={{ color: theme.text }}>
          Pickup time not configured yet
        </div>
        <div className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
          {resolvedPickup?.message ||
            "No matching pickup schedule was found for this date and location."}
        </div>
      </div>
    );
  }

  const schedule = resolvedPickup.schedule as ProductPickupSchedule | undefined;

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <div className="text-xs font-extrabold uppercase tracking-wide text-emerald-700">
        Pickup assigned
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs font-bold text-emerald-700">Time</div>
          <div className="text-xl font-extrabold text-emerald-950">
            {formatTime(schedule?.pickup_time)}
          </div>
        </div>

        <div>
          <div className="text-xs font-bold text-emerald-700">Hotel</div>
          <div className="text-sm font-extrabold text-emerald-950">
            {selectedPickupLocation?.name || resolvedPickup.pickup_location}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-white/70 p-3">
        <div className="text-xs font-bold text-emerald-700">Pickup point</div>
        <div className="mt-1 text-sm font-extrabold text-emerald-950">
          {schedule?.resolved_pickup_point || schedule?.pickup_point}
        </div>

        {schedule?.instructions && (
          <div className="mt-2 text-xs font-semibold leading-5 text-emerald-800">
            {schedule.instructions}
          </div>
        )}
      </div>
    </div>
  );
}

function ContentCard({
  title,
  theme,
  children,
}: {
  title: string;
  theme: PublicTheme;
  children: ReactNode;
}) {
  return (
    <section
      className="rounded-3xl border p-5 shadow-sm sm:p-6"
      style={{
        backgroundColor: theme.card,
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <h2 className="text-lg font-extrabold" style={{ color: theme.text }}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function IconTextCard({
  icon: Icon,
  text,
  theme,
}: {
  icon: ElementType;
  text: string;
  theme: PublicTheme;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-4"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.04),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div
        className="mt-0.5 rounded-xl p-2 ring-1"
        style={{
          backgroundColor: theme.card,
          borderColor: hexToRgba(theme.primary, 0.12),
        }}
      >
        <Icon className="h-4 w-4" style={{ color: theme.accent }} />
      </div>

      <div className="text-sm font-semibold" style={{ color: theme.text }}>
        {text}
      </div>
    </div>
  );
}

function PillList({
  items,
  icon: Icon,
  theme,
  positive = false,
}: {
  items: string[];
  icon: ElementType;
  theme: PublicTheme;
  positive?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ring-1"
          style={{
            backgroundColor: theme.card,
            color: theme.text,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <Icon
            className="h-4 w-4"
            style={{ color: positive ? theme.accent : theme.muted }}
          />
          {item}
        </span>
      ))}
    </div>
  );
}

function RelatedProductCard({
  product,
  publicPath,
  currencySymbol,
  theme,
}: {
  product: ExperienceProduct;
  publicPath: (path: string) => string;
  currencySymbol: string;
  theme: PublicTheme;
}) {
  const image = getGallery(product)[0]?.image || "";

  return (
    <Link
      to={publicPath(getProductPublicPath(product))}
      className="group overflow-hidden rounded-3xl border shadow-sm transition hover:-translate-y-1 hover:shadow-md"
      style={{
        backgroundColor: theme.card,
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div
        className="h-32"
        style={{ backgroundColor: hexToRgba(theme.primary, 0.05) }}
      >
        {image ? (
          <img
            src={image}
            alt={product.image_alt_text || product.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.03]"
            loading="lazy"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <ImageIcon className="h-8 w-8" style={{ color: theme.muted }} />
          </div>
        )}
      </div>

      <div className="p-4">
        <p className="line-clamp-2 text-sm font-extrabold" style={{ color: theme.text }}>
          {product.name}
        </p>

        <p className="mt-2 text-sm font-extrabold" style={{ color: theme.accent }}>
          {money(getPassengerBasePrice(product, "adult"), currencySymbol)}
        </p>
      </div>
    </Link>
  );
}
