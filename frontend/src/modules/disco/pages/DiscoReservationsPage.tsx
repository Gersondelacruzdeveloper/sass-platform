import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCcw,
  Search,
  Users,
  X,
} from "lucide-react";

import DiscoEmptyState from "../components/DiscoEmptyState";
import DiscoPageHeader from "../components/DiscoPageHeader";
import DiscoStatCard from "../components/DiscoStatCard";
import ReservationCard from "../components/ReservationCard";

import { useDiscoReservations } from "../hooks/useDiscoReservations";
import { useDiscoTables } from "../hooks/useDiscoTables";
import {
  createReservation,
  updateReservation,
} from "../api/reservationsApi";

type ReservationStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "completed"
  | "no_show";

type Reservation = {
  id: number;
  table?: number | null;
  table_name?: string | null;
  customer_name: string;
  customer_phone?: string;
  people_count: number;
  reservation_datetime: string;
  deposit_amount?: string | number;
  status: ReservationStatus;
  note?: string;
};

type Table = {
  id: number;
  name: string;
  floor?: string;
  capacity?: number;
  status: string;
  is_vip?: boolean;
};

const initialForm = {
  table: "",
  customer_name: "",
  customer_phone: "",
  people_count: "1",
  reservation_datetime: "",
  deposit_amount: "",
  status: "pending" as ReservationStatus,
  note: "",
};

const statusOptions: { value: ReservationStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

export default function DiscoReservationsPage() {
  const {
    reservations,
    loading,
    error,
    refresh: refreshReservations,
  } = useDiscoReservations();

  const {
    tables,
    loading: tablesLoading,
    error: tablesError,
    refresh: refreshTables,
  } = useDiscoTables();

  const [search, setSearch] = useState("");
  const [localError, setLocalError] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReservation, setEditingReservation] =
    useState<Reservation | null>(null);
  const [form, setForm] = useState(initialForm);

  useEffect(() => {
    refreshTables();
  }, []);

  const filteredReservations = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return reservations;

    return reservations.filter((reservation: Reservation) =>
      [
        reservation.customer_name,
        reservation.customer_phone,
        reservation.table_name,
        reservation.status,
        reservation.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [reservations, search]);

  const stats = useMemo(() => {
    const pending = reservations.filter(
      (reservation: Reservation) => reservation.status === "pending"
    ).length;

    const confirmed = reservations.filter(
      (reservation: Reservation) => reservation.status === "confirmed"
    ).length;

    const completed = reservations.filter(
      (reservation: Reservation) => reservation.status === "completed"
    ).length;

    const today = new Date().toDateString();

    const todayReservations = reservations.filter(
      (reservation: Reservation) =>
        new Date(reservation.reservation_datetime).toDateString() === today
    ).length;

    return {
      total: reservations.length,
      pending,
      confirmed,
      completed,
      todayReservations,
    };
  }, [reservations]);

  function refreshAll() {
    refreshReservations();
    refreshTables();
  }

  function openCreateModal() {
    setEditingReservation(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEditModal(reservation: Reservation) {
    setEditingReservation(reservation);
    setForm({
      table: reservation.table ? String(reservation.table) : "",
      customer_name: reservation.customer_name || "",
      customer_phone: reservation.customer_phone || "",
      people_count: String(reservation.people_count || 1),
      reservation_datetime: reservation.reservation_datetime
        ? reservation.reservation_datetime.slice(0, 16)
        : "",
      deposit_amount: String(reservation.deposit_amount || ""),
      status: reservation.status || "pending",
      note: reservation.note || "",
    });
    setModalOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      setLocalError("");

      const payload = {
        table: form.table ? Number(form.table) : null,
        customer_name: form.customer_name,
        customer_phone: form.customer_phone,
        people_count: Number(form.people_count || 1),
        reservation_datetime: form.reservation_datetime,
        deposit_amount: Number(form.deposit_amount || 0),
        status: form.status,
        note: form.note,
      };

      if (editingReservation) {
        await updateReservation(editingReservation.id, payload);
      } else {
        await createReservation(payload);
      }

      setModalOpen(false);
      setEditingReservation(null);
      setForm(initialForm);
      refreshAll();
    } catch (err) {
      console.error(err);
      setLocalError("Could not save reservation.");
    } finally {
      setSaving(false);
    }
  }

  async function quickUpdateStatus(
    reservation: Reservation,
    status: ReservationStatus
  ) {
    try {
      setLocalError("");
      await updateReservation(reservation.id, { status });
      refreshAll();
    } catch (err) {
      console.error(err);
      setLocalError("Could not update reservation status.");
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title="Reservations"
        subtitle="Manage VIP bookings, table reservations, deposits, guests, and reservation status."
        icon={CalendarDays}
        actionLabel="New Reservation"
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title="Today"
          value={stats.todayReservations}
          icon={Clock}
          helper="Reservations today"
        />

        <DiscoStatCard
          title="Pending"
          value={stats.pending}
          icon={CalendarDays}
          helper="Waiting confirmation"
        />

        <DiscoStatCard
          title="Confirmed"
          value={stats.confirmed}
          icon={CheckCircle2}
          helper="Ready for service"
        />

        <DiscoStatCard
          title="Completed"
          value={stats.completed}
          icon={Users}
          helper="Finished bookings"
        />
      </section>

      {(error || tablesError || localError) && (
        <div className="flex items-start gap-3 rounded-3xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
          {error || tablesError || localError}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reservations..."
              className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-semibold outline-none transition focus:border-slate-400 focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <button
              type="button"
              onClick={refreshAll}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </div>
      </section>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-56 animate-pulse rounded-3xl bg-slate-100"
            />
          ))}
        </div>
      ) : filteredReservations.length === 0 ? (
        <DiscoEmptyState
          icon={CalendarDays}
          title="No reservations found"
          description="Create reservations for VIP guests, tables, deposits, and upcoming events."
        />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredReservations.map((reservation: Reservation) => (
            <ReservationCard
              key={reservation.id}
              reservation={reservation}
              onEdit={() => openEditModal(reservation)}
              onConfirm={
                reservation.status === "pending"
                  ? () => quickUpdateStatus(reservation, "confirmed")
                  : undefined
              }
              onComplete={
                reservation.status === "confirmed"
                  ? () => quickUpdateStatus(reservation, "completed")
                  : undefined
              }
              onCancel={
                !["cancelled", "completed"].includes(reservation.status)
                  ? () => quickUpdateStatus(reservation, "cancelled")
                  : undefined
              }
            />
          ))}
        </section>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/50 p-3 sm:items-center sm:justify-center">
          <form
            onSubmit={handleSubmit}
            className="max-h-[92vh] w-full overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:max-w-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-950">
                  {editingReservation
                    ? "Edit Reservation"
                    : "New Reservation"}
                </h2>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  Add customer, table, date, deposit, and status details.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-2xl p-2 text-slate-500 transition hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  Customer Name
                </span>
                <input
                  value={form.customer_name}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customer_name: e.target.value,
                    }))
                  }
                  required
                  placeholder="Example: Maria Rodriguez"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Customer Phone
                </span>
                <input
                  value={form.customer_phone}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      customer_phone: e.target.value,
                    }))
                  }
                  placeholder="+1 809 000 0000"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  People Count
                </span>
                <input
                  type="number"
                  min="1"
                  value={form.people_count}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      people_count: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">Table</span>
                <select
                  value={form.table}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, table: e.target.value }))
                  }
                  disabled={tablesLoading}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white disabled:opacity-60"
                >
                  <option value="">No table selected</option>
                  {tables.map((table: Table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                      {table.is_vip ? " • VIP" : ""}
                      {table.capacity ? ` • ${table.capacity} pax` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Reservation Date & Time
                </span>
                <input
                  type="datetime-local"
                  value={form.reservation_datetime}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      reservation_datetime: e.target.value,
                    }))
                  }
                  required
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  Deposit Amount
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.deposit_amount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      deposit_amount: e.target.value,
                    }))
                  }
                  placeholder="0.00"
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  Status
                </span>
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      status: e.target.value as ReservationStatus,
                    }))
                  }
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                >
                  {statusOptions.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">Note</span>
                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder="VIP requests, bottle service, birthday note, preferred area..."
                  className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="mt-5 h-12 w-full rounded-2xl bg-slate-950 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : editingReservation
                  ? "Save Changes"
                  : "Create Reservation"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}