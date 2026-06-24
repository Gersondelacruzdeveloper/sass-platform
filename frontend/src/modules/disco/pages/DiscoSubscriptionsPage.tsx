import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  CreditCard,
  Crown,
  DollarSign,
  MoreVertical,
  Plus,
  Search,
  Users,
} from "lucide-react";

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";
import type { DiscoLanguage } from "../i18n/discoTranslations";

type SubscriptionStatus = "active" | "pending";

type Subscription = {
  id: string;
  organisation: string;
  plan: string;
  employees: number;
  amount: number;
  status: SubscriptionStatus;
  nextBilling?: string;
  awaitingPayment?: boolean;
};

const subscriptions: Subscription[] = [
  {
    id: "SUB-1001",
    organisation: "Coco Bongo Punta Cana",
    plan: "Enterprise",
    employees: 42,
    amount: 129,
    status: "active",
    nextBilling: "2026-06-25",
  },
  {
    id: "SUB-1002",
    organisation: "Macao Beach Club",
    plan: "Pro",
    employees: 9,
    amount: 59,
    status: "active",
    nextBilling: "2026-06-28",
  },
  {
    id: "SUB-1003",
    organisation: "Secrets Resort Lounge",
    plan: "Enterprise",
    employees: 50,
    amount: 129,
    status: "pending",
    awaitingPayment: true,
  },
];

const planCards = [
  {
    key: "basic",
    price: 29,
    employees: 3,
    wrapperClass: "border-cyan-300 bg-cyan-50 text-gray-900",
    iconClass: "text-cyan-700",
    priceClass: "text-gray-900",
    mutedClass: "text-gray-600",
    intervalClass: "text-gray-500",
    helperClass: "text-gray-700",
  },
  {
    key: "pro",
    price: 59,
    employees: 15,
    wrapperClass: "border-gray-200 bg-white text-gray-900",
    iconClass: "text-purple-600",
    priceClass: "text-gray-900",
    mutedClass: "text-gray-600",
    intervalClass: "text-gray-500",
    helperClass: "text-gray-700",
  },
  {
    key: "enterprise",
    price: 129,
    employees: 50,
    wrapperClass: "border-gray-200 bg-slate-950 text-white",
    iconClass: "text-cyan-300",
    priceClass: "text-white",
    mutedClass: "text-slate-300",
    intervalClass: "text-slate-400",
    helperClass: "text-slate-300",
  },
];

function money(value: number, language: DiscoLanguage) {
  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | undefined, language: DiscoLanguage) {
  if (!value) return "";

  const locale = language === "es" ? "es-DO" : "en-US";

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
  }).format(new Date(value));
}

function interpolate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replace(`{{${key}}}`, String(value)),
    template
  );
}

export default function DiscoSubscriptionsPage() {
  const { language, t } = useDiscoTranslation();

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            {t("subscriptions.saasBilling")}
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            {t("subscriptions.title")}
          </h1>

          <p className="mt-2 text-gray-500">
            {t("subscriptions.subtitle")}
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          {t("subscriptions.newSubscription")}
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <CreditCard className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">
            {t("subscriptions.activeSubscriptions")}
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">44</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">
            {t("subscriptions.monthlyRecurringRevenue")}
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            {money(8920, language)}
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Building2 className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">
            {t("subscriptions.payingOrganisations")}
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">48</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">
            {t("subscriptions.employeeSeatsSold")}
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">624</h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {planCards.map((plan) => (
          <div
            key={plan.key}
            className={`rounded-3xl border p-6 shadow-sm ${plan.wrapperClass}`}
          >
            <Crown className={plan.iconClass} />

            <h2 className="mt-4 text-xl font-bold">
              {t(`subscriptions.plan.${plan.key}`)}
            </h2>

            <p className={`mt-2 text-sm ${plan.mutedClass}`}>
              {t(`subscriptions.plan.${plan.key}Description`)}
            </p>

            <div className="mt-5 flex items-end gap-1">
              <span className={`text-4xl font-black ${plan.priceClass}`}>
                {money(plan.price, language)}
              </span>

              <span className={`pb-1 text-sm ${plan.intervalClass}`}>
                /{t("subscriptions.month")}
              </span>
            </div>

            <p className={`mt-3 text-sm font-medium ${plan.helperClass}`}>
              {interpolate(t("subscriptions.includesEmployees"), {
                count: plan.employees,
              })}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {t("subscriptions.customerSubscriptions")}
            </h2>

            <p className="text-sm text-gray-500">
              {t("subscriptions.customerSubscriptionsDescription")}
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />

            <input
              type="text"
              placeholder={t("subscriptions.searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">
                  {t("subscriptions.table.subscription")}
                </th>
                <th className="pb-3">
                  {t("subscriptions.table.organisation")}
                </th>
                <th className="pb-3">{t("subscriptions.table.plan")}</th>
                <th className="pb-3">
                  {t("subscriptions.table.employees")}
                </th>
                <th className="pb-3">
                  {t("subscriptions.table.nextBilling")}
                </th>
                <th className="pb-3">{t("subscriptions.table.status")}</th>
                <th className="pb-3 text-right">
                  {t("subscriptions.table.amount")}
                </th>
                <th className="pb-3 text-right">
                  {t("subscriptions.table.actions")}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {subscriptions.map((sub) => {
                const isActive = sub.status === "active";

                return (
                  <tr key={sub.id}>
                    <td className="py-5 font-semibold text-gray-900">
                      {sub.id}
                    </td>

                    <td className="py-5">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-950 text-white">
                          <Building2 size={20} />
                        </div>

                        <div>
                          <p className="font-semibold text-gray-900">
                            {sub.organisation}
                          </p>

                          <p className="text-sm text-gray-500">
                            {t("subscriptions.saasCustomer")}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-5">
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                        {sub.plan}
                      </span>
                    </td>

                    <td className="py-5 text-gray-700">{sub.employees}</td>

                    <td className="py-5 text-gray-500">
                      {sub.awaitingPayment
                        ? t("subscriptions.awaitingPayment")
                        : formatDate(sub.nextBilling, language)}
                    </td>

                    <td className="py-5">
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {isActive ? (
                          <CheckCircle2 size={14} />
                        ) : (
                          <AlertTriangle size={14} />
                        )}

                        {t(`subscriptions.status.${sub.status}`)}
                      </span>
                    </td>

                    <td className="py-5 text-right text-lg font-bold text-emerald-600">
                      {money(sub.amount, language)}/
                      {t("subscriptions.perMonthShort")}
                    </td>

                    <td className="py-5 text-right">
                      <button className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                        <MoreVertical size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}