// src/modules/ticketing/pages/PublicConfirmationPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Home,
  Loader2,
  MapPin,
  Ticket,
  Users,
} from "lucide-react";

import ticketingApi from "../api/ticketingApi";
import type { Booking, ExperienceProduct, PublicBrandingResponse } from "../types/ticketingTypes";

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

function money(value: unknown, symbol = "US$") {
  const amount = Number(value || 0);
  return `${symbol} ${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function getPaymentBanner(booking?: Booking | null, queryStatus?: string | null) {
  if (booking?.payment_status === "paid") {
    return {
      title: "Payment confirmed",
      message: "Your payment was received and your booking is confirmed.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (booking?.payment_status === "deposit_paid" || booking?.payment_status === "partially_paid") {
    return {
      title: "Payment received",
      message: "A payment was received. The remaining balance is shown below.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    };
  }

  if (queryStatus === "success") {
    return {
      title: "Payment is being confirmed",
      message: "The payment provider redirected you back. We are confirming the payment now.",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }

  return {
    title: "Booking received",
    message: "Your booking request has been created. Save this booking code.",
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

export default function PublicConfirmationPage() {
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
              "Could not load this booking."
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
              "Stripe payment could not be confirmed. Please contact support with your booking code."
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
              "PayPal payment could not be captured. Please contact support with your booking code."
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
  const banner = getPaymentBanner(booking, queryPaymentStatus);

  if (organisationLoading || loadingBooking) {
    return (
      <PublicShell brandName={brandName} publicPath={publicPath}>
        <section className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-amber-600" />
          <p className="mt-3 text-sm font-bold text-slate-500">Loading booking confirmation...</p>
        </section>
      </PublicShell>
    );
  }

  if (organisationError || error) {
    return (
      <PublicShell brandName={brandName} publicPath={publicPath}>
        <section className="rounded-3xl border border-red-200 bg-red-50 p-10 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <h1 className="mt-4 text-xl font-black text-red-950">Booking not available</h1>
          <p className="mx-auto mt-2 max-w-lg text-sm font-bold leading-6 text-red-700">
            {organisationError || error}
          </p>
        </section>
      </PublicShell>
    );
  }

  return (
    <PublicShell brandName={brandName} publicPath={publicPath}>
      <section className={`rounded-3xl border p-6 text-center ${banner.className}`}>
        {paymentActionLoading ? (
          <Loader2 className="mx-auto h-12 w-12 animate-spin" />
        ) : (
          <CheckCircle2 className="mx-auto h-12 w-12" />
        )}

        <h1 className="mt-4 text-2xl font-black">{paymentActionLoading ? "Confirming payment..." : banner.title}</h1>
        <p className="mt-2 text-sm font-bold leading-6">{banner.message}</p>

        <div className="mx-auto mt-5 inline-flex rounded-2xl bg-white px-5 py-3 text-xl font-black text-slate-950 shadow-sm">
          {booking?.booking_code || bookingCode}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Booking details</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Info label="Product" value={product?.name || booking?.primary_product_detail?.name || "Experience"} icon={<Ticket className="h-4 w-4" />} />
            <Info label="Date" value={formatDate(booking?.service_date)} icon={<Clock3 className="h-4 w-4" />} />
            <Info label="Guests" value={`${booking?.total_guests || 0} total`} icon={<Users className="h-4 w-4" />} />
            <Info label="Customer" value={booking?.customer_name || "—"} icon={<Users className="h-4 w-4" />} />
            <Info label="Hotel" value={pickup?.hotel_or_location_name || booking?.customer_hotel || "—"} icon={<MapPin className="h-4 w-4" />} />
            <Info label="Pickup time" value={formatTime(pickup?.pickup_time || booking?.service_time)} icon={<Clock3 className="h-4 w-4" />} />
          </div>

          {pickup?.pickup_point && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-black uppercase tracking-wide text-slate-500">Pickup point</p>
              <p className="mt-1 text-sm font-black text-slate-950">{pickup.pickup_point}</p>
              {pickup.instructions && <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{pickup.instructions}</p>}
            </div>
          )}
        </div>

        <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-black">Payment summary</h2>

          <div className="mt-4 space-y-3">
            <PaymentLine label="Total" value={money(booking?.total_amount, currencySymbol)} />
            <PaymentLine label="Deposit required" value={money(booking?.deposit_required, currencySymbol)} />
            <PaymentLine label="Paid" value={money(booking?.deposit_paid, currencySymbol)} />
            <PaymentLine label="Balance due" value={money(booking?.balance_due, currencySymbol)} />
            <PaymentLine label="Payment status" value={booking?.payment_status || "pending"} />
          </div>

          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
            You may receive a confirmation by WhatsApp or email when the booking is reviewed or payment is completed.
          </p>

          <Link to={publicPath("/")} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
            <Home className="h-4 w-4" />
            Back to home
          </Link>
        </aside>
      </section>
    </PublicShell>
  );
}

function PublicShell({ brandName, publicPath, children }: { brandName: string; publicPath: (path: string) => string; children: ReactNode }) {
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
              <p className="text-xs font-bold text-slate-500">Booking confirmation</p>
            </div>
          </Link>

          <Link to={publicPath("/")} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-black text-slate-700">
            <Home className="h-4 w-4" />
            Home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">{children}</main>
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
