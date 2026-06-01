import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, Building2 } from "lucide-react";

import { loginUser } from "../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { getDashboardRedirect } from "../utils/getDashboardRedirect";
import type { User as UserType } from "../types/user";
import {
  getBranding,
  defaultBranding,
  type Branding,
} from "../api/brandingApi";

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { loading, error } = useAppSelector((state) => state.auth);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [branding, setBranding] = useState<Branding>(defaultBranding);

  useEffect(() => {
    async function loadBranding() {
      const data = await getBranding();
      setBranding(data);
      document.title = data.platform_name;
    }

    loadBranding();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const user = await dispatch(
        loginUser({
          login,
          password,
        })
      ).unwrap();

      navigate(getDashboardRedirect(user as unknown as UserType));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{
        background: `linear-gradient(135deg, ${branding.primary_color}, #020617)`,
      }}
    >
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] bg-white shadow-2xl lg:grid-cols-[1fr_480px]">
        <div
          className="hidden p-10 text-white lg:flex lg:flex-col lg:justify-between"
          style={{ backgroundColor: branding.primary_color }}
        >
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-5 py-3">
              {branding.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={branding.company_name}
                  className="h-8 w-8 rounded-lg object-contain bg-white p-1"
                />
              ) : (
                <Building2 size={22} />
              )}

              <span className="text-lg font-bold">
                {branding.platform_name}
              </span>
            </div>

            <h1 className="mt-10 max-w-xl text-5xl font-black leading-tight">
              {branding.login_title ||
                `Welcome to ${branding.platform_name}`}
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-white/75">
              {branding.login_subtitle ||
                `Access ${branding.company_name} securely from anywhere.`}
            </p>
          </div>

          <div className="grid gap-4 text-sm text-white/75">
            <div className="rounded-2xl bg-white/5 p-4">
              Company workspace → {branding.company_name}
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Platform → {branding.platform_name}
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Secure login → Role-based dashboards
            </div>

            <div className="rounded-2xl bg-white/5 p-4">
              Modules → Training, POS, reports and operations
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4">
              {branding.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={branding.company_name}
                  className="mx-auto h-20 w-20 rounded-2xl object-contain"
                />
              ) : (
                <div
                  className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-bold text-white"
                  style={{ backgroundColor: branding.accent_color }}
                >
                  {branding.company_name.charAt(0)}
                </div>
              )}
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              {branding.platform_name}
            </h1>

            <p className="mt-2 text-slate-500">
              {branding.company_name}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Username or Email
              </label>

              <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 transition focus-within:bg-white">
                <User size={18} className="text-slate-400" />

                <input
                  type="text"
                  className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="admin or admin@email.com"
                  required
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">
                Password
              </label>

              <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 transition focus-within:bg-white">
                <Lock size={18} className="text-slate-400" />

                <input
                  type="password"
                  className="w-full bg-transparent px-3 py-4 text-sm outline-none"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="********"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <button
              disabled={loading}
              className="w-full rounded-2xl py-4 font-semibold text-white shadow-lg transition hover:opacity-90 disabled:opacity-60"
              style={{
                backgroundColor: branding.accent_color,
              }}
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}