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

function money(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);

  return `${symbol} ${amount.toLocaleString("en-US", {
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

function formatTime(value?: string | null) {
  if (!value) return "—";

  const [hoursRaw, minutesRaw] = value.split(":");
  const hours = Number(hoursRaw);

  if (Number.isNaN(hours)) return value;

  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${hour12}:${minutesRaw || "00"} ${suffix}`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-US", {
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

function paymentLabel(choice: PaymentChoice) {
  if (choice === "full") return "Pay total amount";
  if (choice === "deposit") return "Pay deposit";
  if (choice === "cash") return "Pay in person";
  return "Reserve now, pay later";
}

function shouldCreatePendingPayment(choice: PaymentChoice) {
  return choice === "full" || choice === "deposit";
}

function getFormErrorMessage(err: any) {
  const data = err?.response?.data;

  if (!data) return "Could not create booking. Please try again.";
  if (typeof data === "string") return data;
  if (data.detail) return String(data.detail);
  if (data.message) return String(data.message);

  const firstKey = Object.keys(data)[0];

  if (firstKey) {
    const value = data[firstKey];

    if (Array.isArray(value)) return `${firstKey}: ${value.join(", ")}`;
    return `${firstKey}: ${String(value)}`;
  }

  return "Could not create booking. Please check the information and try again.";
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
  const unitPriceOverride = searchParams.get("unit_price");
  const depositOverride = searchParams.get("deposit_amount");

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
          "We could not load checkout."
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

  const unitPrice = useMemo(() => {
    const productPrice = Number(product?.base_price || 0);
    const override = parseNumber(unitPriceOverride, NaN);

    /*
      Do not allow a missing or accidental 0.00 query parameter to erase the
      real product price. The checkout should use the product price from the API
      unless a positive override was intentionally passed from the product page.
    */
    if (Number.isFinite(override) && override > 0) return override;

    return productPrice;
  }, [product, unitPriceOverride]);

  const depositPerGuest = useMemo(() => {
    const productDeposit = Number(product?.deposit_amount || 0);
    const override = parseNumber(depositOverride, NaN);

    if (Number.isFinite(override) && override > 0) return override;

    return productDeposit;
  }, [product, depositOverride]);

  const totalFull =
    isTransfer && Number.isFinite(transferQuotedTotal) && transferQuotedTotal > 0
      ? transferQuotedTotal
      : unitPrice * guests;

  const itemQuantity = isTransfer ? 1 : guests;
  const itemUnitPrice = isTransfer ? totalFull : unitPrice;

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
    if (!product) return "Product was not found.";
    if (!serviceDate) return "Service date is required.";
    if (!form.full_name.trim()) return "Full name is required.";
    if (!form.whatsapp.trim()) return "WhatsApp number is required.";

    if (isTransfer) {
      if (!transferRouteId) return "Transfer route is required.";
      if (!form.pickup_name.trim() && !form.pickup_address.trim()) {
        return "Pickup location or address is required.";
      }
      if (!form.dropoff_name.trim() && !form.dropoff_address.trim()) {
        return "Drop-off location or address is required.";
      }
    } else if ((product.requires_pickup_location || product.supports_pickup) && !pickupLocationId) {
      return "Pickup location is required.";
    }

    if (onlinePaymentSelected && !hasOnlineGateway) {
      return "Online payment is not configured yet. Choose pay later or pay in person.";
    }

    if (onlinePaymentSelected && selectedGateway === "stripe" && !stripeAvailable) {
      return "Stripe is not available for this business.";
    }

    if (onlinePaymentSelected && selectedGateway === "paypal" && !paypalAvailable) {
      return "PayPal is not available for this business.";
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
            throw new Error("Stripe checkout URL was not returned.");
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
            throw new Error("PayPal approval URL was not returned.");
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
      setError(getFormErrorMessage(err));
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
            Loading checkout...
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
          Back
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
              label="Full name"
              value={form.full_name}
              onChange={(value) => updateField("full_name", value)}
              placeholder="John Smith"
              icon={<User className="h-4 w-4" />}
              required
              theme={theme}
            />

            <Input
              label="WhatsApp"
              value={form.whatsapp}
              onChange={(value) => updateField("whatsapp", value)}
              placeholder="+1 829 000 0000"
              icon={<MessageCircle className="h-4 w-4" />}
              required
              theme={theme}
            />

            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateField("email", value)}
              placeholder="customer@email.com"
              icon={<Mail className="h-4 w-4" />}
              theme={theme}
            />

            <Input
              label={isTransfer ? "Pickup name" : "Hotel / pickup location"}
              value={isTransfer ? form.pickup_name : form.hotel_name}
              onChange={(value) =>
                isTransfer ? updateField("pickup_name", value) : updateField("hotel_name", value)
              }
              placeholder={isTransfer ? "Hotel, Airbnb, villa, airport..." : "Hotel name"}
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
                  label="Pickup address"
                  value={form.pickup_address}
                  onChange={(value) => updateField("pickup_address", value)}
                  placeholder="Full hotel, Airbnb or villa address"
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label="Pickup Google Maps link"
                  value={form.pickup_maps_link}
                  onChange={(value) => updateField("pickup_maps_link", value)}
                  placeholder="Optional map link"
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label="Drop-off name"
                  value={form.dropoff_name}
                  onChange={(value) => updateField("dropoff_name", value)}
                  placeholder="Bayahibe port, hotel, airport..."
                  icon={<MapPin className="h-4 w-4" />}
                  required
                  theme={theme}
                />

                <Input
                  label="Drop-off address"
                  value={form.dropoff_address}
                  onChange={(value) => updateField("dropoff_address", value)}
                  placeholder="Full destination address if needed"
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />

                <Input
                  label="Drop-off Google Maps link"
                  value={form.dropoff_maps_link}
                  onChange={(value) => updateField("dropoff_maps_link", value)}
                  placeholder="Optional map link"
                  icon={<MapPin className="h-4 w-4" />}
                  theme={theme}
                />
              </div>
            </div>
          )}

          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(value) => updateField("notes", value)}
            placeholder={isTransfer ? "Room number, luggage, child seats, flight info, pickup instructions..." : "Room number, special requests, allergies, flight info..."}
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
            {onlinePaymentSelected ? "Continue to Secure Payment" : "Confirm Booking"}
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
            <SummaryRow icon={<Ticket className="h-4 w-4" />} label="Product" value={product?.name || productSlug} theme={theme} />
            {isTransfer && (transferOrigin || transferDestination) && (
              <SummaryRow
                icon={<MapPin className="h-4 w-4" />}
                label="Transfer route"
                value={`${transferOrigin || "Pickup"} → ${transferDestination || "Drop-off"}`}
                theme={theme}
              />
            )}
            {isTransfer && transferVehicleType && (
              <SummaryRow icon={<Users className="h-4 w-4" />} label="Vehicle" value={transferVehicleType} theme={theme} />
            )}
            {externalOptionName && (
              <SummaryRow icon={<Ticket className="h-4 w-4" />} label="Ticket option" value={externalOptionName} theme={theme} />
            )}
            {externalOptionDescription && (
              <SummaryRow icon={<Ticket className="h-4 w-4" />} label="Ticket details" value={externalOptionDescription} theme={theme} />
            )}
            {externalOptionFeatures.length > 0 && (
              <SummaryRow icon={<CheckCircle2 className="h-4 w-4" />} label="Includes" value={externalOptionFeatures.join(", ")} theme={theme} />
            )}
            <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Date" value={formatDate(serviceDate)} theme={theme} />
            {externalCheckinTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Check-in time" value={formatTime(externalCheckinTime)} theme={theme} />
            )}
            {externalStartTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Show time" value={formatTime(externalStartTime)} theme={theme} />
            )}
            <SummaryRow icon={<Users className="h-4 w-4" />} label={isTransfer ? "Passengers" : "Guests"} value={`${guests} total · ${adults} adults, ${children} children, ${infants} infants`} theme={theme} />
            {isTransfer && (form.pickup_name || transferPickupName || hotelFromQuery) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Pickup" value={form.pickup_name || transferPickupName || hotelFromQuery} theme={theme} />
            )}
            {isTransfer && (form.pickup_address || transferPickupAddress) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Pickup address" value={form.pickup_address || transferPickupAddress} theme={theme} />
            )}
            {isTransfer && (form.dropoff_name || transferDropoffName) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Drop-off" value={form.dropoff_name || transferDropoffName} theme={theme} />
            )}
            {isTransfer && (form.dropoff_address || transferDropoffAddress) && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Drop-off address" value={form.dropoff_address || transferDropoffAddress} theme={theme} />
            )}
            {!isTransfer && hotelFromQuery && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Pickup hotel" value={hotelFromQuery} theme={theme} />
            )}
            {pickupTime && (
              <SummaryRow icon={<Clock3 className="h-4 w-4" />} label="Pickup time" value={formatTime(pickupTime)} theme={theme} />
            )}
            {pickupPoint && (
              <SummaryRow icon={<MapPin className="h-4 w-4" />} label="Pickup point" value={pickupPoint} theme={theme} />
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
              <span style={{ color: theme.text }}>Payment option</span>
              <span style={{ color: theme.text }}>{paymentLabel(paymentChoice)}</span>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>Total</span>
              <span style={{ color: theme.text }}>{money(totalFull, currencySymbol)}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>Pay now</span>
              <span style={{ color: theme.text }}>{money(payNow, currencySymbol)}</span>
            </div>

            <div className="mt-2 flex items-center justify-between text-sm font-bold">
              <span style={{ color: theme.muted }}>Pay later</span>
              <span style={{ color: theme.text }}>{money(payLater, currencySymbol)}</span>
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
                Secure checkout
              </p>
            </div>
          </Link>

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
