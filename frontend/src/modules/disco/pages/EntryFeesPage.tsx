import {
  Ticket,
  Plus,
  Search,
  DollarSign,
  Users,
  Clock3,
  CreditCard,
  Banknote,
  MoreVertical,
} from "lucide-react";

const entrySales = [
  {
    id: "ENTRY-1001",
    customer: "Walk-in Guest",
    type: "General Entry",
    guests: 2,
    price: 20,
    payment: "Cash",
    cashier: "Ana Rivera",
    time: "Today, 10:42 PM",
  },
  {
    id: "ENTRY-1002",
    customer: "VIP Guest",
    type: "VIP Entry",
    guests: 4,
    price: 50,
    payment: "Card",
    cashier: "Carlos Méndez",
    time: "Today, 10:18 PM",
  },
  {
    id: "ENTRY-1003",
    customer: "Ladies Night",
    type: "Promotional Entry",
    guests: 3,
    price: 10,
    payment: "Cash",
    cashier: "Ana Rivera",
    time: "Today, 9:55 PM",
  },
];

export default function EntryFeesPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Door revenue
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Entry Fees
          </h1>

          <p className="mt-2 text-gray-500">
            Charge customers when they enter, track guest count, payment method,
            cashier, and nightly door revenue.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          New Entry Sale
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Ticket className="text-cyan-600" />
          <p className="mt-4 text-sm text-gray-500">Entries tonight</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">148</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">Door revenue</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$2,940</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Users className="text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Guests inside</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">126</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Clock3 className="text-orange-600" />
          <p className="mt-4 text-sm text-gray-500">Peak entry time</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">11 PM</h2>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                Entry Transactions
              </h2>
              <p className="text-sm text-gray-500">
                Live door sales from cashiers and entrance staff.
              </p>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
              <Search size={18} className="text-gray-400" />
              <input
                type="text"
                placeholder="Search entry sale..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-3">Entry ID</th>
                  <th className="pb-3">Customer</th>
                  <th className="pb-3">Type</th>
                  <th className="pb-3">Guests</th>
                  <th className="pb-3">Payment</th>
                  <th className="pb-3">Cashier</th>
                  <th className="pb-3">Time</th>
                  <th className="pb-3 text-right">Total</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {entrySales.map((sale) => {
                  const total = sale.guests * sale.price;

                  return (
                    <tr key={sale.id}>
                      <td className="py-5 font-semibold text-gray-900">
                        {sale.id}
                      </td>

                      <td className="py-5 text-gray-700">{sale.customer}</td>

                      <td className="py-5">
                        <span className="rounded-full bg-cyan-100 px-3 py-1 text-xs font-semibold text-cyan-700">
                          {sale.type}
                        </span>
                      </td>

                      <td className="py-5 text-gray-500">{sale.guests}</td>

                      <td className="py-5">
                        <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                          {sale.payment === "Cash" ? (
                            <Banknote size={14} />
                          ) : (
                            <CreditCard size={14} />
                          )}
                          {sale.payment}
                        </span>
                      </td>

                      <td className="py-5 text-gray-500">{sale.cashier}</td>

                      <td className="py-5 text-gray-500">{sale.time}</td>

                      <td className="py-5 text-right font-bold text-emerald-600">
                        ${total}
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
        </section>

        <aside className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900">
            Quick Entry Charge
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Fast charge for customers entering the disco.
          </p>

          <div className="mt-6 space-y-5">
            <div>
              <label className="text-sm font-semibold text-gray-700">
                Entry type
              </label>

              <select className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white">
                <option>General Entry - $20</option>
                <option>VIP Entry - $50</option>
                <option>Promotional Entry - $10</option>
                <option>Free Entry</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Number of guests
              </label>

              <input
                type="number"
                defaultValue={1}
                min={1}
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Customer name
              </label>

              <input
                type="text"
                placeholder="Optional"
                className="mt-2 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm outline-none focus:border-cyan-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-gray-700">
                Payment method
              </label>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <button className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-black px-4 py-3 text-sm font-semibold text-white">
                  <Banknote size={18} />
                  Cash
                </button>

                <button className="flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-100">
                  <CreditCard size={18} />
                  Card
                </button>
              </div>
            </div>

            <div className="rounded-3xl bg-slate-950 p-5 text-white">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-300">Estimated total</span>
                <span className="text-3xl font-black">$20</span>
              </div>
            </div>

            <button className="w-full rounded-2xl bg-black px-5 py-4 text-sm font-bold text-white shadow-lg transition hover:bg-cyan-600">
              Charge Entry
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}