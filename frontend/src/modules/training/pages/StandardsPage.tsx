import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  BookOpenCheck,
  CheckCircle2,
  Flame,
  Search,
} from "lucide-react";
import {
  createStandard,
  getStandards,
  updateStandard,
} from "../api/trainingApi";
import type { Standard } from "../types/training";

const categories = [
  { value: "service", label: "Service" },
  { value: "beverage", label: "Beverage" },
  { value: "culinary", label: "Culinary" },
  { value: "luxury", label: "Luxury" },
  { value: "leadership", label: "Leadership" },
  { value: "hard_rock", label: "Hard Rock Standard" },
];

const initialForm = {
  title: "",
  category: "service",
  description: "",
  priority: "medium" as Standard["priority"],
  active: true,
};

export default function StandardsPage() {
  const [standards, setStandards] = useState<Standard[]>([]);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadStandards() {
    try {
      setLoading(true);
      const data = await getStandards();
      setStandards(data);
    } catch (error) {
      console.error("Error loading standards:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStandards();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    try {
      setSaving(true);
      await createStandard(form);
      setForm(initialForm);
      await loadStandards();
    } catch (error) {
      console.error("Error creating standard:", error);
      alert("Could not create standard.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(standard: Standard) {
    try {
      await updateStandard(standard.id, {
        active: !standard.active,
      });

      await loadStandards();
    } catch (error) {
      console.error("Error updating standard:", error);
      alert("Could not update standard.");
    }
  }

  const filteredStandards = useMemo(() => {
    return standards.filter((item) => {
      const value = `
        ${item.title}
        ${item.description || ""}
        ${item.category}
        ${item.priority}
      `.toLowerCase();

      const matchesSearch = value.includes(search.toLowerCase());

      const matchesCategory =
        selectedCategory === "all" || item.category === selectedCategory;

      const matchesPriority =
        selectedPriority === "all" || item.priority === selectedPriority;

      return matchesSearch && matchesCategory && matchesPriority;
    });
  }, [standards, selectedCategory, selectedPriority, search]);

  const activeCount = standards.filter((item) => item.active).length;
  const criticalCount = standards.filter((item) => item.priority === "critical").length;
  const highPriorityCount = standards.filter((item) => item.priority === "high").length;

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
                Standards Control Center
              </div>

              <h1 className="text-3xl font-black tracking-tight md:text-5xl">
                Hard Rock A&B Standards
              </h1>

              <p className="mt-3 max-w-2xl text-sm text-white/65 md:text-base">
                Define estándares de servicio, bebidas, cocina, lujo, liderazgo y cultura para que todos los facilitadores evalúen con la misma base.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm font-semibold text-white/60">
                Critical / High Priority
              </p>
              <p className="mt-2 text-4xl font-black">
                {criticalCount + highPriorityCount}
              </p>
              <p className="mt-1 text-sm text-white/60">
                estándares que requieren foco
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="Standards" value={standards.length} icon={<BookOpenCheck />} />
          <SummaryCard title="Active" value={activeCount} icon={<CheckCircle2 />} />
          <SummaryCard title="Critical" value={criticalCount} icon={<AlertTriangle />} />
          <SummaryCard title="High Priority" value={highPriorityCount} icon={<Flame />} />
        </section>

        <form
          onSubmit={handleSubmit}
          className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-5">
            <h2 className="text-2xl font-black text-slate-950">
              Create Standard
            </h2>
            <p className="text-sm text-slate-500">
              Crea un estándar claro que luego pueda usarse en evaluaciones y entrenamientos.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Input
              required
              label="Título"
              placeholder="Greet guest within 10 seconds"
              value={form.title}
              onChange={(value) => setForm({ ...form, title: value })}
            />

            <Select
              label="Categoría"
              value={form.category}
              onChange={(value) => setForm({ ...form, category: value })}
            >
              {categories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </Select>

            <Select
              label="Prioridad"
              value={form.priority}
              onChange={(value) =>
                setForm({
                  ...form,
                  priority: value as Standard["priority"],
                })
              }
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="critical">Critical</option>
            </Select>
          </div>

          <textarea
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
            placeholder="Description: what should the employee do? What does excellent service look like?"
            rows={4}
            value={form.description}
            onChange={(e) =>
              setForm({
                ...form,
                description: e.target.value,
              })
            }
          />

          <label className="mt-4 flex w-fit cursor-pointer items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 accent-slate-950"
            />
            <span className="font-bold text-slate-700">Activo</span>
          </label>

          <button
            disabled={saving}
            className="mt-5 inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-6 py-4 font-black text-white transition hover:bg-slate-800 disabled:opacity-50 md:w-auto"
          >
            {saving ? "Saving..." : "Save Standard"}
          </button>
        </form>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-black text-slate-950">
                Standards Library
              </h2>
              <p className="text-sm text-slate-500">
                Busca por estándar, descripción, categoría o prioridad.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:min-w-[720px]">
              <div className="relative">
                <Search
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  size={18}
                />
                <input
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
                  placeholder="Search standards..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                <option value="all">All Categories</option>

                {categories.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>

              <select
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none"
                value={selectedPriority}
                onChange={(e) => setSelectedPriority(e.target.value)}
              >
                <option value="all">All Priorities</option>
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div className="mb-4 text-sm font-semibold text-slate-500">
            Mostrando {filteredStandards.length} de {standards.length} estándares
          </div>

          {filteredStandards.length === 0 ? (
            <div className="rounded-[2rem] bg-slate-50 p-10 text-center">
              <p className="font-black text-slate-950">No standards found.</p>
              <p className="mt-1 text-sm text-slate-500">
                Intenta cambiar la búsqueda o los filtros.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {filteredStandards.map((standard) => (
                <StandardCard
                  key={standard.id}
                  standard={standard}
                  onToggleActive={() => toggleActive(standard)}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function StandardCard({
  standard,
  onToggleActive,
}: {
  standard: Standard;
  onToggleActive: () => void;
}) {
  return (
    <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-xl font-black text-slate-950">
              {standard.title}
            </h3>
            <PriorityBadge priority={standard.priority} />
          </div>

          <p className="mt-2 text-sm font-bold text-slate-500">
            {formatCategory(standard.category)}
          </p>
        </div>

        <button
          onClick={onToggleActive}
          className={`rounded-full px-3 py-1 text-xs font-black ${
            standard.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {standard.active ? "ACTIVE" : "INACTIVE"}
        </button>
      </div>

      {standard.description && (
        <p className="mt-4 rounded-2xl bg-white p-4 text-sm leading-6 text-slate-600">
          {standard.description}
        </p>
      )}
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
    priority === "critical"
      ? "bg-red-100 text-red-700"
      : priority === "high"
        ? "bg-orange-100 text-orange-700"
        : priority === "medium"
          ? "bg-amber-100 text-amber-700"
          : "bg-emerald-100 text-emerald-700";

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-black ${styles}`}>
      {priority.toUpperCase()}
    </span>
  );
}

function formatCategory(category: string) {
  return category.replace("_", " ").toUpperCase();
}