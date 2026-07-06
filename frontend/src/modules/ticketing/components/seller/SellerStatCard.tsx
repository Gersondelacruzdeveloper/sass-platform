// src/modules/ticketing/components/seller/SellerStatCard.tsx

import type { LucideIcon } from "lucide-react";

type SellerStatCardProps = {
  label: string;
  value: string | number;
  helper?: string;
  icon?: LucideIcon;
};

export default function SellerStatCard({
  label,
  value,
  helper,
  icon: Icon,
}: SellerStatCardProps) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          {helper && (
            <p className="mt-1 text-xs font-semibold text-slate-400">
              {helper}
            </p>
          )}
        </div>

        {Icon && (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}
