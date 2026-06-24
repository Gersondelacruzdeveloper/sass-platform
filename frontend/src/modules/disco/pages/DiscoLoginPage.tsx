import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Music2,
  Sparkles,
  User,
} from "lucide-react";

import api from "../../../api/axios";
import { useAppDispatch } from "../../../store/hooks";
import { loginUser } from "../../../features/auth/authSlice";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

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

function safeColor(value?: string, fallback = "#020617") {
  if (!value || !/^#[0-9A-Fa-f]{6}$/.test(value)) return fallback;
  return value;
}

export default function DiscoLoginPage() {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();
  const dispatch = useAppDispatch();
  const { language, setLanguage, t } = useDiscoTranslation();

  const [branding, setBranding] = useState<Branding | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBranding() {
      try {
        setLoadingBranding(true);

        if (!organisationSlug) return;

        const res = await api.get<Branding>(
          `/organisations/public-branding/disco/${organisationSlug}/`
        );

        setBranding(res.data);
      } catch (err) {
        console.error("Failed to load branding:", err);
        setBranding(null);
      } finally {
        setLoadingBranding(false);
      }
    }

    loadBranding();
  }, [organisationSlug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setLoggingIn(true);
      setError("");

      const user = await dispatch(
        loginUser({
          login: username,
          password,
          organisation_slug: organisationSlug,
        })
      ).unwrap();

      const organisation =
        user?.organisation as
          | { slug?: string; is_active?: boolean }
          | undefined;

      const slug = organisation?.slug || organisationSlug || "almond-brownie";

      if (organisation?.is_active === false) {
        navigate(`/disco/${slug}/billing-locked`, { replace: true });
        return;
      }

      navigate(`/disco/${slug}/dashboard`, { replace: true });
    } catch (err: any) {
      console.error("Login failed:", err);

      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        t("login.errorFailed");

      setError(message);
    } finally {
      setLoggingIn(false);
    }
  }

  const colors = useMemo(() => {
    const primary = safeColor(branding?.primary_color, "#020617");
    const secondary = safeColor(branding?.secondary_color, "#0f172a");
    const accent = safeColor(branding?.accent_color, "#06b6d4");

    return { primary, secondary, accent };
  }, [branding]);

  const title =
    branding?.login_title ||
    branding?.platform_name ||
    branding?.company_name ||
    t("login.defaultTitle");

  const companyName =
    branding?.company_name || branding?.platform_name || t("login.defaultTitle");

  const subtitle = branding?.login_subtitle || t("login.defaultSubtitle");

  const logo = branding?.logo_url || branding?.logo;

  const workspaceCards = [
    t("login.pos"),
    t("login.inventory"),
    t("login.reports"),
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
              <div className="mb-6 flex justify-end">
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white/80">
                  {t("login.language")}

                  <select
                    value={language}
                    aria-label={t("login.language")}
                    onChange={(event) =>
                      setLanguage(event.target.value as DiscoLanguage)
                    }
                    className="rounded-full border border-white/10 bg-slate-950 px-2 py-1 text-xs font-black text-white outline-none"
                  >
                    <option value="en">EN</option>
                    <option value="es">ES</option>
                  </select>
                </label>
              </div>

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
                    <Music2 className="h-8 w-8" />
                  )}
                </div>

                <div>
                  <p className="text-sm font-black uppercase tracking-[0.25em] text-white/50">
                    {t("login.welcomeTo")}
                  </p>

                  <h2 className="text-2xl font-black text-white">
                    {companyName}
                  </h2>
                </div>
              </div>

              <h1 className="mt-10 max-w-xl text-5xl font-black leading-tight xl:text-6xl">
                {loadingBranding ? t("login.loadingWorkspace") : title}
              </h1>

              <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-white/75">
                {subtitle}
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {workspaceCards.map((item) => (
                  <div
                    key={item}
                    className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"
                  >
                    <p className="text-sm font-black">{item}</p>

                    <p className="mt-1 text-xs font-semibold text-white/50">
                      {t("login.liveControl")}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-3 rounded-3xl border border-white/15 bg-white/10 p-4">
                <Sparkles className="h-5 w-5 text-white/80" />

                <p className="text-sm font-semibold text-white/70">
                  {t("login.brandedWorkspaceFor")} {companyName}.
                </p>
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-[2.25rem] border border-white/20 bg-white/95 p-5 text-slate-950 shadow-2xl backdrop-blur sm:p-6">
              <div className="mb-4 flex justify-end lg:hidden">
                <label className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">
                  {t("login.language")}

                  <select
                    value={language}
                    aria-label={t("login.language")}
                    onChange={(event) =>
                      setLanguage(event.target.value as DiscoLanguage)
                    }
                    className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-700 outline-none"
                  >
                    <option value="en">EN</option>
                    <option value="es">ES</option>
                  </select>
                </label>
              </div>

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
                    <Music2 className="h-8 w-8" />
                  )}
                </div>

                <div className="min-w-0">
                  <p
                    className="text-xs font-black uppercase tracking-wide"
                    style={{ color: colors.accent }}
                  >
                    {t("login.discoLogin")}
                  </p>

                  <h1 className="truncate text-2xl font-black text-slate-950">
                    {loadingBranding ? t("login.loading") : companyName}
                  </h1>
                </div>
              </div>

              <div className="mt-6">
                <h2 className="text-3xl font-black tracking-tight text-slate-950">
                  {t("login.signInTitle")}
                </h2>

                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  {t("login.accessDashboardFor")} {companyName}.
                </p>
              </div>

              {error && (
                <div className="mt-5 flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("login.emailAddress")}
                  </span>

                  <div className="relative mt-2">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder={t("login.emailPlaceholder")}
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-semibold outline-none transition focus:bg-white"
                      style={{
                        borderColor: undefined,
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colors.accent;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("login.password")}
                  </span>

                  <div className="relative mt-2">
                    <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder={t("login.passwordPlaceholder")}
                      className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-12 text-sm font-semibold outline-none transition focus:bg-white"
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = colors.accent;
                      }}
                      onBlur={(e) => {
                        e.currentTarget.style.borderColor = "#e2e8f0";
                      }}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
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
                  disabled={loggingIn}
                  className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-black text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
                  }}
                >
                  {loggingIn ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      {t("login.signingIn")}
                    </>
                  ) : (
                    <>
                      {t("login.signIn")}
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
                  {t("login.organisation")}:
                  <span className="ml-1 text-slate-800">
                    {organisationSlug || "almond-brownie"}
                  </span>
                </p>

                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  {t("login.platform")}:
                  <span className="ml-1 text-slate-800">{companyName}</span>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}