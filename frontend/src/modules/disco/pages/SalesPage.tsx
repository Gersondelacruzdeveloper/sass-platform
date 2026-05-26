import {
  Search,
  Plus,
  ShoppingCart,
  DollarSign,
  CreditCard,
  Banknote,
  MoreVertical,
  Download,
} from "lucide-react";

const sales = [
  {
    id: "SALE-1001",
    cashier: "Ana Rivera",
    items: 7,
    method: "Cash",
    total: 89,
    profit: 46,
    time: "Today, 10:42 PM",
    status: "Completed",
  },
  {
    id: "SALE-1002",
    cashier: "Carlos Méndez",
    items: 3,
    method: "Card",
    total: 54,
    profit: 28,
    time: "Today, 10:15 PM",
    status: "Completed",
  },
  {
    id: "SALE-1003",
    cashier: "Ana Rivera",
    items: 12,
    method: "Cash",
    total: 168,
    profit: 92,
    time: "Today, 9:58 PM",
    status: "Completed",
  },
  {
    id: "SALE-1004",
    cashier: "Luis Peña",
    items: 5,
    method: "Card",
    total: 76,
    profit: 39,
    time: "Today, 9:21 PM",
    status: "Refunded",
  },
];

export default function SalesPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Revenue control
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Sales
          </h1>

          <p className="mt-2 text-gray-500">
            Track every order, cashier, payment method, refund, and profit.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-100">
            <Download size={18} />
            Export
          </button>

          <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
            <Plus size={18} />
            New Sale
          </button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">Today’s sales</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$3,420</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <ShoppingCart className="text-cyan-600" />
          <p className="mt-4 text-sm text-gray-500">Orders today</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">86</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Banknote className="text-yellow-600" />
          <p className="mt-4 text-sm text-gray-500">Cash collected</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$2,180</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <CreditCard className="text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Card payments</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$1,240</h2>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Recent Transactions
            </h2>
            <p className="text-sm text-gray-500">
              Monitor live sales and payment activity from every cashier.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />
            <input
              type="text"
              placeholder="Search sale, cashier..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Sale ID</th>
                <th className="pb-3">Cashier</th>
                <th className="pb-3">Items</th>
                <th className="pb-3">Payment</th>
                <th className="pb-3">Time</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Total</th>
                <th className="pb-3 text-right">Profit</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {sales.map((sale) => {
                const isRefunded = sale.status === "Refunded";

                return (
                  <tr key={sale.id}>
                    <td className="py-5 font-semibold text-gray-900">
                      {sale.id}
                    </td>

                    <td className="py-5 text-gray-700">{sale.cashier}</td>

                    <td className="py-5 text-gray-500">{sale.items}</td>

                    <td className="py-5">
                      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                        {sale.method}
                      </span>
                    </td>

                    <td className="py-5 text-gray-500">{sale.time}</td>

                    <td className="py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isRefunded
                            ? "bg-red-100 text-red-700"
                            : "bg-emerald-100 text-emerald-700"
                        }`}
                      >
                        {sale.status}
                      </span>
                    </td>

                    <td className="py-5 text-right font-bold text-gray-900">
                      ${sale.total}
                    </td>

                    <td className="py-5 text-right font-bold text-emerald-600">
                      ${sale.profit}
                    </td>

                    <td className="py-5 text-right">
                      <button className="rounded-xl p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-900">
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