type StatCardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    positive?: boolean;
  };
};

export default function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
}: StatCardProps) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">
            {title}
          </p>

          <h3 className="mt-2 text-3xl font-bold text-gray-900">
            {value}
          </h3>

          {subtitle && (
            <p className="mt-1 text-sm text-gray-500">
              {subtitle}
            </p>
          )}
        </div>

        {icon && (
          <div className="rounded-xl bg-gray-100 p-3">
            {icon}
          </div>
        )}
      </div>

      {trend && (
        <div className="mt-4 flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs font-semibold ${
              trend.positive
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {trend.positive ? "+" : "-"}
            {trend.value}%
          </span>

          <span className="text-xs text-gray-500">
            vs previous period
          </span>
        </div>
      )}
    </div>
  );
}