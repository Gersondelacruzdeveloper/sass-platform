import { useEffect, useMemo, useState } from "react";
import { Check, CreditCard, Loader2, Music, Sparkles } from "lucide-react";
import api from "../../../api/axios";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

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

const featureKeys = [
  "signup.feature.posReceipts",
  "signup.feature.employeeLogins",
  "signup.feature.inventory",
  "signup.feature.tablesReservations",
  "signup.feature.cashShiftReports",
  "signup.feature.subscriptionAccess",
];

function translateInterval(
  interval: string,
  t: (key: string, fallback?: string) => string,
) {
  return t(`signup.interval.${interval}`, interval);
}

export default function DiscoSignupPage() {
  const { language, setLanguage, t } = useDiscoTranslation();

  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState("pro");
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    company_name: "",
    owner_name: "",
    email: "",
    password: "",
  });

  const translatedFeatures = useMemo(
    () => featureKeys.map((key) => t(key)),
    [t],
  );

  useEffect(() => {
    async function loadPlans() {
      try {
        const res = await api.get("/subscriptions/plans/");
        setPlans(res.data);

        if (res.data?.length) {
          setSelectedPlan(res.data[0].slug);
        }
      } catch (err) {
        console.error(err);
        setError(t("signup.errorLoadPlans"));
      } finally {
        setLoadingPlans(false);
      }
    }

    loadPlans();
  }, [t]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      const res = await api.post("/subscriptions/create-checkout-session/", {
        ...form,
        business_type: "disco",
        plan: selectedPlan,
      });

      window.location.href = res.data.checkout_url;
    } catch (err: any) {
      console.error(err);
      setError(err?.response?.data?.detail || t("signup.errorCheckout"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[1fr_520px] lg:items-center lg:py-10">
        <div className="space-y-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
              <Sparkles className="h-4 w-4" />
              {t("signup.badge")}
            </div>

            <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-2 text-xs font-black text-white/80">
              {t("signup.language")}

              <select
                value={language}
                aria-label={t("signup.language")}
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

          <div>
            <div className="mb-6 flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-950">
                <Music className="h-8 w-8" />
              </div>

              <div>
                <p className="text-2xl font-black tracking-tight text-white">
                  {t("signup.brandName")}
                </p>
                <p className="mt-1 text-sm font-bold text-white/45">
                  {t("signup.brandSubtitle")}
                </p>
              </div>
            </div>

            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl lg:text-7xl">
              {t("signup.heroTitle")}
            </h1>

            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/65">
              {t("signup.heroDescription")}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {translatedFeatures.map((item) => (
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
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-white/10 bg-white p-5 text-slate-950 shadow-2xl sm:p-6"
        >
          <div>
            <h2 className="text-2xl font-black">{t("signup.createAccount")}</h2>

            <p className="mt-2 text-sm font-medium text-slate-500">
              {t("signup.createAccountDescription")}
            </p>
          </div>

          {error && (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("signup.companyName")}
              </span>

              <input
                required
                value={form.company_name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    company_name: e.target.value,
                  }))
                }
                placeholder={t("signup.companyNamePlaceholder")}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("signup.ownerName")}
              </span>

              <input
                required
                value={form.owner_name}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    owner_name: e.target.value,
                  }))
                }
                placeholder={t("signup.ownerNamePlaceholder")}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("signup.ownerEmail")}
              </span>

              <input
                required
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    email: e.target.value,
                  }))
                }
                placeholder={t("signup.ownerEmailPlaceholder")}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                {t("signup.password")}
              </span>

              <input
                required
                minLength={8}
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                placeholder={t("signup.passwordPlaceholder")}
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>
          </div>

          <div className="mt-6">
            <p className="text-sm font-black text-slate-900">
              {t("signup.choosePlan")}
            </p>

            {loadingPlans ? (
              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                {t("signup.loadingPlans")}
              </div>
            ) : (
              <div className="mt-3 grid gap-3">
                {plans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlan(plan.slug)}
                    className={`rounded-3xl border p-4 text-left transition ${
                      selectedPlan === plan.slug
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 bg-slate-50 text-slate-950 hover:bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black">{plan.name}</p>

                        <p className="mt-1 text-xs font-bold opacity-70">
                          {plan.max_users} {t("signup.userLogins")} ·{" "}
                          {plan.max_employees} {t("signup.employees")}
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
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting || loadingPlans}
            className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("signup.redirecting")}
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                {t("signup.continueToPayment")}
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs font-medium text-slate-500">
            {t("signup.stripeNote")}
          </p>
        </form>
      </section>
    </main>
  );
}
