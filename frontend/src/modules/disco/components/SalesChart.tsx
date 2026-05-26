import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const salesData = [
  { day: "Mon", sales: 820, profit: 410 },
  { day: "Tue", sales: 1250, profit: 690 },
  { day: "Wed", sales: 980, profit: 520 },
  { day: "Thu", sales: 1460, profit: 810 },
  { day: "Fri", sales: 2380, profit: 1320 },
  { day: "Sat", sales: 3420, profit: 2010 },
  { day: "Sun", sales: 1870, profit: 1040 },
];

export default function SalesChart() {
  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Sales Performance</h2>
          <p className="text-sm text-gray-500">
            Weekly sales and estimated profit
          </p>
        </div>

        <select className="rounded-2xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 outline-none">
          <option>This Week</option>
          <option>This Month</option>
          <option>This Year</option>
        </select>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={salesData}>
            <defs>
              <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
              </linearGradient>

              <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="day" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} />
            <Tooltip />

            <Area
              type="monotone"
              dataKey="sales"
              stroke="#06b6d4"
              strokeWidth={3}
              fill="url(#salesGradient)"
            />

            <Area
              type="monotone"
              dataKey="profit"
              stroke="#10b981"
              strokeWidth={3}
              fill="url(#profitGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}