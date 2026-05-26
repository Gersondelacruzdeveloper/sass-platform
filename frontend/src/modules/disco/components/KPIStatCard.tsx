import type { LucideIcon } from "lucide-react";

type KPIStatCardProps = {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
};

export default function KPIStatCard({
  title,
  value,
  change,
  icon: Icon,
  trend = "neutral",
}: KPIStatCardProps) {
  const trendStyles = {
    up: "bg-emerald-100 text-emerald-700",
    down: "bg-red-100 text-red-700",
    neutral: "bg-gray-100 text-gray-700",
  };

  return (
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>

          <h3 className="mt-3 text-3xl font-bold tracking-tight text-gray-900">
            {value}
          </h3>
        </div>

        <div className="rounded-2xl bg-gray-100 p-3">
          <Icon size={22} className="text-gray-700" />
        </div>
      </div>

      <div className="mt-6">
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${trendStyles[trend]}`}
        >
          {change}
        </span>
      </div>
    </div>
  );
}