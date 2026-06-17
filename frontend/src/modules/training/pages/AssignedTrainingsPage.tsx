import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Search,
  ShieldCheck,
  TimerReset,
} from "lucide-react";

import { assignedTrainingsApi } from "../api/trainingRecoveryApi";
import type { EmployeeAssignedTraining } from "../types/training";

const statusOptions = [
  { value: "all", label: "Todos" },
  { value: "assigned", label: "Asignado" },
  { value: "in_progress", label: "En Progreso" },
  { value: "reevaluation_pending", label: "Pendiente Re-evaluación" },
  { value: "closed", label: "Cerrado" },
];

export default function AssignedTrainingsPage() {
  const [items, setItems] = useState<EmployeeAssignedTraining[]>([]);
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function loadAssignedTrainings() {
    try {
      setLoading(true);
      const response = await assignedTrainingsApi.list();
      setItems(response.data);
    } catch (error) {
      console.error("Error loading assigned trainings:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssignedTrainings();
  }, []);

  async function handleMarkCompleted(id: number) {
    try {
      setSavingId(id);
      await assignedTrainingsApi.markCompleted(id);
      await loadAssignedTrainings();
    } catch (error) {
      console.error("Error marking completed:", error);
      alert("Could not mark training as completed.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleClose(id: number) {
    const notes = window.prompt(
      "Notas del supervisor para cerrar este entrenamiento:",
    );

    try {
      setSavingId(id);
      await assignedTrainingsApi.close(id, notes || "");
      await loadAssignedTrainings();
    } catch (error) {
      console.error("Error closing assigned training:", error);
      alert("Could not close assigned training.");
    } finally {
      setSavingId(null);
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const value = `
        ${item.employee_name || ""}
        ${item.standard_title || ""}
        ${item.resource_title || ""}
        ${item.reason || ""}
        ${item.status}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());
      const matchesStatus =
        selectedStatus === "all" || item.status === selectedStatus;

      return matchesSearch && matchesStatus;
    });
  }, [items, search, selectedStatus]);

  const assignedCount = items.filter((item) => item.status === "assigned").length;
  const pendingReevaluationCount = items.filter(
    (item) => item.status === "reevaluation_pending",
  ).length;
  const closedCount = items.filter((item) => item.status === "closed").length;
  const openCount = items.filter((item) => item.status !== "closed").length;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-40 rounded-[2rem] bg-slate-200" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-28 rounded-[2rem] bg-slate-200" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6 lg:p-8">
        <section className="rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <BookOpenCheck size={16} />
                Microtraining y Reforzamiento
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Entrenamientos Asignados
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Seguimiento de colaboradores que no cumplieron un estándar y
                necesitan reforzamiento, microtraining y re-evaluación.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Casos Abiertos
              </p>
              <p className="mt-2 text-4xl font-black">{openCount}</p>
              <p className="mt-1 text-sm text-white/60">
                requieren seguimiento
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Asignados" value={assignedCount} icon={<Clock />} />
          <SummaryCard title="Pendientes" value={pendingReevaluationCount} icon={<TimerReset />} />
          <SummaryCard title="Cerrados" value={closedCount} icon={<ShieldCheck />} />
          <SummaryCard title="Total" value={items.length} icon={<CheckCircle2 />} />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Seguimiento de Microtrainings
              </h2>
              <p className="text-sm text-slate-500">
                Aquí el facilitador puede marcar entrenamientos completados y
                cerrar casos después de la re-evaluación.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:min-w-[560px]">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Buscar por empleado, estándar o recurso..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredItems.length} de {items.length} asignaciones
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">
                No hay entrenamientos asignados.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Cuando un colaborador falle un estándar, aparecerá aquí su
                microtraining.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => (
                <AssignedTrainingCard
                  key={item.id}
                  item={item}
                  saving={savingId === item.id}
                  onMarkCompleted={() => handleMarkCompleted(item.id)}
                  onClose={() => handleClose(item.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function AssignedTrainingCard({
  item,
  saving,
  onMarkCompleted,
  onClose,
}: {
  item: EmployeeAssignedTraining;
  saving: boolean;
  onMarkCompleted: () => void;
  onClose: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              {item.employee_name || `Empleado #${item.employee}`}
            </h3>

            <p className="mt-1 text-sm font-bold text-slate-500">
              {item.standard_title || `Estándar #${item.standard}`}
            </p>
          </div>

          <StatusBadge status={item.status} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoBox
            label="Recurso Asignado"
            value={item.resource_title || "Sin recurso"}
          />
          <InfoBox
            label="Re-evaluación"
            value={item.reevaluation_due_date || "Sin fecha"}
          />
        </div>

        {item.reason && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Motivo
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.reason}
            </p>
          </div>
        )}

        {item.supervisor_notes && (
          <div className="rounded-2xl bg-white p-4">
            <p className="text-xs font-black uppercase text-slate-400">
              Notas del Supervisor
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {item.supervisor_notes}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 md:flex-row">
          {item.status !== "closed" && item.status !== "reevaluation_pending" && (
            <button
              onClick={onMarkCompleted}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Marcar Completado"}
            </button>
          )}

          {item.status === "reevaluation_pending" && (
            <button
              onClick={onClose}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Cerrando..." : "Cerrar Después de Re-evaluación"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-bold text-slate-700">{value}</p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-slate-950">
            {value}
          </p>
        </div>

        <div className="rounded-2xl bg-slate-100 p-3 text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "closed"
      ? "bg-emerald-100 text-emerald-700"
      : status === "reevaluation_pending"
        ? "bg-amber-100 text-amber-700"
        : status === "in_progress"
          ? "bg-blue-100 text-blue-700"
          : "bg-slate-200 text-slate-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ").toUpperCase();
}