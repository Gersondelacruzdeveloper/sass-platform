import {
  Plus,
  Search,
  Receipt,
  TrendingDown,
  CalendarDays,
  MoreVertical,
} from "lucide-react";

const expenses = [
  {
    title: "Alcohol Supplier Payment",
    category: "Inventory",
    amount: 1250,
    method: "Bank Transfer",
    date: "Today",
    status: "Paid",
  },
  {
    title: "DJ Payment",
    category: "Entertainment",
    amount: 350,
    method: "Cash",
    date: "Today",
    status: "Paid",
  },
  {
    title: "Security Staff",
    category: "Staff",
    amount: 480,
    method: "Cash",
    date: "Yesterday",
    status: "Paid",
  },
  {
    title: "Electricity Bill",
    category: "Utilities",
    amount: 620,
    method: "Card",
    date: "May 20",
    status: "Pending",
  },
];

export default function ExpensesPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Cost control
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Expenses
          </h1>

          <p className="mt-2 text-gray-500">
            Track supplier payments, staff costs, rent, utilities, and daily operational expenses.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Plus size={18} />
          Add Expense
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Today’s expenses</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">$1,600</h2>
            </div>

            <div className="rounded-2xl bg-red-100 p-3 text-red-700">
              <Receipt size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Monthly expenses</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">$8,940</h2>
            </div>

            <div className="rounded-2xl bg-orange-100 p-3 text-orange-700">
              <TrendingDown size={24} />
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Pending payments</p>
              <h2 className="mt-2 text-3xl font-bold text-gray-900">$620</h2>
            </div>

            <div className="rounded-2xl bg-cyan-100 p-3 text-cyan-700">
              <CalendarDays size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              Expense Records
            </h2>

            <p className="text-sm text-gray-500">
              Review and control every cost affecting your profit.
            </p>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 md:w-80">
            <Search size={18} className="text-gray-400" />

            <input
              type="text"
              placeholder="Search expenses..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Expense</th>
                <th className="pb-3">Category</th>
                <th className="pb-3">Method</th>
                <th className="pb-3">Date</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Amount</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {expenses.map((expense) => {
                const isPaid = expense.status === "Paid";

                return (
                  <tr key={`${expense.title}-${expense.date}`}>
                    <td className="py-5 font-semibold text-gray-900">
                      {expense.title}
                    </td>

                    <td className="py-5 text-gray-600">
                      {expense.category}
                    </td>

                    <td className="py-5 text-gray-500">
                      {expense.method}
                    </td>

                    <td className="py-5 text-gray-500">
                      {expense.date}
                    </td>

                    <td className="py-5">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          isPaid
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {expense.status}
                      </span>
                    </td>

                    <td className="py-5 text-right font-bold text-red-600">
                      ${expense.amount}
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