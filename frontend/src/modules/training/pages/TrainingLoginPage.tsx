import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Eye,
  EyeOff,
  GraduationCap,
  Lock,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";

import { loginUser } from "../../../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../../../store/hooks";
import {
  getPublicBranding,
  defaultBranding,
  type Branding,
} from "../../../api/brandingApi";

export default function TrainingLoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { organisationSlug } = useParams();

  const { loading, error } = useAppSelector((state) => state.auth);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  const slug = useMemo(() => organisationSlug || "", [organisationSlug]);

  useEffect(() => {
    async function loadBranding() {
      let data = defaultBranding;

      if (slug) {
        data = await getPublicBranding("hotel", slug);
      }

      setBranding(data);
      document.title = data.platform_name || "Training Login";
    }

    loadBranding();
  }, [slug]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await dispatch(
        loginUser({
          login,
          password,
        })
      ).unwrap();

      navigate(`/training/${slug}`, { replace: true });
    } catch (err) {
      console.error("Training login error:", err);
    }
  };

  const companyInitial =
    branding.company_name?.charAt(0)?.toUpperCase() || "T";

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-8"
      style={{
        background: `radial-gradient(circle at top left, ${branding.accent_color}35, transparent 32%),
                     radial-gradient(circle at bottom right, ${branding.primary_color}55, transparent 36%),
                     linear-gradient(135deg, ${branding.primary_color}, #020617)`,
      }}
    >
      <div className="absolute left-10 top-10 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
      <div className="absolute bottom-10 right-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" />

      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/95 shadow-2xl backdrop-blur-xl lg:grid-cols-[1.1fr_0.9fr]">
        <section
          className="hidden min-h-[620px] p-10 text-white lg:flex lg:flex-col lg:justify-between"
          style={{ backgroundColor: branding.primary_color }}
        >
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-lg backdrop-blur">
              {branding.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={branding.company_name}
                  className="h-9 w-9 rounded-xl bg-white object-contain p-1"
                />
              ) : (
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl font-black text-white"
                  style={{ backgroundColor: branding.accent_color }}
                >
                  {companyInitial}
                </div>
              )}

              <div>
                <p className="text-sm text-white/60">
                  {branding.company_name}
                </p>
                <h2 className="text-lg font-black leading-tight">
                  {branding.platform_name}
                </h2>
              </div>
            </div>

            <div className="mt-16 max-w-xl">
              <div
                className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold"
                style={{ backgroundColor: `${branding.accent_color}30` }}
              >
                <Sparkles size={16} />
                Training workspace
              </div>

              <h1 className="text-5xl font-black leading-[1.05] tracking-tight">
                {branding.login_title ||
                  `Welcome to ${branding.platform_name}`}
              </h1>

              <p className="mt-6 text-lg leading-8 text-white/70">
                {branding.login_subtitle ||
                  `Secure access for ${branding.company_name} training, evaluations, employees, standards and reports.`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              "Employee training",
              "Evaluations",
              "Standards",
              "Progress reports",
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/75"
              >
                <ShieldCheck className="mb-3 h-5 w-5" />
                {item}
              </div>
            ))}
          </div>
        </section>

        <section className="flex items-center justify-center p-6 sm:p-8 lg:p-12">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <div className="mx-auto mb-5 flex justify-center">
                {branding.logo_url ? (
                  <img
                    src={branding.logo_url}
                    alt={branding.company_name}
                    className="h-20 w-20 rounded-3xl border border-slate-200 bg-white object-contain p-2 shadow-lg"
                  />
                ) : (
                  <div
                    className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl font-black text-white shadow-lg"
                    style={{ backgroundColor: branding.accent_color }}
                  >
                    {companyInitial}
                  </div>
                )}
              </div>

              <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-slate-400">
                {branding.company_name}
              </p>

              <h1 className="text-3xl font-black tracking-tight text-slate-950">
                {branding.platform_name}
              </h1>

              <p className="mt-3 text-sm leading-6 text-slate-500">
                Sign in to continue to your training workspace.
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Username or email
                </label>

                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 shadow-sm transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-100">
                  <User size={18} className="text-slate-400" />

                  <input
                    type="text"
                    className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    placeholder="admin or admin@email.com"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  Password
                </label>

                <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-4 shadow-sm transition focus-within:border-slate-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-slate-100">
                  <Lock size={18} className="text-slate-400" />

                  <input
                    type={showPassword ? "text" : "password"}
                    className="w-full bg-transparent px-3 py-4 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="text-slate-400 transition hover:text-slate-700"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
                  {error}
                </div>
              )}

              <button
                disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-2xl py-4 font-bold text-white shadow-xl transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-60"
                style={{ backgroundColor: branding.accent_color }}
              >
                {loading ? "Signing in..." : "Sign in"}

                {!loading && (
                  <ArrowRight
                    size={18}
                    className="transition group-hover:translate-x-1"
                  />
                )}
              </button>
            </form>

            <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center text-xs leading-5 text-slate-500">
              <GraduationCap className="mx-auto mb-2 h-5 w-5 text-slate-400" />
              This training workspace is configured for{" "}
              <span className="font-semibold text-slate-700">
                {branding.company_name}
              </span>
              .
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}