import { useEffect, useState } from "react";
import { Check, CreditCard, Loader2, Music, Sparkles } from "lucide-react";
import api from "../../../api/axios";

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

const businessTypes = [
  { value: "disco", label: "Disco / Nightclub" },
  { value: "restaurant", label: "Restaurant" },
  { value: "hotel", label: "Hotel" },
  { value: "store", label: "Store" },
  { value: "excursions", label: "Excursions" },
];

export default function DiscoSignupPage() {
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
    business_type: "disco",
  });

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
        setError("Could not load subscription plans.");
      } finally {
        setLoadingPlans(false);
      }
    }

    loadPlans();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSubmitting(true);
      setError("");

      const res = await api.post("/subscriptions/create-checkout-session/", {
        ...form,
        plan: selectedPlan,
      });

      window.location.href = res.data.checkout_url;
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail ||
          "Could not start checkout. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[1fr_520px] lg:items-center lg:py-10">
        <div className="space-y-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white/80">
            <Sparkles className="h-4 w-4" />
            Disco SaaS POS Platform
          </div>

          <div>
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-3xl bg-white text-slate-950">
              <Music className="h-8 w-8" />
            </div>

            <h1 className="max-w-3xl text-4xl font-black tracking-tight sm:text-5xl lg:text-7xl">
              Run your disco, bar, lounge, or nightclub from one platform.
            </h1>

            <p className="mt-6 max-w-2xl text-lg font-medium leading-8 text-white/65">
              Manage POS sales, employees, tables, reservations, inventory,
              cash shifts, receipts, and reports with a modern multi-tenant
              SaaS system.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {[
              "POS and receipt printing",
              "Employee logins and roles",
              "Inventory and stock movements",
              "Tables and reservations",
              "Cash shift reports",
              "Subscription-based access",
            ].map((item) => (
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
            <h2 className="text-2xl font-black">Create your account</h2>
            <p className="mt-2 text-sm font-medium text-slate-500">
              Choose a plan, create your organisation, and continue to Stripe
              checkout.
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
                Company Name
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
                placeholder="Example: Almond Brownie"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Business Type
              </span>
              <select
                value={form.business_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    business_type: e.target.value,
                  }))
                }
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              >
                {businessTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Owner Name
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
                placeholder="Example: Gerson De la Cruz"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Owner Email
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
                placeholder="owner@company.com"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-bold text-slate-700">
                Password
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
                placeholder="Create a secure password"
                className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
              />
            </label>
          </div>

          <div className="mt-6">
            <p className="text-sm font-black text-slate-900">Choose Plan</p>

            {loadingPlans ? (
              <div className="mt-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-bold text-slate-500">
                Loading plans...
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
                          {plan.max_users} user logins · {plan.max_employees}{" "}
                          employees
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-2xl font-black">
                          ${Number(plan.price).toFixed(0)}
                        </p>
                        <p className="text-xs font-bold opacity-70">
                          /{plan.interval}
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
            className="mt-6 inline-flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-4 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4" />
                Continue to Payment
              </>
            )}
          </button>

          <p className="mt-4 text-center text-xs font-medium text-slate-500">
            Secure checkout powered by Stripe. Your organisation activates after
            payment succeeds.
          </p>
        </form>
      </section>
    </main>
  );
}