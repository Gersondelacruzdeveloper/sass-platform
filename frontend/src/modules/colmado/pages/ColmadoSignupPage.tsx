import type { FormEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  ShoppingBasket,
  UserRound,
} from "lucide-react";
import { Link } from "react-router-dom";

import {
  createColmadoCheckout,
  getColmadoPlans,
  type ColmadoSubscriptionPlan,
} from "../api/colmadoSignupClient";


function getErrorMessage(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return "No pudimos iniciar el pago. Inténtalo nuevamente.";
  }

  const response = "response" in error
    ? (error as { response?: { data?: unknown } }).response
    : undefined;
  const data = response?.data;

  if (typeof data === "object" && data !== null) {
    if (
      "detail" in data
      && typeof (data as { detail?: unknown }).detail === "string"
    ) {
      return (data as { detail: string }).detail;
    }

    const firstError = Object.values(data)[0];
    if (Array.isArray(firstError) && typeof firstError[0] === "string") {
      return firstError[0];
    }
  }

  return "No pudimos iniciar el pago. Revisa tus datos e inténtalo nuevamente.";
}


function displayPrice(plan: ColmadoSubscriptionPlan): string {
  const amount = Number(plan.price);
  const formattedAmount = Number.isInteger(amount)
    ? String(amount)
    : amount.toFixed(2);

  if (plan.currency.toUpperCase() === "USD") {
    return `US$${formattedAmount}`;
  }

  return `${plan.currency} ${formattedAmount}`;
}


export default function ColmadoSignupPage() {
  const [plan, setPlan] = useState<ColmadoSubscriptionPlan | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [ownerName, setOwnerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [storeAddress, setStoreAddress] = useState("");
  const [storePhone, setStorePhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    let active = true;

    async function loadPlan() {
      try {
        const availablePlans = await getColmadoPlans();
        if (!active) return;

        const approvedPlan = availablePlans[0] ?? null;
        setPlan(approvedPlan);

        if (!approvedPlan) {
          setError("El plan no está disponible en este momento.");
        }
      } catch (loadError) {
        if (!active) return;
        setError(getErrorMessage(loadError));
      } finally {
        if (active) setLoadingPlan(false);
      }
    }

    void loadPlan();

    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!plan) {
      setError("El plan no está disponible en este momento.");
      return;
    }

    setSubmitting(true);

    try {
      const checkout = await createColmadoCheckout({
        company_name: companyName.trim(),
        owner_name: ownerName.trim(),
        email: email.trim(),
        password,
        plan: plan.slug,
        store_name: companyName.trim(),
        store_address: storeAddress.trim(),
        store_phone: storePhone.trim(),
      });

      window.location.assign(checkout.checkout_url);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-emerald-950 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.8fr_1.2fr]">
        <section className="bg-emerald-900 p-7 text-white sm:p-10">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15">
              <ShoppingBasket aria-hidden="true" size={27} />
            </span>
            <div>
              <p className="text-sm font-bold text-emerald-200">Mi Colmado</p>
              <p className="text-xl font-black">Trabaja fácil. Controla todo.</p>
            </div>
          </div>

          <h1 className="mt-10 text-3xl font-black leading-tight sm:text-4xl">
            Empieza a organizar tu colmado hoy
          </h1>
          <p className="mt-4 text-base leading-7 text-emerald-100">
            Ventas rápidas, inventario automático, fiado y varias sucursales
            desde el celular.
          </p>

          <ul className="mt-8 space-y-4 text-sm font-bold">
            {[
              "Escanea y vende en segundos",
              "Conoce lo que tienes y lo que falta",
              "Controla el fiado sin cuadernos",
              "Maneja tus sucursales desde un solo lugar",
            ].map((benefit) => (
              <li key={benefit} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-emerald-950">
                  <Check aria-hidden="true" size={15} strokeWidth={3} />
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mb-7">
            <p className="text-sm font-black uppercase tracking-wide text-emerald-700">
              Crear mi cuenta
            </p>
            <h2 className="mt-2 text-3xl font-black">Cuéntanos de tu colmado</h2>
            <p className="mt-2 text-sm text-slate-600">
              Solo necesitamos estos datos para preparar tu primera sucursal.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-5 sm:grid-cols-2">
              <SignupField
                icon={<UserRound aria-hidden="true" size={19} />}
                label="Tu nombre"
              >
                <input
                  autoComplete="name"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  onChange={(event) => setOwnerName(event.target.value)}
                  placeholder="Ejemplo: Juan Pérez"
                  required
                  type="text"
                  value={ownerName}
                />
              </SignupField>

              <SignupField
                icon={<ShoppingBasket aria-hidden="true" size={19} />}
                label="Nombre del colmado"
              >
                <input
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  onChange={(event) => setCompanyName(event.target.value)}
                  placeholder="Ejemplo: Colmado La Esquina"
                  required
                  type="text"
                  value={companyName}
                />
              </SignupField>

              <SignupField
                icon={<Phone aria-hidden="true" size={19} />}
                label="Teléfono o WhatsApp"
              >
                <input
                  autoComplete="tel"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  inputMode="tel"
                  onChange={(event) => setStorePhone(event.target.value)}
                  placeholder="809-000-0000"
                  required
                  type="tel"
                  value={storePhone}
                />
              </SignupField>

              <SignupField
                icon={<MapPin aria-hidden="true" size={19} />}
                label="Dirección"
              >
                <input
                  autoComplete="street-address"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  onChange={(event) => setStoreAddress(event.target.value)}
                  placeholder="Sector, calle y número"
                  required
                  type="text"
                  value={storeAddress}
                />
              </SignupField>

              <SignupField
                icon={<Mail aria-hidden="true" size={19} />}
                label="Correo electrónico"
              >
                <input
                  autoComplete="email"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="tu@correo.com"
                  required
                  type="email"
                  value={email}
                />
              </SignupField>

              <SignupField
                icon={<LockKeyhole aria-hidden="true" size={19} />}
                label="Crea una contraseña"
              >
                <input
                  autoComplete="new-password"
                  className="w-full bg-transparent px-3 py-3 outline-none"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  required
                  type="password"
                  value={password}
                />
              </SignupField>
            </div>

            <section aria-label="Plan de suscripción">
              <p className="text-base font-black">Tu plan</p>

              {loadingPlan ? (
                <div className="mt-3 flex min-h-24 items-center justify-center rounded-2xl bg-slate-50 text-slate-600">
                  <Loader2 aria-hidden="true" className="mr-2 animate-spin" />
                  Cargando plan…
                </div>
              ) : plan ? (
                <div className="mt-3 rounded-2xl border-2 border-emerald-700 bg-emerald-50 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-black text-slate-950">
                        {plan.name}
                      </h3>
                      <p className="mt-1 text-sm font-semibold text-slate-600">
                        Todas las herramientas incluidas. Sin contratos.
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <p className="text-2xl font-black text-emerald-800">
                        {displayPrice(plan)} al mes
                      </p>
                      <p className="text-sm font-bold text-slate-600">
                        por sucursal
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-emerald-200 pt-4 text-sm font-bold text-emerald-900">
                    {["Ventas", "Inventario", "Pedidos", "Fiado", "Reportes"].map(
                      (feature) => (
                        <span key={feature} className="flex items-center gap-1.5">
                          <Check aria-hidden="true" size={16} strokeWidth={3} />
                          {feature}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              ) : null}
            </section>

            {error && (
              <div role="alert" className="rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <p className="flex items-start gap-2 font-bold text-slate-800">
                <ShieldCheck
                  aria-hidden="true"
                  className="mt-0.5 shrink-0 text-emerald-700"
                  size={19}
                />
                Tu colmado se activa después de confirmar el pago seguro.
              </p>
              <p className="mt-2 pl-7">
                No guardamos la información de tu tarjeta.
              </p>
            </div>

            <button
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-6 font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting || loadingPlan || !plan}
              type="submit"
            >
              {submitting ? (
                <>
                  <Loader2 aria-hidden="true" className="animate-spin" size={21} />
                  Preparando pago…
                </>
              ) : (
                <>
                  Continuar al pago
                  <ArrowRight aria-hidden="true" size={21} />
                </>
              )}
            </button>

            <p className="text-center text-sm text-slate-600">
              ¿Ya tienes una cuenta?{" "}
              <Link
                className="font-black text-emerald-700 hover:underline"
                to="/colmado/login"
              >
                Entrar a mi colmado
              </Link>
            </p>
          </form>
        </section>
      </div>
    </main>
  );
}


interface SignupFieldProps {
  children: ReactNode;
  icon: ReactNode;
  label: string;
}


function SignupField({ children, icon, label }: SignupFieldProps) {
  return (
    <label className="block text-sm font-black text-slate-800">
      {label}
      <span className="mt-2 flex items-center rounded-2xl border border-slate-300 bg-white px-3 text-slate-400 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100">
        {icon}
        {children}
      </span>
    </label>
  );
}
