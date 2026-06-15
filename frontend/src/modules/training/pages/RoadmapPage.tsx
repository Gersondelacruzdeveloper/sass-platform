import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Flag,
  PlusCircle,
  Search,
  Target,
} from "lucide-react";
import api from "../../../api/axios";
import type { RoadmapItem } from "../types/training";
import RoadmapSection from "../components/RoadmapSection";

const initialForm = {
  title: "",
  description: "",
  period: "30_days",
  priority: "medium",
};

export default function RoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadRoadmap() {
    try {
      setLoading(true);
      const res = await api.get("/training/roadmap/");
      setItems(res.data);
    } catch (error) {
      console.error("Error loading roadmap:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRoadmap();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);

      await api.post("/training/roadmap/", {
        ...form,
        completed: false,
      });

      setForm(initialForm);
      await loadRoadmap();
    } catch (error) {
      console.error("Error saving roadmap item:", error);
      alert("Could not save roadmap objective.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleComplete(item: RoadmapItem) {
    try {
      await api.patch(`/training/roadmap/${item.id}/`, {
        completed: !item.completed,
      });

      await loadRoadmap();
    } catch (error) {
      console.error("Error updating roadmap item:", error);
      alert("Could not update roadmap item.");
    }
  }

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const value = `
        ${item.title}
        ${item.description || ""}
        ${item.period}
        ${item.priority}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());

      const matchesPeriod =
        periodFilter === "all" || item.period === periodFilter;

      const matchesPriority =
        priorityFilter === "all" || item.priority === priorityFilter;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "completed" && item.completed) ||
        (statusFilter === "open" && !item.completed);

      return matchesSearch && matchesPeriod && matchesPriority && matchesStatus;
    });
  }, [items, search, periodFilter, priorityFilter, statusFilter]);

  const roadmap30 = items.filter((item) => item.period === "30_days");
  const roadmap60 = items.filter((item) => item.period === "60_days");
  const roadmap90 = items.filter((item) => item.period === "90_days");

  const completed = items.filter((item) => item.completed).length;
  const open = items.length - completed;
  const completionRate = items.length
    ? Math.round((completed / items.length) * 100)
    : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 p-4 md:p-8">
        <div className="mx-auto max-w-7xl animate-pulse space-y-5">
          <div className="h-44 rounded-[2rem] bg-slate-200" />
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
              <Target size={16} />
              Plan de Ejecución de 90 Días
            </div>

            <h1 className="text-3xl font-black tracking-tight md:text-5xl">
              Roadmap A&B de 90 Días
            </h1>

            <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
              Plan de implementación para mejorar servicio, estándares,
              entrenamientos, liderazgo y resultados operativos.
            </p>
          </div>

          <div className="rounded-3xl bg-white/10 p-5 lg:min-w-80">
            <p className="text-sm font-semibold text-white/60">
              Finalización del Roadmap
            </p>

            <div className="mt-2 flex items-end justify-between gap-4">
              <p className="text-5xl font-black">{completionRate}%</p>
              <p className="text-sm font-semibold text-white/60">
                {completed}/{items.length} completados
              </p>
            </div>

            <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-white"
                style={{ width: `${completionRate}%` }}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Total objetivos" value={items.length} icon={<Flag />} />
        <SummaryCard title="Completados" value={completed} icon={<CheckCircle2 />} />
        <SummaryCard title="Abiertos" value={open} icon={<Clock />} />
        <SummaryCard title="30 días" value={roadmap30.length} icon={<CalendarDays />} />
      </section>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      >
        <div className="mb-5">
          <h2 className="text-2xl font-black text-slate-950">
            Nuevo objetivo
          </h2>
          <p className="text-sm text-slate-500">
            Agrega una acción clara para que dirección pueda dar seguimiento.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input
            required
            label="Título del objetivo"
            placeholder="Ej: Mejorar consistencia del saludo"
            value={form.title}
            onChange={(value) => setForm({ ...form, title: value })}
          />

          <Select
            label="Periodo"
            value={form.period}
            onChange={(value) => setForm({ ...form, period: value })}
          >
            <option value="30_days">Próximos 30 días</option>
            <option value="60_days">Próximos 60 días</option>
            <option value="90_days">Próximos 90 días</option>
          </Select>

          <Select
            label="Prioridad"
            value={form.priority}
            onChange={(value) => setForm({ ...form, priority: value })}
          >
            <option value="low">Baja prioridad</option>
            <option value="medium">Media prioridad</option>
            <option value="high">Alta prioridad</option>
          </Select>
        </div>

        <textarea
          className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
          placeholder="Descripción: qué vamos a implementar, por qué y qué resultado buscamos..."
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <button
          disabled={saving}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
        >
          <PlusCircle size={18} />
          {saving ? "Guardando..." : "Guardar objetivo"}
        </button>
      </form>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <RoadmapSection title="30 días" items={roadmap30} />
        <RoadmapSection title="60 días" items={roadmap60} />
        <RoadmapSection title="90 días" items={roadmap90} />
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-2xl font-black text-slate-950">
              Actualizar progreso
            </h2>
            <p className="text-sm text-slate-500">
              Busca, filtra y marca objetivos como completados.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:min-w-[900px]">
            <div className="relative md:col-span-1">
              <Search
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                size={18}
              />
              <input
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                placeholder="Buscar objetivo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <select
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value)}
            >
              <option value="all">Todos los periodos</option>
              <option value="30_days">30 días</option>
              <option value="60_days">60 días</option>
              <option value="90_days">90 días</option>
            </select>

            <select
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">Todas las prioridades</option>
              <option value="low">Baja</option>
              <option value="medium">Media</option>
              <option value="high">Alta</option>
            </select>

            <select
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos los estados</option>
              <option value="open">Abierto</option>
              <option value="completed">Completado</option>
            </select>
          </div>
        </div>

        <div className="mb-4 text-sm font-semibold text-slate-500">
          Mostrando {filteredItems.length} de {items.length} objetivos
        </div>

        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-slate-50 p-6 text-sm font-semibold text-slate-500">
              No se encontraron objetivos del roadmap.
            </div>
          ) : (
            filteredItems.map((item) => (
              <RoadmapProgressRow
                key={item.id}
                item={item}
                onToggleComplete={() => toggleComplete(item)}
              />
            ))
          )}
        </div>
      </section>
    </div>
  </div>
);

}

function RoadmapProgressRow({
  item,
  onToggleComplete,
}: {
  item: RoadmapItem;
  onToggleComplete: () => void;
}) {
  return (
    <div className="rounded-[1.5rem] bg-slate-50 p-4">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-black text-slate-950">{item.title}</p>
            <PriorityBadge priority={item.priority} />
            <PeriodBadge period={item.period} />
          </div>

          {item.description && (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
              {item.description}
            </p>
          )}
        </div>

        <button
          onClick={onToggleComplete}
          className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
            item.completed
              ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
              : "bg-white text-slate-700 hover:bg-slate-100"
          }`}
        >
          {item.completed ? "Completed" : "Mark complete"}
        </button>
      </div>
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

function Input({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <input
        required={required}
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
        placeholder={placeholder || label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-2">
      <span className="text-sm font-bold text-slate-700">{label}</span>
      <select
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </label>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const styles =
    priority === "high"
      ? "bg-red-100 text-red-700"
      : priority === "medium"
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

  const label =
    priority === "high"
      ? "HIGH"
      : priority === "medium"
        ? "MEDIUM"
        : "LOW";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
      {label}
    </span>
  );
}

function PeriodBadge({ period }: { period: string }) {
  const label =
    period === "30_days"
      ? "30 DAYS"
      : period === "60_days"
        ? "60 DAYS"
        : "90 DAYS";

  return (
    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
      {label}
    </span>
  );
}