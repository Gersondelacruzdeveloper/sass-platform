import {
  Check,
  Crown,
  CreditCard,
  Users,
  Building2,
  ShieldCheck,
  Zap,
} from "lucide-react";

const plans = [
  {
    name: "Basic",
    price: 29,
    employees: 3,
    description: "For small discos starting to organise sales and stock.",
    features: [
      "Sales tracking",
      "Basic inventory",
      "3 employee accounts",
      "Daily reports",
      "Email support",
    ],
    current: false,
  },
  {
    name: "Pro",
    price: 59,
    employees: 15,
    description: "For busy discos that need POS, employees, and reports.",
    features: [
      "Full POS system",
      "Advanced inventory",
      "15 employee accounts",
      "Expenses tracking",
      "Profit reports",
      "Low-stock alerts",
    ],
    current: true,
  },
  {
    name: "Enterprise",
    price: 129,
    employees: 50,
    description: "For owners managing multiple venues or large teams.",
    features: [
      "Multiple disco locations",
      "50 employee accounts",
      "Advanced analytics",
      "Priority support",
      "Custom permissions",
      "Owner-level reporting",
    ],
    current: false,
  },
];

export default function SubscriptionPage() {
  const activeEmployees = 12;
  const employeeLimit = 15;
  const extraEmployeePrice = 3;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Billing & access
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Subscription
          </h1>

          <p className="mt-2 text-gray-500">
            Manage your plan, employee limits, billing, and SaaS access.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <CreditCard size={18} />
          Update Payment
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Crown className="text-cyan-600" />
          <p className="mt-4 text-sm text-gray-500">Current plan</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">Pro</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Employees used</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            {activeEmployees}/{employeeLimit}
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Building2 className="text-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">Business locations</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">1</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ShieldCheck className="text-orange-600" />
          <p className="mt-4 text-sm text-gray-500">Account status</p>
          <h2 className="mt-2 text-3xl font-bold text-emerald-600">Active</h2>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-cyan-500/20 px-4 py-2 text-sm font-semibold text-cyan-300">
              <Zap size={16} />
              Pro Plan Active
            </div>

            <h2 className="mt-5 text-2xl font-bold">
              Your disco is running on the Pro plan
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              You have POS, sales tracking, inventory alerts, employee access,
              expenses, reports, and profit monitoring enabled.
            </p>
          </div>

          <div className="rounded-3xl bg-white/10 p-5 text-right">
            <p className="text-sm text-slate-300">Next payment</p>
            <h3 className="mt-2 text-3xl font-black">$59</h3>
            <p className="mt-1 text-sm text-slate-400">June 25, 2026</p>
          </div>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-slate-300">Employee usage</span>
            <span className="font-semibold text-white">
              {activeEmployees} of {employeeLimit}
            </span>
          </div>

          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-cyan-400"
              style={{ width: `${(activeEmployees / employeeLimit) * 100}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-3xl border p-6 shadow-sm ${
              plan.current
                ? "border-cyan-400 bg-cyan-50"
                : "border-gray-200 bg-white"
            }`}
          >
            {plan.current && (
              <div className="mb-4 inline-flex rounded-full bg-cyan-600 px-3 py-1 text-xs font-bold text-white">
                CURRENT PLAN
              </div>
            )}

            <h2 className="text-xl font-bold text-gray-900">{plan.name}</h2>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              {plan.description}
            </p>

            <div className="mt-6 flex items-end gap-1">
              <span className="text-4xl font-black text-gray-900">
                ${plan.price}
              </span>
              <span className="pb-1 text-sm text-gray-500">/month</span>
            </div>

            <p className="mt-2 text-sm font-medium text-gray-600">
              Includes {plan.employees} employees
            </p>

            <div className="mt-6 space-y-3">
              {plan.features.map((feature) => (
                <div key={feature} className="flex items-center gap-3">
                  <div className="rounded-full bg-emerald-100 p-1 text-emerald-700">
                    <Check size={14} />
                  </div>
                  <span className="text-sm text-gray-700">{feature}</span>
                </div>
              ))}
            </div>

            <button
              className={`mt-8 w-full rounded-2xl px-5 py-3 text-sm font-bold transition ${
                plan.current
                  ? "bg-gray-900 text-white hover:bg-gray-800"
                  : "bg-white text-gray-900 border border-gray-200 hover:bg-gray-100"
              }`}
            >
              {plan.current ? "Manage Plan" : "Switch Plan"}
            </button>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Employee Add-ons
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Add more staff accounts when your team grows.
          </p>

          <div className="mt-6 rounded-3xl border border-gray-100 bg-gray-50 p-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-sm text-gray-500">Extra employee price</p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900">
                  ${extraEmployeePrice}/employee/month
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <button className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  - Remove
                </button>

                <button className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800">
                  + Add Employee
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">Billing Summary</h2>

          <div className="mt-6 space-y-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Pro plan</span>
              <span className="font-semibold text-gray-900">$59.00</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Extra employees</span>
              <span className="font-semibold text-gray-900">$0.00</span>
            </div>

            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax / fees</span>
              <span className="font-semibold text-gray-900">$0.00</span>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between">
                <span className="font-bold text-gray-900">Total monthly</span>
                <span className="text-2xl font-black text-gray-900">
                  $59.00
                </span>
              </div>
            </div>
          </div>

          <button className="mt-6 w-full rounded-2xl bg-black px-5 py-4 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-600">
            Confirm Subscription
          </button>
        </div>
      </div>
    </div>
  );
}