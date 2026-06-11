// src/modules/disco/components/ReservationCard.tsx

import { CalendarDays, Clock, Phone, Table2, User, Users } from "lucide-react";

type Reservation = {
  id: number;
  customer_name: string;
  customer_phone?: string;
  people_count: number;
  reservation_datetime: string;
  deposit_amount?: number | string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  note?: string;
  table_name?: string | null;
};

type ReservationCardProps = {
  reservation: Reservation;
  onClick?: (reservation: Reservation) => void;
  onEdit?: (reservation: Reservation) => void;
  onCancel?: (reservation: Reservation) => void;
};

export default function ReservationCard({
  reservation,
  onClick,
  onEdit,
  onCancel,
}: ReservationCardProps) {
  const date = new Date(reservation.reservation_datetime);

  const money = (value?: number | string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(Number(value || 0));

  const statusStyles: Record<Reservation["status"], string> = {
    pending: "bg-amber-100 text-amber-700",
    confirmed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-red-100 text-red-700",
    completed: "bg-blue-100 text-blue-700",
    no_show: "bg-slate-100 text-slate-600",
  };

  const statusLabel = reservation.status.replace("_", " ").toUpperCase();

  return (
    <article
      onClick={() => onClick?.(reservation)}
      className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
            <CalendarDays size={24} />
          </div>

          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-slate-900">
              {reservation.customer_name}
            </h3>

            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
              <Clock size={15} />
              {date.toLocaleDateString()} ·{" "}
              {date.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </div>
        </div>

        <span
          className={`w-fit rounded-full px-3 py-1 text-xs font-black ${statusStyles[reservation.status]}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Info
          icon={<Users size={16} />}
          label="Guests"
          value={String(reservation.people_count)}
        />

        <Info
          icon={<Table2 size={16} />}
          label="Table"
          value={reservation.table_name || "Not assigned"}
        />

        <Info
          icon={<Phone size={16} />}
          label="Phone"
          value={reservation.customer_phone || "—"}
        />

        <Info
          icon={<User size={16} />}
          label="Deposit"
          value={money(reservation.deposit_amount)}
        />
      </div>

      {reservation.note && (
        <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-medium text-slate-600">
          {reservation.note}
        </p>
      )}

      {(onEdit || onCancel) && (
        <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit(reservation);
              }}
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
          )}

          {onCancel && reservation.status !== "cancelled" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCancel(reservation);
              }}
              className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-black text-red-600 hover:bg-red-100"
            >
              Cancel
            </button>
          )}
        </div>
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