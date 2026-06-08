import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAppDispatch } from "../../../store/hooks";
import { loginUser } from "../../../features/auth/authSlice";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Music2,
  User,
} from "lucide-react";

import api from "../../../api/axios";

type Branding = {
  company_name?: string;
  platform_name?: string;
  login_title?: string;
  login_subtitle?: string;
  logo?: string | null;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
};

export default function DiscoLoginPage() {
  const navigate = useNavigate();
  const { organisationSlug } = useParams();

  const dispatch = useAppDispatch();
  const [branding, setBranding] = useState<Branding | null>(null);
  const [username, setUsername] = useState("admin@almondbrownie.com");
  const [password, setPassword] = useState("Disco123!");
  const [showPassword, setShowPassword] = useState(false);
  const [loadingBranding, setLoadingBranding] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadBranding() {
      try {
        setLoadingBranding(true);

        if (!organisationSlug) {
          setLoadingBranding(false);
          return;
        }

        const res = await api.get(
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

      await dispatch(
        loginUser({
          login: username,
          password,
        })
      ).unwrap();
      const slug = organisationSlug || "almond-brownie";

      navigate(`/disco/${slug}/dashboard`, { replace: true });
    } catch (err: any) {
      console.error("Login failed:", err);

      const message =
        err?.response?.data?.detail ||
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Login failed. Please check your email and password.";

      setError(message);
    } finally {
      setLoggingIn(false);
    }
  }

  const title =
    branding?.login_title ||
    branding?.platform_name ||
    branding?.company_name ||
    "Disco Management";

  const subtitle =
    branding?.login_subtitle ||
    "Sign in to manage POS, inventory, tables, staff, reservations, and reports.";

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl items-center justify-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <section className="hidden lg:block">
            <div className="rounded-[2rem] border border-white/10 bg-white/10 p-8 shadow-2xl backdrop-blur">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-950">
                <Music2 className="h-8 w-8" />
              </div>

              <h1 className="mt-8 max-w-xl text-5xl font-black leading-tight">
                Run your disco from one modern dashboard.
              </h1>

              <p className="mt-5 max-w-lg text-lg font-medium leading-8 text-white/70">
                POS, products, inventory, reservations, tables, staff, cash
                shifts, expenses, and executive reports in one multi-tenant
                platform.
              </p>

              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {["POS", "Inventory", "Reports"].map((item) => (
                  <div
                    key={item}
                    className="rounded-3xl border border-white/10 bg-white/10 p-4"
                  >
                    <p className="text-sm font-black">{item}</p>
                    <p className="mt-1 text-xs font-medium text-white/50">
                      Live control
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mx-auto w-full max-w-md">
            <div className="rounded-[2rem] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-3xl bg-slate-950 text-white">
                  {branding?.logo ? (
                    <img
                      src={branding.logo}
                      alt={branding.company_name || "Logo"}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Music2 className="h-7 w-7" />
                  )}
                </div>

                <div>
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">
                    Disco Login
                  </p>
                  <h1 className="text-xl font-black text-slate-950">
                    {loadingBranding ? "Loading..." : title}
                  </h1>
                </div>
              </div>

              <p className="mt-4 text-sm font-medium leading-6 text-slate-500">
                {subtitle}
              </p>

              {error && (
                <div className="mt-5 flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    Email Address
                  </span>

                  <div className="relative mt-2">
                    <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />

                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder="admin@almondbrownie.com"
                      className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
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
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="h-13 w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-12 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
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
                  className="flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 py-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loggingIn && <Loader2 className="h-5 w-5 animate-spin" />}
                  {loggingIn ? "Signing in..." : "Sign In"}
                </button>
              </form>

              <div className="mt-5 rounded-3xl bg-slate-50 p-4">
                <p className="text-xs font-bold leading-5 text-slate-500">
                  Demo login:
                  <span className="ml-1 text-slate-800">
                    admin@almondbrownie.com / Disco123!
                  </span>
                </p>

                <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                  Organisation:
                  <span className="ml-1 text-slate-800">
                    {organisationSlug || "almond-brownie"}
                  </span>
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}