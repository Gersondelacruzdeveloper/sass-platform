import {
  ClipboardList,
  Search,
  Clock3,
  DollarSign,
  Users,
  MoreVertical,
  CreditCard,
  Plus,
} from "lucide-react";

const openTabs = [
  {
    id: "TAB-1001",
    customer: "Michael Johnson",
    table: "VIP Table 1",
    guests: 6,
    openedBy: "Ana Rivera",
    amount: 420,
    openedAt: "9:42 PM",
    status: "Open",
  },
  {
    id: "TAB-1002",
    customer: "Walk-In Group",
    table: "Terrace 4",
    guests: 3,
    openedBy: "Carlos",
    amount: 180,
    openedAt: "10:12 PM",
    status: "Open",
  },
  {
    id: "TAB-1003",
    customer: "James Carter",
    table: "VIP Table 2",
    guests: 4,
    openedBy: "Luis",
    amount: 650,
    openedAt: "8:51 PM",
    status: "Pending Payment",
  },
];

export default function OpenTabsPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Customer tabs
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Open Tabs
          </h1>

          <p className="mt-2 text-gray-500">
            Manage unpaid orders, table tabs, VIP bottle service, and customer balances.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          Open New Tab
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ClipboardList className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">
            Open tabs
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            11
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">
            Outstanding balance
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            $4,820
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">
            Active guests
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            38
          </h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Clock3 className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">
            Avg tab duration
          </p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">
            2h 14m
          </h2>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-3xl border border-gray-200 bg-white px-5 py-4 shadow-sm md:w-96">
        <Search size={18} className="text-gray-400" />

        <input
          type="text"
          placeholder="Search customer or table..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      {/* Table */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Active Customer Tabs
            </h2>

            <p className="text-sm text-gray-500">
              Monitor every open balance in real time.
            </p>
          </div>

          <button className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">
            Export
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Tab ID</th>
                <th className="pb-3">Customer</th>
                <th className="pb-3">Table</th>
                <th className="pb-3">Guests</th>
                <th className="pb-3">Opened By</th>
                <th className="pb-3">Opened At</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Balance</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {openTabs.map((tab) => {
                const pending =
                  tab.status === "Pending Payment";

                return (
                  <tr key={tab.id}>
                    <td className="py-5 font-semibold text-gray-900">
                      {tab.id}
                    </td>

                    <td className="py-5">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {tab.customer}
                        </p>

                        <p className="text-sm text-gray-500">
                          {tab.guests} guests
                        </p>
                      </div>
                    </td>

                    <td className="py-5 text-gray-700">
                      {tab.table}
                    </td>

                    <td className="py-5 text-gray-500">
                      {tab.guests}
                    </td>

                    <td className="py-5 text-gray-500">
                      {tab.openedBy}
                    </td>

                    <td className="py-5 text-gray-500">
                      {tab.openedAt}
                    </td>

                    <td className="py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          pending
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-cyan-100 text-cyan-700"
                        }`}
                      >
                        {tab.status}
                      </span>
                    </td>

                    <td className="py-5 text-right text-lg font-bold text-emerald-600">
                      ${tab.amount}
                    </td>

                    <td className="py-5">
                      <div className="flex justify-end gap-2">
                        <button className="flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">
                          <CreditCard size={16} />
                          Close
                        </button>

                        <button className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                          <MoreVertical size={18} />
                        </button>
                      </div>
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