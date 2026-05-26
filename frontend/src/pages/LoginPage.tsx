import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, User, Building2 } from "lucide-react";

import { loginUser } from "../features/auth/authSlice";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { getDashboardRedirect } from "../utils/getDashboardRedirect";

export default function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();

  const { loading, error } = useAppSelector((state) => state.auth);

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const user = await dispatch(
        loginUser({
          login,
          password,
        })
      ).unwrap();

      navigate(getDashboardRedirect(user));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
      <div className="grid w-full max-w-6xl overflow-hidden rounded-[32px] bg-white shadow-2xl lg:grid-cols-[1fr_480px]">
        <div className="hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 px-5 py-3">
              <Building2 size={22} />
              <span className="text-lg font-bold">SaaS Platform</span>
            </div>

            <h1 className="mt-10 max-w-xl text-5xl font-black leading-tight">
              One login for every business dashboard.
            </h1>

            <p className="mt-6 max-w-lg text-lg leading-8 text-slate-300">
              Owners, managers, cashiers, bartenders, door staff, and inventory
              staff are sent automatically to the correct dashboard.
            </p>
          </div>

          <div className="grid gap-4 text-sm text-slate-300">
            <div className="rounded-2xl bg-white/5 p-4">
              Platform owner → SaaS dashboard
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              Disco owner → Disco dashboard
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              Cashier / bartender → POS
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              Door staff → Entry fees
            </div>
          </div>
        </div>

        <div className="p-8 lg:p-10">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-950 text-2xl font-bold text-white">
              S
            </div>

            <h1 className="text-3xl font-bold text-slate-900">
              Welcome Back
            </h1>

            <p className="mt-2 text-slate-500">
              Login to your business dashboard
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">
                Username or Email
              </label>

              <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 transition focus-within:border-cyan-500 focus-within:bg-white">
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

              <div className="mt-2 flex items-center rounded-2xl border border-gray-200 bg-gray-50 px-4 transition focus-within:border-cyan-500 focus-within:bg-white">
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
              className="w-full rounded-2xl bg-slate-950 py-4 font-semibold text-white shadow-lg transition hover:bg-cyan-600 disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}