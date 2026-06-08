// src/modules/disco/components/DiscoStatCard.tsx

import type { ComponentType } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";

type IconComponent = ComponentType<{
  className?: string;
}>;

type DiscoStatCardProps = {
  title: string;
  value: string | number;
  icon?: IconComponent;
  change?: number;
  changeLabel?: string;
  helper?: string;
  description?: string;
};

export default function DiscoStatCard({
  title,
  value,
  icon: Icon,
  change,
  changeLabel,
  helper,
  description,
}: DiscoStatCardProps) {
  const positive = change !== undefined && change >= 0;

  return (
    <div className="group rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            {title}
          </p>

          <h3 className="mt-2 truncate text-2xl font-black text-slate-900 sm:text-3xl">
            {value}
          </h3>

          {(helper || description) && (
            <p className="mt-2 text-sm font-medium text-slate-500">
              {helper || description}
            </p>
          )}
        </div>

        {Icon && (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Icon className="h-7 w-7" />
          </div>
        )}
      </div>

      {change !== undefined && (
        <div className="mt-4 flex items-center gap-2">
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${
              positive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" />
            )}

            {positive ? "+" : ""}
            {change}%
          </div>

          {changeLabel && (
            <span className="text-xs font-semibold text-slate-500">
              {changeLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}