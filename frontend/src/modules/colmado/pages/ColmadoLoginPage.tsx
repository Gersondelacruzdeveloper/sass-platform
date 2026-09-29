import type { FormEvent } from "react";
import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  ShoppingBasket,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import {
  ColmadoAccessError,
  loginToColmado,
} from "../api/colmadoAuthClient";


function getLoginErrorMessage(error: unknown): string {
  if (error instanceof ColmadoAccessError) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (
      error as { response?: { status?: number } }
    ).response;

    if (response?.status === 401 || response?.status === 403) {
      return "El correo o la contraseña no son correctos.";
    }
  }

  return "No pudimos iniciar la sesión. Revisa tu conexión e inténtalo nuevamente.";
}


export default function ColmadoLoginPage() {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await loginToColmado(login, password);
      navigate(`/colmado/${result.organisation.slug}`, { replace: true });
    } catch (loginError) {
      setError(getLoginErrorMessage(loginError));
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-emerald-950 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl sm:p-9">
        <div className="text-center">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-700 text-white">
            <ShoppingBasket aria-hidden="true" size={34} />
          </span>
          <p className="mt-4 text-sm font-black uppercase tracking-wide text-emerald-700">
            Mi Colmado
          </p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">
            Entra a tu colmado
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Usa el correo y la contraseña con los que registraste el negocio.
          </p>
        </div>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="block text-sm font-black text-slate-800">
            Correo o usuario
            <span className="mt-2 flex min-h-13 items-center rounded-2xl border border-slate-300 px-4 text-slate-400 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
              <Mail aria-hidden="true" size={20} />
              <input
                autoComplete="username"
                autoFocus
                className="w-full bg-transparent px-3 py-4 text-slate-900 outline-none"
                onChange={(event) => setLogin(event.target.value)}
                placeholder="tu@correo.com"
                required
                type="text"
                value={login}
              />
            </span>
          </label>

          <label className="block text-sm font-black text-slate-800">
            Contraseña
            <span className="mt-2 flex min-h-13 items-center rounded-2xl border border-slate-300 px-4 text-slate-400 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
              <LockKeyhole aria-hidden="true" size={20} />
              <input
                autoComplete="current-password"
                className="w-full bg-transparent px-3 py-4 text-slate-900 outline-none"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Escribe tu contraseña"
                required
                type={showPassword ? "text" : "password"}
                value={password}
              />
              <button
                aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="grid min-h-11 min-w-11 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={20} />
                ) : (
                  <Eye aria-hidden="true" size={20} />
                )}
              </button>
            </span>
          </label>

          {error && (
            <div
              className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}

          <button
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <>
                <Loader2 aria-hidden="true" className="animate-spin" size={21} />
                Entrando…
              </>
            ) : (
              <>
                Entrar a mi colmado
                <ArrowRight aria-hidden="true" size={21} />
              </>
            )}
          </button>
        </form>

        <div className="mt-7 border-t border-slate-200 pt-6 text-center">
          <p className="text-sm text-slate-600">¿Todavía no tienes una cuenta?</p>
          <Link
            className="mt-2 inline-flex min-h-11 items-center justify-center font-black text-emerald-700 hover:underline"
            to="/colmado/signup"
          >
            Registrar mi colmado
          </Link>
        </div>
      </div>
    </main>
  );
}
