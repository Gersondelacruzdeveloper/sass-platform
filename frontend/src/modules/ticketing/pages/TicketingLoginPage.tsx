// src/modules/ticketing/pages/TicketingLoginPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MapPinned,
  Sparkles,
  Ticket,
  User,
} from "lucide-react";

import api from "../../../api/axios";
import { useAppDispatch } from "../../../store/hooks";
import { loginUser } from "../../../features/auth/authSlice";

type Branding = {
  company_name?: string;
  platform_name?: string;
  login_title?: string;
  login_subtitle?: string;
  logo?: string | null;
  logo_url?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
};

type LoginForm = {
  email: string;
  password: string;
};

const initialForm: LoginForm = {
  email: "",
  password: "",
};

function safeColor(value?: string, fallback = "#020617") {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return fallback;
  return value;
}

function resolveImageUrl(url?: string | null) {
  if (!url) return "";

  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("blob:")
  ) {
    return url;
  }

  const apiBaseUrl =
    import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8000/api";

  const apiOrigin = apiBaseUrl.replace(/\/api\/?$/, "");

  return `${apiOrigin}${url.startsWith("/") ? "" : "/"}${url}`;
}

function isAdminLikeUser(user: any) {
  const role = String(
    user?.role ||
      user?.membership?.role ||
      user?.organisation_role ||
      user?.user_type ||
      ""
  ).toLowerCase();

  if (user?.is_staff || user?.is_superuser) {
    return true;
  }

  return ["owner", "admin", "manager"].includes(role);
}

async function userHasSellerPortalAccess(slug: string, user: any) {
  if (isAdminLikeUser(user)) {
    return false;
  }

  try {
    const response = await api.get("/ticketing/sellers/me/", {
      params: { slug },
    });

    const seller = response.data;
    const sellerRole = String(seller?.role || "").toLowerCase();

    if (["owner", "admin", "manager"].includes(sellerRole)) {
      return false;
    }

    return Boolean(seller?.id && seller?.is_active !== false);
  } catch (error: any) {
    const statusCode = error?.response?.status;

    if (statusCode === 403 || statusCode === 404) {
      return false;
    }

    console.error("Could not check seller portal access:", error);
    return false;
  }
}

export default function TicketingLoginPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { organisationSlug } = useParams<{ organisationSlug: string }>();

  const [branding, setBranding] = useState<Branding | null>(null);
  const [form, setForm] = useState<LoginForm>(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadBranding() {
      try {
        setLoadingBranding(true);

        if (!organisationSlug) return;

        const response = await api.get<Branding>(
          `/organisations/public-branding/ticketing/${organisationSlug}/`
        );

        setBranding(response.data);
      } catch (error) {
        console.error("Failed to load ticketing branding:", error);
        setBranding(null);
      } finally {
        setLoadingBranding(false);
      }
    }

    loadBranding();
  }, [organisationSlug]);

  function updateField<K extends keyof LoginForm>(
    field: K,
    value: LoginForm[K]
  ) {
    if (errorMessage) {
      setErrorMessage("");
    }

    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    if (!form.email.trim()) {
      setErrorMessage("Please enter your email.");
      return;
    }

    if (!form.password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    try {
      setSubmitting(true);

      const user = await dispatch(
        loginUser({
          login: form.email,
          password: form.password,
          organisation_slug: organisationSlug,
        })
      ).unwrap();

      const organisation =
        user?.organisation as
          | { slug?: string; is_active?: boolean; business_type?: string }
          | undefined;

      const slug = organisation?.slug || organisationSlug || "default";

      if (organisation?.is_active === false) {
        navigate(`/ticketing/${slug}/billing-locked`, { replace: true });
        return;
      }

      const shouldUseSellerPortal = await userHasSellerPortalAccess(slug, user);

      if (shouldUseSellerPortal) {
        navigate(`/ticketing/${slug}/seller/dashboard`, { replace: true });
        return;
      }

      navigate(`/ticketing/${slug}/dashboard`, { replace: true });
    } catch (error: any) {
      console.error("Ticketing login error:", error);

      // loginUser(...).unwrap() throws the rejectWithValue payload directly.
      // In this application that payload has the shape:
      // { status?: number; message: string }
      const statusCode =
        error?.status ??
        error?.response?.status ??
        error?.payload?.status;

      const rejectedMessage =
        typeof error === "string"
          ? error
          : error?.message ||
            error?.payload?.message ||
            error?.response?.data?.detail ||
            error?.response?.data?.error ||
            error?.response?.data?.message;

      if (rejectedMessage) {
        setErrorMessage(rejectedMessage);
      } else if (statusCode === 400 || statusCode === 401) {
        setErrorMessage(
          "Incorrect email or password. Please check your credentials and try again."
        );
      } else if (!statusCode) {
        setErrorMessage(
          "We could not connect to the server. Please check your connection and try again."
        );
      } else {
        setErrorMessage(
          "Unable to sign you in at the moment. Please try again."
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  const colors = useMemo(() => {
    const primary = safeColor(branding?.primary_color, "#020617");
    const secondary = safeColor(branding?.secondary_color, "#0f172a");
    const accent = safeColor(branding?.accent_color, "#f59e0b");

    return { primary, secondary, accent };
  }, [branding]);

  const title =
    branding?.login_title ||
    branding?.platform_name ||
    branding?.company_name ||
    "PCD Experiences";

  const companyName =
    branding?.company_name || branding?.platform_name || "PCD Experiences";

  const subtitle =
    branding?.login_subtitle ||
    "Sign in to manage tours, tickets, transfers, sellers, bookings, payments, commissions, pickup schedules, and public website settings.";

  const logo = resolveImageUrl(branding?.logo_url || branding?.logo);

  const workspaceCards = [
    {
      icon: Ticket,
      label: "Bookings",
      text: "Reservations and receipts",
    },
    {
      icon: BadgeCheck,
      label: "Sellers",
      text: "Permissions and commissions",
    },
    {
      icon: MapPinned,
      label: "Pickup",
      text: "Automatic schedules",
    },
  ];

  return (
    <main
      className="relative min-h-screen overflow-hidden px-4 py-6 text-white sm:px-6 lg:px-8"
      style={{
        background: `radial-gradient(circle at top left, ${colors.accent}55, transparent 34%),
                     radial-gradient(circle at bottom right, ${colors.secondary}90, transparent 38%),
                     linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30">
        <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-16 right-10 h-52 w-52 rounded-full bg-white/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="rounded-[2.25rem] border border-white/15 bg-white/10 p-8 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl text-white shadow-xl"
                  style={{ backgroundColor: colors.accent }}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={companyName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Ticket className="h-8 w-8" />
                  )}
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-white/50">
                    Welcome to
                  </p>

                  <h2 className="text-2xl font-black text-white">
                    {companyName}
                  </h2>
                </div>
              </div>

              <h1 className="mt-10 max-w-xl text-5xl font-black leading-tight xl:text-6xl">
                {loadingBranding ? "Loading workspace..." : title}
              </h1>

              <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-white/75">
                {subtitle}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {workspaceCards.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div
                      key={item.label}
                      className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"
                    >
                      <Icon className="mb-3 h-5 w-5 text-white/70" />

                      <p className="text-sm font-black">{item.label}</p>

                      <p className="mt-1 text-xs font-semibold text-white/50">
                        {item.text}
                      </p>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 flex items-center gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Sparkles className="h-5 w-5 text-white/80" />

                <p className="text-sm font-semibold text-white/70">
                  Branded ticketing workspace for {companyName}.
                </p>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-[2.25rem] border border-white/20 bg-white/95 p-5 text-slate-950 shadow-2xl backdrop-blur sm:p-6">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-3xl text-white shadow-lg"
                  style={{ backgroundColor: colors.primary }}
                >
                  {logo ? (
                    <img
                      src={logo}
                      alt={companyName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Ticket className="h-8 w-8" />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className="text-xs font-black uppercase tracking-wide"
                    style={{ color: colors.accent }}
                  >
                    Ticketing Login
                  </p>

                  <h1 className="truncate text-2xl font-black text-slate-950">
                    {loadingBranding ? "Loading..." : companyName}
                  </h1>
                </div>
              </div>

              <div className="mt-6">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">
                  Sign in
                </h2>

                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  Access your dashboard for {companyName}.
                </p>
              </div>

              {errorMessage && (
                <div
                  className="mt-5 flex items-start gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700 shadow-sm"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />

                  <div>
                    <p className="font-black">Sign-in unsuccessful</p>
                    <p className="mt-1 font-semibold">{errorMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Email address
                  </span>

                  <div className="relative mt-2">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={form.email}
                      onChange={(event) =>
                        updateField("email", event.target.value)
                      }
                      required
                      autoComplete="username"
                      placeholder="owner@example.com"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-semibold outline-none transition focus:bg-white"
                      onFocus={(event) => {
                        event.currentTarget.style.borderColor = colors.accent;
                      }}
                      onBlur={(event) => {
                        event.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Password
                  </span>

                  <div className="relative mt-2">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(event) =>
                        updateField("password", event.target.value)
                      }
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-12 text-sm font-semibold outline-none transition focus:bg-white"
                      onFocus={(event) => {
                        event.currentTarget.style.borderColor = colors.accent;
                      }}
                      onBlur={(event) => {
                        event.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-700"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign in
                      <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </form>

              <div
                className="mt-5 rounded-3xl border p-4"
                style={{
                  backgroundColor: `${colors.accent}10`,
                  borderColor: `${colors.accent}33`,
                }}
              >
                <p className="text-xs font-bold leading-5 text-slate-500">
                  Organisation:
                  <span className="ml-1 text-slate-800">
                    {organisationSlug || "default"}
                  </span>
                </p>

                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  Platform:
                  <span className="ml-1 text-slate-800">{companyName}</span>
                </p>
              </div>

              <p className="mt-5 text-center text-xs font-semibold text-slate-500">
                New to PCD Experiences?{" "}
                <Link
                  to="/ticketing/signup"
                  className="font-black text-slate-950 hover:underline"
                >
                  Create an organisation
                </Link>
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
