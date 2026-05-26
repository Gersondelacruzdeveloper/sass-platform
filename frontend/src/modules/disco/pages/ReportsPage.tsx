import {
  BarChart3,
  Download,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
} from "lucide-react";
import SalesChart from "../components/SalesChart";

const reportRows = [
  {
    period: "Today",
    sales: 3420,
    expenses: 890,
    profit: 2530,
    margin: "73.9%",
  },
  {
    period: "This Week",
    sales: 12180,
    expenses: 3860,
    profit: 8320,
    margin: "68.3%",
  },
  {
    period: "This Month",
    sales: 42890,
    expenses: 17960,
    profit: 24930,
    margin: "58.1%",
  },
];

export default function ReportsPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-cyan-600">
            Business intelligence
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-900">
            Reports
          </h1>

          <p className="mt-2 text-gray-500">
            Analyse sales, expenses, profit margins, and monthly performance.
          </p>
        </div>

        <button className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-gray-800">
          <Download size={18} />
          Export Report
        </button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <DollarSign className="text-emerald-600" />
          <p className="mt-4 text-sm text-gray-500">Monthly revenue</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$42,890</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <Receipt className="text-red-600" />
          <p className="mt-4 text-sm text-gray-500">Monthly expenses</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$17,960</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <TrendingUp className="text-cyan-600" />
          <p className="mt-4 text-sm text-gray-500">Net profit</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">$24,930</h2>
        </div>

        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <BarChart3 className="text-purple-600" />
          <p className="mt-4 text-sm text-gray-500">Profit margin</p>
          <h2 className="mt-2 text-3xl font-bold text-gray-900">58.1%</h2>
        </div>
      </div>

      <SalesChart />

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-gray-900">
          Profit & Loss Summary
        </h2>

        <p className="mt-1 text-sm text-gray-500">
          Compare revenue, costs, and profit across different periods.
        </p>

        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[800px] text-left">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-gray-400">
                <th className="pb-3">Period</th>
                <th className="pb-3">Sales</th>
                <th className="pb-3">Expenses</th>
                <th className="pb-3">Profit</th>
                <th className="pb-3">Margin</th>
                <th className="pb-3">Trend</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {reportRows.map((row) => (
                <tr key={row.period}>
                  <td className="py-5 font-semibold text-gray-900">
                    {row.period}
                  </td>

                  <td className="py-5 text-gray-700">${row.sales}</td>

                  <td className="py-5 text-red-600">${row.expenses}</td>

                  <td className="py-5 font-bold text-emerald-600">
                    ${row.profit}
                  </td>

                  <td className="py-5 text-gray-700">{row.margin}</td>

                  <td className="py-5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      <TrendingUp size={14} />
                      Growing
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-slate-950 p-6 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <TrendingDown className="text-cyan-400" />
          <h2 className="text-lg font-bold">Smart Insight</h2>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          Your highest revenue is coming from weekend nights, but expenses are
          also increasing on DJ and security payments. Consider comparing Friday
          and Saturday staff costs against drink sales to protect profit margin.
        </p>
      </div>
    </div>
  );
}