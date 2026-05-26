import {
  Building2,
  Plus,
  Search,
  Users,
  Globe,
  CreditCard,
  MoreVertical,
  ShieldCheck,
} from "lucide-react";

const organisations = [
  {
    id: 1,
    name: "Coco Bongo Punta Cana",
    type: "Disco",
    employees: 18,
    plan: "Enterprise",
    status: "Active",
    revenue: "$12,400",
    country: "Dominican Republic",
  },
  {
    id: 2,
    name: "Macao Beach Club",
    type: "Restaurant",
    employees: 9,
    plan: "Pro",
    status: "Active",
    revenue: "$4,820",
    country: "Dominican Republic",
  },
  {
    id: 3,
    name: "Secrets Resort Lounge",
    type: "Hotel",
    employees: 32,
    plan: "Enterprise",
    status: "Pending",
    revenue: "$22,190",
    country: "Dominican Republic",
  },
];

export default function OrganisationsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            SaaS management
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Organisations
          </h1>

          <p className="mt-2 text-gray-500">
            Manage all businesses using your SaaS platform including discos,
            hotels, restaurants, and excursion companies.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          New Organisation
        </button>
      </div>

      {/* KPI */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Building2 className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">
            Total organisations
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            48
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">
            Employees managed
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            624
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <CreditCard className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">
            Monthly recurring revenue
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            $8,920
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ShieldCheck className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">
            Active subscriptions
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            44
          </h2>
        </div>
      </div>

      {/* Organisations Table */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Business Organisations
            </h2>

            <p className="text-sm text-gray-500">
              All companies currently using your SaaS platform.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />

            <input
              type="text"
              placeholder="Search organisation..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Business</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Employees</th>
                <th className="pb-3">Plan</th>
                <th className="pb-3">Country</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Revenue</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {organisations.map((org) => {
                const statusStyles = {
                  Active:
                    "bg-emerald-100 text-emerald-700",
                  Pending:
                    "bg-yellow-100 text-yellow-700",
                };

                return (
                  <tr key={org.id}>
                    <td className="py-5">
                      <div className="flex items-center gap-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                          <Building2 size={22} />
                        </div>

                        <div>
                          <p className="font-semibold text-gray-900">
                            {org.name}
                          </p>

                          <p className="text-sm text-gray-500">
                            ID #{org.id}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="py-5">
                      <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                        {org.type}
                      </span>
                    </td>

                    <td className="py-5 text-gray-700">
                      {org.employees}
                    </td>

                    <td className="py-5">
                      <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700">
                        {org.plan}
                      </span>
                    </td>

                    <td className="py-5">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Globe size={16} />
                        {org.country}
                      </div>
                    </td>

                    <td className="py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          statusStyles[
                            org.status as keyof typeof statusStyles
                          ]
                        }`}
                      >
                        {org.status}
                      </span>
                    </td>

                    <td className="py-5 text-right text-lg font-bold text-emerald-600">
                      {org.revenue}
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

      {/* Bottom Section */}
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
          <h2 className="text-lg font-bold">
            SaaS Platform Health
          </h2>

          <p className="mt-2 text-sm leading-6 text-slate-300">
            Monitor subscription growth, active businesses,
            and overall platform performance.
          </p>

          <div className="mt-6 space-y-4">
            <div className="flex justify-between">
              <span className="text-slate-400">
                Active organisations
              </span>

              <span className="font-bold">
                44
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">
                Pending onboarding
              </span>

              <span className="font-bold">
                4
              </span>
            </div>

            <div className="flex justify-between">
              <span className="text-slate-400">
                Monthly growth
              </span>

              <span className="font-bold text-emerald-400">
                +12.8%
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <h2 className="text-lg font-bold text-gray-900">
            Platform Revenue
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Revenue generated from subscriptions and employee add-ons.
          </p>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">
                Basic plans
              </p>

              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $1,240
              </h3>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">
                Pro plans
              </p>

              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $4,980
              </h3>
            </div>

            <div className="rounded-2xl bg-gray-50 p-5">
              <p className="text-sm text-gray-500">
                Enterprise plans
              </p>

              <h3 className="mt-2 text-2xl font-bold text-gray-900">
                $2,700
              </h3>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}