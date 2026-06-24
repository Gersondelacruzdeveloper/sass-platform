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

import { useDiscoTranslation } from "../i18n/useDiscoTranslation";

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

const statusOptions: { value: ReservationStatus; translationKey: string }[] = [
  { value: "pending", translationKey: "reservations.status.pending" },
  { value: "confirmed", translationKey: "reservations.status.confirmed" },
  { value: "completed", translationKey: "reservations.status.completed" },
  { value: "cancelled", translationKey: "reservations.status.cancelled" },
  { value: "no_show", translationKey: "reservations.status.no_show" },
];

export default function DiscoReservationsPage() {
  const { t } = useDiscoTranslation();

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getReservationStatusLabel(status: ReservationStatus | string) {
    return t(`reservations.status.${status}`, String(status));
  }

  const filteredReservations = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return reservations;

    return reservations.filter((reservation) =>
      [
        reservation.customer_name,
        reservation.customer_phone,
        reservation.table_name,
        reservation.status,
        getReservationStatusLabel(reservation.status),
        reservation.note,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [reservations, search, t]);

  const stats = useMemo(() => {
    const pending = reservations.filter(
      (reservation) => reservation.status === "pending"
    ).length;

    const confirmed = reservations.filter(
      (reservation) => reservation.status === "confirmed"
    ).length;

    const completed = reservations.filter(
      (reservation) => reservation.status === "completed"
    ).length;

    const today = new Date().toDateString();

    const todayReservations = reservations.filter(
      (reservation) =>
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
      setLocalError(t("reservations.errorSave"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 pb-24">
      <DiscoPageHeader
        title={t("reservations.title")}
        subtitle={t("reservations.subtitle")}
        icon={CalendarDays}
        actionLabel={t("reservations.newReservation")}
        onAction={openCreateModal}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiscoStatCard
          title={t("reservations.today")}
          value={stats.todayReservations}
          icon={Clock}
          helper={t("reservations.reservationsToday")}
        />

        <DiscoStatCard
          title={t("reservations.pending")}
          value={stats.pending}
          icon={CalendarDays}
          helper={t("reservations.waitingConfirmation")}
        />

        <DiscoStatCard
          title={t("reservations.confirmed")}
          value={stats.confirmed}
          icon={CheckCircle2}
          helper={t("reservations.readyForService")}
        />

        <DiscoStatCard
          title={t("reservations.completed")}
          value={stats.completed}
          icon={Users}
          helper={t("reservations.finishedBookings")}
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
              placeholder={t("reservations.searchPlaceholder")}
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
              {t("pos.refresh")}
            </button>

            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 text-sm font-black text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              {t("reservations.add")}
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
          title={t("reservations.noReservationsFound")}
          description={t("reservations.noReservationsFoundDescription")}
        />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredReservations.map((reservation) => {
            const typedReservation: Reservation = {
              id: reservation.id,
              table: reservation.table,
              table_name: reservation.table_name,
              customer_name: reservation.customer_name,
              customer_phone: reservation.customer_phone,
              people_count: reservation.people_count,
              reservation_datetime: reservation.reservation_datetime,
              deposit_amount: reservation.deposit_amount,
              status: reservation.status as ReservationStatus,
              note: reservation.note,
            };

            return (
              <ReservationCard
                key={typedReservation.id}
                reservation={typedReservation}
                onEdit={() => openEditModal(typedReservation)}
              />
            );
          })}
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
                    ? t("reservations.editReservation")
                    : t("reservations.newReservation")}
                </h2>

                <p className="mt-1 text-sm font-medium text-slate-500">
                  {t("reservations.modalSubtitle")}
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
                  {t("reservations.customerName")}
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
                  placeholder={t("reservations.customerNamePlaceholder")}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white"
                />
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("reservations.customerPhone")}
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
                  {t("reservations.peopleCount")}
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
                <span className="text-sm font-bold text-slate-700">
                  {t("reservations.table")}
                </span>

                <select
                  value={form.table}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, table: e.target.value }))
                  }
                  disabled={tablesLoading}
                  className="mt-2 h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold outline-none focus:border-slate-400 focus:bg-white disabled:opacity-60"
                >
                  <option value="">
                    {t("reservations.noTableSelected")}
                  </option>

                  {tables.map((table: Table) => (
                    <option key={table.id} value={table.id}>
                      {table.name}
                      {table.is_vip ? " • VIP" : ""}
                      {table.capacity
                        ? ` • ${table.capacity} ${t("reservations.pax")}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-bold text-slate-700">
                  {t("reservations.reservationDateTime")}
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
                  {t("reservations.depositAmount")}
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
                  {t("reservations.status")}
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
                      {t(status.translationKey)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm font-bold text-slate-700">
                  {t("reservations.note")}
                </span>

                <textarea
                  value={form.note}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  rows={4}
                  placeholder={t("reservations.notePlaceholder")}
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
                ? t("reservations.saving")
                : editingReservation
                  ? t("reservations.saveChanges")
                  : t("reservations.createReservation")}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}