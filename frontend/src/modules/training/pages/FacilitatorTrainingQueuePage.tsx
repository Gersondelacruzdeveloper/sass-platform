import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  GraduationCap,
  Search,
  TimerReset,
} from "lucide-react";

import { assignedTrainingsApi } from "../api/trainingRecoveryApi";
import type { EmployeeAssignedTraining } from "../types/training";

export default function FacilitatorTrainingQueuePage() {
  const [items, setItems] = useState<EmployeeAssignedTraining[]>([]);
  const [search, setSearch] = useState("");
  const [selectedView, setSelectedView] = useState("open");
  const [selectedResource, setSelectedResource] =
    useState<EmployeeAssignedTraining | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);

  async function loadQueue() {
    try {
      setLoading(true);
      const response = await assignedTrainingsApi.list();
      setItems(response.data);
    } catch (error) {
      console.error("Error loading facilitator training queue:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQueue();
  }, []);

  async function handleMarkCompleted(id: number) {
    try {
      setSavingId(id);
      await assignedTrainingsApi.markCompleted(id);
      await loadQueue();
    } catch (error) {
      console.error("Error marking completed:", error);
      alert("Could not mark reinforcement as completed.");
    } finally {
      setSavingId(null);
    }
  }

  async function handleClose(id: number) {
    const notes = window.prompt(
      "Notas de re-evaluación: ¿el colaborador ya cumple el estándar?",
    );

    try {
      setSavingId(id);
      await assignedTrainingsApi.close(id, notes || "");
      await loadQueue();
    } catch (error) {
      console.error("Error closing reinforcement:", error);
      alert("Could not close reinforcement case.");
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

      const matchesView =
        selectedView === "all" ||
        (selectedView === "open" && item.status !== "closed") ||
        (selectedView === "microtraining" &&
          ["assigned", "in_progress"].includes(item.status)) ||
        (selectedView === "reevaluation" &&
          item.status === "reevaluation_pending") ||
        (selectedView === "closed" && item.status === "closed");

      return matchesSearch && matchesView;
    });
  }, [items, search, selectedView]);

  const microtrainingCount = items.filter((item) =>
    ["assigned", "in_progress"].includes(item.status),
  ).length;

  const reevaluationCount = items.filter(
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
        <section className="overflow-hidden rounded-[2rem] bg-slate-950 p-6 text-white shadow-xl md:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm text-white/80">
                <GraduationCap size={16} />
                Panel Operativo del Facilitador
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Seguimiento de Refuerzo
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Revisa los colaboradores que necesitan un refuerzo corto, abre
                el recurso visual, realiza el microtraining y marca el
                seguimiento completado.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Casos Abiertos
              </p>
              <p className="mt-2 text-4xl font-black">{openCount}</p>
              <p className="mt-1 text-sm text-white/60">
                requieren acción hoy
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Por Trabajar"
            value={microtrainingCount}
            icon={<BookOpenCheck />}
          />
          <SummaryCard
            title="Re-evaluar"
            value={reevaluationCount}
            icon={<TimerReset />}
          />
          <SummaryCard
            title="Completados"
            value={closedCount}
            icon={<CheckCircle2 />}
          />
          <SummaryCard
            title="Abiertos"
            value={openCount}
            icon={<ClipboardCheck />}
          />
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Casos de Refuerzo
              </h2>
              <p className="text-sm text-slate-500">
                Trabaja estos casos en momentos breves fuera del rush. Cada
                recurso está diseñado para 3–5 minutos.
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
                  placeholder="Buscar colaborador, estándar o recurso..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={selectedView}
                onChange={(e) => setSelectedView(e.target.value)}
              >
                <option value="open">Abiertos</option>
                <option value="microtraining">Para Microtraining</option>
                <option value="reevaluation">Para Re-evaluación</option>
                <option value="closed">Completados</option>
                <option value="all">Todos</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredItems.length} de {items.length} casos
          </div>

          {filteredItems.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">
                No hay casos de refuerzo pendientes.
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Cuando un colaborador no cumpla un estándar en una evaluación,
                aparecerá aquí automáticamente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredItems.map((item) => (
                <TrainingQueueCard
                  key={item.id}
                  item={item}
                  saving={savingId === item.id}
                  onViewResource={() => setSelectedResource(item)}
                  onMarkCompleted={() => handleMarkCompleted(item.id)}
                  onClose={() => handleClose(item.id)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {selectedResource && (
        <ResourceModal
          item={selectedResource}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}

function TrainingQueueCard({
  item,
  saving,
  onViewResource,
  onMarkCompleted,
  onClose,
}: {
  item: EmployeeAssignedTraining;
  saving: boolean;
  onViewResource: () => void;
  onMarkCompleted: () => void;
  onClose: () => void;
}) {
  const needsTraining = ["assigned", "in_progress"].includes(item.status);
  const needsReevaluation = item.status === "reevaluation_pending";

  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-black text-slate-950">
              {item.employee_name || `Colaborador #${item.employee}`}
            </h3>

            <p className="mt-1 text-sm font-bold text-slate-500">
              {item.standard_title || `Estándar #${item.standard}`}
            </p>
          </div>

          <StatusBadge status={item.status} />
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <InfoBox
            label="Recurso Visual"
            value={item.resource_title || "Sin recurso asignado"}
          />
          <InfoBox
            label="Re-evaluar"
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

        <div className="rounded-2xl bg-white p-4">
          <p className="text-xs font-black uppercase text-slate-400">
            Acción recomendada
          </p>

          <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-6 text-slate-600">
            {needsTraining && (
              <>
                <li>Busca un momento breve fuera del rush.</li>
                <li>Abre el recurso visual y muéstralo al colaborador.</li>
                <li>Refuerza el estándar en 3–5 minutos.</li>
                <li>Marca el refuerzo como realizado.</li>
              </>
            )}

            {needsReevaluation && (
              <>
                <li>Observa nuevamente al colaborador en piso.</li>
                <li>Confirma si ya cumple el estándar.</li>
                <li>Cierra el caso si el comportamiento fue corregido.</li>
              </>
            )}

            {item.status === "closed" && (
              <li>Este caso ya fue cerrado después del seguimiento.</li>
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-3 pt-2 md:flex-row">
          <button
            onClick={onViewResource}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100"
          >
            <Eye size={16} />
            Ver Recurso
          </button>

          {needsTraining && (
            <button
              onClick={onMarkCompleted}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Guardando..." : "Refuerzo Realizado"}
            </button>
          )}

          {needsReevaluation && (
            <button
              onClick={onClose}
              disabled={saving}
              className="inline-flex flex-1 items-center justify-center rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Cerrando..." : "Cerrar Seguimiento"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* Keep your current ResourceModal, ResourceImage, InfoBox,
   SummaryCard, and StatusBadge functions below this line. */
function ResourceModal({
  item,
  onClose,
}: {
  item: EmployeeAssignedTraining;
  onClose: () => void;
}) {
  const hasTwoImages = Boolean(item.incorrect_image && item.correct_image);
  const singleImage = item.incorrect_image || item.correct_image || "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
      <div className="max-h-[95vh] w-full max-w-6xl overflow-y-auto rounded-[2rem] bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-black text-slate-950">
              {item.resource_title || "Recurso Asignado"}
            </h2>
            <p className="mt-1 text-sm font-bold text-slate-500">
              {item.standard_title || `Estándar #${item.standard}`}
            </p>
          </div>

          <button
            onClick={onClose}
            className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200"
          >
            Cerrar
          </button>
        </div>

        <div className="mb-6 rounded-2xl bg-slate-50 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <InfoBox
              label="Empleado"
              value={item.employee_name || `Empleado #${item.employee}`}
            />
            <InfoBox
              label="Estándar"
              value={item.standard_title || `Estándar #${item.standard}`}
            />
            <InfoBox
              label="Duración"
              value={`${item.estimated_minutes || 5} min`}
            />
          </div>
        </div>

        {hasTwoImages ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <ResourceImage
              label="❌ INCORRECTO"
              image={item.incorrect_image || ""}
              tone="red"
            />

            <ResourceImage
              label="✅ CORRECTO"
              image={item.correct_image || ""}
              tone="green"
            />
          </div>
        ) : singleImage ? (
          <div>
            <div className="mb-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">
              RECURSO VISUAL COMPLETO
            </div>

            <img
              src={singleImage}
              alt="Recurso visual"
              className="max-h-[700px] w-full rounded-3xl border object-contain shadow"
            />
          </div>
        ) : (
          <div className="flex h-80 items-center justify-center rounded-3xl border bg-slate-100 text-sm font-bold text-slate-400">
            Sin imagen del recurso
          </div>
        )}

        {item.short_explanation && (
          <div className="mt-6 rounded-3xl bg-blue-50 p-5">
            <h3 className="text-lg font-black text-slate-950">
              Explicación
            </h3>
            <p className="mt-2 leading-7 text-slate-700">
              {item.short_explanation}
            </p>
          </div>
        )}

        {item.facilitator_notes && (
          <div className="mt-6 rounded-3xl bg-amber-50 p-5">
            <h3 className="text-lg font-black text-slate-950">
              Guía para el Facilitador
            </h3>
            <p className="mt-2 leading-7 text-slate-700">
              {item.facilitator_notes}
            </p>
          </div>
        )}

        <div className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
          <h3 className="font-black text-emerald-800">
            Objetivo del Microtraining
          </h3>
          <p className="mt-2 leading-7 text-emerald-700">
            Mostrar el recurso visual, explicar el impacto al huésped,
            comparar el comportamiento incorrecto contra el estándar correcto,
            practicar inmediatamente y volver a observar al colaborador durante
            el servicio.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResourceImage({
  label,
  image,
  tone,
}: {
  label: string;
  image: string;
  tone: "red" | "green";
}) {
  const style =
    tone === "red"
      ? "bg-red-100 text-red-700"
      : "bg-emerald-100 text-emerald-700";

  return (
    <div>
      <div className={`mb-3 inline-flex rounded-full px-3 py-1 text-sm font-black ${style}`}>
        {label}
      </div>

      <img
        src={image}
        alt={label}
        className="max-h-[520px] w-full rounded-3xl border object-contain shadow"
      />
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs font-black uppercase text-slate-400">{label}</p>
      <p className="mt-2 text-sm font-bold text-slate-700">
        {value || "No disponible"}
      </p>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  icon,
}: {
  title: string | number;
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
      {status.replaceAll("_", " ").toUpperCase()}
    </span>
  );
}