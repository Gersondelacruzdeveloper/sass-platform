import {
  CreditCard,
  Plus,
  Search,
  Crown,
  Building2,
  Users,
  DollarSign,
  MoreVertical,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

const subscriptions = [
  {
    id: "SUB-1001",
    organisation: "Coco Bongo Punta Cana",
    plan: "Enterprise",
    employees: 42,
    amount: 129,
    status: "Active",
    nextBilling: "June 25, 2026",
  },
  {
    id: "SUB-1002",
    organisation: "Macao Beach Club",
    plan: "Pro",
    employees: 9,
    amount: 59,
    status: "Active",
    nextBilling: "June 28, 2026",
  },
  {
    id: "SUB-1003",
    organisation: "Secrets Resort Lounge",
    plan: "Enterprise",
    employees: 50,
    amount: 129,
    status: "Pending",
    nextBilling: "Awaiting payment",
  },
];

export default function SubscriptionsPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            SaaS billing
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Subscriptions
          </h1>

          <p className="mt-2 text-gray-500">
            Manage customer plans, monthly billing, employee limits, and subscription status.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          New Subscription
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <CreditCard className="text-cyan-600" />
          <p className="mt-4 text-sm text-gray-500">Active subscriptions</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">44</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">Monthly recurring revenue</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$8,920</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Building2 className="text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Paying organisations</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">48</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-orange-600" />
          <p className="mt-4 text-sm text-gray-500">Employee seats sold</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">624</h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-cyan-300 bg-cyan-50 p-6 shadow-sm">
          <Crown className="text-cyan-700" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">Basic</h2>
          <p className="mt-2 text-sm text-gray-600">
            Small businesses starting with sales and inventory.
          </p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-4xl font-black text-gray-900">$29</span>
            <span className="pb-1 text-sm text-gray-500">/month</span>
          </div>
          <p className="mt-3 text-sm font-medium text-gray-700">
            Includes 3 employees
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Crown className="text-purple-600" />
          <h2 className="mt-4 text-xl font-bold text-gray-900">Pro</h2>
          <p className="mt-2 text-sm text-gray-600">
            POS, inventory, expenses, employees, and reports.
          </p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-4xl font-black text-gray-900">$59</span>
            <span className="pb-1 text-sm text-gray-500">/month</span>
          </div>
          <p className="mt-3 text-sm font-medium text-gray-700">
            Includes 15 employees
          </p>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
          <Crown className="text-cyan-300" />
          <h2 className="mt-4 text-xl font-bold">Enterprise</h2>
          <p className="mt-2 text-sm text-slate-300">
            Multiple locations, advanced analytics, and premium support.
          </p>
          <div className="mt-5 flex items-end gap-1">
            <span className="text-4xl font-black">$129</span>
            <span className="pb-1 text-sm text-slate-400">/month</span>
          </div>
          <p className="mt-3 text-sm font-medium text-slate-300">
            Includes 50 employees
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Customer Subscriptions
            </h2>
            <p className="text-sm text-gray-500">
              Track all paying customers and billing status.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search subscription..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Subscription</th>
                <th className="pb-3">Organisation</th>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Employees</th>
                <th className="pb-3">Next Billing</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Amount</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {subscriptions.map((sub) => {
                const isActive = sub.status === "Active";

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
                            SaaS customer
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-5">
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                        {sub.plan}
                      </span>
                    </td>

                    <td className="py-5 text-gray-700">
                      {sub.employees}
                    </td>

                    <td className="py-5 text-gray-500">
                      {sub.nextBilling}
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
                        {sub.status}
                      </span>
                    </td>

                    <td className="py-5 text-right text-lg font-bold text-emerald-600">
                      ${sub.amount}/mo
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