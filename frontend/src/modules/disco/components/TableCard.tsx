// src/modules/disco/components/TableCard.tsx

import { Armchair, DollarSign, Users, Edit } from "lucide-react";

type DiscoTable = {
  id: number;
  name: string;
  floor?: string;
  capacity: number;
  minimum_spend?: number | string;
  status: "available" | "occupied" | "reserved" | "cleaning" | "inactive";
  is_vip: boolean;
};

type TableCardProps = {
  table: DiscoTable;
  onClick?: (table: DiscoTable) => void;
  onEdit?: (table: DiscoTable) => void;
};

export default function TableCard({ table, onClick, onEdit }: TableCardProps) {
  const money = (value?: number | string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const statusStyles: Record<DiscoTable["status"], string> = {
    available: "bg-emerald-100 text-emerald-700",
    occupied: "bg-red-100 text-red-700",
    reserved: "bg-amber-100 text-amber-700",
    cleaning: "bg-blue-100 text-blue-700",
    inactive: "bg-slate-100 text-slate-600",
  };

  return (
    <article
      onClick={() => onClick?.(table)}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <Armchair size={24} />
          </div>

          <div>
            <h3 className="text-lg font-black text-slate-900">
              {table.name}
            </h3>
            <p className="text-sm font-semibold text-slate-500">
              {table.floor || "Main floor"}
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-xs font-black ${statusStyles[table.status]}`}
        >
          {table.status.toUpperCase()}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info
          icon={<Users size={16} />}
          label="Capacity"
          value={String(table.capacity)}
        />

        <Info
          icon={<DollarSign size={16} />}
          label="Min Spend"
          value={money(table.minimum_spend)}
        />
      </div>

      {table.is_vip && (
        <div className="mt-4 rounded-2xl bg-purple-50 px-4 py-3 text-sm font-black text-purple-700">
          VIP Table
        </div>
      )}

      {onEdit && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit(table);
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
        >
          <Edit size={16} />
          Edit Table
        </button>
      )}
    </article>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase text-slate-400">
        {icon}
        {label}
      </div>
      <p className="mt-1 truncate text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}