// src/modules/disco/components/SalesChart.tsx
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

type SalesChartData = {
  label: string;
  sales: number;
  profit?: number;
};

type SalesChartProps = {
  title?: string;
  subtitle?: string;
  data: SalesChartData[];
};

export default function SalesChart({
  title = "Sales Overview",
  subtitle = "Track sales performance over time.",
  data,
}: SalesChartProps) {
  const tooltipFormatter = (
    value: ValueType | undefined,
    name: NameType | undefined
  ): [string, string] => {
    return [`$${Number(value || 0).toLocaleString()}`, String(name)];
  };

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-5">
        <h2 className="text-lg font-black text-slate-900">{title}</h2>
        <p className="mt-1 text-sm font-semibold text-slate-500">
          {subtitle}
        </p>
      </div>

      {data.length === 0 ? (
        <div className="flex min-h-[260px] items-center justify-center rounded-3xl bg-slate-50 text-center">
          <p className="text-sm font-bold text-slate-400">
            No sales data available yet.
          </p>
        </div>
      ) : (
        <div className="h-[280px] w-full sm:h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />

              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />

              <YAxis
                tick={{ fontSize: 12 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `$${value}`}
              />

              <Tooltip
                formatter={tooltipFormatter}
                labelStyle={{ fontWeight: 800 }}
                contentStyle={{
                  borderRadius: "16px",
                  border: "1px solid #e2e8f0",
                  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
                }}
              />

              <Bar
                dataKey="sales"
                name="Sales"
                radius={[12, 12, 0, 0]}
                barSize={32}
              />

              {data.some((item) => item.profit !== undefined) && (
                <Bar
                  dataKey="profit"
                  name="Profit"
                  radius={[12, 12, 0, 0]}
                  barSize={32}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}