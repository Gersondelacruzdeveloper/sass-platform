// src/modules/ticketing/pages/TicketingSignupPage.tsx

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  CreditCard,
  Globe2,
  Loader2,
  LockKeyhole,
  Mail,
  MapPinned,
  Phone,
  ShieldCheck,
  Sparkles,
  Ticket,
  User,
} from "lucide-react";

import api from "../../../api/axios";
import { useTicketingAdminTranslation } from "../admin-i18n/useTicketingAdminTranslation";

type Plan = {
  id: number;
  name: string;
  slug: string;
  price: string | number;
  currency: string;
  interval: string;
  max_users: number;
  max_employees: number;
  max_modules: number;
};

type SignupForm = {
  company_name: string;
  owner_name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
  subdomain: string;
};

const initialForm: SignupForm = {
  company_name: "",
  owner_name: "",
  email: "",
  phone: "",
  password: "",
  confirmPassword: "",
  subdomain: "",
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function translateInterval(
  interval: string,
  t: (key: string) => string
) {
  if (interval === "month" || interval === "monthly") {
    return t("signup.plan.month");
  }

  if (interval === "year" || interval === "yearly") {
    return t("signup.plan.year");
  }

  return interval;
}

export default function TicketingSignupPage() {
  const { t } = useTicketingAdminTranslation();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const [form, setForm] = useState<SignupForm>(initialForm);

  const featureItems = [
    t("signup.features.publicWebsite"),
    t("signup.features.sellerDashboard"),
    t("signup.features.products"),
    t("signup.features.pickup"),
    t("signup.features.payments"),
    t("signup.features.commissions"),
  ];

  const highlightItems = [
    {
      icon: Globe2,
      title: t("signup.highlights.publicWebsite.title"),
      text: t("signup.highlights.publicWebsite.text"),
    },
    {
      icon: MapPinned,
      title: t("signup.highlights.pickupAutomation.title"),
      text: t("signup.highlights.pickupAutomation.text"),
    },
    {
      icon: BadgeCheck,
      title: t("signup.highlights.sellerControl.title"),
      text: t("signup.highlights.sellerControl.text"),
    },
  ];

  const publicUrlPreview = useMemo(() => {
    const slug =
      form.subdomain ||
      slugify(form.company_name) ||
      "your-company";

    return `${slug}.puntacanadiscovery.com`;
  }, [form.company_name, form.subdomain]);

  useEffect(() => {
    async function loadPlans() {
      try {
        setLoadingPlans(true);
        setErrorMessage("");

        const response = await api.get("/subscriptions/plans/");
        const data = response.data || [];

        setPlans(data);

        if (data?.length) {
          setSelectedPlan(data[0].slug);
        }
      } catch (error) {
        console.error("Could not load subscription plans:", error);
        setErrorMessage(t("signup.errors.loadPlans"));
      } finally {
        setLoadingPlans(false);
      }
    }

    loadPlans();
  }, []);

  function updateField<K extends keyof SignupForm>(
    field: K,
    value: SignupForm[K]
  ) {
    setForm((current) => {
      const next = {
        ...current,
        [field]: value,
      };

      if (field === "company_name" && !current.subdomain) {
        next.subdomain = slugify(String(value));
      }

      if (field === "subdomain") {
        next.subdomain = slugify(String(value));
      }

      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setErrorMessage("");

    if (!form.company_name.trim()) {
      setErrorMessage(t("signup.errors.companyRequired"));
      return;
    }

    if (!form.owner_name.trim()) {
      setErrorMessage(t("signup.errors.ownerRequired"));
      return;
    }

    if (!form.email.trim()) {
      setErrorMessage(t("signup.errors.emailRequired"));
      return;
    }

    if (!form.password) {
      setErrorMessage(t("signup.errors.passwordRequired"));
      return;
    }

    if (form.password.length < 8) {
      setErrorMessage(t("signup.errors.passwordLength"));
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMessage(t("signup.errors.passwordMismatch"));
      return;
    }

    try {
      setSubmitting(true);

      const response = await api.post("/subscriptions/create-checkout-session/", {
        company_name: form.company_name,
        owner_name: form.owner_name,
        email: form.email,
        password: form.password,
        business_type: "ticketing",
        app: "ticketing",
        plan: selectedPlan,
      });

      window.location.href = response.data.checkout_url;
    } catch (error: any) {
      console.error("Ticketing signup error:", error);

      setErrorMessage(
        error?.response?.data?.detail ||
          error?.response?.data?.error ||
          t("signup.errors.checkout")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-16 h-72 w-72 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute right-0 top-0 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="absolute bottom-0 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <section className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 gap-8 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_540px] lg:items-center lg:py-10">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/ticketing" className="inline-flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-amber-400 text-slate-950 shadow-lg shadow-amber-400/20">
                <Ticket className="h-8 w-8" />
              </div>

              <div>
                <p className="text-2xl font-black tracking-tight text-white">
                  PCD Experiences
                </p>
                <p className="mt-1 text-sm font-bold text-white/45">
                  {t("signup.brand.tagline")}
                </p>
              </div>
            </Link>

            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
              <Sparkles className="h-4 w-4 text-amber-300" />
              {t("signup.badge.builtForTourism")}
            </div>
          </div>

          <div>
            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl lg:text-7xl">
              {t("signup.hero.title")}
            </h1>

            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/65">
              {t("signup.hero.description")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {featureItems.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                  <Check className="h-4 w-4" />
                </div>

                <span className="text-sm font-bold text-white/80">{item}</span>
              </div>
            ))}
          </div>

          <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
            {highlightItems.map((item) => {
              const Icon = item.icon;

              return (
                <div
                  key={item.title}
                  className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-amber-300">
                    <Icon className="h-5 w-5" />
                  </div>

                  <h3 className="mt-4 text-sm font-black text-white">
                    {item.title}
                  </h3>

                  <p className="mt-1 text-xs font-semibold leading-5 text-white/50">
                    {item.text}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl shadow-black/30 sm:p-6"
        >
          <div className="rounded-[1.5rem] bg-slate-50 p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-amber-600">
                  {t("signup.form.eyebrow")}
                </p>

                <h2 className="mt-2 text-2xl font-black text-slate-950">
                  {t("signup.form.title")}
                </h2>

                <p className="mt-2 text-sm font-semibold text-slate-500">
                  {t("signup.form.subtitle")}
                </p>
              </div>

              <div className="hidden h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white sm:flex">
                <Building2 className="h-6 w-6" />
              </div>
            </div>

            {errorMessage && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("signup.fields.companyName")}
                </span>

                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                  <Building2 className="h-5 w-5 text-slate-400" />
                  <input
                    required
                    value={form.company_name}
                    onChange={(event) =>
                      updateField("company_name", event.target.value)
                    }
                    placeholder={t("signup.placeholders.companyName")}
                    className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                  />
                </div>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("signup.fields.ownerName")}
                  </span>

                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                    <User className="h-5 w-5 text-slate-400" />
                    <input
                      required
                      value={form.owner_name}
                      onChange={(event) =>
                        updateField("owner_name", event.target.value)
                      }
                      placeholder={t("signup.placeholders.ownerName")}
                      className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("signup.fields.phone")}
                  </span>

                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                    <Phone className="h-5 w-5 text-slate-400" />
                    <input
                      value={form.phone}
                      onChange={(event) =>
                        updateField("phone", event.target.value)
                      }
                      placeholder="+1 809 000 0000"
                      className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("signup.fields.email")}
                </span>

                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                  <Mail className="h-5 w-5 text-slate-400" />
                  <input
                    required
                    type="email"
                    value={form.email}
                    onChange={(event) =>
                      updateField("email", event.target.value)
                    }
                    placeholder="owner@example.com"
                    className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                  />
                </div>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("signup.fields.password")}
                  </span>

                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                    <LockKeyhole className="h-5 w-5 text-slate-400" />
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={form.password}
                      onChange={(event) =>
                        updateField("password", event.target.value)
                      }
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </label>

                <label className="block">
                  <span className="text-sm font-bold text-slate-700">
                    {t("signup.fields.confirmPassword")}
                  </span>

                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                    <ShieldCheck className="h-5 w-5 text-slate-400" />
                    <input
                      required
                      minLength={8}
                      type="password"
                      value={form.confirmPassword}
                      onChange={(event) =>
                        updateField("confirmPassword", event.target.value)
                      }
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </label>
              </div>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("signup.fields.subdomain")}
                </span>

                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 focus-within:border-slate-950">
                  <Globe2 className="h-5 w-5 text-slate-400" />
                  <input
                    value={form.subdomain}
                    onChange={(event) =>
                      updateField("subdomain", event.target.value)
                    }
                    placeholder={t("signup.placeholders.subdomain")}
                    className="w-full bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-300"
                  />
                </div>

                <p className="mt-2 text-xs font-bold text-slate-400">
                  {t("signup.fields.preview")}:{" "}
                  <span className="text-slate-700">{publicUrlPreview}</span>
                </p>
              </label>

              <div>
                <p className="text-sm font-black text-slate-900">
                  {t("signup.plan.choose")}
                </p>

                {loadingPlans ? (
                  <div className="mt-3 rounded-3xl border border-slate-200 bg-white p-5 text-sm font-bold text-slate-500">
                    {t("signup.plan.loading")}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    {plans.map((plan) => {
                      const active = selectedPlan === plan.slug;

                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setSelectedPlan(plan.slug)}
                          className={`rounded-3xl border p-4 text-left transition ${
                            active
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-950 hover:bg-slate-50"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-lg font-black">
                                  {plan.name}
                                </p>

                                {active && (
                                  <CheckCircle2 className="h-4 w-4 text-amber-300" />
                                )}
                              </div>

                              <p className="mt-1 text-xs font-bold opacity-70">
                                {plan.max_users} {t("signup.plan.userLogins")} ·{" "}
                                {plan.max_employees} {t("signup.plan.employees")}
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="text-2xl font-black">
                                ${Number(plan.price).toFixed(0)}
                              </p>

                              <p className="text-xs font-bold opacity-70">
                                /{translateInterval(plan.interval, t)}
                              </p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || loadingPlans}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-5 py-4 text-sm font-black text-slate-950 shadow-lg shadow-amber-400/20 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {t("signup.actions.redirecting")}
                  </>
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    {t("signup.actions.continueToPayment")}
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs font-semibold text-slate-400">
                {t("signup.footer.secureCheckout")}
              </p>

              <p className="text-center text-xs font-semibold text-slate-400">
                {t("signup.footer.haveAccount")}{" "}
                <Link
                  to="/login"
                  className="font-black text-slate-950 hover:underline"
                >
                  {t("signup.actions.login")}
                </Link>
              </p>
            </div>
          </div>
        </form>
      </section>
    </main>
  );
}
