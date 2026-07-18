// src/modules/ticketing/pages/PublicCheckoutPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  ShieldCheck,
  Ticket,
  User,
  Users,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import {
  ticketingLanguageOptions,
  useTicketingTranslation,
  type TicketingLanguage,
} from "../i18n";
import type {
  Booking,
  ExperienceProduct,
  PublicBrandingResponse,
  PublicPaymentOptions,
  TicketingPaymentProvider,
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

type PaymentChoice = "deposit" | "full" | "pending" | "cash";
type OnlineGateway = Exclude<TicketingPaymentProvider, "none">;

type CheckoutForm = {
  full_name: string;
  whatsapp: string;
  email: string;
  hotel_name: string;
  notes: string;
  pickup_name: string;
  pickup_address: string;
  pickup_maps_link: string;
  dropoff_name: string;
  dropoff_address: string;
  dropoff_maps_link: string;
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

function getLocale(language: TicketingLanguage) {
  if (language === "es") return "es-DO";
  if (language === "pt") return "pt-BR";
  if (language === "fr") return "fr-FR";
  if (language === "de") return "de-DE";
  return "en-US";
}

function money(
  value: unknown,
  symbol = "US$",
  language: TicketingLanguage = "en"
) {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString(getLocale(language), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseNumber(value: string | null | undefined, fallback = 0) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return fallback;
  }

  const number = Number(String(value).replace(/,/g, "").trim());

  return Number.isFinite(number) ? number : fallback;
}

function parseStringList(value: string | null | undefined) {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);

    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // Fall back to comma/newline separated values below.
  }

  return String(value)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeTime(value: string | null) {
  if (!value) return null;

  // Backend TimeField accepts HH:MM or HH:MM:SS. Keep seconds when present.
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return value;

  return null;
}

function formatTime(
  value?: string | null,
  language: TicketingLanguage = "en"
) {
  if (!value) return "—";

  const cleanValue = String(value).trim();

  if (/\b(am|pm)\b/i.test(cleanValue)) {
    return cleanValue;
  }

  const [hoursRaw, minutesRaw] = cleanValue.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw || 0);

  if (Number.isNaN(hours)) return cleanValue;

  const date = new Date(2000, 0, 1, hours, minutes);

  return new Intl.DateTimeFormat(getLocale(language), {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatDate(
  value?: string | null,
  language: TicketingLanguage = "en"
) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString(getLocale(language), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function paymentModeFor(choice: PaymentChoice) {
  if (choice === "full") return "customer_full_online";
  if (choice === "deposit") return "customer_deposit_online";
  if (choice === "cash") return "customer_cash_to_seller";
  return "pending_payment";
}

function paymentMethodFor(choice: PaymentChoice) {
  if (choice === "cash") return "cash";
  if (choice === "full" || choice === "deposit") return "online";
  return "none";
}

function paymentStatusFor(choice: PaymentChoice) {
  if (choice === "full" || choice === "deposit") return "pending";
  return "unpaid";
}

function paymentLabel(
  choice: PaymentChoice,
  t: (key: string, fallback?: string) => string
) {
  if (choice === "full") {
    return t("checkout.payment.full", "Pay total amount");
  }

  if (choice === "deposit") {
    return t("checkout.payment.deposit", "Pay deposit");
  }

  if (choice === "cash") {
    return t("checkout.payment.cash", "Pay in person");
  }

  return t("checkout.payment.pending", "Reserve now, pay later");
}

function shouldCreatePendingPayment(choice: PaymentChoice) {
  return choice === "full" || choice === "deposit";
}

function getFormErrorMessage(
  err: any,
  t: (key: string, fallback?: string) => string
) {
  const data = err?.response?.data;

  if (!data) return t("checkout.error.create_failed", "Could not create booking. Please try again.");
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return t("checkout.error.check_information", "Could not create booking. Please check the information and try again.");
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

export default function PublicCheckoutPage() {
  const { language, setLanguage, t } = useTicketingTranslation();
  const { organisationSlug: organisationSlugFromUrl = "" } = useParams<{
    organisationSlug?: string;
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

    if (isCustomDomain) {
      return path || "/";
    }

    const cleanPath = path === "/" ? "" : path;
    return `/experiences/${organisationSlug}${cleanPath}`;
  };

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [paymentOptions, setPaymentOptions] = useState<PublicPaymentOptions | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<OnlineGateway>("stripe");
  const [products, setProducts] = useState<ExperienceProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const productSlug = searchParams.get("product") || "";
  const productId = searchParams.get("product_id") || "";
  const serviceDate = searchParams.get("service_date") || "";
  const adults = Math.max(1, parseNumber(searchParams.get("adults"), 1));
  const children = Math.max(0, parseNumber(searchParams.get("children"), 0));
  const infants = Math.max(0, parseNumber(searchParams.get("infants"), 0));
  const guests = adults + children + infants;
  const paymentChoice = (searchParams.get("payment") || "pending") as PaymentChoice;
  const pickupLocationId = searchParams.get("pickup_location_id") || "";
  const hotelFromQuery = searchParams.get("hotel") || "";
  const pickupTime = normalizeTime(searchParams.get("pickup_time"));
  const pickupPoint = searchParams.get("pickup_point") || "";
  const sellerSlug = searchParams.get("seller") || "";
  const offerToken = searchParams.get("offer_token") || "";
  const unitPriceOverride = searchParams.get("unit_price");
  const depositOverride = searchParams.get("deposit_amount");
  const adultPriceOverride = searchParams.get("adult_price");
  const childPriceOverride = searchParams.get("child_price");
  const infantPriceOverride = searchParams.get("infant_price");

  // Transfer-only values passed from PublicProductDetailPage.tsx.
  // These do not use excursion pickup schedules. Transfers are advance bookings
  // with a selected route, passenger count, preferred time, pickup, and drop-off.
  const transferRouteId =
    searchParams.get("transfer_route_id") || searchParams.get("route_id") || "";
  const transferPriceBandId =
    searchParams.get("transfer_price_band_id") || searchParams.get("price_band_id") || "";
  const transferOrigin =
    searchParams.get("transfer_origin") || searchParams.get("origin") || "";
  const transferDestination =
    searchParams.get("transfer_destination") || searchParams.get("destination") || "";
  const transferVehicleType =
    searchParams.get("transfer_vehicle_type") || searchParams.get("vehicle_type") || "";
  const transferRoundTrip =
    ["true", "1", "yes"].includes(
      String(searchParams.get("transfer_round_trip") || searchParams.get("round_trip") || "false").toLowerCase()
    );

  const transferPickupName =
    searchParams.get("pickup_name") || searchParams.get("pickup_location_name") || hotelFromQuery || "";
  const transferPickupAddress = searchParams.get("pickup_address") || "";
  const transferPickupMapsLink = searchParams.get("pickup_maps_link") || "";
  const transferDropoffName =
    searchParams.get("dropoff_name") || searchParams.get("dropoff_location_name") || "";
  const transferDropoffAddress = searchParams.get("dropoff_address") || "";
  const transferDropoffMapsLink = searchParams.get("dropoff_maps_link") || "";
  const transferQuotedTotal = parseNumber(
    searchParams.get("transfer_total_price") || searchParams.get("quoted_total") || "",
    NaN
  );

  // Live external/Wellet option selected on the product detail page.
  // Important: for Coco Bongo, the SaaS product is only the show/container.
  // The real bookable product is the selected Wellet ticket option.
  const selectedExternalProductId = searchParams.get("selected_external_product_id") || "";
  const externalProductId = searchParams.get("external_product_id") || "";
  const externalVariantId = searchParams.get("external_variant_id") || "";
  const externalAvailabilityId = searchParams.get("external_availability_id") || "";
  const externalOptionName = searchParams.get("external_option_name") || "";
  const externalOptionDescription = searchParams.get("external_option_description") || "";
  const externalOptionFeatures = parseStringList(
    searchParams.get("external_option_features")
  );
  const externalCurrency = searchParams.get("external_currency") || "";
  const externalCheckinTime = normalizeTime(searchParams.get("external_checkin_time"));
  const externalStartTime = normalizeTime(searchParams.get("external_start_time"));
  const externalEndTime = normalizeTime(searchParams.get("external_end_time"));
  const externalPerformanceId = searchParams.get("external_performance_id") || "";
  const externalProvider = searchParams.get("external_provider") || "";

  const [form, setForm] = useState<CheckoutForm>({
    full_name: "",
    whatsapp: "",
    email: "",
    hotel_name: hotelFromQuery || transferPickupName,
    notes: "",
    pickup_name: transferPickupName,
    pickup_address: transferPickupAddress,
    pickup_maps_link: transferPickupMapsLink,
    dropoff_name: transferDropoffName,
    dropoff_address: transferDropoffAddress,
    dropoff_maps_link: transferDropoffMapsLink,
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      hotel_name: hotelFromQuery || transferPickupName || current.hotel_name,
      pickup_name: transferPickupName || current.pickup_name,
      pickup_address: transferPickupAddress || current.pickup_address,
      pickup_maps_link: transferPickupMapsLink || current.pickup_maps_link,
      dropoff_name: transferDropoffName || current.dropoff_name,
      dropoff_address: transferDropoffAddress || current.dropoff_address,
      dropoff_maps_link: transferDropoffMapsLink || current.dropoff_maps_link,
    }));
  }, [
    hotelFromQuery,
    transferPickupName,
    transferPickupAddress,
    transferPickupMapsLink,
    transferDropoffName,
    transferDropoffAddress,
    transferDropoffMapsLink,
  ]);

  async function loadPage() {
    if (!organisationSlug) return;

    try {
      setLoading(true);
      setError("");

      const [brandingResponse, productsResponse, paymentOptionsResponse] = await Promise.all([
        ticketingApi.getPublicBranding(organisationSlug),
        ticketingApi.getPublicProducts(organisationSlug, {
          public_enabled: true,
          status: "active",
        }),
        ticketingApi.getPublicPaymentOptions(organisationSlug),
      ]);

      setBranding(brandingResponse);
      setPaymentOptions(paymentOptionsResponse);
      setSelectedGateway(
        paymentOptionsResponse.default_provider === "paypal"
          ? "paypal"
          : "stripe"
      );
      setProducts(Array.isArray(productsResponse) ? productsResponse : []);
    } catch (err: any) {
      console.error("Could not load checkout:", err);
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          t("checkout.error.load", "We could not load checkout.")
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPage();
  }, [organisationSlug]);

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

  const product = useMemo(() => {
    return (
      products.find((item) => String(item.id) === productId) ||
      products.find((item) => item.slug === productSlug) ||
      null
    );
  }, [products, productId, productSlug]);

  const isTransfer = product?.product_type === "transfer";

  const adultUnitPrice = useMemo(() => {
    const productAny = product as any;
    const productPrice = Number(productAny?.adult_price ?? product?.base_price ?? 0);
    const passengerOverride = parseNumber(adultPriceOverride, NaN);
    const legacyOverride = parseNumber(unitPriceOverride, NaN);

    if (Number.isFinite(passengerOverride) && passengerOverride > 0) {
      return passengerOverride;
    }

    /*
      Keep the old unit_price override for transfers and external ticket options.
      For normal excursions, adult/child/infant query params are preferred.
    */
    if (Number.isFinite(legacyOverride) && legacyOverride > 0) {
      return legacyOverride;
    }

    return productPrice;
  }, [product, adultPriceOverride, unitPriceOverride]);

  const childUnitPrice = useMemo(() => {
    const productAny = product as any;
    const productPrice = Number(productAny?.child_price ?? 0);
    const override = parseNumber(childPriceOverride, NaN);

    if (Number.isFinite(override) && override >= 0) return override;

    return productPrice;
  }, [product, childPriceOverride]);

  const infantUnitPrice = useMemo(() => {
    const productAny = product as any;
    const productPrice = Number(productAny?.infant_price ?? 0);
    const override = parseNumber(infantPriceOverride, NaN);

    if (Number.isFinite(override) && override >= 0) return override;

    return productPrice;
  }, [product, infantPriceOverride]);

  const legacyUnitPrice = adultUnitPrice;

  const passengerTotal =
    adults * adultUnitPrice + children * childUnitPrice + infants * infantUnitPrice;

  const depositPerGuest = useMemo(() => {
    const productDeposit = Number(product?.deposit_amount || 0);
    const override = parseNumber(depositOverride, NaN);

    if (Number.isFinite(override) && override > 0) return override;

    return productDeposit;
  }, [product, depositOverride]);

  const isExternalTicket = Boolean(externalOptionName || externalProductId || externalAvailabilityId);

  const totalFull =
    isTransfer && Number.isFinite(transferQuotedTotal) && transferQuotedTotal > 0
      ? transferQuotedTotal
      : isExternalTicket
        ? legacyUnitPrice * guests
        : passengerTotal;

  const itemQuantity = isTransfer || (!isExternalTicket && !isTransfer) ? 1 : guests;
  const itemUnitPrice = isTransfer || (!isExternalTicket && !isTransfer) ? totalFull : legacyUnitPrice;

  const depositFromPercent =
    Number(product?.deposit_percentage || 0) > 0
      ? totalFull * (Number(product?.deposit_percentage || 0) / 100)
      : 0;

  const totalDeposit =
    paymentChoice === "full"
      ? totalFull
      : paymentChoice === "deposit"
        ? depositPerGuest > 0
          ? depositPerGuest * guests
          : depositFromPercent
        : 0;

  const payNow = Math.min(totalFull, Math.max(0, totalDeposit));
  const payLater = Math.max(0, totalFull - payNow);
  const onlinePaymentSelected = shouldCreatePendingPayment(paymentChoice);
  const stripeAvailable = Boolean(paymentOptions?.stripe_enabled);
  const paypalAvailable = Boolean(paymentOptions?.paypal_enabled);
  const hasOnlineGateway = stripeAvailable || paypalAvailable;

  function getPaymentTypeForGateway(): "full" | "deposit" | "balance" {
    if (paymentChoice === "deposit") return "deposit";
    return "full";
  }

  function buildSuccessUrl(bookingCode: string, provider: OnlineGateway) {
    if (typeof window === "undefined") return "";
    const path = publicPath(`/confirmation/${bookingCode}`);
    return `${window.location.origin}${path}?payment_provider=${provider}&payment_status=success`;
  }

  function buildCancelUrl() {
    if (typeof window === "undefined") return "";
    return window.location.href;
  }

  function updateField(field: keyof CheckoutForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function validateForm() {
    if (!product) {
      return t("checkout.validation.product_missing", "Product was not found.");
    }

    if (!serviceDate) {
      return t("checkout.validation.service_date", "Service date is required.");
    }

    if (!form.full_name.trim()) {
      return t("checkout.validation.full_name", "Full name is required.");
    }

    if (!form.whatsapp.trim()) {
      return t("checkout.validation.whatsapp", "WhatsApp number is required.");
    }

    if (isTransfer) {
      if (!transferRouteId) {
        return t("checkout.validation.transfer_route", "Transfer route is required.");
      }

      if (!form.pickup_name.trim() && !form.pickup_address.trim()) {
        return t(
          "checkout.validation.pickup_location",
          "Pickup location or address is required."
        );
      }

      if (!form.dropoff_name.trim() && !form.dropoff_address.trim()) {
        return t(
          "checkout.validation.dropoff_location",
          "Drop-off location or address is required."
        );
      }
    } else if (
      (product.requires_pickup_location || product.supports_pickup) &&
      !pickupLocationId
    ) {
      return t(
        "checkout.validation.pickup_required",
        "Pickup location is required."
      );
    }

    if (onlinePaymentSelected && !hasOnlineGateway) {
      return t(
        "checkout.validation.gateway_missing",
        "Online payment is not configured yet. Choose pay later or pay in person."
      );
    }

    if (
      onlinePaymentSelected &&
      selectedGateway === "stripe" &&
      !stripeAvailable
    ) {
      return t(
        "checkout.validation.stripe_unavailable",
        "Stripe is not available for this business."
      );
    }

    if (
      onlinePaymentSelected &&
      selectedGateway === "paypal" &&
      !paypalAvailable
    ) {
      return t(
        "checkout.validation.paypal_unavailable",
        "PayPal is not available for this business."
      );
    }

    return "";
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const validationMessage = validateForm();

    if (validationMessage) {
      setError(validationMessage);
      return;
    }

    if (!product) return;

    try {
      setSubmitting(true);
      setError("");

      const ticketInfoLines = [
        externalOptionName ? `Ticket option: ${externalOptionName}` : "",
        externalOptionDescription ? `Description: ${externalOptionDescription}` : "",
        externalOptionFeatures.length
          ? `Includes: ${externalOptionFeatures.join(", ")}`
          : "",
        externalCurrency ? `Currency: ${externalCurrency}` : "",
        externalCheckinTime ? `Check-in time: ${externalCheckinTime}` : "",
        externalStartTime ? `Show time: ${externalStartTime}` : "",
        externalEndTime ? `End time: ${externalEndTime}` : "",
        externalPerformanceId ? `Performance ID: ${externalPerformanceId}` : "",
        isTransfer && transferRouteId ? `Transfer route ID: ${transferRouteId}` : "",
        isTransfer && transferPriceBandId ? `Price band ID: ${transferPriceBandId}` : "",
        isTransfer && transferOrigin ? `Route from: ${transferOrigin}` : "",
        isTransfer && transferDestination ? `Route to: ${transferDestination}` : "",
        isTransfer && transferVehicleType ? `Vehicle: ${transferVehicleType}` : "",
        !isTransfer && !isExternalTicket ? `Adult price: ${adultUnitPrice.toFixed(2)} x ${adults}` : "",
        !isTransfer && !isExternalTicket && children > 0 ? `Child price: ${childUnitPrice.toFixed(2)} x ${children}` : "",
        !isTransfer && !isExternalTicket && infants > 0 ? `Infant price: ${infantUnitPrice.toFixed(2)} x ${infants}` : "",
        isTransfer ? `Passengers: ${guests}` : "",
        isTransfer && form.pickup_name.trim() ? `Pickup: ${form.pickup_name.trim()}` : "",
        isTransfer && form.pickup_address.trim() ? `Pickup address: ${form.pickup_address.trim()}` : "",
        isTransfer && form.pickup_maps_link.trim() ? `Pickup map: ${form.pickup_maps_link.trim()}` : "",
        isTransfer && form.dropoff_name.trim() ? `Drop-off: ${form.dropoff_name.trim()}` : "",
        isTransfer && form.dropoff_address.trim() ? `Drop-off address: ${form.dropoff_address.trim()}` : "",
        isTransfer && form.dropoff_maps_link.trim() ? `Drop-off map: ${form.dropoff_maps_link.trim()}` : "",
        pickupPoint ? `Pickup point: ${pickupPoint}` : "",
      ].filter(Boolean);

      const itemPayload = {
        product_id: product.id,
        product_name: externalOptionName || product.name,
        service_date: serviceDate,
        service_time: pickupTime,
        quantity: itemQuantity,
        unit_price: itemUnitPrice.toFixed(2),
        instructions: ticketInfoLines.join("\n"),

        // Coco Bongo / Wellet dynamic ticket option.
        // These values come from PublicProductDetailPage.tsx via checkout URL.
        // Backend validates this selected option against live availability and stores
        // the official selected ticket snapshot on the BookingItem.
        selected_external_product_id: selectedExternalProductId,
        external_provider: externalProvider || (externalOptionName ? "wellet" : ""),
        external_product_id: externalProductId,
        external_variant_id: externalVariantId,
        external_availability_id: externalAvailabilityId,
        external_option_name: externalOptionName,
      };

      const paymentsPayload = shouldCreatePendingPayment(paymentChoice)
        ? [
            {
              amount: payNow.toFixed(2),
              payment_type: paymentChoice === "full" ? "full" : "deposit",
              payer_type: "customer",
              method: "online",
              status: "pending",
              reference: "",
              note:
                paymentChoice === "full"
                  ? "Customer selected online full payment. Payment is pending gateway confirmation."
                  : "Customer selected online deposit payment. Payment is pending gateway confirmation.",
            },
          ]
        : [];

      const payload: any = {
        primary_product: product.id,
        source: "public_site",
        status: "pending_payment",
        payment_status: paymentStatusFor(paymentChoice),
        payment_mode: paymentModeFor(paymentChoice),
        payment_method: paymentMethodFor(paymentChoice),
        customer_language: language,
        offer_token: offerToken || undefined,
        service_date: serviceDate,
        service_time: pickupTime,
        customer_name: form.full_name.trim(),
        customer_whatsapp: form.whatsapp.trim(),
        customer_email: form.email.trim() || null,
        customer_hotel: form.hotel_name.trim() || hotelFromQuery || form.pickup_name.trim() || "",
        customer_notes: [
          form.notes.trim(),
          isTransfer && form.pickup_address.trim() ? `Pickup address: ${form.pickup_address.trim()}` : "",
          isTransfer && form.pickup_maps_link.trim() ? `Pickup map: ${form.pickup_maps_link.trim()}` : "",
          isTransfer && form.dropoff_name.trim() ? `Drop-off: ${form.dropoff_name.trim()}` : "",
          isTransfer && form.dropoff_address.trim() ? `Drop-off address: ${form.dropoff_address.trim()}` : "",
          isTransfer && form.dropoff_maps_link.trim() ? `Drop-off map: ${form.dropoff_maps_link.trim()}` : "",
        ].filter(Boolean).join("\n"),
        transfer_origin: isTransfer ? transferOrigin || form.pickup_name.trim() || form.pickup_address.trim() : "",
        transfer_destination: isTransfer ? transferDestination || form.dropoff_name.trim() || form.dropoff_address.trim() : "",
        transfer_vehicle_type: isTransfer ? transferVehicleType : "",
        transfer_round_trip: isTransfer ? transferRoundTrip : false,
        adults,
        children,
        infants,
        adult_unit_price: adultUnitPrice.toFixed(2),
        child_unit_price: childUnitPrice.toFixed(2),
        infant_unit_price: infantUnitPrice.toFixed(2),
        subtotal_amount: totalFull.toFixed(2),
        discount_amount: "0.00",
        tax_amount: "0.00",
        total_amount: totalFull.toFixed(2),
        deposit_required: payNow.toFixed(2),
        deposit_paid: "0.00",
        balance_due: totalFull.toFixed(2),
        pickup_location_id: !isTransfer && pickupLocationId ? Number(pickupLocationId) : null,
        items_payload: [itemPayload],
        payments_payload: paymentsPayload,
      };

      if (sellerSlug) {
        payload.seller_slug = sellerSlug;
      }

      const booking: Booking = sellerSlug
        ? await ticketingApi.createPublicSellerBooking(
            organisationSlug,
            sellerSlug,
            payload
          )
        : await ticketingApi.createPublicBooking(organisationSlug, payload);

      if (shouldCreatePendingPayment(paymentChoice)) {
        const paymentPayload = {
          booking_id: booking.id,
          booking_code: booking.booking_code,
          payment_type: getPaymentTypeForGateway(),
          success_url: buildSuccessUrl(booking.booking_code, selectedGateway),
          cancel_url: buildCancelUrl(),
        };

        if (selectedGateway === "stripe") {
          const checkoutSession = await ticketingApi.createPublicStripeCheckoutSession(
            organisationSlug,
            paymentPayload
          );

          if (!checkoutSession.checkout_url) {
            throw new Error(t("checkout.error.stripe_url", "Stripe checkout URL was not returned."));
          }

          window.location.href = checkoutSession.checkout_url;
          return;
        }

        if (selectedGateway === "paypal") {
          const paypalOrder = await ticketingApi.createPublicPayPalOrder(
            organisationSlug,
            paymentPayload
          );

          if (!paypalOrder.approve_url) {
            throw new Error(t("checkout.error.paypal_url", "PayPal approval URL was not returned."));
          }

          window.location.href = paypalOrder.approve_url;
          return;
        }
      }

      navigate(publicPath(`/confirmation/${booking.booking_code}`), {
        replace: true,
        state: { booking, product, currencySymbol, brandName },
      });
    } catch (err: any) {
      console.error("Could not create public booking:", err);
      setError(getFormErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  }

  if (organisationError) {
    return (
      <PublicShell
        publicPath={publicPath}
        brandName={brandName}
        logoUrl={logoUrl}
        theme={theme}
        language={language}
        setLanguage={setLanguage}
        t={t}
      >
        <div
          className="rounded-3xl border p-10 text-center"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <AlertCircle className="mx-auto h-8 w-8" style={{ color: theme.accent }} />
          <p className="mt-3 text-sm font-bold" style={{ color: theme.muted }}>
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
        language={language}
        setLanguage={setLanguage}
        t={t}
      >
        <div
          className="rounded-3xl border p-10 text-center"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <Loader2
            className="mx-auto h-8 w-8 animate-spin"
            style={{ color: theme.accent }}
          />
          <p className="mt-3 text-sm font-bold" style={{ color: theme.muted }}>
            {t("checkout.loading", "Loading checkout...")}
          </p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell
      publicPath={publicPath}
      brandName={brandName}
      logoUrl={logoUrl}
      theme={theme}
      language={language}
      setLanguage={setLanguage}
      t={t}
    >
      <div className="mb-6">
        <Link
          to={product ? publicPath(`/product/${product.slug}`) : publicPath("/")}
          className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-extrabold"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
            color: theme.text,
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          {t("common.back", "Back")}
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <form
          onSubmit={submitBooking}
          className="rounded-3xl border p-5 shadow-sm sm:p-6"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <p className="text-sm font-black uppercase tracking-wide" style={{ color: theme.accent }}>
            Checkout
          </p>

          <h1 className="mt-2 text-2xl font-black tracking-tight" style={{ color: theme.text }}>
            Complete your booking
          </h1>

          <p className="mt-2 text-sm font-semibold leading-6" style={{ color: theme.muted }}>
            Enter your details. Transfer bookings are confirmed in advance with your selected route, pickup, drop-off, date and time.
          </p>

          {error && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              {error}
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Input
              label={t("checkout.full_name", "Full name")}
              value={form.full_name}
              onChange={(value) => updateField("full_name", value)}
              placeholder="John Smith"
              icon={<User className="h-4 w-4" />}
              required
              theme={theme}
            />

            <Input
              label={t("checkout.whatsapp", "WhatsApp")}
              value={form.whatsapp}
              onChange={(value) => updateField("whatsapp", value)}
              placeholder="+1 829 000 0000"
              icon={<MessageCircle className="h-4 w-4" />}
              required
              theme={theme}
            />

            <Input
              label={t("checkout.email", "Email")}
              type="email"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              placeholder="customer@email.com"
              icon={<Mail className="h-4 w-4" />}
              theme={theme}
            />

            <Input
              label={isTransfer ? t("checkout.pickup_name", "Pickup name") : t("checkout.hotel_pickup", "Hotel / pickup location")}
              value={isTransfer ? form.pickup_name : form.hotel_name}
              onChange={(value) =>
                isTransfer ? updateField("pickup_name", value) : updateField("hotel_name", value)
              }
              placeholder={isTransfer ? t("checkout.placeholder.pickup_name", "Hotel, Airbnb, villa, airport...") : t("checkout.placeholder.hotel", "Hotel name")}
              icon={<MapPin className="h-4 w-4" />}
              theme={theme}
            />
          </div>

          {isTransfer && (
            <div className="mt-5 rounded-3xl border p-4" style={{
              backgroundColor: hexToRgba(theme.primary, 0.04),
              borderColor: hexToRgba(theme.primary, 0.12),
            }}>
              <p className="text-sm font-black" style={{ color: theme.text }}>
                Transfer pickup and drop-off
              </p>
              <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
                Add the exact pickup and destination details so the driver knows where to go.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Input
                  label={t("checkout.pickup_address", "Pickup address")}
                  value={form.pickup_address}
                  onChange={(value) => updateField("pickup_address", value)}
                  placeholder={t("checkout.placeholder.pickup_address", "Full hotel, Airbnb or villa address")}
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label={t("checkout.pickup_maps_link", "Pickup Google Maps link")}
                  value={form.pickup_maps_link}
                  onChange={(value) => updateField("pickup_maps_link", value)}
                  placeholder={t("checkout.placeholder.map_link", "Optional map link")}
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label={t("checkout.dropoff_name", "Drop-off name")}
                  value={form.dropoff_name}
                  onChange={(value) => updateField("dropoff_name", value)}
                  placeholder={t("checkout.placeholder.dropoff_name", "Bayahibe port, hotel, airport...")}
                  icon={<MapPin className="h-4 w-4" />}
                  required
                  theme={theme}
                />

                <Input
                  label={t("checkout.dropoff_address", "Drop-off address")}
                  value={form.dropoff_address}
                  onChange={(value) => updateField("dropoff_address", value)}
                  placeholder={t("checkout.placeholder.dropoff_address", "Full destination address if needed")}
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label={t("checkout.dropoff_maps_link", "Drop-off Google Maps link")}
                  value={form.dropoff_maps_link}
                  onChange={(value) => updateField("dropoff_maps_link", value)}
                  placeholder={t("checkout.placeholder.map_link", "Optional map link")}
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />
              </div>
            </div>
          )}

          <Textarea
            label={t("checkout.notes", "Notes")}
            value={form.notes}
            onChange={(value) => updateField("notes", value)}
            placeholder={isTransfer ? t("checkout.placeholder.transfer_notes", "Room number, luggage, child seats, flight info, pickup instructions...") : t("checkout.placeholder.notes", "Room number, special requests, allergies, flight info...")}
            theme={theme}
          />

          <div className="mt-6 rounded-2xl border p-4" style={{
            backgroundColor: hexToRgba(theme.primary, 0.04),
            borderColor: hexToRgba(theme.primary, 0.12),
          }}>
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: theme.accent }} />
              <div>
                <p className="text-sm font-black" style={{ color: theme.text }}>
                  Payment note
                </p>
                <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
                  This checkout creates the booking and stores the selected payment option.
                  Online payments are marked as pending until a payment gateway confirms them.
                </p>
              </div>
            </div>
          </div>

          {onlinePaymentSelected && (
            <div
              className="mt-6 rounded-2xl border p-4"
              style={{
                backgroundColor: hexToRgba(theme.primary, 0.04),
                borderColor: hexToRgba(theme.primary, 0.12),
              }}
            >
              <div className="flex items-start gap-3">
                <CreditCard className="mt-0.5 h-5 w-5 shrink-0" style={{ color: theme.accent }} />
                <div className="flex-1">
                  <p className="text-sm font-black" style={{ color: theme.text }}>
                    Online payment method
                  </p>
                  <p className="mt-1 text-xs font-semibold leading-5" style={{ color: theme.muted }}>
                    Your payment will be processed securely after you continue.
                  </p>

                  <div
                    className="mt-4 rounded-2xl border p-4"
                    style={{
                      backgroundColor: hexToRgba(theme.accent, 0.08),
                      borderColor: hexToRgba(theme.accent, 0.25),
                    }}
                  >
                    <p className="text-sm font-black" style={{ color: theme.text }}>
                      Secure Online Payment
                    </p>

                    <p
                      className="mt-2 text-xs font-semibold leading-5"
                      style={{ color: theme.muted }}
                    >
                      After confirming your booking you will automatically be redirected to our secure payment page.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !product}
            className="mt-6 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: theme.button }}
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
            {onlinePaymentSelected ? t("checkout.continue_secure_payment", "Continue to Secure Payment") : t("checkout.confirm_booking", "Confirm Booking")}
          </button>
        </form>

        <aside
          className="rounded-3xl border p-5 shadow-sm sm:p-6"
          style={{
            backgroundColor: theme.card,
            borderColor: hexToRgba(theme.primary, 0.12),
          }}
        >
          <p className="text-sm font-black uppercase tracking-wide" style={{ color: theme.accent }}>
            Booking summary
          </p>

          <h2 className="mt-2 text-xl font-black" style={{ color: theme.text }}>
            {externalOptionName || product?.name || productSlug || "Selected experience"}
          </h2>

          <div className="mt-5 space-y-3">
            <SummaryRow icon={<Ticket className="h-4 w-4" />} label={t("checkout.summary.product", "Product")} value={product?.name || productSlug} theme={theme} />
            {isTransfer && (transferOrigin || transferDestination) && (
              <SummaryRow
                icon={<MapPin className="h-4 w-4" />}
                label={t("checkout.summary.transfer_route", "Transfer route")}
                value={`${transferOrigin || t("checkout.summary.pickup", "Pickup")} → ${transferDestination || t("checkout.summary.dropoff", "Drop-off")}`}
                theme={theme}
              />
            )}
            {isTransfer && transferVehicleType && (
              <SummaryRow icon={<Users className="h-4 w-4" />} label={t("checkout.summary.vehicle", "Vehicle")} value={transferVehicleType} theme={theme} />
            )}
            {externalOptionName && (
              <SummaryRow icon={<Ticket className="h-4 w-4" />} label={t("checkout.summary.ticket_option", "Ticket option")} value={externalOptionName} theme={theme} />
            )}
            {externalOptionDescription && (
              <SummaryRow icon={<Ticket className="h-4 w-4" />} label={t("checkout.summary.ticket_details", "Ticket details")} value={externalOptionDescription} theme={theme} />
            )}
            {externalOptionFeatures.length > 0 && (
              <SummaryRow icon={<CheckCircle2 className="h-4 w-4" />} label={t("checkout.summary.includes", "Includes")} value={externalOptionFeatures.join(", ")} theme={theme} />
            )}
            <SummaryRow icon={<Clock3 className="h-4 w-4" />} label={t("checkout.summary.date", "Date")} value={formatDate(serviceDate, language)} theme={theme} />
            {externalCheckinTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label={t("checkout.summary.checkin_time", "Check-in time")} value={formatTime(externalCheckinTime, language)} theme={theme} />
            )}
            {externalStartTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label={t("checkout.summary.show_time", "Show time")} value={formatTime(externalStartTime, language)} theme={theme} />
            )}
            <SummaryRow icon={<Users className="h-4 w-4" />} label={isTransfer ? t("checkout.summary.passengers", "Passengers") : t("checkout.summary.guests", "Guests")} value={`${guests} ${t("checkout.total_guests", "total")} · ${adults} ${t(
                  adults === 1 ? "checkout.passenger.adult" : "checkout.passenger.adults",
                  adults === 1 ? "adult" : "adults"
                )}, ${children} ${t(
                  children === 1 ? "checkout.passenger.child" : "checkout.passenger.children",
                  children === 1 ? "child" : "children"
                )}, ${infants} ${t(
                  infants === 1 ? "checkout.passenger.infant" : "checkout.passenger.infants",
                  infants === 1 ? "infant" : "infants"
                )}`} theme={theme} />
            {!isTransfer && !isExternalTicket && (
              <SummaryRow
                icon={<Ticket className="h-4 w-4" />}
                label={t("checkout.summary.price_breakdown", "Price breakdown")}
                value={[
                  `${adults} ${t(adults === 1 ? "checkout.passenger.adult" : "checkout.passenger.adults", adults === 1 ? "adult" : "adults")} × ${money(adultUnitPrice, currencySymbol, language)}`,
                  children > 0 ? `${children} ${t(children === 1 ? "checkout.passenger.child" : "checkout.passenger.children", children === 1 ? "child" : "children")} × ${money(childUnitPrice, currencySymbol, language)}` : "",
                  infants > 0 ? `${infants} ${t(infants === 1 ? "checkout.passenger.infant" : "checkout.passenger.infants", infants === 1 ? "infant" : "infants")} × ${money(infantUnitPrice, currencySymbol, language)}` : "",
                ].filter(Boolean).join(" · ")}
                theme={theme}
              />
            )}
            {isTransfer && (form.pickup_name || transferPickupName || hotelFromQuery) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.summary.pickup", "Pickup")} value={form.pickup_name || transferPickupName || hotelFromQuery} theme={theme} />
            )}
            {isTransfer && (form.pickup_address || transferPickupAddress) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.pickup_address", "Pickup address")} value={form.pickup_address || transferPickupAddress} theme={theme} />
            )}
            {isTransfer && (form.dropoff_name || transferDropoffName) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.summary.dropoff", "Drop-off")} value={form.dropoff_name || transferDropoffName} theme={theme} />
            )}
            {isTransfer && (form.dropoff_address || transferDropoffAddress) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.dropoff_address", "Drop-off address")} value={form.dropoff_address || transferDropoffAddress} theme={theme} />
            )}
            {!isTransfer && hotelFromQuery && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.summary.pickup_hotel", "Pickup hotel")} value={hotelFromQuery} theme={theme} />
            )}
            {pickupTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label={t("checkout.summary.pickup_time", "Pickup time")} value={formatTime(pickupTime, language)} theme={theme} />
            )}
            {pickupPoint && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label={t("checkout.summary.pickup_point", "Pickup point")} value={pickupPoint} theme={theme} />
            )}
          </div>

          <div
            className="mt-6 rounded-2xl border p-4"
            style={{
              backgroundColor: hexToRgba(theme.primary, 0.04),
              borderColor: hexToRgba(theme.primary, 0.12),
            }}
          >
            <div className="flex items-center justify-between text-sm font-black">
              <span style={{ color: theme.text }}>{t("checkout.payment_option", "Payment option")}</span>
              <span style={{ color: theme.text }}>{paymentLabel(paymentChoice, t)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>{t("checkout.total", "Total")}</span>
              <span style={{ color: theme.text }}>{money(totalFull, currencySymbol, language)}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>{t("checkout.pay_now", "Pay now")}</span>
              <span style={{ color: theme.text }}>{money(payNow, currencySymbol, language)}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>{t("checkout.pay_later", "Pay later")}</span>
              <span style={{ color: theme.text }}>{money(payLater, currencySymbol, language)}</span>
            </div>
          </div>
        </aside>
      </div>
    </PublicShell>
  );
}

function PublicShell({
  publicPath,
  brandName,
  logoUrl,
  theme,
  language,
  setLanguage,
  t,
  children,
}: {
  publicPath: (path: string) => string;
  brandName: string;
  logoUrl: string;
  theme: PublicTheme;
  language: TicketingLanguage;
  setLanguage: (language: TicketingLanguage, manuallySelected?: boolean) => void;
  t: (key: string, fallback?: string) => string;
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
                <img src={logoUrl} alt={brandName} className="h-full w-full object-cover" />
              ) : (
                <Ticket className="h-6 w-6" />
              )}
            </div>

            <div>
              <p className="text-sm font-black" style={{ color: theme.text }}>
                {brandName}
              </p>
              <p className="text-xs font-bold" style={{ color: theme.muted }}>
                {t("checkout.secure_checkout", "Secure checkout")}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <select
              aria-label={t("common.language", "Language")}
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as TicketingLanguage, true)
              }
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
              {t("public.home", "Home")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  icon,
  required = false,
  theme,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  icon?: ReactNode;
  required?: boolean;
  theme: PublicTheme;
}) {
  return (
    <label className="block">
      <span className="text-sm font-black" style={{ color: theme.text }}>
        {label}
        {required && <span style={{ color: theme.accent }}> *</span>}
      </span>

      <div
        className="mt-2 flex h-12 items-center gap-3 rounded-2xl border px-4"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
          color: theme.muted,
        }}
      >
        {icon}
        <input
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-sm font-bold outline-none"
          style={{ color: theme.text }}
          required={required}
        />
      </div>
    </label>
  );
}

function Textarea({
  label,
  value,
  onChange,
  placeholder,
  theme,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  theme: PublicTheme;
}) {
  return (
    <label className="mt-4 block">
      <span className="text-sm font-black" style={{ color: theme.text }}>
        {label}
      </span>

      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 min-h-28 w-full rounded-2xl border px-4 py-3 text-sm font-bold outline-none"
        style={{
          backgroundColor: hexToRgba(theme.primary, 0.04),
          borderColor: hexToRgba(theme.primary, 0.12),
          color: theme.text,
        }}
      />
    </label>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  theme,
}: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  theme: PublicTheme;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-2xl border p-3"
      style={{
        backgroundColor: hexToRgba(theme.primary, 0.04),
        borderColor: hexToRgba(theme.primary, 0.12),
      }}
    >
      <div style={{ color: theme.accent }}>{icon}</div>
      <div>
        <p className="text-xs font-black uppercase tracking-wide" style={{ color: theme.muted }}>
          {label}
        </p>
        <p className="mt-1 text-sm font-black" style={{ color: theme.text }}>
          {value || "—"}
        </p>
      </div>
    </div>
  );
}
