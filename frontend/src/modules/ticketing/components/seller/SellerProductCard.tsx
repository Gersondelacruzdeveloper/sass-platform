// src/modules/ticketing/components/seller/SellerProductCard.tsx

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertCircle,
  CalendarDays,
  Check,
  Copy,
  Link2,
  Loader2,
  MapPin,
} from "lucide-react";

import api from "../../../../api/axios";
import ticketingApi from "../../api/ticketingApi";
import type { ExperienceProduct } from "../../types/ticketingTypes";

type SellerProductCardProps = {
  product: ExperienceProduct;
  bookingPath: string;
};

type SignedOfferResponse = {
  organisation_slug: string;
  seller_slug: string;
  product_id: number;
  product_slug: string;
  discount_percent: string;
  discount_amount?: string;
  maximum_discount_percent: string;
  maximum_discount_amount?: string;
  customer_final_price?: string;
  seller_allowance_amount?: string;
  seller_commission_amount?: string;
  offer_token: string;
  expires_in_seconds: number;
  offer_url?: string;
};

type SellerPricingQuote = {
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price?: string;
  original_price: string;
  rule_id?: number | null;
  rule_match_type?: string;
  rule_name?: string;
  allowance_type: "fixed_amount" | "percentage" | string;
  allowance_percentage?: string;
  seller_allowance_amount: string;
  maximum_discount_amount: string;
  maximum_discount_percent: string;
  minimum_selling_price: string;
  seller_commission_amount: string;
  owner_net_amount: string;
  can_apply_discounts?: boolean;
  is_per_unit?: boolean;
  currency?: string;
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
  raw?: unknown;
};

type LiveAvailabilityResponse = {
  ok: boolean;
  provider: "wellet" | "local" | string;
  options: LiveTicketOption[];
  error?: string;
};

type OfferOption = {
  key: string;
  kind: "product" | "package" | "event_ticket_type" | "external_option";
  name: string;
  unitPrice: number;
  currency?: string;
  available?: boolean;
  packageId?: number;
  eventTicketTypeId?: number;
  externalOptionId?: string;
  externalProductId?: string;
  externalVariantId?: string;
  externalAvailabilityId?: string;
  externalOptionName?: string;
  performanceId?: string;
  description?: string;
};

function money(value: string | number | null | undefined) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function percent(value: unknown) {
  const amount = Number(value || 0);

  if (!Number.isFinite(amount)) return "0";

  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function numberValue(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(Math.max(value, minimum), maximum);
}

function getErrorMessage(error: any, fallback: string) {
  const data = error?.response?.data;

  if (!data) return fallback;

  if (typeof data === "string") {
    const normalized = data.trim().toLowerCase();

    if (
      normalized.startsWith("<!doctype html") ||
      normalized.startsWith("<html")
    ) {
      return fallback;
    }

    return data;
  }

  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);
  if (data.error) return String(data.error);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) {
      return `${firstKey}: ${value.join(", ")}`;
    }

    return `${firstKey}: ${String(value)}`;
  }

  return fallback;
}

function localDateInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isExternalOptionProduct(product: ExperienceProduct) {
  const productAny = product as any;
  const provider = String(productAny.external_provider || "").toLowerCase();
  const slug = String(product.slug || "").toLowerCase();
  const name = String(product.name || "").toLowerCase();

  return (
    provider === "wellet" ||
    (provider !== "" && provider !== "local") ||
    Boolean(productAny.is_cocobongo_product) ||
    slug.includes("coco-bongo") ||
    name.includes("coco bongo")
  );
}

function firstPrice(item: any, fallback = 0) {
  for (const field of [
    "price",
    "adult_price",
    "base_price",
    "selling_price",
    "retail_price",
    "amount",
  ]) {
    const value = Number(item?.[field]);

    if (Number.isFinite(value) && value >= 0) {
      return value;
    }
  }

  return fallback;
}

function getLocalOfferOptions(product: ExperienceProduct): OfferOption[] {
  const productAny = product as any;
  const fallbackPrice = numberValue(product.base_price);
  const options: OfferOption[] = [];

  const packages = Array.isArray(productAny.packages)
    ? productAny.packages
    : [];

  for (const item of packages) {
    if (!item || item.is_active === false) continue;

    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;

    options.push({
      key: `package:${id}`,
      kind: "package",
      name: String(item.name || item.title || `Package ${id}`),
      unitPrice: firstPrice(item, fallbackPrice),
      currency: String(item.currency || productAny.currency || "USD"),
      packageId: id,
      description: String(item.description || ""),
    });
  }

  const eventTicketTypes = Array.isArray(productAny.event_ticket_types)
    ? productAny.event_ticket_types
    : [];

  for (const item of eventTicketTypes) {
    if (!item || item.is_active === false) continue;

    const id = Number(item.id);
    if (!Number.isFinite(id)) continue;

    options.push({
      key: `event-ticket-type:${id}`,
      kind: "event_ticket_type",
      name: String(item.name || item.title || `Ticket ${id}`),
      unitPrice: firstPrice(item, fallbackPrice),
      currency: String(item.currency || productAny.currency || "USD"),
      eventTicketTypeId: id,
      description: String(item.description || ""),
    });
  }

  return options;
}

function cleanLiveText(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function asObject(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function getLiveOptionKey(option: LiveTicketOption) {
  return String(
    option.external_availability_id ||
      option.external_variant_id ||
      option.external_product_id ||
      option.option_name ||
      option.name ||
      "",
  );
}

function getLiveOptionLabel(option: LiveTicketOption) {
  return option.option_name || option.name || "Ticket option";
}

function getRawLivePrice(
  product: Record<string, any>,
  fallbackAmount: string | number | null | undefined = 0,
  fallbackCurrency = "USD",
) {
  const pricing = asObject(product.pricing) || {};
  const pricesByCurrency = asObject(pricing.prices_by_currency) || {};
  const prices = Array.isArray(product.prices) ? product.prices : [];
  const first = asObject(prices[0]) || {};

  const currency = String(
    pricing.currency ||
      first.currencyCode ||
      first.currency ||
      product.currencyCode ||
      product.currency ||
      fallbackCurrency ||
      "USD",
  );

  const amount =
    pricing.final_price ??
    pricing.finalPrice ??
    pricesByCurrency[currency] ??
    pricing.price_with_multiplier ??
    pricing.priceWithMultiplier ??
    pricing.base_price ??
    pricing.basePrice ??
    first.amount ??
    first.amountWithoutDiscount ??
    first.price ??
    product.amount ??
    product.price ??
    fallbackAmount;

  return {
    amount: numberValue(amount),
    currency,
  };
}

function getRawAvailableQuantity(
  product: Record<string, any>,
  fallback: number | null = null,
) {
  const availability = asObject(product.availability) || {};
  const value =
    availability.remaining ??
    product.itemsAvailable ??
    product.stock ??
    product.available_quantity ??
    fallback;

  if (value === null || value === undefined || value === "") return null;

  const amount = Number(value);
  return Number.isFinite(amount) ? amount : fallback;
}

function flattenRawWelletProducts(option: LiveTicketOption) {
  const raw = asObject(option.raw);

  if (!raw) return [option];

  // The current backend already returns a fully normalized option with a
  // top-level price, currency, IDs and availability. Do not reopen raw.product
  // and overwrite those correct values with fields from the old Wellet shape.
  const hasNormalizedTopLevelOption =
    Boolean(option.external_product_id) &&
    option.price !== null &&
    option.price !== undefined &&
    option.price !== "";

  if (hasNormalizedTopLevelOption) return [option];

  const performance = asObject(raw.performance) || {};
  const products = Array.isArray(raw.products)
    ? raw.products
    : raw.product && typeof raw.product === "object"
      ? [raw.product]
      : [];

  if (!products.length) return [option];

  const venue = asObject(raw.venue) || {};
  const meta = asObject(raw.meta) || {};
  const metaVenue = asObject(meta.venue) || {};
  const performanceId =
    cleanLiveText(performance.id) ||
    cleanLiveText(venue.id) ||
    cleanLiveText(metaVenue.id) ||
    option.performance_id ||
    "";
  const startTime = cleanLiveText(
    performance.timeStart || performance.time || performance.startTime,
  );
  const endTime = cleanLiveText(performance.timeEnd || performance.endTime);
  const checkinTime = cleanLiveText(performance.timeCheckIn);

  return products
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const productItem = item as Record<string, any>;
      const price = getRawLivePrice(
        productItem,
        option.price,
        option.currency || "USD",
      );
      const productId =
        cleanLiveText(productItem.id) || option.external_product_id || "";
      const variantId =
        cleanLiveText(productItem.venue_product_id) ||
        option.external_variant_id ||
        productId;
      const availableQuantity = getRawAvailableQuantity(
        productItem,
        option.available_quantity ?? null,
      );

      const productAvailability = asObject(productItem.availability) || {};
      const soldOut =
        productItem.isSoldOut === true ||
        productItem.isSoldOut === "true" ||
        productItem.isUnavailable === true ||
        productItem.isUnavailable === "true" ||
        productItem.available === false ||
        productAvailability.available === false;

      const available =
        option.available !== false &&
        option.sold_out !== true &&
        performance.isActive !== false &&
        !soldOut &&
        (availableQuantity === null || availableQuantity > 0);

      return {
        ...option,
        provider: "wellet",
        external_product_id: productId,
        external_variant_id: variantId,
        external_availability_id:
          option.external_availability_id ||
          (performanceId && productId
            ? `${performanceId}:${productId}`
            : productId),
        performance_id: performanceId,
        option_name:
          cleanLiveText(productItem.name) ||
          cleanLiveText(productItem.description) ||
          getLiveOptionLabel(option),
        description:
          cleanLiveText(productItem.description) || option.description || "",
        features: Array.isArray(productItem.features)
          ? productItem.features.map(cleanLiveText).filter(Boolean)
          : option.features || [],
        price: price.amount,
        currency: price.currency,
        available,
        available_quantity: availableQuantity,
        sold_out: !available,
        start_time: startTime || option.start_time,
        end_time: endTime || option.end_time,
        checkin_time: checkinTime,
        raw: {
          performance,
          product: productItem,
        },
      } satisfies LiveTicketOption;
    });
}

function normalizeLiveTicketOptions(options: LiveTicketOption[]) {
  const flattened = options.flatMap(flattenRawWelletProducts);
  const seen = new Set<string>();

  return flattened.filter((option, index) => {
    const key = getLiveOptionKey(option) || `live-option-${index}`;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function liveOptionToOfferOption(option: LiveTicketOption): OfferOption {
  return {
    key: `external:${getLiveOptionKey(option)}`,
    kind: "external_option",
    name: getLiveOptionLabel(option),
    unitPrice: numberValue(option.price),
    currency: option.currency || "USD",
    available: option.available !== false && option.sold_out !== true,
    externalOptionId: getLiveOptionKey(option),
    externalProductId: option.external_product_id || "",
    externalVariantId: option.external_variant_id || "",
    externalAvailabilityId: option.external_availability_id || "",
    externalOptionName: getLiveOptionLabel(option),
    performanceId: option.performance_id || "",
    description: option.description || "",
  };
}

function buildSignedPublicLink(response: SignedOfferResponse) {
  if (typeof window === "undefined") return "";

  const backendOfferUrl = String(response.offer_url || "").trim();

  if (backendOfferUrl) {
    return new URL(backendOfferUrl, window.location.origin).toString();
  }

  const url = new URL(
    `/experiences/${encodeURIComponent(
      response.organisation_slug,
    )}/s/${encodeURIComponent(
      response.seller_slug,
    )}/product/${encodeURIComponent(response.product_slug)}`,
    window.location.origin,
  );

  url.searchParams.set("offer_token", response.offer_token);
  return url.toString();
}

export default function SellerProductCard({
  product,
  bookingPath,
}: SellerProductCardProps) {
  const params = useParams<{
    organisationSlug?: string;
    slug?: string;
  }>();

  const organisationSlug = params.organisationSlug || params.slug || "";
  const externalProduct = useMemo(
    () => isExternalOptionProduct(product),
    [product],
  );
  const localOptions = useMemo(() => getLocalOfferOptions(product), [product]);
  const requiresLocalOption = localOptions.length > 0;

  const [serviceDate, setServiceDate] = useState(localDateInputValue());
  const [liveAvailability, setLiveAvailability] =
    useState<LiveAvailabilityResponse | null>(null);
  const [loadingLiveAvailability, setLoadingLiveAvailability] = useState(false);
  const [liveAvailabilityError, setLiveAvailabilityError] = useState("");
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [quantity, setQuantity] = useState(1);

  const [pricingQuote, setPricingQuote] =
    useState<SellerPricingQuote | null>(null);
  const [loadingPricingQuote, setLoadingPricingQuote] = useState(false);
  const [pricingQuoteError, setPricingQuoteError] = useState("");
  const [customerPrice, setCustomerPrice] = useState("");

  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveAvailability() {
      if (!externalProduct || !organisationSlug || !serviceDate) {
        setLiveAvailability(null);
        setLiveAvailabilityError("");
        setLoadingLiveAvailability(false);
        return;
      }

      try {
        setLoadingLiveAvailability(true);
        setLiveAvailabilityError("");

        const response = (await ticketingApi.getPublicProductAvailability(
          organisationSlug,
          product.slug,
          { date: serviceDate },
        )) as LiveAvailabilityResponse;

        if (!cancelled) {
          setLiveAvailability(response);
        }
      } catch (error: any) {
        if (cancelled) return;

        console.error("Could not load live ticket options:", error);
        setLiveAvailability(null);
        setLiveAvailabilityError(
          getErrorMessage(error, "Could not load live ticket options."),
        );
      } finally {
        if (!cancelled) setLoadingLiveAvailability(false);
      }
    }

    loadLiveAvailability();

    return () => {
      cancelled = true;
    };
  }, [externalProduct, organisationSlug, product.slug, serviceDate]);

  const externalOptions = useMemo(
    () =>
      normalizeLiveTicketOptions(liveAvailability?.options || []).map(
        liveOptionToOfferOption,
      ),
    [liveAvailability],
  );

  const availableOptions = externalProduct ? externalOptions : localOptions;

  useEffect(() => {
    if (!externalProduct && !requiresLocalOption) {
      setSelectedOptionKey("product");
      return;
    }

    const currentStillExists = availableOptions.some(
      (option) => option.key === selectedOptionKey && option.available !== false,
    );

    if (currentStillExists) return;

    const firstAvailable = availableOptions.find(
      (option) => option.available !== false && option.unitPrice > 0,
    );

    setSelectedOptionKey(firstAvailable?.key || "");
  }, [
    externalProduct,
    requiresLocalOption,
    availableOptions,
    selectedOptionKey,
  ]);

  const selectedOption = useMemo<OfferOption | null>(() => {
    if (!externalProduct && !requiresLocalOption) {
      return {
        key: "product",
        kind: "product",
        name: product.name,
        unitPrice: numberValue(product.base_price),
        currency: String((product as any).currency || "USD"),
        available: true,
      };
    }

    return (
      availableOptions.find((option) => option.key === selectedOptionKey) || null
    );
  }, [
    externalProduct,
    requiresLocalOption,
    availableOptions,
    selectedOptionKey,
    product,
  ]);

  const selectedUnitPrice = numberValue(selectedOption?.unitPrice);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function loadPricingQuote() {
      const selectionReady =
        Boolean(selectedOption) &&
        selectedOption?.available !== false &&
        selectedUnitPrice > 0;

      if (!organisationSlug || !selectionReady || quantity <= 0) {
        setPricingQuote(null);
        setPricingQuoteError("");
        setLoadingPricingQuote(false);
        setCustomerPrice("");
        return;
      }

      try {
        setLoadingPricingQuote(true);
        setPricingQuote(null);
        setPricingQuoteError("");
        setGeneratedLink("");
        setCopied(false);
        setMessage("");

        const response = await api.get<SellerPricingQuote>(
          `/ticketing/seller/products/${product.id}/pricing-quote/`,
          {
            signal: controller.signal,
            params: {
              slug: organisationSlug,
              organisation_slug: organisationSlug,
              quantity,
              unit_price: selectedUnitPrice.toFixed(2),
              service_date: externalProduct ? serviceDate : undefined,
              package_id: selectedOption?.packageId,
              event_ticket_type_id: selectedOption?.eventTicketTypeId,
              external_option_id: selectedOption?.externalOptionId,
              external_product_id: selectedOption?.externalProductId,
              external_variant_id: selectedOption?.externalVariantId,
              external_availability_id:
                selectedOption?.externalAvailabilityId,
              external_option_name: selectedOption?.externalOptionName,
            },
          },
        );

        if (!cancelled) {
          setPricingQuote(response.data);
          setCustomerPrice(
            numberValue(response.data.original_price).toFixed(2),
          );
        }
      } catch (error: any) {
        if (cancelled || error?.code === "ERR_CANCELED") return;

        console.error("Could not load seller pricing quote:", error);
        setPricingQuote(null);
        setCustomerPrice("");
        setPricingQuoteError(
          getErrorMessage(
            error,
            "Could not load the seller's exact price allowance.",
          ),
        );
      } finally {
        if (!cancelled) setLoadingPricingQuote(false);
      }
    }

    loadPricingQuote();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    organisationSlug,
    product.id,
    quantity,
    selectedOption?.key,
    selectedOption?.packageId,
    selectedOption?.eventTicketTypeId,
    selectedOption?.externalOptionId,
    selectedOption?.externalProductId,
    selectedOption?.externalVariantId,
    selectedOption?.externalAvailabilityId,
    selectedOption?.externalOptionName,
    selectedOption?.available,
    selectedUnitPrice,
    externalProduct,
    serviceDate,
  ]);

  const originalPrice = numberValue(pricingQuote?.original_price);
  const sellerAllowance = numberValue(pricingQuote?.seller_allowance_amount);
  const maximumDiscountAmount = numberValue(
    pricingQuote?.maximum_discount_amount,
  );
  const minimumSellingPrice = numberValue(
    pricingQuote?.minimum_selling_price,
  );
  const enteredCustomerPrice = numberValue(customerPrice);
  const safeCustomerPrice = pricingQuote
    ? clamp(enteredCustomerPrice, minimumSellingPrice, originalPrice)
    : 0;
  const customerDiscount = pricingQuote
    ? Math.max(originalPrice - safeCustomerPrice, 0)
    : 0;
  const sellerEarnings = pricingQuote
    ? Math.max(sellerAllowance - customerDiscount, 0)
    : 0;
  const canDiscount = maximumDiscountAmount > 0;
  const canGenerate =
    Boolean(pricingQuote) &&
    !loadingPricingQuote &&
    !pricingQuoteError &&
    Boolean(selectedOption) &&
    selectedOption?.available !== false &&
    safeCustomerPrice >= minimumSellingPrice - 0.005 &&
    safeCustomerPrice <= originalPrice + 0.005;

  function updateQuantity(value: string) {
    const parsed = Number(value);
    const next = Number.isFinite(parsed) ? Math.floor(parsed) : 1;
    setQuantity(Math.max(1, Math.min(100, next)));
  }

  function updateCustomerPrice(value: string) {
    const normalized = value.replace(",", ".");

    if (normalized === "") {
      setCustomerPrice("");
      setGeneratedLink("");
      setMessage("");
      return;
    }

    if (!/^\d*(?:\.\d{0,2})?$/.test(normalized)) return;

    setCustomerPrice(normalized);
    setGeneratedLink("");
    setCopied(false);
    setMessage("");
  }

  function finishCustomerPrice() {
    if (!pricingQuote) return;

    const next = clamp(
      numberValue(customerPrice),
      minimumSellingPrice,
      originalPrice,
    );

    setCustomerPrice(next.toFixed(2));
  }

  async function generateOfferLink() {
    if (!pricingQuote || !selectedOption) {
      setMessage(
        pricingQuoteError ||
          "Select the exact option and wait for its pricing to load.",
      );
      return;
    }

    const finalCustomerPrice = clamp(
      numberValue(customerPrice),
      minimumSellingPrice,
      originalPrice,
    );

    if (
      finalCustomerPrice < minimumSellingPrice - 0.005 ||
      finalCustomerPrice > originalPrice + 0.005
    ) {
      setMessage(
        `Customer price must be between ${money(
          minimumSellingPrice,
        )} and ${money(originalPrice)}.`,
      );
      return;
    }

    try {
      setGeneratingLink(true);
      setMessage("");
      setCopied(false);

      const payload = {
        quantity,
        unit_price: selectedUnitPrice.toFixed(2),
        customer_price: finalCustomerPrice.toFixed(2),
        service_date: externalProduct ? serviceDate : undefined,
        package_id: selectedOption.packageId,
        event_ticket_type_id: selectedOption.eventTicketTypeId,
        external_option_id: selectedOption.externalOptionId,
        external_product_id: selectedOption.externalProductId,
        external_variant_id: selectedOption.externalVariantId,
        external_availability_id: selectedOption.externalAvailabilityId,
        external_option_name: selectedOption.externalOptionName,
      };

      const response = await api.post<SignedOfferResponse>(
        `/ticketing/seller/products/${product.id}/signed-offer-link/`,
        payload,
        {
          params: {
            slug: organisationSlug,
            organisation_slug: organisationSlug,
          },
        },
      );

      const secureLink = buildSignedPublicLink(response.data);

      if (!secureLink) {
        throw new Error("Could not build the secure public offer link.");
      }

      setGeneratedLink(secureLink);
      setCustomerPrice(
        numberValue(
          response.data.customer_final_price || finalCustomerPrice,
        ).toFixed(2),
      );

      try {
        await navigator.clipboard.writeText(secureLink);
        setCopied(true);
        setMessage(
          `Offer created. Customer pays ${money(
            response.data.customer_final_price || finalCustomerPrice,
          )}; seller earns ${money(
            response.data.seller_commission_amount || sellerEarnings,
          )}. Link copied.`,
        );
      } catch {
        setMessage("Secure customer offer created.");
      }
    } catch (error: any) {
      console.error("Could not generate seller offer link:", error);
      setGeneratedLink("");
      setMessage(
        getErrorMessage(error, "Could not generate the secure offer link."),
      );
    } finally {
      setGeneratingLink(false);
    }
  }

  async function copyGeneratedLink() {
    if (!generatedLink) return;

    try {
      await navigator.clipboard.writeText(generatedLink);
      setCopied(true);
      setMessage("Secure offer link copied.");
    } catch {
      setMessage("Could not copy the link automatically.");
    }
  }

  const displayPrice =
    selectedUnitPrice > 0
      ? money(selectedUnitPrice)
      : externalProduct
        ? "Live price"
        : money(product.base_price);

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="aspect-[4/3] bg-slate-100">
        {product.image_url || product.image ? (
          <img
            src={product.image_url || product.image || ""}
            alt={product.image_alt_text || product.name}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm font-bold text-slate-400">
            No image
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-amber-600">
              {product.product_type}
            </p>
            <h3 className="mt-1 line-clamp-2 text-lg font-black text-slate-950">
              {product.name}
            </h3>
          </div>

          <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-black text-slate-950">
            {displayPrice}
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm font-medium text-slate-500">
          {product.short_description || product.long_description}
        </p>

        <div className="mt-4 space-y-2 text-sm font-semibold text-slate-500">
          {product.location && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              <span className="truncate">{product.location}</span>
            </div>
          )}

          {product.duration_text && (
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span>{product.duration_text}</span>
            </div>
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start gap-3">
            <Link2 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-slate-950">
                Secure customer offer
              </p>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">
                Select the exact product option, choose the customer price, and
                see the seller earnings before generating the link.
              </p>

              {externalProduct && (
                <div className="mt-3">
                  <label className="text-xs font-black text-slate-700">
                    Service date
                  </label>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(event) => setServiceDate(event.target.value)}
                    className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-slate-950"
                  />
                </div>
              )}

              {(externalProduct || requiresLocalOption) && (
                <div className="mt-3">
                  <label className="text-xs font-black text-slate-700">
                    Exact option
                  </label>

                  {externalProduct && loadingLiveAvailability ? (
                    <div className="mt-2 flex items-center gap-2 rounded-2xl bg-white p-3 text-xs font-bold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading live ticket options...
                    </div>
                  ) : externalProduct && liveAvailabilityError ? (
                    <div className="mt-2 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                      {liveAvailabilityError}
                    </div>
                  ) : availableOptions.length ? (
                    <select
                      value={selectedOptionKey}
                      onChange={(event) =>
                        setSelectedOptionKey(event.target.value)
                      }
                      className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-slate-950"
                    >
                      {availableOptions.map((option) => (
                        <option
                          key={option.key}
                          value={option.key}
                          disabled={option.available === false}
                        >
                          {option.name} · {money(option.unitPrice)}
                          {option.available === false ? " · Sold out" : ""}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                      No available options were found for this selection.
                    </div>
                  )}
                </div>
              )}

              <div className="mt-3">
                <label className="text-xs font-black text-slate-700">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={quantity}
                  onChange={(event) => updateQuantity(event.target.value)}
                  className="mt-1 h-11 w-full rounded-2xl border border-slate-300 bg-white px-3 text-sm font-black text-slate-950 outline-none focus:border-slate-950"
                />
              </div>

              {loadingPricingQuote ? (
                <div className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading exact seller pricing...
                </div>
              ) : pricingQuoteError ? (
                <div className="mt-3 flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold leading-5 text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {pricingQuoteError}
                </div>
              ) : pricingQuote ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <PriceBox label="Retail total" value={money(originalPrice)} />
                    <PriceBox
                      label="Your assigned allowance"
                      value={money(sellerAllowance)}
                    />
                    <PriceBox
                      label="Lowest customer total"
                      value={money(minimumSellingPrice)}
                    />
                    <PriceBox
                      label="Rule"
                      value={
                        pricingQuote.allowance_type === "fixed_amount"
                          ? pricingQuote.is_per_unit
                            ? "Fixed per ticket"
                            : "Fixed amount"
                          : `${percent(
                              pricingQuote.allowance_percentage,
                            )}% allowance`
                      }
                    />
                  </div>

                  <div className="mt-3">
                    <label className="text-xs font-black text-slate-700">
                      Customer total price
                    </label>
                    <div className="relative mt-1">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">
                        $
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={customerPrice}
                        onChange={(event) =>
                          updateCustomerPrice(event.target.value)
                        }
                        onBlur={finishCustomerPrice}
                        disabled={!canDiscount || generatingLink}
                        className="h-11 w-full rounded-2xl border border-slate-300 bg-white pl-7 pr-3 text-sm font-black text-slate-950 outline-none focus:border-slate-950 disabled:cursor-not-allowed disabled:bg-slate-100"
                        aria-label="Customer total price"
                      />
                    </div>

                    {canDiscount ? (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCustomerPrice(originalPrice.toFixed(2))
                          }
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
                        >
                          Full price
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setCustomerPrice(minimumSellingPrice.toFixed(2))
                          }
                          className="flex-1 rounded-xl border border-amber-300 bg-amber-50 px-2 py-2 text-xs font-black text-amber-800 hover:bg-amber-100"
                        >
                          Lowest price
                        </button>
                      </div>
                    ) : (
                      <p className="mt-2 text-xs font-bold text-slate-500">
                        Customer discount is disabled. The seller can still
                        create the link at full price and keep the assigned
                        commission.
                      </p>
                    )}
                  </div>

                  <div className="mt-3 rounded-2xl bg-white p-3 ring-1 ring-slate-200">
                    <SummaryRow
                      label="Customer discount"
                      value={money(customerDiscount)}
                    />
                    <SummaryRow
                      label="Seller earns"
                      value={money(sellerEarnings)}
                      strong
                    />
                    <SummaryRow
                      label="Customer pays"
                      value={money(safeCustomerPrice)}
                      strong
                    />
                  </div>

                  <button
                    type="button"
                    onClick={generateOfferLink}
                    disabled={!canGenerate || generatingLink}
                    className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 text-sm font-black text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {generatingLink ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="h-4 w-4" />
                    )}
                    Generate customer link
                  </button>
                </>
              ) : (
                <p className="mt-3 text-xs font-bold text-slate-500">
                  Select a valid option to load its exact seller price.
                </p>
              )}

              {generatedLink && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedLink}
                    className="h-10 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none"
                    aria-label="Generated secure offer link"
                  />

                  <button
                    type="button"
                    onClick={copyGeneratedLink}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100"
                    aria-label="Copy secure offer link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                </div>
              )}

              {message && (
                <p className="mt-2 text-xs font-bold leading-5 text-slate-600">
                  {message}
                </p>
              )}
            </div>
          </div>
        </div>

        <Link
          to={`${bookingPath}?product=${product.id}`}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-slate-950 px-4 text-sm font-black text-white transition hover:bg-slate-800"
        >
          Create Booking
        </Link>
      </div>
    </div>
  );
}

function PriceBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-2.5 ring-1 ring-slate-200">
      <p className="font-bold text-slate-500">{label}</p>
      <p className="mt-1 font-black text-slate-950">{value}</p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs font-bold text-slate-500">{label}</span>
      <span
        className={
          strong
            ? "text-sm font-black text-slate-950"
            : "text-xs font-black text-slate-700"
        }
      >
        {value}
      </span>
    </div>
  );
}
