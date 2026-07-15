// src/modules/ticketing/pages/PublicConfirmationPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Car,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  MapPin,
  Navigation,
  Plane,
  Ticket,
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
} from "../types/ticketingTypes";

type LocationState = {
  booking?: Booking;
  product?: ExperienceProduct;
  currencySymbol?: string;
  brandName?: string;
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

type BookingItemLike = {
  product_name?: string | null;
  external_option_name?: string | null;
  external_provider?: string | null;
  external_product_id?: string | null;
  external_variant_id?: string | null;
  external_availability_id?: string | null;
  external_raw_data?: any;
  instructions?: string | null;
  service_time?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
};

const PLATFORM_HOSTS = ["localhost", "127.0.0.1", "app.puntacanadiscovery.com"];

function getApiBaseUrl() {
  const baseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  return baseUrl;
}

function getCurrentHostname() {
  if (typeof window === "undefined") return "";
  return window.location.hostname.toLowerCase();
}

function isPlatformHost(hostname = getCurrentHostname()) {
  return PLATFORM_HOSTS.includes(hostname);
}

function isCustomTicketingDomain(hostname = getCurrentHostname()) {
  return Boolean(hostname) && !isPlatformHost(hostname);
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
          `${getApiBaseUrl()}/ticketing/public/resolve-domain/?domain=${encodeURIComponent(hostname)}`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
          }
        );

        const data = await response.json();

        if (!response.ok) throw new Error(data?.detail || "Unable to resolve this domain.");

        if (!cancelled) {
          setResolvedDomain(data);
          setError("");
        }
      } catch (err) {
        if (!cancelled) {
          setResolvedDomain(null);
          setError(err instanceof Error ? err.message : "Unable to resolve this domain.");
        }
      } finally {
        if (!cancelled) setLoading(false);
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

function cleanText(value: unknown) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function getPaymentBanner(
  booking: Booking | null | undefined,
  queryStatus: string | null | undefined,
  t: (key: string, fallback?: string) => string
) {
  if (booking?.payment_status === "paid") {
    return {
      title: t("confirmation.payment_confirmed", "Payment confirmed"),
      message: t("confirmation.payment_confirmed_message", "Your payment was received and your booking is confirmed."),
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (booking?.payment_status === "deposit_paid" || booking?.payment_status === "partially_paid") {
    return {
      title: t("confirmation.payment_received", "Payment received"),
      message: t("confirmation.payment_received_message", "A payment was received. The remaining balance is shown below."),
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (queryStatus === "success") {
    return {
      title: t("confirmation.payment_confirming", "Payment is being confirmed"),
      message: t("confirmation.payment_confirming_message", "The payment provider redirected you back. We are confirming the payment now."),
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    title: t("confirmation.booking_received", "Booking received"),
    message: t("confirmation.booking_received_message", "Your booking has been created. Save this booking code."),
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

function getBookingItems(booking?: Booking | null): BookingItemLike[] {
  const items = (booking as any)?.items;
  return Array.isArray(items) ? items : [];
}

function getFirstBookingItem(booking?: Booking | null): BookingItemLike | null {
  return getBookingItems(booking)[0] || null;
}

function getTicketOptionName(booking?: Booking | null) {
  const item = getFirstBookingItem(booking);

  return (
    cleanText(item?.external_option_name) ||
    cleanText(item?.product_name) ||
    ""
  );
}

function getMainProductName(
  booking: Booking | null | undefined,
  product: ExperienceProduct | null | undefined,
  t: (key: string, fallback?: string) => string
) {
  return (
    cleanText(product?.name) ||
    cleanText(booking?.primary_product_detail?.name) ||
    t("confirmation.experience", "Experience")
  );
}

function getDisplayProductName(
  booking?: Booking | null,
  product?: ExperienceProduct | null,
  t?: (key: string, fallback?: string) => string
) {
  return getTicketOptionName(booking) || getMainProductName(booking, product, t || ((key, fallback) => fallback || key));
}

function getPassengerCount(booking?: Booking | null, key?: "adults" | "children" | "infants") {
  if (!booking || !key) return 0;
  const value = (booking as any)[key];
  const numberValue = Number(value || 0);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function getPassengerBreakdown(
  booking: Booking | null | undefined,
  t: (key: string, fallback?: string) => string
) {
  const adults = getPassengerCount(booking, "adults");
  const children = getPassengerCount(booking, "children");
  const infants = getPassengerCount(booking, "infants");
  const total = Number((booking as any)?.total_guests || adults + children + infants || 0);

  const parts = [
    adults > 0
      ? `${adults} ${t(
          adults === 1
            ? "confirmation.passenger.adult"
            : "confirmation.passenger.adults",
          adults === 1 ? "adult" : "adults"
        )}`
      : "",
    children > 0
      ? `${children} ${t(
          children === 1
            ? "confirmation.passenger.child"
            : "confirmation.passenger.children",
          children === 1 ? "child" : "children"
        )}`
      : "",
    infants > 0
      ? `${infants} ${t(
          infants === 1
            ? "confirmation.passenger.infant"
            : "confirmation.passenger.infants",
          infants === 1 ? "infant" : "infants"
        )}`
      : "",
  ].filter(Boolean);

  const totalLabel = t("confirmation.total_guests", "total");

  if (!parts.length) return `${total} ${totalLabel}`;

  return `${total || adults + children + infants} ${totalLabel} · ${parts.join(", ")}`;
}

function getBookingItemUnitPrice(booking?: Booking | null) {
  const item = getFirstBookingItem(booking);
  return Number(item?.unit_price || 0);
}

function getBookingItemQuantity(booking?: Booking | null) {
  const item = getFirstBookingItem(booking);
  return Number(item?.quantity || 0);
}

function getTicketDescription(booking?: Booking | null) {
  const item = getFirstBookingItem(booking);
  const raw = item?.external_raw_data || {};

  return (
    cleanText(raw?.product?.description) ||
    cleanText(raw?.description) ||
    ""
  );
}

function getLineValue(instructions: string, label: string) {
  const lines = instructions.split("\n");
  const prefix = `${label}:`.toLowerCase();
  const found = lines.find((line) => line.trim().toLowerCase().startsWith(prefix));

  if (!found) return "";

  return found.split(":").slice(1).join(":").trim();
}

function getTransferDetails(booking?: Booking | null, product?: ExperienceProduct | null) {
  const rawBooking = (booking || {}) as any;
  const item = getFirstBookingItem(booking);
  const rawItem = (item || {}) as any;
  const instructions = String(rawItem.instructions || "");

  const productType =
    cleanText((product as any)?.product_type) ||
    cleanText(rawBooking.primary_product_detail?.product_type) ||
    cleanText(rawItem.product_type);

  const origin =
    cleanText(rawBooking.transfer_origin) ||
    getLineValue(instructions, "Transfer origin") ||
    getLineValue(instructions, "Origin") ||
    getLineValue(instructions, "From");

  const destination =
    cleanText(rawBooking.transfer_destination) ||
    getLineValue(instructions, "Transfer destination") ||
    getLineValue(instructions, "Destination") ||
    getLineValue(instructions, "To");

  const pickupName =
    cleanText(rawBooking.transfer_pickup_name) ||
    cleanText(rawBooking.pickup_name) ||
    getLineValue(instructions, "Pickup") ||
    getLineValue(instructions, "Pickup name") ||
    cleanText(rawBooking.customer_hotel);

  const pickupAddress =
    cleanText(rawBooking.transfer_pickup_address) ||
    cleanText(rawBooking.pickup_address) ||
    getLineValue(instructions, "Pickup address");

  const dropoffName =
    cleanText(rawBooking.transfer_dropoff_name) ||
    cleanText(rawBooking.dropoff_name) ||
    getLineValue(instructions, "Drop-off") ||
    getLineValue(instructions, "Dropoff") ||
    getLineValue(instructions, "Destination name");

  const dropoffAddress =
    cleanText(rawBooking.transfer_dropoff_address) ||
    cleanText(rawBooking.dropoff_address) ||
    getLineValue(instructions, "Drop-off address") ||
    getLineValue(instructions, "Dropoff address");

  const pickupMapsLink =
    cleanText(rawBooking.pickup_maps_link) ||
    cleanText(rawBooking.transfer_pickup_maps_link) ||
    getLineValue(instructions, "Pickup map");

  const dropoffMapsLink =
    cleanText(rawBooking.dropoff_maps_link) ||
    cleanText(rawBooking.transfer_dropoff_maps_link) ||
    getLineValue(instructions, "Drop-off map") ||
    getLineValue(instructions, "Dropoff map");

  const vehicle =
    cleanText(rawBooking.transfer_vehicle_type) ||
    getLineValue(instructions, "Vehicle") ||
    getLineValue(instructions, "Vehicle type");

  const priceBand =
    cleanText(rawBooking.transfer_price_band_name) ||
    getLineValue(instructions, "Price band") ||
    getLineValue(instructions, "Passengers band");

  const roundTripRaw =
    rawBooking.transfer_round_trip ??
    rawBooking.round_trip ??
    getLineValue(instructions, "Round trip");

  const roundTrip =
    roundTripRaw === true ||
    String(roundTripRaw || "").toLowerCase() === "true" ||
    String(roundTripRaw || "").toLowerCase() === "yes";

  const flightNumber =
    cleanText(rawBooking.transfer_flight_number) ||
    getLineValue(instructions, "Flight number");

  const returnDate = cleanText(rawBooking.transfer_return_date) || getLineValue(instructions, "Return date");
  const returnTime = cleanText(rawBooking.transfer_return_time) || getLineValue(instructions, "Return time");

  const isTransfer =
    productType === "transfer" ||
    Boolean(origin || destination || pickupAddress || dropoffAddress || vehicle || priceBand);

  return {
    isTransfer,
    origin,
    destination,
    pickupName,
    pickupAddress,
    pickupMapsLink,
    dropoffName,
    dropoffAddress,
    dropoffMapsLink,
    vehicle,
    priceBand,
    roundTrip,
    flightNumber,
    returnDate,
    returnTime,
  };
}

function mapsHref(value?: string | null) {
  const clean = cleanText(value);

  if (!clean) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) return clean;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clean)}`;
}

export default function PublicConfirmationPage() {
  const { language, setLanguage, t } = useTicketingTranslation();
  const { organisationSlug: organisationSlugFromUrl = "", bookingCode = "" } =
    useParams<{ organisationSlug?: string; bookingCode?: string }>();

  const { organisationSlug, loading: organisationLoading, error: organisationError, isCustomDomain } =
    usePublicTicketingOrganisation(organisationSlugFromUrl);

  const publicPath = (path: string = "/") => {
    if (!organisationSlug) return path || "/";
    if (isCustomDomain) return path || "/";
    const cleanPath = path === "/" ? "" : path;
    return `/experiences/${organisationSlug}${cleanPath}`;
  };

  const location = useLocation();
  const [searchParams] = useSearchParams();
  const state = (location.state || {}) as LocationState;

  const [booking, setBooking] = useState<Booking | null>(state.booking || null);
  const [product, setProduct] = useState<ExperienceProduct | null>(state.product || null);
  const [branding, setBranding] = useState<PublicBrandingResponse | null>(null);
  const [loadingBooking, setLoadingBooking] = useState(false);
  const [paymentActionLoading, setPaymentActionLoading] = useState(false);
  const [error, setError] = useState("");

  const paymentProvider = searchParams.get("payment_provider");
  const queryPaymentStatus = searchParams.get("payment_status");
  const paypalToken = searchParams.get("token") || searchParams.get("order_id") || "";
  const stripeSessionId = searchParams.get("session_id") || "";

  useEffect(() => {
    let cancelled = false;

    async function loadConfirmation() {
      if (!organisationSlug || !bookingCode) return;

      try {
        setLoadingBooking(true);
        setError("");

        const [brandingResponse, bookingResponse] = await Promise.all([
          ticketingApi.getPublicBranding(organisationSlug),
          ticketingApi.getPublicBookingConfirmation(organisationSlug, bookingCode),
        ]);

        if (!cancelled) {
          setBranding(brandingResponse);
          setBooking(bookingResponse);
          setProduct(bookingResponse.primary_product_detail || state.product || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              err?.message ||
              t("confirmation.error.booking_load", "Could not load this booking.")
          );
        }
      } finally {
        if (!cancelled) setLoadingBooking(false);
      }
    }

    loadConfirmation();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug, bookingCode]);

  useEffect(() => {
    let cancelled = false;

    async function confirmStripeIfNeeded() {
      if (!organisationSlug || !stripeSessionId || paymentProvider !== "stripe") return;
      if (booking?.payment_status === "paid" || booking?.payment_status === "deposit_paid") return;

      try {
        setPaymentActionLoading(true);

        const response = await ticketingApi.confirmPublicStripeSession(organisationSlug, {
          session_id: stripeSessionId,
        });

        if (!cancelled && response.booking) {
          setBooking(response.booking);
          setProduct(response.booking.primary_product_detail || product || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              t("confirmation.error.stripe_confirm", "Stripe payment could not be confirmed. Please contact support with your booking code.")
          );
        }
      } finally {
        if (!cancelled) setPaymentActionLoading(false);
      }
    }

    confirmStripeIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug, stripeSessionId, paymentProvider, booking?.id, booking?.payment_status]);

  useEffect(() => {
    let cancelled = false;

    async function capturePayPalIfNeeded() {
      if (!organisationSlug || !paypalToken || paymentProvider !== "paypal") return;
      if (booking?.payment_status === "paid" || booking?.payment_status === "deposit_paid") return;

      try {
        setPaymentActionLoading(true);
        const response = await ticketingApi.capturePublicPayPalOrder(organisationSlug, {
          order_id: paypalToken,
        });

        if (!cancelled) {
          setBooking(response.booking);
          setProduct(response.booking.primary_product_detail || product || null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(
            err?.response?.data?.detail ||
              err?.response?.data?.message ||
              t("confirmation.error.paypal_capture", "PayPal payment could not be captured. Please contact support with your booking code.")
          );
        }
      } finally {
        if (!cancelled) setPaymentActionLoading(false);
      }
    }

    capturePayPalIfNeeded();

    return () => {
      cancelled = true;
    };
  }, [organisationSlug, paypalToken, paymentProvider, booking?.id]);

  const currencySymbol = state.currencySymbol || branding?.ticketing_settings?.currency_symbol || "US$";
  const brandName =
    state.brandName ||
    branding?.public_site?.site_title ||
    branding?.ticketing_settings?.public_brand_name ||
    branding?.organisation?.name ||
    "PCD Experiences";

  const pickup = booking?.pickup_info;
  const banner = getPaymentBanner(booking, queryPaymentStatus, t);
  const mainProductName = getMainProductName(booking, product, t);
  const ticketOptionName = getTicketOptionName(booking);
  const displayProductName = getDisplayProductName(booking, product);
  const ticketDescription = getTicketDescription(booking);
  const transfer = getTransferDetails(booking, product);

  if (organisationLoading || loadingBooking) {
    return (
      <PublicShell
        brandName={brandName}
        publicPath={publicPath}
        language={language}
        setLanguage={setLanguage}
        t={t}
      >
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
          <p className="mt-3 text-sm font-bold text-slate-500">{t("confirmation.loading", "Loading booking confirmation...")}</p>
        </section>
      </PublicShell>
    );
  }

  if (organisationError || error) {
    return (
      <PublicShell
        brandName={brandName}
        publicPath={publicPath}
        language={language}
        setLanguage={setLanguage}
        t={t}
      >
        <section className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-4 text-xl font-black text-red-950">{t("confirmation.booking_not_available", "Booking not available")}</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm font-bold leading-6 text-red-700">
            {organisationError || error}
          </p>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell
        brandName={brandName}
        publicPath={publicPath}
        language={language}
        setLanguage={setLanguage}
        t={t}
      >
      <section className={`rounded-3xl border p-6 text-center ${banner.className}`}>
        {paymentActionLoading ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin" />
        ) : (
          <CheckCircle2 className="mx-auto h-12 w-12" />
        )}

        <h1 className="mt-4 text-2xl font-black">{paymentActionLoading ? t("confirmation.confirming_payment", "Confirming payment...") : banner.title}</h1>
        <p className="mt-2 text-sm font-bold leading-6">{banner.message}</p>

        <div className="mx-auto mt-5 inline-flex rounded-2xl bg-white px-5 py-3 text-xl font-black text-slate-950 shadow-sm">
          {booking?.booking_code || bookingCode}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-black">
              {transfer.isTransfer ? t("confirmation.transfer_details", "Transfer details") : t("confirmation.booking_details", "Booking details")}
            </h2>

            {transfer.isTransfer ? (
              <>
                <div className="mt-4 rounded-3xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-3 text-slate-950">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-amber-700 shadow-sm">
                      <Car className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-black uppercase tracking-wide text-amber-700">
                        {transfer.roundTrip ? t("confirmation.round_trip_transfer", "Round trip transfer") : t("confirmation.one_way_transfer", "One way transfer")}
                      </p>
                      <p className="mt-1 text-lg font-black">
                        {transfer.origin || t("confirmation.pickup_area", "Pickup area")} <ArrowRight className="mx-1 inline h-4 w-4" /> {transfer.destination || t("confirmation.destination", "Destination")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label={t("confirmation.date", "Date")} value={formatDate(booking?.service_date, language)} icon={<Clock3 className="h-4 w-4" />} />
                  <Info label={t("confirmation.preferred_pickup_time", "Preferred pickup time")} value={formatTime(booking?.service_time, language)} icon={<Clock3 className="h-4 w-4" />} />
                  <Info label={t("confirmation.passengers", "Passengers")} value={getPassengerBreakdown(booking, t)} icon={<Users className="h-4 w-4" />} />
                  <Info label={t("confirmation.vehicle", "Vehicle")} value={transfer.vehicle || t("confirmation.to_be_assigned", "To be assigned")} icon={<Car className="h-4 w-4" />} />
                  {transfer.priceBand && <Info label={t("confirmation.price_band", "Price band")} value={transfer.priceBand} icon={<Ticket className="h-4 w-4" />} />}
                  {transfer.flightNumber && <Info label={t("confirmation.flight_number", "Flight number")} value={transfer.flightNumber} icon={<Plane className="h-4 w-4" />} />}
                  {transfer.roundTrip && <Info label={t("confirmation.return_date", "Return date")} value={formatDate(transfer.returnDate, language)} icon={<Clock3 className="h-4 w-4" />} />}
                  {transfer.roundTrip && <Info label={t("confirmation.return_time", "Return time")} value={formatTime(transfer.returnTime, language)} icon={<Clock3 className="h-4 w-4" />} />}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <LocationCard
                    title={t("confirmation.pickup", "Pickup")}
                    name={transfer.pickupName || transfer.origin || booking?.customer_hotel || t("confirmation.pickup_location", "Pickup location")}
                    address={transfer.pickupAddress}
                    mapsLink={transfer.pickupMapsLink}
                    t={t}
                  />

                  <LocationCard
                    title={t("confirmation.destination", "Destination")}
                    name={transfer.dropoffName || transfer.destination || t("confirmation.destination", "Destination")}
                    address={transfer.dropoffAddress}
                    mapsLink={transfer.dropoffMapsLink}
                    t={t}
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-500">{t("confirmation.what_happens_next", "What happens next")}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
                    {t(
                      "confirmation.transfer_next_message",
                      "Your booking is saved with the pickup and destination information. The team will assign a driver later and may contact you by WhatsApp or email if anything needs to be confirmed."
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Info label={ticketOptionName ? t("confirmation.ticket_option", "Ticket option") : t("confirmation.product", "Product")} value={displayProductName} icon={<Ticket className="h-4 w-4" />} />
                  {ticketOptionName && (
                    <Info label={t("confirmation.experience", "Experience")} value={mainProductName} icon={<Ticket className="h-4 w-4" />} />
                  )}
                  {ticketDescription && (
                    <Info label={t("confirmation.includes", "Includes")} value={ticketDescription} icon={<CheckCircle2 className="h-4 w-4" />} />
                  )}
                  <Info label={t("confirmation.date", "Date")} value={formatDate(booking?.service_date, language)} icon={<Clock3 className="h-4 w-4" />} />
                  <Info label={t("confirmation.guests", "Guests")} value={getPassengerBreakdown(booking, t)} icon={<Users className="h-4 w-4" />} />
                  <Info label={t("confirmation.customer", "Customer")} value={booking?.customer_name || "—"} icon={<Users className="h-4 w-4" />} />
                  <Info label={t("confirmation.hotel", "Hotel")} value={pickup?.hotel_or_location_name || booking?.customer_hotel || "—"} icon={<MapPin className="h-4 w-4" />} />
                  <Info label={t("confirmation.pickup_time", "Pickup time")} value={formatTime(pickup?.pickup_time || booking?.service_time, language)} icon={<Clock3 className="h-4 w-4" />} />
                </div>

                {pickup?.pickup_point && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{t("confirmation.pickup_point", "Pickup point")}</p>
                    <p className="mt-1 text-sm font-black text-slate-950">{pickup.pickup_point}</p>
                    {pickup.instructions && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{pickup.instructions}</p>}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">{t("confirmation.payment_summary", "Payment summary")}</h2>

          <div className="mt-4 space-y-3">
            <PaymentLine label={t("confirmation.total", "Total")} value={money(booking?.total_amount, currencySymbol, language)} />
            {getBookingItemUnitPrice(booking) > 0 && (
              <PaymentLine
                label={getBookingItemQuantity(booking) > 1 ? t("confirmation.unit_price", "Unit price") : t("confirmation.quoted_price", "Quoted price")}
                value={money(getBookingItemUnitPrice(booking), currencySymbol, language)}
              />
            )}
            <PaymentLine label={t("confirmation.deposit_required", "Deposit required")} value={money(booking?.deposit_required, currencySymbol, language)} />
            <PaymentLine label={t("confirmation.paid", "Paid")} value={money(booking?.deposit_paid, currencySymbol, language)} />
            <PaymentLine label={t("confirmation.balance_due", "Balance due")} value={money(booking?.balance_due, currencySymbol, language)} />
            <PaymentLine label={t("confirmation.payment_status", "Payment status")} value={t(`confirmation.status.${booking?.payment_status || "pending"}`, booking?.payment_status || "pending")} />
          </div>

          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
            {t(
              "confirmation.notification_message",
              "You may receive a confirmation by WhatsApp or email when the booking is reviewed or payment is completed."
            )}
          </p>

          <Link to={publicPath("/")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
            <Home className="h-4 w-4" />
            {t("confirmation.return_home", "Back to home")}
          </Link>
        </aside>
      </section>
    </PublicShell>
  );
}

function PublicShell({
  brandName,
  publicPath,
  language,
  setLanguage,
  t,
  children,
}: {
  brandName: string;
  publicPath: (path: string) => string;
  language: TicketingLanguage;
  setLanguage: (language: TicketingLanguage, manuallySelected?: boolean) => void;
  t: (key: string, fallback?: string) => string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to={publicPath("/")} className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
              <Ticket className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-black">{brandName}</p>
              <p className="text-xs font-bold text-slate-500">{t("confirmation.subtitle", "Booking confirmation")}</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            <select
              aria-label={t("common.language", "Language")}
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as TicketingLanguage, true)
              }
              className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 outline-none"
            >
              {ticketingLanguageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.shortLabel}
                </option>
              ))}
            </select>

            <Link
              to={publicPath("/")}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700"
            >
              <Home className="h-4 w-4" />
              {t("public.home", "Home")}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}

function LocationCard({
  title,
  name,
  address,
  mapsLink,
}: {
  title: string;
  name?: string | null;
  address?: string | null;
  mapsLink?: string | null;
  t: (key: string, fallback?: string) => string;
}) {
  const link = mapsHref(mapsLink || address || name);

  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
          <MapPin className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-sm font-black text-slate-950">{name || "—"}</p>
          {address && <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{address}</p>}
        </div>
      </div>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white"
        >
          <Navigation className="h-4 w-4" />
          Open map
        </a>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value?: string | null }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="text-amber-600">{icon}</div>
      <div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-950">{value || "—"}</p>
      </div>
    </div>
  );
}

function PaymentLine({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="font-black text-slate-950">{value || "—"}</span>
    </div>
  );
}
