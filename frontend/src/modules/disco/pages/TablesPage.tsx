import {
  Armchair,
  Users,
  DollarSign,
  Clock3,
  MoreVertical,
  Plus,
  Search,
} from "lucide-react";

const tables = [
  {
    id: 1,
    name: "VIP Table 1",
    guests: 6,
    minimumSpend: 500,
    currentBill: 320,
    status: "Occupied",
    waiter: "Carlos",
    time: "2h 14m",
  },
  {
    id: 2,
    name: "VIP Table 2",
    guests: 4,
    minimumSpend: 400,
    currentBill: 180,
    status: "Occupied",
    waiter: "Ana",
    time: "1h 02m",
  },
  {
    id: 3,
    name: "Terrace 4",
    guests: 0,
    minimumSpend: 200,
    currentBill: 0,
    status: "Available",
    waiter: "-",
    time: "-",
  },
  {
    id: 4,
    name: "Main Floor 7",
    guests: 3,
    minimumSpend: 150,
    currentBill: 92,
    status: "Reserved",
    waiter: "Luis",
    time: "Starts 11PM",
  },
];

export default function TablesPage() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Table management
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Tables & VIP Areas
          </h1>

          <p className="mt-2 text-gray-500">
            Manage reservations, VIP sections, bottle service, and live table
            orders.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          Add Table
        </button>
      </div>

      {/* Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Armchair className="text-cyan-600" />

          <p className="mt-4 text-sm text-gray-500">Total tables</p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">28</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-purple-600" />

          <p className="mt-4 text-sm text-gray-500">Guests seated</p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">84</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />

          <p className="mt-4 text-sm text-gray-500">Open table revenue</p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">$4,820</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Clock3 className="text-orange-600" />

          <p className="mt-4 text-sm text-gray-500">Reservations tonight</p>

          <h2 className="mt-2 text-3xl font-bold text-gray-900">11</h2>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 rounded-3xl border border-gray-200 bg-white px-5 py-4 shadow-sm md:w-96">
        <Search size={18} className="text-gray-400" />

        <input
          type="text"
          placeholder="Search table or VIP area..."
          className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
        />
      </div>

      {/* Tables Grid */}
      <div className="grid gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {tables.map((table) => {
          const statusStyles = {
            Occupied: "bg-red-100 text-red-700",
            Available: "bg-emerald-100 text-emerald-700",
            Reserved: "bg-yellow-100 text-yellow-700",
          };

          return (
            <div
              key={table.id}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
            >
              {/* Top */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">
                    {table.name}
                  </h2>

                  <p className="mt-1 text-sm text-gray-500">
                    Waiter: {table.waiter}
                  </p>
                </div>

                <button className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700">
                  <MoreVertical size={18} />
                </button>
              </div>

              {/* Status */}
              <div className="mt-5 flex items-center justify-between">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    statusStyles[
                      table.status as keyof typeof statusStyles
                    ]
                  }`}
                >
                  {table.status}
                </span>

                <span className="text-sm font-medium text-gray-500">
                  {table.time}
                </span>
              </div>

              {/* Middle */}
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Guests</p>

                  <h3 className="mt-2 text-2xl font-bold text-gray-900">
                    {table.guests}
                  </h3>
                </div>

                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs text-gray-500">Current Bill</p>

                  <h3 className="mt-2 text-2xl font-bold text-gray-900">
                    ${table.currentBill}
                  </h3>
                </div>
              </div>

              {/* Bottom */}
              <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-white">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-400">
                    Minimum spend
                  </p>

                  <p className="text-lg font-bold">
                    ${table.minimumSpend}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-100">
                  View Orders
                </button>

                <button className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white transition hover:bg-cyan-600">
                  Open POS
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}